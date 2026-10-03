import { z } from 'zod';

/**
 * MAPREDUCE-VIEW-V1
 * 
 * CouchDB-style pure Mapper/Reducer for derived projections:
 * - Emits key-value rows from canonical evidence.
 * - Computes incremental aggregations without canonical database writes.
 * - canonicalAuthority is always false.
 */

export type MapEmitter<K, V> = (key: K, value: V) => void;
export type MapFunction<T, K, V> = (doc: T, emit: MapEmitter<K, V>) => void;
export type ReduceFunction<K, V, R> = (key: K, values: V[]) => R;

export const AtlasMapReduceViewV1Schema = z
  .object({
    viewName: z.string().min(1),
    canonicalAuthority: z.literal(false),
    rowCount: z.number().int().min(0),
    emittedAt: z.string().datetime(),
  })
  .strict();

export interface MapReduceResult<K, R> {
  key: K;
  result: R;
}

export function executeMapReduce<T, K extends string | number, V, R>(
  documents: readonly T[],
  mapFn: MapFunction<T, K, V>,
  reduceFn: ReduceFunction<K, V, R>,
): MapReduceResult<K, R>[] {
  const intermediate = new Map<K, V[]>();

  // Map Phase
  for (const doc of documents) {
    mapFn(doc, (key: K, val: V) => {
      const existing = intermediate.get(key);
      if (existing) {
        existing.push(val);
      } else {
        intermediate.set(key, [val]);
      }
    });
  }

  // Reduce Phase
  const results: MapReduceResult<K, R>[] = [];
  for (const [key, values] of intermediate.entries()) {
    results.push({
      key,
      result: reduceFn(key, values),
    });
  }

  return results.sort((a, b) => String(a.key).localeCompare(String(b.key)));
}
