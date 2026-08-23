import assert from 'node:assert/strict';
import test from 'node:test';
import { contextualFabricChecksum } from '../dist/core/contextual-prefill-fabric.js';
import { buildPhaseAlignmentReceipt, runPhaseAlignedExecution } from '../dist/core/phase-alignment-runtime.js';

const H = (value) => contextualFabricChecksum(value);
const base = {
  schema: 'atlas.phase-alignment-input.v1', request_id: 'req:1', workspace_revision: 'ws:1', source_revision: 'src:1',
  graph_revision: 'graph:1', representation_revision: 'semantic_768:v1', hmm_model_revision: 'hmm:1',
  hmm_observation_checksum: H('obs'), state_path: ['SEARCH_CODE'], selected_tool: 'rg.search', tool_schema_revision: 'tools:1',
  context_manifest_checksum: H('context'), exact_evidence_promoted: true, prefill_identity_checksum: H('prefill'),
  prefill_cache_status: 'HIT', decoder_runtime_revision: 'llama:1', encoder_model_revision: 'encoder:1',
  encoder_input_checksum: H('encoder-input'), producer_revision: 'phase-alignment:1',
};

test('phase alignment admits decode only after exact evidence and reusable prefill', () => {
  const receipt = buildPhaseAlignmentReceipt(base);
  assert.equal(receipt.decision.action, 'DECODE');
  assert.equal(receipt.decision.decode_admitted, true);
  assert.equal(receipt.training_example_admitted, false);
  assert.match(receipt.dag_edge_id, /^dag:rg\.search:decode$/);
});

test('phase alignment blocks quarantine before MCP or model execution', () => {
  const receipt = buildPhaseAlignmentReceipt({ ...base, state_path: ['SEARCH_CODE', 'QUARANTINE'] });
  assert.equal(receipt.decision.action, 'BLOCK');
  assert.equal(receipt.decision.selected_tool, null);
  assert.deepEqual(receipt.decision.block_reasons, ['HMM_QUARANTINE']);
});

test('phase alignment sends a cache miss to prefill and never admits training', () => {
  const receipt = buildPhaseAlignmentReceipt({ ...base, prefill_cache_status: 'MISS' });
  assert.equal(receipt.decision.action, 'PREFILL');
  assert.equal(receipt.decision.decode_admitted, false);
  assert.equal(receipt.training_example_admitted, false);
});

test('phase alignment requires exact evidence before prefill', () => {
  const receipt = buildPhaseAlignmentReceipt({ ...base, exact_evidence_promoted: false, prefill_cache_status: 'HIT' });
  assert.equal(receipt.decision.action, 'VALIDATE');
  assert.deepEqual(receipt.decision.block_reasons, ['EXACT_EVIDENCE_NOT_PROMOTED']);
});

test('phase runner compiles a miss once, rechecks, and decodes once', async () => {
  let compiles = 0;
  let decodes = 0;
  const result = await runPhaseAlignedExecution({ ...base, prefill_cache_status: 'MISS' }, {
    compile_prefill: async () => {
      compiles += 1;
      return { prefill_identity_checksum: H('compiled-prefill'), decoder_runtime_revision: 'llama:compiled' };
    },
    decode: async () => {
      decodes += 1;
      return { text: 'decoded' };
    },
  });
  assert.equal(result.outcome, 'DECODED');
  assert.equal(result.compile_count, 1);
  assert.equal(result.decode_count, 1);
  assert.equal(compiles, 1);
  assert.equal(decodes, 1);
});

test('phase runner reuses a hit without compiling', async () => {
  let compiles = 0;
  let decodes = 0;
  const result = await runPhaseAlignedExecution(base, {
    compile_prefill: async () => { compiles += 1; return { prefill_identity_checksum: H('wrong') }; },
    decode: async () => { decodes += 1; return 'decoded'; },
  });
  assert.equal(result.outcome, 'DECODED');
  assert.equal(compiles, 0);
  assert.equal(decodes, 1);
});
