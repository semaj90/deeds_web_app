#!/usr/bin/env node
/**
 * @file scripts/atlas/index-parent-atlas-packets.mjs
 * @description Reads Parent Atlas Packets Manifest and indexes packet definitions.
 * Stage 2-3 (Consumer Dry-Run + Consumer Apply) in the Parent Atlas mutation contract.
 *
 * Input:
 *   docs/reports/parent-atlas-packets-manifest.json (from Stage 1 producer)
 *
 * Output (dry-run):
 *   docs/reports/parent-atlas-packets-index-dry-run.json
 *
 * Execution:
 *   node scripts/atlas/index-parent-atlas-packets.mjs [--apply]
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
const REPORT_PATH = 'docs/reports/parent-atlas-packets-manifest.json';

function sha256First16(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
}

async function main() {
  // Read and parse the manifest artifact
  const rawReport = await fs.readFile(REPORT_PATH, 'utf8');
  let manifest;

  try {
    manifest = JSON.parse(rawReport);
  } catch (e) {
    throw new Error(`Failed to parse manifest artifact at ${REPORT_PATH}: ${e.message}`);
  }

  // Build packets from manifest
  const packets = [];
  for (const stage of manifest.stages) {
    for (const packetDef of stage.packets) {
      packets.push({
        packet_kind: packetDef.packet_kind,
        packet_key: packetDef.packet_key,
        source_ref: packetDef.source_ref,
        feature_id: packetDef.feature_id,
        description: packetDef.description,
        summary: packetDef.description,
        community_id: null,
        metadata: {
          stage: stage.name,
          stage_description: stage.description,
          manifest_version: manifest.version,
          generated_at: manifest.generated_at
        }
      });
    }
  }

  console.log(`\n====================================================`);
  console.log(`[STATUS] Parent Atlas Packets Indexer`);
  console.log(`[MODE] ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`[PACKETS] ${packets.length} packet definitions to index`);
  console.log(`====================================================`);

  console.log('\n--- First 3 Packet Previews ---');
  packets.slice(0, 3).forEach((p, i) => {
    console.log(`\n${i + 1}. ${p.feature_id}`);
    console.log(`   Key: ${p.packet_key}`);
    console.log(`   Ref: ${p.source_ref}`);
  });
  console.log('\n--------------------------------------\n');

  if (!APPLY) {
    // Stage 3: Dry-run mode
    const dryRunReport = {
      ok: true,
      mode: 'dry-run',
      generated_at: new Date().toISOString(),
      next_step: `node ${process.argv[1]} --apply`,
      packet_count: packets.length,
      would_write: {
        postgres: 'atlas_packets',
        count: packets.length
      },
      sample_packets: packets.slice(0, 3)
    };

    const dryRunPath = path.resolve(ROOT, 'docs/reports/parent-atlas-packets-index-dry-run.json');
    await fs.mkdir(path.dirname(dryRunPath), { recursive: true });
    await fs.writeFile(dryRunPath, JSON.stringify(dryRunReport, null, 2));
    console.log(`✅ Dry-run report written: ${dryRunPath}`);
    console.log(`Next step after review: node ${process.argv[1]} --apply`);
    return;
  }

  // Stage 5: Apply mode — perform actual DB mutation
  console.log('⚙️ Applying: Upserting packets to atlas_packets...');

  const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });

  try {
    let upserted = 0;
    for (const packet of packets) {
      const packetId = `atlas:${packet.packet_key}`;
      await pool.query(
        `INSERT INTO atlas_packets (
          packet_id, artifact_id, packet_key, source_ref, source_kind, feature_id,
          community_id, summary, payload, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (packet_key) WHERE packet_key IS NOT NULL DO UPDATE SET
          summary = EXCLUDED.summary,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()`,
        [
          packetId,
          sha256First16(packet.packet_key),
          packet.packet_key,
          packet.source_ref,
          packet.packet_kind,
          packet.feature_id,
          packet.community_id,
          packet.summary,
          JSON.stringify({}),
          JSON.stringify(packet.metadata)
        ]
      );
      upserted++;
    }

    console.log(`\n✅ Packets upserted: ${upserted}/${packets.length}`);
    console.log(`✅ Parent Atlas packet definitions indexed`);
    console.log(`\n✨ Parent Atlas Packets indexing complete!`);
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
