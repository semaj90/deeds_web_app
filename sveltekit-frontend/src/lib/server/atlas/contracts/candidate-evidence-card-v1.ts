/**
 * CandidateEvidenceCardV1 — the grounded-extraction bridge between reranked retrieval candidates
 * and ACE context admission.
 *
 * Per `openspec/changes/parent-atlas-retrieval-staging-planes/specs/ace-candidate-evidence-card/spec.md`:
 * a cross-encoder reranker answers "how relevant is candidate X" (a scalar); this card answers
 * "what does candidate X actually contain, grounded to source spans" (structured, LangExtract-style
 * extraction). The two are deliberately kept distinct — `retrieval.crossRankScore` is a ranking
 * signal, `extracted`/`groundedFacts` is evidence content. Never conflate them into one score.
 *
 * KNOWN CROSS-PACKAGE OVERLAP (recorded per CONTRACT-02's finding, not silently duplicated):
 * `packages/parent-atlas/src/core/structural-symbol.ts` already defines
 * `groundedLangExtractObservationSchema`, which substantially overlaps with `GroundedFactV1` below
 * (both ground an extracted attribute to a source char/byte interval). That schema is not currently
 * exposed through `@deeds/parent-atlas`'s public barrel, so this file defines a local
 * `GroundedFactV1` shape rather than a deep cross-package import. If/when the package barrel is
 * extended to re-export `groundedLangExtractObservationSchema`, `GroundedFactV1` here should be
 * reconciled with it (either replaced by an import, or explicitly documented as a distinct,
 * intentionally narrower shape) rather than left to silently diverge.
 */

import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * A single extracted fact grounded to a source span. Deliberately narrower than
 * `groundedLangExtractObservationSchema` (see file-level note above) — carries only what
 * `CandidateEvidenceCardV1` needs, not the full LangExtract alignment-status bookkeeping.
 */
export const GroundedFactV1Schema = z.object({
  factText: z.string().min(1),
  sourceRef: z.string().min(1),
  spanStart: z.number().int().nonnegative(),
  spanEnd: z.number().int().nonnegative(),
  confidence: z.number().finite().min(0).max(1),
}).strict().superRefine((value, ctx) => {
  if (value.spanEnd <= value.spanStart) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['spanEnd'], message: 'spanEnd must be > spanStart' });
  }
});

export type GroundedFactV1 = z.infer<typeof GroundedFactV1Schema>;

export const CandidateRetrievalRanksV1Schema = z.object({
  lexicalRank: z.number().finite(),
  structuralRank: z.number().finite(),
  semanticRank: z.number().finite(),
  graphRank: z.number().finite(),
  rrfScore: z.number().finite(),
  crossRankScore: z.number().finite(),
}).strict();

export type CandidateRetrievalRanksV1 = z.infer<typeof CandidateRetrievalRanksV1Schema>;

export const CandidateExtractedEvidenceV1Schema = z.object({
  symbols: z.array(z.string()).default([]),
  apis: z.array(z.string()).default([]),
  tests: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  groundedFacts: z.array(GroundedFactV1Schema).default([]),
}).strict();

export type CandidateExtractedEvidenceV1 = z.infer<typeof CandidateExtractedEvidenceV1Schema>;

export const CandidateEvidenceCardV1Schema = z.object({
  schema: z.literal('atlas.candidate-evidence-card.v1').default('atlas.candidate-evidence-card.v1'),
  canonicalId: id,
  packetKey: id,
  sourceRef: z.string().min(1),
  workspaceRevision: revision,
  sourceRevision: revision,
  retrieval: CandidateRetrievalRanksV1Schema,
  extracted: CandidateExtractedEvidenceV1Schema,
  tokenCost: z.number().int().nonnegative(),
  evidenceRefs: z.array(z.string()).default([]),
  extractionRevision: revision,
  checksum: sha256Hex,
}).strict();

export type CandidateEvidenceCardV1 = z.infer<typeof CandidateEvidenceCardV1Schema>;

/**
 * Hard bound per specs/ace-candidate-evidence-card/spec.md: batch extraction only ever runs on a
 * bounded, already-ranked candidate set (top 20-30 post-RRF/rerank), never the full corpus.
 */
export const CANDIDATE_EVIDENCE_EXTRACTION_MAX_BATCH = 30;

export function assertExtractionBatchBounded(candidateCount: number): void {
  if (candidateCount > CANDIDATE_EVIDENCE_EXTRACTION_MAX_BATCH) {
    throw new Error(
      `CandidateEvidenceCardV1 extraction batch of ${candidateCount} exceeds the bounded maximum ` +
        `of ${CANDIDATE_EVIDENCE_EXTRACTION_MAX_BATCH} (spec: ace-candidate-evidence-card). ` +
        `Batch extraction runs only on an already-ranked candidate subset, never the full corpus.`
    );
  }
}
