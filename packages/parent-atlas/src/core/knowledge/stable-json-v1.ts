import { createHash } from 'node:crypto';

export function stableJsonV1(value: unknown): string {
  const serialized = JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.keys(item as Record<string, unknown>)
          .sort()
          .reduce<Record<string, unknown>>((out, key) => {
            out[key] = (item as Record<string, unknown>)[key];
            return out;
          }, {})
      : item,
  );
  if (serialized === undefined) throw new Error('STABLE_JSON_UNDEFINED');
  return serialized;
}

export function sha256HexV1(value: unknown): string {
  return createHash('sha256').update(stableJsonV1(value), 'utf8').digest('hex');
}

export function sha256TextV1(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
