import { WEATHER_RULES } from '../content/weather.ts';

export type WoodCondition = { moisture: number; snow: number };
export const isWeatherWood = (item: { itemId: string }) => ['wood', 'branch', 'scrap-fuel', 'small-wood'].includes(item.itemId);

/** Humidity changes independently from the stable item/lot and its drag key. */
export function readWoodCondition(item: { woodCondition?: WoodCondition }): WoodCondition {
  return item.woodCondition ?? { moisture: WEATHER_RULES.initialMoisture, snow: 0 };
}

export function validateWoodCondition(raw: unknown): WoodCondition {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid wood condition');
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).length !== 2 || !['moisture', 'snow'].every(key => typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 1)) throw new Error('Invalid wood moisture or snow');
  return { moisture: value.moisture as number, snow: value.snow as number };
}

export function fineWorkMultiplier(moisture: number): number {
  return 1 + Math.max(0, moisture - WEATHER_RULES.fineWorkThreshold) * WEATHER_RULES.fineWorkPenalty;
}

export function moistureName(moisture: number): string {
  return moisture < WEATHER_RULES.dryThreshold ? '干爽' : moisture < WEATHER_RULES.wetThreshold ? '微潮' : '湿透';
}
