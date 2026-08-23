import { describe, expect, it } from 'vitest';
import { callToolSafely } from './bounded-tool-caller.js';

const checksum = (_value: string) => 'a'.repeat(64);
const phase = {
  schema: 'atlas.phase-alignment-input.v1' as const,
  request_id: 'request:bounded-tool', workspace_revision: 'workspace:1', source_revision: 'source:1', graph_revision: 'graph:1',
  representation_revision: 'semantic_768:v1', hmm_model_revision: 'hmm:v1', hmm_observation_checksum: checksum('observation'),
  state_path: ['SEARCH_CODE'] as const, selected_tool: 'topology.status', tool_schema_revision: 'tools:v1',
  context_manifest_checksum: checksum('context'), exact_evidence_promoted: true, prefill_identity_checksum: checksum('prefill'),
  prefill_cache_status: 'HIT' as const, decoder_runtime_revision: 'llama:v1', encoder_model_revision: null,
  encoder_input_checksum: null, producer_revision: 'phase-alignment:v1',
};

describe('bounded tool caller phase alignment', () => {
  it('blocks dispatch when the phase is quarantined', async () => {
    const result = await callToolSafely({ name: 'topology.status', arguments: {}, phase_alignment: { ...phase, state_path: ['QUARANTINE'] } });
    expect(result.ok).toBe(false);
    expect(result.phase_alignment_receipt?.decision.action).toBe('BLOCK');
  });

  it('carries a decode-admitted receipt into the existing bounded registry', async () => {
    const result = await callToolSafely({ name: 'topology.status', arguments: {}, phase_alignment: phase });
    expect(result.phase_alignment_receipt?.decision.action).toBe('DECODE');
    expect(result.phase_alignment_receipt?.decision.decode_admitted).toBe(true);
  });
});
