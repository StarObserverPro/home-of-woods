/** View state never depends on the projected or currently cut mesh bounds. */
export interface ViewState { yaw: number; pitch: number; zoom: number }
export const HOME_VIEW: Readonly<ViewState> = { yaw: -.46, pitch: .28, zoom: 1 }
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
export function rotateView(view: ViewState, dx: number, dy: number): ViewState {
  return { ...view, yaw: view.yaw + dx, pitch: clamp(view.pitch + dy, -1.45, 1.45) }
}
export function zoomView(view: ViewState, factor: number): ViewState {
  return { ...view, zoom: clamp(view.zoom * factor, .65, 1.75) }
}
/** Initial stock fixes the ruler scale. Only viewport dimensions or explicit zoom change px/mm. */
export function worldPerPixel(length: number, height: number, width: number, pixelsW: number, pixelsH: number, zoom: number): number {
  const diameter = Math.hypot(length, height, width)
  return Math.max(diameter * 1.9 / Math.max(1, pixelsW), diameter * 1.58 / Math.max(1, pixelsH)) / zoom
}
