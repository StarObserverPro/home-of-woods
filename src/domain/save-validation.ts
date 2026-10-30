import { isRecord } from './inventory.ts';
import { isStableId } from './item-catalog.ts';
import { WORLD } from '../content/world.ts';
export function requireValue(condition: unknown, path: string, reason: string): asserts condition {
  if (!condition) throw new Error(`${path}: ${reason}`);
}
export function object(value: unknown, path: string): Record<string, unknown> {
  requireValue(isRecord(value), path, '必须是记录'); return value;
}
export function fields(value: Record<string, unknown>, required: readonly string[], path: string, optional: readonly string[] = []) {
  requireValue(required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key)), path, '缺少字段或含未来字段');
}
export function integer(value: unknown, path: string, min = 0): number {
  requireValue(Number.isSafeInteger(value) && (value as number) >= min, path, '整数无效'); return value as number;
}
export function finite(value: unknown, path: string, min = 0): number {
  requireValue(typeof value === 'number' && Number.isFinite(value) && value >= min, path, '数值无效'); return value;
}
export function timestamp(value: unknown, path: string, time: number) {
  if (value !== null) requireValue(finite(value, path) <= time + 1e-7, path, '时间晚于世界时间');
}
export function id(value: unknown, path: string): string { requireValue(isStableId(value), path, '身份无效'); return value; }
export function point(value: unknown, path: string) {
  const p = object(value, path); fields(p, ['x', 'z'], path);
  const x = finite(p.x, `${path}.x`, WORLD.minX), z = finite(p.z, `${path}.z`, WORLD.minZ);
  requireValue(x <= WORLD.maxX && z <= WORLD.maxZ, path, '坐标越界');
  return { x, z };
}
export function uniqueStrings(value: unknown, path: string): string[] {
  requireValue(Array.isArray(value), path, '必须是列表');
  for (let i = 0; i < value.length; i++) id(value[i], `${path}[${i}]`);
  requireValue(new Set(value).size === value.length, path, '身份重复'); return value as string[];
}
export function actionSequence(value: string, prefix: 'chop' | 'gather', next: number, path: string) {
  const match = new RegExp(`^${prefix}-([1-9][0-9]*)${prefix === 'chop' ? '-.+' : ''}$`).exec(value);
  requireValue(match, path, '动作身份无效');
  const sequence = Number(match[1]); requireValue(Number.isSafeInteger(sequence) && sequence < next, path, '动作计数器冲突');
  return sequence;
}
