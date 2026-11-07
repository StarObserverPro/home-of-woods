import { WEATHER_KINDS, WEATHER_NAMES, WEATHER_RULES, WEATHER_SEQUENCE, WEATHER_SHELTERS } from '../content/weather.ts';
import type { WeatherKind } from '../content/weather.ts';
import type { GameState } from './state.ts';
import { isAvailableMaterial, transportLocation } from './transport-location.ts';
import { isWeatherWood, readWoodCondition, fineWorkMultiplier, moistureName } from './wood-condition.ts';
import type { WoodCondition } from './wood-condition.ts';
export { fineWorkMultiplier, moistureName } from './wood-condition.ts';

export type WeatherState = {
  kind: WeatherKind; intensity: number; auto: boolean; autoStart: number;
  updatedAt: number; wetness: number; puddles: number; snow: number;
};

export function createWeather(time = 0): WeatherState {
  return { kind: 'sunny', intensity: .8, auto: true, autoStart: time, updatedAt: time, wetness: 0, puddles: 0, snow: 0 };
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const toward = (value: number, target: number, rate: number, seconds: number) => target + (value - target) * Math.exp(-rate * seconds);
const sequenceHours = WEATHER_SEQUENCE.reduce((sum, segment) => sum + segment.hours, 0);

function weatherAt(weather: WeatherState, time: number): WeatherKind {
  if (!weather.auto) return weather.kind;
  let hours = ((time - weather.autoStart) / WEATHER_RULES.hourSeconds % sequenceHours + sequenceHours) % sequenceHours;
  for (const segment of WEATHER_SEQUENCE) {
    if (hours < segment.hours) return segment.kind;
    hours -= segment.hours;
  }
  return 'sunny';
}

function valuesAt(weather: WeatherState, time: number) {
  const kind = weatherAt(weather, time);
  return {
    weather: kind,
    intensity: weather.intensity,
    cloud: kind === 'sunny' ? .12 : kind === 'cloudy' ? .83 : .96,
    rain: kind === 'rain' ? weather.intensity : 0,
    snowfall: kind === 'snow' ? weather.intensity : 0,
  };
}

export function weatherSheltered(point: { x: number; z: number }): boolean {
  return WEATHER_SHELTERS.some(shelter => Math.abs(point.x - shelter.x) <= shelter.halfX && Math.abs(point.z - shelter.z) <= shelter.halfZ);
}

function advanceCondition(condition: WoodCondition, exposed: boolean, weather: ReturnType<typeof valuesAt>, seconds: number): WoodCondition {
  const warm = weather.weather === 'sunny' ? 1 : weather.weather === 'snow' ? 0 : .45;
  const melt = Math.min(condition.snow, warm * seconds / 2200);
  const raining = exposed && weather.rain > 0;
  const target = raining ? .55 + weather.rain * .35 : weather.weather === 'sunny' ? .1 : .17;
  const rate = raining ? weather.rain / 2200 : 1 / (exposed && weather.weather === 'sunny' ? 5500 : 11000);
  return {
    snow: clamp(condition.snow + (exposed ? weather.snowfall * seconds / 2000 : 0) - melt),
    moisture: clamp(toward(condition.moisture, target, rate, seconds) + melt * .3),
  };
}

function settleStep(host: GameState, weather: WeatherState, seconds: number) {
  const values = valuesAt(weather, weather.updatedAt + seconds * .5);
  const scaled = seconds * 3600 / WEATHER_RULES.hourSeconds;
  const warm = values.weather === 'sunny' ? 1 : values.weather === 'snow' ? 0 : .45;
  const melt = Math.min(weather.snow, warm * scaled / 2800);
  weather.snow = clamp(weather.snow + values.snowfall * scaled / 2400 - melt);
  weather.wetness = clamp(toward(weather.wetness, values.rain > 0 ? .6 + values.rain * .4 : 0,
    values.rain > 0 ? 1 / 650 : 1 / (values.weather === 'sunny' ? 2200 : 5500), scaled) + melt * 1.8);
  weather.puddles = clamp(toward(weather.puddles, Math.max(0, (weather.wetness - .45) / .55), 1 / 500, scaled));
  for (const stack of host.inventory.stacks) {
    if (!isWeatherWood(stack)) continue;
    const location = transportLocation(stack);
    const exposed = location?.kind === 'ground' ? !weatherSheltered(location) : location?.kind === 'carried' ? !weatherSheltered(host.player) : false;
    stack.woodCondition = advanceCondition(readWoodCondition(stack), exposed, values, scaled);
  }
  for (const piece of host.woodcraft.pieces) {
    piece.source.woodCondition = advanceCondition(readWoodCondition(piece.source), !weatherSheltered(piece.position), values, scaled);
  }
  weather.updatedAt += seconds;
}

/** Consume the existing world clock, including sleeps, at stable one-second boundaries. */
export function advanceWeather(host: GameState, flush = false): void {
  const weather = host.weather ??= createWeather(host.time);
  if (!Number.isFinite(host.time) || host.time < weather.updatedAt) return;
  while (host.time - weather.updatedAt >= 1 - 1e-8) settleStep(host, weather, 1);
  if (flush && host.time > weather.updatedAt) settleStep(host, weather, host.time - weather.updatedAt);
}

export function setWeather(host: GameState, kind: WeatherKind): boolean {
  if (!WEATHER_KINDS.includes(kind)) return false;
  advanceWeather(host, true);
  host.weather!.auto = false;
  host.weather!.kind = kind;
  return true;
}

export function setWeatherIntensity(host: GameState, intensity: number): boolean {
  if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) return false;
  advanceWeather(host, true);
  host.weather!.intensity = intensity;
  return true;
}

export function setWeatherAutomatic(host: GameState, enabled: boolean): void {
  advanceWeather(host, true);
  const weather = host.weather!;
  if (enabled && !weather.auto) weather.autoStart = host.time;
  if (!enabled && weather.auto) weather.kind = weatherAt(weather, host.time);
  weather.auto = enabled;
}

export function weatherSnapshot(host: GameState) {
  const weather = host.weather ?? createWeather(host.time);
  const woods = host.inventory.stacks.filter(isWeatherWood).map((stack, index) => {
    const location = transportLocation(stack);
    const exposure = location?.kind === 'ground' ? !weatherSheltered(location) : location?.kind === 'carried' ? !weatherSheltered(host.player) : false;
    const condition = readWoodCondition(stack);
    return { id: `stock-${index}`, name: stack.itemId === 'wood' ? '原木' : stack.itemId === 'branch' ? '枝杈' : '碎柴',
      exposure: exposure ? 'open' as const : 'sheltered' as const, ...condition, quantity: stack.quantity,
      available: isAvailableMaterial(stack) && !stack.wood?.reserved, fineWorkMultiplier: fineWorkMultiplier(condition.moisture) };
  });
  for (const piece of host.woodcraft.pieces) {
    const condition = readWoodCondition(piece.source);
    woods.push({ id: piece.id, name: '木料堆', exposure: weatherSheltered(piece.position) ? 'sheltered' : 'open', ...condition,
      quantity: 1, available: false, fineWorkMultiplier: fineWorkMultiplier(condition.moisture) });
  }
  const usable = woods.filter(wood => wood.available), quantity = usable.reduce((sum, wood) => sum + wood.quantity, 0);
  const moisture = quantity ? usable.reduce((sum, wood) => sum + wood.moisture * wood.quantity, 0) / quantity : WEATHER_RULES.initialMoisture;
  return { ...valuesAt(weather, host.time), name: WEATHER_NAMES[weatherAt(weather, host.time)],
    auto: weather.auto, time: host.time, wetness: weather.wetness, puddles: weather.puddles, snow: weather.snow,
    woods, fineWorkMultiplier: fineWorkMultiplier(moisture) };
}
export type WeatherSnapshot = ReturnType<typeof weatherSnapshot>;

export function validateWeather(raw: unknown, time: number): WeatherState {
  if (raw === undefined) return createWeather(time);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid weather state');
  const value = raw as WeatherState;
  const expected = ['kind', 'intensity', 'auto', 'autoStart', 'updatedAt', 'wetness', 'puddles', 'snow'];
  if (Object.keys(value).length !== expected.length || !expected.every(key => Object.hasOwn(value, key))) throw new Error('Unknown weather fields');
  if (!WEATHER_KINDS.includes(value.kind) || typeof value.auto !== 'boolean') throw new Error('Invalid weather kind');
  if (![value.intensity, value.wetness, value.puddles, value.snow].every(number => Number.isFinite(number) && number >= 0 && number <= 1)) throw new Error('Invalid weather amount');
  if (![value.autoStart, value.updatedAt].every(number => Number.isFinite(number) && number >= 0 && number <= time + 1e-7) || value.autoStart > value.updatedAt) throw new Error('Invalid weather clock');
  return structuredClone(value);
}
