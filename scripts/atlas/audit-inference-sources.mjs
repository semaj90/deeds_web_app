#!/usr/bin/env node

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

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

const inferences = [];
const summary = {
  total_inferred_fields: 0,
  by_source: {},
  by_evidence_mode: {},
  by_confidence: { high: 0, medium: 0, low: 0 },
  safe_for_ranking: 0,
  safe_for_higher_hop: 0,
  identity_mutations_detected: 0,
};

// ════════════════════════════════════════════════════════════════════════════
// AUDIT 1: Neo4j GDS artifacts (authority, community, graph positioning)
// ════════════════════════════════════════════════════════════════════════════

async function auditNeoGDS(client) {
  try {
    // Check topology_index for GDS-derived fields
    const query = `
      SELECT
        packet_key,
        y_graph,
        w_authority,
        community_id,
        x_cosine,
        z_som,
        created_at
      FROM atlas_topology_index
      WHERE w_authority IS NOT NULL OR community_id IS NOT NULL
      LIMIT 100;
    `;

    const res = await client.query(query);

    for (const row of res.rows) {
      if (row.w_authority !== null) {
        inferences.push({
          field: 'w_authority',
          source_system: 'neo4j_gds',
          evidence_mode: 'derived_gds',
          confidence: 0.85,
          source_ref: row.packet_key ? row.packet_key.split(':')[2] : null,
          packet_key: row.packet_key,
          feature_id: null,
          provenance: 'GDS PageRank algorithm',
          safe_for_ranking: true,
          safe_for_higher_hop: true,
          value_sample: row.w_authority,
        });
      }

      if (row.community_id !== null) {
        inferences.push({
          field: 'community_id',
          source_system: 'neo4j_gds',
          evidence_mode: 'derived_gds',
          confidence: 0.80,
          source_ref: row.packet_key ? row.packet_key.split(':')[2] : null,
          packet_key: row.packet_key,
          feature_id: null,
          provenance: 'GDS community detection algorithm',
          safe_for_ranking: true,
          safe_for_higher_hop: true,
          value_sample: row.community_id,
        });
      }

      if (row.y_graph !== null) {
        inferences.push({
          field: 'y_graph',
          source_system: 'neo4j_gds',
          evidence_mode: 'derived_gds',
          confidence: 0.75,
          source_ref: row.packet_key ? row.packet_key.split(':')[2] : null,
          packet_key: row.packet_key,
          feature_id: null,
          provenance: 'GDS graph embedding / layout algorithm',
          safe_for_ranking: true,
          safe_for_higher_hop: false,
          value_sample: row.y_graph,
        });
      }
    }

    console.log(`✓ Neo4j GDS audit: ${res.rowCount} rows inspected`);
  } catch (err) {
    console.error('✗ Neo4j GDS audit error:', String(err));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// AUDIT 2: Gemma4 summaries in atlas_summary_layers
// ════════════════════════════════════════════════════════════════════════════

async function auditGemma4Summaries(client) {
  try {
    const query = `
      SELECT
        packet_key,
        summary_level,
        summary_text,
        model_name,
        metadata,
        created_at
      FROM atlas_summary_layers
      WHERE model_name LIKE '%gemma%' OR model_name LIKE '%rotorquant%'
      LIMIT 100;
    `;

    const res = await client.query(query);

    for (const row of res.rows) {
      const metadata = row.metadata || {};
      const confidence = metadata.confidence || 0.75;

      inferences.push({
        field: `summary_${row.summary_level}`,
        source_system: 'gemma4',
        evidence_mode: 'derived_gemma4',
        confidence,
        source_ref: row.packet_key ? row.packet_key.split(':')[2] : null,
        packet_key: row.packet_key,
        feature_id: null,
        provenance: `${row.model_name} generation at ${row.summary_level} level`,
        safe_for_ranking: true,
        safe_for_higher_hop: false,
        value_sample: row.summary_text ? row.summary_text.substring(0, 80) : null,
      });
    }

    console.log(`✓ Gemma4 audit: ${res.rowCount} summaries inspected`);
  } catch (err) {
    console.error('✗ Gemma4 audit error:', String(err));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// AUDIT 3: atlas_summary_layers metadata for LangExtract concepts
// ════════════════════════════════════════════════════════════════════════════

async function auditLangExtract(client) {
  try {
    const query = `
      SELECT
        packet_key,
        metadata,
        created_at
      FROM atlas_summary_layers
      WHERE metadata IS NOT NULL
        AND (metadata->'concepts' IS NOT NULL
          OR metadata->'entities' IS NOT NULL
          OR metadata->'relations' IS NOT NULL)
      LIMIT 100;
    `;

    const res = await client.query(query);

    for (const row of res.rows) {
      const metadata = row.metadata || {};
      const concepts = metadata.concepts || [];
      const entities = metadata.entities || [];
      const relations = metadata.relations || [];

      if (concepts.length > 0) {
        inferences.push({
          field: 'derived_concepts',
          source_system: 'langextract',
          evidence_mode: 'derived_langextract',
          confidence: 0.70,
          source_ref: row.packet_key ? row.packet_key.split(':')[2] : null,
          packet_key: row.packet_key,
          feature_id: null,
          provenance: 'LangExtract concept extraction',
          safe_for_ranking: true,
          safe_for_higher_hop: false,
          value_sample: JSON.stringify(concepts.slice(0, 3)),
        });
      }

      if (entities.length > 0) {
        inferences.push({
          field: 'derived_entities',
          source_system: 'langextract',
          evidence_mode: 'derived_langextract',
          confidence: 0.65,
          source_ref: row.packet_key ? row.packet_key.split(':')[2] : null,
          packet_key: row.packet_key,
          feature_id: null,
          provenance: 'LangExtract entity extraction',
          safe_for_ranking: true,
          safe_for_higher_hop: false,
          value_sample: JSON.stringify(entities.slice(0, 3)),
        });
      }

      if (relations.length > 0) {
        inferences.push({
          field: 'derived_relations',
          source_system: 'langextract',
          evidence_mode: 'derived_langextract',
          confidence: 0.60,
          source_ref: row.packet_key ? row.packet_key.split(':')[2] : null,
          packet_key: row.packet_key,
          feature_id: null,
          provenance: 'LangExtract relation extraction',
          safe_for_ranking: false,
          safe_for_higher_hop: false,
          value_sample: JSON.stringify(relations.slice(0, 2)),
        });
      }
    }

    console.log(`✓ LangExtract audit: ${res.rowCount} metadata entries inspected`);
  } catch (err) {
    console.error('✗ LangExtract audit error:', String(err));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// AUDIT 4: Native packet identity (truth baseline)
// ════════════════════════════════════════════════════════════════════════════

async function auditNativeIdentity(client) {
  try {
    const query = `
      SELECT
        COUNT(*) as total_packets,
        COUNT(CASE WHEN packet_key IS NULL THEN 1 END) as missing_packet_key,
        COUNT(CASE WHEN source_ref IS NULL THEN 1 END) as missing_source_ref,
        COUNT(CASE WHEN feature_id IS NULL THEN 1 END) as missing_feature_id
      FROM atlas_codebase_packets;
    `;

    const res = await client.query(query);
    const row = res.rows[0];

    inferences.push({
      field: 'native_identity',
      source_system: 'postgres',
      evidence_mode: 'native',
      confidence: 1.0,
      source_ref: null,
      packet_key: null,
      feature_id: null,
      provenance: 'Postgres canonical identity (packet_key, source_ref, feature_id)',
      safe_for_ranking: true,
      safe_for_higher_hop: true,
      value_sample: `${row.total_packets} packets: ${row.missing_packet_key} missing packet_key, ${row.missing_source_ref} missing source_ref, ${row.missing_feature_id} missing feature_id`,
    });

    console.log(`✓ Native identity audit: ${row.total_packets} packets verified`);
  } catch (err) {
    console.error('✗ Native identity audit error:', String(err));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// AUDIT 5: Tree node hierarchy (native structure)
// ════════════════════════════════════════════════════════════════════════════

async function auditTreeStructure(client) {
  try {
    const query = `
      SELECT
        COUNT(*) as total_nodes,
        COUNT(CASE WHEN parent_id IS NULL THEN 1 END) as root_nodes,
        MAX(tree_depth) as max_depth
      FROM atlas_tree_nodes;
    `;

    const res = await client.query(query);
    const row = res.rows[0];

    inferences.push({
      field: 'native_hierarchy',
      source_system: 'postgres',
      evidence_mode: 'native',
      confidence: 1.0,
      source_ref: null,
      packet_key: null,
      feature_id: null,
      provenance: 'Postgres canonical tree structure (parent_id, tree_depth)',
      safe_for_ranking: true,
      safe_for_higher_hop: true,
      value_sample: `${row.total_nodes} nodes: ${row.root_nodes} roots, depth=${row.max_depth}`,
    });

    console.log(`✓ Tree structure audit: ${row.total_nodes} nodes verified`);
  } catch (err) {
    console.error('✗ Tree structure audit error:', String(err));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// AUDIT 6: Check for identity mutations (forbidden)
// ════════════════════════════════════════════════════════════════════════════

async function auditIdentityMutations(client) {
  try {
    // Check if any inferred system tried to overwrite packet_key
    const query = `
      SELECT
        COUNT(*) as mutation_count
      FROM atlas_codebase_packets
      WHERE packet_key ~ '^inferred_' OR packet_key ~ '^derived_';
    `;

    const res = await client.query(query);
    const mutationCount = res.rows[0].mutation_count || 0;

    if (mutationCount > 0) {
      summary.identity_mutations_detected = mutationCount;
      console.error(`⚠️  MUTATION DETECTED: ${mutationCount} packets have inferred packet_key`);
    } else {
      console.log(`✓ Identity mutation check: no forbidden mutations detected`);
    }
  } catch (err) {
    console.error('✗ Identity mutation audit error:', String(err));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// BUILD SUMMARY
// ════════════════════════════════════════════════════════════════════════════

function buildSummary() {
  summary.total_inferred_fields = inferences.length;

  for (const inf of inferences) {
    const source = inf.source_system;
    if (!summary.by_source[source]) {
      summary.by_source[source] = 0;
    }
    summary.by_source[source]++;

    const mode = inf.evidence_mode;
    if (!summary.by_evidence_mode[mode]) {
      summary.by_evidence_mode[mode] = 0;
    }
    summary.by_evidence_mode[mode]++;

    if (inf.confidence >= 0.80) {
      summary.by_confidence.high++;
    } else if (inf.confidence >= 0.70) {
      summary.by_confidence.medium++;
    } else {
      summary.by_confidence.low++;
    }

    if (inf.safe_for_ranking) {
      summary.safe_for_ranking++;
    }
    if (inf.safe_for_higher_hop) {
      summary.safe_for_higher_hop++;
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

async function runAudit() {
  const client = await pool.connect();

  try {
    console.log('[INFERENCE-AUDIT] Starting inference source audit...\n');

    await auditNativeIdentity(client);
    await auditTreeStructure(client);
    await auditNeoGDS(client);
    await auditGemma4Summaries(client);
    await auditLangExtract(client);
    await auditIdentityMutations(client);

    buildSummary();

    // Print results
    console.log('\n' + '═'.repeat(80));
    console.log('INFERENCE SOURCE AUDIT RESULTS');
    console.log('═'.repeat(80));
    console.log('');

    console.log(`Total inferred fields catalogued: ${summary.total_inferred_fields}`);
    console.log(`By source system: ${JSON.stringify(summary.by_source)}`);
    console.log(`By evidence mode: ${JSON.stringify(summary.by_evidence_mode)}`);
    console.log(`By confidence: high=${summary.by_confidence.high}, medium=${summary.by_confidence.medium}, low=${summary.by_confidence.low}`);
    console.log(`Safe for ranking: ${summary.safe_for_ranking}`);
    console.log(`Safe for higher-hop expansion: ${summary.safe_for_higher_hop}`);
    console.log(`Identity mutations detected: ${summary.identity_mutations_detected}`);
    console.log('');

    // Write JSON report
    const reportPath = path.join(REPO_ROOT, 'docs', 'reports', 'inference-source-audit.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), summary, inferences }, null, 2));
    console.log(`Report written to: ${reportPath}`);

    // Write markdown report
    const mdPath = path.join(REPO_ROOT, 'docs', 'reports', 'inference-source-audit.md');
    let mdContent = `# Inference Source Audit\n\n**Date**: ${new Date().toISOString()}\n\n`;
    mdContent += `## Summary\n\n`;
    mdContent += `- **Total inferred fields**: ${summary.total_inferred_fields}\n`;
    mdContent += `- **Identity mutations**: ${summary.identity_mutations_detected}\n`;
    mdContent += `- **Safe for ranking**: ${summary.safe_for_ranking}\n`;
    mdContent += `- **Safe for higher-hop**: ${summary.safe_for_higher_hop}\n\n`;

    mdContent += `## By Source System\n\n`;
    for (const [source, count] of Object.entries(summary.by_source)) {
      mdContent += `- **${source}**: ${count}\n`;
    }

    mdContent += `\n## By Evidence Mode\n\n`;
    for (const [mode, count] of Object.entries(summary.by_evidence_mode)) {
      mdContent += `- **${mode}**: ${count}\n`;
    }

    mdContent += `\n## By Confidence Level\n\n`;
    mdContent += `- **High (≥0.80)**: ${summary.by_confidence.high}\n`;
    mdContent += `- **Medium (0.70-0.79)**: ${summary.by_confidence.medium}\n`;
    mdContent += `- **Low (<0.70)**: ${summary.by_confidence.low}\n`;

    fs.writeFileSync(mdPath, mdContent);
    console.log(`Markdown report written to: ${mdPath}\n`);

    console.log('═'.repeat(80));
    process.exit(summary.identity_mutations_detected > 0 ? 1 : 0);
  } finally {
    client.release();
    await pool.end();
  }
}

runAudit().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
