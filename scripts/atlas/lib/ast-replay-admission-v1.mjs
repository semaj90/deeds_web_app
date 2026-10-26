// Pure admission predicate for the live structural producer replay (GRAPH-RESOLVE-06B.4).
// No I/O. The caller supplies the HTTP outcome and the parsed body; this decides whether the replay may be
// admitted. AST scan completeness and NLP status are separate fields: a complete AST scan does not imply that
// a separate NLP pass completed.
import { astScanCompleteness } from './source-observation-http-v1.mjs';

const WRITE_COUNTERS = Object.freeze({
  revisionQualifiedWrites: 0,
  graphifyProjectionWrites: 0,
  aceAdmissionWrites: 0,
});

export function evaluateReplayAdmission({
  httpOk,
  timedOut = false,
  errorMessage = null,
  body = null,
  nominations = [],
  preconditionsOk = true,
}) {
  const refused = (reason, astScanCompletenessValue = 'NOT_RECEIVED') => ({
    admission: 'REFUSED',
    reason,
    astScanCompleteness: astScanCompletenessValue,
    nlpStatus: 'NOT_RUN',
    exactSpanMatches: 0,
    exactNodeMatches: 0,
    ambiguousSpans: 0,
    failures: [],
    ...WRITE_COUNTERS,
  });

  if (timedOut) return refused('SIDECAR_TIMEOUT');
  if (errorMessage !== null) return refused(`SIDECAR_ERROR:${errorMessage}`);
  if (!httpOk) return refused('SIDECAR_HTTP_ERROR');
  if (!body || typeof body !== 'object' || !Array.isArray(body.chunks)) return refused('MALFORMED_RESPONSE');

  const scan = astScanCompleteness(body);
  if (!scan.complete) return refused(scan.scanCompleteness, scan.scanCompleteness);
  if (!preconditionsOk) return refused('PRECONDITION_FAILED', 'COMPLETE');
  if (nominations.length === 0) return refused('NO_NOMINATIONS', 'COMPLETE');

  const bySpan = new Map();
  for (const chunk of body.chunks) {
    const key = `${Number(chunk.start_byte)}:${Number(chunk.end_byte)}`;
    const list = bySpan.get(key) ?? [];
    list.push(chunk);
    bySpan.set(key, list);
  }

  let exactSpanMatches = 0;
  let exactNodeMatches = 0;
  let ambiguousSpans = 0;
  const failures = [];
  for (const nomination of nominations) {
    const matches = bySpan.get(`${nomination.byte_start}:${nomination.byte_end}`) ?? [];
    if (matches.length !== 1) {
      if (matches.length > 1) ambiguousSpans += 1;
      failures.push({ nominationId: nomination.nomination_id, reason: matches.length ? 'AMBIGUOUS_LIVE_SPAN' : 'LIVE_SPAN_NOT_FOUND' });
      continue;
    }
    exactSpanMatches += 1;
    if (String(matches[0].upstream_node_id ?? '') === String(nomination.upstream_node_id ?? '')) exactNodeMatches += 1;
    else failures.push({ nominationId: nomination.nomination_id, reason: 'LIVE_UPSTREAM_NODE_MISMATCH' });
  }

  const admitted = exactSpanMatches === nominations.length && exactNodeMatches === nominations.length && failures.length === 0;
  return {
    admission: admitted ? 'ALLOWED' : 'REFUSED',
    reason: admitted ? null : 'REPLAY_MISMATCH',
    astScanCompleteness: 'COMPLETE',
    nlpStatus: 'NOT_RUN',
    exactSpanMatches,
    exactNodeMatches,
    ambiguousSpans,
    failures,
    ...WRITE_COUNTERS,
  };
}
