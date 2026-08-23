#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { runPhaseAlignedExecution } from '../../packages/parent-atlas/dist/core/phase-alignment-runtime.js';

const base = process.argv[2] ?? 'http://127.0.0.1:8090';
const model = process.argv[3] ?? process.env.ATLAS_TOOL_MODEL ?? 'hforf.gguf';
const sha = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

const response = await fetch(`${base}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model,
    messages: [
      { role: 'system', content: 'Use the provided tool. Do not answer in prose.' },
      { role: 'user', content: 'Search the code for the exact token phase_alignment.' },
    ],
    tools: [{
      type: 'function',
      function: {
        name: 'rg_search',
        description: 'Search the repository for an exact token.',
        parameters: {
          type: 'object',
          properties: { pattern: { type: 'string' } },
          required: ['pattern'],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: 'function', function: { name: 'rg_search' } },
    temperature: 0,
    max_tokens: 128,
    stream: false,
  }),
});
if (!response.ok) throw new Error(`HFOrF_HTTP_${response.status}`);
const body = await response.json();
const call = body.choices?.[0]?.message?.tool_calls?.[0];
if (call?.function?.name !== 'rg_search') throw new Error('HFORF_NO_STRUCTURED_TOOL_CALL');
const args = JSON.parse(call.function.arguments ?? '{}');
if (typeof args.pattern !== 'string' || args.pattern.length === 0) throw new Error('HFORF_INVALID_TOOL_ARGUMENTS');

const input = {
  request_id: `hforf-replay:${Date.now()}`,
  workspace_revision: 'workspace:local:read-only',
  source_revision: 'source:local:read-only',
  graph_revision: 'graph:local:read-only',
  representation_revision: 'representation:semantic-768:read-only',
  hmm_model_revision: 'hmm:bounded-replay:v1',
  hmm_observation_checksum: sha(JSON.stringify({ tool: call.function.name, args })),
  state_path: ['SEARCH_CODE'],
  selected_tool: call.function.name,
  tool_schema_revision: 'mcp:bounded-tools:v1',
  context_manifest_checksum: sha('phase-alignment-context-manifest'),
  exact_evidence_promoted: true,
  prefill_identity_checksum: sha('phase-alignment-prefill-hit'),
  prefill_cache_status: 'HIT',
  decoder_runtime_revision: null,
  encoder_model_revision: null,
  encoder_input_checksum: null,
  producer_revision: 'smoke:phase-alignment-hforf:v1',
};

const result = await runPhaseAlignedExecution(input, {
  execute_tool: async (tool, phaseInput) => ({
    dry_run: true,
    tool,
    arguments: args,
    request_id: phaseInput.request_id,
    canonical_write_attempted: false,
  }),
});

if (result.outcome !== 'TOOL_EXECUTED') throw new Error(`PHASE_REPLAY_${result.outcome}`);
if (result.receipt.decision.action !== 'RETRIEVE') throw new Error(`PHASE_REPLAY_ACTION_${result.receipt.decision.action}`);
if (result.receipt.training_example_admitted !== false) throw new Error('PHASE_REPLAY_TRAINING_ADMITTED');
if (result.tool_result?.canonical_write_attempted !== false) throw new Error('PHASE_REPLAY_WRITE_ATTEMPTED');

console.log(JSON.stringify({
  status: 'BOUNDED_REPLAY_PROVEN',
  model,
  tool: call.function.name,
  arguments: args,
  phase_action: result.receipt.decision.action,
  outcome: result.outcome,
  training_example_admitted: result.receipt.training_example_admitted,
  canonical_write_attempted: result.tool_result.canonical_write_attempted,
}, null, 2));
