import type { AffixTriggerId } from '../../src/content/affix-vfx-library.ts';
import { VISUAL_DAY_SECONDS } from '../../src/content/scene-props.ts';
import type { WeatherKind } from '../../src/content/weather.ts';
import { WORKSHOP_RULES } from '../../src/content/workshop.ts';
import { advanceLocalClock, calendarAt, LIFE_DAY_START_HOUR } from '../../src/domain/local-clock.ts';

const dailyHours = { 'time.dawn': 6, 'time.noon': 12, 'time.dusk': 18, 'time.midnight': 0 } as const;
const firstSeason = { 'season.first-spring': 0, 'season.first-winter': 3 } as const;
const hourZero = calendarAt(0).hour;
const hourSeconds = VISUAL_DAY_SECONDS / 24;
const seasonLength = WORKSHOP_RULES.daysPerSeason;
const yearLength = seasonLength * 4;
export const affixSites = { creek: { x: -.67, z: .16 }, fire: { x: .62, z: -.12 }, radius: .43 } as const;
export type AffixSpeed = 1 | 12;
export type AffixActivity = 'gather' | 'craft' | null;

export interface AffixInput {
  time: number;
  x: number;
  z: number;
  weather: WeatherKind;
  fog: boolean;
  walking: boolean;
  gatherSerial: number;
  craftSerial: number;
}

const clockTime = (day: number, hour: number) => (day * 24 + hour - hourZero) * hourSeconds;
const mod = (value: number, modulus: number) => (value % modulus + modulus) % modulus;
const radiusAt = (input: AffixInput, site: { x: number; z: number }) => Math.hypot(input.x - site.x, input.z - site.z);

function clockBoundary(id: AffixTriggerId, time: number, next: boolean) {
  const calendar = calendarAt(time);
  const day = calendar.day - 1;
  if (id in dailyHours) {
    const at = clockTime(day, dailyHours[id as keyof typeof dailyHours]);
    return next ? (at > time ? at : at + VISUAL_DAY_SECONDS) : (at <= time ? at : at - VISUAL_DAY_SECONDS);
  }
  if (id in firstSeason) {
    const seasonDay = firstSeason[id as keyof typeof firstSeason] * seasonLength;
    const at = clockTime(day - mod(day - seasonDay, yearLength), LIFE_DAY_START_HOUR);
    const year = yearLength * VISUAL_DAY_SECONDS;
    return next ? (at > time ? at : at + year) : (at <= time ? at : at - year);
  }
  return null;
}

/** Use one observer for a sequence of advancing snapshots. Reset on a deliberate scene reload. */
export function observeAffixTrigger(id: AffixTriggerId, initial: AffixInput) {
  let previous = initial;
  let clockHighWater = initial.time;
  let lastGather = initial.gatherSerial, lastCraft = initial.craftSerial;
  const entered = (before: AffixInput, after: AffixInput, site: typeof affixSites.creek | typeof affixSites.fire) =>
    radiusAt(before, site) > affixSites.radius && radiusAt(after, site) <= affixSites.radius;
  return (current: AffixInput): boolean => {
    const boundary = clockBoundary(id, current.time, false);
    const before = previous, previousHighWater = clockHighWater;
    const gathered = current.gatherSerial > lastGather, crafted = current.craftSerial > lastCraft;
    previous = current;
    clockHighWater = Math.max(clockHighWater, current.time);
    lastGather = Math.max(lastGather, current.gatherSerial);
    lastCraft = Math.max(lastCraft, current.craftSerial);
    if (boundary !== null) return boundary > previousHighWater && boundary <= current.time;
    switch (id) {
      case 'place.riverside': return entered(before, current, affixSites.creek);
      case 'place.campfire': return entered(before, current, affixSites.fire);
      case 'weather.rain-stops': return before.weather === 'rain' && current.weather !== 'rain';
      case 'weather.fog-enters': return !before.fog && current.fog;
      case 'player.walk-start': return !before.walking && current.walking;
      case 'player.walk-stop': return before.walking && !current.walking;
      case 'action.gather-done': return gathered;
      case 'action.craft-done': return crafted;
      default: return false;
    }
  };
}

const prelude = .76;
const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** An isolated scene changes its inputs before and after the named condition. */
export function replayAffixCondition(id: AffixTriggerId, speed: AffixSpeed) {
  const boundary = clockBoundary(id, 0, true);
  const clockHost = { time: boundary === null ? 0 : boundary - prelude * speed, clock: { speed } };
  if (id === 'place.campfire') clockHost.time = clockTime(0, 19);
  const activity: AffixActivity = id === 'action.gather-done' ? 'gather' : id === 'action.craft-done' ? 'craft' : null;
  let seconds = 0;

  function sample(): AffixInput {
    const crossed = seconds >= prelude;
    const approach = clamp(seconds / 1.02);
    const walkStart = clamp((seconds - prelude) / .98);
    const walkStop = clamp(seconds / prelude);
    return {
      time: clockHost.time,
      x: id === 'place.riverside' ? -.36 * approach : id === 'place.campfire' ? .36 * approach : 0,
      z: id === 'player.walk-start' ? -.38 + .71 * walkStart : id === 'player.walk-stop' ? -.31 + .58 * walkStop : 0,
      weather: id === 'weather.rain-stops' && !crossed ? 'rain' : 'sunny',
      fog: id === 'weather.fog-enters' && crossed,
      walking: id === 'player.walk-start' ? crossed && walkStart < 1 : id === 'player.walk-stop' ? !crossed :
        (id === 'place.riverside' || id === 'place.campfire') && approach < 1,
      gatherSerial: activity === 'gather' && crossed ? 1 : 0,
      craftSerial: activity === 'craft' && crossed ? 1 : 0,
    };
  }

  const observe = observeAffixTrigger(id, sample());
  return {
    id, sample, activity,
    advance(dt: number) {
      seconds += dt;
      advanceLocalClock(clockHost, dt);
      const input = sample();
      return { input, fired: observe(input), working: activity !== null && seconds < prelude };
    },
    get elapsed() { return seconds; },
  };
}
