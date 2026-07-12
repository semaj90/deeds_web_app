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
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';
import { buildCanonicalFeatureEnvelope, reportValidation } from './lib/envelope-builder.mjs';
import { CANONICAL_SUMMARY_LEVELS, canonicalSummaryLevelOrder } from './lib/summary-selection.mjs';

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'redis';

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('dry');
const isApply = process.argv.includes('--apply');
const limitIdx = process.argv.indexOf('--limit');
const limitEqualsArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit =
  limitIdx !== -1
    ? parseInt(process.argv[limitIdx + 1])
    : limitEqualsArg
      ? parseInt(limitEqualsArg.split('=')[1])
      : 50000;

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Phase 8 Step 2: Feature Envelope Materialization              ║');
console.log('║  Derive title_id + feature_label from summary meanings          ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log();
console.log(`Mode: ${isDryRun ? 'DRY_RUN' : 'APPLY'}`);
console.log(`Limit: ${limit} packets`);
console.log(`Canonical summary levels: ${CANONICAL_SUMMARY_LEVELS.join(', ')}`);
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

function normalizeSummaryEmbedding(value) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    return value.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
  }

  if (ArrayBuffer.isView(value)) {
    return Array.from(value, (entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return normalizeSummaryEmbedding(parsed);
    } catch {
      return null;
    }
  }

  return null;
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

    // Query packets with summaries that still need envelope repair
    const query = `
      SELECT
        ap.packet_id,
        ap.packet_key,
        ap.summary,
        ap.source_ref,
        ap.directory_path,
        ap.feature_id,
        ap.metadata,
        COALESCE(
          ap.metadata->'feature_envelope'->>'summary_embedding',
          asl.embedding::text
        ) AS summary_embedding,
        COALESCE(
          NULLIF(ap.metadata->'feature_envelope'->>'summary_model', ''),
          asl.embedding_model
        ) AS summary_model,
        COALESCE(
          NULLIF(ap.metadata->'feature_envelope'->>'summary_generated_at', ''),
          asl.generated_at::text
        ) AS summary_generated_at
      FROM atlas_packets ap
      LEFT JOIN LATERAL (
        SELECT *
        FROM atlas_summary_layers layer
        WHERE layer.packet_key = ap.packet_key
          AND layer.summary_level IN ('packet', 'gemma4_packet_summary', 'file')
        ORDER BY ${canonicalSummaryLevelOrder('layer')}
        LIMIT 1
      ) asl ON TRUE
      WHERE ap.summary IS NOT NULL
        AND LENGTH(COALESCE(ap.summary, '')) > 10
        AND (
          ap.metadata IS NULL
          OR ap.metadata->'feature_envelope' IS NULL
          OR ap.metadata->'feature_envelope'->'summary_embedding' IS NULL
          OR (
            ap.metadata->'feature_envelope'->'summary_embedding' IS NOT NULL
            AND (
              ap.metadata->'feature_envelope'->>'summary_model' IS NULL
              OR ap.metadata->'feature_envelope'->>'summary_generated_at' IS NULL
            )
          )
        )
      ORDER BY ap.created_at DESC
      LIMIT $1
    `;

    const result = await pgClient.query(query, [limit]);
    const packets = result.rows;

    console.log(`Found ${packets.length} packets needing envelope repair\n`);

    if (isDryRun) {
      console.log('DRY RUN: Would materialize:');
      for (let i = 0; i < Math.min(5, packets.length); i++) {
        const p = packets[i];
        const featureLabel = deriveFeatureLabelFromSummary(p.summary);
        const titleId = deriveTitleId(featureLabel, p.source_ref);
        console.log(`  - ${p.packet_key}`);
        console.log(`    feature_label: ${featureLabel}`);
        console.log(`    title_id: ${titleId}`);
        console.log(`    summary_embedding: ${p.summary_embedding ? 'present' : 'missing'}`);
      }
      console.log(`  ... and ${packets.length - 5} more`);
      return;
    }

    // APPLY: Materialize envelopes
    let updated = 0;
    let skipped = 0;
    for (let i = 0; i < packets.length; i++) {
      const p = packets[i];
      const summaryEmbedding = normalizeSummaryEmbedding(p.summary_embedding);
      const summaryModel = p.summary_model || 'embeddinggemma:latest';
      const summaryGeneratedAt = p.summary_generated_at || new Date().toISOString();
      const packetForEnvelope = {
        ...p,
        summary_embedding: summaryEmbedding,
        summary_model: summaryModel,
        summary_generated_at: summaryGeneratedAt,
      };

      // Build and validate canonical envelope
      const { envelope, validation } = buildCanonicalFeatureEnvelope(packetForEnvelope);

      // Skip on hard failures
      if (validation.hardFailures.length > 0) {
        console.warn(`  ⚠️  Hard validation failure for ${p.packet_key}: ${validation.hardFailures.join(', ')}`);
        skipped++;
        continue;
      }

      // Log soft warnings
      if (validation.softWarnings.length > 0) {
        console.warn(`  ⚠️  Soft warnings for ${p.packet_key}: ${validation.softWarnings.join(', ')}`);
      }

      // Derive additional fields
      const featureLabel = deriveFeatureLabelFromSummary(p.summary) || envelope.feature_label || 'unknown';
      const titleId = deriveTitleId(featureLabel, p.source_ref) || envelope.title_id;

      // Enrich envelope with derived fields
      envelope.feature_label = featureLabel;
      envelope.title_id = titleId;
      envelope.materialized_at = new Date().toISOString();
      if (summaryEmbedding) {
        envelope.summary_embedding = summaryEmbedding;
        envelope.summary_model = summaryModel;
        envelope.summary_generated_at = summaryGeneratedAt;
      }

      // Merge with existing metadata
      const newMetadata = { ...p.metadata, feature_envelope: envelope };

      // Update Postgres
      await pgClient.query(
        `UPDATE atlas_packets SET metadata = $1, updated_at = NOW() WHERE packet_id = $2`,
        [JSON.stringify(newMetadata), p.packet_id]
      );

      // Update Valkey cache if it exists
      const cacheKey = `bifrost:packet:${p.packet_key}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        const cachedEnvelope = JSON.parse(cached);
        cachedEnvelope.title_id = titleId;
        cachedEnvelope.feature_label = featureLabel;
        if (summaryEmbedding) {
          cachedEnvelope.summary_embedding = envelope.summary_embedding;
          cachedEnvelope.summary_model = envelope.summary_model;
          cachedEnvelope.summary_generated_at = envelope.summary_generated_at;
        }
        await redis.setex(cacheKey, 86400, JSON.stringify(cachedEnvelope));
      }

      updated++;
      if ((i + 1) % 1000 === 0) {
        console.log(`  ✅ Materialized ${i + 1}/${packets.length} feature envelopes`);
      }
    }

    console.log(`\n✅ Materialization complete: ${updated} packets updated, ${skipped} skipped (validation failures)`);
  } finally {
    await pgClient.end();
    await redis.quit();
  }
}

materializeFeatureEnvelopes().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
