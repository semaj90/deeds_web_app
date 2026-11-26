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

export const QA_EVENT_SCHEMA_VERSION = 'qa.normalized-event.v1';

/** FEATURE-LABEL-MAP-01: Map the 9 E2E design + 8 core product feature_labels to atlas-feature-registry keys. */
export const DESIGN_FEATURE_LABELS = Object.freeze({
  'auth.session': { registryKey: 'atlas.auth.session', domain: 'auth' },
  'evidence.upload': { registryKey: 'atlas.evidence.upload', domain: 'evidence' },
  'evidence.viewer': { registryKey: 'atlas.evidence.viewer', domain: 'evidence' },
  'scene.marker': { registryKey: 'atlas.scene.marker', domain: 'crime-scene' },
  'scene.motion': { registryKey: 'atlas.scene.motion', domain: 'crime-scene' },
  'agent.acp.execute': { registryKey: 'atlas.agent.acp.execute', domain: 'agent' },
  'agent.a2a.rpc': { registryKey: 'atlas.agent.a2a.rpc', domain: 'agent' },
  'infra.vite': { registryKey: 'atlas.infra.vite', domain: 'infra' },
  'infra.graphify': { registryKey: 'atlas.infra.graphify', domain: 'infra' },
  'ai.chat': { registryKey: 'atlas.ai.chat', domain: 'ai' },
  'ai.contextual': { registryKey: 'atlas.ai.contextual', domain: 'ai' },
  'ai.analysis': { registryKey: 'atlas.ai.analysis', domain: 'ai' },
  'ai.recommendations': { registryKey: 'atlas.ai.recommendations', domain: 'ai' },
  'poi.directory': { registryKey: 'atlas.poi.directory', domain: 'poi' },
  'reports.builder': { registryKey: 'atlas.reports.builder', domain: 'reports' },
  'search.hybrid': { registryKey: 'atlas.search.hybrid', domain: 'search' },
  'admin.error_brain': { registryKey: 'atlas.admin.error_brain', domain: 'admin' },
});

export function normalizeQaEvent(event) {
  if (!event || typeof event !== 'object') return null;
  const expected_status = event.expected_status ?? null;
  const actual_status = event.actual_status ?? event.status ?? null;
  const suppressed = Boolean(
    event.suppressed === true
    || (expected_status !== null && actual_status !== null && Number(expected_status) === Number(actual_status)),
  );
  const tags = Array.isArray(event.tags)
    ? [...new Set(event.tags.map((t) => String(t).trim()).filter(Boolean))]
    : [];
  const evidence_refs = Array.isArray(event.evidence_refs)
    ? event.evidence_refs.map((r) => String(r)).filter(Boolean)
    : [];
  return {
    ...event,
    schema_version: event.schema_version ?? QA_EVENT_SCHEMA_VERSION,
    expected_status,
    actual_status,
    server_log_ref: event.server_log_ref ?? null,
    evidence_refs,
    tags,
    suppressed,
  };
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
 * Group normalized events into active issues + suppressed audit events.
 */
export function groupIssuesWithAudit(events) {
  const issues = new Map();
  const suppressedEvents = [];
  for (const rawEvent of events) {
    const event = normalizeQaEvent(rawEvent);
    if (!event) continue;
    if (event.suppressed) {
      suppressedEvents.push(event);
      continue;
    }
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
      for (const t of event.tags) if (!existing.tags.includes(t)) existing.tags.push(t);
      for (const r of event.evidence_refs) if (!existing.evidence_refs.includes(r)) existing.evidence_refs.push(r);
      existing.server_log_ref = existing.server_log_ref ?? event.server_log_ref;
      continue;
    }
    issues.set(key, {
      schema_version: event.schema_version,
      fingerprint: key,
      error_code: verdict.error_code,
      confidence: verdict.confidence,
      severity: SEVERITY[verdict.error_code] ?? 'P3',
      feature_label,
      feature_registry_key: DESIGN_FEATURE_LABELS[feature_label]?.registryKey ?? null,
      tags: [...event.tags],
      route_template,
      expected_status: event.expected_status,
      actual_status: event.actual_status,
      server_log_ref: event.server_log_ref,
      evidence_refs: [...event.evidence_refs],
      occurrences: 1,
      needsConfirmation: verdict.needsConfirmation,
      firstRunId: event.run_id ?? null,
      lastRunId: event.run_id ?? null,
      sample_message: redact(event.message ?? ''),
    });
  }
  const sorted = [...issues.values()].sort((a, b) => a.severity.localeCompare(b.severity) || b.occurrences - a.occurrences);
  return { issues: sorted, suppressedEvents };
}

export function groupIssues(events) {
  return groupIssuesWithAudit(events).issues;
}
