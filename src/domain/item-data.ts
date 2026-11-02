/** Only identity/quantity/ownership are closed contracts. Additive item fields are JSON. */
export type ExtensibleRecord = { [key: string]: unknown };
export const isItemRecord = (v: unknown): v is ExtensibleRecord =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** Refuse unserializable runtime data before it can corrupt a checkpoint. No coercion. */
export function assertItemJson(value: unknown): void {
  const seen = new Set<object>();
  let count = 0;
  const visit = (v: unknown, depth: number): void => {
    if (++count > 100000 || depth > 32) throw new Error('Item data exceeds JSON budget');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number' && Number.isFinite(v)) return;
    if (typeof v !== 'object' || v === null || seen.has(v)) throw new Error('Invalid item JSON value');
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null)
      throw new Error('Item attributes must be plain JSON');
    seen.add(v);
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        if (!Object.hasOwn(v, i)) throw new Error('Sparse item array');
        visit(v[i], depth + 1);
      }
    } else {
      for (const key of Object.keys(v)) {
        const property = Object.getOwnPropertyDescriptor(v, key)!;
        if (!Object.hasOwn(property, 'value')) throw new Error('Item accessor is not JSON');
        visit(property.value, depth + 1);
      }
    }
    seen.delete(v);
  };
  visit(value, 0);
}

/** Object spread, not recursive assignment: even unknown __proto__ keys stay inert data. */
export function withoutFields(value: ExtensibleRecord, names: readonly string[]): ExtensibleRecord {
  const result = { ...value };
  for (const name of names) delete result[name];
  return result;
}
