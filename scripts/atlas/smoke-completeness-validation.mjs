#!/usr/bin/env node
/**
 * Smoke Completeness Validation — 9-Dimension Audit
 *
 * Validates all critical atlas_packets dimensions and reports 0%-100% completion.
 * Supports --watch mode for continuous monitoring.
 *
 * Usage:
 *   npm run atlas:smoke:completeness
 *   npm run atlas:smoke:completeness:watch
 */

import { execSync } from 'child_process';

const isDryRun = process.argv.includes('--dry-run');
const isWatch = process.argv.includes('--watch');
const interval = parseInt(process.argv.find(arg => arg.startsWith('--interval='))?.split('=')[1] ?? '10');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// 9 Critical dimensions for atlas_packets (updated July 5, 2026 — live verified)
const DIMENSIONS = [
  { field: 'feature_id',      category: 'Identity',     required: true },
  { field: 'domain_class',    category: 'Classification', required: true },
  { field: 'title_id',        category: 'Identity',     required: true },
  { field: 'tree_node_id',    category: 'Enrichment',   required: false, target: 100 },
  { field: 'concept_ids',     category: 'Enrichment',   required: false },
  { field: 'som_cluster',     category: 'Topology',     required: false, target: 100 },
  { field: 'community_id',    category: 'Topology',     required: false, target: 100 },
  { field: 'page_rank_score', category: 'Topology',     required: false, target: 100 },
  { field: 'embedding',       category: 'Vector',       required: false },
];

function log(msg) {
  console.log(msg);
}

function progress(current, total) {
  const pct = total === 0 ? 0 : Math.round((current / total) * 100);
  const barLength = 30;
  const filled = Math.round((pct / 100) * barLength);
  const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
  return `${bar} ${pct}%`;
}

function statusIcon(pct) {
  if (pct === 100) return `${colors.green}✅${colors.reset}`;
  if (pct >= 95) return `${colors.green}✓${colors.reset}`;
  if (pct >= 75) return `${colors.yellow}⚠${colors.reset}`;
  return `${colors.red}✗${colors.reset}`;
}

async function runAudit() {
  log(`\n${colors.bold}${colors.cyan}Smoke Completeness Validation${colors.reset}`);
  log(`${colors.gray}Timestamp: ${new Date().toISOString()}${colors.reset}\n`);

  try {
    // Fetch current state
    const query = `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN feature_id IS NOT NULL THEN 1 END) as feature_id,
        COUNT(CASE WHEN domain_class IS NOT NULL THEN 1 END) as domain_class,
        COUNT(CASE WHEN title_id IS NOT NULL THEN 1 END) as title_id,
        COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) as tree_node_id,
        COUNT(CASE WHEN concept_ids IS NOT NULL THEN 1 END) as concept_ids,
        COUNT(CASE WHEN som_cluster IS NOT NULL THEN 1 END) as som_cluster,
        COUNT(CASE WHEN community_id IS NOT NULL THEN 1 END) as community_id,
        COUNT(CASE WHEN page_rank_score IS NOT NULL THEN 1 END) as page_rank_score,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as embedding
      FROM atlas_packets
    `;

    const result = execSync(
      `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -c "${query.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8' }
    ).trim();

    const [line] = result.split('\n').filter(l => l.trim());
    const [total, ...counts] = line.match(/\d+/g).map(Number);

    if (!total) {
      log(`${colors.red}❌ No data found in atlas_packets${colors.reset}\n`);
      return;
    }

    // Build result map
    const fieldMap = {
      feature_id: counts[0],
      domain_class: counts[1],
      title_id: counts[2],
      tree_node_id: counts[3],
      concept_ids: counts[4],
      som_cluster: counts[5],
      community_id: counts[6],
      page_rank_score: counts[7],
      embedding: counts[8],
    };

    // Group by category
    const byCategory = {};
    for (const { field, category, required } of DIMENSIONS) {
      if (!byCategory[category]) byCategory[category] = [];
      byCategory[category].push({ field, required, count: fieldMap[field] });
    }

    // Print by category
    let totalComplete = 0;
    let totalRequired = 0;
    let allRequiredMet = true;

    for (const category of ['Identity', 'Classification', 'Enrichment', 'Topology', 'Vector']) {
      if (!byCategory[category]) continue;

      log(`${colors.bold}${category}:${colors.reset}`);

      for (const { field, required, count } of byCategory[category]) {
        const pct = (count / total) * 100;
        const icon = statusIcon(pct);
        const bar = progress(count, total);
        const req = required ? ` ${colors.red}[REQUIRED]${colors.reset}` : '';

        if (pct === 100) totalComplete++;
        if (required) {
          totalRequired++;
          if (pct < 100) allRequiredMet = false;
        }

        log(`  ${icon} ${field.padEnd(18)} ${bar} ${count.toLocaleString()}/${total.toLocaleString()}${req}`);
      }
      log('');
    }

    // Summary
    log(`${colors.bold}Summary:${colors.reset}`);
    log(`  Total packets: ${total.toLocaleString()}`);
    log(`  Complete dimensions: ${totalComplete}/${DIMENSIONS.length} (${Math.round((totalComplete / DIMENSIONS.length) * 100)}%)`);
    log(`  Required fields: ${totalRequired} (${allRequiredMet ? `${colors.green}ALL MET${colors.reset}` : `${colors.red}INCOMPLETE${colors.reset}` })`);
    log('');

    // Phase recommendations
    const domainClassPct = (fieldMap.domain_class / total) * 100;
    const treeNodePct = (fieldMap.tree_node_id / total) * 100;
    const conceptIdsPct = (fieldMap.concept_ids / total) * 100;
    const somPct = (fieldMap.som_cluster / total) * 100;
    const communityPct = (fieldMap.community_id / total) * 100;
    const pageRankPct = (fieldMap.page_rank_score / total) * 100;

    log(`${colors.bold}Phase Readiness:${colors.reset}`);

    if (domainClassPct < 100) {
      log(`  🟡 Phase 1: Domain Class Backfill — ${Math.round(domainClassPct)}% (${total - fieldMap.domain_class} gaps)`);
    } else {
      log(`  ✅ Phase 1: Domain Class — COMPLETE`);
    }

    if (conceptIdsPct < 60) {
      log(`  🟡 Phase 2: LangExtract Concepts — ${Math.round(conceptIdsPct)}% (${Math.round((60 - conceptIdsPct) / 100 * total)} needed)`);
    } else {
      log(`  ✅ Phase 2: LangExtract Concepts — ${Math.round(conceptIdsPct)}%`);
    }

    if (somPct < 100) {
      log(`  🟡 Phase 3: SOM Training — ${Math.round(somPct)}%`);
    } else {
      log(`  ✅ Phase 3: SOM Training — COMPLETE`);
    }

    if (communityPct < 100 || pageRankPct < 100) {
      log(`  🟡 Phase 4: Neo4j GDS — Louvain ${Math.round(communityPct)}%, PageRank ${Math.round(pageRankPct)}%`);
    } else {
      log(`  ✅ Phase 4: Neo4j GDS — COMPLETE`);
    }

    log('');

    // Overall status
    const overallPct = (totalComplete / DIMENSIONS.length) * 100;
    if (overallPct === 100) {
      log(`${colors.green}${colors.bold}✅ ALL DIMENSIONS COMPLETE — READY FOR PRODUCTION${colors.reset}\n`);
    } else if (allRequiredMet && overallPct >= 95) {
      log(`${colors.green}${colors.bold}✅ REQUIRED FIELDS COMPLETE — OPTIONAL ENRICHMENT ${Math.round(overallPct)}%${colors.reset}\n`);
    } else if (allRequiredMet) {
      log(`${colors.yellow}${colors.bold}⚠️  REQUIRED FIELDS COMPLETE — ENRICHMENT ${Math.round(overallPct)}%${colors.reset}\n`);
    } else {
      log(`${colors.red}${colors.bold}❌ CRITICAL GAPS — ${(DIMENSIONS.length - totalComplete)} dimensions incomplete${colors.reset}\n`);
    }

  } catch (error) {
    log(`${colors.red}❌ Audit failed: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

async function watchLoop() {
  await runAudit();

  if (isWatch) {
    log(`${colors.gray}[Watching — next update in ${interval}s, Ctrl+C to exit]${colors.reset}\n`);
    setTimeout(watchLoop, interval * 1000);
  }
}

watchLoop();
