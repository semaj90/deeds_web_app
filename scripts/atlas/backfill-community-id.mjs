#!/usr/bin/env node
/**
 * Priority 0: Topology Propagation Fix
 *
 * Implements directory-based community assignment for source code files.
 *
 * AUDIT FINDING (2026-06-10):
 *   Phase 2B community detection ran on DB schema entities (codebase_files)
 *   but was NOT connected to source code files (nes_chrom_packets).
 *   Result: codebase_files has schema:* paths; nes_chrom_packets has src/lib/* paths.
 *   No common join key exists. Neo4j CodebaseFile.community_id = 0.
 *
 * SOLUTION:
 *   Assign community_id to source files via directory clustering with HONEST LABELING:
 *   - Extract parent directory from source_ref using canonical grouping
 *   - Group files by directory prefixes (src/lib/*, src/routes/*, scripts/*, etc.)
 *   - Assign deterministic community_id via SHA-256 hash of community_key
 *   - Write payload.community = {community_id, community_key, community_source: 'directory_fallback'}
 *   - Populate glyph_records.community_id via packet_key join
 *   - Community source labeled honestly as 'directory_fallback' (not Louvain)
 *
 * Target: glyph_records.community_id > 95%
 *
 * This closes the Phase 2B hard gate and unblocks:
 *   - ATLAS-3A Symbol extraction (needs topology context)
 *   - ATLAS-3C Authority reranker (needs community_id in payloads)
 *   - Authority weighting: directory_fallback communities get 0.45x weight vs 1.0x for Louvain
 *
 * Usage:
 *   npm run atlas:backfill:community-id:analyze     # Report without changes
 *   npm run atlas:backfill:community-id             # Apply backfill
 *   npm run atlas:backfill:community-id:verify      # Check coverage after
 */

import pg from 'pg';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env if not already set
if (!process.env.DATABASE_URL) {
  const envFile = path.join(__dirname, '../../.env');
  try {
    const envContent = fs.readFileSync(envFile, 'utf-8');
    for (const line of envContent.split('\n')) {
      if (line.startsWith('DATABASE_URL=')) {
        process.env.DATABASE_URL = line.split('=')[1];
      }
    }
  } catch (e) {
    // .env file not found, use hardcoded fallback
  }
}

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const DRY_RUN = process.argv.includes('--dry-run');
const ANALYZE_ONLY = process.argv.includes('--analyze');
const VERIFY_ONLY = process.argv.includes('--verify');

// ============================================================================
// Utility: Directory-based canonical community assignment
// ============================================================================

function canonicalSourceRef(ref) {
  return String(ref ?? '')
    .replace(/\\/g, '/')
    .replace(/^sveltekit-frontend\//, '')
    .replace(/^\.\//, '')
    .trim();
}

function communityKey(ref) {
  const canonical = canonicalSourceRef(ref);
  const parts = canonical.split('/').filter(Boolean);

  // Apply canonical grouping based on directory structure
  if (parts[0] === 'src' && parts[1] === 'routes') return parts.slice(0, 4).join('/');
  if (parts[0] === 'src' && parts[1] === 'lib') return parts.slice(0, 4).join('/');
  if (parts[0] === 'scripts') return parts.slice(0, 3).join('/');
  if (parts[0] === 'simd-bridge') return parts.slice(0, 3).join('/');
  if (parts[0] === 'turbovec') return parts.slice(0, 3).join('/');
  if (parts[0] === 'drizzle') return parts.slice(0, 2).join('/');
  if (parts[0] === 'tests') return parts.slice(0, 2).join('/');
  if (parts[0] === 'docker') return parts.slice(0, 2).join('/');

  return parts.slice(0, 2).join('/') || 'unknown';
}

function communityIdFromKey(key) {
  // Deterministic hash-based ID for reproducibility
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return parseInt(hash.slice(0, 8), 16) % 10000;
}

function computeManifold4FromRef(ref) {
  // manifold4[0] = directory / SOM X
  // manifold4[1] = directory / SOM Y
  // manifold4[2] = centroid / feature rank
  // manifold4[3] = community / ontology rank
  // All normalized to [0, 1] via hash

  const hashTopLevel = crypto.createHash('sha256').update(ref.split('/')[0]).digest('hex');
  const hashParent = crypto.createHash('sha256').update(ref.split('/').slice(0, -1).join('/')).digest('hex');
  const hashFull = crypto.createHash('sha256').update(ref).digest('hex');

  return [
    parseInt(hashTopLevel.slice(0, 8), 16) / 0xffffffff,    // [0] directory X
    parseInt(hashParent.slice(0, 8), 16) / 0xffffffff,      // [1] directory Y
    parseInt(hashFull.slice(0, 8), 16) / 0xffffffff,        // [2] feature rank
    parseInt(communityIdFromKey(communityKey(ref)).toString().slice(0, 8) || '0', 16) / 10000 // [3] community rank (normalized)
  ];
}

// ============================================================================
// STEP 1: Analyze directory clustering
// ============================================================================

async function analyzeDirectoryClustering(pool) {
  console.log('📊 Analyzing directory-based community clustering...\n');

  try {
    // Get all source_ref values
    const allRefs = await pool.query(
      `SELECT source_ref FROM nes_chrom_packets
       WHERE source_ref IS NOT NULL
       ORDER BY source_ref`
    );

    const total = allRefs.rows.length;
    console.log(`Total nes_chrom_packets: ${total}`);

    // Build community key map in JavaScript
    const communityMap = new Map(); // community_key → { id, count }
    const sourceRefToCommunityKey = new Map();

    for (const row of allRefs.rows) {
      const key = communityKey(row.source_ref);
      sourceRefToCommunityKey.set(row.source_ref, key);

      if (!communityMap.has(key)) {
        communityMap.set(key, {
          id: communityIdFromKey(key),
          count: 0,
          source: 'directory_fallback'
        });
      }
      communityMap.get(key).count++;
    }

    const communities = Array.from(communityMap.entries())
      .sort((a, b) => b[1].count - a[1].count);

    console.log(`Total source-code packets: ${total}`);
    console.log(`Unique community keys: ${communities.length}`);
    console.log(`Community source: directory_fallback (honest label — NOT Louvain)\n`);

    console.log('Top 20 community keys by packet count:');
    for (let i = 0; i < Math.min(20, communities.length); i++) {
      const [key, meta] = communities[i];
      console.log(`  Community ${meta.id.toString().padStart(5)}: ${key.padEnd(35)} ${meta.count.toString().padStart(5)} packets`);
    }

    const expectedCoverage = total > 0 ? ((total / total) * 100).toFixed(2) : 0;
    console.log(`\nExpected coverage: ${expectedCoverage}% (all packets get a community_key)`);
    console.log('Authority weight: 0.45x (directory_fallback is less trusted than Louvain)\n');
    console.log('(Analysis only. To apply backfill, run without --analyze)\n');

    return communityMap;
  } catch (err) {
    console.error('Analysis error:', err.message);
    throw err;
  }
}

// ============================================================================
// STEP 2: Backfill nes_chrom_packets.payload with community metadata
// ============================================================================

async function backfillNesChromPackets(pool) {
  console.log('📝 Backfilling nes_chrom_packets.payload with topology metadata...\n');

  // Fetch all packets and compute their community assignments in JS
  const allPackets = await pool.query(
    `SELECT packet_key, source_ref FROM nes_chrom_packets
     WHERE source_ref IS NOT NULL
     ORDER BY packet_key`
  );

  let updated = 0;
  let skipped = 0;

  for (const row of allPackets.rows) {
    const key = communityKey(row.source_ref);
    const id = communityIdFromKey(key);
    const manifold4 = computeManifold4FromRef(row.source_ref);

    const communityPayload = {
      community_id: id,
      community_key: key,
      community_source: 'directory_fallback',
      topology_confidence: 0.45,
      manifold4: manifold4,
      distance_metric: 'manhattan_l1'
    };

    const result = await pool.query(
      `UPDATE nes_chrom_packets
       SET payload = jsonb_set(
         COALESCE(payload, '{}'::jsonb),
         '{community}',
         $1::jsonb
       ),
       updated_at = now()
       WHERE packet_key = $2
         AND (payload->'community' IS NULL OR
              (payload->'community'->>'community_id')::int != $3)
       RETURNING packet_key`,
      [JSON.stringify(communityPayload), row.packet_key, id]
    );

    if ((result.rowCount || 0) > 0) {
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`✓ Backfilled ${updated} nes_chrom_packets with full topology metadata`);
  console.log(`✓ Skipped ${skipped} packets (already have community_id)\n`);
  return updated;
}

// ============================================================================
// STEP 3: Backfill glyph_records.community_id
// ============================================================================

async function backfillGlyphRecords(pool) {
  console.log('📝 Backfilling glyph_records.community_id from nes_chrom_packets...\n');

  // Join: glyph_records → nes_chrom_packets (via packet_key) → community_id from nested payload
  const result = await pool.query(
    `UPDATE glyph_records g
     SET community_id = (n.payload->'community'->>'community_id')::integer,
         updated_at = now()
     FROM nes_chrom_packets n
     WHERE n.packet_key = g.packet_key
       AND n.payload->'community'->>'community_id' IS NOT NULL
       AND (g.community_id IS NULL OR g.community_id != (n.payload->'community'->>'community_id')::integer)
     RETURNING g.id`
  );

  const updated = result.rowCount || 0;
  console.log(`✓ Backfilled ${updated} glyph_records.community_id\n`);
  return updated;
}

// ============================================================================
// VERIFICATION
// ============================================================================

async function verifyCoverage(pool) {
  console.log('✅ Verifying coverage gates...\n');

  // Check glyph_records
  const glyphCoverage = await pool.query(
    `SELECT
      COUNT(*) as total,
      COUNT(community_id) as with_community,
      ROUND(100.0 * COUNT(community_id) / NULLIF(COUNT(*), 0), 2) as pct
    FROM glyph_records`
  );

  const glyph = glyphCoverage.rows[0];
  const glyphPass = glyph.pct >= 95;
  console.log(
    `glyph_records.community_id: ${glyph.with_community}/${glyph.total} (${glyph.pct}%) ${glyphPass ? '✅' : '❌'}`
  );

  // Check nes_chrom_packets
  const nesCoverage = await pool.query(
    `SELECT
      COUNT(*) as total,
      COUNT((payload->'community'->>'community_id')) as with_community,
      ROUND(100.0 * COUNT((payload->'community'->>'community_id')) / NULLIF(COUNT(*), 0), 2) as pct
    FROM nes_chrom_packets
    WHERE source_ref IS NOT NULL`
  );

  const nes = nesCoverage.rows[0];
  const nesPass = nes.pct >= 95;
  console.log(
    `nes_chrom_packets.payload.community: ${nes.with_community}/${nes.total} (${nes.pct}%) ${nesPass ? '✅' : '❌'}`
  );

  // Source distribution check
  const sourceDistribution = await pool.query(
    `SELECT
      payload->'community'->>'community_source' as community_source,
      COUNT(*) as count,
      ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM nes_chrom_packets WHERE source_ref IS NOT NULL), 2) as pct
    FROM nes_chrom_packets
    WHERE source_ref IS NOT NULL
      AND payload->'community'->>'community_source' IS NOT NULL
    GROUP BY payload->'community'->>'community_source'
    ORDER BY count DESC`
  );

  console.log(`\nCommunity source distribution:`);
  for (const row of sourceDistribution.rows) {
    console.log(`  ${(row.community_source || 'unknown').padEnd(25)} ${row.count.toString().padStart(5)} packets (${row.pct}%)`);
  }

  // Top community keys
  const topCommunities = await pool.query(
    `SELECT
      payload->'community'->>'community_id' as community_id,
      payload->'community'->>'community_key' as community_key,
      COUNT(*) as count
    FROM nes_chrom_packets
    WHERE payload->'community' IS NOT NULL
    GROUP BY payload->'community'->>'community_id', payload->'community'->>'community_key'
    ORDER BY count DESC
    LIMIT 10`
  );

  console.log(`\nTop 10 community keys (by packet count):`);
  for (const row of topCommunities.rows) {
    console.log(`  ID ${(row.community_id || '?').padStart(5)}: ${(row.community_key || 'unknown').padEnd(35)} ${(row.count || 0).toString().padStart(5)} packets`);
  }

  console.log();
  return glyphPass && nesPass;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('   Priority 0: Topology Propagation (Community ID Backfill)\n');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (VERIFY_ONLY) {
      const pass = await verifyCoverage(pool);
      if (!pass) {
        console.log('❌ Coverage gates NOT met. Run without --verify to backfill.\n');
        process.exit(1);
      }
      console.log('✅ Coverage gates MET. Topology propagation complete.\n');
      process.exit(0);
    }

    await analyzeDirectoryClustering(pool);

    if (ANALYZE_ONLY) {
      console.log('(Analysis only. To apply backfill, run without --analyze)\n');
      process.exit(0);
    }

    if (!DRY_RUN) {
      console.log('⚠️  Starting backfill. This updates 2 tables.\n');
    } else {
      console.log('(DRY RUN: no changes will be made)\n');
    }

    if (!DRY_RUN) {
      // Step 1: nes_chrom_packets
      await backfillNesChromPackets(pool);

      // Step 2: glyph_records
      await backfillGlyphRecords(pool);

      // Verify
      const pass = await verifyCoverage(pool);
      if (!pass) {
        console.log('⚠️  Coverage gates NOT met after backfill.\n');
        console.log('Debug: Check if payload.community structure was written correctly.\n');
        process.exit(1);
      }

      console.log('✅ Priority 0 complete: Topology propagation via directory fallback.\n');
      console.log('   Community source: directory_fallback (honest label, not Louvain)\n');
      console.log('   Authority weight: 0.45x for dir_fallback (vs 1.0x for Louvain)\n');
      console.log('Next: Run ATLAS-3A symbol extraction (topology context now in place)\n');
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
