#!/usr/bin/env node
/**
 * audit-neo4j-codebasefile-identity-v1.mjs
 *
 * Read-only. Quantifies the CodebaseFile path-identity fragmentation found
 * live 2026-09-08 while testing whether the existing multi-hop graph tools
 * (mcp__trace__graph_expand_neighborhood etc.) work: stableKey is NULL on
 * every CodebaseFile node, and three incompatible path schemes coexist
 * (clean relative path, stale agent-worktree path, absolute Windows path).
 *
 * This script does not write anything to Neo4j. It classifies every
 * CodebaseFile node, and for the two non-clean schemes, checks whether a
 * "sibling" clean-relative-path node for the same logical file already
 * exists (which would make the non-clean node a true duplicate, not just
 * mis-keyed) — sizing the problem precisely before any repair is designed.
 *
 * Usage: node scripts/atlas/audit-neo4j-codebasefile-identity-v1.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, loadRepoEnv } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const NEO4J_PASSWORD = env.NEO4J_PASSWORD;
const NEO4J_CONTAINER = env.NEO4J_CONTAINER || 'legal-ai-neo4j';
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'neo4j-codebasefile-identity-audit-v1.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'neo4j-codebasefile-identity-audit-v1.md');

function cypher(query) {
  const out = execFileSync(
    'docker',
    ['exec', NEO4J_CONTAINER, 'cypher-shell', '-u', 'neo4j', '-p', NEO4J_PASSWORD, '--format', 'plain', query],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return out;
}

function parsePlainRows(raw) {
  // cypher-shell --format plain emits a header line then one line per row,
  // fields comma-separated and quoted. Good enough for the scalar/count
  // queries this audit runs (no embedded commas in values we select).
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 1) return [];
  const header = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i]; });
    return row;
  });
}

function main() {
  if (!NEO4J_PASSWORD) {
    console.error('NEO4J_PASSWORD not resolved from repo env — aborting (read-only audit still requires credentials).');
    process.exitCode = 1;
    return;
  }

  const report = {
    schema: 'atlas.neo4j-codebasefile-identity-audit.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    writesPerformed: false,
  };

  // ── 1. Scheme classification, total counts ──
  const schemeRows = parsePlainRows(cypher(`
    MATCH (n:CodebaseFile)
    RETURN
      CASE
        WHEN n.stableKey IS NOT NULL THEN 'HAS_STABLEKEY'
        WHEN n.path CONTAINS '.claude/worktrees' THEN 'STALE_WORKTREE_PATH'
        WHEN n.filePath CONTAINS ':/' THEN 'ABSOLUTE_WINDOWS_PATH'
        WHEN n.path IS NOT NULL THEN 'CLEAN_RELATIVE_PATH'
        ELSE 'OTHER'
      END AS scheme,
      count(*) AS n
    ORDER BY n DESC;
  `));
  report.schemeCounts = schemeRows;
  const totalNodes = schemeRows.reduce((sum, r) => sum + Number(r.n), 0);
  report.totalCodebaseFileNodes = totalNodes;

  // ── 2. Label combination breakdown (CodebaseFile alone vs CodebaseFile+ParentAtlasSource) ──
  const labelRows = parsePlainRows(cypher(`
    MATCH (n:CodebaseFile)
    RETURN labels(n) AS labels, count(*) AS n
    ORDER BY n DESC;
  `));
  report.labelCombinations = labelRows;

  // ── 3/4. Sibling overlap for stale-worktree and absolute-path nodes, computed in JS
  // (no APOC dependency assumed — fetch the raw path/filePath values and strip prefixes here). ──
  const cleanPathRows = parsePlainRows(cypher(`
    MATCH (n:CodebaseFile) WHERE n.path IS NOT NULL AND NOT n.path CONTAINS '.claude/worktrees'
    RETURN n.path AS path;
  `));
  const cleanPathSet = new Set(cleanPathRows.map((r) => r.path));

  const staleRows = parsePlainRows(cypher(`
    MATCH (n:CodebaseFile) WHERE n.path CONTAINS '.claude/worktrees'
    RETURN n.path AS path;
  `));
  const worktreePrefixRe = /\.claude\/worktrees\/[^/]+\/sveltekit-frontend\/(.*)$/;
  let staleWithCleanSibling = 0;
  let staleUnstrippable = 0;
  for (const r of staleRows) {
    const m = worktreePrefixRe.exec(r.path ?? '');
    if (!m) { staleUnstrippable++; continue; }
    if (cleanPathSet.has(m[1])) staleWithCleanSibling++;
  }
  report.staleWorktreeSiblingCheck = {
    staleCount: staleRows.length,
    staleWithCleanSibling,
    staleUnstrippable,
  };

  const absRows = parsePlainRows(cypher(`
    MATCH (n:CodebaseFile) WHERE n.filePath CONTAINS ':/'
    RETURN n.filePath AS filePath;
  `));
  const absPrefixRe = /sveltekit-frontend\/(.*)$/;
  let absWithCleanSibling = 0;
  let absUnstrippable = 0;
  for (const r of absRows) {
    const m = absPrefixRe.exec((r.filePath ?? '').replace(/\\/g, '/'));
    if (!m) { absUnstrippable++; continue; }
    if (cleanPathSet.has(m[1])) absWithCleanSibling++;
  }
  report.absolutePathSiblingCheck = {
    absCount: absRows.length,
    absWithCleanSibling,
    absUnstrippable,
  };

  // ── 5. stableKey property coverage sanity check across ALL node labels (not just CodebaseFile) ──
  const stableKeyCoverageRows = parsePlainRows(cypher(`
    MATCH (n) WHERE n.stableKey IS NOT NULL
    RETURN labels(n) AS labels, count(*) AS n
    ORDER BY n DESC LIMIT 20;
  `));
  report.stableKeyCoverageAcrossLabels = stableKeyCoverageRows;

  mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);

  const md = `# Neo4j CodebaseFile Identity Audit — ${report.generatedAt}

**Read-only.** Zero writes performed.

## Scheme counts (${totalNodes} total CodebaseFile nodes)

| Scheme | Count |
|---|---|
${schemeRows.map((r) => `| ${r.scheme} | ${r.n} |`).join('\n')}

## Label combinations

| Labels | Count |
|---|---|
${labelRows.map((r) => `| ${r.labels} | ${r.n} |`).join('\n')}

## stableKey coverage across ALL node labels (top 20)

${stableKeyCoverageRows.length ? stableKeyCoverageRows.map((r) => `- ${r.labels}: ${r.n}`).join('\n') : '- none found — stableKey property has zero coverage repo-wide, not just on CodebaseFile'}

## Stale-worktree sibling overlap

${JSON.stringify(report.staleWorktreeSiblingCheck)}

## Absolute-path sibling overlap

${JSON.stringify(report.absolutePathSiblingCheck)}
`;
  writeFileSync(REPORT_MD, md);

  console.log(JSON.stringify({ totalNodes, schemeCounts: schemeRows, reportPath: 'docs/reports/neo4j-codebasefile-identity-audit-v1.json' }, null, 2));
}

main();
