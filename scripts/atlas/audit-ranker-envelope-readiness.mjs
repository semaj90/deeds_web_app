#!/usr/bin/env node
/**
 * Audit the active ranking/candidate envelope before Gemma4 summary apply.
 *
 * This is a proof gate only. It does not mutate Postgres, Qdrant, Redis, or packet identity.
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './connection-config.mjs';
import { buildSummaryContext } from './lib/summary-context-map.mjs';

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=(.*)$/);
  if (m) args.set(m[1], m[2]);
  else if (arg.startsWith('--')) args.set(arg.slice(2), 'true');
}

const CANDIDATES = path.resolve(REPO_ROOT, String(args.get('candidates') ?? '.tmp/turbovec-candidates.ndjson'));
const EMBED_PROOF = path.resolve(REPO_ROOT, String(args.get('embedding-proof') ?? 'docs/reports/embedding-qdrant-turbovec-proof.json'));
const SUMMARY_REPORT = path.resolve(REPO_ROOT, String(args.get('summary-report') ?? '.tmp/gemma4-parent-atlas-summary-cache-report.json'));
const ONTOLOGY_REPORT = path.resolve(REPO_ROOT, String(args.get('ontology-report') ?? 'docs/reports/ontology-kag-readiness.json'));
const OUT_JSON = path.resolve(REPO_ROOT, String(args.get('out-json') ?? 'docs/reports/ranker-envelope-readiness.json'));
const OUT_MD = path.resolve(REPO_ROOT, String(args.get('out-md') ?? 'docs/reports/ranker-envelope-readiness.md'));
const LIMIT = Number(args.get('limit') ?? 5000);

const REQUIRED = ['packet_key', 'source_ref', 'feature_id', 'score', 'scores', 'provenance'];
const COARSE_FEATURE_IDS = new Set(['src', 'lib', 'routes', 'api', 'db', 'ai', 'server', 'client', 'components', 'scripts', 'docs', 'test', 'tests', 'utils']);

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readJsonl(filePath, limit) {
  const rows = [];
  if (!fs.existsSync(filePath)) return rows;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
      if (rows.length >= limit) break;
    } catch {
      // ignored; malformed count handled in structural tuple report
    }
  }
  return rows;
}

function pct(part, total) {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function featureIdLooksCanonical(value) {
  const text = String(value ?? '').trim();
  if (!text || COARSE_FEATURE_IDS.has(text)) return false;
  return text.includes('.') || text.startsWith('repo.file.') || text.includes('-') || text.includes('_');
}

function statusFrom(ok, warn = false) {
  if (!ok) return 'FAIL';
  return warn ? 'WARN' : 'LIVE_PASS';
}

function statusFromWarnable(ok, warn = false) {
  if (!ok) return 'FAIL';
  return warn ? 'WARN' : 'LIVE_PASS';
}

const candidates = readJsonl(CANDIDATES, LIMIT);
const embeddingProof = readJson(EMBED_PROOF);
const summaryReport = readJson(SUMMARY_REPORT);
const ontologyReport = readJson(ONTOLOGY_REPORT);

const total = candidates.length;
const missingRequired = [];
const coarseFeatureIds = [];
const identityComplete = [];
const summaryContextComplete = [];
const domainReady = [];
const ontologyReady = [];
const topologyReady = [];
const contentReady = [];
const provenanceReady = [];
const scoreReady = [];

for (const row of candidates) {
  const missing = REQUIRED.filter((field) => !hasText(row[field]) && typeof row[field] !== 'object' && typeof row[field] !== 'number');
  if (missing.length) missingRequired.push({ packet_key: row.packet_key ?? null, missing });
  if (!featureIdLooksCanonical(row.feature_id)) coarseFeatureIds.push({ packet_key: row.packet_key ?? null, feature_id: row.feature_id ?? null });

  const context = buildSummaryContext(row);
  identityComplete.push(Boolean(row.packet_key && row.source_ref && row.feature_id));
  summaryContextComplete.push(Boolean(context.identity_required_complete));
  domainReady.push(hasText(row.domain_class) || hasText(context.domain_class));
  ontologyReady.push(hasText(row.ontology_label) || hasText(context.ontology_label));
  topologyReady.push(hasText(row.topology_label) || hasText(context.topology_label));
  contentReady.push(hasText(row.content_ref) && fs.existsSync(path.resolve(REPO_ROOT, row.content_ref)));
  provenanceReady.push(row.provenance?.canonical_truth === 'postgres.atlas_packets' && row.provenance?.identity_mutated === false);
  scoreReady.push(Number.isFinite(Number(row.score)) && row.scores && typeof row.scores === 'object');
}

const lanes = {
  embedding_qdrant_turbovec: {
    status: embeddingProof?.lanes?.embeddinggemma?.status === 'LIVE_PASS'
      && embeddingProof?.lanes?.qdrant?.status === 'LIVE_PASS'
      && embeddingProof?.lanes?.turbovec_grpc?.status === 'LIVE_PASS'
      ? 'LIVE_PASS'
      : 'FAIL',
    source: path.relative(REPO_ROOT, EMBED_PROOF).replace(/\\/g, '/'),
    embeddinggemma: embeddingProof?.lanes?.embeddinggemma?.status ?? 'MISSING',
    qdrant: embeddingProof?.lanes?.qdrant?.status ?? 'MISSING',
    turbovec_grpc: embeddingProof?.lanes?.turbovec_grpc?.status ?? 'MISSING',
  },
  active_ranker_envelope: {
    status: statusFromWarnable(total > 0 && missingRequired.length === 0, coarseFeatureIds.length > 0),
    candidates: total,
    identity_pct: pct(identityComplete.filter(Boolean).length, total),
    score_pct: pct(scoreReady.filter(Boolean).length, total),
    provenance_pct: pct(provenanceReady.filter(Boolean).length, total),
    missing_required: missingRequired.slice(0, 20),
    weak_feature_id_count: coarseFeatureIds.length,
    weak_feature_id_rule: 'Canonical Postgres feature_id values are preserved for summary ingestion; weak labels are reported for later feature_id coverage repair.',
    coarse_feature_ids: coarseFeatureIds.slice(0, 20),
  },
  summary_context_envelope: {
    status: statusFrom(
      total > 0
      && summaryContextComplete.every(Boolean)
      && domainReady.every(Boolean)
      && ontologyReady.every(Boolean)
      && topologyReady.every(Boolean),
      contentReady.some((ok) => !ok)
    ),
    identity_required_pct: pct(summaryContextComplete.filter(Boolean).length, total),
    domain_pct: pct(domainReady.filter(Boolean).length, total),
    ontology_pct: pct(ontologyReady.filter(Boolean).length, total),
    topology_pct: pct(topologyReady.filter(Boolean).length, total),
    content_ref_pct: pct(contentReady.filter(Boolean).length, total),
  },
  summary_test10: {
    status: summaryReport?.mode === 'dry-run' && Number(summaryReport?.failed ?? 1) === 0 ? 'LIVE_PASS' : 'FAIL',
    source: path.relative(REPO_ROOT, SUMMARY_REPORT).replace(/\\/g, '/'),
    mode: summaryReport?.mode ?? null,
    rows_queued: summaryReport?.rows_queued ?? null,
    failed: summaryReport?.failed ?? null,
    wouldCallLlama: summaryReport?.wouldCallLlama ?? null,
    llamaCalls: summaryReport?.llamaCalls ?? null,
  },
  ontology_kag_readiness: {
    status: ontologyReport?.status === 'PASS' ? 'LIVE_PASS' : ontologyReport?.status === 'WARN' ? 'WARN' : 'FAIL',
    source: path.relative(REPO_ROOT, ONTOLOGY_REPORT).replace(/\\/g, '/'),
    candidates: ontologyReport?.candidates ?? null,
    weak_metrics: ontologyReport?.weak_metrics ?? [],
  },
};

const blockingLaneNames = ['embedding_qdrant_turbovec', 'active_ranker_envelope', 'summary_context_envelope', 'summary_test10'];
const hasFail = Object.values(lanes).some((lane) => lane.status === 'FAIL');
const hasWarn = Object.values(lanes).some((lane) => lane.status === 'WARN');
const hasBlockingFail = blockingLaneNames.some((name) => lanes[name]?.status === 'FAIL');
const report = {
  generated_at: new Date().toISOString(),
  status: hasFail ? 'FAIL' : hasWarn ? 'WARN' : 'LIVE_PASS',
  rule: 'Summary apply is allowed only when active ranker identity, score, provenance, and summary-context envelope are not FAIL.',
  candidates_file: path.relative(REPO_ROOT, CANDIDATES).replace(/\\/g, '/'),
  lanes,
  blocked_apply: hasBlockingFail,
  next_action: hasBlockingFail
    ? 'Fix failed ranker/envelope lane before summary apply.'
    : 'Ranker envelope is ready for bounded summary apply; ontology weak metrics remain prioritization guidance.',
};

fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
fs.writeFileSync(OUT_MD, [
  '# Ranker Envelope Readiness',
  '',
  `Generated: ${report.generated_at}`,
  `Status: ${report.status}`,
  `Blocked apply: ${report.blocked_apply}`,
  '',
  '| lane | status | notes |',
  '|---|---:|---|',
  ...Object.entries(lanes).map(([name, lane]) => `| ${name} | ${lane.status} | ${JSON.stringify(lane).replace(/\|/g, '/').slice(0, 500)} |`),
  '',
  `Next action: ${report.next_action}`,
  '',
].join('\n'), 'utf8');

console.log(JSON.stringify({
  status: report.status,
  blocked_apply: report.blocked_apply,
  lanes: Object.fromEntries(Object.entries(lanes).map(([key, value]) => [key, value.status])),
  out_json: OUT_JSON,
  out_md: OUT_MD,
}, null, 2));

process.exit(report.blocked_apply ? 1 : 0);
