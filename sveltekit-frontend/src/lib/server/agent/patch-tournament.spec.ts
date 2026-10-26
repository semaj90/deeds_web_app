import { describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('$lib/server/db/client.js', () => ({ pool: { query } }));

import {
  buildPatchTournamentPlan,
  buildPatchTournamentPlanWithVerifiedEvidence,
  resolveVerifiedEvidenceRefsFromVerifierResults,
  type PatchTournamentRequest,
} from './patch-tournament.js';
import { atlasToolRegistry } from '$lib/server/ace/atlas-tool-registry.js';

const baseRequest = {
  objective: 'fix compile error in startup path',
  workspaceId: 'workspace-1',
  workspaceRevision: '1842',
  baseBranch: 'main',
  compileError: 'TypeError: css is not a function',
};

const candidate = (
  candidateId: string,
  overrides: Partial<Parameters<typeof buildPatchTournamentPlan>[0]['candidates'][number]> = {},
) => ({
  candidateId,
  runId: `run-${candidateId}`,
  sourceRevision: 'sha256:source-revision-1',
  patchDigest: `sha256:${'a'.repeat(64)}`,
  branchName: `codex/${candidateId}`,
  worktreePath: `C:/Users/james/Videos/deeds-web-app.worktrees/${candidateId}`,
  patchSummary: `${candidateId} patch summary`,
  compileError: baseRequest.compileError,
  touchedFiles: ['src/routes/+layout.svelte'],
  staticChecks: [
    { name: 'tsc', passed: true, command: 'npx tsc --noEmit', evidenceRef: 'docs/reports/tsc.json' },
    { name: 'svelte-check', passed: true, command: 'npm run check', evidenceRef: 'docs/reports/svelte-check.json' },
  ],
  focusedTests: [
    { name: 'smoke', passed: true, command: 'npm run test:run -- smoke', evidenceRef: 'docs/reports/smoke.json' },
    { name: 'regression', passed: true, command: 'npm run test:run -- regression', evidenceRef: 'docs/reports/regression.json' },
  ],
  evidenceRefs: ['docs/reports/patched-startup.json'],
  riskSignals: [],
  ...overrides,
});
describe('patch-tournament', () => {
  it('ranks three candidates deterministically and emits ACE and Kanban receipts', () => {
    const plan = buildPatchTournamentPlan({
      ...baseRequest,
      candidates: [
        candidate('beta', {
          evidenceRefs: ['docs/reports/beta.json'],
          touchedFiles: ['src/routes/+layout.svelte', 'src/routes/+error.svelte'],
        }),
        candidate('alpha', {
          evidenceRefs: ['docs/reports/alpha.json'],
        }),
        candidate('gamma', {
          staticChecks: [{ name: 'tsc', passed: false }],
          focusedTests: [{ name: 'smoke', passed: false }],
          evidenceRefs: [],
          worktreePath: '',
          branchName: 'codex/gamma',
          touchedFiles: ['src/routes/+layout.svelte', 'src/routes/+error.svelte', 'src/lib/server/foo.ts'],
        }),
      ],
    });

    expect(plan.noAutoApply).toBe(true);
    expect(plan.noTraining).toBe(true);
    expect(plan.rankedCandidates).toHaveLength(3);
    expect(plan.rankedCandidates[0].candidateId).toBe('alpha');
    expect(plan.rankedCandidates[0].reviewStatus).toBe('review_first');
    expect(plan.rankedCandidates[1].candidateId).toBe('beta');
    expect(plan.rankedCandidates[2].candidateId).toBe('gamma');
    expect(plan.acePacket.schemaVersion).toBe('atlas.ace.patch-tournament.v1');
    expect(plan.acePacket.reviewOrder[0].patchSummary).toContain('alpha patch summary');
    expect(plan.kanbanCard.topCandidateId).toBe('alpha');
    expect(plan.kanbanCard.safeNextCommand).toContain('alpha');
    expect(atlasToolRegistry['atlas.patch.tournament'].inputSchema.safeParse({
      ...baseRequest,
      candidates: [candidate('alpha'), candidate('beta'), candidate('gamma')],
    }).success).toBe(true);
    expect(atlasToolRegistry['atlas.patch.tournament'].outputSchema.safeParse(plan).success).toBe(true);
  });

  it('requires exactly three candidates at the registry boundary', () => {
    const inputSchema = atlasToolRegistry['atlas.patch.tournament'].inputSchema;
    const parsed = inputSchema.safeParse({
      ...baseRequest,
      candidates: [candidate('alpha'), candidate('beta')],
    });

    expect(parsed.success).toBe(false);
  });

  it('requires candidate identity and rejects a compile-error mismatch', () => {
    expect(() => buildPatchTournamentPlan({
      ...baseRequest,
      candidates: [
        candidate('alpha'),
        candidate('beta', { compileError: 'different error' }),
        candidate('gamma'),
      ],
    })).toThrow('PATCH_TOURNAMENT_COMPILE_ERROR_MISMATCH');

    expect(() => buildPatchTournamentPlan({
      ...baseRequest,
      candidates: [candidate('alpha', { patchDigest: '' }), candidate('beta'), candidate('gamma')],
    })).toThrow('PATCH_TOURNAMENT_CANDIDATE_IDENTITY_INCOMPLETE');
  });

  it('derives a stable tournament identity from candidate revisions and patch digests', () => {
    const candidates: PatchTournamentRequest['candidates'] = [
      candidate('beta'),
      candidate('alpha'),
      candidate('gamma'),
    ];
    const request: PatchTournamentRequest = {
      ...baseRequest,
      candidates,
    };
    const first = buildPatchTournamentPlan(request);
    const second = buildPatchTournamentPlan({ ...request, candidates: [request.candidates[2], request.candidates[0], request.candidates[1]] });
    expect(first.tournamentId).toBe(second.tournamentId);
    expect(first.acePacket.compileErrorDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('does not score or elevate passes that lack a command and an evidence reference', () => {
    const claimed = {
      staticChecks: [{ name: 'tsc', passed: true }, { name: 'svelte-check', passed: true, command: 'npm run check' }],
      focusedTests: [{ name: 'smoke', passed: true, evidenceRef: 'docs/reports/smoke.json' }],
    };
    const plan = buildPatchTournamentPlan({
      ...baseRequest,
      candidates: [candidate('alpha'), candidate('beta', claimed), candidate('gamma', claimed)],
    });
    const byId = Object.fromEntries(plan.rankedCandidates.map((c) => [c.candidateId, c]));

    expect(plan.rankedCandidates[0].candidateId).toBe('alpha');
    expect(byId.beta.reviewStatus).toBe('blocked'); // zero verified passes: assertions alone cannot elevate
    expect(byId.beta.rationale).toContain('0/2 static checks pass the evidence-field gate');
    expect(byId.beta.rationale).toContain('3 unverified passes not scored');
    expect(byId.alpha.score).toBeGreaterThan(byId.beta.score);
  });

  it('rejects whitespace-only command or evidence references from scoring', () => {
    const claimed = {
      staticChecks: [{ name: 'tsc', passed: true, command: '   ', evidenceRef: 'docs/reports/tsc.json' }],
      focusedTests: [{ name: 'smoke', passed: true, command: 'npm run test:run', evidenceRef: '  ' }],
    };
    const plan = buildPatchTournamentPlan({
      ...baseRequest,
      candidates: [candidate('alpha'), candidate('beta', claimed), candidate('gamma', claimed)],
    });
    const beta = plan.rankedCandidates.find((item) => item.candidateId === 'beta');

    expect(beta?.reviewStatus).toBe('blocked');
    expect(beta?.rationale).toContain('2 unverified passes not scored');
    expect(plan.rankedCandidates[0].candidateId).toBe('alpha');
  });

  it('does not let candidate-level evidenceRefs inflate score or review status', () => {
    const emptyRefs = candidate('alpha', { evidenceRefs: [] });
    const manyRefs = candidate('alpha', {
      evidenceRefs: Array.from({ length: 100 }, (_, index) => `unverified:${index}`),
    });
    const emptyPlan = buildPatchTournamentPlan({
      ...baseRequest,
      candidates: [emptyRefs, candidate('beta'), candidate('gamma')],
    });
    const manyPlan = buildPatchTournamentPlan({
      ...baseRequest,
      candidates: [manyRefs, candidate('beta'), candidate('gamma')],
    });
    const empty = emptyPlan.rankedCandidates.find((item) => item.candidateId === 'alpha');
    const many = manyPlan.rankedCandidates.find((item) => item.candidateId === 'alpha');

    expect(many?.score).toBe(empty?.score);
    expect(many?.reviewStatus).toBe(empty?.reviewStatus);
    expect(many?.rationale).toContain('4 check evidence refs pass the evidence-field gate');
  });

  it('still penalises failed checks and does not penalise an unverified pass as a failure', () => {
    const failing = {
      staticChecks: [{ name: 'tsc', passed: false, command: 'npx tsc --noEmit', evidenceRef: 'docs/reports/tsc.json' }],
      focusedTests: [],
    };
    const unverified = {
      staticChecks: [{ name: 'tsc', passed: true }],
      focusedTests: [],
    };
    const plan = buildPatchTournamentPlan({
      ...baseRequest,
      candidates: [candidate('alpha'), candidate('beta', failing), candidate('gamma', unverified)],
    });
    const byId = Object.fromEntries(plan.rankedCandidates.map((c) => [c.candidateId, c]));
    expect(byId.beta.score).toBeLessThan(byId.gamma.score);
  });

  it('registers the patch tournament as read-only proposal work', () => {
    const tool = atlasToolRegistry['atlas.patch.tournament'];
    expect(tool.permission).toBe('code:propose');
  });

  it('resolves verified evidence against verification receipts and gates scores', () => {
    const verifiedRefs = new Set(['docs/reports/tsc.json', 'docs/reports/smoke.json']);

    const plan = buildPatchTournamentPlan(
      {
        ...baseRequest,
        candidates: [
          // Alpha has verified tsc and smoke
          candidate('alpha', {
            staticChecks: [
              { name: 'tsc', passed: true, command: 'npx tsc', evidenceRef: 'docs/reports/tsc.json' },
            ],
            focusedTests: [
              { name: 'smoke', passed: true, command: 'npm test', evidenceRef: 'docs/reports/smoke.json' },
            ],
          }),
          // Beta has unverified refs
          candidate('beta', {
            staticChecks: [
              { name: 'tsc', passed: true, command: 'npx tsc', evidenceRef: 'docs/reports/unverified-tsc.json' },
            ],
            focusedTests: [
              { name: 'smoke', passed: true, command: 'npm test', evidenceRef: 'docs/reports/unverified-smoke.json' },
            ],
          }),
          candidate('gamma', {
            staticChecks: [{ name: 'tsc', passed: false }],
            focusedTests: [{ name: 'smoke', passed: false }],
            evidenceRefs: [],
          }),
        ],
      },
      { verifiedEvidenceRefs: verifiedRefs }
    );

    const alpha = plan.rankedCandidates.find((c) => c.candidateId === 'alpha')!;
    const beta = plan.rankedCandidates.find((c) => c.candidateId === 'beta')!;

    expect(alpha.reviewStatus).toBe('review_first');
    expect(alpha.rationale).toContain('verified against receipt database');
    expect(beta.reviewStatus).toBe('blocked');
    expect(beta.rationale).toContain('2 unverified passes not scored (unverified evidence)');
    expect(alpha.score).toBeGreaterThan(beta.score);
  });

  it('resolves only independent, digest-matched verifier verdicts', async () => {
    const mockPool = {
      query: async (sql: string, params?: unknown[]) => {
        expect(sql).toContain('atlas_receipt_verifier_results_v1');
        expect(sql).toContain('atlas_test_execution_receipts');
        expect(sql).toContain("v.verification_status = 'VERIFIED_PASS'");
        expect(sql).toContain('v.evidence_resolved = true');
        expect(sql).toContain('v.canonical = false');
        expect(sql).toContain('v.computed_digest =');
        expect(sql).not.toContain('FROM atlas_receipt_verification_v1');
        const refs = (params as [string[]])[0];
        return {
          rows: refs.includes('receipt-123')
            ? [{ execution_receipt_id: 'receipt-123', report_checksum: 'abc456', source_ref: 'src/lib/foo.ts' }]
            : [],
        };
      },
    };

    const verified = await resolveVerifiedEvidenceRefsFromVerifierResults(mockPool, ['receipt-123', 'unverified-ref']);
    expect(verified.has('receipt-123')).toBe(true);
    expect(verified.has('abc456')).toBe(true);
    expect(verified.has('sha256:abc456')).toBe(true);
    expect(verified.has('src/lib/foo.ts')).toBe(true);
    expect(verified.has('unverified-ref')).toBe(false);
  });

  it('does not score tournament passes whose refs lack independent verifier readback', async () => {
    const mockPool = {
      query: async () => ({
        rows: [{
          execution_receipt_id: 'receipt-alpha',
          report_checksum: 'abc456',
          source_ref: 'docs/reports/verified.json',
        }],
      }),
    };
    const alpha = candidate('alpha', {
      staticChecks: [{ name: 'typecheck', passed: true, command: 'npm run check', evidenceRef: 'docs/reports/verified.json' }],
      focusedTests: [],
    });
    const beta = candidate('beta', {
      staticChecks: [{ name: 'typecheck', passed: true, command: 'npm run check', evidenceRef: 'docs/reports/fabricated.json' }],
      focusedTests: [],
    });
    const gamma = candidate('gamma', {
      staticChecks: [{ name: 'typecheck', passed: false }],
      focusedTests: [],
      evidenceRefs: [],
    });

    const plan = await buildPatchTournamentPlanWithVerifiedEvidence(mockPool, {
      ...baseRequest,
      candidates: [alpha, beta, gamma],
    });
    const ranked = Object.fromEntries(plan.rankedCandidates.map((row) => [row.candidateId, row]));

    expect(ranked.alpha?.reviewStatus).toBe('review_later');
    expect(ranked.beta?.reviewStatus).toBe('blocked');
    expect(ranked.beta?.rationale).toContain('1 unverified passes not scored (unverified evidence)');
  });

  it('loads independent verifier evidence through the registered tournament tool', async () => {
    query.mockResolvedValue({ rows: [] });
    const input = {
      ...baseRequest,
      candidates: [candidate('alpha'), candidate('beta'), candidate('gamma')],
    } as never;

    const result = await atlasToolRegistry['atlas.patch.tournament'].execute(input, {} as never);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain('atlas_receipt_verifier_results_v1');
    expect(result.rankedCandidates.every((row) => row.reviewStatus === 'blocked')).toBe(true);
  });
});

describe('patch-tournament review status for failed checks (real-error run regression)', () => {
  const plan = (overrides: Parameters<typeof candidate>[1]) => buildPatchTournamentPlan({
    ...baseRequest,
    candidates: [candidate('alpha'), candidate('beta', overrides), candidate('gamma')],
  }).rankedCandidates.find((row) => row.candidateId === 'beta')!;

  it('blocks a candidate whose static check failed even when its other checks passed', () => {
    // mirrors the real run: apply passed and the scope test passed, but tsc still failed
    const row = plan({
      staticChecks: [
        { name: 'apply edits', passed: true, command: 'apply-edits', evidenceRef: 'real:beta:apply' },
        { name: 'tsc --strict clean', passed: false, command: 'node tsc.js -p tsconfig.json --noEmit', evidenceRef: 'real:beta:tsc' },
      ],
      focusedTests: [{ name: 'scope', passed: true, command: 'git diff --numstat HEAD', evidenceRef: 'real:beta:scope' }],
    });
    expect(row.reviewStatus).toBe('blocked');
  });

  it('caps a candidate with a failed focused test (all static checks passing) at review_later', () => {
    const row = plan({
      focusedTests: [
        { name: 'smoke', passed: true, command: 'npm run test:run -- smoke', evidenceRef: 'docs/reports/smoke.json' },
        { name: 'regression', passed: false, command: 'npm run test:run -- regression', evidenceRef: 'docs/reports/regression.json' },
      ],
    });
    expect(row.reviewStatus).toBe('review_later');
  });

  it('still marks a fully passing, evidenced candidate review_first, and an all-failing one blocked', () => {
    expect(plan({}).reviewStatus).toBe('review_first');
    expect(plan({ staticChecks: [{ name: 'tsc', passed: false }], focusedTests: [{ name: 'smoke', passed: false }] }).reviewStatus).toBe('blocked');
  });

  it('keeps ranking order driven by score, independent of the new status rule', () => {
    const ranked = buildPatchTournamentPlan({
      ...baseRequest,
      candidates: [
        candidate('failing-static', { staticChecks: [{ name: 'apply', passed: true, command: 'x', evidenceRef: 'r1' }, { name: 'tsc', passed: false, command: 'y', evidenceRef: 'r2' }] }),
        candidate('good'),
        candidate('all-failed', { staticChecks: [{ name: 'tsc', passed: false }], focusedTests: [{ name: 'smoke', passed: false }] }),
      ],
    }).rankedCandidates;
    expect(ranked.map((r) => r.candidateId)).toEqual(['good', 'failing-static', 'all-failed']);
    expect(ranked.map((r) => r.reviewStatus)).toEqual(['review_first', 'blocked', 'blocked']);
  });
});

