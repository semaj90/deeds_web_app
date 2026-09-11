import { describe, expect, it } from 'vitest';
import type { ContextManifest } from '$lib/server/ace/context-compiler.parent-atlas.js';
import {
  assertNeuralResidencyManifestBindingV1,
  bindNeuralResidencyToContextManifestV1,
  type NeuralResidencyBindingV1,
} from './neural-residency-binding-v1.js';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);

function manifest(): ContextManifest {
  return {
    manifest_id: 'context:test',
    request_id: 'req:test',
    source_refs: [],
    retrieved_candidates: 1,
    warmed_candidates: 0,
    cache_hits: 0,
    selected_packet_keys: ['packet:test'],
    rejected_packet_keys: [],
    token_budget: 100,
    reserved_tokens: 10,
    usable_token_budget: 90,
    selected_tokens: 5,
    rejected_tokens: 0,
    selection_policy_version: 'test-policy:v1',
    spec_refs: [],
    lanes: { exact: 0, lexical: 0, dense: 1, graph: 0, bitfrost: 0 },
    selected_by_lane: { exact: 0, lexical: 0, dense: 1, graph: 0, bitfrost: 0 },
    warming: {
      warmed_candidates: 0,
      warmed_selected: 0,
      warmed_rejected: 0,
      cache_hits: 0,
      cache_hit_selected: 0,
      selection_rate: 1,
      cache_hit_selection_rate: 0,
      avoided_prompt_tokens: 0,
    },
    created_at: '2026-09-11T00:00:00.000Z',
    identity: {
      candidate_ordinal_set_checksum: D,
      evidence_revision_checksum: C,
      ordinal_map_checksum: A,
      retrieval_policy_revision: 'test-policy:v1',
      ace_playbook_revision: null,
      model_revision: null,
      prompt_template_revision: null,
      complete: true,
    },
  };
}

function binding(overrides: Partial<NeuralResidencyBindingV1> = {}): NeuralResidencyBindingV1 {
  return {
    schema: 'atlas.neural-residency-binding.v1',
    candidateSnapshotRevision: 'lineage-qualified-canary:sha256:' + 'f'.repeat(64) + ':v1:15',
    ordinalMapChecksum: A,
    featureSnapshotChecksum: B,
    gpuPackChecksum: C,
    residencyObservationChecksum: D,
    canonicalAuthority: false,
    rankingPromotion: false,
    ...overrides,
  };
}

describe('NEURAL-RESIDENCY-BINDING-01', () => {
  it('binds exact FEAT-04 cohort identity without changing authority', () => {
    const result = bindNeuralResidencyToContextManifestV1({ manifest: manifest(), binding: binding() });
    expect(result.identity.candidate_snapshot_revision).toBe(binding().candidateSnapshotRevision);
    expect(result.identity.feature_snapshot_checksum).toBe(B);
    expect(result.neural_residency_binding.canonicalAuthority).toBe(false);
    expect(result.neural_residency_binding.rankingPromotion).toBe(false);
    expect(assertNeuralResidencyManifestBindingV1(result)).toBe(result);
  });

  it('rejects ordinal-map drift', () => {
    expect(() => bindNeuralResidencyToContextManifestV1({
      manifest: manifest(),
      binding: binding({ ordinalMapChecksum: '9'.repeat(64) }),
    })).toThrow('NEURAL_RESIDENCY_ORDINAL_MAP_MISMATCH');
  });

  it('rejects incomplete manifest identity', () => {
    const value = manifest();
    value.identity = { ...value.identity!, complete: false };
    expect(() => bindNeuralResidencyToContextManifestV1({ manifest: value, binding: binding() }))
      .toThrow('NEURAL_RESIDENCY_MANIFEST_IDENTITY_INCOMPLETE');
  });
});
