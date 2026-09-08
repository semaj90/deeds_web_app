/**
 * AtlasFeatureInputV1 — the stable neural-boundary contract for MICRO-02
 * (`openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md`, root tree): "Define and validate
 * a bounded CandidateFeatureMatrixV1 input projection for rank/span/route/utility heads. Features
 * remain derived observations; the model cannot mint source identity, revisions, CandidateOrdinal,
 * ontology tuples, or retrieval votes."
 *
 * This is a pure, read-only reshape of the EXISTING `RetrievalCandidateFeatureMatrixV1`
 * (`retrieval-candidate-feature-matrix-v1.ts`, [C,25] Float32Array + Uint8Array presence mask) into
 * one typed record per candidate. It computes nothing new — it does not become a second feature
 * owner, per the operator review's explicit warning: "don't invent another competing matrix." Any
 * future rank/span/route/utility head consumes `AtlasFeatureInputV1[]`, never the raw
 * `RetrievalCandidateFeatureMatrixV1` Float32Array directly, so the neural boundary stays typed and
 * auditable (feature name alignment, presence mask, evidence refs) rather than positional.
 */

import { z } from 'zod';
import { CANDIDATE_FEATURE_NAMES } from './feature-extraction-v1.js';
import type { RetrievalCandidateFeatureMatrixV1 } from '../../retrieval/retrieval-candidate-feature-matrix-v1.js';

export const ATLAS_FEATURE_INPUT_SCHEMA_VERSION = 'atlas.atlas-feature-input.v1' as const;

export const CandidateFeatureNameSchema = z.enum(CANDIDATE_FEATURE_NAMES);

export const AtlasFeatureInputV1Schema = z.object({
  matrixSchema: z.literal(ATLAS_FEATURE_INPUT_SCHEMA_VERSION).default(ATLAS_FEATURE_INPUT_SCHEMA_VERSION),
  matrixRevision: z.string().min(1),
  candidateOrdinal: z.number().int().nonnegative(),
  canonicalId: z.string().min(1),
  featureNames: z.array(CandidateFeatureNameSchema).length(CANDIDATE_FEATURE_NAMES.length),
  values: z.array(z.number().finite()).length(CANDIDATE_FEATURE_NAMES.length),
  presenceMask: z.array(z.union([z.literal(0), z.literal(1)])).length(CANDIDATE_FEATURE_NAMES.length),
  evidenceRefs: z.array(z.string()).default([]),
}).strict();

export type AtlasFeatureInputV1 = z.infer<typeof AtlasFeatureInputV1Schema>;

/**
 * Projects an existing `RetrievalCandidateFeatureMatrixV1` into one `AtlasFeatureInputV1` per
 * candidate row. Read-only: does not mutate the source matrix, does not compute any feature not
 * already present in it, and does not mint `candidateOrdinal` (the row index IS the ordinal —
 * consistent with the existing `RetrievalCandidateFeatureMatrixV1` row/packet-key pairing) or
 * canonical identity (taken verbatim from `candidate_packet_keys`).
 */
export function projectToAtlasFeatureInputs(
  matrix: RetrievalCandidateFeatureMatrixV1,
  matrixRevision: string,
  evidenceRefsByCandidate?: Map<string, string[]>
): AtlasFeatureInputV1[] {
  const F = matrix.feature_count;
  if (F !== CANDIDATE_FEATURE_NAMES.length) {
    throw new Error(
      `AtlasFeatureInputV1 projection expected feature_count=${CANDIDATE_FEATURE_NAMES.length} ` +
        `(CANDIDATE_FEATURE_NAMES), got ${F}. The neural boundary must not silently reinterpret a ` +
        `differently-shaped matrix.`
    );
  }

  const inputs: AtlasFeatureInputV1[] = [];
  for (let i = 0; i < matrix.candidate_count; i++) {
    const canonicalId = matrix.candidate_packet_keys[i];
    const rowOffset = i * F;
    const values: number[] = new Array(F);
    const presenceMask: (0 | 1)[] = new Array(F);
    for (let f = 0; f < F; f++) {
      values[f] = matrix.candidate_features[rowOffset + f];
      presenceMask[f] = matrix.presence_mask[rowOffset + f] === 1 ? 1 : 0;
    }
    inputs.push(
      AtlasFeatureInputV1Schema.parse({
        matrixRevision,
        candidateOrdinal: i,
        canonicalId,
        featureNames: CANDIDATE_FEATURE_NAMES,
        values,
        presenceMask,
        evidenceRefs: evidenceRefsByCandidate?.get(canonicalId) ?? [],
      })
    );
  }
  return inputs;
}
