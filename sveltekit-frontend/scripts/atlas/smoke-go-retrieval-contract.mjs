#!/usr/bin/env node
/**
 * smoke-go-retrieval-contract.mjs
 *
 * Read-only live contract probe for the Go Retrieval service.
 * Probes known paths, emits a JSON report, and prints a Markdown summary.
 *
 * Usage:
 *   node scripts/atlas/smoke-go-retrieval-contract.mjs
 *
 * Env:
 *   GO_RETRIEVAL_HTTP_URL  Base URL (default: http://127.0.0.1:8100)
 *   GO_RETRIEVAL_ENABLED   Set to "true" to suppress the warning
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const REPORTS_DIR = path.join(REPO_ROOT, 'reports');

const BASE_URL = (process.env.GO_RETRIEVAL_HTTP_URL ?? 'http://127.0.0.1:8100').replace(/\/$/, '');
const GO_RETRIEVAL_ENABLED = process.env.GO_RETRIEVAL_ENABLED ?? '';
const TIMEOUT_MS = 4000;

// ---------------------------------------------------------------------------
// Probe definitions
// ---------------------------------------------------------------------------

const SEARCH_BODY = {
  query: 'SearchRuntime qdrant sparse retrieval',
  topK: 5,
  limit: 5,
};

const RECOMMEND_BODY = {
  query: 'SearchRuntime',
  packetKey: 'test',
  topK: 3,
};

/** @type {Array<{ path: string, method: 'GET'|'POST', body?: object }>} */
const PROBES = [
  { path: '/health',           method: 'GET' },
  { path: '/healthz',          method: 'GET' },
  { path: '/ready',            method: 'GET' },
  { path: '/readyz',           method: 'GET' },
  { path: '/openapi.json',     method: 'GET' },
  { path: '/swagger.json',     method: 'GET' },
  { path: '/search',           method: 'POST', body: SEARCH_BODY },
  { path: '/v1/search',        method: 'POST', body: SEARCH_BODY },
  { path: '/recommend',        method: 'POST', body: RECOMMEND_BODY },
  { path: '/v1/recommend',     method: 'POST', body: RECOMMEND_BODY },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely extract top-level keys from a parsed JSON value.
 * @param {unknown} parsed
 * @returns {string[]}
 */
function topLevelKeys(parsed) {
  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return Object.keys(/** @type {object} */ (parsed));
  }
  if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
    return Object.keys(parsed[0]);
  }
  return [];
}

/**
 * Try to extract a representative candidate shape (first element of a results array).
 * Returns null if none found.
 * @param {unknown} parsed
 * @returns {object|null}
 */
function extractCandidateShape(parsed) {
  if (parsed === null || typeof parsed !== 'object') return null;

  // Common result field names
  const resultFields = ['results', 'candidates', 'hits', 'items', 'data'];
  for (const field of resultFields) {
    const arr = /** @type {Record<string, unknown>} */ (parsed)[field];
    if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'object' && arr[0] !== null) {
      // Return a shape sketch: keys + types
      const first = arr[0];
      const shape = {};
      for (const [k, v] of Object.entries(first)) {
        shape[k] = Array.isArray(v) ? 'array' : typeof v;
      }
      return shape;
    }
  }
  // Maybe the top-level itself is an array
  if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
    const first = parsed[0];
    const shape = {};
    for (const [k, v] of Object.entries(first)) {
      shape[k] = Array.isArray(v) ? 'array' : typeof v;
    }
    return shape;
  }
  return null;
}

/**
 * Validate candidate identity fields in a search response.
 * @param {unknown} parsed
 * @param {string} probePath
 * @returns {{ hasPacketKeyOrId: boolean, scoreIsNumber: boolean, hasLane: boolean, sampleKeys: string[] }}
 */
function validateCandidateIdentity(parsed, probePath) {
  const shape = extractCandidateShape(parsed);
  if (!shape) {
    return { hasPacketKeyOrId: false, scoreIsNumber: false, hasLane: false, sampleKeys: [] };
  }
  const keys = Object.keys(shape);
  const hasPacketKeyOrId = keys.includes('packetKey') || keys.includes('packet_key') || keys.includes('id');
  const scoreIsNumber = keys.includes('score') && shape['score'] === 'number';
  const hasLane = keys.includes('lane') || keys.includes('source') || keys.includes('retrieval_lane');
  return { hasPacketKeyOrId, scoreIsNumber, hasLane, sampleKeys: keys };
}

/**
 * Run a single probe and return a result record.
 */
async function runProbe(probe) {
  const url = `${BASE_URL}${probe.path}`;
  const start = Date.now();

  /** @type {{ path: string, method: string, status: number|null, contentType: string, responseKeys: string[], candidateShape: object|null, durationMs: number, error: string|null, rawSnippet: string }} */
  const result = {
    path: probe.path,
    method: probe.method,
    status: null,
    contentType: '',
    responseKeys: [],
    candidateShape: null,
    durationMs: 0,
    error: null,
    rawSnippet: '',
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    /** @type {RequestInit} */
    const init = {
      method: probe.method,
      signal: controller.signal,
      headers: {},
    };
    if (probe.method === 'POST' && probe.body) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(probe.body);
    }

    const res = await fetch(url, init);
    result.status = res.status;
    result.contentType = res.headers.get('content-type') ?? '';

    const text = await res.text();
    result.rawSnippet = text.slice(0, 200);

    let parsed = null;
    if (result.contentType.includes('application/json') || text.trimStart().startsWith('{') || text.trimStart().startsWith('[')) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // Not valid JSON despite content-type
      }
    }

    if (parsed !== null) {
      result.responseKeys = topLevelKeys(parsed);
      result.candidateShape = extractCandidateShape(parsed);
    }
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        result.error = `timeout after ${TIMEOUT_MS}ms`;
      } else {
        result.error = err.message;
      }
    } else {
      result.error = String(err);
    }
  } finally {
    clearTimeout(timer);
    result.durationMs = Date.now() - start;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Report helpers
// ---------------------------------------------------------------------------

/**
 * Determine a note string for the markdown table.
 */
function noteForResult(result) {
  if (result.error) return `ERROR: ${result.error}`;
  if (result.status === null) return 'no response';
  if (result.status >= 200 && result.status < 300) {
    if (result.candidateShape) return `candidates found (keys: ${Object.keys(result.candidateShape).join(', ')})`;
    if (result.responseKeys.length > 0) return `keys: ${result.responseKeys.slice(0, 6).join(', ')}`;
    return 'OK (no body / empty)';
  }
  if (result.status === 404) return 'route not found';
  if (result.status === 405) return 'method not allowed';
  if (result.status >= 400 && result.status < 500) return `client error ${result.status}`;
  if (result.status >= 500) return `server error ${result.status}`;
  return String(result.status);
}

/**
 * Build the markdown summary string (no ANSI codes).
 */
function buildMarkdown(results, validations) {
  const lines = [];

  lines.push('# Go Retrieval Contract Smoke Report');
  lines.push('');
  lines.push(`Base URL: ${BASE_URL}`);
  lines.push(`Timestamp: ${new Date().toISOString()}`);
  lines.push('');

  // Route Discovery Table
  lines.push('## Route Discovery Table');
  lines.push('');
  lines.push('| Path | Method | Status | Content-Type | Notes |');
  lines.push('|------|--------|--------|--------------|-------|');

  for (const r of results) {
    const status = r.status !== null ? String(r.status) : '---';
    const ct = r.contentType ? r.contentType.split(';')[0].trim() : '---';
    const note = noteForResult(r);
    lines.push(`| ${r.path} | ${r.method} | ${status} | ${ct} | ${note} |`);
  }

  lines.push('');

  // Candidate Identity Validation
  lines.push('## Candidate Identity Validation');
  lines.push('');

  if (validations.length === 0) {
    lines.push('No 2xx search/recommend responses were received — cannot validate candidate shape.');
  } else {
    lines.push('| Path | packetKey/id present | score is number | lane field present | sample keys |');
    lines.push('|------|---------------------|-----------------|-------------------|-------------|');
    for (const v of validations) {
      const pkOk = v.hasPacketKeyOrId ? 'YES' : 'NO';
      const scoreOk = v.scoreIsNumber ? 'YES' : 'NO';
      const laneOk = v.hasLane ? 'YES' : 'NO';
      const keys = v.sampleKeys.slice(0, 8).join(', ') || '(none)';
      lines.push(`| ${v.path} | ${pkOk} | ${scoreOk} | ${laneOk} | ${keys} |`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Warning if not enabled
  if (GO_RETRIEVAL_ENABLED !== 'true') {
    console.warn('WARNING: GO_RETRIEVAL_ENABLED is not set to "true" in the environment.');
    console.warn('         The Go Retrieval service may not be running. Proceeding with probe anyway.');
    console.warn('');
  }

  console.log(`Probing Go Retrieval service at: ${BASE_URL}`);
  console.log(`Timeout per probe: ${TIMEOUT_MS}ms`);
  console.log('');

  // Run all probes sequentially (preserve order for report)
  const results = [];
  for (const probe of PROBES) {
    process.stdout.write(`  ${probe.method.padEnd(4)} ${probe.path} ... `);
    const result = await runProbe(probe);
    results.push(result);
    const statusStr = result.status !== null ? String(result.status) : 'ERR';
    console.log(`${statusStr} (${result.durationMs}ms)${result.error ? ' [' + result.error + ']' : ''}`);
  }

  console.log('');

  // Determine which search/recommend probes returned 2xx for candidate validation
  const searchPaths = new Set(['/search', '/v1/search', '/recommend', '/v1/recommend']);
  /** @type {Array<{ path: string, hasPacketKeyOrId: boolean, scoreIsNumber: boolean, hasLane: boolean, sampleKeys: string[] }>} */
  const validations = [];

  for (const r of results) {
    if (searchPaths.has(r.path) && r.status !== null && r.status >= 200 && r.status < 300 && r.candidateShape) {
      const v = validateCandidateIdentity(
        // Re-parse from rawSnippet is lossy; use candidateShape we already extracted
        // Build a fake top-level with shape keys to reuse validateCandidateIdentity
        { results: [r.candidateShape] },
        r.path
      );
      validations.push({ path: r.path, ...v });
    }
  }

  // Build report object
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    goRetrievalEnabled: GO_RETRIEVAL_ENABLED,
    timeoutMs: TIMEOUT_MS,
    probes: results,
    candidateValidations: validations,
    summary: {
      totalProbes: results.length,
      probesWithResponse: results.filter((r) => r.status !== null).length,
      probes2xx: results.filter((r) => r.status !== null && r.status >= 200 && r.status < 300).length,
      probesErrored: results.filter((r) => r.error !== null).length,
      healthLike2xx: results.filter(
        (r) =>
          r.status !== null &&
          r.status >= 200 &&
          r.status < 300 &&
          ['/health', '/healthz', '/ready', '/readyz'].includes(r.path)
      ).length,
    },
  };

  // Ensure reports directory exists
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const reportPath = path.join(REPORTS_DIR, 'smoke-go-retrieval-contract.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`JSON report written to: ${reportPath}`);
  console.log('');

  // Print Markdown summary
  const markdown = buildMarkdown(results, validations);
  console.log(markdown);

  // Exit code logic
  const portListening = results.some((r) => r.status !== null && r.error === null);
  const allErrored = results.every((r) => r.error !== null);
  const healthOk = report.summary.healthLike2xx > 0;

  if (allErrored || !portListening) {
    console.error('RESULT: FAIL — port is not listening or all probes errored.');
    process.exit(1);
  }

  if (!healthOk) {
    console.warn('RESULT: WARN — port is listening but no health-like route returned 2xx.');
    // Still exit 0 because we got some responses and no unexpected exceptions
    process.exit(0);
  }

  console.log('RESULT: PASS — at least one health-like route returned 2xx and no unexpected exceptions occurred.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Unexpected fatal error:', err);
  process.exit(1);
});
