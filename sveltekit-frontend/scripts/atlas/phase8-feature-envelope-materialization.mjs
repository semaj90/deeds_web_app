#!/usr/bin/env node

/**
 * Phase 8 Step 2: Feature Envelope Materialization
 *
 * Derives title_id + feature_label grouping from summaries,
 * materializes feature envelopes in atlas_packets.metadata.feature_envelope
 *
 * Usage:
 *   npm run atlas:phase8:step2:feature-envelope:dry
 *   npm run atlas:phase8:step2:feature-envelope:apply
 */

import { Client } from 'pg';
import * as Redis from 'ioredis';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'redis';

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('dry');
const isApply = process.argv.includes('--apply');
const limitIdx = process.argv.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(process.argv[limitIdx + 1]) : 50000;

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Phase 8 Step 2: Feature Envelope Materialization              ║');
console.log('║  Derive title_id + feature_label from summary meanings          ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log();
console.log(`Mode: ${isDryRun ? 'DRY_RUN' : 'APPLY'}`);
console.log(`Limit: ${limit} packets`);
console.log();

/**
 * Extract feature label from summary text
 * Heuristic: first noun phrase after key pattern
 */
function deriveFeatureLabelFromSummary(summary) {
  if (!summary || summary.length < 10) return 'unknown';

  const patterns = [
    /^(?:Implements|Handles|Manages|Provides|Supports)\s+(.+?)(?:\s+for|\s+via|\.|$)/i,
    /^(?:A|An)\s+(.+?)(?:\s+for|\.|\s+that|\s+which|$)/i,
    /^(.+?)(?:\s+(?:module|function|class|API|service|layer|cache|queue|manager|helper|utility|handler|middleware|endpoint|controller|store|reducer|machine|builder|factory|plugin|component|hook|middleware|provider|resolver))/i,
  ];

  for (const pattern of patterns) {
    const match = summary.match(pattern);
    if (match) {
      const label = match[1].trim().toLowerCase();
      if (label.length > 3 && label.length < 100) {
        return label.replace(/\s+/g, '_');
      }
    }
  }

  // Fallback: take first 3-5 words
  const words = summary.split(/\s+/).slice(0, 5).join('_').toLowerCase();
  return words.substring(0, 80);
}

/**
 * Derive title_id from feature_label and source_ref
 * Ensures grouping stability across runs
 */
function deriveTitleId(featureLabel, sourceRef) {
  // Simple hash: combine feature label + directory depth
  const dir = sourceRef.split('/').slice(0, -1).join('/') || 'root';
  return `${featureLabel}:${dir}`;
}

/**
 * Materialize feature envelope
 */
async function materializeFeatureEnvelopes() {
  const pgClient = new Client({ connectionString: POSTGRES_URL });
  const redis = new Redis.default({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });

  try {
    await pgClient.connect();
    await redis.connect();

    // Query packets with summaries but no feature envelope
    const query = `
      SELECT
        id as packet_id,
        packet_key,
        summary,
        source_ref,
        directory_path,
        feature_id,
        metadata
      FROM atlas_packets
      WHERE summary IS NOT NULL
        AND LENGTH(COALESCE(summary, '')) > 10
        AND (metadata IS NULL OR metadata->>'feature_envelope' IS NULL)
      ORDER BY created_at DESC
      LIMIT $1
    `;

    const result = await pgClient.query(query, [limit]);
    const packets = result.rows;

    console.log(`Found ${packets.length} packets without feature envelopes\n`);

    if (isDryRun) {
      console.log('DRY RUN: Would materialize:');
      for (let i = 0; i < Math.min(5, packets.length); i++) {
        const p = packets[i];
        const featureLabel = deriveFeatureLabelFromSummary(p.summary);
        const titleId = deriveTitleId(featureLabel, p.source_ref);
        console.log(`  - ${p.packet_key}`);
        console.log(`    feature_label: ${featureLabel}`);
        console.log(`    title_id: ${titleId}`);
      }
      console.log(`  ... and ${packets.length - 5} more`);
      return;
    }

    // APPLY: Materialize envelopes
    let updated = 0;
    for (let i = 0; i < packets.length; i++) {
      const p = packets[i];
      const featureLabel = deriveFeatureLabelFromSummary(p.summary);
      const titleId = deriveTitleId(featureLabel, p.source_ref);

      const envelope = {
        feature_envelope: {
          feature_label: featureLabel,
          title_id: titleId,
          source_ref: p.source_ref,
          directory_path: p.directory_path,
          feature_id: p.feature_id,
          materialized_at: new Date().toISOString(),
        },
      };

      // Merge with existing metadata
      const newMetadata = { ...p.metadata, ...envelope };

      // Update Postgres
      await pgClient.query(
        `UPDATE atlas_packets SET metadata = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(newMetadata), p.packet_id]
      );

      // Update Valkey cache if it exists
      const cacheKey = `bifrost:packet:${p.packet_key}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        const cachedEnvelope = JSON.parse(cached);
        cachedEnvelope.title_id = titleId;
        cachedEnvelope.feature_label = featureLabel;
        await redis.setex(cacheKey, 86400, JSON.stringify(cachedEnvelope));
      }

      updated++;
      if ((i + 1) % 1000 === 0) {
        console.log(`  ✅ Materialized ${i + 1}/${packets.length} feature envelopes`);
      }
    }

    console.log(`\n✅ Materialization complete: ${updated} packets updated`);
  } finally {
    await pgClient.end();
    await redis.quit();
  }
}

materializeFeatureEnvelopes().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
