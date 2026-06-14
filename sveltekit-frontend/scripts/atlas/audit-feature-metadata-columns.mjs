#!/usr/bin/env node
/**
 * audit-feature-metadata-columns.mjs
 *
 * Audits all packet/chunk/feature tables to identify missing canonical lineage fields:
 * - feature_id (TEXT, primary grouping)
 * - source_ref (TEXT, multi-hop join)
 * - file_path (TEXT, source identity)
 * - feature_label (TEXT, UI context)
 * - group_id / cluster_id / community_id (hierarchy)
 * - metadata (JSONB, envelope for domain/SOM/tags)
 * - qdrant_tag_id (TEXT, pointer to Qdrant point)
 * - centroid_id (TEXT, SOM centroid)
 * - som_cluster (TEXT, SOM grid cell)
 * - domain (TEXT, domain classification)
 * - updated_at (TIMESTAMP, cache invalidation)
 */

import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '../..');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const CANONICAL_FIELDS = [
  'feature_id',
  'source_ref',
  'file_path',
  'feature_label',
  'metadata',
  'updated_at',
];

const OPTIONAL_FIELDS = [
  'group_id',
  'cluster_id',
  'community_id',
  'qdrant_tag_id',
  'centroid_id',
  'som_cluster',
  'domain',
  'domain_class',
  'ontology',
];

async function auditColumns() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log('\n═══ Feature/Metadata Column Audit ═══\n');

  try {
    // Get all packet/feature tables
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name ~ '^(atlas|nes|chrom|glyph|codebase|feature|source|packet)'
      ORDER BY table_name
    `);

    const tables = tablesResult.rows.map(r => r.table_name);
    const audit = [];

    for (const tableName of tables) {
      const columnsResult = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      const columns = columnsResult.rows;
      const columnNames = new Set(columns.map(c => c.column_name));
      const rowCountResult = await pool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      const rowCount = parseInt(rowCountResult.rows[0].count);

      // Check canonical fields
      const missingCanonical = CANONICAL_FIELDS.filter(f => !columnNames.has(f));
      const missingOptional = OPTIONAL_FIELDS.filter(f => !columnNames.has(f));

      // Check for indexes
      const indexesResult = await pool.query(`
        SELECT indexname FROM pg_indexes WHERE tablename = $1
      `, [tableName]);
      const indexNames = new Set(indexesResult.rows.map(i => i.indexname));
      const hasFeatureIdIndex = Array.from(indexNames).some(idx => idx.includes('feature_id'));
      const hasMetadataIndex = Array.from(indexNames).some(idx => idx.includes('metadata'));

      const canStatus = missingCanonical.length === 0 ? '✅' : '❌';
      const optStatus = missingOptional.length <= 2 ? '✅' : '⚠️ ';

      console.log(`${tableName.padEnd(35)} ${canStatus} ${optStatus} | rows: ${rowCount.toLocaleString()}`);

      if (missingCanonical.length > 0) {
        console.log(`  ❌ Missing CANONICAL: ${missingCanonical.join(', ')}`);
      }
      if (missingOptional.length > 0 && missingOptional.length <= 3) {
        console.log(`  ⚠️  Missing optional: ${missingOptional.join(', ')}`);
      }

      audit.push({
        table: tableName,
        rowCount,
        columns: columns.map(c => c.column_name),
        missingCanonical,
        missingOptional,
        hasFeatureIdIndex,
        hasMetadataIndex,
        canonicalStatus: missingCanonical.length === 0 ? 'PASS' : 'FAIL',
        optionalStatus: missingOptional.length <= 2 ? 'PASS' : 'PARTIAL',
      });
    }

    // Summary
    const allCanonical = audit.filter(a => a.canonicalStatus === 'PASS').length;
    const allOptimal = audit.filter(a => a.optionalStatus === 'PASS').length;
    console.log(`\n${'-'.repeat(80)}`);
    console.log(`Summary: ${allCanonical}/${audit.length} tables have CANONICAL fields`);
    console.log(`         ${allOptimal}/${audit.length} tables have OPTIMAL field coverage`);

    // Write report
    const reportDir = join(ROOT, 'docs', 'reports');
    mkdirSync(reportDir, { recursive: true });

    const jsonPath = join(reportDir, 'feature-metadata-column-audit.json');
    writeFileSync(jsonPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      canonicalFields: CANONICAL_FIELDS,
      optionalFields: OPTIONAL_FIELDS,
      audit,
      summary: {
        totalTables: audit.length,
        canonicalPass: allCanonical,
        optimalPass: allOptimal,
      },
    }, null, 2));

    const mdPath = join(reportDir, 'feature-metadata-column-audit.md');
    const mdContent = `# Feature/Metadata Column Audit

**Generated**: ${new Date().toISOString()}

## Summary
- **Total tables**: ${audit.length}
- **Canonical PASS**: ${allCanonical}/${audit.length}
- **Optimal PASS**: ${allOptimal}/${audit.length}

## Canonical Fields (Required)
${CANONICAL_FIELDS.map(f => `- ${f}`).join('\n')}

## Optional Fields (Recommended)
${OPTIONAL_FIELDS.map(f => `- ${f}`).join('\n')}

## Table Coverage

${audit.map(a => {
  const canStatus = a.canonicalStatus === 'PASS' ? '✅' : '❌';
  const optStatus = a.optionalStatus === 'PASS' ? '✅' : '⚠️ ';
  const missing = [
    ...(a.missingCanonical.length > 0 ? [`CANONICAL: ${a.missingCanonical.join(', ')}`] : []),
    ...(a.missingOptional.length > 0 ? [`optional: ${a.missingOptional.join(', ')}`] : []),
  ].join(' | ');
  return `### ${a.table}
- **Status**: ${canStatus} canonical, ${optStatus} optional
- **Rows**: ${a.rowCount.toLocaleString()}
- **Indexes**: feature_id=${a.hasFeatureIdIndex ? '✅' : '❌'}, metadata=${a.hasMetadataIndex ? '✅' : '❌'}
${missing ? `- **Missing**: ${missing}` : ''}
`;
}).join('\n')}

## Next Steps

1. \`npm run atlas:feature-metadata:backfill -- --dry-run\` — Preview changes
2. \`npm run atlas:feature-metadata:backfill -- --apply\` — Apply backfills
3. \`npm run atlas:feature-metadata:verify\` — Verify alignment
`;
    writeFileSync(mdPath, mdContent);

    console.log(`\nReports:\n  JSON: ${jsonPath}\n  Markdown: ${mdPath}\n`);

    // Exit with error if critical gaps
    if (allCanonical < audit.length * 0.8) {
      console.log('⚠️  < 80% canonical coverage. Backfill recommended.');
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

auditColumns().catch(err => {
  console.error(err);
  process.exit(1);
});
