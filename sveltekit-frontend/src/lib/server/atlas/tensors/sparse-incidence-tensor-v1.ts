/**
 * SparseIncidenceTensorV1 — Hypergraph Incidence Matrix H in {0, 1}^(|V| x |E|)
 *
 * Implements the bi-ordinal hypergraph incidence contract:
 * - Rows (|V|): Defined by sealed CandidateOrdinalMapV1 (entity ordinals)
 * - Columns (|E|): Defined by sealed HyperedgeOrdinalMapV1 (hyperedge / tuple ordinals)
 * - Non-zero cells: Indicate verified participant-to-hyperedge incidences
 * - Structured Sidecar: Preserves participant roles, predicate semantics, and evidence refs
 *
 * Designed for PyTorch ATen (torch.sparse_coo_tensor / CSR) and cuGraph acceleration lanes.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CandidateOrdinalMapV1 } from '../features/canonical-candidate-v1.js';
import { assertCandidateOrdinalMapIntegrityV1 } from '../features/canonical-candidate-v1.js';
import type { HyperedgeOrdinalMapV1 } from './hyperedge-ordinal-map-v1.js';
import { assertHyperedgeOrdinalMapIntegrityV1 } from './hyperedge-ordinal-map-v1.js';

export const SPARSE_INCIDENCE_TENSOR_V1_SCHEMA = 'atlas.sparse-incidence-tensor.v1' as const;

export const QualifiedIncidenceEntrySchema = z.object({
  entityOrdinal: z.number().int().nonnegative(),
  hyperedgeOrdinal: z.number().int().nonnegative(),
  role: z.enum(['SUBJECT', 'PREDICATE', 'OBJECT', 'CONTEXT', 'CALLER', 'CALLEE', 'MODIFIER']),
  predicate: z.string().min(1),
  weight: z.number().min(0).max(1).default(1.0),
  evidenceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
}).strict();

export type QualifiedIncidenceEntry = z.infer<typeof QualifiedIncidenceEntrySchema>;

export interface SparseIncidenceTensorV1 {
  readonly schema: typeof SPARSE_INCIDENCE_TENSOR_V1_SCHEMA;
  readonly entityRowCount: number;       // |V|
  readonly hyperedgeColumnCount: number; // |E|
  readonly nnz: number;                  // Number of non-zero entries
  readonly entityOrdinalMapChecksum: string;
  readonly hyperedgeOrdinalMapChecksum: string;
  readonly tensorChecksum: string;
  /** COO Sparse format: Row indices (entity ordinals) */
  readonly rowIndices: Uint32Array;
  /** COO Sparse format: Column indices (hyperedge ordinals) */
  readonly colIndices: Uint32Array;
  /** COO Sparse format: Entry weights */
  readonly values: Float32Array;
  /** Structured sidecar preserving role and predicate information */
  readonly qualifiedEntries: readonly QualifiedIncidenceEntry[];
  readonly canonicalAuthority: false;
}

export function computeIncidenceTensorChecksum(
  rowIndices: Uint32Array,
  colIndices: Uint32Array,
  values: Float32Array,
  entityMapChecksum: string,
  hyperedgeMapChecksum: string
): string {
  const hash = createHash('sha256');
  hash.update(entityMapChecksum, 'utf8');
  hash.update(hyperedgeMapChecksum, 'utf8');
  hash.update(Buffer.from(rowIndices.buffer, rowIndices.byteOffset, rowIndices.byteLength));
  hash.update(Buffer.from(colIndices.buffer, colIndices.byteOffset, colIndices.byteLength));
  hash.update(Buffer.from(values.buffer, values.byteOffset, values.byteLength));
  return hash.digest('hex');
}

/**
 * Builds and validates a SparseIncidenceTensorV1 from separately sealed row and column maps.
 */
export function buildSparseIncidenceTensorV1(input: {
  entityOrdinalMap: CandidateOrdinalMapV1;
  hyperedgeOrdinalMap: HyperedgeOrdinalMapV1;
  entries: readonly QualifiedIncidenceEntry[];
}): SparseIncidenceTensorV1 {
  // 1. Validate internal integrity of both sealed ordinal maps
  assertCandidateOrdinalMapIntegrityV1(input.entityOrdinalMap);
  assertHyperedgeOrdinalMapIntegrityV1(input.hyperedgeOrdinalMap);

  const numEntities = input.entityOrdinalMap.rowCount;
  const numHyperedges = input.hyperedgeOrdinalMap.rowCount;

  // 2. Validate all entries lie strictly within bounds [0, |V|-1] and [0, |E|-1]
  const validEntries: QualifiedIncidenceEntry[] = [];
  const seenPairs = new Set<string>();

  for (const entry of input.entries) {
    QualifiedIncidenceEntrySchema.parse(entry);

    if (entry.entityOrdinal >= numEntities) {
      throw new RangeError(`ENTITY_ORDINAL_OUT_OF_BOUNDS: ${entry.entityOrdinal} >= ${numEntities}`);
    }
    if (entry.hyperedgeOrdinal >= numHyperedges) {
      throw new RangeError(`HYPEREDGE_ORDINAL_OUT_OF_BOUNDS: ${entry.hyperedgeOrdinal} >= ${numHyperedges}`);
    }

    const pairKey = `${entry.entityOrdinal}:${entry.hyperedgeOrdinal}:${entry.role}`;
    if (seenPairs.has(pairKey)) {
      throw new Error(`DUPLICATE_INCIDENCE_ENTRY:${pairKey}`);
    }
    seenPairs.add(pairKey);
    validEntries.push(entry);
  }

  // 3. Sort entries deterministically: col index (hyperedge), then row index (entity)
  validEntries.sort((a, b) => {
    if (a.hyperedgeOrdinal !== b.hyperedgeOrdinal) {
      return a.hyperedgeOrdinal - b.hyperedgeOrdinal;
    }
    return a.entityOrdinal - b.entityOrdinal;
  });

  const nnz = validEntries.length;
  const rowIndices = new Uint32Array(nnz);
  const colIndices = new Uint32Array(nnz);
  const values = new Float32Array(nnz);

  for (let i = 0; i < nnz; i++) {
    rowIndices[i] = validEntries[i].entityOrdinal;
    colIndices[i] = validEntries[i].hyperedgeOrdinal;
    values[i] = validEntries[i].weight;
  }

  const tensorChecksum = computeIncidenceTensorChecksum(
    rowIndices,
    colIndices,
    values,
    input.entityOrdinalMap.ordinalMapChecksum,
    input.hyperedgeOrdinalMap.ordinalMapChecksum
  );

  return {
    schema: SPARSE_INCIDENCE_TENSOR_V1_SCHEMA,
    entityRowCount: numEntities,
    hyperedgeColumnCount: numHyperedges,
    nnz,
    entityOrdinalMapChecksum: input.entityOrdinalMap.ordinalMapChecksum,
    hyperedgeOrdinalMapChecksum: input.hyperedgeOrdinalMap.ordinalMapChecksum,
    tensorChecksum,
    rowIndices,
    colIndices,
    values,
    qualifiedEntries: validEntries,
    canonicalAuthority: false,
  };
}

/**
 * Converts SparseIncidenceTensorV1 to PyTorch COO representation parameters.
 */
export function toPyTorchCooDescriptor(tensor: SparseIncidenceTensorV1): {
  shape: [number, number];
  nnz: number;
  rowIndices: Uint32Array;
  colIndices: Uint32Array;
  values: Float32Array;
} {
  return {
    shape: [tensor.entityRowCount, tensor.hyperedgeColumnCount],
    nnz: tensor.nnz,
    rowIndices: tensor.rowIndices,
    colIndices: tensor.colIndices,
    values: tensor.values,
  };
}
