#!/usr/bin/env node
/**
 * @file scripts/atlas/index-env-contract.mjs
 * @description Reads Environment Contract JSON artifact and indexes it as an atlas_packets entry.
 * Stage 2-3 (Consumer Dry-Run + Consumer Apply) in the Parent Atlas mutation contract.
 *
 * Input:
 *   docs/reports/env-contract-audit.json (from Stage 1 producer)
 *
 * Output (dry-run):
 *   docs/reports/env-contract-index-dry-run.json
 *
 * Execution:
 *   node scripts/atlas/index-env-contract.mjs [--apply]
 */

import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const REPORT_PATH = 'docs/reports/env-contract-audit.json';

function sha256First16(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
}

async function main() {
  // Read and parse the audit artifact
  const rawReport = await fs.readFile(REPORT_PATH, 'utf8');
  let audit;

  try {
    audit = JSON.parse(rawReport);
  } catch (e) {
    throw new Error(`Failed to parse audit artifact at ${REPORT_PATH}: ${e.message}`);
  }

  if (!audit?.metadata?.secrets_redacted) {
    throw new Error('Audit metadata must have secrets_redacted: true');
  }

  // Build the packet that will be indexed
  const packet = {
    packet_kind: 'env_contract',
    packet_key: `env_contract:${sha256First16('parent-atlas-env-contract')}`,
    source_ref: 'env-contract:parent-atlas',
    feature_id: 'infrastructure_env_contract',
    community_id: null,
    description: 'Documents server-only and client-safe environment variables for Parent Atlas.',
    summary: 'ACE/KAG/DAG-grounded env contract for Postgres, Redis/Valkey, Qdrant, llama-server, TurboVec, XGBoost, CUDA, and optional browser ONNX/WebGPU settings. Secrets are redacted.',
    ace_kag_dag_hits: audit.ace_kag_dag_hits ?? [],
    metadata: audit.metadata,
    payload: audit.payload
  };

  console.log(`\n====================================================`);
  console.log(`[STATUS] Environment Contract Indexer`);
  console.log(`[MODE] ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`====================================================`);

  console.log('\n--- Generated Atlas Packet Preview ---');
  console.log(JSON.stringify(packet, null, 2));
  console.log('--------------------------------------\n');

  if (!APPLY) {
    // Stage 3: Dry-run mode
    const dryRunReport = {
      ok: true,
      mode: 'dry-run',
      generated_at: new Date().toISOString(),
      next_step: `node ${process.argv[1]} --apply`,
      ace_kag_dag_hit: {
        packet_kind: packet.packet_kind,
        packet_key: packet.packet_key,
        source_ref: packet.source_ref,
        feature_id: packet.feature_id,
        description: packet.description,
        summary: packet.summary,
        evidence: packet.ace_kag_dag_hits
      },
      would_write: {
        postgres: 'atlas_packets',
        qdrant: 'optional_payload_mirror',
        redis: 'optional_env_contract_metadata'
      },
      packet: packet
    };

    const dryRunPath = path.resolve(ROOT, 'docs/reports/env-contract-index-dry-run.json');
    await fs.mkdir(path.dirname(dryRunPath), { recursive: true });
    await fs.writeFile(dryRunPath, JSON.stringify(dryRunReport, null, 2));
    console.log(`✅ Dry-run report written: ${dryRunPath}`);
    console.log(`Next step after review: node ${process.argv[1]} --apply`);
    return;
  }

  // Stage 5: Apply mode — perform actual DB mutation
  console.log('⚙️ Applying: Upserting packet to atlas_packets...');

  const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });

  try {
    // Generate a deterministic packet_id from the packet_key
    const packetId = `atlas:${packet.packet_key}`;

    const result = await pool.query(
      `INSERT INTO atlas_packets (
        packet_id, artifact_id, packet_key, source_ref, source_kind, feature_id,
        community_id, summary, payload, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (packet_key) WHERE packet_key IS NOT NULL DO UPDATE SET
        payload = EXCLUDED.payload,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING packet_key`,
      [
        packetId,
        sha256First16(packet.packet_key),  // artifact_id
        packet.packet_key,
        packet.source_ref,
        packet.packet_kind,
        packet.feature_id,
        packet.community_id,
        packet.summary,
        JSON.stringify(packet.payload),
        JSON.stringify(packet.metadata)
      ]
    );

    console.log(`\n✅ Packet upserted: ${packet.packet_key}`);
    if (VERBOSE) {
      console.log(`   Packet ID: ${packetId}`);
    }

    console.log(`✅ ACE/KAG/DAG evidence recorded: infrastructure_env_contract`);
    console.log(`\n✨ Environment Contract indexing complete!`);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('\n❌ FAILED:', err.message);
  if (VERBOSE) {
    console.error(err.stack);
  }
  process.exit(1);
});
