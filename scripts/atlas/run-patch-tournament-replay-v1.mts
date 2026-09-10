#!/usr/bin/env node

/** Bounded, read-only replay of the existing PatchTournament planner. */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPatchTournamentPlan } from '../../sveltekit-frontend/src/lib/server/agent/patch-tournament.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = resolve(ROOT, 'docs/reports/patch-tournament-replay-v1.json');
const fixtureRevision = 'fixture-only-unbound-workspace-revision';
const fixture = {
  objective: 'bounded replay fixture', workspaceId: 'fixture-workspace', workspaceRevision: fixtureRevision,
  baseBranch: 'fixture-base', compileError: 'fixture compile error',
  candidates: [
    { candidateId: 'candidate-a', branchName: 'fixture/a', worktreePath: 'fixture/a', patchSummary: 'minimal repair', compileError: 'fixture compile error', touchedFiles: ['fixture.ts'], staticChecks: [{ name: 'syntax', passed: true }], focusedTests: [{ name: 'fixture', passed: true }], evidenceRefs: ['fixture:evidence:a'], riskSignals: [] },
    { candidateId: 'candidate-b', branchName: 'fixture/b', worktreePath: 'fixture/b', patchSummary: 'broader repair', compileError: 'fixture compile error', touchedFiles: ['fixture.ts', 'other.ts'], staticChecks: [{ name: 'syntax', passed: true }], focusedTests: [{ name: 'fixture', passed: true }], evidenceRefs: ['fixture:evidence:b'], riskSignals: ['broader-scope'] },
    { candidateId: 'candidate-c', branchName: 'fixture/c', worktreePath: 'fixture/c', patchSummary: 'failing repair', compileError: 'fixture compile error', touchedFiles: ['fixture.ts'], staticChecks: [{ name: 'syntax', passed: false }], focusedTests: [{ name: 'fixture', passed: false }], evidenceRefs: [], riskSignals: [] },
  ],
} as const;
const canonicalize = (plan: any) => ({
  objective: plan.objective, workspaceId: plan.workspaceId, workspaceRevision: plan.workspaceRevision,
  rankedCandidates: plan.rankedCandidates.map((candidate: any) => ({ candidateId: candidate.candidateId, rank: candidate.rank, score: candidate.score, reviewStatus: candidate.reviewStatus, rationale: candidate.rationale })),
  ace: { schemaVersion: plan.acePacket.schemaVersion, objective: plan.acePacket.objective, workspaceRevision: plan.acePacket.workspaceRevision, compileErrorDigest: plan.acePacket.compileErrorDigest, reviewOrder: plan.acePacket.reviewOrder.map((item: any) => ({ candidateId: item.candidateId, rank: item.rank, score: item.score, reviewStatus: item.reviewStatus, rationale: item.rationale })) },
  constraints: plan.acePacket.constraints, noAutoApply: plan.noAutoApply, noTraining: plan.noTraining,
});
const first = buildPatchTournamentPlan(fixture as any);
const second = buildPatchTournamentPlan(fixture as any);
const firstCanonical = canonicalize(first);
const secondCanonical = canonicalize(second);
const firstChecksum = createHash('sha256').update(JSON.stringify(firstCanonical)).digest('hex');
const secondChecksum = createHash('sha256').update(JSON.stringify(secondCanonical)).digest('hex');
const report = {
  schema: 'atlas.patch-tournament-replay.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY_FIXTURE_REPLAY',
  status: firstChecksum === secondChecksum ? 'TOURNAMENT_REPLAY_PROVEN_FIXTURE_ONLY' : 'TOURNAMENT_REPLAY_NONDETERMINISTIC',
  proofLevel: firstChecksum === secondChecksum ? 'FIXTURE_PROVEN' : 'BLOCKED', authority: false,
  workspaceRevision: null, fixtureWorkspaceRevision: fixtureRevision,
  writesPerformed: false, autoApply: false, training: false,
  candidateCount: fixture.candidates.length, firstChecksum: `sha256:${firstChecksum}`, secondChecksum: `sha256:${secondChecksum}`,
  rankedCandidateIds: first.rankedCandidates.map((candidate) => candidate.candidateId), acePacketSchema: first.acePacket.schemaVersion,
  nextGate: 'TOUR9_INTEGRATION_VALIDATION', safeNextCommand: 'npm run atlas:tournament:replay',
};
await mkdir(dirname(REPORT), { recursive: true });
await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, proofLevel: report.proofLevel, authority: false, workspaceRevision: null, candidateCount: report.candidateCount, replayEqual: firstChecksum === secondChecksum, reportPath: REPORT }, null, 2));
if (firstChecksum !== secondChecksum) process.exitCode = 3;
