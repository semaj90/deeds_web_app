#!/usr/bin/env node
/**
 * Stage 1: Domain Classifier — Direct DB, Keyset Batches
 *
 * Ledger-only classifier backfill.
 * This script records feature_domain_facts rows but does not mutate canonical atlas_packets
 * ontology fields. That promotion, if ever needed, must happen through a separate reviewed gate.
 */

import { randomUUID } from 'node:crypto';
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

type DomainLabel = { name: string; score: number };

// Classifier logic: deterministic path patterns.
function classifyPacket(sourceRef: string | null | undefined): {
  domain_labels: DomainLabel[];
  primary_domain: string;
  primary_confidence: number;
} {
  if (!sourceRef) {
    return {
      domain_labels: [],
      primary_domain: 'unknown',
      primary_confidence: 0,
    };
  }

  const patterns: Record<string, { name: string; weight: number }[]> = {
    retrieval: [
      { name: 'qdrant', weight: 0.95 },
      { name: 'vector', weight: 0.85 },
      { name: 'search', weight: 0.80 },
      { name: 'rerank', weight: 0.90 },
      { name: 'rag', weight: 0.90 },
      { name: 'context', weight: 0.75 },
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
  const allowPromote = process.argv.includes('--promote');
  let cursor = '';
  let totalProcessed = 0;
  let totalLedgerRows = 0;
  let skippedMissingSourceRef = 0;
  let skippedMissingContentHash = 0;
  const batchSize = 1000;
  const processingPassId = randomUUID();

  if (allowPromote) {
    throw new Error(
      'Canonical atlas_packets promotion has been removed from this script. Use a separate reviewed promotion gate.',
    );
  }

  console.log('Stage 1: Domain Classifier (Direct DB, Keyset Batches)');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Processing pass: ${processingPassId}`);
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
        SELECT packet_key, source_ref, content_hash
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
        const client = await pool.connect();
        let inserted = 0;
        try {
          await client.query('BEGIN');

          for (const packet of packets) {
            if (!packet.source_ref) {
              skippedMissingSourceRef++;
              continue;
            }
            if (!packet.content_hash) {
              skippedMissingContentHash++;
              continue;
            }

            const classification = classifyPacket(packet.source_ref);
            const domainProbabilities = classification.domain_labels.reduce(
              (acc, entry) => {
                acc[entry.name] = entry.score;
                return acc;
              },
              {} as Record<string, number>,
            );

            await client.query(
              `
              INSERT INTO feature_domain_facts (
                packet_key,
                source_ref,
                feature_key,
                domain_class,
                domain_confidence,
                domain_probabilities,
                classifier_kind,
                classifier_version,
                model_hash,
                feature_contract_version,
                content_hash,
                processing_pass_id,
                evidence,
                created_at
              )
              VALUES ($1, $2, NULL, $3, $4, $5::jsonb, $6, $7, NULL, $8, $9, NULL, $10::jsonb, NOW())
              ON CONFLICT (packet_key, classifier_version, content_hash) DO UPDATE SET
                source_ref = EXCLUDED.source_ref,
                domain_class = EXCLUDED.domain_class,
                domain_confidence = EXCLUDED.domain_confidence,
                domain_probabilities = EXCLUDED.domain_probabilities,
                classifier_kind = EXCLUDED.classifier_kind,
                feature_contract_version = EXCLUDED.feature_contract_version,
                evidence = EXCLUDED.evidence
              `,
              [
                packet.packet_key,
                packet.source_ref,
                classification.primary_domain,
                classification.primary_confidence,
                JSON.stringify(domainProbabilities),
                'heuristic_path_classifier',
                'domain-classifier-v1',
                'atlas-domain-classification-v1',
                packet.content_hash,
                processingPassId,
                JSON.stringify({
                  source: 'classify-domains-direct-db',
                  packet_key: packet.packet_key,
                  policy: 'ledger_only',
                }),
              ],
            );

            inserted++;
          }

          await client.query('COMMIT');
          console.log(`  ✓ Recorded ${inserted} domain facts`);
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }

        cursor = packets[packets.length - 1].packet_key;
        totalProcessed += packets.length;
        totalLedgerRows += inserted;
      }

      console.log('');
    }

    // Verification
    console.log('[VERIFY] Ledger coverage for this run...');
    const verifyResult = await pool.query(
      `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN domain_class IS NOT NULL THEN 1 END) as classified,
        COUNT(CASE WHEN domain_class != 'unknown' THEN 1 END) as specifically_classified
      FROM feature_domain_facts
      WHERE processing_pass_id = $1;
    `,
      [processingPassId],
    );

    const { total, classified, specifically_classified } = verifyResult.rows[0];
    const coveragePct = Number(total) > 0 ? ((specifically_classified / total) * 100).toFixed(2) : '0.00';

    console.log(`  Total ledger rows: ${total}`);
    console.log(`  Classified: ${classified}`);
    console.log(`  Specifically classified: ${specifically_classified} (${coveragePct}%)`);
    if (skippedMissingSourceRef > 0) {
      console.log(`  Skipped missing source_ref: ${skippedMissingSourceRef}`);
    }
    if (skippedMissingContentHash > 0) {
      console.log(`  Skipped missing content_hash: ${skippedMissingContentHash}`);
    }
    console.log('');

    // Distribution
    console.log('[DISTRIBUTION]');
    const distResult = await pool.query(
      `
      SELECT
        domain_class,
        COUNT(*) as count,
        ROUND(AVG(domain_confidence)::numeric, 3) as avg_confidence
      FROM feature_domain_facts
      WHERE processing_pass_id = $1
      GROUP BY domain_class
      ORDER BY count DESC;
    `,
      [processingPassId],
    );

    for (const row of distResult.rows) {
      console.log(`  ${row.domain_class}: ${row.count} (avg conf: ${row.avg_confidence})`);
    }
    console.log('');

    if (dryRun) {
      console.log(`Dry-run processed ${totalProcessed} packets (no writes).`);
      console.log('To apply:');
      console.log(`  npx tsx scripts/atlas/classify-domains-direct-db.mts --apply`);
    } else {
      console.log(`✅ CLASSIFICATION LEDGER COMPLETE`);
      console.log('   Canonical atlas_packets promotion is disabled in this script.');
      console.log(`   Ledger rows written: ${totalLedgerRows}`);
      console.log(`   Coverage: ${coveragePct}%`);
      console.log('');
      console.log('Next: validate train/validation/test isolation before any separate promotion gate.');
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
