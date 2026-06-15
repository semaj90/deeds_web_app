#!/usr/bin/env node

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// Parse args
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isApply = args.includes('--apply');

if (!isDryRun && !isApply) {
  console.log('Usage: node promote-inferred-enrichment.mjs [--dry-run|--apply]');
  console.log('  --dry-run: preview promotions (default)');
  console.log('  --apply:   write promotions to database');
  process.exit(1);
}

// Load environment
function loadEnv(root) {
  const envFile = path.join(root, 'sveltekit-frontend', '.env');
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, 'utf-8');
    for (const line of content.split('\n')) {
      const [key, val] = line.split('=');
      if (key && val && !key.startsWith('#')) {
        process.env[key.trim()] = val.trim();
      }
    }
  }
}

loadEnv(REPO_ROOT);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  statement_timeout: 30000,
});

const promotions = [];
const summary = {
  total_candidates: 0,
  promoted: 0,
  skipped: 0,
  by_field: {},
  forbidden_mutations: 0,
};

// ════════════════════════════════════════════════════════════════════════════
// PROMOTION RULES
// ════════════════════════════════════════════════════════════════════════════

const PROMOTABLE_FIELDS = {
  'w_authority': {
    target_table: 'atlas_topology_index',
    target_column: 'w_authority',
    source: 'neo4j_gds',
    min_confidence: 0.80,
  },
  'y_graph': {
    target_table: 'atlas_topology_index',
    target_column: 'y_graph',
    source: 'neo4j_gds',
    min_confidence: 0.75,
  },
  'community_id': {
    target_table: 'atlas_topology_index',
    target_column: 'community_id',
    source: 'neo4j_gds',
    min_confidence: 0.80,
  },
};

const FORBIDDEN_MUTATIONS = [
  'packet_key',
  'source_ref',
  'feature_id',
  'selected_concepts',
];

// ════════════════════════════════════════════════════════════════════════════
// PROMOTER 1: Neo4j GDS fields (authority, graph, community)
// ════════════════════════════════════════════════════════════════════════════

async function promoteGDSFields(client) {
  try {
    const query = `
      SELECT
        packet_key,
        w_authority,
        y_graph,
        community_id
      FROM atlas_topology_index
      WHERE (w_authority IS NOT NULL
        OR y_graph IS NOT NULL
        OR community_id IS NOT NULL)
      LIMIT 500;
    `;

    const res = await client.query(query);

    for (const row of res.rows) {
      // Authority promotion
      if (row.w_authority !== null) {
        const candidate = {
          field: 'w_authority',
          packet_key: row.packet_key,
          source_ref: row.packet_key ? row.packet_key.split(':')[2] : null,
          feature_id: null,
          provenance: 'GDS PageRank',
          confidence: 0.85,
          value: row.w_authority,
          safe: true,
        };

        if (validatePromotion(candidate)) {
          promotions.push(candidate);
          summary.promoted++;
        } else {
          summary.skipped++;
        }
      }

      // Graph positioning promotion
      if (row.y_graph !== null) {
        const candidate = {
          field: 'y_graph',
          packet_key: row.packet_key,
          source_ref: row.packet_key ? row.packet_key.split(':')[2] : null,
          feature_id: null,
          provenance: 'GDS layout algorithm',
          confidence: 0.75,
          value: row.y_graph,
          safe: false, // y_graph is for layout only, not higher-hop
        };

        if (validatePromotion(candidate)) {
          promotions.push(candidate);
          summary.promoted++;
        } else {
          summary.skipped++;
        }
      }

      // Community promotion
      if (row.community_id !== null) {
        const candidate = {
          field: 'community_id',
          packet_key: row.packet_key,
          source_ref: row.packet_key ? row.packet_key.split(':')[2] : null,
          feature_id: null,
          provenance: 'GDS community detection',
          confidence: 0.80,
          value: row.community_id,
          safe: true,
        };

        if (validatePromotion(candidate)) {
          promotions.push(candidate);
          summary.promoted++;
        } else {
          summary.skipped++;
        }
      }
    }

    console.log(`✓ GDS promotion candidates: ${res.rowCount} inspected`);
  } catch (err) {
    console.error('✗ GDS promotion error:', String(err));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PROMOTER 2: Gemma4 summaries (to atlas_summary_layers)
// ════════════════════════════════════════════════════════════════════════════

async function promoteGemma4Summaries(client) {
  try {
    const query = `
      SELECT
        packet_key,
        summary_text,
        summary_level,
        metadata,
        model_name,
        created_at
      FROM atlas_summary_layers
      WHERE model_name LIKE '%gemma%'
        AND summary_text IS NOT NULL
      LIMIT 500;
    `;

    const res = await client.query(query);

    for (const row of res.rows) {
      const metadata = row.metadata || {};
      const confidence = metadata.confidence || 0.75;

      const candidate = {
        field: `summary_${row.summary_level}`,
        packet_key: row.packet_key,
        source_ref: row.packet_key ? row.packet_key.split(':')[2] : null,
        feature_id: null,
        provenance: `${row.model_name} at ${row.summary_level}`,
        confidence,
        value_len: row.summary_text.length,
        safe: true,
      };

      if (validatePromotion(candidate)) {
        promotions.push(candidate);
        summary.promoted++;
      } else {
        summary.skipped++;
      }
    }

    console.log(`✓ Gemma4 summary promotion candidates: ${res.rowCount} inspected`);
  } catch (err) {
    console.error('✗ Gemma4 promotion error:', String(err));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// VALIDATION
// ════════════════════════════════════════════════════════════════════════════

function validatePromotion(candidate) {
  summary.total_candidates++;

  // Rule 1: Check forbidden mutations
  if (FORBIDDEN_MUTATIONS.includes(candidate.field)) {
    summary.forbidden_mutations++;
    return false;
  }

  // Rule 2: Confidence threshold
  if (candidate.confidence < 0.80) {
    return false;
  }

  // Rule 3: Must have packet_key
  if (!candidate.packet_key) {
    return false;
  }

  // Rule 4: Must have source_ref or derive it
  if (!candidate.source_ref && !candidate.packet_key) {
    return false;
  }

  // Rule 5: Must have provenance
  if (!candidate.provenance) {
    return false;
  }

  // Track by field
  if (!summary.by_field[candidate.field]) {
    summary.by_field[candidate.field] = 0;
  }
  summary.by_field[candidate.field]++;

  return true;
}

// ════════════════════════════════════════════════════════════════════════════
// WRITE PROMOTIONS (if --apply)
// ════════════════════════════════════════════════════════════════════════════

async function applyPromotions(client) {
  if (!isApply) {
    console.log('\n[DRY RUN] Not applying promotions. Use --apply to write.');
    return;
  }

  console.log('\n[APPLYING] Writing promotions to database...\n');

  // Group by field type
  const byField = {};
  for (const promo of promotions) {
    if (!byField[promo.field]) {
      byField[promo.field] = [];
    }
    byField[promo.field].push(promo);
  }

  // Apply GDS fields
  for (const promo of byField['w_authority'] || []) {
    try {
      await client.query(
        'UPDATE atlas_topology_index SET w_authority = $1 WHERE packet_key = $2',
        [promo.value, promo.packet_key]
      );
    } catch (err) {
      console.error(`  ✗ Failed to promote w_authority for ${promo.packet_key}:`, String(err));
    }
  }

  for (const promo of byField['community_id'] || []) {
    try {
      await client.query(
        'UPDATE atlas_topology_index SET community_id = $1 WHERE packet_key = $2',
        [promo.value, promo.packet_key]
      );
    } catch (err) {
      console.error(`  ✗ Failed to promote community_id for ${promo.packet_key}:`, String(err));
    }
  }

  console.log(`Applied ${promotions.length} promotions`);
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

async function runPromotion() {
  const client = await pool.connect();

  try {
    console.log(`[PROMOTE-INFERRED] Starting promotion audit (${isDryRun ? 'DRY RUN' : 'APPLY'})...\n`);

    await promoteGDSFields(client);
    await promoteGemma4Summaries(client);

    await applyPromotions(client);

    // Print results
    console.log('\n' + '═'.repeat(80));
    console.log('PROMOTION AUDIT RESULTS');
    console.log('═'.repeat(80));
    console.log('');

    console.log(`Total candidates evaluated: ${summary.total_candidates}`);
    console.log(`Promoted: ${summary.promoted}`);
    console.log(`Skipped: ${summary.skipped}`);
    console.log(`Forbidden mutations detected: ${summary.forbidden_mutations}`);
    console.log('');

    console.log('By field:');
    for (const [field, count] of Object.entries(summary.by_field)) {
      console.log(`  - ${field}: ${count}`);
    }

    console.log('');
    console.log('═'.repeat(80));

    // Write report
    const reportPath = path.join(REPO_ROOT, 'docs', 'reports', `promotion-audit-${new Date().toISOString().split('T')[0]}.json`);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), summary, promotions, mode: isDryRun ? 'dry-run' : 'apply' }, null, 2));
    console.log(`Report written to: ${reportPath}`);

    process.exit(summary.forbidden_mutations > 0 ? 1 : 0);
  } finally {
    client.release();
    await pool.end();
  }
}

runPromotion().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
