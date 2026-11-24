/** Authored presentation parameters; world distances are the game's existing units. */
export const OVERLOOK_OPTICS = {
  baseVerticalFov: 40,
  // A rotated 36 mm long-edge gate keeps portrait framing finite. Landscape
  // uses the conventional 36 mm horizontal full-frame equivalence.
  filmLongEdgeMm: 36,
  widestFocalLengthMm: 16,
  wideViewportMinFocalLengthMm: 12,
  panoramaMinVerticalFov: 68,
  overviewFocalLengthMm: 24,
  maxDollyScale: 2,
  fullElevation: .86,
  fullZoom: .50,
  nearFullFocusRatio: .28,
  nearSharpFocusRatio: .68,
  farSharpFocusRatio: 2.6,
  farFullFocusRatio: 8.5,
  nearRadiusPx: 3.4,
  farRadiusPx: 1.8,
  compactNearRadiusPx: 2.8,
  compactFarRadiusPx: 1.4,
  blurScale: .5,
  compactBlurScale: .5,
  // Reject unrelated depth layers during gather and reduced-buffer upsampling.
  edgeRelativeStart: .025,
  edgeRelativeEnd: .12,
} as const;

export type OverlookOpticsMode = 'final' | 'off' | 'depth' | 'coc';
