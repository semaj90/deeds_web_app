import { createHash } from 'node:crypto';

export interface PatchTournamentCheck {
  name: string;
  passed: boolean;
  command?: string;
  evidenceRef?: string;
}

export interface PatchTournamentCandidateInput {
  candidateId: string;
  runId: string;
  sourceRevision: string;
  patchDigest: string;
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
      patchSummary: string;
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

export interface PatchTournamentResolutionContext {
  /**
   * Set or list of verified evidence references from database verification
   * from the independent atlas_receipt_verifier_results_v1 table.
   */
  verifiedEvidenceRefs?: Set<string> | readonly string[];
  /**
   * Custom evidence verification predicate.
   */
  evidenceResolver?: (evidenceRef: string, check: PatchTournamentCheck) => boolean;
}

/**
 * Resolves evidence references only when the independent verifier table and the
 * canonical test receipt agree. The relabel view is not an independent verdict.
 * Accepts a pg pool or client. Zero mutations performed (strictly read-only).
 */
export async function resolveVerifiedEvidenceRefsFromVerifierResults(
  pgClientOrPool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  candidateRefs: string[]
): Promise<Set<string>> {
  if (candidateRefs.length === 0) return new Set();
  const sql = `
    SELECT DISTINCT r.execution_receipt_id, r.report_checksum, r.source_ref
    FROM atlas_test_execution_receipts r
    JOIN atlas_receipt_verifier_results_v1 v
      ON v.execution_receipt_id = r.execution_receipt_id
    WHERE v.verification_status = 'VERIFIED_PASS'
      AND v.evidence_resolved = true
      AND v.canonical = false
      AND v.computed_digest = ('sha256:' || r.report_checksum)
      AND r.status = 'passed'
      AND (r.failure_messages IS NULL OR r.failure_messages = '[]'::jsonb)
      AND (
        r.execution_receipt_id = ANY($1::text[])
        OR ('sha256:' || r.report_checksum) = ANY($1::text[])
        OR r.report_checksum = ANY($1::text[])
        OR r.source_ref = ANY($1::text[])
      )
  `;
  const result = await pgClientOrPool.query(sql, [candidateRefs]);
  const verified = new Set<string>();
  for (const row of result.rows as Array<{ execution_receipt_id?: string; report_checksum?: string; source_ref?: string }>) {
    if (row.execution_receipt_id) verified.add(row.execution_receipt_id);
    if (row.report_checksum) {
      verified.add(row.report_checksum);
      verified.add(`sha256:${row.report_checksum}`);
    }
    if (row.source_ref) verified.add(row.source_ref);
  }
  return verified;
}

export async function buildPatchTournamentPlanWithVerifiedEvidence(
  pgClientOrPool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  request: PatchTournamentRequest,
): Promise<PatchTournamentPlan> {
  const candidateRefs = request.candidates.flatMap((candidate) =>
    [...candidate.staticChecks, ...candidate.focusedTests]
      .map((check) => check.evidenceRef?.trim())
      .filter((ref): ref is string => Boolean(ref)),
  );
  const verifiedEvidenceRefs = await resolveVerifiedEvidenceRefsFromVerifierResults(pgClientOrPool, candidateRefs);
  return buildPatchTournamentPlan(request, { verifiedEvidenceRefs });
}

/**
 * A pass is only eligible for scoring when it names a command and an evidence reference.
 * When resolutionContext is provided, the reference must resolve to a verified record.
 */
export function hasRequiredPassEvidence(
  check: PatchTournamentCheck,
  resolutionContext?: PatchTournamentResolutionContext
): boolean {
  if (!check.passed || !check.command?.trim() || !check.evidenceRef?.trim()) {
    return false;
  }
  const ref = check.evidenceRef.trim();
  if (resolutionContext?.evidenceResolver) {
    return resolutionContext.evidenceResolver(ref, check);
  }
  if (resolutionContext?.verifiedEvidenceRefs) {
    const verifiedSet = resolutionContext.verifiedEvidenceRefs instanceof Set
      ? resolutionContext.verifiedEvidenceRefs
      : new Set(resolutionContext.verifiedEvidenceRefs);
    return verifiedSet.has(ref);
  }
  return true;
}

function countPassed(checks: PatchTournamentCheck[], resolutionContext?: PatchTournamentResolutionContext): number {
  return checks.reduce((total, check) => total + (hasRequiredPassEvidence(check, resolutionContext) ? 1 : 0), 0);
}

function countUnverifiedPassed(checks: PatchTournamentCheck[], resolutionContext?: PatchTournamentResolutionContext): number {
  return checks.reduce((total, check) => total + (check.passed && !hasRequiredPassEvidence(check, resolutionContext) ? 1 : 0), 0);
}

function countFailed(checks: PatchTournamentCheck[]): number {
  return checks.reduce((total, check) => total + (check.passed ? 0 : 1), 0);
}

function countCheckEvidenceRefs(checks: PatchTournamentCheck[], resolutionContext?: PatchTournamentResolutionContext): number {
  return new Set(
    checks
      .filter((check) => hasRequiredPassEvidence(check, resolutionContext))
      .map((check) => check.evidenceRef!.trim()),
  ).size;
}

function stableDigest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function validateRequest(request: PatchTournamentRequest): void {
  if (request.candidates.length !== 3) throw new Error('PATCH_TOURNAMENT_REQUIRES_EXACTLY_THREE_CANDIDATES');
  const candidateIds = new Set(request.candidates.map((candidate) => candidate.candidateId));
  if (candidateIds.size !== request.candidates.length) throw new Error('PATCH_TOURNAMENT_DUPLICATE_CANDIDATE_ID');
  for (const candidate of request.candidates) {
    if (!candidate.runId.trim() || !candidate.sourceRevision.trim() || !candidate.patchDigest.trim()) {
      throw new Error('PATCH_TOURNAMENT_CANDIDATE_IDENTITY_INCOMPLETE');
    }
    if (candidate.compileError !== request.compileError) {
      throw new Error('PATCH_TOURNAMENT_COMPILE_ERROR_MISMATCH');
    }
  }
}

function scoreCandidate(
  candidate: PatchTournamentCandidateInput,
  resolutionContext?: PatchTournamentResolutionContext
): RankedPatchTournamentCandidate {
  const staticPassed = countPassed(candidate.staticChecks, resolutionContext);
  const staticFailed = countFailed(candidate.staticChecks);
  const testsPassed = countPassed(candidate.focusedTests, resolutionContext);
  const testsFailed = countFailed(candidate.focusedTests);
  const unverifiedPassed =
    countUnverifiedPassed(candidate.staticChecks, resolutionContext) +
    countUnverifiedPassed(candidate.focusedTests, resolutionContext);
  const evidenceCount = countCheckEvidenceRefs(
    [...candidate.staticChecks, ...candidate.focusedTests],
    resolutionContext
  );
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

  // A patch that fails any static check (apply / compile / type check) is never presented as "review first", even if other
  // checks passed: it is blocked. A failed focused test (with all static checks passing) caps it at review_later.
  let reviewStatus: RankedPatchTournamentCandidate['reviewStatus'] = 'review_later';
  if (staticPassed === 0 && testsPassed === 0) reviewStatus = 'blocked';
  else if (staticFailed > 0) reviewStatus = 'blocked';
  else if (testsFailed > 0) reviewStatus = 'review_later';
  else if (staticPassed > 0 && testsPassed > 0 && evidenceCount > 0) reviewStatus = 'review_first';

  const isIndependentlyVerified = Boolean(
    resolutionContext?.verifiedEvidenceRefs || resolutionContext?.evidenceResolver
  );
  const evidenceDescriptor = isIndependentlyVerified
    ? `${evidenceCount} check evidence refs verified against receipt database`
    : `${evidenceCount} check evidence refs pass the evidence-field gate (not independently verified)`;

  const rationaleParts = [
    `${staticPassed}/${candidate.staticChecks.length} static checks pass the evidence-field gate`,
    `${testsPassed}/${candidate.focusedTests.length} focused tests pass the evidence-field gate`,
    evidenceDescriptor,
    candidate.worktreePath.trim() ? 'isolated worktree provided' : 'no isolated worktree',
  ];
  if (unverifiedPassed > 0) {
    rationaleParts.push(
      `${unverifiedPassed} unverified passes not scored (${isIndependentlyVerified ? 'unverified evidence' : 'missing command or evidenceRef'})`
    );
  }
  if (candidate.riskSignals?.length) rationaleParts.push(`${candidate.riskSignals.length} risk signals`);

  return {
    ...candidate,
    rank: 0,
    score,
    reviewStatus,
    rationale: rationaleParts.join('; '),
  };
}

function compareRanked(
  a: RankedPatchTournamentCandidate,
  b: RankedPatchTournamentCandidate,
  resolutionContext?: PatchTournamentResolutionContext
): number {
  if (b.score !== a.score) return b.score - a.score;

  const aStatic = countPassed(a.staticChecks, resolutionContext);
  const bStatic = countPassed(b.staticChecks, resolutionContext);
  if (bStatic !== aStatic) return bStatic - aStatic;

  const aTests = countPassed(a.focusedTests, resolutionContext);
  const bTests = countPassed(b.focusedTests, resolutionContext);
  if (bTests !== aTests) return bTests - aTests;

  const aEvidence = a.evidenceRefs.filter(Boolean).length;
  const bEvidence = b.evidenceRefs.filter(Boolean).length;
  if (bEvidence !== aEvidence) return bEvidence - aEvidence;

  if (a.touchedFiles.length !== b.touchedFiles.length) return a.touchedFiles.length - b.touchedFiles.length;
  return a.candidateId.localeCompare(b.candidateId);
}

export function buildPatchTournamentPlan(
  request: PatchTournamentRequest,
  resolutionContext?: PatchTournamentResolutionContext
): PatchTournamentPlan {
  validateRequest(request);
  const ranked = request.candidates
    .map((candidate) => scoreCandidate(candidate, resolutionContext))
    .sort((a, b) => compareRanked(a, b, resolutionContext));
  const normalized = ranked.map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
  }));

  const topCandidate = normalized[0] ?? null;
  const tournamentIdentity = JSON.stringify({
    objective: request.objective,
    workspaceId: request.workspaceId,
    workspaceRevision: request.workspaceRevision,
    baseBranch: request.baseBranch,
    compileError: request.compileError,
    candidates: request.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      runId: candidate.runId,
      sourceRevision: candidate.sourceRevision,
      patchDigest: candidate.patchDigest,
    })).sort((a, b) => a.candidateId.localeCompare(b.candidateId)),
  });
  const packetId = `tournament:${stableDigest(tournamentIdentity)}`;
  const compileErrorDigest = `sha256:${stableDigest(request.compileError)}`;
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
