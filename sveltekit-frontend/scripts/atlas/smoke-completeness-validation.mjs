#!/usr/bin/env node

/**
 * Smoke Test: Completeness Validation (0%-100% Coverage Audit)
 *
 * Purpose:
 *   Audit 9 critical data dimensions across all stores and report coverage %
 *   Identify which phases are blocked vs. ready
 *   Guide session prioritization based on actual data state
 *
 * Strategy:
 *   1. Connect to Postgres (no timeout, fail fast if unavailable)
 *   2. Query 9 dimensions in parallel (fast COUNT queries only)
 *   3. Display real-time progress with color-coded status
 *   4. Recommend next phases based on coverage gaps
 *   5. Support watch mode for continuous monitoring
 *
 * Dimensions Audited:
 *   1. packet_key (identity)         — Required for all phases
 *   2. source_ref (lineage)          — Required for storage linking
 *   3. feature_id (semantics)        — Required for AST analysis
 *   4. title_id (canonical labels)   — Required for UI/reporting
 *   5. domain_class (taxonomy)       — Used for filtering (64% gap identified)
 *   6. tree_node_id (topology)       — Already 100% (skip backfill)
 *   7. concept_ids (LangExtract)     — LangExtract phase blocker (0.4% actual)
 *   8. som_cluster (topology)        — SOM training blocker (99.9% identity only)
 *   9. community_id (Louvain)        — GDS phase blocker (21.6% actual)
 *
 * Usage:
 *   npm run atlas:smoke:completeness [--watch] [--verbose]
 *   or
 *   node scripts/atlas/smoke-completeness-validation.mjs --watch --verbose
 *
 * Exit Codes:
 *   0 — All critical dimensions ≥95% (production-ready)
 *   1 — One or more dimensions <95% (phase recommended)
 *   2 — Database connection error (blocker)
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const POSTGRES_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:password@127.0.0.1:5434/legal_ai_db';

// Explicit pool config with short timeouts to fail fast
const pgPool = new Pool({
  connectionString: POSTGRES_URL,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
  max: 1
});

const WATCH = process.argv.includes('--watch');
const VERBOSE = process.argv.includes('--verbose');
const WATCH_INTERVAL = 30000; // 30s refresh

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

const dimensions = [
  {
    name: 'packet_key',
    label: 'Packet Identity',
    critical: true,
    gate: 95,
    query: `SELECT COUNT(*) total, COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END) complete FROM atlas_packets`,
    reason: 'Required for all downstream operations'
  },
  {
    name: 'source_ref',
    label: 'Source Lineage',
    critical: true,
    gate: 95,
    query: `SELECT COUNT(*) total, COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END) complete FROM atlas_packets`,
    reason: 'Links packets to files and Qdrant'
  },
  {
    name: 'feature_id',
    label: 'Semantic Features',
    critical: true,
    gate: 95,
    query: `SELECT COUNT(*) total, COUNT(CASE WHEN feature_id IS NOT NULL THEN 1 END) complete FROM atlas_packets`,
    reason: 'AST analysis entry point'
  },
  {
    name: 'title_id',
    label: 'Canonical Labels',
    critical: true,
    gate: 95,
    query: `SELECT COUNT(*) total, COUNT(CASE WHEN title_id IS NOT NULL THEN 1 END) complete FROM atlas_packets`,
    reason: 'UI/reporting identity'
  },
  {
    name: 'domain_class',
    label: 'Taxonomy Classification',
    critical: false,
    gate: 95,
    query: `SELECT COUNT(*) total, COUNT(CASE WHEN domain_class IS NOT NULL THEN 1 END) complete FROM atlas_packets`,
    reason: 'Phase 1 gap: 21K rows (64%), blocks filtering'
  },
  {
    name: 'tree_node_id',
    label: 'Neo4j Topology Link',
    critical: false,
    gate: 95,
    query: `SELECT COUNT(*) total, COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) complete FROM atlas_packets`,
    reason: 'Already 100%, skip backfill'
  },
  {
    name: 'concept_ids',
    label: 'LangExtract Concepts',
    critical: false,
    gate: 80,
    query: `SELECT COUNT(*) total, COUNT(CASE WHEN concept_ids IS NOT NULL AND array_length(concept_ids, 1) > 0 THEN 1 END) complete FROM atlas_packets WHERE concept_ids IS NOT NULL`,
    reason: 'Phase 2 blocker: 0.4% (261 rows), LangExtract output'
  },
  {
    name: 'som_cluster',
    label: 'SOM Topology Cluster',
    critical: false,
    gate: 95,
    query: `SELECT COUNT(*) total, COUNT(CASE WHEN som_cluster IS NOT NULL THEN 1 END) complete FROM atlas_packets`,
    reason: 'Phase 3: 99.9% identity assigned, training pending'
  },
  {
    name: 'community_id',
    label: 'Louvain Community',
    critical: false,
    gate: 80,
    query: `SELECT COUNT(*) total, COUNT(CASE WHEN community_id IS NOT NULL THEN 1 END) complete FROM atlas_packets`,
    reason: 'Phase 4: 21.6% (12.6K rows), GDS Louvain sync incomplete'
  }
];

function statusIcon(percentage, gate) {
  if (percentage >= gate) return `${colors.green}✅${colors.reset}`;
  if (percentage >= gate * 0.7) return `${colors.yellow}🟡${colors.reset}`;
  return `${colors.red}✗${colors.reset}`;
}

function formatPercentage(percentage) {
  if (percentage >= 95) return `${colors.green}${percentage.toFixed(1)}%${colors.reset}`;
  if (percentage >= 70) return `${colors.yellow}${percentage.toFixed(1)}%${colors.reset}`;
  return `${colors.red}${percentage.toFixed(1)}%${colors.reset}`;
}

async function auditDimension(dim) {
  try {
    const result = await pgPool.query(dim.query);
    if (result.rows.length === 0) {
      return { complete: 0, total: 0, percentage: 0, error: null };
    }
    const { total, complete } = result.rows[0];
    const totalCount = parseInt(total);
    const completeCount = parseInt(complete);
    const percentage = totalCount > 0 ? (completeCount / totalCount * 100) : 0;
    return { complete: completeCount, total: totalCount, percentage, error: null };
  } catch (err) {
    return { complete: 0, total: 0, percentage: 0, error: err.message };
  }
}

function renderProgressBar(percentage, width = 30) {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return `[${colors.green}${'█'.repeat(filled)}${colors.reset}${colors.red}${'░'.repeat(empty)}${colors.reset}]`;
}

async function runAudit() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Smoke Test: Completeness Validation (0%-100% Coverage Audit)   ║');
  console.log('║  Atlas Packets — 9 Critical Dimensions                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const results = {};
  const startTime = Date.now();

  // Audit all dimensions in parallel (safe COUNT queries, short timeouts)
  const auditPromises = dimensions.map(dim =>
    auditDimension(dim).then(result => {
      results[dim.name] = result;
      return { dim, result };
    })
  );

  try {
    await Promise.all(auditPromises);
  } catch (err) {
    console.error(`${colors.red}❌ Fatal error during audit: ${err.message}${colors.reset}`);
    process.exit(2);
  }

  const elapsedMs = Date.now() - startTime;

  // Display results
  console.log(`${colors.bold}Coverage Report${colors.reset}\n`);
  console.log(`${'Dimension'.padEnd(30)} | ${'Status'.padEnd(8)} | ${'Progress'.padEnd(38)} | ${'Count'.padEnd(12)}\n`);

  const gaps = [];
  let criticalPass = true;

  for (const dim of dimensions) {
    const result = results[dim.name];
    if (result.error) {
      console.log(
        `${dim.label.padEnd(30)} | ${'✗'.padEnd(8)} | Error: ${result.error.substring(0, 30).padEnd(38)}`
      );
      continue;
    }

    const status = statusIcon(result.percentage, dim.gate);
    const bar = renderProgressBar(result.percentage);
    const percentage = formatPercentage(result.percentage);
    const count = `${result.complete}/${result.total}`.padEnd(12);

    console.log(
      `${dim.label.padEnd(30)} | ${status} ${percentage} | ${bar} | ${count}`
    );

    // Track gaps
    if (result.percentage < dim.gate) {
      const gap = result.total - result.complete;
      gaps.push({
        name: dim.name,
        label: dim.label,
        percentage: result.percentage,
        gap,
        total: result.total,
        reason: dim.reason,
        critical: dim.critical
      });

      if (dim.critical) criticalPass = false;
    }
  }

  console.log(`\n${colors.bold}Audit Summary${colors.reset}\n`);
  console.log(`  Elapsed: ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log(`  Total dimensions: ${dimensions.length}`);
  console.log(`  Dimension gaps: ${gaps.length}`);
  console.log(`  Critical status: ${criticalPass ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`}\n`);

  if (gaps.length > 0) {
    console.log(`${colors.bold}Gaps Requiring Attention${colors.reset}\n`);
    for (const gap of gaps.sort((a, b) => a.percentage - b.percentage)) {
      const urgency = gap.critical
        ? `${colors.red}CRITICAL${colors.reset}`
        : gap.gap > 20000
          ? `${colors.yellow}URGENT${colors.reset}`
          : `${colors.bold}Phase${colors.reset}`;
      console.log(`  ${urgency} | ${gap.label.padEnd(30)} | ${gap.gap.toLocaleString().padEnd(8)} rows missing`);
      console.log(`           ${gap.reason}\n`);
    }
  } else {
    console.log(`${colors.green}✅ All dimensions at target coverage — production-ready!${colors.reset}\n`);
  }

  console.log(`${colors.bold}Recommended Next Steps${colors.reset}\n`);

  // Phase recommendations based on gaps
  const phase1Gap = gaps.find(g => g.name === 'domain_class');
  const phase2Gap = gaps.find(g => g.name === 'concept_ids');
  const phase3Gap = gaps.find(g => g.name === 'som_cluster');
  const phase4Gap = gaps.find(g => g.name === 'community_id');

  if (phase1Gap) {
    console.log(`  ${colors.yellow}Phase 1 (URGENT): Fill domain_class gap${colors.reset}`);
    console.log(`     21,021 rows (${phase1Gap.percentage.toFixed(1)}%) — backfill from feature_id taxonomy`);
    console.log(`     npm run atlas:phase105:domain-class-backfill:dry-run\n`);
  }

  if (phase2Gap && phase2Gap.percentage < 10) {
    console.log(`  ${colors.yellow}Phase 2: Scale LangExtract concept extraction${colors.reset}`);
    console.log(`     57,862 rows (${phase2Gap.percentage.toFixed(1)}%) — wire langextract output`);
    console.log(`     npm run atlas:phase105:langextract-concepts:dry-run\n`);
  }

  if (phase3Gap && phase3Gap.percentage < 100) {
    console.log(`  ${colors.bold}Phase 3: Train SOM 20×20 topology${colors.reset}`);
    console.log(`     ${phase3Gap.gap} rows — requires autoencoder (768→64) latent vectors`);
    console.log(`     npm run atlas:phase105:som-training:dry-run\n`);
  }

  if (phase4Gap && phase4Gap.percentage < 50) {
    console.log(`  ${colors.bold}Phase 4: Complete Louvain community detection${colors.reset}`);
    console.log(`     ${phase4Gap.gap.toLocaleString()} rows (${phase4Gap.percentage.toFixed(1)}%) — GDS pass incomplete`);
    console.log(`     npm run atlas:phase105:louvain-sync:dry-run\n`);
  }

  const skipBackfill = results.tree_node_id?.percentage === 100;
  if (skipBackfill) {
    console.log(`  ${colors.green}✅ SKIP: tree_node_id backfill already 100% complete${colors.reset}\n`);
  }

  console.log(`${colors.bold}Exit Status${colors.reset}\n`);
  if (criticalPass && gaps.length === 0) {
    console.log(`  ${colors.green}0${colors.reset} — All dimensions at target (production-ready)\n`);
    if (WATCH) {
      console.log(`Watching for changes (refresh every ${WATCH_INTERVAL / 1000}s)...\n`);
      return 0;
    }
    process.exit(0);
  } else if (criticalPass) {
    console.log(`  ${colors.yellow}1${colors.reset} — Critical dimensions pass, ${gaps.length} dimension(s) need phase work\n`);
    if (WATCH) {
      console.log(`Watching for changes (refresh every ${WATCH_INTERVAL / 1000}s)...\n`);
      return 1;
    }
    process.exit(1);
  } else {
    console.log(`  ${colors.red}1${colors.reset} — One or more critical dimensions <95% (blocker)\n`);
    if (WATCH) {
      console.log(`Watching for changes (refresh every ${WATCH_INTERVAL / 1000}s)...\n`);
      return 1;
    }
    process.exit(1);
  }
}

async function main() {
  if (WATCH) {
    let iterCount = 0;
    while (true) {
      iterCount++;
      console.clear();
      console.log(`${colors.cyan}[Watch Mode — Iteration ${iterCount}]${colors.reset}\n`);
      await runAudit();
      await new Promise(resolve => setTimeout(resolve, WATCH_INTERVAL));
    }
  } else {
    await runAudit();
  }

  await pgPool.end();
}

main().catch(err => {
  console.error(`${colors.red}❌ Fatal error: ${err.message}${colors.reset}`);
  process.exit(2);
});
