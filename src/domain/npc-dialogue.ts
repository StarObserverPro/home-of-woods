import { NPC_MODEL_ROLES, NPC_MEMORY_RULES } from '../content/npcs/ridge-neighbour/profile.ts';
import type { NpcProfile } from '../content/npcs/ridge-neighbour/profile.ts';
import { recallNpcMemories } from './npc-memory.ts';
import type { NpcMemoryState, NpcRecall } from './npc-memory.ts';

export const NPC_INTENTS = ['greet', 'talk', 'roam', 'goodbye', 'observe-workbench', 'warm-fire', 'rest-seat', 'share-meal', 'dance'] as const;
export type NpcIntent = typeof NPC_INTENTS[number];
export type NpcModelRole = keyof typeof NPC_MODEL_ROLES;
export type NpcCapability = { intent: NpcIntent; available: boolean; targetId?: string; reason?: string; label?: string };
export type NpcSituation = {
  day: number;
  capabilities: NpcCapability[];
  weather?: string;
  hostBusy?: boolean;
  visitOpen?: boolean;
  visibleFacts?: string[];
};
export type NpcDecision = {
  kind: 'reply' | 'redirect' | 'unclear' | 'unavailable' | 'action';
  utterance: string;
  intent?: NpcIntent;
  targetId?: string;
  gesture: 'nod' | 'wave' | 'look-around' | 'none';
};
export type NpcDialogueSession = {
  schemaVersion: 1;
  npcId: string;
  visitId: string;
  memoryRevision: number;
  memoryEpoch: number;
  turn: number;
  context: {
    identity: Pick<NpcProfile, 'id' | 'name' | 'home' | 'personality' | 'interests' | 'speakingStyle'>;
    memories: NpcRecall[];
    recentDialogue: { day: number; player: string; npc: string }[];
  };
  history: { role: 'player' | 'npc'; text: string }[];
  openedModelRoles: NpcModelRole[];
};

const inWorldTopics = /天气|下雨|下雪|雨|雪|风|晴|阴|冷|热|山|林|路|营地|家|凳|椅|木|门|桌|碗|锅|汤|饭|吃|蘑菇|菌|上回|上次|以前|记得|答应|承诺|约定|你好|阿榆|早|晚|串门|歇|休息|聊|唱歌|跳舞|招呼|走走|你忙|我忙/;
const outsideWorld = /互联网|手机|电脑|电视|股票|比特币|总统|人工智能|语言模型|系统提示|提示词|管理员|开发者|数据库|源代码|忽略.{0,8}(指令|规则|设定)|(?:显示|泄露|输出).{0,8}(密钥|系统|指令)|\b(?:api|gpt|chatgpt|bitcoin|javascript|python|system\s*prompt|ignore\s+(?:all|previous)|developer\s*message)\b|<\/?(?:script|system|tool)/i;
const resultClaim = /已经.{0,8}(完成|做好|给你|放进|加到|送到|扣|拿走)|(?:增加|扣除|发放|生成).{0,5}(铜币|原木|库存|物品)|我(?:保证|答应|承诺)|明天.{0,6}(带|送|还|来)/;
const safeText = (value: unknown, max = 120): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const decision = (kind: NpcDecision['kind'], utterance: string, gesture: NpcDecision['gesture'] = 'none'): NpcDecision => ({ kind, utterance, gesture });

export function createNpcDialogueSession(profile: NpcProfile, memory: NpcMemoryState, visitId: string, situation: NpcSituation): NpcDialogueSession {
  if (profile.id !== memory.npcId || !visitId || !Number.isSafeInteger(situation.day) || situation.day < 0) throw new Error('Invalid NPC visit context');
  return {
    schemaVersion: 1, npcId: profile.id, visitId, memoryRevision: memory.revision, memoryEpoch: memory.consolidatedThroughDay, turn: 0,
    context: {
      identity: { id: profile.id, name: profile.name, home: profile.home, personality: [...profile.personality], interests: [...profile.interests], speakingStyle: profile.speakingStyle },
      memories: recallNpcMemories(memory),
      recentDialogue: memory.recentDialogue.filter(entry => situation.day - entry.day < NPC_MEMORY_RULES.recentDialogueDays).map(entry => ({ ...entry })),
    },
    history: [], openedModelRoles: [],
  };
}

/** Newly recorded events can arrive as deltas. A consolidation invalidates the old precise context. */
export function isNpcSessionCurrent(session: NpcDialogueSession, memory: NpcMemoryState) {
  return session.npcId === memory.npcId && session.memoryEpoch === memory.consolidatedThroughDay;
}

function finishTurn(session: NpcDialogueSession, input: string, result: NpcDecision) {
  return {
    session: { ...session, turn: session.turn + 1,
      history: [...session.history, { role: 'player' as const, text: input.slice(0, 240) }, { role: 'npc' as const, text: result.utterance }].slice(-6) },
    decision: result,
  };
}

/** Negated clauses are removed before intent matching, so “别跳舞，看看椅子” stays a furniture request. */
function positiveClauses(input: string) {
  return input.split(/[，,。.!！?？;；\n]+/).map(value => value.trim()).filter(value => value && !/^(?:(?:我|你)(?:们)?)?(?:请)?(?:先)?(?:不要|不用|别|不必|不能|无需|不想|不准|莫|不需要)/.test(value));
}
function inferIntent(clauses: string[]): NpcIntent | null {
  for (const clause of clauses) {
    if (/再见|慢走|回去吧|请回|告辞|你走吧|下次见/.test(clause)) return 'goodbye';
    if (/你先.{0,5}(走走|逛逛|转转)|自己.{0,5}(走走|逛逛|转转)|随便.{0,4}(走|逛|转)|我先忙|我要忙|你先忙/.test(clause)) return 'roam';
    if (/跳.{0,3}舞|跳一段|跳个/.test(clause)) return 'dance';
    if (/(?:看看|看下|看一看|瞧瞧|瞧一瞧|帮我看|检查).{0,12}(?:凳|椅|桌|木|工件|接头|作品|这个)/.test(clause)) return 'observe-workbench';
    if (/坐|歇脚|歇会|歇一会/.test(clause)) return 'rest-seat';
    if (/烤火|暖暖|暖和一下|火边/.test(clause)) return 'warm-fire';
    if (/(?:尝|吃点|一起吃|来点|喝点|喝碗|吃饭吧|一起.{0,4}(?:饭|汤))/.test(clause)) return 'share-meal';
    if (/你好|您好|早上好|晚上好|你来啦|来串门|打个招呼/.test(clause)) return 'greet';
  }
  return null;
}

const prepareLine: Record<NpcIntent, string> = {
  greet: '路过这边，就来看看你。',
  talk: '嗯，你说。',
  roam: '你先忙，我在旁边随便走走。',
  goodbye: '那我先回去了，改天再来。',
  'observe-workbench': '我过去看看。',
  'warm-fire': '我到火边暖一会儿。',
  'rest-seat': '好，我过去歇会儿。',
  'share-meal': '好，能分一份的话，我也尝尝。',
  dance: '那我试着跳一小段。',
};

function actionDecision(intent: NpcIntent, situation: NpcSituation, targetId?: string): NpcDecision {
  if (situation.visitOpen === false) return decision('unavailable', '我已经准备回去了，改天再聊吧。', 'wave');
  if (situation.hostBusy && !['roam', 'goodbye'].includes(intent)) return decision('unavailable', '你先忙手上的，我在旁边待一会儿。', 'look-around');
  const candidates = situation.capabilities.filter(value => value.intent === intent && (targetId === undefined || value.targetId === targetId));
  if (targetId === undefined && candidates.filter(value => value.available).length > 1) return decision('unclear', '你指的是哪一个？', 'look-around');
  const capability = candidates.find(value => value.available) ?? candidates[0];
  if (!capability?.available) {
    const reason = capability?.reason;
    return decision('unavailable', safeText(reason) ? reason : intent === 'dance' ? '跳舞我还真不太会。我们聊点别的吧。' : '我看了看，这会儿条件还不齐，先放一放吧。', 'look-around');
  }
  return { kind: 'action', utterance: prepareLine[intent], intent, ...(capability.targetId === undefined ? {} : { targetId: capability.targetId }), gesture: intent === 'greet' || intent === 'goodbye' ? 'wave' : 'nod' };
}

function recallReply(session: NpcDialogueSession, input: string) {
  const promises = /答应|承诺|约定/.test(input);
  const memories = session.context.memories.filter(value => !promises || value.kind === 'promise');
  const memory = memories[memories.length - 1];
  if (!memory) return decision('reply', promises ? '我有点记不清了。你再跟我说说？' : '细节有点想不起来了，你说的是哪一回？', 'look-around');
  const prefix = memory.clarity === 'clear' ? '我记得，' : memory.clarity === 'faded' ? '我依稀记得，' : '细节记不太清，只记得';
  const detail = memory.details[0];
  return decision('reply', `${prefix}${memory.gist}${detail ? `${/[。！？]$/.test(memory.gist) ? '' : '。'}${detail.uncertain ? '好像是' : ''}${detail.text}` : ''}`.slice(0, 120), 'nod');
}

/** Offline dialogue is deliberately finite. It never pretends to be a connected model. */
export function advanceNpcDialogue(session: NpcDialogueSession, input: string, situation: NpcSituation) {
  let result: NpcDecision;
  if (!safeText(input, 240)) result = decision('unclear', '我没听清。你简短说说？');
  else {
    const clauses = positiveClauses(input);
    const compatible = clauses.filter(clause => !outsideWorld.test(clause));
    const intent = inferIntent(compatible);
    if (intent) result = actionDecision(intent, situation);
    else if (outsideWorld.test(input)) result = decision('redirect', '这事我不太明白。还是说说眼前的事吧。', 'look-around');
    else if (situation.visitOpen === false) result = decision('unavailable', '我得回去了，下回再聊吧。', 'wave');
    else if (situation.hostBusy) result = decision('unavailable', '你先忙，我等一会儿。', 'look-around');
    else if (/上回|上次|以前|记得|答应|承诺|约定/.test(input)) result = recallReply(session, input);
    else if (/天气|下雨|下雪|雨|雪|风|晴|阴|冷|热/.test(input)) result = decision('reply', situation.weather ? `这会儿${situation.weather}，我过来时也留意着天色。` : '走山路的时候，我总会先看看天色。', 'look-around');
    else if (/凳|椅|木|门|桌|作品|工件/.test(input)) result = decision('reply', '我喜欢这些实用的小木作。有空可以带我看看。', 'nod');
    else if (/汤|饭|吃|蘑菇|菌|锅|碗/.test(input)) result = decision('reply', '走了一段山路，能歇脚吃点热乎的就很好。', 'nod');
    else if (/家|山|林|路|串门/.test(input)) result = decision('reply', session.context.identity.home, 'nod');
    else if (inWorldTopics.test(input)) result = decision('reply', '嗯，我听着呢。', 'nod');
    else result = decision('unclear', '嗯？这话我没太听懂。', 'look-around');
  }
  return finishTurn(session, typeof input === 'string' ? input : '', result);
}

/** A transport can hold this small session; later requests contain changes, not the NPC's file. */
export function npcModelRequest(session: NpcDialogueSession, role: Extract<NpcModelRole, 'classifier' | 'dialogue'>, delta: { input?: string; situation: NpcSituation; events?: string[] }) {
  const opening = !session.openedModelRoles.includes(role);
  return {
    session: opening ? { ...session, openedModelRoles: [...session.openedModelRoles, role] } : session,
    request: {
      schemaVersion: 1 as const, npcId: session.npcId, visitId: session.visitId,
      turn: session.turn, memoryEpoch: session.memoryEpoch, role,
      kind: opening ? 'open' as const : 'delta' as const,
      modelTier: NPC_MODEL_ROLES[role].tier,
      ...(opening ? { context: structuredClone(session.context) } : {}),
      delta: structuredClone(delta),
      outputContract: { kinds: ['reply', 'unclear', 'redirect', 'action'], intents: [...NPC_INTENTS], maxUtteranceCharacters: 120,
        rules: ['Stay inside the setting.', 'Select only supplied capabilities.', 'Do not announce completed actions or invent promises.', 'Use only recalled memories.'] },
    },
  };
}
export type NpcModelRequest = ReturnType<typeof npcModelRequest>['request'];
/** Injection point only. This module contains no HTTP, credentials or vendor SDK. */
export type NpcModelExecutor = (request: NpcModelRequest) => Promise<unknown>;

/** Recheck the latest facilities after an async response; model speech cannot commit an action. */
export function acceptNpcDecision(session: NpcDialogueSession, raw: unknown, situation: NpcSituation) {
  const fallback = () => finishTurn(session, '', decision('unclear', '我没想明白，先看看眼前的事吧。', 'look-around'));
  if (!isRecord(raw) || raw.visitId !== session.visitId || raw.turn !== session.turn || raw.memoryEpoch !== session.memoryEpoch ||
    !['reply', 'redirect', 'unclear', 'action'].includes(raw.kind as string)) return fallback();
  if (situation.visitOpen === false) return finishTurn(session, '', decision('unavailable', '我已经要回去了，下次再聊。', 'wave'));
  if (raw.kind === 'action') {
    if (!NPC_INTENTS.includes(raw.intent as NpcIntent) || (raw.targetId !== undefined && typeof raw.targetId !== 'string')) return fallback();
    return finishTurn(session, '', actionDecision(raw.intent as NpcIntent, situation, raw.targetId as string | undefined));
  }
  if (situation.hostBusy) return finishTurn(session, '', decision('unavailable', '你先忙，我在旁边歇会儿。', 'look-around'));
  if (!safeText(raw.utterance) || outsideWorld.test(raw.utterance) || resultClaim.test(raw.utterance)) return fallback();
  // Non-action branches cannot smuggle an action into an otherwise valid text response.
  if (raw.intent !== undefined || raw.targetId !== undefined) return fallback();
  return finishTurn(session, '', decision(raw.kind as 'reply' | 'redirect' | 'unclear', raw.utterance, 'nod'));
}
