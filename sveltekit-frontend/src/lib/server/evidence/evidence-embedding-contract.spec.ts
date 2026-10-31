import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deriveEmbeddingGemmaMrlProjection } from '$lib/server/embedding/embedding-contract-768.js';
import {
  EVIDENCE_EMBEDDING_TYPE,
  EVIDENCE_INPUT_RECIPE_REVISION,
  EVIDENCE_SOURCE_FIELD,
  assertEvidenceEmbeddingAdmitted,
  decideEvidenceEmbedding,
  evidenceInputSha256,
  evidenceQdrantPointId,
  looksLikePseudoVector,
} from './evidence-embedding-contract.js';

const REV = `sha256:${'a'.repeat(64)}`;
const MODEL = `sha256:${'b'.repeat(64)}`;
const EVIDENCE_ID = '11111111-1111-4111-8111-111111111111';

function realisticVector(seed = 1): number[] {
  // Non-periodic, finite, non-constant stand-in for a model output.
  return Array.from({ length: 768 }, (_, i) => Math.sin(i * seed * 0.013) * Math.cos(i * 0.007 + seed));
}

function pseudoVector(text: string): number[] {
  const hash = createHash('sha256').update(text).digest();
  return Array.from({ length: 768 }, (_, i) => hash[i % hash.length] / 255);
}

function candidate(overrides: Record<string, unknown> = {}) {
  const content = 'Exhibit A chunk text';
  return {
    evidenceId: EVIDENCE_ID,
    sourceRevision: REV,
    chunkIndex: 0,
    content,
    vector: realisticVector(),
    provenance: {
      modelArtifactSha256: MODEL,
      modelReceipt: { provider: 'llama-server', artifactIdentityBound: true, dimensionBound: true, runtimeReady: true },
      inputRecipeRevision: EVIDENCE_INPUT_RECIPE_REVISION,
      inputSha256: evidenceInputSha256(content),
    },
    ...overrides,
  } as Parameters<typeof decideEvidenceEmbedding>[0];
}

describe('evidence embedding contract', () => {
  it('accepts a qualified 768-D vector and returns the approved type and source field', () => {
    expect(decideEvidenceEmbedding(candidate())).toEqual({
      ok: true,
      embeddingType: 'evidence_text_semantic_768',
      sourceField: 'canonical_evidence_text',
    });
    expect(EVIDENCE_EMBEDDING_TYPE).toBe('evidence_text_semantic_768');
    expect(EVIDENCE_SOURCE_FIELD).toBe('canonical_evidence_text');
  });

  it('rejects the legacy SHA-256 pseudo-vector fallback', () => {
    const text = 'Exhibit A chunk text';
    expect(looksLikePseudoVector(pseudoVector(text))).toBe(true);
    const decision = decideEvidenceEmbedding(candidate({ vector: pseudoVector(text) }));
    expect(decision).toMatchObject({ ok: false });
    expect((decision as { reasons: string[] }).reasons).toContain('PSEUDO_VECTOR_REJECTED');
  });

  it('throws before persistence when model provenance is missing', () => {
    expect(() => assertEvidenceEmbeddingAdmitted(candidate({ provenance: null }))).toThrow(
      'EVIDENCE_EMBEDDING_NOT_ADMITTED:MODEL_PROVENANCE_MISSING',
    );
  });

  it('rejects constant and zero vectors', () => {
    expect(looksLikePseudoVector(new Array(768).fill(0))).toBe(true);
    expect(looksLikePseudoVector(new Array(768).fill(0.5))).toBe(true);
    expect(looksLikePseudoVector(realisticVector())).toBe(false);
  });

  it.each([384, 512, 767, 769, 0])('rejects dimension %i', (dimension) => {
    const decision = decideEvidenceEmbedding(candidate({ vector: realisticVector().slice(0, dimension).concat(new Array(Math.max(0, dimension - 768)).fill(0.1)) }));
    expect(decision).toMatchObject({ ok: false });
    expect((decision as { reasons: string[] }).reasons[0]).toMatch(/^DIMENSION_MISMATCH/);
  });

  it.each([256, 128] as const)('keeps the %i-D MRL prefix outside canonical evidence persistence', (dimension) => {
    const projection = deriveEmbeddingGemmaMrlProjection(realisticVector(), dimension);
    const decision = decideEvidenceEmbedding(candidate({ vector: Array.from(projection.vector) }));

    expect(projection.dimension).toBe(dimension);
    expect(projection.vector).toHaveLength(dimension);
    expect(projection.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(decision).toMatchObject({ ok: false });
    expect((decision as { reasons: string[] }).reasons).toContain(`DIMENSION_MISMATCH:${dimension}`);
  });

  it('rejects non-finite components', () => {
    const vector = realisticVector();
    vector[10] = Number.NaN;
    expect((decideEvidenceEmbedding(candidate({ vector })) as { reasons: string[] }).reasons).toContain('NON_FINITE_COMPONENT');
  });

  it('fails closed on missing or mutable model provenance', () => {
    expect((decideEvidenceEmbedding(candidate({ provenance: null })) as { reasons: string[] }).reasons).toContain('MODEL_PROVENANCE_MISSING');
    const mutable = candidate({
      provenance: { modelArtifactSha256: 'embeddinggemma:latest', modelReceipt: { provider: 'ollama', artifactIdentityBound: false, dimensionBound: true, runtimeReady: true }, inputRecipeRevision: EVIDENCE_INPUT_RECIPE_REVISION, inputSha256: evidenceInputSha256('Exhibit A chunk text') },
    });
    expect((decideEvidenceEmbedding(mutable) as { reasons: string[] }).reasons).toContain('MODEL_ARTIFACT_SHA256_MISSING_OR_INVALID');
  });

  it('rejects a digest without a live GGUF receipt binding', () => {
    const unbound = candidate({
      provenance: {
        modelArtifactSha256: MODEL,
        modelReceipt: { provider: 'llama-server', artifactIdentityBound: false, dimensionBound: true, runtimeReady: true },
        inputRecipeRevision: EVIDENCE_INPUT_RECIPE_REVISION,
        inputSha256: evidenceInputSha256('Exhibit A chunk text'),
      },
    });
    expect((decideEvidenceEmbedding(unbound) as { reasons: string[] }).reasons).toContain('MODEL_RECEIPT_NOT_BOUND_TO_LIVE_GGUF');
  });

  it('requires the input checksum to match the stored content and the recipe revision', () => {
    const wrongInput = candidate({
      provenance: { modelArtifactSha256: MODEL, inputRecipeRevision: EVIDENCE_INPUT_RECIPE_REVISION, inputSha256: evidenceInputSha256('other text') },
    });
    expect((decideEvidenceEmbedding(wrongInput) as { reasons: string[] }).reasons).toContain('INPUT_SHA256_DOES_NOT_MATCH_CONTENT');
    const wrongRecipe = candidate({
      provenance: { modelArtifactSha256: MODEL, inputRecipeRevision: 'other.v9', inputSha256: evidenceInputSha256('Exhibit A chunk text') },
    });
    expect((decideEvidenceEmbedding(wrongRecipe) as { reasons: string[] }).reasons).toContain('INPUT_RECIPE_REVISION_MISMATCH');
  });

  it('requires a SHA-256 source revision and a non-negative chunk index', () => {
    const reasons = (decideEvidenceEmbedding(candidate({ sourceRevision: 'git:abc', chunkIndex: -1 })) as { reasons: string[] }).reasons;
    expect(reasons).toContain('SOURCE_REVISION_MISSING_OR_INVALID');
    expect(reasons).toContain('CHUNK_INDEX_INVALID');
  });
});

describe('evidenceQdrantPointId', () => {
  const identity = { evidenceId: EVIDENCE_ID, sourceRevision: REV, chunkIndex: 3, modelArtifactSha256: MODEL };

  it('is deterministic across retries', async () => {
    expect(await evidenceQdrantPointId(identity)).toBe(await evidenceQdrantPointId({ ...identity }));
    expect(await evidenceQdrantPointId(identity)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('changes with chunk, source revision, evidence and model artifact', async () => {
    const base = await evidenceQdrantPointId(identity);
    const variants = await Promise.all([
      evidenceQdrantPointId({ ...identity, chunkIndex: 4 }),
      evidenceQdrantPointId({ ...identity, sourceRevision: `sha256:${'c'.repeat(64)}` }),
      evidenceQdrantPointId({ ...identity, evidenceId: '22222222-2222-4222-8222-222222222222' }),
      evidenceQdrantPointId({ ...identity, modelArtifactSha256: `sha256:${'d'.repeat(64)}` }),
    ]);
    expect(new Set([base, ...variants]).size).toBe(5);
  });
});
