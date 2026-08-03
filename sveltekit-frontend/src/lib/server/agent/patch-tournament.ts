import { createHash, randomUUID } from 'node:crypto';

export interface PatchTournamentCheck {
  name: string;
  passed: boolean;
  command?: string;
  evidenceRef?: string;
}

export interface PatchTournamentCandidateInput {
  candidateId: string;
  branchName: string;
  worktreePath: string;
  patchSummary: string;
  compileError: string;
  touchedFiles: string[];
  staticChecks: PatchTournamentCheck[];
  focusedTests: PatchTournamentCheck[];
  evidenceRefs: string[];
  riskSignals?: string[];
}

export interface PatchTournamentRequest {
  objective: string;
  workspaceId: string;
  workspaceRevision: string;
  baseBranch: string;
  compileError: string;
  candidates: [
    PatchTournamentCandidateInput,
    PatchTournamentCandidateInput,
    PatchTournamentCandidateInput,
  ];
}

export interface RankedPatchTournamentCandidate extends PatchTournamentCandidateInput {
  rank: number;
  score: number;
  reviewStatus: 'review_first' | 'review_later' | 'blocked';
  rationale: string;
}

export interface PatchTournamentPlan {
  tournamentId: string;
  objective: string;
  workspaceId: string;
  workspaceRevision: string;
  baseBranch: string;
  compileError: string;
  rankedCandidates: RankedPatchTournamentCandidate[];
  acePacket: {
    schemaVersion: 'atlas.ace.patch-tournament.v1';
    packetId: string;
    objective: string;
    workspaceRevision: string;
    compileErrorDigest: string;
    reviewOrder: Array<{
      candidateId: string;
      rank: number;
      score: number;
      reviewStatus: RankedPatchTournamentCandidate['reviewStatus'];
      rationale: string;
      worktreePath: string;
      branchName: string;
      evidenceRefs: string[];
    }>;
    constraints: string[];
  };
  kanbanCard: {
    cardId: string;
    title: string;
    status: 'ready_for_human_review' | 'needs_more_evidence';
    summary: string;
    topCandidateId: string | null;
    safeNextCommand: string;
  };
  noAutoApply: true;
  noTraining: true;
  safeNextCommand: string;
}

function countPassed(checks: PatchTournamentCheck[]): number {
  return checks.reduce((total, check) => total + (check.passed ? 1 : 0), 0);
}

function stableDigest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function scoreCandidate(candidate: PatchTournamentCandidateInput): RankedPatchTournamentCandidate {
  const staticPassed = countPassed(candidate.staticChecks);
  const staticFailed = candidate.staticChecks.length - staticPassed;
  const testsPassed = countPassed(candidate.focusedTests);
  const testsFailed = candidate.focusedTests.length - testsPassed;
  const evidenceCount = candidate.evidenceRefs.filter(Boolean).length;
  const worktreeBonus = candidate.worktreePath.trim() ? 8 : 0;
  const branchBonus = candidate.branchName.trim() ? 4 : 0;
  const isolationBonus = candidate.worktreePath.trim() ? 6 : 0;
  const riskPenalty = (candidate.riskSignals?.length ?? 0) * 6;
  const filePenalty = candidate.touchedFiles.length * 2;
  const failurePenalty = staticFailed * 8 + testsFailed * 10;

  const score =
    staticPassed * 25 +
    testsPassed * 35 +
    evidenceCount * 5 +
    worktreeBonus +
    branchBonus +
    isolationBonus -
    riskPenalty -
    filePenalty -
    failurePenalty;

  let reviewStatus: RankedPatchTournamentCandidate['reviewStatus'] = 'review_later';
  if (staticPassed === 0 && testsPassed === 0) reviewStatus = 'blocked';
  else if (staticPassed > 0 && testsPassed > 0 && evidenceCount > 0) reviewStatus = 'review_first';

  const rationaleParts = [
    `${staticPassed}/${candidate.staticChecks.length} static checks passed`,
    `${testsPassed}/${candidate.focusedTests.length} focused tests passed`,
    `${evidenceCount} evidence refs`,
    candidate.worktreePath.trim() ? 'isolated worktree provided' : 'no isolated worktree',
  ];
  if (candidate.riskSignals?.length) rationaleParts.push(`${candidate.riskSignals.length} risk signals`);

  return {
    ...candidate,
    rank: 0,
    score,
    reviewStatus,
    rationale: rationaleParts.join('; '),
  };
}

function compareRanked(a: RankedPatchTournamentCandidate, b: RankedPatchTournamentCandidate): number {
  if (b.score !== a.score) return b.score - a.score;

  const aStatic = countPassed(a.staticChecks);
  const bStatic = countPassed(b.staticChecks);
  if (bStatic !== aStatic) return bStatic - aStatic;

  const aTests = countPassed(a.focusedTests);
  const bTests = countPassed(b.focusedTests);
  if (bTests !== aTests) return bTests - aTests;

  const aEvidence = a.evidenceRefs.filter(Boolean).length;
  const bEvidence = b.evidenceRefs.filter(Boolean).length;
  if (bEvidence !== aEvidence) return bEvidence - aEvidence;

  if (a.touchedFiles.length !== b.touchedFiles.length) return a.touchedFiles.length - b.touchedFiles.length;
  return a.candidateId.localeCompare(b.candidateId);
}

export function buildPatchTournamentPlan(request: PatchTournamentRequest): PatchTournamentPlan {
  const ranked = request.candidates.map(scoreCandidate).sort(compareRanked);
  const normalized = ranked.map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
  }));

  const topCandidate = normalized[0] ?? null;
  const packetId = randomUUID();
  const compileErrorDigest = stableDigest(request.compileError);
  const safeNextCommand = topCandidate
    ? `review ${topCandidate.candidateId} in ${topCandidate.worktreePath}`
    : 'review tournament candidates in isolated worktrees';

  return {
    tournamentId: packetId,
    objective: request.objective,
    workspaceId: request.workspaceId,
    workspaceRevision: request.workspaceRevision,
    baseBranch: request.baseBranch,
    compileError: request.compileError,
    rankedCandidates: normalized,
    acePacket: {
      schemaVersion: 'atlas.ace.patch-tournament.v1',
      packetId,
      objective: request.objective,
      workspaceRevision: request.workspaceRevision,
      compileErrorDigest,
      reviewOrder: normalized.map((candidate) => ({
        candidateId: candidate.candidateId,
        rank: candidate.rank,
        score: candidate.score,
        reviewStatus: candidate.reviewStatus,
        rationale: candidate.rationale,
        patchSummary: candidate.patchSummary,
        worktreePath: candidate.worktreePath,
        branchName: candidate.branchName,
        evidenceRefs: candidate.evidenceRefs.slice(0, 20),
      })),
      constraints: [
        'three candidates only',
        'isolated worktrees required',
        'static checks and focused tests before ranking',
        'deterministic ranking only',
        'no auto-apply',
        'no training',
      ],
    },
    kanbanCard: {
      cardId: packetId,
      title: `Patch tournament: ${request.objective}`,
      status: topCandidate ? 'ready_for_human_review' : 'needs_more_evidence',
      summary: topCandidate
        ? `Top review candidate is ${topCandidate.candidateId} with score ${topCandidate.score}. ${topCandidate.patchSummary}`
        : 'No candidate met the review threshold.',
      topCandidateId: topCandidate?.candidateId ?? null,
      safeNextCommand,
    },
    noAutoApply: true,
    noTraining: true,
    safeNextCommand,
  };
}
