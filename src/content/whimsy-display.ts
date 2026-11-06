export const WHIMSY_MODES=['full','simple','off'] as const;
export type WhimsyMode=typeof WHIMSY_MODES[number];
export const isWhimsyMode=(value:unknown):value is WhimsyMode=>WHIMSY_MODES.includes(value as WhimsyMode);
