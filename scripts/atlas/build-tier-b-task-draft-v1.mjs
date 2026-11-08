#!/usr/bin/env node
// TIER-B-DRAFT-01a/b: builds a human-review draft of OpenSpec TASK rows from the crosswalk (read-only).
//
// Tier B = evaluation-only. A task is a different object from the code-file packets in the Tier A drafts and has no admitted workspace
// revision, so rows here carry NO workspaceRevision (the Tier A exporter therefore rejects them) and `tier: "B"`. Nothing is promoted.
// Each row binds: stableKey, exact task text, the SHA-256 of the exact tasks.md bytes, and the UTF-8 byte range of the task line.
// `proposedDomain` is a transparent keyword proposal over the NES palette domains, used ONLY to balance the sample; it is not a label.
// Sampling is deterministic: candidates per domain are ordered by sha256(seed|stableKey) and capped (primary + reserve).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sha256Hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
const CHECKBOX = /^\s*[-*]\s*\[[ xX]\]\s*/;
const RESOLVED = new Set(['MATCHED_EXACT', 'RESOLVED_BY_TEXT', 'EXACT_SOURCE_LINE_MATCH', 'FILE_MATCHED_LINE_SEARCH']);

// Advisory keyword lexicon per palette domain (words only; not an authority). `general` is the fallback when nothing matches in v1.
export const V1_DOMAINS = ['auth', 'ui', 'retrieval', 'network', 'database', 'cache', 'agent', 'graph', 'ml', 'general'];

export const LEXICON = {
  auth: ['auth', 'login', 'session', 'token', 'permission', 'rbac', 'oauth', 'credential', 'csrf', 'password'],
  ui: ['svelte', 'component', 'modal', 'css', 'unocss', 'layout', 'button', 'rune', 'page', 'viewer', 'webgpu', 'render'],
  retrieval: ['retrieval', 'search', 'rerank', 'rrf', 'recall', 'embedding', 'semantic', 'qdrant', 'bm25', 'ann', 'topk', 'top-k'],
  network: ['http', 'grpc', 'rpc', 'endpoint', 'api', 'websocket', 'trpc', 'tls', 'sse', 'rabbitmq', 'fetch'],
  database: ['postgres', 'sql', 'drizzle', 'migration', 'schema', 'pgvector', 'index', 'transaction', 'table', 'column'],
  cache: ['cache', 'valkey', 'redis', 'bitfrost', 'lru', 'ttl', 'expiry', 'warm'],
  agent: ['agent', 'mcp', 'tool call', 'dspy', 'rlm', 'ornith', 'kanban', 'claim', 'planner', 'acp', 'a2a'],
  graph: ['graph', 'pagerank', 'neo4j', 'edge', 'node', 'louvain', 'dag', 'traversal', 'cugraph'],
  ml: ['model', 'train', 'tensor', 'cuda', 'gemm', 'quantiz', 'torch', 'classifier', 'gpu', 'kmeans', 'autoencoder'],
};

export const V2_EXTENSION_LEXICON = {
  compiler: ['compiler', 'tree-sitter', 'cst', 'ast', 'ast-grep', 'parser', 'grammar', 'lexer', 'token', 'codegen', 'syntax', 'cmake', 'llvm', 'nvcc', 'transpile'],
  devops: ['docker', 'compose', 'wsl2', 'service', 'systemd', 'caddy', 'healthcheck', 'ci', 'actions', 'deploy', 'k8s', 'powershell', 'environment'],
  'error-handling': ['recovery', 'circuit-breaker', 'retry', 'fallback', 'exception', 'panic', 'fail-closed', 'unhandled', 'rollback', 'reconcile', 'quarantine', 'diagnose'],
  test: ['vitest', 'playwright', 'unittest', 'assert', 'fixture', 'mock', 'rehearsal', 'smoke', 'benchmark', 'spec.ts', 'test.mjs', 'test.py', 'eval'],
  general: ['overview', 'briefing', 'general', 'meeting', 'notes', 'cleanup', 'todo', 'housekeeping', 'readme', 'documentation', 'blocked', 'gate', 'governance', 'policy', 'coordination'],
};

export function proposeDomain(text, options = {}) {
  const t = text.toLowerCase();
  const isV2 = Boolean(options.v2 || (Array.isArray(options.domains) && options.domains.length > 10));
  const activeLexicon = isV2 ? { ...LEXICON, ...V2_EXTENSION_LEXICON } : LEXICON;

  let best = null, bestScore = 0;
  for (const [domain, words] of Object.entries(activeLexicon)) {
    if (domain === 'general' && !isV2) continue; // In v1, general is fallback
    const score = words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
    if (score > bestScore) { best = domain; bestScore = score; }
  }

  if (isV2) {
    if (bestScore === 0) return 'UNRESOLVED_CANDIDATE';
    return best;
  }
  return best ?? 'general';
}

/** Pure core. `readBytes(sourceRef)` returns the exact file bytes or null. */
export function buildTierBDraft({ crosswalkRows, readBytes, seed = 'tier-b-v1', perDomain = 55, reservePerDomain = 15, domains = V1_DOMAINS }) {
  const isV2 = domains.length > 10;
  const cache = new Map();
  const load = (ref) => { if (!cache.has(ref)) { const b = readBytes(ref); cache.set(ref, b ? { bytes: b, sha: `sha256:${sha256Hex(b)}`, lines: b.toString('utf8').split('\n') } : null); } return cache.get(ref); };
  const skipped = {};
  const bySkip = (k) => { skipped[k] = (skipped[k] ?? 0) + 1; };
  const byDomain = Object.fromEntries(domains.map((d) => [d, []]));
  const seenKeys = new Set();

  for (const r of crosswalkRows) {
    const status = r.status || r.workboard_join_status;
    const stableKey = r.stableKey || r.canonical_task_key;
    const source = r.source || (r.source_ref ? r.source_ref.split('#')[0] : null);
    const line = r.line ?? (r.source_ref ? parseInt(r.source_ref.split('#L')[1], 10) : null);

    if (!RESOLVED.has(status) || !stableKey || !source || typeof line !== 'number' || isNaN(line)) { bySkip('NOT_RESOLVED'); continue; }
    if (seenKeys.has(stableKey)) { bySkip('DUPLICATE_STABLE_KEY'); continue; }
    seenKeys.add(stableKey);
    const f = load(source);
    if (!f) { bySkip('SOURCE_UNREADABLE'); continue; }
    const rawLine = f.lines[line - 1];
    if (rawLine === undefined || !CHECKBOX.test(rawLine)) { bySkip('LINE_NOT_A_TASK'); continue; }
    const lineText = rawLine.replace(/\r$/, '');
    const text = lineText.replace(CHECKBOX, '').trim();
    if (text.length < 12) { bySkip('TEXT_TOO_SHORT'); continue; }
    const before = Buffer.byteLength(f.lines.slice(0, line - 1).map((l) => `${l}\n`).join(''), 'utf8');
    const byteStart = before;
    const byteEnd = before + Buffer.byteLength(lineText, 'utf8');
    if (f.bytes.subarray(byteStart, byteEnd).toString('utf8') !== lineText) { bySkip('SPAN_MISMATCH'); continue; }
    let domain = proposeDomain(text, { v2: isV2, domains });
    if (domain === 'UNRESOLVED_CANDIDATE') { bySkip('UNMATCHED_V2_TEXT'); continue; }
    if (!byDomain[domain]) {
      if (isV2) { bySkip('UNMAPPED_DOMAIN'); continue; }
      domain = 'general';
    }
    byDomain[domain].push({
      id: `${stableKey}`, tier: 'B', stableKey, sourceRef: source, sourceGroup: source,
      featureLabel: stableKey.slice(0, stableKey.indexOf('#')), textEvidence: text,
      sourceRevision: f.sha, evidenceSpan: { byteStart, byteEnd }, proposedDomain: domain,
      reviewStatus: 'PROPOSED', canonical_authority: false,
      // deliberately no workspaceRevision: tasks have no admitted workspace snapshot (Tier B)
    });
  }

  const rows = [];
  const shortfalls = {};
  const counts = {};
  for (const d of domains) {
    const ordered = byDomain[d].sort((a, b) => sha256Hex(`${seed}|${a.stableKey}`).localeCompare(sha256Hex(`${seed}|${b.stableKey}`)));
    const picked = ordered.slice(0, perDomain + reservePerDomain).map((row, i) => ({ ...row, pool: i < perDomain ? 'PRIMARY' : 'RESERVE' }));
    counts[d] = { available: ordered.length, primary: Math.min(perDomain, ordered.length), reserve: Math.max(0, picked.length - perDomain) };
    if (ordered.length < perDomain) shortfalls[d] = perDomain - ordered.length;
    rows.push(...picked);
  }
  return { rows, summary: { seed, perDomain, reservePerDomain, counts, shortfalls, skipped, totalRows: rows.length } };
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const argOf = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  const crosswalk = argOf('--crosswalk');
  if (!crosswalk) { console.error('usage: --crosswalk <crosswalk.jsonl> [--root <repo>] [--out-dir <dir>] [--seed <s>] [--palette <palette.json>; default v1]'); process.exit(1); }
  const root = path.resolve(argOf('--root') ?? path.join(here, '..', '..'));
  const palette = JSON.parse(fs.readFileSync(argOf('--palette') ? path.resolve(argOf('--palette')) : path.join(here, 'data', 'nes-domain-palette-v1.json'), 'utf8'));
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const outDir = path.resolve(argOf('--out-dir') ?? path.join(root, '.tmp', 'atlas', `tier-b-task-draft-${stamp}`));
  const raw = fs.readFileSync(path.resolve(crosswalk));
  const crosswalkRows = raw.toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const { rows, summary } = buildTierBDraft({
    crosswalkRows, domains: Object.keys(palette.domains), seed: argOf('--seed') ?? 'tier-b-v1',
    readBytes: (ref) => { try { return fs.readFileSync(path.resolve(root, ref)); } catch { return null; } },
  });
  const receipt = { schema: 'atlas.tier-b-task-draft-receipt.v1', generatedAt: new Date().toISOString(), tier: 'B', evaluationOnly: true,
    crosswalkSha256: `sha256:${sha256Hex(raw)}`, paletteRevision: palette.revision, ...summary,
    note: 'Tier B: evaluation-only, no workspace revision, never promoted. proposedDomain is an advisory keyword proposal used to balance the sample, not a label.',
    canonicalAuthority: false, writesPerformed: false, localArtifactsWritten: true };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'tier-b-task-draft.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(outDir, 'tier-b-task-draft-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(`tier-b draft: ${rows.length} rows -> ${outDir}`);
  console.log('shortfalls vs target:', JSON.stringify(summary.shortfalls));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
