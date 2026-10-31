import { createHash } from 'node:crypto';
import { deriveUUID } from '$lib/utils/uuid.js';

/**
 * Persistence contract for evidence_vectors rows holding canonical 768-D EmbeddingGemma chunk vectors.
 * Operator decision 2026-10-29: embedding_type = evidence_text_semantic_768, source_field = canonical_evidence_text.
 *
 * Pure validation only: nothing here embeds, writes PostgreSQL, or touches Qdrant. 384-D rows, MRL prefixes and
 * latent vectors are different representations and never satisfy this contract.
 */
export const EVIDENCE_EMBEDDING_TYPE = 'evidence_text_semantic_768' as const;
export const EVIDENCE_SOURCE_FIELD = 'canonical_evidence_text' as const;
export const EVIDENCE_SEMANTIC_DIMENSION = 768 as const;
/** Input recipe: SHA-256 over the exact UTF-8 bytes of the chunk text, no task prefix, no trimming. */
export const EVIDENCE_INPUT_RECIPE_REVISION = 'evidence-chunk-text-raw-utf8.v1' as const;

const SHA256_REF = /^sha256:[0-9a-f]{64}$/;

export interface EvidenceEmbeddingProvenance {
  /** SHA-256 of the full GGUF/model artifact, verified by the producer (never caller-asserted labels such as ':latest'). */
  modelArtifactSha256: string;
  modelReceipt: {
    provider: 'llama-server' | 'ollama' | 'cpu';
    artifactIdentityBound: boolean;
    dimensionBound: boolean;
    runtimeReady: boolean;
  };
  inputRecipeRevision: string;
  /** SHA-256 of the chunk text under inputRecipeRevision. */
  inputSha256: string;
}

export interface EvidenceEmbeddingCandidate {
  evidenceId: string;
  sourceRevision: string;
  chunkIndex: number;
  content: string;
  vector: readonly number[];
  provenance: Partial<EvidenceEmbeddingProvenance> | null | undefined;
}

export type EvidenceEmbeddingDecision =
  | { ok: true; embeddingType: typeof EVIDENCE_EMBEDDING_TYPE; sourceField: typeof EVIDENCE_SOURCE_FIELD }
  | { ok: false; reasons: string[] };

export function evidenceInputSha256(content: string): string {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

/**
 * The legacy embedText() fallback repeated the 32 bytes of SHA-256(text) / 255 across 768 slots, so a pseudo-vector
 * has period 32. A model embedding does not. Also catches constant and zero vectors.
 */
export function looksLikePseudoVector(vector: readonly number[]): boolean {
  if (vector.length < 64) return false;
  let periodic = true;
  let constant = true;
  for (let i = 0; i < vector.length; i += 1) {
    if (i >= 32 && vector[i] !== vector[i - 32]) periodic = false;
    if (vector[i] !== vector[0]) constant = false;
    if (!periodic && !constant) return false;
  }
  return periodic || constant;
}

export function decideEvidenceEmbedding(candidate: EvidenceEmbeddingCandidate): EvidenceEmbeddingDecision {
  const reasons: string[] = [];
  const { vector, provenance } = candidate;

  if (!Array.isArray(vector) || vector.length !== EVIDENCE_SEMANTIC_DIMENSION) {
    reasons.push(`DIMENSION_MISMATCH:${Array.isArray(vector) ? vector.length : 'not_an_array'}`);
  } else {
    if (!vector.every((value) => typeof value === 'number' && Number.isFinite(value))) reasons.push('NON_FINITE_COMPONENT');
    else if (looksLikePseudoVector(vector)) reasons.push('PSEUDO_VECTOR_REJECTED');
  }

  if (!SHA256_REF.test(candidate.sourceRevision ?? '')) reasons.push('SOURCE_REVISION_MISSING_OR_INVALID');
  if (!Number.isInteger(candidate.chunkIndex) || candidate.chunkIndex < 0) reasons.push('CHUNK_INDEX_INVALID');
  if (typeof candidate.content !== 'string' || candidate.content.length === 0) reasons.push('CONTENT_EMPTY');

  if (!provenance) {
    reasons.push('MODEL_PROVENANCE_MISSING');
  } else {
    if (!SHA256_REF.test(provenance.modelArtifactSha256 ?? '')) reasons.push('MODEL_ARTIFACT_SHA256_MISSING_OR_INVALID');
    if (
      provenance.modelReceipt?.provider !== 'llama-server'
      || provenance.modelReceipt.artifactIdentityBound !== true
      || provenance.modelReceipt.dimensionBound !== true
      || provenance.modelReceipt.runtimeReady !== true
    ) reasons.push('MODEL_RECEIPT_NOT_BOUND_TO_LIVE_GGUF');
    if (provenance.inputRecipeRevision !== EVIDENCE_INPUT_RECIPE_REVISION) reasons.push('INPUT_RECIPE_REVISION_MISMATCH');
    if (!SHA256_REF.test(provenance.inputSha256 ?? '')) reasons.push('INPUT_SHA256_MISSING_OR_INVALID');
    else if (typeof candidate.content === 'string' && provenance.inputSha256 !== evidenceInputSha256(candidate.content)) {
      reasons.push('INPUT_SHA256_DOES_NOT_MATCH_CONTENT');
    }
  }

  return reasons.length === 0
    ? { ok: true, embeddingType: EVIDENCE_EMBEDDING_TYPE, sourceField: EVIDENCE_SOURCE_FIELD }
    : { ok: false, reasons };
}

export function assertEvidenceEmbeddingAdmitted(candidate: EvidenceEmbeddingCandidate): Extract<EvidenceEmbeddingDecision, { ok: true }> {
  const decision = decideEvidenceEmbedding(candidate);
  if (decision.ok === false) throw new Error(`EVIDENCE_EMBEDDING_NOT_ADMITTED:${decision.reasons.join(',')}`);
  return decision;
}

/**
 * Deterministic Qdrant point id for one evidence chunk vector. Same (evidence, source revision, chunk, model artifact)
 * always maps to the same point, so retries upsert in place; a new revision or a different model artifact is a new point.
 */
export async function evidenceQdrantPointId(identity: {
  evidenceId: string;
  sourceRevision: string;
  chunkIndex: number;
  modelArtifactSha256: string;
}): Promise<string> {
  return deriveUUID('atlas.evidence-vector.qdrant-point.v1', {
    embeddingType: EVIDENCE_EMBEDDING_TYPE,
    evidenceId: identity.evidenceId,
    sourceRevision: identity.sourceRevision,
    chunkIndex: String(identity.chunkIndex),
    modelArtifactSha256: identity.modelArtifactSha256,
  });
}
