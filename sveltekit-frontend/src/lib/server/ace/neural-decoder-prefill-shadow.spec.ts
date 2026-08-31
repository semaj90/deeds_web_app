import { describe, expect, it } from 'vitest';
import {
  deriveBasePrefillIdentityChecksumFromManifest,
  runNeuralDecoderPrefillShadowForManifest,
  selectValidCandidateEmbeddings,
  MAX_CANDIDATE_EMBEDDINGS,
} from './neural-decoder-prefill-shadow.js';
import type { ContextManifest } from './context-compiler.parent-atlas.js';

function manifestWithIdentity(overrides: Partial<NonNullable<ContextManifest['identity']>> = {}): ContextManifest {
  return {
    identity: {
      candidate_ordinal_set_checksum: 'a'.repeat(64),
      evidence_revision_checksum: 'b'.repeat(64),
      ordinal_map_checksum: null,
      retrieval_policy_revision: 'policy-v1',
      ace_playbook_revision: null,
      model_revision: null,
      prompt_template_revision: null,
      complete: false,
      ...overrides,
    },
  } as unknown as ContextManifest;
}

describe('PREFILL-CALLER-01: deriveBasePrefillIdentityChecksumFromManifest', () => {
  it('returns null when the manifest has no identity envelope', () => {
    expect(deriveBasePrefillIdentityChecksumFromManifest({} as ContextManifest)).toBeNull();
  });

  it('is deterministic for the same manifest identity', () => {
    const manifest = manifestWithIdentity();
    expect(deriveBasePrefillIdentityChecksumFromManifest(manifest)).toBe(
      deriveBasePrefillIdentityChecksumFromManifest(manifest),
    );
  });

  it('changes when candidate_ordinal_set_checksum changes', () => {
    const a = deriveBasePrefillIdentityChecksumFromManifest(manifestWithIdentity());
    const b = deriveBasePrefillIdentityChecksumFromManifest(
      manifestWithIdentity({ candidate_ordinal_set_checksum: 'c'.repeat(64) }),
    );
    expect(a).not.toBe(b);
  });

  it('changes when evidence_revision_checksum changes', () => {
    const a = deriveBasePrefillIdentityChecksumFromManifest(manifestWithIdentity());
    const b = deriveBasePrefillIdentityChecksumFromManifest(
      manifestWithIdentity({ evidence_revision_checksum: 'd'.repeat(64) }),
    );
    expect(a).not.toBe(b);
  });

  it('produces a valid 64-char sha256 hex string', () => {
    const checksum = deriveBasePrefillIdentityChecksumFromManifest(manifestWithIdentity());
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('PREFILL-CALLER-01: runNeuralDecoderPrefillShadowForManifest fails closed by default', () => {
  it('returns null when NEURAL_DECODER_PREFILL_SHADOW_ENABLED is off (the default) without touching decoder/cache/redis', async () => {
    const receipt = await runNeuralDecoderPrefillShadowForManifest(
      manifestWithIdentity(),
      Array.from({ length: 768 }, () => 0.01),
      { requestId: 'req-shadow-1' },
    );
    expect(receipt).toBeNull();
  });

  it('returns null when no query embedding is available, independent of the feature flag', async () => {
    const receipt = await runNeuralDecoderPrefillShadowForManifest(manifestWithIdentity(), null, {
      requestId: 'req-shadow-2',
    });
    expect(receipt).toBeNull();
  });

  it('returns null when the embedding has the wrong dimensionality', async () => {
    const receipt = await runNeuralDecoderPrefillShadowForManifest(
      manifestWithIdentity(),
      Array.from({ length: 512 }, () => 0.01),
      { requestId: 'req-shadow-3' },
    );
    expect(receipt).toBeNull();
  });

  it('returns null when the flag is off even with per-candidate embeddings supplied (per-candidate wiring)', async () => {
    const candidateEmbeddings = [Array.from({ length: 768 }, () => 0.02)];
    const receipt = await runNeuralDecoderPrefillShadowForManifest(
      manifestWithIdentity(),
      Array.from({ length: 768 }, () => 0.01),
      { requestId: 'req-shadow-4' },
      candidateEmbeddings,
    );
    expect(receipt).toBeNull();
  });
});

describe('PREFILL-CALLER-01 per-candidate wiring: selectValidCandidateEmbeddings', () => {
  it('passes through valid 768-dim candidates unchanged', () => {
    const candidates = [
      Array.from({ length: 768 }, () => 0.1),
      Array.from({ length: 768 }, () => 0.2),
    ];
    expect(selectValidCandidateEmbeddings(candidates)).toEqual(candidates);
  });

  it('drops candidates with the wrong dimensionality rather than throwing', () => {
    const valid = Array.from({ length: 768 }, () => 0.1);
    const wrongDim = Array.from({ length: 256 }, () => 0.1);
    expect(selectValidCandidateEmbeddings([valid, wrongDim, valid])).toEqual([valid, valid]);
  });

  it('truncates to MAX_CANDIDATE_EMBEDDINGS, never exceeding the decoder batch cap', () => {
    const oversized = Array.from({ length: MAX_CANDIDATE_EMBEDDINGS + 10 }, () =>
      Array.from({ length: 768 }, () => 0.1),
    );
    const selected = selectValidCandidateEmbeddings(oversized);
    expect(selected.length).toBe(MAX_CANDIDATE_EMBEDDINGS);
  });

  it('returns an empty array for null/undefined input (query-only fallback)', () => {
    expect(selectValidCandidateEmbeddings(null)).toEqual([]);
    expect(selectValidCandidateEmbeddings(undefined)).toEqual([]);
  });
});
