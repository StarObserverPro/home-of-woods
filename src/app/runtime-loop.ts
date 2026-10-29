export interface RuntimeLoopOptions {
  step(dt: number): void;
  frame(dt: number, alpha: number): void;
  request?: (callback: FrameRequestCallback) => number;
  cancel?: (id: number) => void;
  fixedStep?: number;
  maxSteps?: number;
}

/** The only animation scheduler. All clocks, input, visual updates and render live here. */
export function createRuntimeLoop(options: RuntimeLoopOptions) {
  const request = options.request ?? requestAnimationFrame;
  const cancel = options.cancel ?? cancelAnimationFrame;
  const fixed = options.fixedStep ?? 1 / 50;
  const maxSteps = options.maxSteps ?? 5;
  let pending: number | null = null, previous: number | null = null, accumulator = 0;
  let running = false, destroyed = false, steps = 0;
  const run: FrameRequestCallback = (time) => {
    pending = null;
    if (!running || destroyed) return;
    const dt = previous === null ? 0 : Math.min(Math.max((time - previous) / 1000, 0), fixed * maxSteps);
    previous = time; accumulator += dt;
    let count = 0;
    while (accumulator + 1e-10 >= fixed && count < maxSteps && running && !destroyed) {
      options.step(fixed); accumulator -= fixed; count++; steps++;
    }
    if (running && !destroyed) options.frame(dt, Math.max(accumulator, 0) / fixed);
    if (running && !destroyed) pending = request(run);
  };
  const start = () => {
    if (running || destroyed) return;
    running = true; previous = null; accumulator = 0; pending = request(run);
  };
  const pause = () => {
    running = false; previous = null; accumulator = 0;
    if (pending !== null) cancel(pending);
    pending = null;
  };
  return { start, resume: start, pause,
    destroy() { if (destroyed) return; pause(); destroyed = true; },
    get isRunning() { return running; }, get isDestroyed() { return destroyed; }, get stepCount() { return steps; },
  };
}
