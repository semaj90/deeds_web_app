#!/usr/bin/env node
/**
 * Lane 12.1: Ingest gRPC service/method packets to Qdrant codebase_chunks_768
 *
 * Reads from docs/reports/grpc-service-packets.jsonl, embeds via Ollama
 * (embeddinggemma:latest), and upserts to Qdrant with full payload.
 *
 * Dry-run by default; use --apply to persist.
 *
 * Usage:
 *   node scripts/atlas/ingest-rpc-tools-to-qdrant.mjs
 *   node scripts/atlas/ingest-rpc-tools-to-qdrant.mjs --apply
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

// Configuration
const QDRANT_URL = 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';
const OLLAMA_URL = 'http://127.0.0.1:11434';
const EMBED_MODEL = 'embeddinggemma:latest';
const EMBED_TIMEOUT_MS = 30_000;
const EMBED_CONCURRENCY = 8;
const EMBED_RETRIES = 3;
const EMBED_BACKOFF_MS = 2_000;

// Parse args
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;

// Paths
const INPUT_PATH = path.join(ROOT, 'sveltekit-frontend', 'docs', 'reports', 'grpc-service-packets.jsonl');
const OUTPUT_DIR = path.join(ROOT, 'docs', 'reports');
const JSON_REPORT = path.join(OUTPUT_DIR, 'lane-12-1-qdrant-ingest.json');
const MD_REPORT = path.join(OUTPUT_DIR, 'lane-12-1-qdrant-ingest.md');

/**
 * Load packets from JSONL file
 */
function loadPackets() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`Input not found: ${INPUT_PATH}`);
  }

  const lines = fs.readFileSync(INPUT_PATH, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l);

  const packets = lines.map((line, idx) => {
    try {
      return JSON.parse(line);
    } catch (e) {
      throw new Error(`Failed to parse line ${idx + 1}: ${e.message}`);
    }
  });

  return packets;
}

/**
 * Embed a single text via Ollama with retry logic
 */
async function embedTextWithRetry(text, retries = EMBED_RETRIES) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

      const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: EMBED_MODEL,
          prompt: text
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 100)}`);
      }

      const data = await res.json();
      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error(`Invalid embedding response: no embedding array`);
      }

      return data.embedding;
    } catch (err) {
      const isLast = attempt === retries - 1;
      if (isLast) throw err;

      // Backoff before retry
      await new Promise(resolve => setTimeout(resolve, EMBED_BACKOFF_MS * (attempt + 1)));
    }
  }
}

/**
 * Batch embed packets with concurrency control
 */
async function embedPackets(packets) {
  const results = {
    succeeded: [],
    failed: []
  };

  // Process in batches
  for (let batch = 0; batch < packets.length; batch += EMBED_CONCURRENCY) {
    const batchPackets = packets.slice(batch, batch + EMBED_CONCURRENCY);
    const startTime = Date.now();

    const promises = batchPackets.map(async (packet) => {
      const text = packet.summary || packet.feature_label || packet.packet_key;

      try {
        const embedding = await embedTextWithRetry(text);
        return { ok: true, packet, embedding, text };
      } catch (err) {
        return { ok: false, packet, error: err.message, text };
      }
    });

    const batchResults = await Promise.all(promises);
    const latencyMs = Date.now() - startTime;

    batchResults.forEach(result => {
      if (result.ok) {
        results.succeeded.push(result);
      } else {
        results.failed.push(result);
      }
    });

    const pct = Math.round(((batch + batchPackets.length) / packets.length) * 100);
    console.log(`[${pct}%] Embedded ${batch + batchPackets.length}/${packets.length} (${latencyMs}ms for ${batchPackets.length})`);
  }

  return results;
}

/**
 * Create Qdrant points from packets and embeddings
 */
function createQdrantPoints(packets) {
  return packets.map(({ packet, embedding }) => {
    // Generate deterministic point ID from packet_key
    const pointId = Math.abs(hashString(packet.packet_key)) % 2_147_483_647;

    return {
      id: pointId,
      vectors: {
        content: embedding  // Named vector 'content' (768-dim)
      },
      payload: {
        packet_key: packet.packet_key,
        source_ref: packet.source_ref,
        feature_id: packet.feature_id,
        feature_label: packet.feature_label || '',
        directory_path: packet.directory_path || '',
        domain_class: packet.domain_class || 'mcp_agents',
        qdrant_tags: Array.isArray(packet.qdrant_tags) ? packet.qdrant_tags : [],
        summary: packet.summary || '',
        rank: packet.rank ?? 0,
        inserted_at: new Date().toISOString()
      }
    };
  });
}

/**
 * Simple hash function for packet_key → point ID
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash;
}

/**
 * Upsert points to Qdrant in batches
 */
async function upsertToQdrant(points) {
  const BATCH_SIZE = 50;
  let upserted = 0;

  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);

    try {
      const res = await fetch(
        `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points?wait=true`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: batch })
        }
      );

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Qdrant ${res.status}: ${body.slice(0, 200)}`);
      }

      upserted += batch.length;
      const pct = Math.round((upserted / points.length) * 100);
      console.log(`  [${pct}%] Upserted ${upserted}/${points.length} points`);
    } catch (err) {
      throw new Error(`Failed to upsert batch: ${err.message}`);
    }
  }

  return upserted;
}

/**
 * Verify packets in Qdrant via COUNT query
 */
async function verifyQdrantIngest(expectedCount) {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`, {
      method: 'GET'
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const actualCount = data.result?.points_count ?? 0;

    return {
      expected: expectedCount,
      actual: actualCount,
      verified: actualCount >= expectedCount
    };
  } catch (err) {
    return {
      expected: expectedCount,
      actual: 0,
      verified: false,
      error: err.message
    };
  }
}

/**
 * Generate JSON report
 */
function generateJsonReport(stats) {
  return {
    timestamp: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'applied',
    source: INPUT_PATH,
    destination: `${QDRANT_URL}/collections/${QDRANT_COLLECTION}`,
    embedding_model: EMBED_MODEL,
    embedding_concurrency: EMBED_CONCURRENCY,
    embedding_timeout_ms: EMBED_TIMEOUT_MS,
    packets: {
      total: stats.packetsTotal,
      embedded: stats.embeddedCount,
      failed: stats.failedCount
    },
    qdrant: {
      collection: QDRANT_COLLECTION,
      points_upserted: stats.upsertedCount,
      verification: stats.verification
    },
    gates: {
      all_packets_embedded: stats.embeddedCount === stats.packetsTotal,
      zero_failures: stats.failedCount === 0,
      all_in_qdrant: stats.verification?.verified ?? false
    },
    errors: stats.failedPackets.length > 0
      ? stats.failedPackets.map(p => ({
          packet_key: p.packet.packet_key,
          error: p.error
        }))
      : []
  };
}

/**
 * Generate markdown report
 */
function generateMdReport(stats) {
  const lines = [
    '# Lane 12.1 — gRPC Packets to Qdrant',
    '',
    `**Timestamp:** ${new Date().toISOString()}`,
    `**Mode:** ${DRY_RUN ? 'dry-run' : 'applied'}`,
    '',
    '## Summary',
    `- **Packets:** ${stats.packetsTotal}`,
    `- **Embedded:** ${stats.embeddedCount}/${stats.packetsTotal}`,
    `- **Failed:** ${stats.failedCount}`,
    `- **Upserted:** ${stats.upsertedCount}/${stats.embeddedCount}`,
    '',
    '## Gates',
    `- ✅ All packets embedded: ${stats.embeddedCount === stats.packetsTotal ? 'PASS' : 'FAIL'}`,
    `- ✅ Zero failures: ${stats.failedCount === 0 ? 'PASS' : 'FAIL'}`,
    `- ✅ All in Qdrant: ${stats.verification?.verified ? 'PASS' : 'FAIL'}`,
    ''
  ];

  if (stats.failedPackets.length > 0) {
    lines.push('## Failed Packets');
    stats.failedPackets.forEach(p => {
      lines.push(`- ${p.packet.packet_key}: ${p.error}`);
    });
    lines.push('');
  }

  lines.push('## Configuration');
  lines.push(`- Embedding model: ${EMBED_MODEL}`);
  lines.push(`- Concurrency: ${EMBED_CONCURRENCY}`);
  lines.push(`- Timeout: ${EMBED_TIMEOUT_MS}ms`);
  lines.push(`- Retries: ${EMBED_RETRIES}`);
  lines.push('');

  lines.push('## Verification');
  if (stats.verification) {
    lines.push(`- Expected in Qdrant: ${stats.verification.expected}`);
    lines.push(`- Actual in Qdrant: ${stats.verification.actual}`);
    lines.push(`- Verified: ${stats.verification.verified ? 'YES' : 'NO'}`);
    if (stats.verification.error) {
      lines.push(`- Error: ${stats.verification.error}`);
    }
  }
  lines.push('');

  lines.push('## Next Steps');
  lines.push('1. Run: `npm run lane:12:2:rpc-endpoints` (wire `/api/tools/rpc-search`)');
  lines.push('2. Verify: `curl http://localhost:5173/api/tools/rpc-search?q=embedding`');

  return lines.join('\n');
}

/**
 * Main entry point
 */
async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  Lane 12.1: gRPC Packets → Qdrant     ║');
  console.log('╚════════════════════════════════════════╝\n');

  console.log(`Mode: ${DRY_RUN ? '[DRY-RUN]' : '[APPLY]'}`);
  console.log(`Input: ${INPUT_PATH}`);
  console.log(`Qdrant: ${QDRANT_URL}/${QDRANT_COLLECTION}\n`);

  // ──────────────────────────────────────────────────────────
  // 1. Load packets
  // ──────────────────────────────────────────────────────────
  let packets;
  try {
    packets = loadPackets();
    console.log(`✅ Loaded ${packets.length} packets`);
  } catch (err) {
    console.error(`❌ Failed to load packets: ${err.message}`);
    process.exit(1);
  }

  // ──────────────────────────────────────────────────────────
  // 2. Embed packets
  // ──────────────────────────────────────────────────────────
  console.log(`\n⏳ Embedding (${EMBED_CONCURRENCY} concurrent)...`);
  let embedResults;
  try {
    embedResults = await embedPackets(packets);
    console.log(`✅ Embedding complete`);
    console.log(`   - Succeeded: ${embedResults.succeeded.length}`);
    console.log(`   - Failed: ${embedResults.failed.length}`);
  } catch (err) {
    console.error(`❌ Embedding failed: ${err.message}`);
    process.exit(1);
  }

  // ──────────────────────────────────────────────────────────
  // 3. Upsert to Qdrant (if --apply)
  // ──────────────────────────────────────────────────────────
  let upsertedCount = 0;
  if (DRY_RUN) {
    console.log(`\n[DRY-RUN] Would upsert ${embedResults.succeeded.length} points to Qdrant`);
    upsertedCount = 0;
  } else {
    console.log(`\n⏳ Upserting to Qdrant...`);
    const points = createQdrantPoints(embedResults.succeeded);
    try {
      upsertedCount = await upsertToQdrant(points);
      console.log(`✅ Upserted ${upsertedCount} points`);
    } catch (err) {
      console.error(`❌ Upsert failed: ${err.message}`);
      process.exit(1);
    }
  }

  // ──────────────────────────────────────────────────────────
  // 4. Verify Qdrant ingestion
  // ──────────────────────────────────────────────────────────
  console.log(`\n⏳ Verifying Qdrant...`);
  const verification = await verifyQdrantIngest(embedResults.succeeded.length);
  console.log(`   - Expected: ${verification.expected}`);
  console.log(`   - Actual: ${verification.actual}`);
  console.log(`   - Verified: ${verification.verified ? '✅ YES' : '❌ NO'}`);

  // ──────────────────────────────────────────────────────────
  // 5. Generate reports
  // ──────────────────────────────────────────────────────────
  const stats = {
    packetsTotal: packets.length,
    embeddedCount: embedResults.succeeded.length,
    failedCount: embedResults.failed.length,
    upsertedCount: upsertedCount,
    failedPackets: embedResults.failed,
    verification
  };

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Write reports
  fs.writeFileSync(JSON_REPORT, JSON.stringify(generateJsonReport(stats), null, 2));
  fs.writeFileSync(MD_REPORT, generateMdReport(stats));
  console.log(`\n✅ Reports written:`);
  console.log(`   - ${JSON_REPORT}`);
  console.log(`   - ${MD_REPORT}`);

  // ──────────────────────────────────────────────────────────
  // 6. Gate results
  // ──────────────────────────────────────────────────────────
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║              GATE RESULTS              ║`);
  console.log(`╚════════════════════════════════════════╝\n`);

  const gateResults = {
    allEmbedded: embedResults.succeeded.length === packets.length,
    zeroFailures: embedResults.failed.length === 0,
    allInQdrant: verification.verified
  };

  console.log(`✅ All packets embedded: ${gateResults.allEmbedded ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Zero failures: ${gateResults.zeroFailures ? 'PASS' : 'FAIL'}`);
  console.log(`✅ All in Qdrant: ${gateResults.allInQdrant ? 'PASS' : 'FAIL'}`);

  const allPass = gateResults.allEmbedded && gateResults.zeroFailures && gateResults.allInQdrant;
  console.log(`\n${allPass ? '✅ LANE 12.1 PASSED' : '❌ LANE 12.1 FAILED'}\n`);

  if (DRY_RUN) {
    console.log(`Next: node scripts/atlas/ingest-rpc-tools-to-qdrant.mjs --apply\n`);
  } else {
    console.log(`Next: npm run lane:12:2:rpc-endpoints\n`);
  }
}

main().catch(err => {
  console.error(`\n❌ Fatal error: ${err.message}`);
  process.exit(1);
});
