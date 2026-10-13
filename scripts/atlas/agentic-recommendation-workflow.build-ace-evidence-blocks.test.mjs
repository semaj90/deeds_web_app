#!/usr/bin/env node
// ACE-GROUNDING-FAILCLOSED-01 regression test for l6Synthesis's evidence-block construction.
// Found live: aceCards (card titles + sourceRefs) was injected into the synthesis prompt
// unconditionally, regardless of aceContext.status -- the actual mechanism behind the
// evidence-laundering chain this gate exists to prevent. Both acePacket and aceCards must be
// gated on the same admission check.
import assert from 'node:assert/strict';
import { buildAceEvidenceBlocks, resolveAgenticWorkflowModel } from './agentic-recommendation-workflow.mjs';

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

{
  await assert.rejects(
    resolveAgenticWorkflowModel({ expectedModel: 'gemma4-9b', fetchImpl: async () => { throw new Error('must not be called'); } }),
    /AGENTIC_WORKFLOW_MODEL_NOT_ORNITH_1_5/,
  );
}
