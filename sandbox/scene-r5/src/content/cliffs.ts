export const CLIFF = {
  bankWidth:6,
  rimWidth:20,
  stoneCap:1.35,
  minimumRelief:7,
  // Sparse, authored changes in the crest line keep large rock planes instead of a round shoulder.
  rimOffsets:[[-150,0],[-80,1],[-28,-.8],[-4,1.5],[18,-1.2],[36,.8],[58,0],[90,-1],[150,0]] as readonly (readonly [number,number])[],
} as const;
