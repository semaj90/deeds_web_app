#!/usr/bin/env node
/**
 * Normalize Stale Packet Format to Canonical
 *
 * Converts old `sourceRef: "file:src/..."` format to canonical Postgres schema:
 * - sourceRef → source_ref (canonical Postgres column)
 * - Adds kmeans_cluster from Postgres
 * - Adds summary_layer enrichment (kmeans_cluster, keywords_count)
 * - Normalizes tags (remove "source:atlas", standardize)
 *
 * Usage:
 *   npm run atlas:normalize:stale-packets [--dry-run] [--apply]
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');

const PG_HOST = process.env.POSTGRES_HOST || 'localhost';
const PG_PORT = parseInt(process.env.POSTGRES_PORT || '5434');
const PG_DB = process.env.POSTGRES_DB || 'legal_ai_db';
const PG_USER = process.env.POSTGRES_USER || 'legal_admin';
const PG_PASSWORD = process.env.POSTGRES_PASSWORD || '123456';

const STALE_PACKETS_DIR = '.opencode/ace-packets_stale';

interface StalePacket {
  sourceRef?: string;
  source_ref?: string;
  summary: string;
  score: number;
  tags: string[];
  [key: string]: any;
}

interface CanonicalPacket extends StalePacket {
  source_ref: string;
  kmeans_cluster?: number;
  keywords_count?: number;
  enriched_at?: string;
}

async function normalizeStalePacket(
  packet: StalePacket,
  pool: Pool
): Promise<CanonicalPacket> {
  const sourceRef = packet.sourceRef || packet.source_ref || '';

  // Normalize sourceRef format: "file:src/lib/..." → "src/lib/..."
  const normalized = sourceRef.replace(/^file:/, '');

  // Look up kmeans_cluster from Postgres
  let kmeansCluster: number | undefined;
  let keywordsCount: number | undefined;

  try {
    const result = await pool.query(
      `
      SELECT
        ap.kmeans_cluster,
        asl.metadata->>'keywords_count' as keywords_count
      FROM atlas_packets ap
      LEFT JOIN atlas_summary_layers asl ON ap.packet_key = asl.packet_key
      WHERE ap.source_ref = $1 OR ap.source_ref LIKE $2
      LIMIT 1
      `,
      [normalized, `%${normalized}%`]
    );

    if (result.rows.length > 0) {
      kmeansCluster = result.rows[0].kmeans_cluster;
      keywordsCount = result.rows[0].keywords_count
        ? parseInt(result.rows[0].keywords_count)
        : undefined;
    }
  } catch (err) {
    console.warn(`  ⚠️  Failed to lookup ${normalized}: ${err}`);
  }

  // Clean up tags
  const cleanedTags = (packet.tags || [])
    .filter(
      (tag) =>
        !tag.includes('source:') && !tag.includes('stale') && tag.length > 0
    )
    .slice(0, 10); // Limit to 10 tags

  return {
    ...packet,
    source_ref: normalized,
    sourceRef: undefined, // Remove old field
    kmeans_cluster: kmeansCluster,
    keywords_count: keywordsCount,
    tags: cleanedTags,
    enriched_at: new Date().toISOString(),
  };
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Normalize Stale Packet Format                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Scanning: ${STALE_PACKETS_DIR}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}\n`);

  const pool = new Pool({
    host: PG_HOST,
    port: PG_PORT,
    database: PG_DB,
    user: PG_USER,
    password: PG_PASSWORD,
  });

  try {
    // Read stale packet files
    const files = readdirSync(STALE_PACKETS_DIR)
      .filter((f) => f.endsWith('.json'))
      .slice(0, 100); // Process first 100 for now

    console.log(`📦 Found ${files.length} stale packet files\n`);

    let normalized = 0;
    let enriched = 0;
    let errors = 0;

    for (const filename of files) {
      const filepath = join(STALE_PACKETS_DIR, filename);

      try {
        const content = readFileSync(filepath, 'utf-8');
        const packet: StalePacket = JSON.parse(content);

        // Normalize
        const canonical = await normalizeStalePacket(packet, pool);

        if (canonical.kmeans_cluster !== undefined) {
          enriched++;
        }
        normalized++;

        // Write back (if not dry-run)
        if (!DRY_RUN && canonical) {
          writeFileSync(filepath, JSON.stringify(canonical, null, 2));
        }

        if (normalized % 10 === 0) {
          console.log(
            `  Processed ${normalized}/${files.length} (enriched: ${enriched})`
          );
        }
      } catch (err) {
        console.error(`  ❌ ${filename}: ${err}`);
        errors++;
      }
    }

    console.log(`\n✅ Normalization complete:`);
    console.log(`   Processed: ${normalized}`);
    console.log(`   Enriched with kmeans_cluster: ${enriched}`);
    console.log(`   Errors: ${errors}`);

    if (DRY_RUN) {
      console.log('\n📋 DRY_RUN: Files not modified');
    } else {
      console.log('\n💾 Files normalized and written back');
    }
  } catch (err) {
    console.error(`\n❌ Error: ${err}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
