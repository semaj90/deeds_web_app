/**
 * Pure completeness gate and run summary for sidecar-routed Graphify symbol extraction.
 *
 * A sidecar AST response counts as COMPLETE only when syntax_status is CLEAN and scan_completeness
 * is COMPLETE. Anything else is withheld: a file with recovered syntax errors (RECOVERED_WITH_ERRORS)
 * is PARTIAL and must not contribute admitted structural edges or a complete graph snapshot.
 *
 * No I/O. Route status is not symbol authority; ROUTED results remain candidates.
 */

export const AST_SCHEMA = 'atlas.ast.evidence.v1';

export function classifySidecarAstCompleteness(body) {
  if (!body || typeof body !== 'object' || body.schema !== AST_SCHEMA || !Array.isArray(body.chunks)) {
    return { status: 'MALFORMED', reason: 'SIDECAR_AST_RESPONSE_INVALID' };
  }
  if (body.scan_failure || body.scan_completeness !== 'COMPLETE') {
    return { status: 'SIDECAR_INCOMPLETE', reason: body.scan_failure ?? String(body.scan_completeness) };
  }
  if (body.syntax_status !== 'CLEAN') {
    return { status: 'PARTIAL_SYNTAX_ERRORS', reason: String(body.syntax_status), diagnosticCount: (body.diagnostics ?? []).length };
  }
  return { status: 'COMPLETE', reason: null };
}

export function checkRouteRevision(route, liveAuthorityRevision) {
  if (route.status !== 'ROUTED') return { ok: false, reason: route.status };
  if (route.authorityRevision !== liveAuthorityRevision) return { ok: false, reason: 'STALE_CAPABILITY_REVISION' };
  return { ok: true, reason: null };
}

/**
 * Map extractor plan entries to route decisions. A WOULD_EXTRACT entry is COMPLETE only; a parse
 * failure carrying SIDECAR_AST_NOT_COMPLETE:PARTIAL_SYNTAX_ERRORS is PARTIAL; everything else keeps
 * its own rejection outcome.
 */
export function planToRouteDecisions(plan) {
  return plan.map((entry) => {
    const language = entry.routeLanguage ?? `local:${entry.fileKind}`;
    if (entry.outcome === 'WOULD_EXTRACT') return { sourceRef: entry.sourceRef, outcome: 'COMPLETE', language };
    if (entry.outcome === 'PARSE_FAILED' && String(entry.error ?? '').startsWith('SIDECAR_AST_NOT_COMPLETE:PARTIAL_SYNTAX_ERRORS')) {
      return { sourceRef: entry.sourceRef, outcome: 'PARTIAL_SYNTAX_ERRORS', language, error: entry.error };
    }
    return { sourceRef: entry.sourceRef, outcome: entry.outcome, language, error: entry.error ?? null };
  });
}

/**
 * Give every submitted sourceRef exactly one disposition, so the accounting always reconciles:
 *   CANDIDATE_OUTCOME  - present in the plan (candidate reached extraction; see plan outcome)
 *   UNSUPPORTED_ROUTE  - rejected before the candidate pool by the route resolver
 *   NOT_IN_CANDIDATE_POOL - no exact-revision graphify row, so it was never considered
 */
export function accountForSubmittedSources(submittedRefs, plan, unsupportedSample, exactStatusByRef = new Map()) {
  const planByRef = new Map(plan.map((entry) => [entry.sourceRef, entry]));
  const unsupportedRefs = new Set(unsupportedSample.map((entry) => entry.sourceRef));
  const counts = {};
  const notInPool = [];
  for (const sourceRef of submittedRefs) {
    let disposition;
    const exact = exactStatusByRef.get(sourceRef) ?? null;
    if (planByRef.has(sourceRef)) disposition = `CANDIDATE_OUTCOME:${planByRef.get(sourceRef).outcome}`;
    else if (unsupportedRefs.has(sourceRef)) disposition = 'UNSUPPORTED_ROUTE';
    else if (exact === 'PROCESSED') disposition = 'ALREADY_PROCESSED_AT_ADMITTED_REVISION';
    else if (exact) disposition = `EXACT_ROW_NOT_ATTEMPTED:${exact}`;
    else {
      disposition = 'NO_EXACT_REVISION_ROW';
      notInPool.push(sourceRef);
    }
    counts[disposition] = (counts[disposition] ?? 0) + 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { submitted: submittedRefs.length, dispositions: counts, notInPool, reconciled: total === submittedRefs.length };
}

/** Summarize per-file decisions; partial, blocked and rejected files never count as covered. */
export function summarizeRouteRun(decisions) {
  const counts = {};
  const byLanguage = {};
  let covered = 0;
  let partial = 0;
  let rejected = 0;
  for (const d of decisions) {
    const key = d.outcome;
    counts[key] = (counts[key] || 0) + 1;
    if (d.outcome === 'COMPLETE') {
      covered += 1;
      byLanguage[d.language ?? '(none)'] = (byLanguage[d.language ?? '(none)'] || 0) + 1;
    } else if (d.outcome === 'PARTIAL_SYNTAX_ERRORS') partial += 1;
    else rejected += 1;
  }
  return { total: decisions.length, covered, partial, rejected, outcomeCounts: counts, completeByLanguage: byLanguage };
}
