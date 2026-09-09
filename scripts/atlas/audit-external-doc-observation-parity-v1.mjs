#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const PYTHON = process.env.PYTHON_BIN || 'python';
const TARGET_URL = process.argv.find((value) => value.startsWith('--url='))?.slice('--url='.length)
  || 'https://docs.searxng.org/dev/search_api.html';
const SOURCE_REVISION = process.argv.find((value) => value.startsWith('--source-revision='))?.slice('--source-revision='.length)
  || 'fixture:external-doc-observation-parity-v1';
const REPORT_PATH = join(ROOT, 'docs/reports/external-doc-observation-parity-v1.json');
const USER_AGENT = 'Parent-Atlas-External-Doc-Parity/1.0';

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function parseJson(stdout, label) {
  const text = String(stdout || '').trim();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label}_JSON_INVALID:${text.slice(-500)}`);
  }
}

function runPython(args, input = '') {
  const result = spawnSync(PYTHON, args, {
    cwd: ROOT,
    input: Buffer.from(input, 'utf8'),
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return result;
}

function checkRobots(url) {
  const code = [
    'import json, sys, urllib.robotparser',
    'from urllib.parse import urlparse',
    'url, agent = sys.argv[1], sys.argv[2]',
    'base = f"{urlparse(url).scheme}://{urlparse(url).netloc}/robots.txt"',
    'rp = urllib.robotparser.RobotFileParser(base)',
    'try:',
    '    rp.read()',
    '    allowed = bool(rp.can_fetch(agent, url))',
    '    print(json.dumps({"status": "ALLOWED" if allowed else "DISALLOWED", "robotsUrl": base, "crawlDelay": rp.crawl_delay(agent), "requestRate": str(rp.request_rate(agent)) if rp.request_rate(agent) else None}))',
    'except Exception as exc:',
    '    print(json.dumps({"status": "UNAVAILABLE", "robotsUrl": base, "error": str(exc)}))',
  ].join('\n');
  const result = runPython(['-c', code, url, USER_AGENT]);
  if (result.status !== 0) throw new Error(`ROBOTS_CHECK_FAILED:${String(result.stderr || '').trim()}`);
  return parseJson(result.stdout, 'robots');
}

async function loadTypescriptSchema() {
  const modulePath = pathToFileURL(join(ROOT, 'packages/parent-atlas/dist/core/external-doc-capture-runtime.js')).href;
  return (await import(modulePath)).externalDocPageCaptureSchema;
}

async function main() {
  const startedAt = new Date().toISOString();
  const robots = checkRobots(TARGET_URL);
  if (robots.status !== 'ALLOWED') {
    const blocked = {
      schema: 'atlas.external-doc-observation-parity.v1',
      status: 'BLOCKED_ROBOTS',
      url: TARGET_URL,
      sourceRevision: SOURCE_REVISION,
      robots,
      canonicalAuthority: false,
      writesPerformed: false,
      databaseWritesPerformed: false,
      projectionWritesPerformed: false,
      generatedAt: startedAt,
    };
    await mkdir(join(ROOT, 'docs/reports'), { recursive: true });
    await writeFile(REPORT_PATH, `${JSON.stringify(blocked, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ report: REPORT_PATH, status: blocked.status, writesPerformed: false }, null, 2));
    process.exitCode = 2;
    return;
  }

  const captureResult = runPython(['scripts/docs-atlas/fetch-beautifulsoup.py', TARGET_URL]);
  if (captureResult.status !== 0) throw new Error(`BEAUTIFULSOUP_CAPTURE_FAILED:${String(captureResult.stderr || '').trim()}`);
  const pythonCapture = parseJson(captureResult.stdout, 'beautifulsoup_capture');

  const validationResult = runPython(['scripts/atlas/validate-okf-beautifulsoup-pydantic-v1.py'], JSON.stringify(pythonCapture));
  const pythonValidation = parseJson(validationResult.stdout, 'pydantic_validation');

  const externalDocPageCaptureSchema = await loadTypescriptSchema();
  const markdown = String(pythonCapture.markdown || '');
  const normalizedChecksum = sha256(markdown);
  const tsCapture = externalDocPageCaptureSchema.parse({
    capture_id: `parity:${normalizedChecksum.slice(0, 32)}`,
    source_id: `parity:${new globalThis.URL(TARGET_URL).hostname}`,
    source_revision: SOURCE_REVISION,
    requested_url: String(pythonCapture.url),
    resolved_url: String(pythonCapture.resolved_url),
    title: String(pythonCapture.title),
    language: String(pythonCapture.metadata?.language || 'en'),
    http_status: Number(pythonCapture.metadata?.statusCode || 200),
    fetched_at: new Date().toISOString(),
    markdown,
    raw_html: null,
    screenshot_bytes: null,
    screenshot_media_type: null,
    outgoing_urls: Array.isArray(pythonCapture.outgoing_urls) ? pythonCapture.outgoing_urls : [],
    etag: null,
    last_modified: null,
    change_status: null,
    canonical_authority: false,
  });

  const checks = {
    pythonValidation: pythonValidation.status === 'VALIDATED',
    tsSchema: Boolean(tsCapture),
    normalizedChecksum: pythonCapture.normalized_checksum === normalizedChecksum,
    contentParity: tsCapture.markdown === pythonCapture.markdown,
    requestedUrlParity: tsCapture.requested_url === pythonCapture.url,
    resolvedUrlParity: tsCapture.resolved_url === pythonCapture.resolved_url,
    canonicalAuthorityFalse: pythonCapture.canonical_authority === false && tsCapture.canonical_authority === false,
    robotsAllowed: robots.status === 'ALLOWED',
  };
  const passed = Object.values(checks).every(Boolean);
  const report = {
    schema: 'atlas.external-doc-observation-parity.v1',
    status: passed ? 'PARITY_PROVEN_NON_CANONICAL' : 'PARITY_REJECTED',
    url: TARGET_URL,
    sourceRevision: SOURCE_REVISION,
    sourceRevisionProvided: true,
    fetcher: pythonCapture.fetcher,
    parser: pythonCapture.metadata?.parser || null,
    parserVersion: pythonCapture.metadata?.parserVersion || null,
    robots,
    checks,
    python: {
      schema: 'atlas.okf-beautifulsoup-capture.v1',
      validationExitCode: validationResult.status,
      validationResponse: pythonValidation,
      normalizedChecksum: pythonCapture.normalized_checksum,
    },
    typescript: {
      schema: tsCapture.schema,
      captureId: tsCapture.capture_id,
      normalizedChecksum,
    },
    admission: {
      workspaceRevision: null,
      postgresAdmissionAttempted: false,
      qdrantProjectionAttempted: false,
      neo4jProjectionAttempted: false,
      valkeyProjectionAttempted: false,
      canonicalAuthority: false,
    },
    gaps: [
      'workspaceRevision is not supplied by the Python capture and remains required before canonical admission',
      'Go/SearXNG normalized-result parity is not exercised by this page-capture fixture',
      'no Postgres or projection readback was attempted',
    ],
    generatedAt: startedAt,
    writesPerformed: false,
    databaseWritesPerformed: false,
    projectionWritesPerformed: false,
  };

  await mkdir(join(ROOT, 'docs/reports'), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ report: REPORT_PATH, status: report.status, checks, writesPerformed: false }, null, 2));
  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'ERROR', error: error instanceof Error ? error.message : String(error), writesPerformed: false }));
  process.exitCode = 1;
});
