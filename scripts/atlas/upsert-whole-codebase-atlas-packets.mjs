#!/usr/bin/env node
/**
 * Phase D: Upsert Whole-Codebase Atlas Packets
 *
 * Create/update atlas_packets for full repo:
 * - Source files, config, docs, proto, SQL
 * - Derive packet_key from stable source_ref hash
 * - Preserve existing packet_key when source_ref already exists
 * - Binary/model artifacts: metadata-only
 * - No secrets from .env files
 *
 * Output: JSON + Markdown reports
 */

import pg from 'pg';
import { execSync } from 'child_process';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../');
const ENV = loadRepoEnv(process.env);
Object.assign(process.env, ENV);

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const verbose = args.includes('--verbose');

const EXCLUDE_PATTERNS = [
  '.git',
  'node_modules',
  '.svelte-kit',
  '.vite',
  'dist',
  'build',
  'coverage',
  '.cache',
  '.pytest_cache',
  '__pycache__',
  'models',
  '.opencode',
  'deeds_labs',
  '.claude',
  '.venv',
  'venv',
];

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function determineFeatureId(source_ref) {
  // Extract domain from path: src/lib/server/db/client.ts -> db.client
  const parts = source_ref.split('/').filter(p => p && p !== 'src' && p !== 'lib' && p !== 'server');
  const basename = path.basename(source_ref, path.extname(source_ref));
  if (parts.length >= 2) {
    return `${parts[0]}.${basename}`;
  }
  return basename;
}

/**
 * Scan repo and extract packets
 */
async function extractWholeCodebasePackets() {
  const excludeArgs = EXCLUDE_PATTERNS.map(p => `--glob=!${p}`).join(' ');

  try {
    const cmd = `rg --files -uuu ${excludeArgs}`;
    const fileList = execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 50 }).split('\n').filter(Boolean);

    const packets = [];

    for (const file of fileList) {
      const source_ref = file.replace(/\\/g, '/');
      const packet_key = `packet:${sha256(source_ref).slice(0, 12)}`;
      const feature_id = determineFeatureId(source_ref);
      const feature_label = path.basename(source_ref);

      const fullPath = path.join(REPO_ROOT, file);
      let size = 0;
      try {
        const stat = await fs.stat(fullPath);
        size = stat.size;
      } catch {
        // Skip files we can't stat
      }

      const isTextSafe = !['.gguf', '.bin', '.pt', '.safetensors', '.exe', '.dll', '.so', '.dylib']
        .some(ext => file.endsWith(ext));

      const metadata = {
        identity: {
          created_at: new Date().toISOString(),
          created_by: 'phase-d:whole-codebase-scan',
          source: 'filesystem',
          version: 1,
        },
        workspace: {
          universe: 'atlas',
          domain: 'codebase',
          text_safe: isTextSafe,
          size_bytes: size,
        },
      };

      packets.push({
        packet_id: packet_key,
        packet_key,
        artifact_id: `artifact:${sha256(source_ref).slice(0, 16)}`,
        source_ref,
        file_path: source_ref,
        feature_id,
        feature_label,
        group_id: path.dirname(source_ref),
        packet_universe: 'atlas',
        metadata: JSON.stringify(metadata),
      });
    }

    return packets;
  } catch (err) {
    console.error('[error]', err.message);
    return [];
  }
}

/**
 * Upsert packets to Postgres
 */
async function upsertPackets(pool, packets) {
  if (dryRun) {
    console.log(`[phase-d] DRY-RUN: would upsert ${packets.length} packets`);
    return { success: 0, skipped: 0, failed: 0 };
  }

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const packet of packets) {
    try {
      // Check if source_ref already exists
      const checkRes = await pool.query(
        'SELECT packet_key FROM atlas_packets WHERE source_ref = $1',
        [packet.source_ref]
      );

      if (checkRes.rows.length > 0) {
        // Preserve existing packet_key
        skipped += 1;
        continue;
      }

      // Insert new packet
      await pool.query(
        `INSERT INTO atlas_packets (
          packet_id, artifact_id, packet_key, source_ref, file_path, feature_id, feature_label,
          group_id, packet_universe, metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
        ON CONFLICT (packet_key) DO NOTHING`,
        [
          packet.packet_id,
          packet.artifact_id,
          packet.packet_key,
          packet.source_ref,
          packet.file_path,
          packet.feature_id,
          packet.feature_label,
          packet.group_id,
          packet.packet_universe,
          packet.metadata,
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );

      success += 1;
    } catch (err) {
      if (verbose) console.error(`[phase-d] Failed to upsert ${packet.source_ref}:`, err.message);
      failed += 1;
    }
  }

  console.log(`[phase-d] ✅ Upserted ${success}/${packets.length} packets (${skipped} skipped, ${failed} failed)`);
  return { success, skipped, failed };
}

/**
 * Generate reports
 */
async function generateReports(packets, result) {
  const jsonReport = {
    generated_at: new Date().toISOString(),
    summary: {
      total_packets: packets.length,
      upserted: result.success,
      skipped: result.skipped,
      failed: result.failed,
    },
    sample_packets: packets.slice(0, 20),
  };

  const mdReport = [
    '# Whole-Codebase Atlas Packet Upsert Report',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    `- **Total Packets**: ${packets.length}`,
    `- **Upserted**: ${result.success}`,
    `- **Skipped**: ${result.skipped}`,
    `- **Failed**: ${result.failed}`,
    '',
    '## Next Steps',
    '1. npm run atlas:turbovec:export',
    '2. npm run atlas:turbovec:smoke',
    '3. npm run atlas:qdrant:whole-sync:dry',
  ].join('\n');

  const jsonPath = path.join(REPO_ROOT, 'docs/reports/whole-codebase-atlas-packet-upsert.json');
  const mdPath = path.join(REPO_ROOT, 'docs/reports/whole-codebase-atlas-packet-upsert.md');

  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(jsonReport, null, 2));
  await fs.writeFile(mdPath, mdReport);

  console.log(`[phase-d] Reports written:`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  Markdown: ${mdPath}`);
}

/**
 * Main
 */
async function main() {
  const pool = new Pool({ connectionString: resolveDatabaseUrl(ENV), max: 1 });

  console.log('[phase-d] Phase D: Whole-Codebase Atlas Packet Upsert');
  console.log(`[phase-d] Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`[phase-d] Repo Root: ${REPO_ROOT}\n`);

  try {
    console.log('[step-1] Extract packets from whole codebase');
    const packets = await extractWholeCodebasePackets();
    console.log(`[phase-d] Extracted ${packets.length} packets\n`);

    console.log('[step-2] Upsert packets to Postgres');
    const result = await upsertPackets(pool, packets);

    console.log('\n[step-3] Generate reports');
    await generateReports(packets, result);

    console.log('\n[summary] ✅ Phase D whole-codebase packet upsert complete');
  } catch (err) {
    console.error('[error]', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
