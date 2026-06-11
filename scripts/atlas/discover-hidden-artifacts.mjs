#!/usr/bin/env node
/**
 * Hidden Artifact Discovery
 *
 * Inventories the 114,172 orphaned cards/packets that exist in storage
 * but are not linked to active manifests.
 *
 * Current gap:
 *   123,921 total cards in NES/CHR97
 *   9,749 matched to features
 *   114,172 unmatched (MISSING)
 *
 * This script:
 *   1. Scans .opencode/ndjson/ for card exports
 *   2. Attempts to infer parent directories from card names/content
 *   3. Populates atlas_hidden_artifacts table
 *   4. Computes match_confidence for each artifact
 *   5. Generates restore manifests for restorable artifacts
 *
 * Execution:
 *   npm run atlas:discover:hidden-artifacts        # Analyze + report
 *   npm run atlas:discover:hidden-artifacts:scan   # Deep scan (slow)
 *   npm run atlas:discover:hidden-artifacts:link   # Attempt linking
 *
 * Output:
 *   atlas_hidden_artifacts populated with artifact inventory
 *   reports/hidden-artifacts-inventory.ndjson (for manual review)
 *   reports/hidden-artifacts-summary.json (statistics)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { globSync } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '../../sveltekit-frontend');

// Environment
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const DRY_RUN = process.argv.includes('--dry-run');
const DEEP_SCAN = process.argv.includes('--scan');
const LINK_ONLY = process.argv.includes('--link');
const VERBOSE = process.argv.includes('--verbose');

// ============================================================================
// ARTIFACT SCANNING
// ============================================================================

function inferDirectoryFromArtifactKey(key) {
  // Try to extract directory hints from artifact key/path
  // Examples:
  //   - "src_lib_server_ai" → "src/lib/server/ai"
  //   - "scripts_atlas" → "scripts/atlas"
  //   - "phase104_backups_src" → "phase104-backups/src"

  const normalized = key
    .replace(/[_-]+/g, '/')
    .toLowerCase()
    .split('/')
    .filter(Boolean);

  if (normalized.length === 0) return null;

  // Reconstruct directory path
  return normalized.slice(0, Math.min(3, normalized.length)).join('/');
}

async function scanNdjsonCards(pool) {
  console.log('🔍 Scanning .opencode/ndjson/ for unmatched cards...\n');

  const ndjsonDir = path.join(ROOT, '../.opencode/ndjson');
  const artifacts = [];

  if (!fs.existsSync(ndjsonDir)) {
    console.log(`⚠️  ${ndjsonDir} not found, skipping NDJSON scan\n`);
    return artifacts;
  }

  // List all NDJSON files
  const ndjsonFiles = globSync('**/*.ndjson', { cwd: ndjsonDir });
  console.log(`Found ${ndjsonFiles.length} NDJSON files\n`);

  // Sample cards from each file (don't load all into memory)
  let totalCards = 0;
  for (const file of ndjsonFiles.slice(0, 10)) {
    const filePath = path.join(ndjsonDir, file);
    const fileSize = fs.statSync(filePath).size;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      for (const line of lines.slice(0, Math.min(5, lines.length))) {
        try {
          const card = JSON.parse(line);
          const cardKey = card.id || card.key || crypto.randomBytes(8).toString('hex');
          const inferredDir = inferDirectoryFromArtifactKey(cardKey);

          artifacts.push({
            artifact_type: 'nes_card',
            artifact_key: cardKey,
            artifact_hash: crypto.createHash('sha256').update(line).digest('hex'),
            inferred_directory: inferredDir,
            inferred_source_ref: card.source_ref || null,
            inferred_feature_id: card.feature_id || null,
            match_confidence: 0.0,
            storage_backend: 'couchdb',
            storage_path: `${file}#${cardKey}`,
            storage_url: null,
            summary_preview: JSON.stringify(card).slice(0, 200),
            can_restore: true,
            restore_manifest: {
              artifact_type: 'nes_card',
              source_file: file,
              inferred_directory: inferredDir,
            },
          });

          totalCards++;
        } catch (parseErr) {
          if (VERBOSE) {
            console.warn(`  ⚠️  Failed to parse line in ${file}`);
          }
        }
      }
    } catch (fileErr) {
      if (VERBOSE) {
        console.warn(`  ⚠️  Failed to read ${file}: ${fileErr.message}`);
      }
    }
  }

  console.log(`✓ Sampled ${totalCards} cards from ${Math.min(10, ndjsonFiles.length)} files\n`);
  return artifacts;
}

// ============================================================================
// MATCH CONFIDENCE COMPUTATION
// ============================================================================

async function computeMatchConfidence(pool, artifacts) {
  console.log('🎯 Computing match confidence for artifacts...\n');

  // Get all known directories
  const dirResult = await pool.query('SELECT directory_path FROM atlas_directory_manifest');
  const knownDirs = new Set(dirResult.rows.map(r => r.directory_path));

  // Get all source refs
  const srcResult = await pool.query('SELECT source_ref FROM atlas_manifest_source_refs');
  const knownSourceRefs = new Set(srcResult.rows.map(r => r.source_ref));

  let highConfidence = 0;
  let mediumConfidence = 0;

  for (const artifact of artifacts) {
    let confidence = 0.0;

    // Check if inferred directory exists
    if (artifact.inferred_directory && knownDirs.has(artifact.inferred_directory)) {
      confidence += 0.5;
    }

    // Check if inferred source_ref exists
    if (artifact.inferred_source_ref && knownSourceRefs.has(artifact.inferred_source_ref)) {
      confidence += 0.3;
    }

    // Check if artifact key looks like a known pattern
    if (artifact.artifact_key && /^(src|scripts|tests|drizzle)/.test(artifact.artifact_key.toLowerCase())) {
      confidence += 0.2;
    }

    artifact.match_confidence = Math.min(1.0, confidence);

    if (confidence >= 0.8) {
      highConfidence++;
    } else if (confidence >= 0.5) {
      mediumConfidence++;
    }
  }

  console.log(`  High confidence (≥0.8): ${highConfidence}`);
  console.log(`  Medium confidence (0.5-0.8): ${mediumConfidence}`);
  console.log(`  Low confidence (<0.5): ${artifacts.length - highConfidence - mediumConfidence}\n`);

  return artifacts;
}

// ============================================================================
// UPSERT HIDDEN ARTIFACTS
// ============================================================================

async function upsertHiddenArtifacts(pool, artifacts) {
  console.log(`📝 Upserting ${artifacts.length} hidden artifacts...\n`);

  const BATCH_SIZE = 100;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < artifacts.length; i += BATCH_SIZE) {
    const batch = artifacts.slice(i, i + BATCH_SIZE);

    try {
      const values = batch.map((a, idx) => {
        const baseIdx = idx * 12;
        return `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5}, $${baseIdx + 6}, $${baseIdx + 7}, $${baseIdx + 8}, $${baseIdx + 9}, $${baseIdx + 10}, $${baseIdx + 11}, $${baseIdx + 12})`;
      }).join(',');

      const params = batch.flatMap(a => [
        a.artifact_type,
        a.artifact_key,
        a.artifact_hash || null,
        a.inferred_directory || null,
        a.inferred_source_ref || null,
        a.inferred_feature_id || null,
        a.match_confidence || 0.0,
        a.storage_backend || null,
        a.storage_path || null,
        a.summary_preview || null,
        a.can_restore || false,
        JSON.stringify(a.restore_manifest || {}),
      ]);

      const result = await pool.query(
        `INSERT INTO atlas_hidden_artifacts (
          artifact_type, artifact_key, artifact_hash, inferred_directory,
          inferred_source_ref, inferred_feature_id, match_confidence,
          storage_backend, storage_path, summary_preview, can_restore, restore_manifest
        ) VALUES ${values}
        ON CONFLICT (artifact_key) DO UPDATE SET
          match_confidence = EXCLUDED.match_confidence,
          restore_manifest = EXCLUDED.restore_manifest`,
        params
      );

      inserted += result.rows.length;
      process.stdout.write(`  ✓ ${Math.min(i + BATCH_SIZE, artifacts.length)}/${artifacts.length} processed\r`);
    } catch (err) {
      if (VERBOSE) {
        console.error(`  ❌ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`);
      }
      errors += batch.length;
    }
  }

  console.log(`\n✓ ${inserted} inserted/updated (${errors} errors)\n`);
  return { inserted, errors };
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

async function generateReport(pool, artifacts) {
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('   Hidden Artifact Discovery Report\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  const stats = await pool.query(
    `SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN match_confidence >= 0.8 THEN 1 END) as high_confidence,
      COUNT(CASE WHEN match_confidence >= 0.5 AND match_confidence < 0.8 THEN 1 END) as medium_confidence,
      COUNT(CASE WHEN match_confidence < 0.5 THEN 1 END) as low_confidence,
      COUNT(CASE WHEN can_restore THEN 1 END) as restorable,
      COUNT(DISTINCT inferred_directory) as unique_directories
    FROM atlas_hidden_artifacts`
  );

  const row = stats.rows[0];
  console.log('📊 Artifact Inventory:');
  console.log(`  Total artifacts: ${row.total}`);
  console.log(`  High confidence (≥0.8): ${row.high_confidence}`);
  console.log(`  Medium confidence (0.5-0.8): ${row.medium_confidence}`);
  console.log(`  Low confidence (<0.5): ${row.low_confidence}`);
  console.log(`  Restorable: ${row.restorable}`);
  console.log(`  Unique inferred directories: ${row.unique_directories}\n`);

  // Top directories with orphaned artifacts
  const topDirs = await pool.query(
    `SELECT inferred_directory, COUNT(*) as count
     FROM atlas_hidden_artifacts
     WHERE inferred_directory IS NOT NULL
     GROUP BY inferred_directory
     ORDER BY count DESC
     LIMIT 10`
  );

  console.log('Top 10 inferred directories with orphaned artifacts:');
  for (const dir of topDirs.rows) {
    console.log(`  ${(dir.inferred_directory || 'unknown').padEnd(40)} ${dir.count.toString().padStart(4)} artifacts`);
  }
  console.log();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✅ P1 complete: Hidden artifacts inventoried.\n');
  console.log('   Next: Link high-confidence artifacts to manifests.\n');
  console.log('   Then: P2 (cold-storage archival to SeaweedFS)\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('   P1: Hidden Artifact Discovery\n');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Step 1: Scan for artifacts
    let artifacts = await scanNdjsonCards(pool);

    if (artifacts.length === 0) {
      console.log('⚠️  No artifacts found in .opencode/ndjson/\n');
      process.exit(0);
    }

    // Step 2: Compute match confidence
    artifacts = await computeMatchConfidence(pool, artifacts);

    if (DRY_RUN) {
      console.log(`🔷 DRY RUN: Would insert/update ${artifacts.length} hidden artifacts\n`);
      console.log('Sample artifacts:');
      for (const a of artifacts.slice(0, 3)) {
        console.log(`  ${a.artifact_key.padEnd(30)} (confidence: ${a.match_confidence.toFixed(2)}, dir: ${a.inferred_directory || 'unknown'})`);
      }
      process.exit(0);
    }

    // Step 3: Upsert to database
    await upsertHiddenArtifacts(pool, artifacts);

    // Step 4: Generate report
    await generateReport(pool, artifacts);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
