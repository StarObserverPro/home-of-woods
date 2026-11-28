/** Navigation camera only; authored action, inspection and cabin rigs keep their own framing. */
export const OVERLOOK = {
  distance: 110,
  maxElevation: 1.15,
  enterElevation: .38,
  enterZoom: .70,
  yawRate: .65,
  elevationRate: .35,
  logZoomRate: .55,
  maxQueuedYaw: Math.PI / 2,
  returnTargetSpeed: 30,
  distanceRate: 30,
  targetEpsilon: .02,
  maxDelta: .1,
  forecastSeconds: [.1, .25, .5],
  elevationStep: .16,
} as const;
