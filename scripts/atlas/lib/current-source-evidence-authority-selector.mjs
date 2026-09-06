/**
 * Pure selection logic for SOURCE-EVIDENCE-AUTHORITY-01.
 *
 * A Graphify run may become the current source evidence authority ONLY if
 * ALL of the following hold:
 *   - runStatus === 'COMPLETED' (terminal; RUNNING never outranks a
 *     completed run merely because it is newer)
 *   - bindingStatus === 'BOUND' (has file rows)
 *   - run.workspaceId === current workspaceId (exact, no tolerance -- a
 *     wrong workspace is never "close enough")
 *   - run.workspaceRevision === current workspaceRevision, OR the run
 *     completed within `toleranceMs` of `nowMs` (TOLERANCE_WINDOW match --
 *     see below; default toleranceMs is 0, which reproduces exact-match-only
 *     behavior with zero change)
 *   - run.sourceManifestDigest === current sourceManifestDigest under the
 *     same exact-or-tolerance rule as workspaceRevision
 *
 * TOLERANCE WINDOW (added 2026-09-05, per
 * parent-atlas-retrieval-lineage-dag-convergence/tasks.md's
 * PKT-LINEAGE-08B0 concurrency finding, operator-approved): this repo's live
 * workspace is under real, continuous concurrent edit by other sessions/
 * processes (confirmed via `git status` -- dozens of unrelated in-flight
 * OpenSpec changes, several dirty submodules), so requiring the run's
 * captured revision to exactly equal the check's own freshly-recomputed
 * revision essentially never converges by chance, no matter how fast the
 * write path is. A COMPLETED+BOUND run whose `completed_at` is within
 * `toleranceMs` of `nowMs` is treated as `TOLERANCE_WINDOW` eligible instead
 * of failing closed on STALE_WORKSPACE_REVISION/SOURCE_MANIFEST_DIGEST_MISMATCH.
 * This is a recency approximation, not an identity claim -- every accepted
 * run carries an explicit `matchType` (`EXACT` or `TOLERANCE_WINDOW`) and
 * `ageMsAtCheck` in its classification so callers can see which kind of
 * match they got and decide whether that's good enough for their use case.
 * An EXACT match is always preferred over a TOLERANCE_WINDOW one when both
 * exist (see selectCurrentSourceRun).
 *
 * If zero runs satisfy all of the above: NO_CURRENT_COMPLETED_BOUND_SOURCE_OWNER.
 * If more than one run satisfies all of the above (within the same match
 * tier): AMBIGUOUS_CURRENT_SOURCE_OWNER (fail closed -- never pick "latest
 * by timestamp", even under the tolerance window).
 * Only a single eligible run may proceed to source-population validation.
 */

/**
 * @param {{run_id:string, workspace_id:string, status:string, workspace_revision:string|null, source_manifest_digest:string|null, file_row_count:number, completed_at?:string|null}} run
 * @param {{workspaceId:string, workspaceRevision:string, sourceManifestDigest:string}} current
 * @param {{toleranceMs?:number, nowMs?:number}} [options]
 */
export function classifyRun(run, current, options = {}) {
  const toleranceMs = Number.isFinite(options.toleranceMs) ? Math.max(0, options.toleranceMs) : 0;
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();

  const runStatus = run.status;
  const bindingStatus = run.file_row_count > 0 ? 'BOUND' : 'UNBOUND';
  const reasons = [];
  let matchType = null;
  let ageMsAtCheck = null;

  if (runStatus === 'RUNNING') {
    reasons.push('RUNNING_NEVER_SOURCE_AUTHORITY');
  } else if (runStatus !== 'COMPLETED') {
    reasons.push('NON_TERMINAL_STATUS');
  }
  if (bindingStatus !== 'BOUND') {
    reasons.push('UNBOUND_NEVER_SOURCE_AUTHORITY');
  }
  if (run.workspace_id !== current.workspaceId) {
    reasons.push('WORKSPACE_ID_MISMATCH');
  }

  const revisionExact = run.workspace_revision === current.workspaceRevision;
  const digestExact = run.source_manifest_digest === current.sourceManifestDigest;

  if (revisionExact && digestExact) {
    matchType = 'EXACT';
  } else {
    const completedAtMs = run.completed_at ? Date.parse(run.completed_at) : NaN;
    ageMsAtCheck = Number.isFinite(completedAtMs) ? nowMs - completedAtMs : null;
    const withinTolerance =
      toleranceMs > 0 &&
      runStatus === 'COMPLETED' &&
      ageMsAtCheck !== null &&
      ageMsAtCheck >= 0 &&
      ageMsAtCheck <= toleranceMs;
    if (withinTolerance) {
      matchType = 'TOLERANCE_WINDOW';
    } else {
      if (!revisionExact) reasons.push('STALE_WORKSPACE_REVISION');
      if (!digestExact) reasons.push('SOURCE_MANIFEST_DIGEST_MISMATCH');
    }
  }

  if (ageMsAtCheck === null && run.completed_at) {
    const completedAtMs = Date.parse(run.completed_at);
    if (Number.isFinite(completedAtMs)) ageMsAtCheck = nowMs - completedAtMs;
  }

  return {
    runId: run.run_id,
    runStatus,
    bindingStatus,
    reasons,
    eligible: reasons.length === 0,
    matchType: reasons.length === 0 ? matchType : null,
    ageMsAtCheck,
  };
}

/**
 * @param {Array} runs
 * @param {{workspaceId:string, workspaceRevision:string, sourceManifestDigest:string}} current
 * @param {{toleranceMs?:number, nowMs?:number}} [options]
 */
export function selectCurrentSourceRun(runs, current, options = {}) {
  const classified = runs.map((run) => classifyRun(run, current, options));
  const eligible = classified.filter((row) => row.eligible);
  if (eligible.length === 0) {
    return { status: 'NO_CURRENT_COMPLETED_BOUND_SOURCE_OWNER', selectedRunId: null, ambiguityCount: 0, classified };
  }
  // An EXACT match always outranks a TOLERANCE_WINDOW one -- never let a
  // recency approximation shadow a genuinely exact-current run.
  const exactEligible = eligible.filter((row) => row.matchType === 'EXACT');
  const pool = exactEligible.length > 0 ? exactEligible : eligible;
  if (pool.length > 1) {
    return { status: 'AMBIGUOUS_CURRENT_SOURCE_OWNER', selectedRunId: null, ambiguityCount: pool.length, classified };
  }
  return { status: 'CANDIDATE_SELECTED', selectedRunId: pool[0].runId, ambiguityCount: 0, classified, matchType: pool[0].matchType };
}

const WELL_FORMED_REVISION = /^sha256:[a-f0-9]{64}$/;

/**
 * Validate a candidate run's source population. Fails closed: an empty
 * population, a missing sourceRevision, a synthetic/malformed revision, or a
 * duplicate sourceRef all disqualify the run -- they do not downgrade to a
 * "best effort" population.
 *
 * @param {Array<{source_ref:string, source_revision:string|null, content_hash:string|null}>} fileRows
 */
export function validateSourcePopulation(fileRows) {
  const seenRefs = new Set();
  const sources = [];
  let missingSourceRevisionCount = 0;
  let syntheticRevisionCount = 0;
  let duplicateSourceRefCount = 0;

  for (const row of fileRows) {
    const sourceRef = String(row.source_ref ?? '').trim();
    const sourceRevision = row.source_revision ?? null;
    if (!sourceRef) continue;
    if (!sourceRevision) {
      missingSourceRevisionCount += 1;
      continue;
    }
    const wellFormed = WELL_FORMED_REVISION.test(sourceRevision);
    const contentHashHex = row.content_hash ? String(row.content_hash).toLowerCase().replace(/^sha256:/, '') : null;
    const revisionHex = sourceRevision.replace(/^sha256:/, '').toLowerCase();
    const matchesContentHash = !contentHashHex || contentHashHex === revisionHex;
    if (!wellFormed || !matchesContentHash) {
      syntheticRevisionCount += 1;
      continue;
    }
    if (seenRefs.has(sourceRef)) {
      duplicateSourceRefCount += 1;
      continue;
    }
    seenRefs.add(sourceRef);
    sources.push({ sourceRef, sourceRevision });
  }

  const hasRejections = missingSourceRevisionCount > 0 || syntheticRevisionCount > 0 || duplicateSourceRefCount > 0;
  // Fail closed at the RUN level: any bad row disqualifies the whole run as
  // source evidence authority. This never silently admits a partial
  // population by dropping the bad rows -- "valid" means every row is valid.
  let status;
  if (fileRows.length === 0) {
    status = 'EMPTY_SOURCE_POPULATION';
  } else if (hasRejections) {
    status = 'SOURCE_POPULATION_INVALID';
  } else if (sources.length === 0) {
    status = 'EMPTY_SOURCE_POPULATION';
  } else {
    status = 'SOURCE_POPULATION_VALID';
  }

  return {
    status,
    valid: status === 'SOURCE_POPULATION_VALID',
    sources,
    sourceCount: sources.length,
    missingSourceRevisionCount,
    syntheticRevisionCount,
    duplicateSourceRefCount,
  };
}
