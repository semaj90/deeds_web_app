import { describe, expect, it, vi } from 'vitest';
import { createPhaseAlignedToolWithDispatcher } from './dispatcher-tool-integration.js';

const checksum = 'a'.repeat(64);
const phase = {
  request_id: 'req-mcp-phase-1',
  workspace_revision: 'w1',
  source_revision: 's1',
  graph_revision: 'g1',
  representation_revision: 'r1',
  hmm_model_revision: 'hmm1',
  hmm_observation_checksum: checksum,
  state_path: ['UNKNOWN'] as const,
  selected_tool: 'placeholder',
  tool_schema_revision: 'tool1',
  context_manifest_checksum: checksum,
  exact_evidence_promoted: false,
  prefill_identity_checksum: null,
  prefill_cache_status: 'NONE' as const,
  decoder_runtime_revision: null,
  encoder_model_revision: null,
  encoder_input_checksum: null,
  producer_revision: 'producer1',
};

describe('phase-aware MCP dispatcher adapter', () => {
  it('blocks quarantine before the existing handler runs', async () => {
    const handler = vi.fn(async () => ({ content: [{ type: 'text', text: 'executed' }] }));
    const tool = createPhaseAlignedToolWithDispatcher(undefined, 'kb.rg_atlas_search', 'session-1', handler);

    const result = await tool({ query: 'phase_alignment', phase_alignment: { ...phase, state_path: ['QUARANTINE'] } });

    expect(handler).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.phase_alignment_receipt.decision.action).toBe('BLOCK');
  });

  it('strips phase metadata before dispatch and returns the receipt', async () => {
    const handler = vi.fn(async (input: any) => ({ content: [{ type: 'text', text: input.query }] }));
    const tool = createPhaseAlignedToolWithDispatcher(undefined, 'kb.rg_atlas_search', 'session-1', handler);

    const result = await tool({ query: 'phase_alignment', phase_alignment: phase });

    expect(handler).toHaveBeenCalledWith({ query: 'phase_alignment' });
    expect(result.phase_alignment_receipt.decision.action).toBe('VALIDATE');
    expect(result.content[0].text).toBe('phase_alignment');
  });
});
