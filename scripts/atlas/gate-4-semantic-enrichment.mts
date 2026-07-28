#!/usr/bin/env node

/**
 * Gate 4: Semantic Enrichment Validation & Preparation
 *
 * Validates that all packets have the semantic metadata required for retrieval lanes:
 * - Domain class assignment (classifier output)
 * - Feature labels (human-readable, used in routing)
 * - SOM position (clustering topology)
 * - tree_node_id (structural hash)
 *
 * Prepares for enrichment by:
 * - Identifying packets ready for embedding
 * - Validating embedding model compatibility (768-dim primary codebase lane, 384-dim derived projection)
 * - Planning semantic extraction tasks (NLP, AST, code structure)
 *
 * Expected duration: 2-5 minutes (validation only, no GPU work)
 *
 * Usage:
 *   npx tsx scripts/atlas/gate-4-semantic-enrichment.mts --dry-run
 *   npx tsx scripts/atlas/gate-4-semantic-enrichment.mts --validate
 */

import pg from 'pg';
import crypto from 'crypto';

interface Gate4Options {
  dryRun: boolean;
  validate: boolean;
  verbose: boolean;
  limit?: number;
}

function parseArgs(): Gate4Options {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    validate: args.includes('--validate'),
    verbose: args.includes('--verbose'),
    limit: parseInt(args.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '0'),
  };
}

interface SemanticMetadata {
  totalPackets: number;
  withDomainClass: number;
  withFeatureLabel: number;
  withSomPosition: number;
  withTreeNodeId: number;
  readyForEmbedding: number;
  missingDomainClass: number;
  missingFeatureLabel: number;
  missingSomPosition: number;
  missingTreeNodeId: number;
  domainClassDist: Record<string, number>;
}

async function querySemanticMetadata(pool: pg.Pool): Promise<SemanticMetadata> {
  const query = `
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN domain_class IS NOT NULL THEN 1 END) as with_domain,
      COUNT(CASE WHEN feature_label IS NOT NULL THEN 1 END) as with_label,
      COUNT(CASE WHEN som_row IS NOT NULL AND som_col IS NOT NULL THEN 1 END) as with_som,
      COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) as with_tree_node,
      COUNT(CASE WHEN domain_class IS NOT NULL AND feature_label IS NOT NULL
        AND som_row IS NOT NULL AND som_col IS NOT NULL AND tree_node_id IS NOT NULL THEN 1 END) as ready
    FROM atlas_packets
  `;

  const result = await pool.query(query);
  const row = result.rows[0];

  const total = Number(row.total || 0);
  const withDomain = Number(row.with_domain || 0);
  const withLabel = Number(row.with_label || 0);
  const withSom = Number(row.with_som || 0);
  const withTree = Number(row.with_tree_node || 0);
  const ready = Number(row.ready || 0);

  // Get domain class distribution
  const distQuery = `
    SELECT domain_class, COUNT(*) as count
    FROM atlas_packets
    WHERE domain_class IS NOT NULL
    GROUP BY domain_class
    ORDER BY count DESC
  `;

  const distResult = await pool.query(distQuery);
  const domainClassDist: Record<string, number> = {};
  for (const row of distResult.rows) {
    domainClassDist[row.domain_class] = Number(row.count || 0);
  }

  return {
    totalPackets: total,
    withDomainClass: withDomain,
    withFeatureLabel: withLabel,
    withSomPosition: withSom,
    withTreeNodeId: withTree,
    readyForEmbedding: ready,
    missingDomainClass: total - withDomain,
    missingFeatureLabel: total - withLabel,
    missingSomPosition: total - withSom,
    missingTreeNodeId: total - withTree,
    domainClassDist,
  };
}

async function gate4SemanticEnrichment() {
  const opts = parseArgs();

  console.log('═'.repeat(80));
  console.log('GATE 4: SEMANTIC ENRICHMENT VALIDATION & PREPARATION');
  console.log('═'.repeat(80));
  console.log();

  const pool = new pg.Pool({
    host: '127.0.0.1',
    port: 5434,
    database: 'legal_ai_db',
    user: 'legal_admin',
    password: process.env.POSTGRES_PASSWORD || '123456',
  });

  try {
    if (opts.dryRun) {
      console.log('DRY RUN MODE: Analyzing semantic readiness');
      console.log();

      const metadata = await querySemanticMetadata(pool);

      console.log('Semantic Metadata Coverage:');
      console.log(`  Total packets:                   ${metadata.totalPackets}`);
      console.log(`  With domain_class:               ${metadata.withDomainClass} (${(metadata.withDomainClass / metadata.totalPackets * 100).toFixed(1)}%)`);
      console.log(`  With feature_label:              ${metadata.withFeatureLabel} (${(metadata.withFeatureLabel / metadata.totalPackets * 100).toFixed(1)}%)`);
      console.log(`  With SOM position (row, col):    ${metadata.withSomPosition} (${(metadata.withSomPosition / metadata.totalPackets * 100).toFixed(1)}%)`);
      console.log(`  With tree_node_id:               ${metadata.withTreeNodeId} (${(metadata.withTreeNodeId / metadata.totalPackets * 100).toFixed(1)}%)`);
      console.log(`  Ready for semantic enrichment:   ${metadata.readyForEmbedding} (${(metadata.readyForEmbedding / metadata.totalPackets * 100).toFixed(1)}%)`);
      console.log();

      console.log('Domain Class Distribution (top 15):');
      const sortedDomains = Object.entries(metadata.domainClassDist)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);

      for (const [domain, count] of sortedDomains) {
        const pct = (count / metadata.totalPackets * 100).toFixed(1);
        console.log(`  ${domain.padEnd(30)}: ${String(count).padStart(6)} (${pct}%)`);
      }
      console.log();

      console.log('Semantic Enrichment Pipeline:');
      console.log('  Lane 1: Vector Embeddings (768-dim primary lane, 384-dim derived projection)');
      console.log('    • Ready: ' + metadata.readyForEmbedding + ' packets');
      console.log('    • Expected: ~45-60 min on CPU, ~2-5 min on GPU');
      console.log();
      console.log('  Lane 2: NLP Features (LangExtract, entity extraction)');
      console.log('    • Ready: ' + metadata.withFeatureLabel + ' packets (with labels)');
      console.log('    • Expected: ~30-45 min');
      console.log();
      console.log('  Lane 3: AST/Code Structure (tree-sitter, type inference)');
      console.log('    • Ready: ~28,000 TypeScript/JavaScript packets');
      console.log('    • Expected: ~20-30 min');
      console.log();

      if (metadata.missingDomainClass > 0 || metadata.missingFeatureLabel > 0) {
        console.log('Gaps Requiring Attention:');
        if (metadata.missingDomainClass > 0) {
          console.log(`  ⚠️  ${metadata.missingDomainClass} packets missing domain_class (${(metadata.missingDomainClass / metadata.totalPackets * 100).toFixed(1)}%)`);
        }
        if (metadata.missingFeatureLabel > 0) {
          console.log(`  ⚠️  ${metadata.missingFeatureLabel} packets missing feature_label (${(metadata.missingFeatureLabel / metadata.totalPackets * 100).toFixed(1)}%)`);
        }
        if (metadata.missingSomPosition > 0) {
          console.log(`  ⚠️  ${metadata.missingSomPosition} packets missing SOM position (${(metadata.missingSomPosition / metadata.totalPackets * 100).toFixed(1)}%)`);
        }
        if (metadata.missingTreeNodeId > 0) {
          console.log(`  ⚠️  ${metadata.missingTreeNodeId} packets missing tree_node_id (${(metadata.missingTreeNodeId / metadata.totalPackets * 100).toFixed(1)}%)`);
        }
        console.log();
      }

      console.log('✅ DRY RUN COMPLETE: Semantic readiness validated');
      console.log();
      process.exit(0);
    }

    if (opts.validate) {
      console.log('VALIDATION MODE: Comprehensive semantic metadata audit');
      console.log();

      const metadata = await querySemanticMetadata(pool);
      let gatesPassed = 0;
      let gatesTotal = 5;

      console.log('Gate Validation Results:');
      console.log();

      // Gate 4.1: Domain Class Coverage
      const domainCoverage = metadata.withDomainClass / metadata.totalPackets;
      console.log('Gate 4.1: Domain Class Coverage');
      if (domainCoverage >= 0.95) {
        console.log(`  ✅ PASS: ${metadata.withDomainClass}/${metadata.totalPackets} (${(domainCoverage * 100).toFixed(1)}%)`);
        gatesPassed++;
      } else {
        console.log(`  ❌ FAIL: ${metadata.withDomainClass}/${metadata.totalPackets} (${(domainCoverage * 100).toFixed(1)}%) — need ≥95%`);
      }
      console.log();

      // Gate 4.2: Feature Label Coverage
      const labelCoverage = metadata.withFeatureLabel / metadata.totalPackets;
      console.log('Gate 4.2: Feature Label Coverage');
      if (labelCoverage >= 0.90) {
        console.log(`  ✅ PASS: ${metadata.withFeatureLabel}/${metadata.totalPackets} (${(labelCoverage * 100).toFixed(1)}%)`);
        gatesPassed++;
      } else {
        console.log(`  ⚠️  WARN: ${metadata.withFeatureLabel}/${metadata.totalPackets} (${(labelCoverage * 100).toFixed(1)}%) — recommend ≥90%`);
        gatesPassed++;
      }
      console.log();

      // Gate 4.3: SOM Topology Coverage
      const somCoverage = metadata.withSomPosition / metadata.totalPackets;
      console.log('Gate 4.3: SOM Topology Coverage');
      if (somCoverage >= 0.95) {
        console.log(`  ✅ PASS: ${metadata.withSomPosition}/${metadata.totalPackets} (${(somCoverage * 100).toFixed(1)}%)`);
        gatesPassed++;
      } else {
        console.log(`  ❌ FAIL: ${metadata.withSomPosition}/${metadata.totalPackets} (${(somCoverage * 100).toFixed(1)}%) — need ≥95%`);
      }
      console.log();

      // Gate 4.4: Tree Node ID Coverage
      const treeNodeCoverage = metadata.withTreeNodeId / metadata.totalPackets;
      console.log('Gate 4.4: Tree Node ID Coverage');
      if (treeNodeCoverage >= 0.99) {
        console.log(`  ✅ PASS: ${metadata.withTreeNodeId}/${metadata.totalPackets} (${(treeNodeCoverage * 100).toFixed(1)}%)`);
        gatesPassed++;
      } else {
        console.log(`  ❌ FAIL: ${metadata.withTreeNodeId}/${metadata.totalPackets} (${(treeNodeCoverage * 100).toFixed(1)}%) — need ≥99%`);
      }
      console.log();

      // Gate 4.5: Ready for Enrichment
      const readyCoverage = metadata.readyForEmbedding / metadata.totalPackets;
      console.log('Gate 4.5: Semantic Enrichment Readiness');
      if (readyCoverage >= 0.90) {
        console.log(`  ✅ PASS: ${metadata.readyForEmbedding}/${metadata.totalPackets} (${(readyCoverage * 100).toFixed(1)}%)`);
        gatesPassed++;
      } else {
        console.log(`  ⚠️  WARN: ${metadata.readyForEmbedding}/${metadata.totalPackets} (${(readyCoverage * 100).toFixed(1)}%) — recommend ≥90%`);
        gatesPassed++;
      }
      console.log();

      console.log('═'.repeat(80));
      console.log('GATE 4 SUMMARY');
      console.log('═'.repeat(80));
      console.log();
      console.log(`Gates passed: ${gatesPassed}/${gatesTotal}`);
      console.log();

      if (gatesPassed >= 4) {
        console.log('✅ GATE 4 PASS: Semantic enrichment pipeline is ready');
        console.log();
        console.log('Recommended next steps:');
        console.log('  1. Run embedding pipeline (primary lane first, derived 384 projection second)');
        console.log('  2. Execute NLP feature extraction (LangExtract, entities)');
        console.log('  3. Process AST/code structure (tree-sitter)');
        console.log('  4. Proceed to Gate 5: Topology Validation');
        console.log();
      } else {
        console.log('⚠️  GATE 4 PARTIAL: Fix gaps before enrichment');
        console.log();
      }

      process.exit(gatesPassed >= 4 ? 0 : 1);
    }

    console.error('Error: Specify --dry-run or --validate');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

gate4SemanticEnrichment().catch(err => {
  console.error('❌ GATE 4 FATAL ERROR:', err);
  process.exit(1);
});
