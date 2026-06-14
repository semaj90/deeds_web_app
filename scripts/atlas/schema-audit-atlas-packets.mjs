#!/usr/bin/env node
/**
 * Schema Audit for atlas_packets
 *
 * Dynamically introspects the actual Postgres table structure
 * and reports readiness for multihop regeneration.
 *
 * Output:
 *   - docs/reports/atlas-packets-schema-audit.json
 *   - docs/reports/atlas-packets-schema-audit.md
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

config({ path: resolve(ROOT, '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const REPORTS_DIR = resolve(ROOT, 'docs/reports');

// === SCHEMA AUDIT LOGIC ===

async function auditAtlasPacketsSchema() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Schema Audit: atlas_packets                                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Get column definitions from information_schema
    console.log('Step 1: Fetching column definitions...');
    const columnsRes = await pool.query(`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default,
        ordinal_position
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'atlas_packets'
      ORDER BY ordinal_position
    `);

    const columns = columnsRes.rows;
    console.log(`✅ Found ${columns.length} columns\n`);

    // Build lookup for hasColumn helper
    const columnsByName = {};
    columns.forEach(col => {
      columnsByName[col.column_name] = col;
    });

    // Step 2: Get indexes
    console.log('Step 2: Fetching indexes...');
    const indexesRes = await pool.query(`
      SELECT
        indexname,
        indexdef,
        schemaname,
        tablename
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'atlas_packets'
      ORDER BY indexname
    `);

    const indexes = indexesRes.rows;
    console.log(`✅ Found ${indexes.length} indexes\n`);

    // Step 3: Identify GIN indexes
    const ginIndexes = indexes.filter(idx => idx.indexdef.includes('USING gin'));
    const btreeIndexes = indexes.filter(idx => idx.indexdef.includes('USING btree') || !idx.indexdef.includes('USING'));
    const hnsqIndexes = indexes.filter(idx => idx.indexdef.includes('USING hnsw'));

    console.log('Step 3: Index classification');
    console.log(`  GIN indexes: ${ginIndexes.length}`);
    console.log(`  B-tree indexes: ${btreeIndexes.length}`);
    console.log(`  HNSW indexes: ${hnsqIndexes.length}\n`);

    // Step 4: Check required enrichment fields
    console.log('Step 4: Checking enrichment field coverage...');

    const requiredFields = {
      identity: ['packet_key', 'source_ref', 'feature_id', 'feature_label', 'file_path'],
      enrichment: ['community_id', 'community_confidence'],
      qdrant: ['qdrant_point_id', 'qdrant_tags'],
      som: ['som_row', 'som_col', 'som_cluster'],
      karpathy: ['karpathy_score', 'authority_score'],
      latent: ['encoded_latent'],
      metadata: ['metadata', 'payload'],
      tree: ['tree_node_id']
    };

    const fieldCoverage = {};
    const missingFields = [];

    for (const [category, fields] of Object.entries(requiredFields)) {
      fieldCoverage[category] = {
        expected: fields.length,
        found: 0,
        present: [],
        missing: []
      };

      for (const field of fields) {
        if (columnsByName[field]) {
          fieldCoverage[category].found++;
          fieldCoverage[category].present.push({
            name: field,
            type: columnsByName[field].data_type,
            nullable: columnsByName[field].is_nullable
          });
        } else {
          fieldCoverage[category].missing.push(field);
          missingFields.push(`${category}:${field}`);
        }
      }
    }

    // Step 5: Table stats
    console.log('Step 5: Table statistics...');
    const statsRes = await pool.query(`
      SELECT
        COUNT(*) as row_count,
        pg_size_pretty(pg_total_relation_size('atlas_packets'::regclass)) as total_size,
        pg_size_pretty(pg_relation_size('atlas_packets'::regclass)) as table_size,
        pg_size_pretty(pg_indexes_size('atlas_packets'::regclass)) as indexes_size
      FROM atlas_packets
    `);

    const stats = statsRes.rows[0];
    console.log(`✅ Table size: ${stats.total_size}`);
    console.log(`   - Data: ${stats.table_size}`);
    console.log(`   - Indexes: ${stats.indexes_size}`);
    console.log(`   - Rows: ${stats.row_count}\n`);

    // Step 6: Coverage queries
    console.log('Step 6: Data coverage analysis...');

    const coverageQueries = {
      'packet_key': 'SELECT COUNT(*) FROM atlas_packets WHERE packet_key IS NOT NULL',
      'source_ref': 'SELECT COUNT(*) FROM atlas_packets WHERE source_ref IS NOT NULL',
      'feature_id': 'SELECT COUNT(*) FROM atlas_packets WHERE feature_id IS NOT NULL',
      'feature_label': 'SELECT COUNT(*) FROM atlas_packets WHERE feature_label IS NOT NULL',
      'community_id': 'SELECT COUNT(*) FROM atlas_packets WHERE community_id IS NOT NULL',
      'file_path': 'SELECT COUNT(*) FROM atlas_packets WHERE file_path IS NOT NULL'
    };

    const coverage = {};
    const totalRows = parseInt(stats.row_count);

    for (const [field, query] of Object.entries(coverageQueries)) {
      if (columnsByName[field]) {
        const res = await pool.query(query);
        const count = parseInt(res.rows[0].count);
        const percentage = totalRows > 0 ? ((count / totalRows) * 100).toFixed(1) : 0;
        coverage[field] = { count, percentage: parseFloat(percentage) };
        console.log(`  ${field}: ${count}/${totalRows} (${percentage}%)`);
      }
    }

    console.log('');

    // === GENERATE REPORT ===

    const report = {
      timestamp: new Date().toISOString(),
      table: 'atlas_packets',
      totalRows: parseInt(stats.row_count),
      totalSize: stats.total_size,
      tableSize: stats.table_size,
      indexesSize: stats.indexes_size,
      columns: {
        total: columns.length,
        list: columns.map(c => ({
          name: c.column_name,
          type: c.data_type,
          nullable: c.is_nullable === 'YES',
          default: c.column_default
        }))
      },
      indexes: {
        total: indexes.length,
        gin: ginIndexes.length,
        btree: btreeIndexes.length,
        hnsw: hnsqIndexes.length,
        list: indexes.map(idx => ({
          name: idx.indexname,
          type: idx.indexdef.includes('USING gin') ? 'GIN' : (idx.indexdef.includes('USING hnsw') ? 'HNSW' : 'BTREE'),
          definition: idx.indexdef
        }))
      },
      enrichmentCoverage: fieldCoverage,
      missingFields: missingFields,
      dataCoverage: coverage,
      readinessSummary: {
        identityFieldsComplete: fieldCoverage.identity.found === fieldCoverage.identity.expected,
        enrichmentFieldsPresent: fieldCoverage.enrichment.found > 0,
        qdrantFieldsPresent: fieldCoverage.qdrant.found > 0,
        somFieldsPresent: fieldCoverage.som.found > 0,
        karpathyFieldsPresent: fieldCoverage.karpathy.found > 0,
        latentFieldsPresent: fieldCoverage.latent.found > 0,
        metadataFieldsPresent: fieldCoverage.metadata.found > 0,
        treeFieldsPresent: fieldCoverage.tree.found > 0
      },
      recommendations: []
    };

    // Add recommendations
    if (missingFields.length > 0) {
      report.recommendations.push(`Missing ${missingFields.length} enrichment fields: ${missingFields.join(', ')}`);
    }

    if (!report.readinessSummary.identityFieldsComplete) {
      report.recommendations.push('Identity fields incomplete — multihop regeneration will have null values');
    }

    if (!report.readinessSummary.metadataFieldsPresent) {
      report.recommendations.push('No metadata/payload JSONB columns — cannot extract gin_metadata or enrichment envelope');
    }

    if (coverageQueries['packet_key'] && coverage['packet_key']?.percentage < 95) {
      report.recommendations.push(`packet_key coverage is ${coverage['packet_key']?.percentage}% — run compute-missing-packet-keys.mjs first`);
    }

    report.recommendations.push('Ready for multihop regeneration with schema-adaptive queries (null fields for missing columns)');

    // Step 7: Write reports
    console.log('Step 7: Writing reports...');
    mkdirSync(REPORTS_DIR, { recursive: true });

    writeFileSync(
      resolve(REPORTS_DIR, 'atlas-packets-schema-audit.json'),
      JSON.stringify(report, null, 2)
    );

    // Markdown report
    const markdown = `# Atlas Packets Schema Audit

**Generated:** ${new Date().toISOString()}

## Table Statistics
- **Total Rows:** ${report.totalRows.toLocaleString()}
- **Total Size:** ${report.totalSize}
- **Data Size:** ${report.tableSize}
- **Indexes Size:** ${report.indexesSize}

## Columns (${report.columns.total} total)
\`\`\`
${report.columns.list.map(c => `${c.name}: ${c.type}${c.nullable ? ' (nullable)' : ''}`).join('\n')}
\`\`\`

## Indexes (${report.indexes.total} total)
- **GIN:** ${report.indexes.gin}
- **B-tree:** ${report.indexes.btree}
- **HNSW:** ${report.indexes.hnsw}

### Index Details
\`\`\`
${report.indexes.list.map(idx => `${idx.name} [${idx.type}]`).join('\n')}
\`\`\`

## Enrichment Field Coverage

### Identity Fields
- Status: ${report.readinessSummary.identityFieldsComplete ? '✅ COMPLETE' : '❌ INCOMPLETE'}
- Found: ${report.enrichmentCoverage.identity.found}/${report.enrichmentCoverage.identity.expected}
${report.enrichmentCoverage.identity.present.length > 0 ? `- Present: ${report.enrichmentCoverage.identity.present.map(f => f.name).join(', ')}` : ''}
${report.enrichmentCoverage.identity.missing.length > 0 ? `- Missing: ${report.enrichmentCoverage.identity.missing.join(', ')}` : ''}

### Enrichment Fields
- Found: ${report.enrichmentCoverage.enrichment.found}/${report.enrichmentCoverage.enrichment.expected}
${report.enrichmentCoverage.enrichment.present.length > 0 ? `- Present: ${report.enrichmentCoverage.enrichment.present.map(f => f.name).join(', ')}` : ''}
${report.enrichmentCoverage.enrichment.missing.length > 0 ? `- Missing: ${report.enrichmentCoverage.enrichment.missing.join(', ')}` : ''}

### Qdrant Mirror Fields
- Found: ${report.enrichmentCoverage.qdrant.found}/${report.enrichmentCoverage.qdrant.expected}
${report.enrichmentCoverage.qdrant.present.length > 0 ? `- Present: ${report.enrichmentCoverage.qdrant.present.map(f => f.name).join(', ')}` : ''}

### SOM Topology Fields
- Found: ${report.enrichmentCoverage.som.found}/${report.enrichmentCoverage.som.expected}
${report.enrichmentCoverage.som.present.length > 0 ? `- Present: ${report.enrichmentCoverage.som.present.map(f => f.name).join(', ')}` : ''}

### Karpathy Authority Fields
- Found: ${report.enrichmentCoverage.karpathy.found}/${report.enrichmentCoverage.karpathy.expected}
${report.enrichmentCoverage.karpathy.present.length > 0 ? `- Present: ${report.enrichmentCoverage.karpathy.present.map(f => f.name).join(', ')}` : ''}

### Latent Vector Fields
- Found: ${report.enrichmentCoverage.latent.found}/${report.enrichmentCoverage.latent.expected}

### Metadata/Payload JSONB
- Found: ${report.enrichmentCoverage.metadata.found}/${report.enrichmentCoverage.metadata.expected}

### Tree/PageIndex Fields
- Found: ${report.enrichmentCoverage.tree.found}/${report.enrichmentCoverage.tree.expected}

## Data Coverage

${Object.entries(coverage).map(([field, data]) => `- **${field}:** ${data.count}/${totalRows} (${data.percentage}%)`).join('\n')}

## Readiness Status

| Category | Status |
|----------|--------|
| Identity Fields | ${report.readinessSummary.identityFieldsComplete ? '✅' : '❌'} |
| Enrichment Fields | ${report.readinessSummary.enrichmentFieldsPresent ? '✅' : '⏳'} |
| Qdrant Mirror | ${report.readinessSummary.qdrantFieldsPresent ? '✅' : '⏳'} |
| SOM Topology | ${report.readinessSummary.somFieldsPresent ? '✅' : '⏳'} |
| Karpathy Scores | ${report.readinessSummary.karpathyFieldsPresent ? '✅' : '⏳'} |
| Latent Vectors | ${report.readinessSummary.latentFieldsPresent ? '✅' : '⏳'} |
| Metadata JSONB | ${report.readinessSummary.metadataFieldsPresent ? '✅' : '⏳'} |
| Tree Nodes | ${report.readinessSummary.treeFieldsPresent ? '✅' : '⏳'} |

## Recommendations

${report.recommendations.map(rec => `- ${rec}`).join('\n')}

## Missing Fields Summary

${missingFields.length > 0 ? `Total missing: ${missingFields.length}\n${missingFields.map(f => `- ${f}`).join('\n')}` : 'No missing fields!'}

---
**Report generated by:** scripts/atlas/schema-audit-atlas-packets.mjs
**Canonical schema:** sveltekit-frontend/src/lib/server/db/schema-postgres.ts
`;

    writeFileSync(
      resolve(REPORTS_DIR, 'atlas-packets-schema-audit.md'),
      markdown
    );

    console.log(`✅ JSON report: ${resolve(REPORTS_DIR, 'atlas-packets-schema-audit.json')}`);
    console.log(`✅ Markdown report: ${resolve(REPORTS_DIR, 'atlas-packets-schema-audit.md')}\n`);

    // Final summary
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  AUDIT SUMMARY                                                 ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log(`Identity Fields: ${report.readinessSummary.identityFieldsComplete ? '✅ COMPLETE' : '❌ INCOMPLETE'}`);
    console.log(`Missing Fields: ${missingFields.length}`);
    console.log(`Data Coverage: ${Object.values(coverage).map(c => c.percentage).sort().slice(-1)[0]}% (max)`);
    console.log(`Indexes: ${report.indexes.total} total (${report.indexes.gin} GIN, ${report.indexes.btree} B-tree, ${report.indexes.hnsw} HNSW)`);
    console.log('\n');

  } catch (err) {
    console.error('❌ Audit failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

auditAtlasPacketsSchema();
