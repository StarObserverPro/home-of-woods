/** Shared presentation limits. Seconds are active scene seconds, never calendar speed. */
export const CHARACTER_MOTION = {
  idleEaseSeconds: .65,
  breathing: {periodMin: 4.2, periodSpread: 1.2, pitch: .008},
  sway: {periodMin: 8.4, periodSpread: 2.8, pitch: .006, roll: .012},
  glance: {period: 4.3, transition: .38, yaw: .065, pitch: .035, eyeYaw: .09, eyePitch: .055},
  blink: {window: 5.2, close: .065, closed: .025, open: .115, doubleChance: .12, doubleDelay: .31},
  gesture: {window: 29, earliest: 5, spread: 16, duration: 3.1, settleAfterIdle: 1.2},
} as const;
