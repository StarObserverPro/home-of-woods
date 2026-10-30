export type Scheduler = {
  request: (cb: (time: number) => void) => number;
  cancel: (id: number) => void;
};
// One owner for every frame. Resume resets the time baseline; destroy is terminal.
export function createLoop(
  frame: (dt: number, now: number) => void,
  scheduler: Scheduler,
  reset = () => {},
) {
  let id: number | null = null,
    paused = true,
    destroyed = false,
    last: number | null = null,
    frames = 0,
    executing = false;
  const schedule = () => {
    if (!paused && !destroyed && id === null) id = scheduler.request(tick);
  };
  const tick = (now: number) => {
    id = null;
    if (paused || destroyed) return;
    const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.1);
    last = now;
    executing = true;
    try {
      frame(dt, now);
      frames++;
    } finally {
      executing = false;
    }
    schedule();
  };
  return {
    setPaused(value: boolean) {
      if (destroyed) return;
      if (value) {
        paused = true;
        last = null;
        if (id !== null) scheduler.cancel(id);
        id = null;
      } else {
        if (paused) {
          last = null;
          reset();
        }
        paused = false;
        schedule();
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      paused = true;
      if (id !== null) scheduler.cancel(id);
      id = null;
      last = null;
    },
    stats: () => ({
      paused,
      destroyed,
      scheduled: id !== null,
      executing,
      running: !paused && !destroyed,
      frames,
    }),
  };
}
