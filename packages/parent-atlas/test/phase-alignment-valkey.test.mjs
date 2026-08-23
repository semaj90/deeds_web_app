import assert from 'node:assert/strict';
import test from 'node:test';
import { contextualFabricChecksum, buildPrefillCacheEntry } from '../dist/core/contextual-prefill-fabric.js';
import { buildPrefillRuntimeIdentity } from '../dist/core/prefill-cache-runtime.js';
import { buildValkeyPhaseDeps, runPhaseAlignedExecution } from '../dist/core/phase-alignment-runtime.js';

const H = (value) => contextualFabricChecksum(value);
const identity = buildPrefillRuntimeIdentity({
  prefill_identity_checksum: H('prefill'), instruction_set_checksum: H('instructions'), hydration_manifest_checksum: H('hydration'),
  feature_alignment_checksum: H('features'), context_manifest_checksum: H('context'), compiler_revision: 'compiler:r1',
  model_revision: 'model:r1', adapter_revision: null, tokenizer_revision: 'tokenizer:r1', chat_template_revision: 'template:r1',
  inference_runtime_id: 'llama:local', inference_runtime_revision: 'runtime:r1',
});
const phase = {
  schema: 'atlas.phase-alignment-input.v1', request_id: 'request:valkey', workspace_revision: 'ws:1', source_revision: 'src:1',
  graph_revision: 'graph:1', representation_revision: 'semantic_768:v1', hmm_model_revision: 'hmm:1', hmm_observation_checksum: H('obs'),
  state_path: ['SEARCH_CODE'], selected_tool: 'rg.search', tool_schema_revision: 'tools:1', context_manifest_checksum: identity.context_manifest_checksum,
  exact_evidence_promoted: true, prefill_identity_checksum: identity.prefill_identity_checksum, prefill_cache_status: 'MISS',
  decoder_runtime_revision: 'runtime:r1', encoder_model_revision: null, encoder_input_checksum: null, producer_revision: 'phase:r1',
};

test('Valkey phase adapter stores metadata and requires validated readback', async () => {
  let stored = null;
  let compiles = 0;
  const adapter = {
    async getPrefillRecord(expected) {
      if (!stored) return { status: 'MISS', record: null, mismatches: [] };
      const { verifyPrefillRecord } = await import('../dist/core/prefill-cache-runtime.js');
      const check = verifyPrefillRecord(stored, expected);
      return { status: check.status, record: check.reusable ? stored : null, mismatches: check.mismatches };
    },
    async setPrefillRecordNx(record) { stored = record; return 'STORED'; },
  };
  const result = await runPhaseAlignedExecution(phase, {
    ...buildValkeyPhaseDeps({ adapter, identity, decoder_runtime_revision: 'runtime:r1', compile: async () => { compiles += 1; return { compiled_prefill_artifact_id: 'artifact:1', compiled_prefill_checksum: H('artifact') }; } }),
    decode: async () => 'decoded',
  });
  assert.equal(result.outcome, 'DECODED');
  assert.equal(compiles, 1);
  assert.equal(result.decode_count, 1);
  assert.equal(stored?.canonical_authority, false);
});
