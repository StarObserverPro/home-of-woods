/** Bounded local evidence capture. It owns no frame loop or gameplay state. */
export function recordCanvas(
  canvas: HTMLCanvasElement,
  done: (blob: Blob) => void,
) {
  const type = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm";
  const stream = canvas.captureStream(15),
    recorder = new MediaRecorder(stream, {
      mimeType: type,
      videoBitsPerSecond: 3_000_000,
    }),
    chunks: Blob[] = [];
  let cancelled = false;
  const timeout = window.setTimeout(() => {
    if (recorder.state !== "inactive") recorder.stop();
  }, 20_000);
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.onstop = () => {
    clearTimeout(timeout);
    stream.getTracks().forEach((track) => track.stop());
    if (!cancelled) done(new Blob(chunks, { type }));
    chunks.length = 0;
  };
  recorder.start(1000);
  return () => {
    cancelled = true;
    clearTimeout(timeout);
    if (recorder.state !== "inactive") recorder.stop();
    stream.getTracks().forEach((track) => track.stop());
  };
}
