import test from 'node:test';
import assert from 'node:assert/strict';
import { applyChunkSummaryAdmissions } from './chunk-summary-admission-writer-v1.mjs';
import { sha256Text } from './summary-quality-v1.mjs';
import { sha256Hex, stableJsonV1 } from './summary-proposal-candidate-v1.mjs';
const seal = (p) => { const { proposalChecksum: _x, ...rest } = p; return { ...rest, proposalChecksum: `sha256:${sha256Hex(Buffer.from(stableJsonV1(rest), 'utf8'))}` }; };

const SUMMARY = 'Validates the session token and returns the authenticated user record for the request.';
const mkProposal = (i, over = {}) => seal({
  chunkRowId: `00000000-0000-0000-0000-00000000000${i}`, chunkId: `c${i}`, chunkCanonicalId: `canon${i}`,
  sourceRef: `src/f${i}.ts`, sourceRevision: 'SRC-A', workspaceRevision: 'WS-1', inputTextSha256: `in${i}`,
  summary: SUMMARY, summarySha256: sha256Text(SUMMARY).slice(7), modelId: 'ornith', modelRevision: null,
  promptTemplateRevision: 'p1', evidenceRefs: ['binding_checksum:B'], ...over,
});
const goodRead = (p, over = {}) => ({
  chunkRowId: p.chunkRowId, rowExists: true, chunkIdentityMatches: true, currentInputDigest: `sha256:${p.inputTextSha256}`,
  summaryTargetsEmpty: true, summaryHashBefore: 'legacy', currentSourceRevision: 'SRC-A', bindingChecksum: 'B',
  exactChunkLineage: true, ...over,
});

function fake(proposals, readOver = () => ({}), { corruptReadback = false } = {}) {
  const log = []; const store = new Map();
  return {
    log,
    async query(sql, params) {
      const head = sql.trim().split(/\s+/)[0];
      log.push(head);
      if (sql.includes('jsonb_to_recordset')) return { rows: proposals.map((p) => goodRead(p, readOver(p))) };
      if (head === 'UPDATE') { store.set(params[0], { summary_text: params[1], summary_provenance: JSON.parse(params[2]) }); return { rowCount: 1 }; }
      if (sql.includes('FROM public.codebase_chunk_index WHERE id = ANY')) {
        return { rows: [...store].map(([id, v]) => ({ id, ...v, summary_text: corruptReadback ? 'x' : v.summary_text, summary_hash: 'legacy' })) };
      }
      return { rows: [] };
    },
  };
}

test('dry run: admissible, zero writes', async () => {
  const ps = [1, 2].map((i) => mkProposal(i)); const c = fake(ps);
  const r = await applyChunkSummaryAdmissions({ client: c, proposals: ps, repositoryId: 'r' });
  assert.equal(r.status, 'CANARY_BATCH_READY'); assert.ok(!c.log.includes('UPDATE')); assert.equal(r.updated, 0);
});
test('apply: all rows updated, readback proven, commit', async () => {
  const ps = [1, 2, 3].map((i) => mkProposal(i)); const c = fake(ps);
  const r = await applyChunkSummaryAdmissions({ client: c, proposals: ps, repositoryId: 'r', apply: true });
  assert.equal(r.status, 'APPLIED_READBACK_PROVEN'); assert.equal(r.updated, 3); assert.equal(c.log.at(-1), 'COMMIT');
  assert.equal(r.qdrant_writes + r.embedding_writes + r.graph_writes + r.cache_writes + r.summary_hash_mutated, 0);
});
test('source revision changed blocks the whole batch before any write', async () => {
  const ps = [1, 2].map((i) => mkProposal(i)); const c = fake(ps, (p) => (p.chunkId === 'c2' ? { currentSourceRevision: 'SRC-B' } : {}));
  const r = await applyChunkSummaryAdmissions({ client: c, proposals: ps, repositoryId: 'r', apply: true });
  assert.equal(r.status, 'BLOCKED_CANARY_BATCH'); assert.equal(r.source_revision_changed, 1); assert.ok(!c.log.includes('UPDATE'));
});
test('contaminated summary and existing summary are blocked', async () => {
  const bad = 'Example of a good summary: this does things.\n---\nYour turn: Feature: x';
  const ps = [mkProposal(1, { summary: bad, summarySha256: sha256Text(bad).slice(7) }), mkProposal(2)];
  const c = fake(ps, (p) => (p.chunkId === 'c2' ? { summaryTargetsEmpty: false } : {}));
  const r = await applyChunkSummaryAdmissions({ client: c, proposals: ps, repositoryId: 'r', apply: true });
  assert.equal(r.status, 'BLOCKED_CANARY_BATCH'); assert.equal(r.contamination_blocked, 1); assert.equal(r.unexpected_existing, 1);
  assert.ok(!c.log.includes('UPDATE'));
});
test('readback digest mismatch rolls back', async () => {
  const ps = [mkProposal(1)]; const c = fake(ps, () => ({}), { corruptReadback: true });
  const r = await applyChunkSummaryAdmissions({ client: c, proposals: ps, repositoryId: 'r', apply: true });
  assert.equal(r.status, 'ROLLED_BACK_READBACK_FAILED'); assert.equal(c.log.at(-1), 'ROLLBACK');
});
test('input digest change is detected', async () => {
  const ps = [mkProposal(1)]; const c = fake(ps, () => ({ currentInputDigest: 'sha256:other' }));
  const r = await applyChunkSummaryAdmissions({ client: c, proposals: ps, repositoryId: 'r' });
  assert.equal(r.input_digest_changed, 1); assert.equal(r.status, 'BLOCKED_CANARY_BATCH');
});

test('tampered proposal (checksum not recomputable) is blocked', async () => {
  const p = mkProposal(1); p.summary = p.summary + ' x';
  const c = fake([p]);
  const r = await applyChunkSummaryAdmissions({ client: c, proposals: [p], repositoryId: 'r' });
  assert.equal(r.proposal_checksum_mismatch, 1); assert.equal(r.status, 'BLOCKED_CANARY_BATCH');
});
test('frozen targets: changed source revision, unfrozen target and missing target all block', async () => {
  const ps = [1, 2].map((i) => mkProposal(i));
  const frozen = [{ chunkRowId: ps[0].chunkRowId, sourceRevision: 'SRC-OLD' }, { chunkRowId: ps[1].chunkRowId, sourceRevision: 'SRC-A' }];
  let r = await applyChunkSummaryAdmissions({ client: fake(ps), proposals: ps, repositoryId: 'r', frozenTargets: frozen });
  assert.equal(r.canary_source_changed, 1); assert.equal(r.status, 'BLOCKED_CANARY_BATCH');
  r = await applyChunkSummaryAdmissions({ client: fake(ps), proposals: ps, repositoryId: 'r', frozenTargets: [frozen[1]] });
  assert.equal(r.target_not_in_frozen_set, 1);
  r = await applyChunkSummaryAdmissions({ client: fake(ps), proposals: ps, repositoryId: 'r', frozenTargets: [...frozen, { chunkRowId: 'x', sourceRevision: 'S' }] });
  assert.equal(r.status, 'BLOCKED_FROZEN_TARGET_MISSING');
});
