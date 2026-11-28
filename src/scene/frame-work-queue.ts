export type FrameWork = {
  key: string;
  priority: number;
  /** Do one bounded unit of work; true completes, false yields to a later step. */
  step: (deadline: number) => boolean;
  onCancel?: () => void;
};
type Job = FrameWork & { order: number; bornFrame: number };

/** Cooperative work queue, driven exclusively by the host's existing frame loop. */
export function createFrameWorkQueue(clock: () => number = () => performance.now()) {
  const jobs = new Map<string, Job>();
  let order = 0, frame = 0, disposed = false;
  let completed = 0, cancelled = 0, replaced = 0, totalSteps = 0, overruns = 0;
  let lastMs = 0, lastSteps = 0, lastBudgetMs = 0, longestStepMs = 0, peakPending = 0;
  function cancel(key: string) {
    const job = jobs.get(key);
    if (!job) return false;
    jobs.delete(key); cancelled++; job.onCancel?.(); return true;
  }
  function clear() { for (const key of [...jobs.keys()]) cancel(key); }
  return {
    enqueue(work: FrameWork) {
      if (disposed) { work.onCancel?.(); return; }
      const old = jobs.get(work.key);
      if (old) { jobs.delete(work.key); old.onCancel?.(); replaced++; }
      jobs.set(work.key, {...work, order: old?.order ?? order++, bornFrame: old?.bornFrame ?? frame});
      peakPending = Math.max(peakPending, jobs.size);
    },
    has: (key: string) => jobs.has(key),
    cancel,
    clear,
    run({budgetMs, maxSteps = 12}: {budgetMs: number; maxSteps?: number}) {
      frame++; lastSteps = 0; lastMs = 0;
      lastBudgetMs = Number.isFinite(budgetMs) ? Math.max(0, budgetMs) : 0;
      const limit = Number.isFinite(maxSteps) ? Math.max(0, Math.floor(maxSteps)) : 0;
      if (disposed || !jobs.size || !lastBudgetMs || !limit) return;
      const start = clock(), deadline = start + lastBudgetMs;
      while (jobs.size && lastSteps < limit && clock() < deadline) {
        let next: Job | undefined, score = -Infinity;
        // Aging keeps background work progressing during long walks. A yielded
        // task goes to the end of its priority band instead of monopolizing it.
        for (const job of jobs.values()) {
          const candidate = job.priority + Math.min(120, (frame - job.bornFrame) * .5);
          if (candidate > score || candidate === score && job.order < next!.order) { next = job; score = candidate; }
        }
        const job = next!, stepStart = clock();
        let done: boolean;
        try { done = job.step(deadline); }
        catch (error) { if (jobs.get(job.key) === job) cancel(job.key); throw error; }
        const stepMs = Math.max(0, clock() - stepStart);
        longestStepMs = Math.max(longestStepMs, stepMs); lastSteps++; totalSteps++;
        if (jobs.get(job.key) === job) {
          if (done) { jobs.delete(job.key); completed++; }
          else job.order = order++;
        }
      }
      lastMs = Math.max(0, clock() - start);
      if (lastMs > lastBudgetMs) overruns++;
    },
    stats: () => ({pending: jobs.size, completed, cancelled, replaced, totalSteps, frame,
      lastMs, lastSteps, lastBudgetMs, longestStepMs, overruns, peakPending, disposed}),
    dispose() { if (disposed) return; disposed = true; clear(); },
  };
}
export type FrameWorkQueue = ReturnType<typeof createFrameWorkQueue>;
