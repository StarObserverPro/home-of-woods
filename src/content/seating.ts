/** Seating clearance uses the same world scale and horizontal furniture base as placement. */
export const BENCH_SEATING={
  baseOffset:-.025,frontReach:.65,standMargin:.65,
  /** Current character, shoulders and held book measured in the seat's local horizontal plane. */
  halfWidth:.70,backZ:-.72,frontZ:1.18,bodyMargin:.03,
  seatFrontOffset:.09,
  minSeatGroundClearance:.15,
  footHalfWidth:.36,footBackZ:.12,footFrontZ:.65,footDrop:.34,
} as const;
export const STUMP_SEATING={
  id:'camp-reading-stump',radius:.51,seatForward:.36,standDistance:1.4,
} as const;
