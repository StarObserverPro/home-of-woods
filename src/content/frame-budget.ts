/** Optional scene preparation only; simulation and the main draw keep their owner. */
export const FRAME_WORK_BUDGET = {
  desktopMs: 3,
  compactMs: 1.5,
  maxSteps: 12,
  // One overlong JS step cannot be preempted. Queue diagnostics report it.
  growthSteps: 20,
  priority: { interaction: 100, load: 70, release: 50, visibility: 30, prefetch: 10 },
} as const;
