#!/usr/bin/env node
/**
 * Aggregates one Playwright QA run into a deduplicated issues file.
 *
 * Input:  logs/qa/<runId>/results.json (Playwright JSON reporter) and the qa-browser-events.json
 *         attachments it references.
 * Output: logs/qa/<runId>/issues.json: grouped issues, per-test status, and the active server
 *         identity from logs/qa/active-server.json (when present).
 *
 * This writes files only. Persisting to PostgreSQL and linking Kanban tasks is a separate,
 * approval-gated step; nothing here touches the database.
 *
 * Usage: node scripts/qa/build-qa-issues.mjs <runId>
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupIssues, redact, CODES } from './error-fingerprint.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, '../..');

function* walkTests(suites, parentTitles = []) {
  for (const suite of suites ?? []) {
    const titles = suite.title ? [...parentTitles, suite.title] : parentTitles;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        yield { test, spec, titles: [...titles, spec.title] };
      }
    }
    yield* walkTests(suite.suites, titles);
  }
}

function tagsOf(test, spec) {
  // The JSON report stores tags without the leading "@" (spec.tags = ["feature:infra.vite"]).
  return [...(test.tags ?? []), ...(spec.tags ?? [])].map((tag) => tag.replace(/^@/, ''));
}

function featureLabelOf(tags) {
  const tag = tags.find((value) => value.startsWith('feature:'));
  return tag ? tag.slice('feature:'.length) : 'unlabeled';
}

export function buildIssues(report, { runId, serverManifest = null, revision = null }) {
  const events = [];
  const tests = [];

  for (const { test, spec, titles } of walkTests(report.suites)) {
    const result = test.results?.at(-1) ?? {};
    // Test-level status is authoritative: "expected" = passed as declared, which includes a
    // test.fail() known gap; "unexpected" = a real failure; "flaky" = passed after a retry.
    const testStatus = test.status ?? result.status ?? 'unknown';
    const knownGap = testStatus === 'expected' && test.expectedStatus === 'failed';
    const status = knownGap ? 'known_gap' : testStatus === 'expected' || testStatus === 'flaky' ? 'passed' : testStatus === 'unexpected' ? 'failed' : testStatus;
    const feature_label = featureLabelOf(tagsOf(test, spec));
    const title = titles.join(' > ');
    tests.push({ title, status, retries: (test.results?.length ?? 1) - 1, feature_label });

    for (const attachment of result.attachments ?? []) {
      if (attachment.name !== 'qa-browser-events.json' || !attachment.path || !existsSync(attachment.path)) continue;
      const recorded = JSON.parse(readFileSync(attachment.path, 'utf8'));
      for (const event of recorded) events.push({ ...event, run_id: runId, feature_label, test: title });
    }

    if (status === 'failed' || status === 'timedOut') {
      const error = result.error ?? {};
      events.push({
        run_id: runId,
        source: 'playwright',
        error_code: CODES.E2E_ASSERTION_FAILED,
        feature_label,
        test: title,
        route: '(test)',
        message: redact(error.message ?? 'test failed'),
        stack: typeof error.stack === 'string' ? error.stack : undefined,
      });
    }
  }

  const issues = groupIssues(events);
  return {
    schema_version: 1,
    run_id: runId,
    generated_at: new Date().toISOString(),
    revision,
    server: serverManifest,
    totals: {
      tests: tests.length,
      passed: tests.filter((t) => t.status === 'passed').length,
      failed: tests.filter((t) => t.status === 'failed' || t.status === 'timedOut').length,
      skipped: tests.filter((t) => t.status === 'skipped').length,
      known_gap: tests.filter((t) => t.status === 'known_gap').length,
      events: events.length,
      issues: issues.length,
    },
    issues,
    tests,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runId = process.argv[2];
  if (!runId) {
    console.error('usage: node scripts/qa/build-qa-issues.mjs <runId>');
    process.exit(2);
  }
  const runDir = path.join(FRONTEND_ROOT, 'logs', 'qa', runId);
  const reportPath = path.join(runDir, 'results.json');
  if (!existsSync(reportPath)) {
    console.error(`missing ${reportPath}`);
    process.exit(2);
  }
  const manifestPath = path.join(FRONTEND_ROOT, 'logs', 'qa', 'active-server.json');
  const serverManifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const output = buildIssues(report, { runId, serverManifest, revision: serverManifest?.revision ?? null });
  const outPath = path.join(runDir, 'issues.json');
  writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ out: outPath, totals: output.totals }));
}
