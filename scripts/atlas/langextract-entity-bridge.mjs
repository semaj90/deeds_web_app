#!/usr/bin/env node

/**
 * LangExtract Entity Bridge
 *
 * Extracts programming entities (keywords, function names, classes, imports)
 * from packet content via Python LangExtract library.
 *
 * Pipeline:
 *   Postgres (content) → Python LangExtract → {entities[], keywords[]} → Redis cache → Postgres concept_ids
 *
 * Python backend requirements:
 *   python3 -m venv .venv
 *   source .venv/bin/activate (or .venv\Scripts\activate on Windows)
 *   pip install langextract
 *
 * Usage:
 *   node scripts/atlas/langextract-entity-bridge.mjs --dry-run --limit 10
 *   node scripts/atlas/langextract-entity-bridge.mjs --apply --batch 500
 */

import pg from 'pg';
import { spawn } from 'child_process';
import redis from 'ioredis';
import { config } from 'dotenv';
import { resolve } from 'path';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { buildCanonicalFeatureEnvelope, reportValidation } from './lib/envelope-builder.mjs';

config({ path: resolve('.', '.env') });

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);
const pgPool = new pg.Pool({ connectionString: POSTGRES_URL });
const redisClient = new redis({
  host: env.REDIS_HOST || '127.0.0.1',
  port: env.REDIS_PORT || 6379,
  password: env.REDIS_PASSWORD || '',
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const LIMIT = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '0') || 100;
const BATCH_SIZE = parseInt(process.argv.find(arg => arg.startsWith('--batch='))?.split('=')[1] || '500') || 500;

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  LangExtract Entity Bridge                                    ║');
console.log('║  Extract programming entities for concept_ids population      ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(54)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

/**
 * Call Python LangExtract subprocess
 * Input: code content (string)
 * Output: {entities: [], keywords: []}
 */
async function extractEntitiesViaPython(content) {
  return new Promise((resolve, reject) => {
    if (!content || content.length === 0) {
      resolve({ entities: [], keywords: [] });
      return;
    }

    // Python script embedded inline (could be external file)
    const pythonScript = `
import sys
import json
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, r'c:\\Users\\james\\Videos\\deeds-web-app')
try:
  from langextract import extract_entities
  content = json.loads(sys.stdin.read())
  entities = extract_entities(content)
  print(json.dumps({"entities": entities, "keywords": list(set([e.get("text") for e in entities]))}))
except Exception as e:
  print(json.dumps({"entities": [], "keywords": [], "error": str(e)}), file=sys.stderr)
  sys.exit(1)
`;

    // Use actual Python path on Windows
    const pythonPath = process.platform === 'win32'
      ? 'c:\\Python313\\python.exe'
      : 'python3';

    const proc = spawn(pythonPath, ['-c', pythonScript], {
      timeout: 5000, // 5s timeout per packet
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => {
      stdout += data.toString();
    });

    proc.stderr.on('data', data => {
      stderr += data.toString();
    });

    proc.on('close', code => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse Python output: ${e.message}`));
        }
      } else {
        reject(new Error(`Python extraction failed: ${stderr}`));
      }
    });

    proc.on('error', err => {
      reject(err);
    });

    // Send content as JSON
    try {
      proc.stdin.write(JSON.stringify(content.substring(0, 5000))); // Limit to 5KB per packet
      proc.stdin.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function langextractBridge() {
  try {
    console.log('📊 Step 1: Environment check\n');

    // Check Python availability
    let pythonAvailable = false;
    try {
      const pythonPath = process.platform === 'win32'
        ? 'c:\\Python313\\python.exe'
        : 'python3';
      const pythonProc = spawn(pythonPath, ['--version'], { timeout: 2000 });
      let pythonVersion = '';
      pythonProc.stdout.on('data', data => {
        pythonVersion += data.toString();
      });

      await new Promise((resolve) => {
        pythonProc.on('close', code => {
          if (code === 0) {
            console.log(`   Python available: ${pythonVersion.trim()}`);
            pythonAvailable = true;
          } else {
            console.warn(`   ⚠️  Python3 not found (LangExtract will be skipped)`);
          }
          resolve();
        });
        pythonProc.on('error', () => {
          console.warn(`   ⚠️  Python3 spawn failed (LangExtract will be skipped)`);
          resolve();
        });
      });
    } catch (e) {
      console.warn(`   ⚠️  Python check failed: ${e.message}`);
    }

    // Try to connect Redis
    try {
      await redisClient.connect();
      console.log(`   Redis connected`);
      await redisClient.quit();
    } catch (e) {
      console.warn(`   ⚠️  Redis unavailable (will skip caching)`);
    }

    console.log();

    console.log('📝 Step 2: Audit packets needing entity extraction\n');

    const auditRes = await pgPool.query(`
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN summary IS NOT NULL AND LENGTH(summary) > 10 THEN 1 END) with_summary,
        COUNT(CASE WHEN concept_ids IS NOT NULL AND array_length(concept_ids, 1) > 0 THEN 1 END) with_concepts
      FROM atlas_packets
    `);

    const { total, with_summary, with_concepts } = auditRes.rows[0];
    console.log(`Total packets: ${total}`);
    console.log(`With summary: ${with_summary}`);
    console.log(`Already have concept_ids: ${with_concepts}`);
    console.log(`Candidates for extraction: ${with_summary - with_concepts}`);
    console.log();

    if (DRY_RUN) {
      console.log('📋 DRY-RUN: Would extract entities from packets\n');

      const sampleRes = await pgPool.query(`
        SELECT
          packet_key,
          feature_id,
          summary
        FROM atlas_packets
        WHERE summary IS NOT NULL AND LENGTH(summary) > 10
        LIMIT 3
      `);

      console.log('Sample packets:');
      for (const row of sampleRes.rows) {
        console.log(`  ${row.feature_id}`);
        console.log(`    Summary: ${row.summary?.substring(0, 80)}...`);
        // Show what extraction would produce (mock)
        const mockEntities = ['function', 'class', 'import', 'query'];
        console.log(`    Would extract: [${mockEntities.join(', ')}]`);
      }
      console.log();

    } else {
      console.log('💾 Step 3: Extract entities and update Postgres\n');

      // Fetch candidates with all canonical envelope fields
      const candidatesRes = await pgPool.query(
        `
        SELECT
          packet_key,
          source_ref,
          source_ref_key,
          feature_id,
          title_id,
          tree_node_id,
          feature_label,
          concept_ids,
          domain_class,
          community_id,
          som_cluster,
          qdrant_point_id,
          summary
        FROM atlas_packets
        WHERE summary IS NOT NULL AND LENGTH(summary) > 10 AND (concept_ids IS NULL OR array_length(concept_ids, 1) = 0)
        ORDER BY packet_key
        LIMIT $1
        `,
        [LIMIT || 1000]
      );

      console.log(`   Processing ${candidatesRes.rows.length} packets\n`);

      let processed = 0;
      let errors = 0;
      let validationFailures = 0;
      const updates = [];

      for (const row of candidatesRes.rows) {
        // Validate canonical envelope before processing
        const { envelope, validation } = buildCanonicalFeatureEnvelope({
          packet_key: row.packet_key,
          source_ref: row.source_ref,
          source_ref_key: row.source_ref_key,
          feature_id: row.feature_id,
          title_id: row.title_id,
          tree_node_id: row.tree_node_id,
          feature_label: row.feature_label,
          concept_ids: row.concept_ids,
          domain_class: row.domain_class,
          community_id: row.community_id,
          som_cluster: row.som_cluster,
          qdrant_point_id: row.qdrant_point_id,
        });

        if (!validation.isValid && validation.hardFailures.length > 0) {
          if (process.argv.includes('--verbose')) {
            reportValidation(validation, row.packet_key);
          }
          validationFailures++;
          processed++;
          continue;
        }
        try {
          // Extract entities (wrapped in try/catch, Python failure doesn't block)
          let entities = [];
          try {
            const extracted = await extractEntitiesViaPython(row.summary);
            entities = extracted.keywords || [];
          } catch (e) {
            console.warn(`   ⚠️  Python extraction failed for ${row.packet_key}: ${e.message}`);
            errors++;
            // Fall back to keyword extraction from summary (basic heuristic)
            entities = row.summary
              .match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g)
              ?.filter(w => w.length > 3)
              ?.slice(0, 10) || [];
          }

          if (entities.length > 0) {
            updates.push({
              packet_key: row.packet_key,
              concepts: entities,
            });
          }

          processed++;
          if (processed % 50 === 0) {
            console.log(`   ✓ Processed ${processed}/${candidatesRes.rows.length}`);
          }
        } catch (e) {
          console.error(`   ❌ Error processing ${row.packet_key}: ${e.message}`);
          errors++;
        }
      }

      console.log(`   ✓ Processed ${processed} packets (${errors} errors, ${validationFailures} validation failures)\n`);

      // Batch update Postgres
      if (updates.length > 0) {
        console.log('📝 Step 4: Batch update Postgres\n');

        const VALUES = updates.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}::TEXT[])`).join(',');
        const params = [];
        for (const update of updates) {
          params.push(update.packet_key, update.concepts);
        }

        const updateRes = await pgPool.query(
          `
          UPDATE atlas_packets ap
          SET concept_ids = v.concepts, updated_at = NOW()
          FROM (VALUES ${VALUES})
          AS v(packet_key, concepts)
          WHERE ap.packet_key = v.packet_key
          `,
          params
        );

        console.log(`   ✅ Updated ${updateRes.rowCount}/${updates.length} packets\n`);
      }
    }

    console.log('✅ LangExtract bridge complete');

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (process.argv.includes('--verbose')) console.error(err.stack);
    process.exit(1);
  } finally {
    try {
      await redisClient.quit();
    } catch (e) {
      // Ignore
    }
    await pgPool.end();
  }
}

langextractBridge();
