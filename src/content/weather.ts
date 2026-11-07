import { CAMP_PROPS, VISUAL_DAY_SECONDS } from './scene-props.ts';
import { CABIN, TENT } from './world.ts';

export const WEATHER_KINDS = ['sunny', 'cloudy', 'rain', 'snow'] as const;
export const LOG_SHELTER_POSTS = [
  {x:-1.9,z:-1.45},{x:-1.9,z:1.45},{x:1.9,z:-1.45},{x:1.9,z:1.45},
] as const;
export type WeatherKind = typeof WEATHER_KINDS[number];
export const WEATHER_NAMES: Record<WeatherKind, string> = { sunny: '晴', cloudy: '阴', rain: '雨', snow: '雪' };
export const WEATHER_RULES = {
  hourSeconds: VISUAL_DAY_SECONDS / 24,
  initialMoisture: .2,
  freshMoisture: .42,
  distinctBatchDifference: .1,
  dryThreshold: .24,
  wetThreshold: .48,
  fineWorkThreshold: .2,
  fineWorkPenalty: 1.35,
} as const;

/** Sheltered footprints are shared by moisture rules and the visible roof adapter. */
export const WEATHER_SHELTERS = [
  { ...CAMP_PROPS.logs, halfX: 2.2, halfZ: 1.8 },
  { id: 'cabin', x: CABIN.x, z: CABIN.z + 1.4, halfX: 7.3, halfZ: 6.8 },
  { id: 'tent', ...TENT, halfX: 4.2, halfZ: 4.2 },
] as const;

export const WEATHER_SEQUENCE: readonly { kind: WeatherKind; hours: number }[] = [
  { kind: 'sunny', hours: 3 }, { kind: 'cloudy', hours: 1 },
  { kind: 'rain', hours: 2 }, { kind: 'cloudy', hours: 1 },
  { kind: 'snow', hours: 1 }, { kind: 'sunny', hours: 4 },
];
