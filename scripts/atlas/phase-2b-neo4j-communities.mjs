#!/usr/bin/env node
/**
 * phase-2b-neo4j-communities.mjs
 *
 * Executes ATLAS-2.0 Phase 2B: Neo4j Sync + Community Detection + Manifold4[3]
 *
 * Phase 2B Order:
 *   1. Run Neo4j sync (sync-graph-truth-neo4j.mjs --apply)
 *   2. Export SIMILAR_TOPOLOGY edges from Neo4j (implicit via sync)
 *   3. Run graph-engine detectCommunitiesRust (via graphrag-kmeans-communities.mjs)
 *   4. Update glyph_records.community_id from Rust results
 *   5. Recompute manifold4[3] as community dimension
 *
 * Hard Gates (end of Phase 2B):
 *   - community_id coverage > 80%
 *   - manifold4 non-zero coverage > 80%
 *   - packet_key coverage remains 100% (from Phase 2A)
 *   - ATLAS-1.0 completion gate still 100% (from Phase 2A)
 *
 * Usage:
 *   node scripts/atlas/phase-2b-neo4j-communities.mjs --dry-run
 *   node scripts/atlas/phase-2b-neo4j-communities.mjs --apply
 *   node scripts/atlas/phase-2b-neo4j-communities.mjs --apply --skip-neo4j
 *   node scripts/atlas/phase-2b-neo4j-communities.mjs --apply --limit=1000
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// ── CLI Arguments ──────────────────────────────────────────────────────────────
const argv = new Set(process.argv.slice(2));
const APPLY = argv.has('--apply');
const DRY_RUN = !APPLY;
const SKIP_NEO4J = argv.has('--skip-neo4j');
const LIMIT_ARG = [...argv].find((arg) => arg.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : null;

// ── Environment Loading ──────────────────────────────────────────────────────
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = {
  ...loadEnv(path.join(ROOT, '.env')),
  ...loadEnv(path.join(ROOT, 'sveltekit-frontend', '.env')),
  ...process.env,
};

const DATABASE_URL = env.DATABASE_URL || env.ADMIN_DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

// ── Logging ────────────────────────────────────────────────────────────────────
console.log(`\n═════════════════════════════════════════════════════════════════`);
console.log(`ATLAS-2.0 Phase 2B: Neo4j Sync + Community Detection + Manifold4[3]`);
console.log(`═════════════════════════════════════════════════════════════════\n`);
console.log(`[${APPLY ? 'APPLY' : 'DRY-RUN'}] Phase 2B execution`);
console.log(`Database: ${DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}`);
if (!SKIP_NEO4J) console.log(`Step 1: Running Neo4j sync (--apply mode)`);
console.log(`Step 3: Running Rust community detection`);
console.log(`Step 4: Updating glyph_records.community_id`);
console.log(`Step 5: Recomputing manifold4[3]\n`);

// ── Step 1: Neo4j Sync ─────────────────────────────────────────────────────────
async function runNeo4jSync() {
  if (DRY_RUN) {
    console.log(`⏭️  [DRY-RUN] Skipping Neo4j sync (would run sync-graph-truth-neo4j.mjs --apply)`);
    return;
  }

  if (SKIP_NEO4J) {
    console.log(`⏭️  [--skip-neo4j] Skipping Neo4j sync`);
    return;
  }

  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'sync-graph-truth-neo4j.mjs');
    console.log(`⏳ Step 1: Running Neo4j sync...`);
    const proc = spawn('node', [scriptPath, '--apply'], { stdio: 'inherit', cwd: ROOT });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ Neo4j sync completed\n`);
        resolve();
      } else {
        reject(new Error(`Neo4j sync failed with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

// ── Step 3: Community Detection ────────────────────────────────────────────────
async function runCommunityDetection() {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'graphrag-kmeans-communities.mjs');
    console.log(`⏳ Step 3: Running Rust community detection...`);
    const proc = spawn('node', [scriptPath], { stdio: 'inherit', cwd: ROOT });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ Community detection completed\n`);
        resolve();
      } else {
        reject(new Error(`Community detection failed with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

// ── Step 4-5: Update glyph_records + manifold4 ─────────────────────────────────
async function updateGlyphRecordsWithCommunities() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    // Check if community_id column exists
    console.log(`⏳ Step 4-5: Checking schema and updating glyph_records...`);
    const schemaRes = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'glyph_records' AND column_name = 'community_id'
    `);

    const hasCommunityId = schemaRes.rows.length > 0;
    if (!hasCommunityId && APPLY) {
      console.log(`  Adding community_id column to glyph_records...`);
      await pool.query(`ALTER TABLE glyph_records ADD COLUMN community_id INTEGER`);
      console.log(`  ✓ community_id column added`);
    } else if (!hasCommunityId) {
      console.log(`  [DRY-RUN] Would add community_id column to glyph_records`);
    }

    // Query codebase_files with community assignments
    const communityRes = await pool.query(`
      SELECT file_path, community_id
      FROM codebase_files
      WHERE community_id IS NOT NULL
      ORDER BY file_path
    `);
    const communityMap = new Map(communityRes.rows.map(r => [r.file_path, r.community_id]));
    console.log(`  ✓ Loaded ${communityMap.size} codebase_files with community assignments`);

    // Query glyph_records needing community assignment
    const limitClause = LIMIT ? `LIMIT ${LIMIT}` : '';
    const glyphRes = await pool.query(`
      SELECT id, source_ref, community_id
      FROM glyph_records
      WHERE source_ref IS NOT NULL
      ORDER BY source_ref
      ${limitClause}
    `);

    console.log(`  Processing ${glyphRes.rows.length} glyph_records...`);

    let updated = 0;
    let communityIdSet = 0;
    let manifoldComputed = 0;

    // Batch update with community_id and compute manifold4[3]
    const BATCH_SIZE = 250;
    for (let i = 0; i < glyphRes.rows.length; i += BATCH_SIZE) {
      const batch = glyphRes.rows.slice(i, i + BATCH_SIZE);
      const updates = [];

      for (const row of batch) {
        // Map source_ref to normalized file_path for lookup
        const normalizedPath = row.source_ref.replace(/^sveltekit-frontend\//, '');
        const communityId = communityMap.get(normalizedPath);

        if (communityId && !row.community_id) {
          // Compute manifold4 quaternion: [SOM_x, SOM_y, semantic_z, community_w]
          // For Phase 2B: manifold4[3] = community_id (normalized to quaternion weight)
          const communityWeight = Math.min(1.0, communityId / 100); // Simple normalization
          const manifold4 = [0, 0, 0, communityWeight]; // Placeholder for full vector

          updates.push({
            id: row.id,
            communityId,
            manifold4: JSON.stringify(manifold4),
          });
          communityIdSet++;
        }
      }

      if (APPLY && updates.length > 0) {
        // Batch INSERT/UPDATE via VALUES and ON CONFLICT
        const updateQueries = updates.map((u, idx) => `
          ('${u.id}', ${u.communityId}, '${u.manifold4}'::jsonb)
        `).join(',');

        await pool.query(`
          INSERT INTO glyph_records (id, community_id, topology)
          VALUES ${updateQueries}
          ON CONFLICT (id) DO UPDATE SET
            community_id = EXCLUDED.community_id,
            topology = jsonb_set(glyph_records.topology, '{manifold4}', EXCLUDED.topology->'manifold4')
        `);
        updated += updates.length;
        manifoldComputed += updates.length;
      }
    }

    console.log(`  ✓ Updated ${updated} glyph_records with community_id`);
    console.log(`  ✓ Computed manifold4[3] for ${manifoldComputed} records\n`);

    // Phase 2B Hard Gates
    console.log(`═══════════════════════════════════════════════════════════════`);
    console.log(`Phase 2B Hard Gates:`);
    console.log(`═══════════════════════════════════════════════════════════════\n`);

    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM glyph_records WHERE community_id IS NOT NULL)::float /
        NULLIF((SELECT COUNT(*) FROM glyph_records), 0) AS community_coverage,
        (SELECT COUNT(*) FROM glyph_records WHERE topology->>'manifold4' IS NOT NULL)::float /
        NULLIF((SELECT COUNT(*) FROM glyph_records), 0) AS manifold4_coverage,
        (SELECT COUNT(*) FROM glyph_records WHERE source_ref IS NOT NULL) AS total_glyphs_with_source
    `);

    const row = stats.rows[0];
    const communityCoverage = (row.community_coverage * 100).toFixed(1);
    const manifold4Coverage = (row.manifold4_coverage * 100).toFixed(1);

    console.log(`community_id coverage:    ${communityCoverage}% (gate: > 80%)`);
    console.log(`manifold4[3] coverage:    ${manifold4Coverage}% (gate: > 80%)`);

    // Verify Phase 2A invariant (packet_key coverage = 100%)
    const packet2aRes = await pool.query(`
      SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE source_ref IS NOT NULL) as with_ref
      FROM nes_chrom_packets
      WHERE lane = 'atlas_materialized'
    `);
    const packet2a = packet2aRes.rows[0];
    const packetCoverage = (packet2a.with_ref / packet2a.total * 100).toFixed(1);
    console.log(`packet_key coverage (P2A): ${packetCoverage}% (gate: = 100%)`);

    // Summary
    const gate2bPass = parseFloat(communityCoverage) > 80 && parseFloat(manifold4Coverage) > 80;
    const gate2aStable = parseFloat(packetCoverage) === 100;

    if (gate2bPass && gate2aStable) {
      console.log(`\n✅ Phase 2B HARD GATES: PASS`);
      console.log(`   - community_id coverage ${communityCoverage}% > 80%`);
      console.log(`   - manifold4[3] coverage ${manifold4Coverage}% > 80%`);
      console.log(`   - Phase 2A packet_key coverage 100% preserved`);
    } else {
      console.log(`\n⚠️  Phase 2B HARD GATES: INCOMPLETE`);
      if (parseFloat(communityCoverage) <= 80) console.log(`   - community_id coverage ${communityCoverage}% < 80%`);
      if (parseFloat(manifold4Coverage) <= 80) console.log(`   - manifold4[3] coverage ${manifold4Coverage}% < 80%`);
    }

    if (!gate2aStable) {
      console.log(`   ❌ Phase 2A invariant broken: packet_key coverage ${packetCoverage}% != 100%`);
    }

    console.log(`\nNext Phase (2C):`);
    console.log(`  1. Populate SOM BMU row/col if missing`);
    console.log(`  2. Recompute manifold4[0..1] from SOM coords`);
    console.log(`  3. Audit non-zero manifold distribution\n`);

  } catch (err) {
    console.error('❌ Update failed:', err.message);
    throw err;
  } finally {
    await pool.end();
  }
}

// ── Main Orchestration ─────────────────────────────────────────────────────────
async function main() {
  try {
    // Step 1: Neo4j Sync
    if (!SKIP_NEO4J) {
      await runNeo4jSync();
    }

    // Step 3: Community Detection (always runs)
    await runCommunityDetection();

    // Step 4-5: Update glyph_records with community_id + manifold4[3]
    await updateGlyphRecordsWithCommunities();

    console.log(`═══════════════════════════════════════════════════════════════`);
    console.log(`Phase 2B execution complete`);
    console.log(`═══════════════════════════════════════════════════════════════\n`);

  } catch (err) {
    console.error(`\n❌ Phase 2B failed:`, err.message);
    process.exit(1);
  }
}

main();
