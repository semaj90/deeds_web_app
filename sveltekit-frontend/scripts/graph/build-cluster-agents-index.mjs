#!/usr/bin/env node
/**
 * build-cluster-agents-index.mjs
 *
 * Reads docs/graph/cluster-summaries.json and walks the directory tree to find
 * every AGENTS.md that covers files in each GPU cluster.  Outputs:
 *
 *   docs/graph/cluster-agents-index.json   — full index (loaded by build-codebase-relationships)
 *
 * Optionally writes Redis keys:
 *   ace:cluster:agents:{clusterId}   → compressed JSON (TTL 3600s)
 *
 * Usage:
 *   node scripts/graph/build-cluster-agents-index.mjs
 *   node scripts/graph/build-cluster-agents-index.mjs --redis   (also write to Redis)
 *   node scripts/graph/build-cluster-agents-index.mjs --print
 *
 * npm: "graph:cluster-agents": "node scripts/graph/build-cluster-agents-index.mjs"
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT       = resolve(__dirname, '../..');
const DOCS_GRAPH = resolve(ROOT, 'docs/graph');
const SRC_ROOT   = resolve(ROOT, 'src');

const args   = process.argv.slice(2);
const PRINT  = args.includes('--print');
const REDIS  = args.includes('--redis');

// ── helpers ───────────────────────────────────────────────────────────────────

function safeJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

/**
 * Given a repo-relative path like "src/lib/server/ace/context-assembler.ts",
 * walk upward looking for AGENTS.md starting from the file's own directory.
 * Returns the first match as a repo-relative path, or null if none found.
 */
function findNearestAgentsMd(relPath) {
  // Normalise to forward slashes, strip leading "src/"
  const norm = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
  // Build ancestor chain for the directory
  const parts = norm.split('/');
  // Drop the filename if it looks like a file (has an extension)
  const lastPart = parts[parts.length - 1];
  if (lastPart.includes('.')) parts.pop();

  // Walk upward: parts = ['src','lib','server','ace'] → check each level
  while (parts.length > 0) {
    const candidate = resolve(SRC_ROOT, '..', parts.join('/'), 'AGENTS.md');
    if (existsSync(candidate)) {
      // Return repo-relative form
      const rel = candidate.replace(/\\/g, '/');
      const idx = rel.indexOf('/src/');
      return idx !== -1 ? rel.slice(idx + 1) : rel.split('/').slice(-4).join('/');
    }
    parts.pop();
  }
  return null;
}

/**
 * Lightweight AGENTS.md parser — extracts summary, rules, tools, constraints.
 * Does NOT require the TypeScript parse-agents-md.ts (avoids transpile dependency).
 */
function parseAgentsMd(absPath) {
  let raw = '';
  try { raw = readFileSync(absPath, 'utf8'); } catch { return null; }

  const lines = raw.split('\n');

  // title: first H1
  const titleLine = lines.find(l => /^#\s+/.test(l));
  const title = titleLine ? titleLine.replace(/^#+\s*/, '').trim() : '';

  // summary: first non-empty paragraph after the H1 (or after the generated marker)
  let summaryLines = [];
  let inSummary = false;
  for (const l of lines) {
    if (/^#\s+/.test(l)) { inSummary = true; continue; }
    if (inSummary && l.trim().startsWith('<!--')) continue;
    if (inSummary && l.trim().startsWith('>')) {
      summaryLines.push(l.replace(/^>\s*/, '').trim());
      if (summaryLines.length >= 3) break;
    } else if (inSummary && l.trim() && !l.startsWith('#')) {
      summaryLines.push(l.trim());
      if (summaryLines.length >= 2) break;
    }
  }
  const summary = summaryLines.join(' ').slice(0, 200);

  // rules: bullets under Rules|Conventions|Standards|Guidelines OR the auto-gen
  // Snapshot / Retrieval Rerank Hints sections (the common AGENTS-GEN format)
  const ruleHeadRe = /^#{1,3}\s+(Rules|Conventions|Standards|Guidelines|Constraints|Forbidden|Snapshot|Retrieval|Rerank|Hints|Purpose|Patterns)/i;
  const rules = [];
  let inRules = false;
  for (const l of lines) {
    if (ruleHeadRe.test(l)) { inRules = true; continue; }
    if (/^#{1,3}\s+/.test(l)) { inRules = false; continue; }
    if (inRules && /^[-*]\s+/.test(l)) {
      const rule = l.replace(/^[-*]\s+/, '').replace(/\[.*?\]/g, '').replace(/<!--.*?-->/g, '').trim();
      // Skip auto-gen audit snapshot lines (metrics, not semantic rules)
      const isAuditNoise = /^(Audit score|no audit|file\(s\)|handler\(s\)|Tags:|Paired tests|_\(not yet|run `graphify)/.test(rule);
      if (rule.length > 8 && !rule.startsWith('`src/') && !isAuditNoise) rules.push(rule.slice(0, 120));
    }
    // Also capture blockquote lines in hint sections (> **Key**: value)
    if (inRules && /^>\s+/.test(l)) {
      const hint = l.replace(/^>\s+/, '').replace(/\*\*/g, '').trim();
      if (hint.length > 5 && !hint.startsWith('<!--')) rules.push(hint.slice(0, 120));
    }
  }

  // tools: extract tool names from lines that mention trace.|graph.|topology.|cluster.
  const toolRe = /\b(trace\.\w+|graph\.\w+|topology\.\w+|cluster\.\w+|ace\.\w+)\b/g;
  const toolsFound = new Set();
  for (const l of lines) {
    const m = l.matchAll(toolRe);
    for (const [t] of m) toolsFound.add(t);
  }

  // key terms: extract backtick-quoted identifiers (camelCase / snake_case)
  const termRe = /`([a-zA-Z][a-zA-Z0-9_]{2,40})`/g;
  const terms = new Set();
  for (const l of lines.slice(0, 60)) {
    for (const [, t] of l.matchAll(termRe)) {
      if (!/^(npm|run|node|true|false|null|undefined|const|let|var|async|await|return|import|export)$/.test(t)) {
        terms.add(t);
      }
    }
  }

  return {
    title,
    summary,
    rules: rules.slice(0, 12),
    tools: [...toolsFound].slice(0, 10),
    keyTerms: [...terms].slice(0, 20),
  };
}

// ── load cluster-summaries.json ───────────────────────────────────────────────

const cs = safeJson(join(DOCS_GRAPH, 'cluster-summaries.json'));
if (!cs?.clusters) {
  console.error('[build-cluster-agents-index] cluster-summaries.json not found — run graphify:cluster-summaries first');
  process.exit(1);
}

// ── build AGENTS.md cache (parse once per unique path) ───────────────────────

const agentsMdCache = new Map(); // absPath → parsed content

function getOrParseMd(relPath) {
  const absPath = resolve(ROOT, relPath);
  if (agentsMdCache.has(absPath)) return agentsMdCache.get(absPath);
  const parsed = parseAgentsMd(absPath);
  agentsMdCache.set(absPath, parsed);
  return parsed;
}

// ── process each cluster ──────────────────────────────────────────────────────

const clusterEntries = [];
let totalWithCoverage = 0;

for (const c of cs.clusters) {
  // Gather candidate paths: representativePaths (directories) + topFiles
  const candidates = [
    ...(c.representativePaths ?? []),
    ...(c.metadata?.topFiles ?? []),
    ...(c.tags ?? []).filter(t => t.startsWith('src/')),  // tags sometimes hold file paths
  ];

  const agentsMdSet = new Set();
  for (const p of candidates) {
    const found = findNearestAgentsMd(p);
    if (found) agentsMdSet.add(found);
  }

  // Merge parsed content from all found AGENTS.md files
  const mergedRules   = [];
  const mergedTools   = new Set();
  const mergedTerms   = new Set();
  const summaries     = [];

  for (const relMd of agentsMdSet) {
    const parsed = getOrParseMd(relMd);
    if (!parsed) continue;
    if (parsed.summary) summaries.push(parsed.summary);
    mergedRules.push(...parsed.rules);
    parsed.tools.forEach(t => mergedTools.add(t));
    parsed.keyTerms.forEach(t => mergedTerms.add(t));
  }

  // coverage = fraction of candidate paths that resolved to an AGENTS.md
  const coveredPaths = candidates.filter(p => findNearestAgentsMd(p) !== null).length;
  const coverage     = candidates.length > 0 ? coveredPaths / candidates.length : 0;

  // Top directory for this cluster (most common ancestor of representativePaths)
  const topDir = (c.representativePaths ?? [])[0] ?? '';

  if (agentsMdSet.size > 0) totalWithCoverage++;

  clusterEntries.push({
    clusterId:     c.clusterId,
    memberCount:   c.memberCount,
    bowTerms:      c.bowTerms ?? [],
    topDir,
    agentsMdFiles: [...agentsMdSet].sort(),
    agentsMdCount: agentsMdSet.size,
    coverage:      Math.round(coverage * 100) / 100,
    mergedRules:   [...new Set(mergedRules)].slice(0, 15),
    toolsAllowed:  [...mergedTools].slice(0, 12),
    keyTerms:      [...mergedTerms].slice(0, 25),
    // Prefer the cluster's own LLM summary (natural language) over AGENTS.md audit text
    aceHint: (c.summary?.length > 20 ? c.summary : summaries.slice(0, 2).join(' ')).slice(0, 300),
  });
}

// Sort: uncovered large clusters first (P0 at the top for visibility)
clusterEntries.sort((a, b) => {
  const aScore = a.coverage === 0 ? -a.memberCount : 0;
  const bScore = b.coverage === 0 ? -b.memberCount : 0;
  return aScore - bScore;
});

// ── write cluster-agents-index.json ──────────────────────────────────────────

const index = {
  generatedAt:        new Date().toISOString(),
  clusterCount:       cs.clusters.length,
  totalWithCoverage,
  totalWithoutCoverage: cs.clusters.length - totalWithCoverage,
  agentsMdUnique:     agentsMdCache.size,
  clusters:           clusterEntries,
};

const outPath = join(DOCS_GRAPH, 'cluster-agents-index.json');
writeFileSync(outPath, JSON.stringify(index, null, 2), 'utf-8');

// ── optional Redis write ──────────────────────────────────────────────────────

if (REDIS) {
  try {
    const { createClient } = await import('redis');
    const redis = createClient({ url: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379' });
    await redis.connect();

    const pipeline = redis.multi();
    for (const c of clusterEntries) {
      const key = `ace:cluster:agents:${c.clusterId}`;
      const val = JSON.stringify({
        clusterId:    c.clusterId,
        memberCount:  c.memberCount,
        coverage:     c.coverage,
        agentsMdCount:c.agentsMdCount,
        mergedRules:  c.mergedRules.slice(0, 8),
        toolsAllowed: c.toolsAllowed,
        keyTerms:     c.keyTerms.slice(0, 12),
        aceHint:      c.aceHint.slice(0, 200),
      });
      pipeline.setEx(key, 3600, val);
    }
    await pipeline.exec();
    await redis.quit();
    console.log(`[build-cluster-agents-index] wrote ${clusterEntries.length} keys to Redis (TTL 3600s)`);
  } catch (e) {
    console.warn('[build-cluster-agents-index] Redis write skipped:', e.message);
  }
}

// ── summary ───────────────────────────────────────────────────────────────────

if (PRINT) {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  Cluster → AGENTS.md Index                          ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
  console.log(`Clusters total   : ${cs.clusters.length}`);
  console.log(`With coverage    : ${totalWithCoverage}`);
  console.log(`Without coverage : ${cs.clusters.length - totalWithCoverage}`);
  console.log(`Unique AGENTS.md : ${agentsMdCache.size}`);
  console.log('');
  console.log('Uncovered clusters (P0):');
  for (const c of clusterEntries.filter(c => c.coverage === 0 && c.memberCount > 50).slice(0, 10)) {
    console.log(`  cluster:${c.clusterId}  ${c.memberCount} files  topDir: ${c.topDir}`);
  }
  console.log('');
  console.log(`Written: ${outPath}`);
} else {
  console.log(`[build-cluster-agents-index] clusters=${cs.clusters.length} covered=${totalWithCoverage} agentsMdParsed=${agentsMdCache.size} → ${outPath}`);
}
