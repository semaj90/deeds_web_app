#!/usr/bin/env node

/**
 * Stage 0: Identity Backfill — Compute SHA-256 content_hash
 *
 * Purpose: Populate missing content_hash (sha256) for all packets
 * to make identity layer 100% complete.
 *
 * Process:
 *   1. Read file content from source_ref
 *   2. Compute SHA-256 hash
 *   3. Update atlas_packets.sha256
 *   4. Update updated_at timestamp
 *   5. Invalidate Redis cache
 *
 * Usage:
 *   node stage0-identity-backfill.mjs [--dry-run] [--limit=100]
 */

import { createReadStream } from 'fs';
import { createHash } from 'crypto';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '../../../..');

const { Pool } = pg;

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 1000;

// Postgres connection (hardcoded)
const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db',
});

/**
 * Compute SHA-256 hash of a file
 */
function computeFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Main backfill function
 */
async function backfillIdentity() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        Stage 0: Identity Backfill (Content Hash)           ║');
  console.log(`║        Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}${' '.repeat(33 - (dryRun ? 'DRY-RUN' : 'APPLY').length)}║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Connect
    console.log('🔗 Connecting to Postgres...');
    const testConn = await pool.query('SELECT 1');
    console.log('✓ Connected\n');

    // Get packets missing content_hash
    console.log(`📋 Fetching ${limit} packets with NULL content_hash...\n`);
    const packets = await pool.query(
      'SELECT packet_id, packet_key, source_ref FROM atlas_packets WHERE sha256 IS NULL LIMIT $1',
      [limit]
    );

    if (packets.rows.length === 0) {
      console.log('✅ No packets with NULL content_hash found. Identity layer is 100% complete.');
      process.exit(0);
    }

    console.log(`Processing ${packets.rows.length} packets...\n`);

    let success = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < packets.rows.length; i++) {
      const { packet_id, packet_key, source_ref } = packets.rows[i];
      const idx = i + 1;

      try {
        const filePath = path.join(REPO_ROOT, source_ref);
        
        // Compute hash
        const hash = await computeFileHash(filePath);

        console.log(`  [${idx}/${packets.rows.length}] ${source_ref}`);
        console.log(`      Hash: ${hash.substring(0, 16)}...`);

        if (!dryRun) {
          // Update Postgres
          await pool.query(
            'UPDATE atlas_packets SET sha256 = $1, updated_at = NOW() WHERE packet_id = $2',
            [hash, packet_id]
          );
          console.log(`      ✓ Written to Postgres`);
        } else {
          console.log(`      [DRY-RUN] Would write to Postgres`);
        }

        success++;
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log(`  [${idx}/${packets.rows.length}] ${source_ref}`);
          console.log(`      ⚠️  File not found (expected for generated/deleted files)`);
          skipped++;
        } else {
          console.log(`  [${idx}/${packets.rows.length}] ${source_ref}`);
          console.log(`      ❌ Error: ${error.message}`);
          failed++;
        }
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('STAGE 0 BACKFILL SUMMARY\n');
    console.log(`  Processed:  ${success}`);
    console.log(`  Skipped:    ${skipped} (file not found)`);
    console.log(`  Failed:     ${failed}`);
    console.log(`  Mode:       ${dryRun ? 'DRY-RUN' : 'APPLIED'}`);
    console.log('='.repeat(60) + '\n');

    if (!dryRun && success > 0) {
      console.log('🔄 Invalidating Redis cache...');
      try {
        // Use docker exec to invalidate cache
        const child = spawn('docker', [
          'exec',
          'legal-ai-redis',
          'redis-cli',
          'DEL',
          'bitfrost:packet:*'
        ]);

        await new Promise((resolve, reject) => {
          child.on('close', code => {
            if (code === 0) {
              console.log('✓ Cache invalidated\n');
              resolve();
            } else {
              console.log('⚠️  Cache invalidation command sent (may not execute)\n');
              resolve();
            }
          });
          child.on('error', reject);
        });
      } catch (e) {
        console.log('⚠️  Could not invalidate cache (non-blocking)\n');
      }
    }

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    process.exit(2);
  } finally {
    await pool.end();
  }
}

// Run
backfillIdentity();
