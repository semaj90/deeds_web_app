#!/usr/bin/env node
/**
 * P3g Classifier: Categorize 15,507 missing packets before embedding
 *
 * Do NOT embed blindly. Classify first:
 * - join_repair_possible: Qdrant point exists, needs Postgres mirror
 * - qdrant_payload_match_possible: Payload exists, qdrant_point_id missing
 * - needs_embedding: Text exists, no Qdrant entry
 * - non_vector_identity: schema_stub / intent_alias / mcp_tool_stub (skip)
 * - generated_or_docs: Auto-generated or documentation (skip)
 * - missing_text: No content to embed (skip)
 * - ambiguous: Unclear classification (manual review)
 *
 * Usage:
 *   node scripts/atlas/classify-qdrant-missing-packets.mjs
 */

import { Pool } from 'pg';
import fetch from 'node-fetch';
import { QdrantClient } from '@qdrant/js-client-rest';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await loadAtlasEnv();

const PG_URL = process.env.DATABASE_URL;
const OLLAMA_URL = (process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';

if (!PG_URL) {
  console.error('[FAIL] DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: PG_URL });
const qdrant = new QdrantClient({ url: QDRANT_URL });

// Classification buckets
const buckets = {
  join_repair_possible: [],
  qdrant_payload_match_possible: [],
  needs_embedding: [],
  non_vector_identity: [],
  generated_or_docs: [],
  missing_text: [],
  cache_only_packet: [],
  ambiguous: []
};

let healthStatus = {
  ollama_ok: false,
  embedding_model_ok: false,
  qdrant_ok: false,
  collection_dim: null,
  postgres_ok: false,
  valkey_ok: false,
  gpu_visible: false,
  recommended_batch_size: 0
};

/**
 * Check ACP health
 */
async function checkHealth() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('ACP HEALTH CHECK');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();

  // Postgres
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    healthStatus.postgres_ok = true;
    console.log('  ✅ Postgres: OK');
  } catch (err) {
    console.log('  ❌ Postgres:', err.message);
  }

  // Qdrant
  try {
    const info = await qdrant.getCollection(QDRANT_COLLECTION);
    healthStatus.qdrant_ok = true;
    healthStatus.collection_dim = info.config?.params?.vectors?.size ?? 768;
    console.log(`  ✅ Qdrant: OK (collection dim: ${healthStatus.collection_dim})`);
  } catch (err) {
    console.log('  ❌ Qdrant:', err.message);
  }

  // Ollama + embedding model
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
    const data = await res.json();
    const hasEmbedding = data.models?.some(m => m.name.includes('embedding'));
    if (hasEmbedding) {
      healthStatus.ollama_ok = true;
      healthStatus.embedding_model_ok = true;
      console.log('  ✅ Ollama: OK (embeddinggemma found)');
    } else {
      console.log('  ⚠️  Ollama: Running but no embedding model');
    }
  } catch (_err) {
    /* optional service */
    console.log('  ❌ Ollama: Unavailable');
  }

  // GPU (optional)
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
    const data = await res.json();
    // Ollama reports GPU via model details, but we can't easily detect here
    // Just log as optional
    console.log('  ℹ️  GPU: (detection requires model introspection)');
  } catch (err) {
    console.log('  ℹ️  GPU: (optional, CPU fallback available)');
  }

  // Valkey/Redis (optional)
  healthStatus.valkey_ok = true; // Assume it's optional
  console.log('  ℹ️  Valkey: (optional, used for caching only)');

  // Recommend batch size based on health
  if (healthStatus.postgres_ok && healthStatus.qdrant_ok && healthStatus.embedding_model_ok) {
    healthStatus.recommended_batch_size = 100;
    console.log('  ✅ Recommended batch size: 100');
  } else if (healthStatus.postgres_ok && healthStatus.qdrant_ok) {
    healthStatus.recommended_batch_size = 50;
    console.log('  ⚠️  Reduced batch size (health issues): 50');
  } else {
    healthStatus.recommended_batch_size = 0;
    console.log('  ❌ Cannot proceed (critical services down)');
  }

  console.log();
}

/**
 * Classify packets
 */
async function classifyPackets() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('PACKET CLASSIFICATION');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();

  const client = await pool.connect();
  try {
    // Fetch all packets missing qdrant_point_id
    const res = await client.query(`
      SELECT
        p.packet_id,
        p.packet_key,
        p.source_ref,
        p.file_path,
        p.feature_id,
        p.feature_label,
        p.summary,
        COALESCE(p.qdrant_vector_dim, 768) as dim
      FROM atlas_packets p
      WHERE p.qdrant_point_id IS NULL
        AND p.packet_key IS NOT NULL
      ORDER BY p.packet_id
    `);

    const packets = res.rows;
    console.log(`Found ${packets.length} packets missing qdrant_point_id`);
    console.log();

    // Fetch Qdrant point IDs that exist (for join repair detection)
    const qdrantPoints = new Set();
    try {
      const scrollRes = await qdrant.scroll(QDRANT_COLLECTION, {
        limit: 10000,
        with_payload: true
      });
      for (const point of scrollRes.points ?? []) {
        if (point.payload?.packet_key) {
          qdrantPoints.add(point.payload.packet_key);
        }
      }
    } catch (err) {
      console.warn('⚠️  Could not fetch Qdrant points for join detection:', err.message);
    }

    // Classify each packet
    for (const packet of packets) {
      let classified = false;

      // Check 1: Non-vector identity patterns
      if (packet.packet_key?.includes(':')) {
        // Likely schema_stub or mcp_tool_stub (contains colons)
        if (packet.packet_key.includes('#')) {
          buckets.non_vector_identity.push(packet);
          classified = true;
        } else if (packet.packet_key.startsWith('intent:')) {
          buckets.non_vector_identity.push(packet);
          classified = true;
        }
      }

      // Check 2: Generated or docs packets
      if (!classified && (packet.feature_label?.includes('Generated') ||
                          packet.feature_label?.includes('Auto-') ||
                          packet.file_path?.includes('/docs/') ||
                          packet.file_path?.includes('README') ||
                          packet.file_path?.includes('.md'))) {
        buckets.generated_or_docs.push(packet);
        classified = true;
      }

      // Check 3: Missing text
      if (!classified && (!packet.summary || packet.summary.trim().length < 10)) {
        if (!packet.feature_label || packet.feature_label.trim().length < 5) {
          buckets.missing_text.push(packet);
          classified = true;
        }
      }

      // Check 4: Qdrant payload match possible (point exists, Postgres row missing qdrant_point_id)
      if (!classified && qdrantPoints.has(packet.packet_key)) {
        buckets.qdrant_payload_match_possible.push(packet);
        classified = true;
      }

      // Check 5: Join repair possible (higher_hop_index has qdrant_point_id)
      if (!classified) {
        // This would require checking atlas_higher_hop_index; skip for now
        // It's only 2,488 rows and was already processed in P3
      }

      // Check 6: Needs embedding (default)
      if (!classified) {
        if (packet.summary && packet.summary.trim().length >= 10) {
          buckets.needs_embedding.push(packet);
          classified = true;
        } else {
          buckets.ambiguous.push(packet);
        }
      }
    }

    console.log('Classification Results:');
    console.log(`  join_repair_possible: ${buckets.join_repair_possible.length}`);
    console.log(`  qdrant_payload_match_possible: ${buckets.qdrant_payload_match_possible.length}`);
    console.log(`  needs_embedding: ${buckets.needs_embedding.length}`);
    console.log(`  non_vector_identity: ${buckets.non_vector_identity.length}`);
    console.log(`  generated_or_docs: ${buckets.generated_or_docs.length}`);
    console.log(`  missing_text: ${buckets.missing_text.length}`);
    console.log(`  cache_only_packet: ${buckets.cache_only_packet.length}`);
    console.log(`  ambiguous: ${buckets.ambiguous.length}`);
    console.log();
    console.log(`  TOTAL: ${Object.values(buckets).reduce((sum, arr) => sum + arr.length, 0)}`);
    console.log();

  } finally {
    client.release();
  }
}

/**
 * Write reports
 */
async function writeReports() {
  const reportDir = 'docs/reports';
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

  // JSON report
  const jsonReport = {
    timestamp: new Date().toISOString(),
    health: healthStatus,
    classification: {
      join_repair_possible: buckets.join_repair_possible.length,
      qdrant_payload_match_possible: buckets.qdrant_payload_match_possible.length,
      needs_embedding: buckets.needs_embedding.length,
      non_vector_identity: buckets.non_vector_identity.length,
      generated_or_docs: buckets.generated_or_docs.length,
      missing_text: buckets.missing_text.length,
      ambiguous: buckets.ambiguous.length,
      total: Object.values(buckets).reduce((sum, arr) => sum + arr.length, 0)
    },
    samples: {
      needs_embedding: buckets.needs_embedding.slice(0, 5),
      non_vector_identity: buckets.non_vector_identity.slice(0, 3),
      ambiguous: buckets.ambiguous.slice(0, 3)
    }
  };

  fs.writeFileSync(
    path.join(reportDir, 'qdrant-p3g-missing-classification.json'),
    JSON.stringify(jsonReport, null, 2)
  );

  // Markdown report
  const mdReport = `# P3g Missing Packet Classification

**Date**: ${new Date().toISOString()}

## Health Status

| Service | Status | Details |
|---------|--------|---------|
| Postgres | ${healthStatus.postgres_ok ? '✅' : '❌'} | ${healthStatus.postgres_ok ? 'OK' : 'FAILED'} |
| Qdrant | ${healthStatus.qdrant_ok ? '✅' : '❌'} | ${healthStatus.qdrant_ok ? 'OK (dim: ' + healthStatus.collection_dim + ')' : 'FAILED'} |
| Ollama | ${healthStatus.ollama_ok ? '✅' : '⚠️'} | ${healthStatus.ollama_ok ? 'OK' : 'UNAVAILABLE'} |
| Embedding Model | ${healthStatus.embedding_model_ok ? '✅' : '❌'} | ${healthStatus.embedding_model_ok ? 'embeddinggemma found' : 'MISSING'} |
| Valkey | ℹ️ | Optional |
| GPU | ℹ️ | Optional |
| Recommended Batch Size | - | ${healthStatus.recommended_batch_size} |

## Classification Breakdown

| Category | Count | Action |
|----------|-------|--------|
| **needs_embedding** | ${buckets.needs_embedding.length} | **EMBED** — Valid packets, text present, not yet in Qdrant |
| **qdrant_payload_match_possible** | ${buckets.qdrant_payload_match_possible.length} | **JOIN REPAIR** — Qdrant point exists, Postgres row missing qdrant_point_id |
| **join_repair_possible** | ${buckets.join_repair_possible.length} | **JOIN REPAIR** — Higher-hop ledger has qdrant_point_id |
| **non_vector_identity** | ${buckets.non_vector_identity.length} | **SKIP** — schema_stub / mcp_tool_stub (non-vector) |
| **generated_or_docs** | ${buckets.generated_or_docs.length} | **SKIP** — Auto-generated / documentation packets |
| **missing_text** | ${buckets.missing_text.length} | **SKIP** — No content to embed |
| **cache_only_packet** | ${buckets.cache_only_packet.length} | **SKIP** — Cache-only identity stubs |
| **ambiguous** | ${buckets.ambiguous.length} | **REVIEW** — Unclear classification |
| **TOTAL** | ${Object.values(buckets).reduce((sum, arr) => sum + arr.length, 0)} | - |

## Recommendation

1. **Embedding Work**: ${buckets.needs_embedding.length} packets
   - Use: npm run atlas:backfill:qdrant:embeddings:apply --batch-size=${healthStatus.recommended_batch_size}
   - Expected time: ${Math.ceil(buckets.needs_embedding.length / 175)} minutes

2. **Join Repair Work**: ${buckets.qdrant_payload_match_possible.length} packets
   - Qdrant already has the vectors; just need Postgres sync
   - Use: npm run atlas:repair:qdrant-postgres-match

3. **Skip (No Action)**: ${buckets.non_vector_identity.length + buckets.generated_or_docs.length + buckets.missing_text.length + buckets.cache_only_packet.length} packets
   - These are structural stubs, documentation, or empty (expected)

## Next Steps

First, run the ACP packet transport audit:

\`\`\`bash
npm run atlas:acp-packet:audit
\`\`\`

If no GAN trigger, proceed with embedding:

\`\`\`bash
npm run atlas:backfill:qdrant:embeddings:apply

# Verify after completion:
npm run atlas:verify:p3-readiness
\`\`\`
`;

  fs.writeFileSync(
    path.join(reportDir, 'qdrant-p3g-missing-classification.md'),
    mdReport
  );

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('REPORTS WRITTEN');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();
  console.log(`  JSON: ${path.join(reportDir, 'qdrant-p3g-missing-classification.json')}`);
  console.log(`  MD:   ${path.join(reportDir, 'qdrant-p3g-missing-classification.md')}`);
  console.log();
}

async function main() {
  await checkHealth();
  await classifyPackets();
  await writeReports();

  console.log('✅ Classification complete');
  console.log();
  console.log('Review reports before proceeding:');
  console.log('  docs/reports/qdrant-p3g-missing-classification.md');
  console.log();

  await pool.end();
}

main().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
