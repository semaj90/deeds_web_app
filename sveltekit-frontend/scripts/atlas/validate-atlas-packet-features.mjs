#!/usr/bin/env node
/**
 * Validate atlas_packet_features population
 *
 * Reports:
 * - Coverage metrics (used_concepts, lexical_features, ast_symbols)
 * - Missing domain/feature distributions
 * - JSON report output
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  database: 'legal_ai_db',
  user: 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

async function validateFeatures(client) {
  console.log(`\n📋 Validating atlas_packet_features Population\n`);

  // 1. Overall coverage
  console.log('📊 Coverage Report:\n');

  const coverageResult = await client.query(`
    SELECT
      COUNT(*) as total_packets,
      COUNT(CASE WHEN f.packet_key IS NOT NULL THEN 1 END) as features_populated,
      COUNT(CASE WHEN f.used_concepts IS NOT NULL AND array_length(f.used_concepts, 1) > 0 THEN 1 END) as used_concepts_count,
      COUNT(CASE WHEN f.lexical_features IS NOT NULL AND array_length(f.lexical_features, 1) > 0 THEN 1 END) as lexical_features_count,
      COUNT(CASE WHEN f.ast_symbols IS NOT NULL AND array_length(f.ast_symbols, 1) > 0 THEN 1 END) as ast_symbols_count,
      ROUND((AVG(f.concept_coverage) * 100)::numeric, 2) as avg_concept_coverage
    FROM atlas_packets ap
    LEFT JOIN atlas_packet_features f ON f.packet_key = ap.packet_key
  `);

  const {
    total_packets,
    features_populated,
    used_concepts_count,
    lexical_features_count,
    ast_symbols_count,
    avg_concept_coverage,
  } = coverageResult.rows[0];

  console.log(`  Total atlas_packets: ${total_packets}`);
  console.log(`  atlas_packet_features populated: ${features_populated} (${((features_populated / total_packets) * 100).toFixed(1)}%)\n`);

  console.log(`  used_concepts: ${used_concepts_count} / ${total_packets} (${((used_concepts_count / total_packets) * 100).toFixed(1)}%)`);
  console.log(`  lexical_features: ${lexical_features_count} / ${total_packets} (${((lexical_features_count / total_packets) * 100).toFixed(1)}%)`);
  console.log(`  ast_symbols: ${ast_symbols_count} / ${total_packets} (${((ast_symbols_count / total_packets) * 100).toFixed(1)}%)`);
  console.log(`  avg concept_coverage: ${avg_concept_coverage}%\n`);

  // 2. Top missing domains
  console.log('🔍 Top Missing Domains:\n');

  const missingDomainsResult = await client.query(`
    SELECT
      ap.domain_class,
      COUNT(*) as count,
      COUNT(CASE WHEN f.packet_key IS NOT NULL THEN 1 END) as with_features
    FROM atlas_packets ap
    LEFT JOIN atlas_packet_features f ON f.packet_key = ap.packet_key
    WHERE ap.domain_class IS NOT NULL
    GROUP BY ap.domain_class
    ORDER BY COUNT(*) DESC
    LIMIT 10
  `);

  for (const row of missingDomainsResult.rows) {
    const coverage = row.count > 0 ? ((row.with_features / row.count) * 100).toFixed(1) : '0.0';
    console.log(`  ${row.domain_class}: ${row.count} packets, ${coverage}% with features`);
  }

  // 3. Gap analysis
  console.log(`\n⚠️  Gap Analysis:\n`);

  const gapResult = await client.query(`
    SELECT
      COUNT(CASE WHEN f.packet_key IS NULL THEN 1 END) as missing_features_rows,
      COUNT(CASE WHEN f.used_concepts IS NULL OR array_length(f.used_concepts, 1) = 0 THEN 1 END) as missing_used_concepts,
      COUNT(CASE WHEN f.lexical_features IS NULL OR array_length(f.lexical_features, 1) = 0 THEN 1 END) as missing_lexical,
      COUNT(CASE WHEN f.ast_symbols IS NULL OR array_length(f.ast_symbols, 1) = 0 THEN 1 END) as missing_ast
    FROM atlas_packets ap
    LEFT JOIN atlas_packet_features f ON f.packet_key = ap.packet_key
  `);

  const {
    missing_features_rows,
    missing_used_concepts,
    missing_lexical,
    missing_ast,
  } = gapResult.rows[0];

  console.log(`  Missing all features: ${missing_features_rows} packets`);
  console.log(`  Missing used_concepts: ${missing_used_concepts} packets`);
  console.log(`  Missing lexical_features: ${missing_lexical} packets`);
  console.log(`  Missing ast_symbols: ${missing_ast} packets\n`);

  // 4. Build JSON report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total_packets,
      features_populated,
      features_coverage_pct: parseFloat(((features_populated / total_packets) * 100).toFixed(2)),
      avg_concept_coverage: parseFloat(avg_concept_coverage),
    },
    coverage: {
      used_concepts: {
        count: used_concepts_count,
        total: total_packets,
        pct: parseFloat(((used_concepts_count / total_packets) * 100).toFixed(2)),
      },
      lexical_features: {
        count: lexical_features_count,
        total: total_packets,
        pct: parseFloat(((lexical_features_count / total_packets) * 100).toFixed(2)),
      },
      ast_symbols: {
        count: ast_symbols_count,
        total: total_packets,
        pct: parseFloat(((ast_symbols_count / total_packets) * 100).toFixed(2)),
      },
    },
    gaps: {
      missing_all_features: missing_features_rows,
      missing_used_concepts,
      missing_lexical_features: missing_lexical,
      missing_ast_symbols: missing_ast,
    },
    acceptance_criteria: {
      features_coverage_gte_95_pct: (features_populated / total_packets) >= 0.95,
      used_concepts_coverage_gte_95_pct: (used_concepts_count / total_packets) >= 0.95,
      lexical_features_coverage_gte_80_pct: (lexical_features_count / total_packets) >= 0.80,
    },
  };

  // Write report
  const reportDir = 'docs/reports';
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportPath = path.join(reportDir, 'atlas-packet-features-validation.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`📄 Report written to: ${reportPath}\n`);

  return report;
}

async function main() {
  const client = await pool.connect();

  try {
    const report = await validateFeatures(client);

    // Final status
    console.log('✅ Validation Complete\n');
    console.log('🎯 Acceptance Criteria:\n');
    console.log(`  ✓ Features coverage ≥95%: ${report.acceptance_criteria.features_coverage_gte_95_pct ? 'PASS' : 'FAIL'}`);
    console.log(`  ✓ used_concepts coverage ≥95%: ${report.acceptance_criteria.used_concepts_coverage_gte_95_pct ? 'PASS' : 'FAIL'}`);
    console.log(`  ✓ lexical_features coverage ≥80%: ${report.acceptance_criteria.lexical_features_coverage_gte_80_pct ? 'PASS' : 'FAIL'}\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

main();