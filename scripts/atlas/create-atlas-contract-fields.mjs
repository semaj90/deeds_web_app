#!/usr/bin/env node
/**
 * create-atlas-contract-fields.mjs
 *
 * Idempotent migration script to create `atlas_contract_fields` and `retrieval_provenance` tables
 * in Postgres and seed them with initial canonical field mappings.
 *
 * Usage:
 *   node scripts/atlas/create-atlas-contract-fields.mjs
 *   node scripts/atlas/create-atlas-contract-fields.mjs --dry-run
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const DRY_RUN = process.argv.includes('--dry-run');

function loadEnv() {
  const env = { ...process.env };
  const envPaths = [
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env'),
  ];
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
      break;
    }
  }
  return env;
}

const ENV = loadEnv();
const DATABASE_URL = ENV.DATABASE_URL_MIGRATOR || ENV.DATABASE_URL ||
  `postgresql://${ENV.DB_USER ?? 'legal_admin'}:${ENV.DB_PASSWORD ?? '123456'}@${ENV.DB_HOST ?? '127.0.0.1'}:${ENV.DB_PORT ?? '5434'}/${ENV.DB_NAME ?? 'legal_ai_db'}`;

const INITIAL_SEEDS = [
  // source_ref mappings
  { raw: 'canonicalSourceRef', canonical: 'source_ref', type: 'qdrant_payload', desc: 'Canonical source ref' },
  { raw: 'sourceRef', canonical: 'source_ref', type: 'qdrant_payload', desc: 'CamelCase source ref' },
  { raw: 'source_path', canonical: 'source_ref', type: 'qdrant_payload', desc: 'Snake_case source path' },
  { raw: 'filePath', canonical: 'source_ref', type: 'qdrant_payload', desc: 'CamelCase file path' },
  { raw: 'file_path', canonical: 'source_ref', type: 'qdrant_payload', desc: 'Snake_case file path' },
  { raw: 'rel_path', canonical: 'source_ref', type: 'postgres_table', desc: 'Relative path in parent documents' },
  { raw: 'relPath', canonical: 'source_ref', type: 'postgres_table', desc: 'CamelCase relative path in parent documents' },

  // feature_id mappings
  { raw: 'featureId', canonical: 'feature_id', type: 'qdrant_payload', desc: 'CamelCase feature ID' },
  { raw: 'feature', canonical: 'feature_id', type: 'qdrant_payload', desc: 'Short feature alias' },

  // feature_label mappings
  { raw: 'featureLabel', canonical: 'feature_label', type: 'qdrant_payload', desc: 'CamelCase feature label' },
  { raw: 'feature_name', canonical: 'feature_label', type: 'qdrant_payload', desc: 'Alternate feature name' },

  // domain_class mappings
  { raw: 'domain', canonical: 'domain_class', type: 'qdrant_payload', desc: 'Generic domain' },
  { raw: 'domainClass', canonical: 'domain_class', type: 'qdrant_payload', desc: 'CamelCase domain class' },

  // ontology_label mappings
  { raw: 'ontology', canonical: 'ontology_label', type: 'qdrant_payload', desc: 'Generic ontology name' },

  // topology_label mappings
  { raw: 'topology', canonical: 'ontology_label', type: 'qdrant_payload', desc: 'Generic topology name' },

  // community_id mappings
  { raw: 'community', canonical: 'community_id', type: 'qdrant_payload', desc: 'Generic community' },
  { raw: 'communityId', canonical: 'community_id', type: 'qdrant_payload', desc: 'CamelCase community ID' },

  // som_cluster mappings
  { raw: 'som_cell', canonical: 'som_cluster', type: 'qdrant_payload', desc: 'Alternate SOM coordinate key' },

  // packet_key mappings
  { raw: 'packetKey', canonical: 'packet_key', type: 'qdrant_payload', desc: 'CamelCase packet key' },
  { raw: 'id', canonical: 'packet_key', type: 'qdrant_payload', desc: 'Raw document/packet identifier' },
];

async function main() {
  console.log(`[migrate:contract-fields] Initializing migration...`);
  if (DRY_RUN) console.log(`[migrate:contract-fields] NOTE: Running in DRY-RUN mode.`);

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // 1. Create atlas_contract_fields table
    console.log(`[migrate:contract-fields] Creating table 'atlas_contract_fields'...`);
    const createContractFieldsSQL = `
      CREATE TABLE IF NOT EXISTS atlas_contract_fields (
        id SERIAL PRIMARY KEY,
        raw_field TEXT NOT NULL,
        canonical_field TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_acf_raw_field ON atlas_contract_fields(raw_field);
      CREATE INDEX IF NOT EXISTS idx_acf_canonical_field ON atlas_contract_fields(canonical_field);
    `;
    
    if (!DRY_RUN) {
      await pool.query(createContractFieldsSQL);
      console.log(`[migrate:contract-fields] Table 'atlas_contract_fields' ready.`);
    } else {
      console.log(`[dry-run] SQL to run:\n${createContractFieldsSQL}`);
    }

    // 2. Create retrieval_provenance table
    console.log(`[migrate:contract-fields] Creating table 'retrieval_provenance'...`);
    const createProvenanceSQL = `
      CREATE TABLE IF NOT EXISTS retrieval_provenance (
        id SERIAL PRIMARY KEY,
        story_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        trace_id TEXT,
        query_hash TEXT NOT NULL,
        packet_key TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        source_ref_key TEXT,
        feature_id TEXT NOT NULL,
        feature_label TEXT,
        cache_namespace TEXT,
        cache_key TEXT,
        cache_hit_source TEXT,
        graph_stage_status TEXT,
        traversal_path JSONB,
        fusion_score DOUBLE PRECISION,
        verdict TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_rp_story_task ON retrieval_provenance(story_id, task_id);
      CREATE INDEX IF NOT EXISTS idx_rp_packet_key ON retrieval_provenance(packet_key);
      CREATE INDEX IF NOT EXISTS idx_rp_source_ref ON retrieval_provenance(source_ref);
      CREATE INDEX IF NOT EXISTS idx_rp_feature_id ON retrieval_provenance(feature_id);
      CREATE INDEX IF NOT EXISTS idx_rp_query_hash ON retrieval_provenance(query_hash);
    `;

    if (!DRY_RUN) {
      await pool.query(createProvenanceSQL);
      console.log(`[migrate:contract-fields] Table 'retrieval_provenance' ready.`);
    } else {
      console.log(`[dry-run] SQL to run:\n${createProvenanceSQL}`);
    }

    // 3. Seed atlas_contract_fields
    console.log(`[migrate:contract-fields] Seeding contract mappings...`);
    let seeded = 0;
    for (const seed of INITIAL_SEEDS) {
      if (!DRY_RUN) {
        // Check if raw field mapping already exists
        const check = await pool.query(
          `SELECT 1 FROM atlas_contract_fields WHERE raw_field = $1 AND entity_type = $2`,
          [seed.raw, seed.type]
        );
        if (check.rows.length === 0) {
          await pool.query(
            `INSERT INTO atlas_contract_fields (raw_field, canonical_field, entity_type, description) VALUES ($1, $2, $3, $4)`,
            [seed.raw, seed.canonical, seed.type, seed.desc]
          );
          seeded++;
        }
      } else {
        console.log(`[dry-run] Would seed mapping: ${seed.raw} -> ${seed.canonical} (${seed.type})`);
        seeded++;
      }
    }
    console.log(`[migrate:contract-fields] Seeded ${seeded} mapping records.`);

  } catch (err) {
    console.error(`[migrate:contract-fields] Migration failed:`, err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
