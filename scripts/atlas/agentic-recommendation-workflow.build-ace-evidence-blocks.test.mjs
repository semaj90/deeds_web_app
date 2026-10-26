#!/usr/bin/env node
// ACE-GROUNDING-FAILCLOSED-01 regression test for l6Synthesis's evidence-block construction.
// Found live: aceCards (card titles + sourceRefs) was injected into the synthesis prompt
// unconditionally, regardless of aceContext.status -- the actual mechanism behind the
// evidence-laundering chain this gate exists to prevent. Both acePacket and aceCards must be
// gated on the same admission check.
import assert from 'node:assert/strict';
import { buildAceDagSynthesisPacket, buildAceEvidenceBlocks, resolveAgenticWorkflowModel } from './agentic-recommendation-workflow.mjs';

const sampleCards = [{ title: 'unrelated cached card', sourceRef: 'src/some/unrelated/file.ts' }];

// Rejected context (as computeAdmission() in atlas-tools-mcp.mjs would produce for a stale/
// missing-revision packet) -> both acePacket and aceCards must be withheld, even though `cards`
// is still populated on the context object (diagnostic-only, per design).
{
  const rejected = {
    status: 'REJECTED',
    promptPacket: null,
    cards: sampleCards,
  };
  const { acePacket, aceCards } = buildAceEvidenceBlocks(rejected);
  assert.equal(acePacket, '', 'acePacket must be empty for a REJECTED context');
  assert.equal(aceCards, '', 'aceCards must be empty for a REJECTED context even though cards[] is populated');
  assert.deepEqual(buildAceEvidenceBlocks(rejected).admittedCards, [], 'rejected cards must not reach downstream evidence consumers');
}

// Admitted context -> both blocks are included.
{
  const admitted = {
    status: 'ADMITTED',
    promptPacket: 'real synthesized packet text',
    cards: sampleCards,
  };
  const { acePacket, aceCards, admittedCards } = buildAceEvidenceBlocks(admitted);
  assert.ok(acePacket.includes('real synthesized packet text'));
  assert.ok(aceCards.includes('unrelated cached card'));
  assert.ok(aceCards.includes('src/some/unrelated/file.ts'));
  assert.deepEqual(admittedCards, sampleCards);
}

// Missing/null aceContext (no ACE packet available at all) -> both blocks empty, no throw.
{
  const { acePacket, aceCards, admittedCards } = buildAceEvidenceBlocks(null);
  assert.equal(acePacket, '');
  assert.equal(aceCards, '');
  assert.deepEqual(admittedCards, []);
}

// Legacy shape without `status` at all (e.g. an old cached response predating this fix) must be
// treated as not-admitted -- fail closed on an unrecognized/missing discriminant, never fail open.
{
  const legacy = { promptPacket: 'old unguarded packet', cards: sampleCards };
  const { acePacket, aceCards } = buildAceEvidenceBlocks(legacy);
  assert.equal(acePacket, '', 'a context with no status field must fail closed, not leak promptPacket');
  assert.equal(aceCards, '');
}

// The workflow must use the exact configured Ornith alias only when llama-server
// reports that same model as loaded; it must not fall back to a GGUF filename.
{
  let requestedUrl = null;
  const model = await resolveAgenticWorkflowModel({
    baseUrl: 'http://127.0.0.1:8090/v1/',
    expectedModel: 'ornith-1.5-9b',
    fetchImpl: async (url) => {
      requestedUrl = url;
      return new Response(JSON.stringify({ data: [{ id: 'ornith-1.5-9b' }] }), { status: 200 });
    },
  });
  assert.equal(requestedUrl, 'http://127.0.0.1:8090/v1/models');
  assert.equal(model, 'ornith-1.5-9b');
}

{
  await assert.rejects(
    resolveAgenticWorkflowModel({
      baseUrl: 'http://127.0.0.1:8090',
      expectedModel: 'ornith-1.5-9b',
      fetchImpl: async () => new Response(JSON.stringify({ data: [{ id: 'another-model' }] }), { status: 200 }),
    }),
    /AGENTIC_WORKFLOW_EXPECTED_MODEL_NOT_LOADED/,
  );
}

console.log('agentic-recommendation-workflow.build-ace-evidence-blocks.test.mjs: all assertions passed');

// DAG export is proposal-only and requires the same admitted ACE context plus
// a packet key explicitly selected by its ContextManifest.
{
  const blocked = buildAceDagSynthesisPacket({
    workflow: { query: 'find function', ace_context: { status: 'REJECTED', cards: sampleCards }, dag: [] },
  });
  assert.equal(blocked.status, 'BLOCKED');
  assert.deepEqual(blocked.evidence, []);
  assert.ok(blocked.reasons.includes('ACE_CONTEXT_NOT_ADMITTED'));
  assert.equal(blocked.writes_performed, false);
  assert.equal(blocked.model_invoked, false);
}

{
  const ready = buildAceDagSynthesisPacket({
    workflow: {
      query: 'find function',
      dag: [{ stage: 'retrieve', status: 'ok' }],
      ace_context: {
        status: 'ADMITTED',
        promptPacket: '{"packet":"bounded"}',
        cards: [{
          packet_key: 'packet:abc123',
          source_ref: 'src/function.ts',
          tree_node_id: 'tn_abc',
          source_revision: `sha256:${'a'.repeat(64)}`,
          workspace_revision: `sha256:${'b'.repeat(64)}`,
          title: 'Function',
        }],
        contextManifest: {
          manifest_id: 'manifest-1',
          request_id: 'request-1',
          selected_packet_keys: ['packet:abc123'],
        },
      },
    },
    tocContext: [{ ref: 'docs/atlas/parent-atlas-table-of-contents.md#pipeline', title: 'Pipeline' }],
  });
  assert.equal(ready.status, 'READY_FOR_DAG_SCAFFOLD');
  assert.equal(ready.synthesis_ready, false);
  assert.equal(ready.evidence_qualification, 'SHAPE_ONLY_NOT_LIVE_READBACK');
  assert.equal(ready.ace_packet, '{"packet":"bounded"}');
  assert.deepEqual(ready.evidence.map(({ packet_key }) => packet_key), ['packet:abc123']);
  assert.deepEqual(ready.toc_context, [{ ref: 'docs/atlas/parent-atlas-table-of-contents.md#pipeline', title: 'Pipeline' }]);
  assert.equal(ready.dag.length, 1);
  assert.equal(ready.canonical_authority, false);
}

{
  const unbound = buildAceDagSynthesisPacket({
    workflow: {
      ace_context: {
        status: 'ADMITTED',
        cards: [{
          packet_key: 'packet:not-selected',
          source_ref: 'src/function.ts',
          tree_node_id: 'tn_abc',
          source_revision: `sha256:${'a'.repeat(64)}`,
          workspace_revision: `sha256:${'b'.repeat(64)}`,
        }],
        contextManifest: { manifest_id: 'manifest-2', selected_packet_keys: ['packet:other'] },
      },
    },
  });
  assert.equal(unbound.status, 'BLOCKED');
  assert.deepEqual(unbound.evidence, []);
  assert.ok(unbound.reasons.includes('NO_EVIDENCE_BOUND_TO_MANIFEST'));
}

{
  await assert.rejects(
    resolveAgenticWorkflowModel({ expectedModel: 'gemma4-9b', fetchImpl: async () => { throw new Error('must not be called'); } }),
    /AGENTIC_WORKFLOW_MODEL_NOT_ORNITH_1_5/,
  );
}
