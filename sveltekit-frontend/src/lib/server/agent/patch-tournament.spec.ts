import { describe, expect, it } from 'vitest';

import { buildPatchTournamentPlan } from './patch-tournament.js';
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
  branchName: `codex/${candidateId}`,
  worktreePath: `C:/Users/james/Videos/deeds-web-app.worktrees/${candidateId}`,
  patchSummary: `${candidateId} patch summary`,
  compileError: baseRequest.compileError,
  touchedFiles: ['src/routes/+layout.svelte'],
  staticChecks: [
    { name: 'tsc', passed: true },
    { name: 'svelte-check', passed: true },
  ],
  focusedTests: [
    { name: 'smoke', passed: true },
    { name: 'regression', passed: true },
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
  });

  it('requires exactly three candidates at the registry boundary', () => {
    const inputSchema = atlasToolRegistry['atlas.patch.tournament'].inputSchema;
    const parsed = inputSchema.safeParse({
      ...baseRequest,
      candidates: [candidate('alpha'), candidate('beta')],
    });

    expect(parsed.success).toBe(false);
  });

  it('registers the patch tournament as read-only proposal work', () => {
    const tool = atlasToolRegistry['atlas.patch.tournament'];
    expect(tool.permission).toBe('code:propose');
    expect(tool.humanApproval).toBeUndefined();
  });
});
