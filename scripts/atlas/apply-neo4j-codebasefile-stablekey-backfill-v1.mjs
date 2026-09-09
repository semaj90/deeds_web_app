#!/usr/bin/env node
/**
 * apply-neo4j-codebasefile-stablekey-backfill-v1.mjs
 *
 * Fixes the root cause found while testing the existing multi-hop graph
 * tools (mcp__trace__graph_expand_neighborhood etc.) on 2026-09-08:
 * stableKey is NULL on all 69,009 CodebaseFile nodes, so those tools return
 * empty results for every query regardless of whether real data exists.
 * See docs/reports/neo4j-codebasefile-identity-audit-v1.json for the
 * read-only audit this apply is based on.
 *
 * Two additive, non-destructive writes — no node or relationship is ever
 * deleted:
 *   1. SET stableKey = 'file:' + path on every clean-relative-path
 *      CodebaseFile node (58,569 nodes) that doesn't already have one.
 *      This alone unblocks the multi-hop tools for the 85% majority.
 *   2. TAG (not merge, not delete) the confirmed-duplicate stale-worktree
 *      (5,410 of 6,773) and absolute-Windows-path (2,257 of 2,404) nodes
 *      with dataQualityFlag + duplicateOfPath, so a future pass can decide
 *      whether to merge relationships onto the canonical node. The
 *      remaining 1,355 + 147 nodes with no clean sibling are left
 *      completely untouched — they need separate investigation, not a
 *      guessed fix.
 *
 * Default mode is DRY RUN (counts only, zero writes). Pass --apply to write.
 *
 * Usage:
 *   node scripts/atlas/apply-neo4j-codebasefile-stablekey-backfill-v1.mjs           # dry run
 *   node scripts/atlas/apply-neo4j-codebasefile-stablekey-backfill-v1.mjs --apply   # write
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, loadRepoEnv } from './connection-config.mjs';

const APPLY = process.argv.includes('--apply');
const env = loadRepoEnv(process.env);
const NEO4J_PASSWORD = env.NEO4J_PASSWORD;
const NEO4J_CONTAINER = env.NEO4J_CONTAINER || 'legal-ai-neo4j';
const REPORT_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'neo4j-codebasefile-stablekey-backfill-apply-v1.json');

function cypher(query) {
  return execFileSync(
    'docker',
    ['exec', NEO4J_CONTAINER, 'cypher-shell', '-u', 'neo4j', '-p', NEO4J_PASSWORD, '--format', 'plain', query],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
}

function firstCount(raw, field = 'n') {
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return 0;
  const header = lines[0].split(',').map((h) => h.trim());
  const idx = header.indexOf(field);
  const cells = lines[1].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  return Number(cells[idx] ?? 0);
}

function main() {
  if (!NEO4J_PASSWORD) {
    console.error('NEO4J_PASSWORD not resolved — aborting.');
    process.exitCode = 1;
    return;
  }

  const report = {
    schema: 'atlas.neo4j-codebasefile-stablekey-backfill-apply.v1',
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'APPLY' : 'DRY_RUN',
    writesPerformed: false,
  };

  // ── Step 1: eligible count for stableKey backfill (clean nodes, no existing stableKey) ──
  const step1EligibleCount = firstCount(cypher(`
    MATCH (n:CodebaseFile)
    WHERE n.path IS NOT NULL AND NOT n.path CONTAINS '.claude/worktrees' AND n.stableKey IS NULL
    RETURN count(n) AS n;
  `));
  report.step1_stableKeyBackfill = { eligibleCount: step1EligibleCount };

  // ── Step 2a: eligible count for stale-worktree duplicate tagging ──
  const step2aEligibleCount = firstCount(cypher(`
    MATCH (stale:CodebaseFile)
    WHERE stale.path CONTAINS '.claude/worktrees' AND stale.dataQualityFlag IS NULL
    WITH stale, split(stale.path, '/sveltekit-frontend/')[1] AS stripped
    WHERE stripped IS NOT NULL
    MATCH (clean:CodebaseFile { path: stripped })
    RETURN count(stale) AS n;
  `));
  report.step2a_staleWorktreeTagging = { eligibleCount: step2aEligibleCount };

  // ── Step 2b: eligible count for absolute-path duplicate tagging ──
  const step2bEligibleCount = firstCount(cypher(`
    MATCH (abs:CodebaseFile)
    WHERE abs.filePath CONTAINS ':/' AND abs.dataQualityFlag IS NULL
    WITH abs, split(replace(abs.filePath, '\\\\', '/'), '/sveltekit-frontend/')[1] AS stripped
    WHERE stripped IS NOT NULL
    MATCH (clean:CodebaseFile { path: stripped })
    RETURN count(abs) AS n;
  `));
  report.step2b_absolutePathTagging = { eligibleCount: step2bEligibleCount };

  if (!APPLY) {
    report.result = 'DRY_RUN_ONLY';
    console.log(JSON.stringify(report, null, 2));
    mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  // ── Apply, one Cypher statement per step, each idempotent (re-running is a no-op) ──
  const step1Written = firstCount(cypher(`
    MATCH (n:CodebaseFile)
    WHERE n.path IS NOT NULL AND NOT n.path CONTAINS '.claude/worktrees' AND n.stableKey IS NULL
    SET n.stableKey = 'file:' + n.path
    RETURN count(n) AS n;
  `));
  report.step1_stableKeyBackfill.written = step1Written;

  const step2aWritten = firstCount(cypher(`
    MATCH (stale:CodebaseFile)
    WHERE stale.path CONTAINS '.claude/worktrees' AND stale.dataQualityFlag IS NULL
    WITH stale, split(stale.path, '/sveltekit-frontend/')[1] AS stripped
    WHERE stripped IS NOT NULL
    MATCH (clean:CodebaseFile { path: stripped })
    SET stale.dataQualityFlag = 'DUPLICATE_STALE_WORKTREE_PATH', stale.duplicateOfPath = stripped, stale.flaggedAt = datetime()
    RETURN count(stale) AS n;
  `));
  report.step2a_staleWorktreeTagging.written = step2aWritten;

  const step2bWritten = firstCount(cypher(`
    MATCH (abs:CodebaseFile)
    WHERE abs.filePath CONTAINS ':/' AND abs.dataQualityFlag IS NULL
    WITH abs, split(replace(abs.filePath, '\\\\', '/'), '/sveltekit-frontend/')[1] AS stripped
    WHERE stripped IS NOT NULL
    MATCH (clean:CodebaseFile { path: stripped })
    SET abs.dataQualityFlag = 'DUPLICATE_ABSOLUTE_PATH', abs.duplicateOfPath = stripped, abs.flaggedAt = datetime()
    RETURN count(abs) AS n;
  `));
  report.step2b_absolutePathTagging.written = step2bWritten;

  report.result = 'APPLIED';
  report.writesPerformed = step1Written + step2aWritten + step2bWritten > 0;

  console.log(JSON.stringify(report, null, 2));
  mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
}

main();
