#!/usr/bin/env node

/**
 * Phase 8 Steps 1-2: Summary Ranking + Envelope Building
 *
 * 1. Score summaries by quality (length, coherence, no artifacts)
 * 2. Build feature envelopes with identity chain
 * 3. Store in atlas_summary_layers.metadata JSONB
 *
 * Usage:
 *   node scripts/atlas/phase8-step1-2-envelopes.mjs --dry-run
 *   node scripts/atlas/phase8-step1-2-envelopes.mjs --apply
 */

import { Pool } from 'pg';
import crypto from 'crypto';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const BATCH_SIZE = 100;

const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  database: process.env.POSTGRES_DB || 'legal_ai_db',
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

// Scoring function: quality metrics
function scoreQuality(summary) {
  if (!summary || summary.length === 0) return 0;

  let score = 0.5; // Base

  // Length bonus (100-600 chars optimal)
  if (summary.length >= 100 && summary.length <= 600) {
    score += 0.3;
  } else if (summary.length >= 50) {
    score += 0.15;
  }

  // Coherence (no training artifacts)
  const artifacts = ['<end_of_turn>', '<start_of_turn>', '<thinking>', '</thinking>', '<|channel>', '<|endthinking>'];
  const hasArtifacts = artifacts.some(a => summary.includes(a));
  if (!hasArtifacts) {
    score += 0.2;
  }

  // Brevity bonus (1-2 sentences = concise)
  const sentenceCount = (summary.match(/[.!?]/g) || []).length;
  if (sentenceCount >= 1 && sentenceCount <= 3) {
    score += 0.0;
  }

  return Math.min(score, 1.0);
}

// Derive title_id from summary
function deriveTitleId(summary) {
  if (!summary) return null;

  // First line or up to 60 chars
  const titleRaw = summary
    .split('\n')[0]
    .slice(0, 60)
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50);

  if (!titleRaw) return null;

  const hash = crypto
    .createHash('sha256')
    .update(titleRaw)
    .digest('hex')
    .slice(0, 16);

  return `title:${hash}`;
}

// Build envelope
function buildEnvelope(packet, summary, quality) {
  const titleId = deriveTitleId(summary);

  return {
    packet_id: packet.packet_key,
    packet_key: packet.packet_key,
    source_ref: packet.source_ref,
    feature_id: packet.feature_id,
    feature_label: packet.feature_label || packet.feature_id,
    title_id: titleId,
    summary,
    summary_length: summary.length,
    quality_score: parseFloat(quality.toFixed(2)),
    domain_class: packet.domain_class || 'unknown',
    topology_label: (packet.directory_path?.split('/')[0]) || 'root',
    keywords: packet.keywords || [],
    embedding_dim: 384,
    identity_chain_complete: !!(packet.packet_key && packet.source_ref && packet.feature_id),
  };
}

async function executePhase8Steps12() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 8 Steps 1-2: Envelope Building + Ranking                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}\n`);

  try {
    // Fetch all newly imported summaries (from Phase 3 import)
    console.log('📖 Fetching summaries...');
    const summariesResult = await pgPool.query(`
      SELECT
        asl.packet_key,
        asl.source_ref,
        asl.feature_id,
        COALESCE(asl.summary, asl.summary_text, '') as summary,
        ap.feature_label,
        ap.directory_path,
        ap.domain_class,
        ap.keywords
      FROM atlas_summary_layers asl
      LEFT JOIN atlas_packets ap ON asl.packet_key = ap.packet_key
      WHERE (asl.metadata IS NULL OR asl.metadata->>'feature_envelope' IS NULL)
        AND (asl.summary IS NOT NULL OR asl.summary_text IS NOT NULL)
      ORDER BY asl.created_at DESC
      LIMIT 5000
    `);

    const summaries = summariesResult.rows;
    console.log(`  Found: ${summaries.length} summaries to envelope\n`);

    if (DRY_RUN) {
      console.log('📊 Sample envelopes (first 3):');
      for (let i = 0; i < Math.min(3, summaries.length); i++) {
        const s = summaries[i];
        const quality = scoreQuality(s.summary);
        const envelope = buildEnvelope(s, s.summary, quality);
        console.log(`  ${i + 1}. packet_key=${envelope.packet_key}`);
        console.log(`     quality=${envelope.quality_score}, title_id=${envelope.title_id}`);
      }

      console.log(`\n✅ Dry-run complete. Ready to apply with: --apply`);
      await pgPool.end();
      return;
    }

    // Apply mode: update atlas_summary_layers with envelopes
    console.log('💾 Storing envelopes...\n');

    let updated = 0;
    let qualityScores = [];

    for (let i = 0; i < summaries.length; i += BATCH_SIZE) {
      const batch = summaries.slice(i, i + BATCH_SIZE);

      for (const s of batch) {
        const quality = scoreQuality(s.summary);
        const envelope = buildEnvelope(s, s.summary, quality);
        qualityScores.push(quality);

        try {
          await pgPool.query(
            `
            UPDATE atlas_summary_layers
            SET
              metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{feature_envelope}',
                $1::jsonb
              ),
              updated_at = NOW()
            WHERE packet_key = $2
            `,
            [JSON.stringify(envelope), s.packet_key]
          );
          updated++;
        } catch (err) {
          console.warn(`  ⚠️  Failed to update ${s.packet_key}: ${err.message}`);
        }
      }

      console.log(`  ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1} (${updated}/${summaries.length})`);
    }

    // Statistics
    const avgQuality = (qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length).toFixed(2);
    const highQuality = qualityScores.filter(q => q >= 0.7).length;

    console.log(`\n✅ Phase 8 Steps 1-2 complete:`);
    console.log(`  Envelopes created: ${updated}`);
    console.log(`  Avg quality score: ${avgQuality}`);
    console.log(`  High quality (≥0.7): ${highQuality} (${((highQuality / updated) * 100).toFixed(1)}%)`);

    await pgPool.end();
  } catch (err) {
    console.error(`✗ Error: ${err.message}`);
    await pgPool.end();
    process.exit(1);
  }
}

executePhase8Steps12();
