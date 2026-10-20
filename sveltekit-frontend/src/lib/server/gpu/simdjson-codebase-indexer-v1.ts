/**
 * SIMDJSON High-Throughput Codebase Indexer & ACE Packet Batcher (v1)
 *
 * Implements high-throughput parsing and 4D manifold coordinate indexing
 * for repository directories and large-scale (400k+ chunks) JSON dumps:
 * - Leverages fastJsonParseWithBackend (N-API simdjson native addon with V8 fallback).
 * - Extracts 4D manifold coordinates [x, y, z, w] and assigns feature labels.
 * - Enforces zero persistence of forbidden keys (hiddenThoughts, kv_cache, tensor).
 * - Invariants: canonicalAuthority = false, writesPerformed = false.
 */

import { z } from 'zod';
import { fastJsonParseWithBackend, type FastJsonParseBackend } from './simdjson-bridge.js';
import {
  type Manifold4Coordinate,
  type Manifold4Node,
  Manifold4CoordinateSchema,
} from '../atlas/topology/manifold4-traversal-v1.js';
import { matchFeatureLabel } from '../atlas/taxonomy/feature-taxonomy-v1.js';

export const RawChunkRecordSchema = z.object({
  id: z.string().min(1),
  source_ref: z.string().min(1),
  content_hash: z.string().optional(),
  feature_label: z.string().optional(),
  manifold4: z.array(z.number()).length(4).optional(),
  som_bmu_row: z.number().optional(),
  som_bmu_col: z.number().optional(),
  centroid_distance: z.number().optional(),
  grade_score: z.number().min(0).max(1).optional(),
}).passthrough();

export type RawChunkRecord = z.infer<typeof RawChunkRecordSchema>;

export interface SimdIndexBatchResult {
  nodes: Manifold4Node[];
  backendUsed: FastJsonParseBackend;
  processedCount: number;
  validNodeCount: number;
  durationMs: number;
  featureDistribution: Record<string, number>;
  canonicalAuthority: false;
  writesPerformed: false;
}

/**
 * Parses raw JSON text using SIMDJSON N-API (or V8 fallback) and transforms
 * records into normalized Manifold4Node structures.
 */
export function parseAndIndexChunkBatchSimd(
  jsonText: string,
  options: { defaultMinGrade?: number } = {}
): SimdIndexBatchResult {
  const start = performance.now();
  const defaultMinGrade = options.defaultMinGrade ?? 0.35;

  const { value, backend } = fastJsonParseWithBackend<unknown>(jsonText);
  const rawList = Array.isArray(value) ? value : [value];

  const nodes: Manifold4Node[] = [];
  const featureDistribution: Record<string, number> = {};

  let validCount = 0;
  for (let idx = 0; idx < rawList.length; idx++) {
    const parsed = RawChunkRecordSchema.safeParse(rawList[idx]);
    if (!parsed.success) continue;

    const row = parsed.data;
    const featureLabel = row.feature_label || matchFeatureLabel(row.source_ref) || 'chat';
    // Resolve 4D manifold coordinates:
    // [x, y, z, w]
    // x, y = som_bmu_row, som_bmu_col or manifold4[0, 1]
    // z = centroid_distance or manifold4[2]
    // w = grade_score or manifold4[3]
    let coords: Manifold4Coordinate;
    if (row.manifold4) {
      coords = [row.manifold4[0], row.manifold4[1], row.manifold4[2], row.manifold4[3]];
    } else {
      const x = row.som_bmu_row ?? 5.0;
      const y = row.som_bmu_col ?? 5.0;
      const z = row.centroid_distance ?? 0.2;
      const w = row.grade_score ?? 0.75;
      coords = [x, y, z, w];
    }

    const gradeScore = row.grade_score ?? coords[3];
    if (gradeScore < defaultMinGrade) continue;

    featureDistribution[featureLabel] = (featureDistribution[featureLabel] ?? 0) + 1;

    nodes.push({
      id: row.id,
      ordinal: validCount++,
      sourceRef: row.source_ref,
      coords,
      gradeScore,
      featureLabel,
    });
  }

  const durationMs = performance.now() - start;

  return {
    nodes,
    backendUsed: backend,
    processedCount: rawList.length,
    validNodeCount: nodes.length,
    durationMs: Math.round(durationMs * 100) / 100,
    featureDistribution,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
