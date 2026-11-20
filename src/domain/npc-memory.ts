import { NPC_MEMORY_RULES } from '../content/npcs/ridge-neighbour/profile.ts';

export type NpcMemoryClarity = 'clear' | 'faded' | 'fragment' | 'forgotten';
export type NpcMemoryKind = 'conversation' | 'shared-activity' | 'promise' | 'observation';
export type NpcMemoryDetail = {
  id: string;
  text: string;
  uncertain?: boolean;
  /** Author-supplied harmless alternatives, never arbitrary model-created world facts. */
  alternatives?: { id: string; text: string }[];
};
export type NpcMemoryCard = {
  id: string;
  kind: NpcMemoryKind;
  topic: string;
  gist: string;
  day: number;
  lastRecalledDay: number;
  importance: 1 | 2 | 3;
  clarity: NpcMemoryClarity;
  confidence: number;
  details: NpcMemoryDetail[];
};
export type NpcMemoryEvent = {
  id: string;
  kind: NpcMemoryKind;
  topic: string;
  gist: string;
  day: number;
  importance?: 1 | 2 | 3;
  details?: NpcMemoryDetail[];
  /** Only the host supplies a reminder of an actual event or a player's assertion. */
  reminderOf?: string;
};
export type NpcPromiseFact = {
  id: string;
  memoryId: string;
  madeDay: number;
  dueDay: number | null;
  description: string;
  status: 'open' | 'fulfilled' | 'cancelled' | 'missed';
  resolvedDay?: number;
};
export type NpcMemoryState = {
  schemaVersion: 1;
  npcId: string;
  revision: number;
  consolidatedThroughDay: number;
  memories: NpcMemoryCard[];
  /** World bookkeeping. Excluded from every model-facing recall/session projection. */
  promises: NpcPromiseFact[];
  recentDialogue: { day: number; player: string; npc: string }[];
  processedEventIds: string[];
};
export type NpcRecall = {
  id: string;
  kind: NpcMemoryKind;
  topic: string;
  gist: string;
  clarity: Exclude<NpcMemoryClarity, 'forgotten'>;
  confidence: number;
  details: { text: string; uncertain: boolean }[];
};

const CLARITIES: NpcMemoryClarity[] = ['clear', 'faded', 'fragment', 'forgotten'];
const KINDS: NpcMemoryKind[] = ['conversation', 'shared-activity', 'promise', 'observation'];
const MAX_CONFIDENCE = [1, .65, .3, 0];
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][\w:./-]{0,119}$/.test(value);
const day = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown, limit = 180): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
const fail = (): never => { throw new Error('Invalid NPC memory'); };
function nextRevision(memory: NpcMemoryState) {
  if (!Number.isSafeInteger(memory.revision + 1)) throw new Error('NPC memory revision exhausted');
  return memory.revision + 1;
}
function checkedDetail(raw: unknown): NpcMemoryDetail {
  if (!record(raw) || !id(raw.id) || !text(raw.text) || (raw.uncertain !== undefined && typeof raw.uncertain !== 'boolean')) return fail();
  const detail: NpcMemoryDetail = { id: raw.id, text: raw.text };
  if (raw.uncertain) detail.uncertain = true;
  if (raw.alternatives !== undefined) {
    if (!Array.isArray(raw.alternatives) || raw.alternatives.length > 3) return fail();
    detail.alternatives = raw.alternatives.map(value => {
      if (!record(value) || !id(value.id) || !text(value.text)) return fail();
      return { id: value.id, text: value.text };
    });
    if (new Set(detail.alternatives.map(value => value.id)).size !== detail.alternatives.length) return fail();
  }
  return detail;
}

export function createNpcMemory(npcId: string, atDay = 0): NpcMemoryState {
  if (!id(npcId) || !day(atDay)) return fail();
  return { schemaVersion: 1, npcId, revision: 0, consolidatedThroughDay: atDay, memories: [], promises: [], recentDialogue: [], processedEventIds: [] };
}

/** Important semantic events only. No coordinates, walking trace or per-frame state is accepted. */
export function rememberNpcEvent(memory: NpcMemoryState, event: NpcMemoryEvent): NpcMemoryState {
  if (!id(event.id) || !KINDS.includes(event.kind) || !id(event.topic) || !text(event.gist) || !day(event.day) ||
    ![1, 2, 3].includes(event.importance ?? 2) || (event.reminderOf !== undefined && !id(event.reminderOf))) return fail();
  if (memory.processedEventIds.includes(event.id)) return memory;
  const details = (event.details ?? []).map(checkedDetail);
  if (details.length > NPC_MEMORY_RULES.maxDetails || new Set(details.map(value => value.id)).size !== details.length) return fail();
  const reminded = event.reminderOf && memory.memories.find(value => value.id === event.reminderOf);
  if (reminded && event.day < reminded.lastRecalledDay) return fail();
  const card: NpcMemoryCard = {
    id: reminded ? reminded.id : event.id, kind: reminded ? reminded.kind : event.kind, topic: reminded ? reminded.topic : event.topic, gist: event.gist,
    day: reminded ? reminded.day : event.day, lastRecalledDay: event.day,
    importance: event.importance ?? (reminded ? reminded.importance : 2), clarity: 'clear', confidence: 1, details,
  };
  let memories = [...memory.memories.filter(value => value.id !== card.id), card];
  if (memories.length > NPC_MEMORY_RULES.maxMemories) {
    const retire = [...memories].filter(value => value.id !== card.id)
      .sort((a, b) => a.importance - b.importance || a.lastRecalledDay - b.lastRecalledDay || a.id.localeCompare(b.id))[0];
    memories = memories.filter(value => value.id !== retire.id);
  }
  return { ...memory, revision: nextRevision(memory), memories,
    processedEventIds: [...memory.processedEventIds, event.id].slice(-NPC_MEMORY_RULES.maxProcessedEvents) };
}

export function recordNpcDialogue(memory: NpcMemoryState, entry: { day: number; player: string; npc: string }): NpcMemoryState {
  if (!day(entry.day) || !text(entry.player, 240) || !text(entry.npc, 240)) return fail();
  return { ...memory, revision: nextRevision(memory),
    recentDialogue: [...memory.recentDialogue, { ...entry }].slice(-NPC_MEMORY_RULES.maxRecentDialogue) };
}

/** Only a host-confirmed agreement creates this record; dialogue guesses cannot create an obligation. */
export function recordNpcPromise(memory: NpcMemoryState, promise: Omit<NpcPromiseFact, 'status' | 'resolvedDay'>): NpcMemoryState {
  if (!id(promise.id) || !id(promise.memoryId) || !day(promise.madeDay) || !text(promise.description) ||
    (promise.dueDay !== null && (!day(promise.dueDay) || promise.dueDay < promise.madeDay))) return fail();
  if (memory.promises.some(value => value.id === promise.id)) return memory;
  const promises = [...memory.promises, { ...promise, status: 'open' as const }];
  if (promises.length > NPC_MEMORY_RULES.maxPromises) {
    const retired = promises.find(value => value.status !== 'open');
    if (!retired) throw new Error('Too many open NPC promises');
    promises.splice(promises.indexOf(retired), 1);
  }
  return { ...memory, revision: nextRevision(memory), promises };
}

export function resolveNpcPromise(memory: NpcMemoryState, promiseId: string, status: Exclude<NpcPromiseFact['status'], 'open'>, atDay: number): NpcMemoryState {
  if (!id(promiseId) || !['fulfilled', 'cancelled', 'missed'].includes(status) || !day(atDay)) return fail();
  const promise = memory.promises.find(value => value.id === promiseId);
  if (!promise || promise.status !== 'open') return memory;
  if (atDay < promise.madeDay) return fail();
  return { ...memory, revision: nextRevision(memory),
    promises: memory.promises.map(value => value.id === promiseId ? { ...value, status, resolvedDay: atDay } : value) };
}

/** This is the only persistent-memory view supplied to a visiting NPC's model. */
export function recallNpcMemories(memory: NpcMemoryState): NpcRecall[] {
  return memory.memories.filter(value => value.clarity !== 'forgotten').map(value => ({
    id: value.id, kind: value.kind, topic: value.topic, gist: value.gist,
    clarity: value.clarity as NpcRecall['clarity'], confidence: value.confidence,
    details: value.clarity === 'fragment' ? [] : value.details.map(detail => ({ text: detail.text, uncertain: detail.uncertain === true })),
  }));
}

function maximumAgeStage(card: NpcMemoryCard, atDay: number) {
  const age = Math.max(0, atDay - card.lastRecalledDay);
  return NPC_MEMORY_RULES.fadeDays[card.importance].filter(threshold => age >= threshold).length;
}
function hash(value: string) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return result >>> 0;
}
export type NpcMemoryChange = {
  memoryId: string;
  clarity: NpcMemoryClarity;
  keepDetailIds: string[];
  mistakenDetail?: { detailId: string; alternativeId: string };
};
export type NpcMemoryConsolidation = {
  schemaVersion: 1;
  npcId: string;
  sourceRevision: number;
  atDay: number;
  changes: NpcMemoryChange[];
};
export function memoryConsolidationRequest(memory: NpcMemoryState, atDay: number) {
  if (!day(atDay)) return fail();
  if (atDay - memory.consolidatedThroughDay < NPC_MEMORY_RULES.consolidationDays || memory.memories.length === 0) return null;
  return {
    role: 'memory_consolidator' as const, schemaVersion: 1 as const,
    npcId: memory.npcId, sourceRevision: memory.revision, atDay,
    memories: memory.memories.filter(value => value.clarity !== 'forgotten').map(value => ({
      ...recallNpcMemories({ ...memory, memories: [value] })[0],
      allowedClarity: CLARITIES.slice(CLARITIES.indexOf(value.clarity), Math.max(CLARITIES.indexOf(value.clarity), maximumAgeStage(value, atDay)) + 1),
      details: value.details.map(detail => ({ id: detail.id, text: detail.text, uncertain: detail.uncertain === true,
        allowedMistakes: detail.alternatives?.map(alternative => ({ ...alternative })) ?? [] })),
    })),
    rules: ['Only keep, blur or forget supplied memories.', 'Never recover removed details.', 'Mistakes must select a supplied alternative.',
      'No profile, world state, inventory or obligation changes.'],
  };
}

/** Validates an entire model proposal before committing any memory changes. */
export function applyMemoryConsolidation(memory: NpcMemoryState, raw: unknown): NpcMemoryState {
  if (!record(raw) || raw.schemaVersion !== 1 || raw.npcId !== memory.npcId || raw.sourceRevision !== memory.revision || !day(raw.atDay) ||
    raw.atDay - memory.consolidatedThroughDay < NPC_MEMORY_RULES.consolidationDays || !Array.isArray(raw.changes) || raw.changes.length > memory.memories.length) return fail();
  const atDay = raw.atDay, seen = new Set<string>();
  const changes = new Map<string, NpcMemoryCard>();
  for (const change of raw.changes) {
    if (!record(change) || !id(change.memoryId) || seen.has(change.memoryId) || !CLARITIES.includes(change.clarity as NpcMemoryClarity) || !Array.isArray(change.keepDetailIds)) return fail();
    seen.add(change.memoryId);
    const card = memory.memories.find(value => value.id === change.memoryId);
    if (!card || atDay < card.lastRecalledDay) return fail();
    const stage = CLARITIES.indexOf(change.clarity as NpcMemoryClarity), currentStage = CLARITIES.indexOf(card.clarity);
    if (stage < currentStage || stage > Math.max(currentStage, maximumAgeStage(card, atDay))) return fail();
    const keepIds = change.keepDetailIds;
    if (new Set(keepIds).size !== keepIds.length || keepIds.some(value => !id(value) || !card.details.some(detail => detail.id === value)) ||
      keepIds.length > (stage >= 2 ? 0 : stage === 1 ? 1 : NPC_MEMORY_RULES.maxDetails)) return fail();
    let details = card.details.filter(detail => keepIds.includes(detail.id)).map(detail => structuredClone(detail));
    if (change.mistakenDetail !== undefined) {
      const mistake = change.mistakenDetail;
      if (stage !== 1 || !record(mistake) || !id(mistake.detailId) || !id(mistake.alternativeId)) return fail();
      const detail = details.find(value => value.id === mistake.detailId);
      const alternative = detail?.alternatives?.find(value => value.id === mistake.alternativeId);
      if (!detail || !alternative) return fail();
      // Replace the remembered text. The original detail is not retained behind the recall projection.
      details = details.map(value => value.id === detail.id ? { id: value.id, text: alternative.text, uncertain: true } : value);
    }
    changes.set(card.id, { ...card, clarity: CLARITIES[stage], confidence: Math.min(card.confidence, MAX_CONFIDENCE[stage]), details });
  }
  return { ...memory, revision: nextRevision(memory), consolidatedThroughDay: atDay,
    memories: memory.memories.map(value => changes.get(value.id) ?? value),
    recentDialogue: memory.recentDialogue.filter(value => atDay - value.day < NPC_MEMORY_RULES.recentDialogueDays),
  };
}

/** Offline equivalent of a conservative consolidation pass, deterministic for a saved world. */
export function consolidateNpcMemory(memory: NpcMemoryState, atDay: number, seed = 0): NpcMemoryState {
  if (!day(atDay) || !Number.isSafeInteger(seed)) return fail();
  if (atDay - memory.consolidatedThroughDay < NPC_MEMORY_RULES.consolidationDays) return memory;
  const changes: NpcMemoryChange[] = memory.memories.map(card => {
    const stage = Math.max(CLARITIES.indexOf(card.clarity), maximumAgeStage(card, atDay));
    const keep = stage >= 2 ? [] : stage === 1 ? card.details.slice(0, 1) : card.details;
    const change: NpcMemoryChange = { memoryId: card.id, clarity: CLARITIES[stage], keepDetailIds: keep.map(value => value.id) };
    const detail = keep.find(value => value.alternatives?.length);
    if (stage === 1 && detail && hash(`${seed}:${card.id}:${Math.floor(atDay / NPC_MEMORY_RULES.consolidationDays)}`) % 5 === 0) {
      change.mistakenDetail = { detailId: detail.id, alternativeId: detail.alternatives![0].id };
    }
    return change;
  });
  return applyMemoryConsolidation(memory, { schemaVersion: 1, npcId: memory.npcId, sourceRevision: memory.revision, atDay, changes });
}

export function validateNpcMemory(raw: unknown): NpcMemoryState {
  if (!record(raw) || raw.schemaVersion !== 1 || !id(raw.npcId) || !day(raw.revision) || !day(raw.consolidatedThroughDay) ||
    !Array.isArray(raw.memories) || raw.memories.length > NPC_MEMORY_RULES.maxMemories || !Array.isArray(raw.promises) || raw.promises.length > NPC_MEMORY_RULES.maxPromises ||
    !Array.isArray(raw.recentDialogue) || raw.recentDialogue.length > NPC_MEMORY_RULES.maxRecentDialogue ||
    !Array.isArray(raw.processedEventIds) || raw.processedEventIds.length > NPC_MEMORY_RULES.maxProcessedEvents || raw.processedEventIds.some(value => !id(value))) return fail();
  const memories = raw.memories.map(value => {
    if (!record(value) || !id(value.id) || !KINDS.includes(value.kind as NpcMemoryKind) || !id(value.topic) || !text(value.gist) || !day(value.day) || !day(value.lastRecalledDay) || value.lastRecalledDay < value.day ||
      ![1, 2, 3].includes(value.importance as number) || !CLARITIES.includes(value.clarity as NpcMemoryClarity) || typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > MAX_CONFIDENCE[CLARITIES.indexOf(value.clarity as NpcMemoryClarity)] ||
      !Array.isArray(value.details) || value.details.length > (value.clarity === 'clear' ? NPC_MEMORY_RULES.maxDetails : value.clarity === 'faded' ? 1 : 0)) return fail();
    const details = value.details.map(checkedDetail);
    if (new Set(details.map(detail => detail.id)).size !== details.length) return fail();
    return { id: value.id, kind: value.kind as NpcMemoryKind, topic: value.topic, gist: value.gist, day: value.day, lastRecalledDay: value.lastRecalledDay,
      importance: value.importance as 1 | 2 | 3, clarity: value.clarity as NpcMemoryClarity, confidence: value.confidence, details };
  });
  const promises = raw.promises.map(value => {
    if (!record(value) || !id(value.id) || !id(value.memoryId) || !day(value.madeDay) || !text(value.description) ||
      (value.dueDay !== null && (!day(value.dueDay) || value.dueDay < value.madeDay)) || !['open', 'fulfilled', 'cancelled', 'missed'].includes(value.status as string) ||
      (value.resolvedDay !== undefined && (!day(value.resolvedDay) || value.resolvedDay < value.madeDay)) || (value.status === 'open' && value.resolvedDay !== undefined)) return fail();
    return { id: value.id, memoryId: value.memoryId, madeDay: value.madeDay, dueDay: value.dueDay as number | null,
      description: value.description, status: value.status as NpcPromiseFact['status'], ...(value.resolvedDay === undefined ? {} : { resolvedDay: value.resolvedDay as number }) };
  });
  const recentDialogue = raw.recentDialogue.map(value => {
    if (!record(value) || !day(value.day) || !text(value.player, 240) || !text(value.npc, 240)) return fail();
    return { day: value.day, player: value.player, npc: value.npc };
  });
  if (new Set(memories.map(value => value.id)).size !== memories.length || new Set(promises.map(value => value.id)).size !== promises.length || new Set(raw.processedEventIds).size !== raw.processedEventIds.length) return fail();
  return { schemaVersion: 1, npcId: raw.npcId, revision: raw.revision, consolidatedThroughDay: raw.consolidatedThroughDay,
    memories, promises, recentDialogue, processedEventIds: [...raw.processedEventIds] as string[] };
}
