#!/usr/bin/env node
/**
 * scripts/atlas/repair-qdrant-point-ids.mjs
 *
 * Scans atlas_feature_map rows with non-null qdrant_point_id.
 * Verifies existence in Qdrant, and repairs stale (404) references by scrolling for matching source_ref.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

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

const DATABASE_URL = env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = env.QDRANT_URL || 'http://127.0.0.1:6333';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply') || args.includes('--dry-run');
  let limit = null;
  const limitArg = args.find(a => a.startsWith('--limit='));
  if (limitArg) {
    limit = parseInt(limitArg.split('=')[1], 10);
  }

  console.log('🏁 Starting Qdrant Point ID Repair Script...');
  console.log(`  Mode  : ${dryRun ? 'DRY-RUN (read-only)' : 'APPLY (will write updates)'}`);
  console.log(`  Limit : ${limit || 'No limit'}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    let queryStr = `
      SELECT normalized_path, source_ref, qdrant_point_id 
      FROM atlas_feature_map 
      WHERE qdrant_point_id IS NOT NULL 
        AND qdrant_point_id <> 'unknown'
    `;
    if (limit) {
      queryStr += ` LIMIT ${limit}`;
    }

    const { rows } = await pool.query(queryStr);
    console.log(`  Loaded ${rows.length} rows to verify.`);

    let checked = 0;
    let ok = 0;
    let stale = 0;
    let repaired = 0;
    let cleared = 0;

    const CONCURRENCY = 50;
    const checkAndRepairRow = async (row) => {
      checked++;
      const pointId = row.qdrant_point_id;
      const sourceRef = row.source_ref;

      // 1. Verify existence
      let isOk = false;
      try {
        const getRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/${pointId}`, {
          signal: AbortSignal.timeout(3000)
        });
        if (getRes.ok) {
          isOk = true;
          ok++;
        }
      } catch (err) {
        // quiet down warning noise in batch
      }

      if (isOk) {
        return;
      }

      stale++;
      // 2. Point is stale (404). Search by payload matches (source_ref or source_path)
      let foundPointId = null;
      try {
        const scrollRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            limit: 1,
            with_payload: true,
            filter: {
              must: [{ key: 'source_ref', match: { value: sourceRef } }]
            }
          }),
          signal: AbortSignal.timeout(3000)
        });

        if (scrollRes.ok) {
          const data = await scrollRes.json();
          foundPointId = data.result?.points?.[0]?.id;
        }

        if (!foundPointId) {
          // Fallback to source_path
          const scrollFallbackRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              limit: 1,
              with_payload: true,
              filter: {
                must: [{ key: 'source_path', match: { value: sourceRef } }]
              }
            }),
            signal: AbortSignal.timeout(3000)
          });

          if (scrollFallbackRes.ok) {
            const data = await scrollFallbackRes.json();
            foundPointId = data.result?.points?.[0]?.id;
          }
        }
      } catch (err) {
        // ignore errors
      }

      if (foundPointId) {
        repaired++;
        console.log(`  [Repaired] "${sourceRef}": ${pointId} -> ${foundPointId}`);
        if (!dryRun) {
          await pool.query(
            'UPDATE atlas_feature_map SET qdrant_point_id = $1 WHERE normalized_path = $2',
            [foundPointId, row.normalized_path]
          );
        }
      } else {
        cleared++;
        console.log(`  [Cleared] "${sourceRef}": ${pointId} -> NULL`);
        if (!dryRun) {
          await pool.query(
            'UPDATE atlas_feature_map SET qdrant_point_id = NULL WHERE normalized_path = $1',
            [row.normalized_path]
          );
        }
      }
    };

    // Concurrency scheduler
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const chunk = rows.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(checkAndRepairRow));
      if (checked % 500 === 0 || checked === rows.length) {
        console.log(`  Verified ${checked} / ${rows.length} rows...`);
      }
    }

    console.log('\n==================================================');
    console.log('📊 REPAIR REPORT SUMMARY');
    console.log('==================================================');
    console.log(`  Checked             : ${checked}`);
    console.log(`  Active / Valid      : ${ok}`);
    console.log(`  Stale (404)         : ${stale}`);
    console.log(`  Repaired            : ${repaired}`);
    console.log(`  Cleared (Not Found) : ${cleared}`);
    console.log('--------------------------------------------------');
    console.log('🎉 Repair script execution complete.');

  } catch (err) {
    console.error('❌ Error executing repair script:', err);
  } finally {
    await pool.end();
  }
}

main();
