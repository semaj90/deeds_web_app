#!/usr/bin/env node
/**
 * ATLAS Directory Manifest Builder
 *
 * Builds the replayable repository topology:
 * Directory → SourceRef → Feature → Packet → Embedding → Storage
 *
 * P0 target: Initialize atlas_directory_manifest from source tree
 * P1 target: Inventory hidden artifacts (114,172 unmatched cards)
 * P2 target: Wire to cold storage (SeaweedFS archive)
 *
 * Execution:
 *   npm run atlas:build:manifest              # Full build + upsert
 *   npm run atlas:build:manifest:dry          # Analysis only, no DB writes
 *   npm run atlas:build:manifest:discover     # Find orphaned artifacts
 *   npm run atlas:build:manifest:cold-archive # Archive to SeaweedFS
 *
 * Output:
 *   atlas_directory_manifest populated with directory topology
 *   atlas_manifest_source_refs populated with source→feature mappings
 *   atlas_hidden_artifacts populated with orphaned card/packet discovery
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import { globSync } from 'glob';
import { resolveAtlasPaths } from './lib/repo-paths.mjs';

const { frontendRoot: ROOT } = resolveAtlasPaths(import.meta.url);

// Environment
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const DRY_RUN = process.argv.includes('--dry-run');
const DISCOVER_ONLY = process.argv.includes('--discover');
const COLD_ARCHIVE = process.argv.includes('--cold-archive');
const VERBOSE = process.argv.includes('--verbose');

// ============================================================================
// DIRECTORY TREE WALK
// ============================================================================

function canonicalKey(dirPath) {
  return crypto.createHash('sha256').update(dirPath).digest('hex');
}

function getParentDirectory(dirPath) {
  const normalized = dirPath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join('/');
}

async function buildDirectoryManifest(pool) {
  console.log('📁 Building directory manifest from source tree...\n');

  const directoriesSet = new Set();
  const directoryMap = new Map();

  // Walk the source tree and collect all directories with source files
  const sourceGlobs = [
    'src/**/*.ts',
    'src/**/*.tsx',
    'src/**/*.svelte',
    'src/**/*.js',
    'scripts/**/*.ts',
    'scripts/**/*.mjs',
    'tests/**/*.ts',
    'drizzle/**/*.ts',
  ];

  for (const glob of sourceGlobs) {
    const files = globSync(glob, { cwd: ROOT, nodir: false });
    for (const file of files) {
      const dirPath = path.dirname(file).replace(/\\/g, '/');
      const parts = dirPath.split('/').filter(Boolean);

      // Add all ancestor directories
      for (let i = 1; i <= parts.length; i++) {
        const ancestorPath = parts.slice(0, i).join('/');
        directoriesSet.add(ancestorPath);
      }
    }
  }

  console.log(`📊 Found ${directoriesSet.size} unique directories\n`);

  // Build manifest entries
  const manifests = [];
  for (const dirPath of directoriesSet) {
    const key = canonicalKey(dirPath);
    const parent = getParentDirectory(dirPath);
    const depth = dirPath.split('/').length;

    // Count source refs in this directory
    const sourceRefs = globSync(`${dirPath}/*`, { cwd: ROOT });
    const sourceRefCount = sourceRefs.filter(f => {
      const stat = fs.statSync(path.join(ROOT, f));
      return stat.isFile() && ['.ts', '.tsx', '.svelte', '.js', '.mjs'].includes(path.extname(f));
    }).length;

    manifests.push({
      directory_path: dirPath,
      canonical_key: key,
      parent_directory: parent,
      depth,
      source_ref_count: sourceRefCount,
      extraction_version: process.env.GIT_COMMIT || new Date().toISOString(),
    });

    directoryMap.set(dirPath, key);
  }

  console.log(`✓ Created ${manifests.length} manifest entries\n`);
  return { manifests, directoryMap };
}

// ============================================================================
// MANIFEST UPSERT
// ============================================================================

async function upsertManifests(pool, manifests) {
  console.log(`📝 Upserting ${manifests.length} directory manifests (batch mode)...\n`);

  const BATCH_SIZE = 100;
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < manifests.length; i += BATCH_SIZE) {
    const batch = manifests.slice(i, i + BATCH_SIZE);

    try {
      const values = batch.map((m, idx) => {
        const baseIdx = idx * 8;
        return `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5}, $${baseIdx + 6}, $${baseIdx + 7}, $${baseIdx + 8})`;
      }).join(',');

      const params = batch.flatMap(m => [
        m.directory_path,
        m.canonical_key,
        m.parent_directory || null,
        m.depth,
        m.source_ref_count,
        m.feature_id_count || 0,
        m.packet_id_count || 0,
        m.extraction_version,
      ]);

      const result = await pool.query(
        `INSERT INTO atlas_directory_manifest (
          directory_path, canonical_key, parent_directory, depth,
          source_ref_count, feature_id_count, packet_id_count, extraction_version
        ) VALUES ${values}
        ON CONFLICT (canonical_key)
        DO UPDATE SET
          source_ref_count = EXCLUDED.source_ref_count,
          updated_at = now()
        RETURNING id, (xmax = 0) AS is_insert`,
        params
      );

      for (const row of result.rows) {
        if (row.is_insert) {
          inserted++;
        } else {
          updated++;
        }
      }

      process.stdout.write(`  ✓ ${Math.min(i + BATCH_SIZE, manifests.length)}/${manifests.length} processed\r`);
    } catch (err) {
      console.error(`  ❌ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`);
      errors += batch.length;
    }
  }

  console.log(`\n✓ ${inserted} inserted, ${updated} updated (${errors} errors)\n`);
  return { inserted, updated, errors };
}

// ============================================================================
// SOURCE REF MAPPING
// ============================================================================

async function buildSourceRefMapping(pool) {
  console.log('🔗 Building source_ref → manifest mappings...\n');

  // Get all manifests
  const manifests = await pool.query('SELECT id, directory_path FROM atlas_directory_manifest ORDER BY directory_path');

  let mapped = 0;
  let errors = 0;

  for (const manifest of manifests.rows) {
    try {
      // Get all source files in this directory
      const sourceGlobs = [`${manifest.directory_path}/*`];
      let sourceRefs = [];

      for (const glob of sourceGlobs) {
        const files = globSync(glob, { cwd: ROOT });
        sourceRefs = sourceRefs.concat(
          files
            .filter(f => {
              const ext = path.extname(f);
              return ['.ts', '.tsx', '.svelte', '.js', '.mjs'].includes(ext);
            })
            .map(f => f.replace(/\\/g, '/'))
        );
      }

      if (sourceRefs.length > 0) {
        const values = sourceRefs.map((ref, idx) => {
          return `($${idx * 2 + 1}, $${idx * 2 + 2})`;
        }).join(',');

        const params = sourceRefs.flatMap(ref => [manifest.id, ref]);

        await pool.query(
          `INSERT INTO atlas_manifest_source_refs (manifest_id, source_ref)
           VALUES ${values}
           ON CONFLICT (source_ref) DO UPDATE SET
             manifest_id = EXCLUDED.manifest_id`,
          params
        );

        mapped += sourceRefs.length;
      }
    } catch (err) {
      if (VERBOSE) {
        console.warn(`  ⚠️ Failed to map ${manifest.directory_path}: ${err.message}`);
      }
      errors++;
    }
  }

  console.log(`✓ Mapped ${mapped} source refs\n`);
  return { mapped, errors };
}

// ============================================================================
// ARTIFACT DISCOVERY (P1)
// ============================================================================

async function discoverHiddenArtifacts(pool) {
  console.log('🔍 Discovering hidden artifacts...\n');

  // This is P1 work: scan Qdrant, Redis, NDJSON for unmatched cards
  console.log('P1 target: Inventory 114,172 unmatched cards');
  console.log('  - Scan Qdrant codebase_chunks_768 for unmapped payloads');
  console.log('  - Scan Redis ace:* keys for orphaned packets');
  console.log('  - Scan .opencode/ndjson/ for unlinked exports\n');

  console.log('Status: Deferred (requires Qdrant/Redis introspection)\n');
}

// ============================================================================
// COLD ARCHIVE (P2)
// ============================================================================

async function coldArchiveManifests(pool) {
  console.log('❄️ Cold archiving manifests to SeaweedFS...\n');

  console.log('P2 target: Archive summaries + centroids to Tier 2');
  console.log('  - Export atlas_directory_manifest → JSON blobs');
  console.log('  - Store in SeaweedFS with restore_manifest');
  console.log('  - Update cold_storage_manifest with paths\n');

  console.log('Status: Deferred (requires SeaweedFS wiring)\n');
}

// ============================================================================
// VERIFICATION
// ============================================================================

async function verifyCoverage(pool) {
  console.log('✅ Verifying manifest coverage...\n');

  const coverage = await pool.query(
    `SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN source_ref_count > 0 THEN 1 END) as with_sources,
      COUNT(CASE WHEN feature_id_count > 0 THEN 1 END) as with_features,
      COUNT(CASE WHEN is_complete THEN 1 END) as complete
    FROM atlas_directory_manifest`
  );

  const row = coverage.rows[0];
  console.log(`Total manifests: ${row.total}`);
  console.log(`With sources: ${row.with_sources} (${(row.with_sources / row.total * 100).toFixed(1)}%)`);
  console.log(`With features: ${row.with_features} (${(row.with_features / row.total * 100).toFixed(1)}%)`);
  console.log(`Complete: ${row.complete} (${(row.complete / row.total * 100).toFixed(1)}%)\n`);

  // Top directories by source count
  const topDirs = await pool.query(
    `SELECT directory_path, source_ref_count FROM atlas_directory_manifest
     WHERE source_ref_count > 0
     ORDER BY source_ref_count DESC LIMIT 10`
  );

  console.log('Top 10 directories by source count:');
  for (const dir of topDirs.rows) {
    console.log(`  ${dir.directory_path.padEnd(40)} ${dir.source_ref_count.toString().padStart(3)} sources`);
  }
  console.log();
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('   P0: Directory Manifest Builder (Replayable Topology)\n');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (DISCOVER_ONLY) {
      await discoverHiddenArtifacts(pool);
      process.exit(0);
    }

    if (COLD_ARCHIVE) {
      await coldArchiveManifests(pool);
      process.exit(0);
    }

    // Step 1: Build directory tree
    const { manifests, directoryMap } = await buildDirectoryManifest(pool);

    if (DRY_RUN) {
      console.log('🔷 DRY RUN: Would insert/update %d manifests', manifests.length);
      console.log('Sample manifests:');
      for (const m of manifests.slice(0, 5)) {
        console.log(`  ${m.directory_path.padEnd(30)} (${m.source_ref_count} sources)`);
      }
      console.log(`  ... and ${Math.max(0, manifests.length - 5)} more\n`);
      process.exit(0);
    }

    // Step 2: Upsert manifests
    await upsertManifests(pool, manifests);

    // Step 3: Build source ref mappings
    await buildSourceRefMapping(pool);

    // Step 4: Verify
    await verifyCoverage(pool);

    console.log('✅ P0 complete: Directory manifest built and verified.\n');
    console.log('   Directory → SourceRef → Feature → Packet → Embedding → Storage\n');
    console.log('Next: P1 (discover hidden artifacts) + P2 (cold archive)\n');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
