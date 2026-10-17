/**
 * HyperedgeOrdinalMapV1 — Sealed Hyperedge / N-ary Tuple Ordinal Mapping
 *
 * Provides a sealed, bijective mapping between canonical hyperedge / tuple IDs
 * and contiguous 0-indexed column ordinals [0, |E|-1] for hypergraph incidence matrices
 * H in {0, 1}^(|V| x |E|).
 *
 * Invariants:
 * 1. Strict bijection: every hyperedge ID maps to exactly one ordinal in [0, rowCount - 1].
 * 2. Deterministic ordering: hyperedges are sorted by exact UTF-8 byte comparison.
 * 3. Sealed checksum: SHA-256 digest over the canonical JSON representation.
 * 4. Read-only projection: never invents hyperedges or assigns entity identity.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

export const HYPEREDGE_ORDINAL_MAP_V1_SCHEMA = 'atlas.hyperedge-ordinal-map.v1' as const;

export const hyperedgeOrdinalRowV1Schema = z.object({
  hyperedgeOrdinal: z.number().int().nonnegative(),
  hyperedgeId: z.string().min(1),
  ontologyId: z.string().min(1).optional(),
  participantCount: z.number().int().positive(),
  sourceRevision: z.string().min(1),
  evidenceChecksum: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

export type HyperedgeOrdinalRowV1 = z.infer<typeof hyperedgeOrdinalRowV1Schema>;

export const hyperedgeOrdinalMapV1Schema = z.object({
  schema: z.literal(HYPEREDGE_ORDINAL_MAP_V1_SCHEMA),
  workspaceRevision: z.string().min(1),
  rowCount: z.number().int().nonnegative(),
  hyperedges: z.array(hyperedgeOrdinalRowV1Schema),
  ordinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  canonicalAuthority: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();

export type HyperedgeOrdinalMapV1 = z.infer<typeof hyperedgeOrdinalMapV1Schema>;

function compareUtf8(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort(compareUtf8);
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
}

export function computeHyperedgeOrdinalMapChecksum(map: Omit<HyperedgeOrdinalMapV1, 'ordinalMapChecksum'>): string {
  const content = canonicalJson(map);
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function buildHyperedgeOrdinalMapV1(input: {
  workspaceRevision: string;
  producerRevision: string;
  hyperedges: Array<{
    hyperedgeId: string;
    ontologyId?: string;
    participantCount: number;
    sourceRevision: string;
    evidenceChecksum?: string;
  }>;
}): HyperedgeOrdinalMapV1 {
  // Sort deterministically by hyperedgeId UTF-8 byte order
  const sorted = [...input.hyperedges].sort((a, b) => compareUtf8(a.hyperedgeId, b.hyperedgeId));

  // Deduplicate and assign ordinals
  const rows: HyperedgeOrdinalRowV1[] = [];
  const seen = new Set<string>();

  for (const h of sorted) {
    if (seen.has(h.hyperedgeId)) {
      throw new Error(`DUPLICATE_HYPEREDGE_ID:${h.hyperedgeId}`);
    }
    seen.add(h.hyperedgeId);
    rows.push({
      hyperedgeOrdinal: rows.length,
      hyperedgeId: h.hyperedgeId,
      ontologyId: h.ontologyId,
      participantCount: h.participantCount,
      sourceRevision: h.sourceRevision,
      evidenceChecksum: h.evidenceChecksum,
    });
  }

  const unsignedMap = {
    schema: HYPEREDGE_ORDINAL_MAP_V1_SCHEMA,
    workspaceRevision: input.workspaceRevision,
    rowCount: rows.length,
    hyperedges: rows,
    canonicalAuthority: false as const,
    producerRevision: input.producerRevision,
  };

  const checksum = computeHyperedgeOrdinalMapChecksum(unsignedMap);

  return {
    ...unsignedMap,
    ordinalMapChecksum: checksum,
  };
}

export function assertHyperedgeOrdinalMapIntegrityV1(map: HyperedgeOrdinalMapV1): void {
  hyperedgeOrdinalMapV1Schema.parse(map);

  if (map.hyperedges.length !== map.rowCount) {
    throw new Error(`HYPEREDGE_ORDINAL_MAP_ROW_COUNT_MISMATCH: ${map.hyperedges.length} vs ${map.rowCount}`);
  }

  const seen = new Set<string>();
  for (let i = 0; i < map.hyperedges.length; i++) {
    const row = map.hyperedges[i];
    if (row.hyperedgeOrdinal !== i) {
      throw new Error(`NON_CONTIGUOUS_HYPEREDGE_ORDINAL: expected ${i}, got ${row.hyperedgeOrdinal}`);
    }
    if (seen.has(row.hyperedgeId)) {
      throw new Error(`DUPLICATE_HYPEREDGE_IN_MAP: ${row.hyperedgeId}`);
    }
    seen.add(row.hyperedgeId);
  }

  const computed = computeHyperedgeOrdinalMapChecksum({
    schema: map.schema,
    workspaceRevision: map.workspaceRevision,
    rowCount: map.rowCount,
    hyperedges: map.hyperedges,
    canonicalAuthority: map.canonicalAuthority,
    producerRevision: map.producerRevision,
  });

  if (computed !== map.ordinalMapChecksum) {
    throw new Error(`HYPEREDGE_ORDINAL_MAP_CHECKSUM_MISMATCH: stored ${map.ordinalMapChecksum} vs computed ${computed}`);
  }
}
