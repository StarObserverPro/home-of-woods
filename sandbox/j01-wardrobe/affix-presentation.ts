import * as THREE from 'three';
import { AFFIX_EMISSION_PATTERNS, type AffixTriggerId, type LowTierAffixCandidate } from '../../src/content/affix-vfx-library.ts';
import type { CharacterFootContact } from '../../src/scene/lighting/character-contact-shadows.ts';
import type { Resources } from '../../src/scene/resources.ts';
import { createAffixMarks } from './affix-marks.ts';

export interface AffixRecipe {
  name: string;
  trigger: AffixTriggerId;
  visual: LowTierAffixCandidate['visual'];
  colors: readonly string[];
}

export type AffixQuality = 'full' | 'quiet' | 'off';
export type AffixLight = 'condition' | 'day' | 'night';
export type AffixView = 'fitting' | 'near' | 'game';
export type TintTarget = Extract<AffixRecipe['visual'], { kind: 'tint' }>['target'];

export interface AffixAnchors {
  head: THREE.Vector3;
  left: THREE.Vector3;
  right: THREE.Vector3;
  body: THREE.Vector3;
  forward: THREE.Vector3;
  side: THREE.Vector3;
  feet: readonly CharacterFootContact[];
}

const patterns = new Map(AFFIX_EMISSION_PATTERNS.map(pattern => [pattern.id, pattern]));
const capacity = Math.max(...AFFIX_EMISSION_PATTERNS.map(pattern => pattern.maxParticles));
const circle = 2 * Math.PI;
const clamp = THREE.MathUtils.clamp;
const smooth = THREE.MathUtils.smoothstep;
const durationByPattern = {
  'head-crown': 2.1, 'shoulder-rise': 1.75, 'body-orbit': 2.55, 'back-fan': 1.65,
  'feet-ripple': 2.15, 'short-trail': 2.0, 'head-spray': 1.4, 'nearby-fall': 2.65,
} as const;
const tintDuration = 3.2;

export function createAffixPresentation(resources: Resources, stage: THREE.Scene) {
  const marks = createAffixMarks(resources, stage, capacity);
  const center = new THREE.Vector3(), point = new THREE.Vector3();
  const trail = Array.from({ length: 4 }, () => new THREE.Vector3());
  const fellAt = new Array<boolean>(trail.length).fill(false);
  const tint = { target: 'upper-body' as TintTarget, color: new THREE.Color(), amount: 0 };
  let recipe: AffixRecipe | null = null;
  let palette: THREE.Color[] = [];
  let age = 0;
  let active = false;

  function clear() {
    recipe = null;
    active = false;
    age = 0;
    tint.amount = 0;
    marks.clear();
    marks.commit(0);
  }

  function play(next: AffixRecipe) {
    recipe = next;
    palette = next.colors.map(color => new THREE.Color(color));
    age = 0;
    active = true;
    fellAt.fill(false);
    tint.amount = 0;
  }

  function update(dt: number, anchors: AffixAnchors, quality: AffixQuality, reduced: boolean, worldPerPixel: number) {
    if (!recipe || !active) return null;
    const visual = recipe.visual;
    age += dt;
    marks.clear();
    tint.amount = 0;
    if (quality === 'off') {
      clear();
      return null;
    }
    const duration = visual.kind === 'tint' ? tintDuration : durationByPattern[visual.patternId];
    if (age >= duration) {
      marks.commit(0);
      active = false;
      return null;
    }
    if (visual.kind === 'tint') {
      tint.target = visual.target;
      tint.color.copy(palette[0]);
      tint.amount = .89 * smooth(age, 0, .29) * (1 - smooth(age, 2.1, duration));
      marks.commit(0);
      return tint;
    }

    const layout = patterns.get(visual.patternId)!;
    const quiet = quality === 'quiet' || reduced;
    const distant = worldPerPixel > .075;
    const count = distant ? Math.min(quiet ? 3 : 5, layout.maxParticles) : quiet ? Math.ceil(layout.maxParticles / 2) : layout.maxParticles;
    const width = layout.widths * .38 * .5;
    const { head, left, right, body, side, forward, feet } = anchors;
    const floor = .015;
    for (let i = 0; i < count; i++) {
      const spread = i / count;
      const seed = (i * .618033989) % 1;
      const angle = spread * circle + .43;
      const delay = visual.patternId === 'short-trail' ? Math.floor(4 * spread) * .17 : seed * .25;
      const t = clamp((age - delay) / (duration - delay), 0, 1);
      if (t <= 0) continue;
      const travel = reduced ? .28 * t : t;
      const fade = smooth(t, 0, .16) * (1 - smooth(t, .54, 1));
      let alpha = fade * (.72 + seed * .26) * (quiet ? .83 : 1);
      let size = .048 + .029 * seed;
      let turn = angle * .4 + travel * (seed - .5) * 1.35;
      let ground = false;
      switch (visual.patternId) {
        case 'head-crown': {
          const radius = width * (.63 + .35 * travel);
          point.copy(head).addScaledVector(side, Math.cos(angle + travel * .8) * radius)
            .addScaledVector(forward, Math.sin(angle + travel * .8) * radius);
          point.y += .33 + Math.sin(Math.PI * travel) * .13 + seed * .061;
          size *= 1.18;
          break;
        }
        case 'shoulder-rise': {
          const sign = i % 2 === 0 ? -1 : 1;
          point.copy(sign > 0 ? left : right).addScaledVector(side, sign * (.044 + .058 * travel + seed * .039))
            .addScaledVector(forward, .062 + Math.cos(angle) * .084);
          point.y += -.015 + travel * (.28 + seed * .15) + .10 * seed;
          break;
        }
        case 'body-orbit': {
          const orbit = angle + travel * 4.3;
          point.copy(body).addScaledVector(side, Math.cos(orbit) * width)
            .addScaledVector(forward, Math.sin(orbit) * width * .84);
          point.y += Math.cos(angle) * .21 + travel * .085 - .065;
          break;
        }
        case 'back-fan': {
          const fan = (spread - .5) * 1.95;
          point.copy(body).addScaledVector(side, Math.sin(fan) * width * (.67 + travel * .61))
            .addScaledVector(forward, -(.14 + Math.cos(fan) * (.15 + travel * .2)));
          point.y += (seed - .52) * .34 + travel * .23 + .04;
          turn = -fan + .37;
          size *= 1.27;
          break;
        }
        case 'feet-ripple': {
          const ring = visual.shapeId === 'hollow-ring';
          // The first ring starts between the actual soles; later rings alternate by side.
          if (ring && i >= (quiet ? 2 : 4)) continue;
          const sole = feet[i % Math.max(1, feet.length)]?.position ?? body;
          center.copy(i === 0 && feet.length > 1 ? feet[0].position : sole);
          if (i === 0 && feet.length > 1) center.add(feet[1].position).multiplyScalar(.5);
          point.copy(center);
          const radius = width * (.19 + .77 * travel);
          if (ring) size = .11 + radius * (i === 0 ? 1.82 : .91);
          else point.addScaledVector(side, Math.cos(angle) * radius).addScaledVector(forward, Math.sin(angle) * radius);
          point.y = floor + (ring ? 0 : .022 + Math.sin(Math.PI * travel) * .13);
          ground = ring;
          alpha *= ring ? .86 : 1;
          break;
        }
        case 'short-trail': {
          const group = Math.floor(4 * spread);
          if (!fellAt[group]) {
            trail[group].copy(feet[group % Math.max(1, feet.length)]?.position ?? body)
              .addScaledVector(forward, -.11 - (group % 2) * .085);
            trail[group].y = floor;
            fellAt[group] = true;
          }
          point.copy(trail[group]).addScaledVector(side, Math.sin(angle) * (.042 + .090 * travel))
            .addScaledVector(forward, -travel * .13);
          point.y += .024 + .18 * Math.sin(Math.PI * travel * .6) * (.55 + seed);
          turn = .26 + (i % 2) * .32;
          size *= 1.19;
          break;
        }
        case 'head-spray': {
          const burst = .18 + .79 * (1 - (1 - travel) ** 2);
          point.copy(head).addScaledVector(side, Math.cos(angle) * width * burst)
            .addScaledVector(forward, Math.sin(angle) * width * burst);
          point.y += .35 + (.12 + seed * .19) * Math.sin(Math.PI * travel) + .048 * seed;
          turn += (seed - .5) * 3.2 * travel;
          size *= .94;
          break;
        }
        case 'nearby-fall':
          point.copy(body).addScaledVector(side, (i % 2 ? 1 : -1) * width * (.69 + seed * .32))
            .addScaledVector(forward, Math.sin(angle) * .19 + Math.sin(travel * 3.7 + i) * .064);
          point.y += .36 - .77 * travel + .39 * seed;
          alpha *= .76;
          break;
      }
      marks.mark(point, size, turn, visual.shapeId, ground, palette[i % palette.length], alpha);
    }
    marks.commit(worldPerPixel * (distant ? 3.2 : 1.25));
    return null;
  }

  return {
    play, clear, update,
    get active() { return active; },
    stats: () => ({ name: recipe?.name ?? null, visual: recipe?.visual ?? null, age, active, instances: marks.count, capacity,
      colors: recipe?.colors ?? [], tint: tint.amount }),
  };
}
