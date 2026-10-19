import { describe, expect, it } from 'vitest';
import { buildPatchTournamentPlan, type PatchTournamentCandidateInput, type PatchTournamentRequest } from '../../agent/patch-tournament.js';
import type { SqlClientV1 } from './topk-execution-receipt-v1.js';
import {
  PatchOutcomeSchema,
  buildPatchOutcomesV1,
  persistPatchOutcomeReceiptV1,
  toPatchOutcomeReceiptRowV1,
} from './patch-tournament-outcome-receipt-v1.js';

const h = (c: string) => c.repeat(64);
const COMPILE_ERROR = "fixture.cjs(1,28): error TS1109: Expression expected.";

function candidate(id: string, over: Partial<PatchTournamentCandidateInput>): PatchTournamentCandidateInput {
  return {
    candidateId: id, runId: `run:${id}`, sourceRevision: `sha256:${h('a')}`, patchDigest: `sha256:${h(id === 'c1' ? '1' : id === 'c2' ? '2' : '3')}`,
    branchName: `fix/${id}`, worktreePath: `.tmp/atlas/wt/${id}`, patchSummary: id, compileError: COMPILE_ERROR, touchedFiles: ['fixture.cjs'],
    staticChecks: [{ name: 'tsc', passed: true, command: 'npx tsc --noEmit', evidenceRef: 'receipt:ok-1' }],
    focusedTests: [{ name: 'vitest fixture', passed: true, command: 'npx vitest run fixture', evidenceRef: 'receipt:ok-2' }],
    evidenceRefs: [], riskSignals: [], ...over,
  };
}

function request(): PatchTournamentRequest {
  return {
    objective: 'repair fixture syntax error', workspaceId: 'ws:1', workspaceRevision: `sha256:${h('e')}`, baseBranch: 'main', compileError: COMPILE_ERROR,
    candidates: [
      candidate('c1', {}),                                                                    // passes everything, verified
      candidate('c2', { focusedTests: [{ name: 'vitest fixture', passed: false, command: 'npx vitest run fixture', evidenceRef: 'receipt:bad-1' }] }),   // failing test
      candidate('c3', { staticChecks: [{ name: 'tsc', passed: true, command: 'npx tsc --noEmit' }] }),                                            // pass with no evidence ref
    ],
  };
}

const VERIFIED = new Set(['receipt:ok-1', 'receipt:ok-2']);
const plan = () => buildPatchTournamentPlan(request(), { verifiedEvidenceRefs: VERIFIED });

function memoryClient() {
  const store = new Map<string, { manifest_checksum: string }>();
  const client: SqlClientV1 = {
    async query(text, values = []) {
      if (/^INSERT INTO atlas_algorithm_execution_receipts/.test(text)) {
        const id = String(values[0]);
        if (store.has(id)) return { rows: [] };
        store.set(id, { manifest_checksum: String(values[20]) });
        return { rows: [{ execution_id: id }] };
      }
      if (/^SELECT manifest_checksum/.test(text)) {
        const row = store.get(String(values[0]));
        return { rows: row ? [{ manifest_checksum: row.manifest_checksum }] : [] };
      }
      throw new Error(`unexpected query: ${text.slice(0, 40)}`);
    },
  };
  return { client, store };
}

describe('patch tournament outcome receipts', () => {
  it('records every candidate, including failures, with the right classification', () => {
    const out = buildPatchOutcomesV1({ plan: plan(), verifiedEvidenceRefs: VERIFIED });
    expect(out).toHaveLength(3);
    const byId = Object.fromEntries(out.map((o) => [o.candidateId, o]));
    expect(byId.c1.outcome).toBe('ALL_CHECKS_PASSED_VERIFIED');
    expect(byId.c2.outcome).toBe('CHECK_FAILED');                    // the negative class is kept
    expect(byId.c3.outcome).toBe('PASSED_UNVERIFIED');               // a pass without evidence is never verified
    expect(byId.c2.checks.find((c) => !c.passed)?.name).toBe('vitest fixture');
  });

  it('never trusts the check itself: an evidence ref the verifier table did not resolve is not verified', () => {
    const out = buildPatchOutcomesV1({ plan: plan(), verifiedEvidenceRefs: new Set(['receipt:ok-1']) });
    expect(out.find((o) => o.candidateId === 'c1')?.outcome).toBe('PASSED_UNVERIFIED');
  });

  it('carries no authority, reward, application or training flags, and only digests of command text', () => {
    for (const o of buildPatchOutcomesV1({ plan: plan(), verifiedEvidenceRefs: VERIFIED })) {
      expect([o.canonicalAuthority, o.appliedToWorkspace, o.rewardAssigned, o.independentlyReverified]).toEqual([false, false, false, false]);
      expect(o.noTraining).toBe(true);
      expect(JSON.stringify(o)).not.toContain('npx tsc');            // command identity only
    }
  });

  it('is deterministic and content-addressed', () => {
    const a = buildPatchOutcomesV1({ plan: plan(), verifiedEvidenceRefs: VERIFIED });
    const b = buildPatchOutcomesV1({ plan: plan(), verifiedEvidenceRefs: VERIFIED });
    expect(a).toEqual(b);
    expect(new Set(a.map((o) => o.executionId)).size).toBe(3);
    const changed = buildPatchOutcomesV1({ plan: plan(), verifiedEvidenceRefs: new Set() });
    expect(changed.find((o) => o.candidateId === 'c1')?.executionId).not.toBe(a.find((o) => o.candidateId === 'c1')?.executionId);
  });

  it('maps onto the existing table columns and persists idempotently', async () => {
    const { client, store } = memoryClient();
    const rows = buildPatchOutcomesV1({ plan: plan(), verifiedEvidenceRefs: VERIFIED }).map(toPatchOutcomeReceiptRowV1);
    expect(rows[0].logical_lane).toBe('agentic_repair');
    expect(rows[0].workflow_id).toMatch(/^tournament:/);
    for (const r of rows) expect((await persistPatchOutcomeReceiptV1(client, r)).status).toBe('INSERTED');
    for (const r of rows) expect((await persistPatchOutcomeReceiptV1(client, r)).status).toBe('IDEMPOTENT');
    expect(store.size).toBe(3);
  });

  it('rejects tampering: edited outcome, edited checksum, wrong lane, forged flags', async () => {
    const { client } = memoryClient();
    const row = toPatchOutcomeReceiptRowV1(buildPatchOutcomesV1({ plan: plan(), verifiedEvidenceRefs: VERIFIED })[0]);
    const flipped = { ...row, manifest: { outcome: { ...row.manifest.outcome, outcome: 'ALL_CHECKS_PASSED_VERIFIED' as const, score: 999 } } };
    await expect(persistPatchOutcomeReceiptV1(client, flipped)).rejects.toThrow('PATCH_OUTCOME_ID_MISMATCH');
    await expect(persistPatchOutcomeReceiptV1(client, { ...row, manifest_checksum: h('0') })).rejects.toThrow('PATCH_OUTCOME_MANIFEST_CHECKSUM_MISMATCH');
    await expect(persistPatchOutcomeReceiptV1(client, { ...row, logical_lane: 'rank_topk' })).rejects.toThrow('PATCH_OUTCOME_LANE_MISMATCH');
    expect(() => PatchOutcomeSchema.parse({ ...row.manifest.outcome, appliedToWorkspace: true })).toThrow();
    expect(() => PatchOutcomeSchema.parse({ ...row.manifest.outcome, touchedFiles: ['../../etc/passwd'] })).toThrow();
  });

  it('refuses to overwrite a different body stored under the same execution id', async () => {
    const { client, store } = memoryClient();
    const row = toPatchOutcomeReceiptRowV1(buildPatchOutcomesV1({ plan: plan(), verifiedEvidenceRefs: VERIFIED })[0]);
    await persistPatchOutcomeReceiptV1(client, row);
    store.set(row.execution_id, { manifest_checksum: h('9') });      // simulate a divergent stored body
    await expect(persistPatchOutcomeReceiptV1(client, row)).rejects.toThrow('PATCH_OUTCOME_CONFLICT');
  });
});
