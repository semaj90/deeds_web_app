#!/usr/bin/env node
/**
 * Phase 3C: Generate SeaweedFS Manifest
 *
 * Creates manifest for cold-storage archival of:
 *   - Directory summaries
 *   - Feature centroids
 *   - Packet metadata (NOT raw code)
 *
 * Output: docs/reports/seaweedfs-manifest.json
 * No mutations. Read-only manifest generation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

// Environment
function loadEnv() {
  const env = { ...process.env };
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env.local'),
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env.local'),
    path.join(ROOT, '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = loadEnv();
const DATABASE_URL = env.DATABASE_URL
  ?? `postgresql://${env.DB_USER ?? 'legal_admin'}:${env.DB_PASSWORD ?? 'legal_password'}@${env.DB_HOST ?? '127.0.0.1'}:${env.DB_PORT ?? '5434'}/${env.DB_NAME ?? 'legal_ai_db'}`;

// ══════════════════════════════════════════════════════════════════════════════
// GENERATE SEAWEEDFS MANIFEST
// ══════════════════════════════════════════════════════════════════════════════

async function generateSeaweedfsFsManifest(pool) {
  console.log('\n📦 Generating SeaweedFS manifest...');

  // Query directory manifests and feature summaries
  const dirResult = await pool.query(`
    SELECT
      id,
      directory_path,
      canonical_key,
      summary_text,
      centroid,
      manifest_hash,
      source_ref_count
    FROM atlas_directory_manifest
    WHERE summary_text IS NOT NULL
      OR centroid IS NOT NULL
    LIMIT 1000
  `);

  const directories = dirResult.rows;
  console.log(`  ✓ Found ${directories.length} directories with summaries/centroids`);

  const manifests = directories.map(dir => {
    const docId = `atlas-dir-${dir.canonical_key}`;
    const contentHash = crypto.createHash('sha256');

    if (dir.summary_text) contentHash.update(dir.summary_text);
    if (dir.centroid) contentHash.update(JSON.stringify(dir.centroid));

    return {
      docId,
      source: 'atlas_directory_manifest',
      directory_path: dir.directory_path,
      canonical_key: dir.canonical_key,
      archived_content: {
        summary: dir.summary_text ? 'yes' : 'no',
        centroid: dir.centroid ? `${(dir.centroid || []).length}-dim` : 'no',
      },
      content_hash: contentHash.digest('hex'),
      manifest_hash: dir.manifest_hash,
      source_ref_count: dir.source_ref_count,
      seaweedfs_bucket: 'atlas-cold',
      seaweedfs_prefix: `manifests/directory/${dir.canonical_key}`,
      seaweedfs_path: `s3://atlas-cold/manifests/directory/${dir.canonical_key}/${docId}.json`,
      created_at: new Date().toISOString(),
      ttl_days: 2555, // ~7 years
      restore_manifest: {
        source: 'atlas_directory_manifest',
        directory_path: dir.directory_path,
        canonical_key: dir.canonical_key,
        can_restore_from_cold: true,
        restore_requires: ['summary_text', 'centroid', 'manifest_hash'],
      },
    };
  });

  console.log(`  ✓ Generated ${manifests.length} SeaweedFS archive entries`);

  return manifests;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('   Phase 3C: SeaweedFS Manifest Generator');
    console.log('═══════════════════════════════════════════════════════════');

    const manifests = await generateSeaweedfsFsManifest(pool);

    const report = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      description: 'Cold-storage manifest for SeaweedFS archival',
      archival_strategy: {
        what_to_archive: ['Directory summaries', 'Feature centroids', 'Packet metadata'],
        what_NOT_to_archive: ['Raw code', 'Full embedding vectors', 'Source files'],
        target_storage: 's3://atlas-cold/ (SeaweedFS S3 gateway)',
        ttl: '2555 days (~7 years)',
        restore_capability: 'Full: can reconstruct topology from manifests',
      },
      buckets: {
        'atlas-cold': 'Directory manifests, feature summaries, metadata',
        'atlas-evidence': 'Evidence object references (metadata only)',
        'atlas-archive': 'Legacy archived packets (read-only)',
      },
      total_entries: manifests.length,
      total_content_size_estimate: `${(manifests.length * 2).toFixed(0)} KB`, // rough est: ~2KB per entry
      manifests: manifests.slice(0, 100), // Include first 100 for preview
      manifests_total_count: manifests.length,
    };

    // Write report
    const reportDir = path.join(ROOT, 'docs', 'reports');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    const jsonPath = path.join(reportDir, 'seaweedfs-manifest.json');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    console.log(`\n✅ SeaweedFS manifest written to ${jsonPath}`);
    console.log(`\n📦 Manifest Summary:`);
    console.log(`  Total Entries: ${report.total_entries}`);
    console.log(`  Target Bucket: s3://atlas-cold/`);
    console.log(`  TTL: ${report.archival_strategy.ttl}`);
    console.log(`  Preview: First ${Math.min(100, manifests.length)} entries shown`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
