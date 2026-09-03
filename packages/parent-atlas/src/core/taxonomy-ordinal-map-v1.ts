import { createHash } from 'node:crypto';
import { z } from 'zod';

const revision = z.string().min(1);

/**
 * TAXONOMY-ORDINAL-01 — same pattern OAK-PROJECTION-01 already established
 * for OaK query-graph nodes (see projection-ordinal-map-v1.ts): taxonomy
 * nodes (`taxonomy_nodes.node_key`, e.g. "root", "topo:api-route",
 * "cluster:gpu:42", "file:src/foo.ts") do NOT fit the durable
 * `GraphNodeKeyV1` vocabulary (symbol|packet|chunk|occurrence) or the OaK
 * `ProjectionNodeKeyV1` vocabulary (entity|tuple|hyperedge|tool|evidence) —
 * both are intentionally closed enums, not places to bolt on a 5th/6th
 * prefix. Taxonomy gets its own, separate, non-canonical coordinate space
 * instead, built with the same determinism convention (sorted by key, dense
 * 0..N-1 ordinals, sha256 checksum, canonicalAuthority always false) so it
 * composes cleanly with the existing ResidencySortKeyV1 (`projectionOrdinal`
 * there is a bare uint32, not typed to any specific key vocabulary).
 *
 * This module is CONTRACT ONLY: it produces the typed ordinal map a future
 * radix-sort/residency pass could consume. It performs no GPU execution and
 * is not wired into BitFrost. Per root CLAUDE.md's ACE-RADIX-01 governance,
 * live GPU radix-sort wiring is blocked until that proof gate reaches a full
 * PASS (currently DRY_RUN_PROVEN for the CUB half only) — do not add
 * production execution on top of this file without that citation.
 */
export const taxonomyNodeKeyV1Schema = z.string().min(1);
export type TaxonomyNodeKeyV1 = z.infer<typeof taxonomyNodeKeyV1Schema>;

export const taxonomyOrdinalRowSchema = z.object({
  taxonomyOrdinal: z.number().int().nonnegative(),
  taxonomyNodeKey: taxonomyNodeKeyV1Schema,
  level: z.number().int().min(0).max(255),
  parentKey: taxonomyNodeKeyV1Schema.nullable(),
}).strict();

export type TaxonomyOrdinalRowV1 = z.infer<typeof taxonomyOrdinalRowSchema>;

export const taxonomyOrdinalMapV1Schema = z.object({
  schema: z.literal('atlas.taxonomy-ordinal-map.v1').default('atlas.taxonomy-ordinal-map.v1'),
  taxonomyRevision: revision,
  rows: z.array(taxonomyOrdinalRowSchema),
  taxonomyOrdinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  canonicalAuthority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  const keys = new Set<string>();
  for (const row of value.rows) {
    if (keys.has(row.taxonomyNodeKey)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows'], message: `Duplicate taxonomyNodeKey ${row.taxonomyNodeKey}` });
    }
    keys.add(row.taxonomyNodeKey);
  }
  const sortedKeys = [...value.rows].map((r) => r.taxonomyNodeKey).sort();
  value.rows.forEach((row, index) => {
    if (row.taxonomyOrdinal !== index) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows', index, 'taxonomyOrdinal'], message: `taxonomyOrdinal must be dense and index-aligned (expected ${index}, got ${row.taxonomyOrdinal})` });
    }
  });
  if (value.rows.map((r) => r.taxonomyNodeKey).join('\0') !== sortedKeys.join('\0')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows'], message: 'rows must be sorted by taxonomyNodeKey (same determinism convention as GraphOrdinalMapV1/ProjectionOrdinalMapV1)' });
  }
  const knownKeys = new Set(value.rows.map((r) => r.taxonomyNodeKey));
  for (const row of value.rows) {
    if (row.parentKey !== null && !knownKeys.has(row.parentKey)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows'], message: `parentKey ${row.parentKey} for ${row.taxonomyNodeKey} is not present in this map's own rows` });
    }
  }
});

export type TaxonomyOrdinalMapV1 = z.infer<typeof taxonomyOrdinalMapV1Schema>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => {
        out[key] = (item as Record<string, unknown>)[key];
        return out;
      }, {});
    }
    return item;
  });
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export interface TaxonomyNodeInputV1 {
  taxonomyNodeKey: string;
  level: number;
  parentKey: string | null;
}

/** Sorts by taxonomyNodeKey and assigns dense ordinals — same determinism
 * convention buildGraphOrdinalMapV1/buildProjectionOrdinalMapV1 use. */
export function buildTaxonomyOrdinalMapV1(input: {
  taxonomyRevision: string;
  nodes: TaxonomyNodeInputV1[];
}): TaxonomyOrdinalMapV1 {
  if (!input.taxonomyRevision) throw new Error('TAXONOMY_ORDINAL_REVISION_BINDING_REQUIRED');
  const keys = new Set<string>();
  for (const node of input.nodes) {
    if (keys.has(node.taxonomyNodeKey)) throw new Error(`TAXONOMY_ORDINAL_DUPLICATE_NODE_KEY:${node.taxonomyNodeKey}`);
    keys.add(node.taxonomyNodeKey);
  }
  // Plain default .sort() (not .localeCompare()) — must match the schema's
  // own re-validation sort exactly (see taxonomyOrdinalMapV1Schema above)
  // and the convention buildGraphOrdinalMapV1 already uses. localeCompare()
  // diverges from default sort on real-world keys (verified live against
  // the 5,527-row taxonomy_nodes table via prove-taxonomy-ordinal-map-v1.mjs
  // before this fix), which made the builder's own output fail its own
  // schema.
  const rows = [...input.nodes]
    .sort((a, b) => (a.taxonomyNodeKey < b.taxonomyNodeKey ? -1 : a.taxonomyNodeKey > b.taxonomyNodeKey ? 1 : 0))
    .map((node, taxonomyOrdinal) => ({
      taxonomyOrdinal,
      taxonomyNodeKey: node.taxonomyNodeKey,
      level: node.level,
      parentKey: node.parentKey,
    }));
  const body = {
    schema: 'atlas.taxonomy-ordinal-map.v1' as const,
    taxonomyRevision: input.taxonomyRevision,
    rows,
    canonicalAuthority: false as const,
  };
  return taxonomyOrdinalMapV1Schema.parse({ ...body, taxonomyOrdinalMapChecksum: sha256(body) });
}

export function taxonomyNodeKeyForOrdinalV1(map: TaxonomyOrdinalMapV1, taxonomyOrdinal: number): TaxonomyNodeKeyV1 | null {
  return map.rows.find((row) => row.taxonomyOrdinal === taxonomyOrdinal)?.taxonomyNodeKey ?? null;
}

/**
 * Maps a taxonomy ordinal row into the existing, already-generic
 * ResidencySortKeyV1 shape (atlas/residency/packet-glyph-v1.ts in the
 * sveltekit-frontend app). Reuses that contract as-is rather than inventing
 * a parallel sort-key type — ResidencySortKeyV1.projectionOrdinal is a bare
 * uint32 with no key-vocabulary coupling, so it composes directly.
 * `tier`/`utilityBucket`/`recencyBucket` are caller-supplied because they
 * depend on BitFrost residency/utility signals this contract does not own.
 */
export function taxonomyOrdinalToResidencySortKeyInputV1(
  row: TaxonomyOrdinalRowV1,
  buckets: { tier: number; utilityBucket: number; recencyBucket: number },
): { tier: number; lod: number; utilityBucket: number; recencyBucket: number; projectionOrdinal: number } {
  return {
    tier: buckets.tier,
    lod: row.level,
    utilityBucket: buckets.utilityBucket,
    recencyBucket: buckets.recencyBucket,
    projectionOrdinal: row.taxonomyOrdinal,
  };
}
