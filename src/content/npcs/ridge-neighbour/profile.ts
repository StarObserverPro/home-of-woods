/** Authored identity. A visit, a model response and memory ageing cannot rewrite it. */
export type NpcProfile = {
  id: string;
  name: string;
  home: string;
  personality: readonly string[];
  interests: readonly string[];
  speakingStyle: string;
  appearance: { model: string; hatColour: string; packColour: string };
};

export const RIDGE_NEIGHBOUR: NpcProfile = {
  id: 'ridge-neighbour',
  name: '阿榆',
  home: '住在山脊另一侧，走过来要花一阵子；偶尔顺路来串门。',
  personality: ['温和寡言', '有自己的打算', '主人忙时会自行歇脚或告辞'],
  interests: ['山路和天气', '朴素木作', '营地里的日常饭食'],
  speakingStyle: '通常只说一两句具体的话。不了解的事可以摇头；没有必要接住每个话题。',
  appearance: { model: 'visitor', hatColour: '#6c7951', packColour: '#8c6a48' },
};

/** These are roles, not provider/model IDs. No remote model is enabled by this file. */
export const NPC_MODEL_ROLES = {
  classifier: { purpose: '判断话题与当前能做的意图', tier: 'light', maxOutputCharacters: 180 },
  planner: { purpose: '为一趟来访选择有条件的活动', tier: 'light', maxOutputCharacters: 400 },
  dialogue: { purpose: '根据人物与可回忆的经历说一两句话', tier: 'dialogue', maxOutputCharacters: 120 },
  memory_consolidator: { purpose: '周期性保留、淡化或遗忘重要记忆', tier: 'light', maxOutputCharacters: 1200 },
} as const;

export const NPC_MEMORY_RULES = {
  consolidationDays: 3,
  maxMemories: 16,
  maxPromises: 12,
  maxDetails: 4,
  maxProcessedEvents: 64,
  maxRecentDialogue: 2,
  recentDialogueDays: 3,
  // Days since an event or an explicit reminder; reading a file does not rehearse a memory.
  fadeDays: { 1: [3, 9, 24], 2: [6, 18, 42], 3: [12, 30, 90] },
} as const;
