/**
 * E2E error classification, redaction and fingerprinting.
 *
 * Classification order (strongest first):
 *   1. explicit error_code on the event        -> confidence EXPLICIT
 *   2. HTTP status / Playwright assertion      -> confidence ASSERTION
 *   3. stack signature + route                 -> confidence STACK
 *   4. keyword / regex on message              -> confidence KEYWORD (needs confirmation)
 * A request_id alone is never an error.
 *
 * Fingerprint = sha256 over [error_code, feature_label, route template, stack signature].
 * It excludes timestamps, request IDs, UUIDs and raw messages, so repeated occurrences of
 * one defect collapse into one issue.
 */
import { createHash } from 'node:crypto';

export const CODES = Object.freeze({
  JS_RUNTIME_EXCEPTION: 'JS_RUNTIME_EXCEPTION',
  HTTP_INTERNAL_ERROR: 'HTTP_INTERNAL_ERROR',
  E2E_NETWORK_FAILED: 'E2E_NETWORK_FAILED',
  E2E_CONSOLE_ERROR: 'E2E_CONSOLE_ERROR',
  E2E_ASSERTION_FAILED: 'E2E_ASSERTION_FAILED',
  // Design-doc codes. Detected from data where possible; otherwise set explicitly by a test.
  ACP_PARSE_MISCLASSIFIED: 'ACP_PARSE_MISCLASSIFIED', // detected: expected 4xx, actual 5xx on /api/acp/
  A2A_PARSE_ERROR: 'A2A_PARSE_ERROR', // detected: expected 4xx, actual 5xx on /api/agent/rpc
  ACP_REGISTRY_UNSAFE: 'ACP_REGISTRY_UNSAFE', // explicit only: inherited-key lookup reached a handler
  QA_FIXTURE_MISSING: 'QA_FIXTURE_MISSING', // explicit only: test fixture absent
  GRAPHIFY_SNAPSHOT_STALE: 'GRAPHIFY_SNAPSHOT_STALE', // explicit only: freshness, not a defect
});

/** Default severity policy. Calibrate from observed incident history. */
export const SEVERITY = Object.freeze({
  [CODES.ACP_REGISTRY_UNSAFE]: 'P0',
  [CODES.JS_RUNTIME_EXCEPTION]: 'P1',
  [CODES.HTTP_INTERNAL_ERROR]: 'P1',
  [CODES.ACP_PARSE_MISCLASSIFIED]: 'P1',
  [CODES.E2E_NETWORK_FAILED]: 'P2',
  [CODES.E2E_ASSERTION_FAILED]: 'P2',
  [CODES.A2A_PARSE_ERROR]: 'P2',
  [CODES.E2E_CONSOLE_ERROR]: 'P3',
  [CODES.QA_FIXTURE_MISSING]: 'P3',
  [CODES.GRAPHIFY_SNAPSHOT_STALE]: 'P3',
});

/** Strip credentials, emails and URL query strings, then truncate. Never persist raw bodies. */
export function redact(text, max = 300) {
  return String(text ?? '')
    .replace(/\x1b\[[0-9;]*m/g, '') // ANSI color codes from Playwright and Vite output
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>')
    .replace(/((?:session|token|auth|cookie|api[_-]?key)[=:]\s*)[^\s;&"']+/gi, '$1<redacted>')
    .replace(/(https?:\/\/[^\s?"']+)\?[^\s"']*/gi, '$1?<redacted>')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .slice(0, max);
}

/** Route template: numeric and UUID-like segments become ":id", so one route = one template. */
export function routeTemplate(pathname) {
  if (typeof pathname !== 'string' || pathname.length === 0) return '(none)';
  // Query strings and fragments carry per-request values; they never belong in the template.
  const bare = pathname.split(/[?#]/)[0];
  return bare
    .split('/')
    .map((segment) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) || /^\d+$/.test(segment) || /^[0-9a-f]{16,}$/i.test(segment)
        ? ':id'
        : segment,
    )
    .join('/');
}

/** Function names of the first frames, with file, line and column removed. */
export function stackSignature(stack, frames = 3) {
  if (typeof stack !== 'string') return 'NO_STACK';
  const names = [];
  for (const line of stack.split(/\r?\n/)) {
    const match = line.trim().match(/^at\s+(?:async\s+)?([^\s(]+)/);
    if (match) names.push(match[1].replace(/:\d+(:\d+)?$/, ''));
    if (names.length === frames) break;
  }
  return names.length ? names.join('>') : 'NO_FRAMES';
}

/**
 * Classify one normalized event. Returns null for events that are not errors
 * (for example a bare request_id correlation line).
 */
export function classify(event) {
  if (!event || typeof event !== 'object') return null;
  if (typeof event.error_code === 'string' && event.error_code.length > 0) {
    return { error_code: event.error_code, confidence: 'EXPLICIT', needsConfirmation: false };
  }
  if (event.source === 'http' && Number(event.status) >= 500) {
    return { error_code: CODES.HTTP_INTERNAL_ERROR, confidence: 'ASSERTION', needsConfirmation: false };
  }
  if (event.source === 'network') {
    return { error_code: CODES.E2E_NETWORK_FAILED, confidence: 'ASSERTION', needsConfirmation: false };
  }
  if (event.source === 'browser') {
    return {
      error_code: CODES.JS_RUNTIME_EXCEPTION,
      confidence: event.stack ? 'STACK' : 'KEYWORD',
      needsConfirmation: !event.stack,
    };
  }
  if (event.source === 'console') {
    const message = String(event.message ?? '');
    // A request_id with no other error signal is correlation metadata, not a defect.
    if (/request_id=/.test(message) && !/error|exception|fail/i.test(message.replace(/request_id=\S+/g, ''))) {
      return null;
    }
    return { error_code: CODES.E2E_CONSOLE_ERROR, confidence: 'KEYWORD', needsConfirmation: true };
  }
  return null;
}

/** Stable issue key. Do not include timestamps, request IDs, raw messages or UUIDs. */
export function fingerprint({ error_code, feature_label, route, stack }) {
  const key = JSON.stringify([
    error_code ?? 'UNCLASSIFIED',
    feature_label ?? 'unlabeled',
    routeTemplate(route ?? ''),
    stackSignature(stack),
  ]);
  return `sha256:${createHash('sha256').update(key).digest('hex')}`;
}

/**
 * Group normalized events into issues. Each issue records occurrences, the first and last
 * run that produced it, and whether any occurrence still needs confirmation.
 */
export function groupIssues(events) {
  const issues = new Map();
  for (const event of events) {
    const verdict = classify(event);
    if (!verdict) continue;
    const feature_label = event.feature_label ?? 'unlabeled';
    const route_template = routeTemplate(event.route ?? '');
    const key = fingerprint({ error_code: verdict.error_code, feature_label, route: event.route, stack: event.stack });
    const existing = issues.get(key);
    if (existing) {
      existing.occurrences += 1;
      existing.needsConfirmation ||= verdict.needsConfirmation;
      existing.lastRunId = event.run_id ?? existing.lastRunId;
      continue;
    }
    issues.set(key, {
      fingerprint: key,
      error_code: verdict.error_code,
      confidence: verdict.confidence,
      severity: SEVERITY[verdict.error_code] ?? 'P3',
      feature_label,
      route_template,
      occurrences: 1,
      needsConfirmation: verdict.needsConfirmation,
      firstRunId: event.run_id ?? null,
      lastRunId: event.run_id ?? null,
      sample_message: redact(event.message ?? ''),
    });
  }
  return [...issues.values()].sort((a, b) => a.severity.localeCompare(b.severity) || b.occurrences - a.occurrences);
}
