#!/usr/bin/env node
/**
 * Stage 1: Domain Classifier — Direct DB, Keyset Batches
 *
 * Connects directly to PostgreSQL, processes 1000-packet batches with checkpointing.
 * No docker exec, no client-side buffer issues, deterministic classification + multi-label.
 */

import pg from 'pg';

// Parse DATABASE_URL or use individual env vars
const dbUrl = process.env.DATABASE_URL;
let poolConfig: pg.PoolConfig;

if (dbUrl) {
  poolConfig = {
    connectionString: dbUrl,
  };
} else {
  poolConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5434'),
    user: process.env.DB_USER || 'legal_admin',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'legal_ai_db',
  };
}

const pool = new pg.Pool(poolConfig);

// Classifier logic: deterministic path patterns
function classifyPacket(sourceRef: string): { domain_labels: any[]; primary_domain: string; primary_confidence: number } {
  const patterns: Record<string, { name: string; weight: number }[]> = {
    retrieval: [
      { name: 'qdrant', weight: 0.95 },
      { name: 'vector', weight: 0.85 },
      { name: 'search', weight: 0.80 },
      { name: 'rerank', weight: 0.90 },
    ],
    ui: [
      { name: '.svelte', weight: 0.95 },
      { name: 'component', weight: 0.85 },
      { name: 'page', weight: 0.80 },
      { name: 'layout', weight: 0.80 },
    ],
    database: [
      { name: '/db/', weight: 0.90 },
      { name: 'schema', weight: 0.85 },
      { name: 'migration', weight: 0.95 },
      { name: 'drizzle', weight: 0.90 },
    ],
    auth: [
      { name: 'auth', weight: 0.90 },
      { name: 'lucia', weight: 0.95 },
      { name: 'session', weight: 0.85 },
      { name: 'password', weight: 0.90 },
    ],
    network: [
      { name: '/api/', weight: 0.95 },
      { name: '+server.ts', weight: 0.90 },
      { name: 'handler', weight: 0.80 },
      { name: 'endpoint', weight: 0.80 },
    ],
    ml: [
      { name: '/gpu/', weight: 0.95 },
      { name: 'cuda', weight: 0.95 },
      { name: 'tensor', weight: 0.90 },
      { name: 'kernel', weight: 0.90 },
      { name: 'embed', weight: 0.90 },
      { name: 'embedding', weight: 0.90 },
      { name: 'ollama', weight: 0.85 },
    ],
    retrieval: [
      { name: 'rag', weight: 0.90 },
      { name: 'retrieval', weight: 0.80 },
      { name: 'context', weight: 0.75 },
    ],
    graph: [
      { name: 'neo4j', weight: 0.95 },
      { name: 'graph', weight: 0.85 },
      { name: 'topology', weight: 0.85 },
    ],
  };

  const ref = sourceRef.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [domain, keywords] of Object.entries(patterns)) {
    let score = 0;
    for (const kw of keywords) {
      if (ref.includes(kw.name)) {
        score = Math.max(score, kw.weight);
      }
    }
    scores[domain] = score;
  }

  // Build multi-label with threshold 0.50
  const labels = Object.entries(scores)
    .filter(([_, score]) => score >= 0.50)
    .map(([domain, score]) => ({
      name: domain,
      score: Math.round(score * 100) / 100,
    }))
    .sort((a, b) => b.score - a.score);

  const primary = labels[0] || { name: 'general', score: 0.15 };

  return {
    domain_labels: labels,
    primary_domain: primary.name,
    primary_confidence: primary.score,
  };
}

async function main() {
  const dryRun = !process.argv.includes('--apply');
  let cursor = '';
  let totalProcessed = 0;
  let totalUpdated = 0;
  const batchSize = 1000;

  console.log('Stage 1: Domain Classifier (Direct DB, Keyset Batches)');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log('');

  try {
    // Note: skipping index creation (can run separately if needed)
    console.log('[SETUP] Ready to classify packets...');
    console.log('');

    let hasMore = true;

    while (hasMore) {
      console.log(`[BATCH] Fetching packets (cursor: "${cursor.slice(0, 20)}...")`);

      // Keyset pagination: fetch 1000 packets where packet_key > cursor
      const result = await pool.query(
        `
        SELECT packet_key, source_ref
        FROM atlas_packets
        WHERE domain_class IS NULL AND packet_key > $1
        ORDER BY packet_key
        LIMIT $2;
        `,
        [cursor, batchSize + 1]
      );

      const packets = result.rows.slice(0, batchSize);
      hasMore = result.rows.length > batchSize;

      if (packets.length === 0) {
        console.log('  ✓ No more packets to classify');
        break;
      }

      console.log(`  ✓ Fetched ${packets.length} packets`);

      if (dryRun) {
        // Dry-run: show sample classifications
        const samples = packets.slice(0, 3);
        for (const p of samples) {
          const classification = classifyPacket(p.source_ref);
          console.log(
            `    ${p.packet_key}: ${classification.primary_domain} (${classification.primary_confidence})`
          );
        }
        cursor = packets[packets.length - 1].packet_key;
        totalProcessed += packets.length;
      } else {
        // Apply: batch update using VALUES
        const values: any[] = [];
        const placeholders: string[] = [];
        let paramIndex = 1;

        for (const packet of packets) {
          const classification = classifyPacket(packet.source_ref);
          values.push(
            packet.packet_key,
            classification.primary_domain,
            classification.primary_confidence,
            JSON.stringify(classification.domain_labels),
            'domain_classifier_v1'
          );

          placeholders.push(
            `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}::jsonb, $${paramIndex + 4})`
          );
          paramIndex += 5;
        }

        const updateSQL = `
          UPDATE atlas_packets AS p
          SET
            domain_class = v.domain_class,
            domain_confidence = v.domain_confidence,
            metadata = p.metadata || jsonb_build_object(
              'domain_labels', v.domain_labels,
              'domain_classifier_version', v.classifier_version,
              'domain_classified_at', now()::text
            )
          FROM (
            VALUES ${placeholders.join(', ')}
          ) AS v(
            packet_key,
            domain_class,
            domain_confidence,
            domain_labels,
            classifier_version
          )
          WHERE p.packet_key = v.packet_key;
        `;

        await pool.query(updateSQL, values);
        console.log(`  ✓ Updated ${packets.length} packets`);

        cursor = packets[packets.length - 1].packet_key;
        totalProcessed += packets.length;
        totalUpdated += packets.length;
      }

      console.log('');
    }

    // Verification
    console.log('[VERIFY] Classification coverage...');
    const verifyResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN domain_class IS NOT NULL THEN 1 END) as classified,
        COUNT(CASE WHEN domain_class != 'unknown' THEN 1 END) as specifically_classified
      FROM atlas_packets;
    `);

    const { total, classified, specifically_classified } = verifyResult.rows[0];
    const coveragePct = (specifically_classified / total * 100).toFixed(2);

    console.log(`  Total packets: ${total}`);
    console.log(`  Classified: ${classified}`);
    console.log(`  Specifically classified: ${specifically_classified} (${coveragePct}%)`);
    console.log('');

    // Distribution
    console.log('[DISTRIBUTION]');
    const distResult = await pool.query(`
      SELECT
        domain_class,
        COUNT(*) as count,
        ROUND(AVG(domain_confidence)::numeric, 3) as avg_confidence
      FROM atlas_packets
      WHERE domain_class IS NOT NULL
      GROUP BY domain_class
      ORDER BY count DESC;
    `);

    for (const row of distResult.rows) {
      console.log(`  ${row.domain_class}: ${row.count} (avg conf: ${row.avg_confidence})`);
    }
    console.log('');

    if (dryRun) {
      console.log(`Dry-run processed ${totalProcessed} packets (no writes).`);
      console.log('To apply:');
      console.log(`  npx tsx scripts/atlas/classify-domains-direct-db.mts --apply`);
    } else {
      console.log(`✅ CLASSIFICATION COMPLETE`);
      console.log(`   Total updated: ${totalUpdated} packets`);
      console.log(`   Coverage: ${coveragePct}%`);
      console.log('');
      console.log('Next: Audit evaluation_relevance_corrected grades (Gate 1 → Gate 2)');
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
