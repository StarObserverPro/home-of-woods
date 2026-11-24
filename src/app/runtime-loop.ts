export type Scheduler = {
  request: (cb: (time: number) => void) => number;
  cancel: (id: number) => void;
};
export type FrameMode = 'simulation' | 'presentation' | 'stopped';

export function requiredFrameMode(hardStop: boolean, simulationPaused: boolean, presentationPending: boolean): FrameMode {
  return hardStop ? 'stopped' : !simulationPaused ? 'simulation' : presentationPending ? 'presentation' : 'stopped';
}
// One owner for every frame. Resume resets the time baseline; destroy is terminal.
export function createLoop(
  frame: (dt: number, now: number, mode: Exclude<FrameMode, 'stopped'>) => void,
  scheduler: Scheduler,
  reset = () => {},
) {
  let id: number | null = null,
    mode: FrameMode = 'stopped',
    destroyed = false,
    last: number | null = null,
    frames = 0,
    executing = false;
  const schedule = () => {
    if (mode !== 'stopped' && !destroyed && id === null) id = scheduler.request(tick);
  };
  const tick = (now: number) => {
    id = null;
    if (mode === 'stopped' || destroyed) return;
    const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.1);
    last = now;
    executing = true;
    try {
      frame(dt, now, mode);
      frames++;
    } finally {
      executing = false;
    }
    schedule();
  };
  const setMode = (value: FrameMode) => {
    if (destroyed) return;
    if (value !== mode) {
      last = null;
      if (value === 'simulation') reset();
    }
    mode = value;
    if (mode === 'stopped') {
      if (id !== null) scheduler.cancel(id);
      id = null;
      last = null;
    } else schedule();
  };
  return {
    setMode,
    setPaused(value: boolean) {
      setMode(value ? 'stopped' : 'simulation');
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      mode = 'stopped';
      if (id !== null) scheduler.cancel(id);
      id = null;
      last = null;
    },
    stats: () => ({
      paused: mode === 'stopped',
      mode,
      destroyed,
      scheduled: id !== null,
      executing,
      running: mode !== 'stopped' && !destroyed,
      frames,
    }),
  };
}
