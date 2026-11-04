import { GEOMETRY_TEMPLATES } from '../content/parametric-crafting.ts';
import type { GeometryFamily, GeometryTemplate } from '../content/parametric-crafting.ts';

export type GeometryValue = number | string;
export type GeometrySpec = {
  templateId: string; version: number; family: GeometryFamily;
  parameters: Record<string, GeometryValue>;
};
export type GeometryPart = {
  id: string; primitive: 'cylinder' | 'box';
  center: { x: number; y: number; z: number };
  dimensions: { x: number; y: number; z: number };
};
export type AssemblyGuide = {
  id: string; role: 'support' | 'surface';
  target: { x: number; y: number; z: number; angle: number };
  maxPositionError: number; maxAngleError: number;
};
export type GuidePlacement = { id: string; x: number; y: number; z: number; angle: number };
export type AssemblyAssessment = { valid: boolean; score: number; deviations: readonly { id: string; position: number; angle: number }[]; reason: string };

const templateFor = (id: string): GeometryTemplate => {
  const template = GEOMETRY_TEMPLATES[id];
  if (!template) throw new Error('Unrecognized parametric geometry template');
  return template;
};
const numeric = (parameters: GeometrySpec['parameters'], key: string): number => {
  const value = parameters[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid numeric geometry parameter: ' + key);
  return value;
};
/** Default parameters come from the versioned template, not a copied model mesh. */
export function createGeometrySpec(templateId: string, overrides: Readonly<Record<string, unknown>> = {}): GeometrySpec {
  const template = templateFor(templateId), parameters: Record<string, GeometryValue> = {};
  for (const key of Object.keys(overrides)) if (!Object.hasOwn(template.parameters, key)) throw new Error('Unknown geometry parameter: ' + key);
  for (const [key, rule] of Object.entries(template.parameters)) {
    const value = Object.hasOwn(overrides, key) ? overrides[key] : rule.default;
    if (rule.kind === 'choice') {
      if (typeof value !== 'string' || !rule.choices.includes(value)) throw new Error('Invalid geometry choice: ' + key);
      parameters[key] = value;
    } else {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < rule.min - 1e-8 || value > rule.max + 1e-8 ||
          (rule.kind === 'integer' && !Number.isInteger(value)) ||
          Math.abs((value - rule.min) / rule.step - Math.round((value - rule.min) / rule.step)) > 1e-6)
        throw new Error('Geometry parameter out of range or off step: ' + key);
      parameters[key] = value;
    }
  }
  if (template.family === 'supported-surface') {
    if (numeric(parameters, 'height') <= numeric(parameters, 'seatThickness') ||
        numeric(parameters, 'supportInset') * 2 >= numeric(parameters, 'length'))
      throw new Error('Geometrically impossible support dimensions');
  }
  return { templateId, version: template.version, family: template.family, parameters };
}
/** Explicit version guard: unknown future geometry is retained as item JSON, never silently rebuilt as defaults. */
export function verifiedGeometrySpec(raw: unknown): GeometrySpec {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid geometry spec');
  const source = raw as Record<string, unknown>;
  if (typeof source.templateId !== 'string') throw new Error('Invalid template ID');
  const template = templateFor(source.templateId);
  if (source.version !== template.version || source.family !== template.family) throw new Error('Unsupported geometry generator version');
  if (!source.parameters || typeof source.parameters !== 'object' || Array.isArray(source.parameters)) throw new Error('Invalid geometry parameters');
  return createGeometrySpec(source.templateId, source.parameters as Record<string, unknown>);
}
export function geometryParts(spec: GeometrySpec): GeometryPart[] {
  const { family, parameters: p } = verifiedGeometrySpec(spec);
  if (family === 'solid') {
    const diameter = numeric(p, 'diameter'), height = numeric(p, 'height');
    return [{ id: 'body', primitive: 'cylinder', center: { x: 0, y: height / 2, z: 0 },
      dimensions: { x: diameter, y: height, z: diameter } }];
  }
  const length = numeric(p, 'length'), width = numeric(p, 'width'), height = numeric(p, 'height');
  const thickness = numeric(p, 'seatThickness'), count = numeric(p, 'supportCount'), inset = numeric(p, 'supportInset');
  const legs: GeometryPart[] = [];
  for (let i = 0; i < count; i++) {
    const x = -length / 2 + inset + (length - 2 * inset) * i / (count - 1);
    legs.push({ id: 'support-' + i, primitive: 'box',
      center: { x, y: (height - thickness) / 2, z: 0 },
      dimensions: { x: .18, y: height - thickness, z: width * .7 } });
  }
  return [{ id: 'surface', primitive: 'box', center: { x: 0, y: height - thickness / 2, z: 0 },
    dimensions: { x: length, y: thickness, z: width } }, ...legs];
}
/** Model-derived guides, not per-part positions persisted in the finished item. */
export function assemblyGuides(spec: GeometrySpec): AssemblyGuide[] {
  const template = templateFor(spec.templateId);
  if (!template.guide) return [];
  return geometryParts(spec).map(part => ({
    id: part.id, role: part.id === 'surface' ? 'surface' : 'support',
    target: { ...part.center, angle: 0 },
    maxPositionError: template.guide!.maxPositionError,
    maxAngleError: template.guide!.maxAngleError,
  }));
}
function wrapAngle(angle: number) {
  return Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
}
/** Validate before any material debit. Invalid fitting never yields a lucky high-grade object. */
export function assessAssembly(spec: GeometrySpec, placements: readonly GuidePlacement[]): AssemblyAssessment {
  const guides = assemblyGuides(spec);
  if (!guides.length) return { valid: placements.length === 0, score: 50, deviations: [], reason: placements.length ? 'This blueprint has no assembly guides' : '' };
  const positions = new Map<string, GuidePlacement>();
  for (const p of placements) {
    if (positions.has(p.id) || !guides.some(g => g.id === p.id) ||
        ![p.x, p.y, p.z, p.angle].every(Number.isFinite))
      return { valid: false, score: 0, deviations: [], reason: 'Invalid or duplicate fitting target' };
    positions.set(p.id, p);
  }
  if (positions.size !== guides.length) return { valid: false, score: 0, deviations: [], reason: 'Missing a required assembly part' };
  let normalized = 0, withinLimits = true;
  const deviations = guides.map(g => {
    const p = positions.get(g.id)!;
    const distance = Math.hypot(p.x - g.target.x, p.y - g.target.y, p.z - g.target.z);
    const angle = wrapAngle(p.angle - g.target.angle);
    if (distance > g.maxPositionError + 1e-8 || angle > g.maxAngleError + 1e-8) withinLimits = false;
    normalized += .8 * distance / g.maxPositionError + .2 * angle / g.maxAngleError;
    return { id: g.id, position: distance, angle };
  });
  return { valid: withinLimits, score: withinLimits ? Math.max(0, Math.round(100 * (1 - normalized / guides.length))) : 0,
    deviations, reason: withinLimits ? '' : 'Assembly is outside the blueprint tolerance' };
}
