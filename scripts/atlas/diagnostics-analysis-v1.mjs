#!/usr/bin/env node
// Diagnostic analysis producer for the svelte-check replay. Builds payloads for the registered
// TRACE tool diagnostics.record_analysis (table owners: diagnostic_ast_facts, diagnostic_dag_runs,
// diagnostic_recommendations). Producer only: writes a payload file under .tmp/ and does not touch
// the database. --wire posts the payload to TRACE with dry_run=true (rehearsal, rolled back).
// Commit requires --commit and is an explicit operator step.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSavedLog } from '../../sveltekit-frontend/scripts/svelte-check-capture.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const frontendRoot = path.join(repoRoot, 'sveltekit-frontend');
const requireFrom = createRequire(path.join(frontendRoot, 'package.json'));
const { parse } = requireFrom('svelte/compiler');
const { version: svelteVersion } = requireFrom('svelte/package.json');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const logPath = path.resolve(repoRoot, opt('--log', 'docs/reports/svelte-check-all-warnings-errors-2026-10-13.txt'));
const outPath = path.resolve(repoRoot, opt('--out', '.tmp/diagnostic-analysis-payload-v1.json'));
const dagRunId = opt('--run-id', 'svelte-check-2026-10-13-dag-v1');
const TRACE_URL = opt('--trace-url', 'http://127.0.0.1:8788/mcp');
const wire = args.includes('--wire');
const commit = args.includes('--commit');

const sha256 = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;

// Rule table: proposal text only. Every recommendation is PROPOSED and never applied here.
const RULES = [
  { match: /^a11y_/, method: 'rule', action: 'Review accessibility handler or role; add keyboard equivalent or semantic element.' },
  { match: /^css_unused_selector$/, method: 'rule', action: 'Remove or verify unused CSS selector (confirm it is not used by dynamic class).' },
];
const DEFAULT_RULE = { method: 'rule', action: 'Review diagnostic manually; no rule matched.' };
const ruleFor = (code) => RULES.find((r) => code && r.match.test(code)) ?? DEFAULT_RULE;

function regionOf(src, ast, line) {
  const lineStart = (n) => src.split('\n').slice(0, n - 1).join('\n').length + (n > 1 ? 1 : 0);
  const at = lineStart(line);
  for (const block of [ast.instance, ast.module].filter(Boolean)) {
    if (at >= block.content.start && at <= block.content.end) return { region: 'script', start: block.content.start, end: block.content.end };
  }
  if (ast.css && at >= ast.css.start && at <= ast.css.end) return { region: 'style', start: ast.css.start, end: ast.css.end };
  return { region: 'template', start: null, end: null };
}

function buildAstFacts(replay) {
  const facts = [];
  const cache = new Map();
  for (const d of replay.diagnostics) {
    const rel = d.file;
    const abs = path.join(frontendRoot, rel);
    if (!existsSync(abs)) continue;
    if (!cache.has(rel)) {
      const src = readFileSync(abs, 'utf8');
      cache.set(rel, { src, sourceSha256: sha256(src), ast: parse(src, { modern: true }) });
    }
    const { src, sourceSha256, ast } = cache.get(rel);
    const r = regionOf(src, ast, d.line);
    facts.push({
      fingerprint: d.fingerprint,
      log_sha256: replay.summary.inputLogSha256,
      source_ref: `sveltekit-frontend/${rel}`,
      source_sha256: sourceSha256,
      analyzer: 'svelte-compiler',
      analyzer_version: svelteVersion,
      node_kind: r.region,
      span_start: r.start,
      span_end: r.end,
      symbol_name: null,
      facts: { region: r.region, line: d.line, column: d.column, code: d.code },
    });
  }
  return facts;
}

function buildDag(replay) {
  // Flat per-file DAG: one node per diagnostic source file, no dependency edges.
  // Real import/dependency edges are not produced here (gap; see tasks file).
  const files = [...new Set(replay.diagnostics.map((d) => d.file))].sort();
  return {
    run_id: dagRunId,
    log_sha256: replay.summary.inputLogSha256,
    synthesizer_version: 'diagnostics-analysis-v1-flat',
    node_count: files.length,
    edge_count: 0,
    dag: { kind: 'flat-per-file', files },
  };
}

function buildRecommendations(replay) {
  const ordered = [...replay.diagnostics].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
  return ordered.map((d, i) => {
    const rule = ruleFor(d.code);
    return {
      dag_run_id: dagRunId,
      fingerprint: d.fingerprint,
      rank: i + 1,
      method: rule.method,
      score: null,
      evidence_refs: [d.fingerprint, `${d.file}:${d.line}:${d.column}`].slice(0, 20),
      action: rule.action,
    };
  });
}

async function main() {
  const logText = readFileSync(logPath, 'utf8');
  const replay = parseSavedLog(logText, { logPath, logSha256: sha256(logText) });
  const payload = {
    dry_run: true,
    ast_facts: buildAstFacts(replay),
    dag_run: buildDag(replay),
    recommendations: buildRecommendations(replay).map(({ action, ...rest }) => rest),
  };
  // The producer's action text is kept beside the payload for review; the tool does not store it.
  const review = buildRecommendations(replay).map(({ fingerprint, rank, method, action }) => ({ fingerprint, rank, method, action }));
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify({ payload, review }, null, 2)}\n`);
  const summary = {
    diagnostics: replay.diagnostics.length,
    astFacts: payload.ast_facts.length,
    astFactsByRegion: payload.ast_facts.reduce((acc, f) => ({ ...acc, [f.node_kind]: (acc[f.node_kind] ?? 0) + 1 }), {}),
    dagNodes: payload.dag_run.node_count,
    recommendations: payload.recommendations.length,
    payload: path.relative(repoRoot, outPath),
  };
  console.log(JSON.stringify(summary));

  if (wire) {
    const body = { ...payload, dry_run: !commit };
    const res = await fetch(TRACE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'diagnostics.record_analysis', arguments: body } }),
      signal: AbortSignal.timeout(120000),
    });
    const parsed = JSON.parse((await res.text()).match(/data: (.*)/)[1]);
    console.log(parsed.result?.content?.[0]?.text ?? JSON.stringify(parsed.error ?? parsed));
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
