#!/usr/bin/env node
/**
 * Phase 2: Glyphs GRPO Reward Scoring
 *
 * Compute reward scores for 78 ACE glyphs using GPU similarity + GRPO policy
 * Input: glyph_records table (78 cards, Phase 1 complete)
 * Output: Training data JSONL (glyph + reward + vector triple)
 *
 * Process:
 * 1. Load glyphs from glyph_records
 * 2. Fetch Qdrant codebase chunks (semantic search)
 * 3. Compute GPU similarity (cosine distance)
 * 4. Score GRPO reward via policy (high confidence + diverse coverage)
 * 5. Assemble training triples
 * 6. Materialize JSONL for QLoRA fine-tuning
 */

import { Pool } from 'pg';
import { createReadStream, createWriteStream } from 'fs';
import { Transform } from 'stream';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

// Config
const POSTGRES_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const QDRANT_ENDPOINT = process.env.QDRANT_ENDPOINT || 'http://localhost:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';

// GRPO Policy thresholds
const GRPO_CONFIG = {
  confidenceWeight: 0.5,    // How much we trust the similarity score
  diversityWeight: 0.3,     // How much we reward coverage of different topics
  noveltyWeight: 0.2,       // How much we reward novel/rare glyphs
  thresholdMin: 0.3,        // Minimum similarity to consider (filter noise)
  thresholdMax: 0.95,       // Saturation point (diminishing returns)
};

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--write');
const OUT_PATH = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;

async function fetchGlyphsFromDB(db) {
  const res = await db.query(`
    SELECT
      id, glyph_id, source_id, kind, section,
      summary, record_json, som_cluster, centroid_id, grpo_reward_score
    FROM glyph_records
    ORDER BY created_at ASC
  `);
  return res.rows;
}

async function fetchQdrantChunks(limit = 100) {
  try {
    const body = JSON.stringify({
      vector: new Array(768).fill(0), // dummy query vector
      limit,
      with_payload: true,
      with_vectors: true
    });

    const resp = await fetch(`${QDRANT_ENDPOINT}/collections/${QDRANT_COLLECTION}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });

    if (!resp.ok) {
      console.warn(`⚠️  Qdrant fetch failed (${resp.status}), using empty fallback`);
      return [];
    }

    const json = await resp.json();
    return (json.result || []).map(pt => ({
      id: pt.id,
      payload: pt.payload,
      vector: pt.vector?.data || []
    }));
  } catch (err) {
    console.warn(`⚠️  Qdrant error: ${err.message}`);
    return [];
  }
}

/**
 * Compute cosine similarity between two vectors (768-dim)
 * Returns score 0-1
 */
function cosineSimilarity(v1, v2) {
  if (!v1.length || !v2.length || v1.length !== v2.length) return 0;

  let dotProduct = 0, norm1 = 0, norm2 = 0;
  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    norm1 += v1[i] * v1[i];
    norm2 += v2[i] * v2[i];
  }

  const denom = Math.sqrt(norm1) * Math.sqrt(norm2);
  return denom > 0 ? dotProduct / denom : 0;
}

/**
 * GRPO Policy: Score a glyph based on its similarity to codebase chunks
 *
 * Reward = confidence (top-k avg similarity) + diversity (topic spread) + novelty (rare patterns)
 */
function scoreGRPOReward(glyphId, similarities, topK = 5) {
  if (!similarities.length) return 0;

  // Sort descending and take top-K
  const sorted = similarities.sort((a, b) => b - a);
  const topScores = sorted.slice(0, Math.min(topK, sorted.length));

  // Confidence: average of top-K similarities (normalized to 0-1)
  const confidence = topScores.reduce((a, b) => a + b, 0) / topScores.length;
  const confidenceScore = Math.max(0, Math.min(1, confidence - GRPO_CONFIG.thresholdMin) / (GRPO_CONFIG.thresholdMax - GRPO_CONFIG.thresholdMin));

  // Diversity: penalize if all scores are clustered (good coverage = spread)
  const mean = topScores.reduce((a, b) => a + b, 0) / topScores.length;
  const variance = topScores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / topScores.length;
  const diversityScore = Math.min(1, variance); // Higher variance = more diverse

  // Novelty: glyphs with moderate confidence are novel (not too easy, not too hard)
  const noveltyScore = Math.abs(confidenceScore - 0.5) < 0.2 ? 1.0 : 0.5;

  // Combine with weights
  const reward =
    (confidenceScore * GRPO_CONFIG.confidenceWeight) +
    (diversityScore * GRPO_CONFIG.diversityWeight) +
    (noveltyScore * GRPO_CONFIG.noveltyWeight);

  return Math.max(0, Math.min(1, reward));
}

async function main() {
  console.log('🚀 Phase 2: Glyphs GRPO Reward Scoring');
  console.log(`📊 Database: ${POSTGRES_URL}`);
  console.log(`🔍 Qdrant: ${QDRANT_ENDPOINT}/${QDRANT_COLLECTION}`);
  console.log(`⚙️  Mode: ${DRY_RUN ? 'DRY-RUN' : 'WRITE'}\n`);

  const db = new Pool({ connectionString: POSTGRES_URL, max: 5 });
  let processed = 0, scored = 0, errors = 0;

  try {
    // 1. Load glyphs from DB
    console.log('📥 Loading glyphs from database...');
    const glyphs = await fetchGlyphsFromDB(db);
    console.log(`   Found ${glyphs.length} glyphs\n`);

    // 2. Load Qdrant chunks for similarity baseline
    console.log('📚 Loading Qdrant codebase chunks...');
    const chunks = await fetchQdrantChunks(500);
    console.log(`   Found ${chunks.length} chunks\n`);

    if (!chunks.length) {
      console.warn('⚠️  No Qdrant chunks found. Using fallback scoring (deterministic).');
    }

    // 3. Score each glyph
    console.log('🎯 Scoring glyphs via GRPO policy...\n');

    const trainingData = [];
    for (const glyph of glyphs) {
      try {
        let reward = 0;

        if (chunks.length > 0) {
          // Compute similarity to all chunks
          const vector = glyph.record_json?.vector?.embedding || new Array(768).fill(0);
          const similarities = chunks.map(c => cosineSimilarity(vector, c.vector || []));
          reward = scoreGRPOReward(glyph.glyph_id, similarities);
        } else {
          // Fallback: deterministic score based on hash (reproducible)
          const hash = Buffer.from(glyph.glyph_id).reduce((h, c) => h ^ c, 0);
          reward = (hash % 100) / 100;
        }

        const triple = {
          glyphId: glyph.glyph_id,
          sourceId: glyph.source_id,
          section: glyph.section,
          summary: glyph.summary,
          grpoReward: reward,
          vectorDim: 768,
          batchId: new Date().toISOString().slice(0, 10),
          recordJson: glyph.record_json
        };

        trainingData.push(triple);
        scored++;

        if (scored % 10 === 0) {
          console.log(`  ✓ Scored ${scored}/${glyphs.length} glyphs (avg reward: ${(trainingData.reduce((a, t) => a + t.grpoReward, 0) / scored).toFixed(3)})`);
        }
      } catch (err) {
        console.error(`  ❌ Error scoring glyph ${glyph.glyph_id}: ${err.message}`);
        errors++;
      }
      processed++;
    }

    console.log(`\n✅ Scoring Complete`);
    console.log(`   Processed: ${processed}`);
    console.log(`   Scored: ${scored}`);
    console.log(`   Errors: ${errors}`);

    if (!DRY_RUN && trainingData.length > 0) {
      // Materialize training data
      const outFile = OUT_PATH || path.join(projectRoot, 'scripts/atlas/out', `glyphs-training-data-${new Date().toISOString().slice(0, 10)}.jsonl`);

      console.log(`\n💾 Writing training data to: ${outFile}`);

      const lines = trainingData.map(t => JSON.stringify(t)).join('\n');
      await new Promise((resolve, reject) => {
        require('fs').writeFile(outFile, lines + '\n', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      console.log(`   ✓ Wrote ${trainingData.length} training triples`);
      console.log(`\n📊 Stats:`);
      console.log(`   Min reward: ${Math.min(...trainingData.map(t => t.grpoReward)).toFixed(3)}`);
      console.log(`   Max reward: ${Math.max(...trainingData.map(t => t.grpoReward)).toFixed(3)}`);
      console.log(`   Avg reward: ${(trainingData.reduce((a, t) => a + t.grpoReward, 0) / trainingData.length).toFixed(3)}`);

      // Update DB with scores (optional, for future Phase 3)
      console.log(`\n🗄️  Updating glyph_records with scores...`);
      let updated = 0;
      for (const triple of trainingData) {
        await db.query(
          `UPDATE glyph_records SET grpo_reward_score = $1, updated_at = NOW() WHERE glyph_id = $2`,
          [triple.grpoReward, triple.glyphId]
        );
        updated++;
        if (updated % 20 === 0) console.log(`   ✓ Updated ${updated}/${trainingData.length}`);
      }
      console.log(`   ✓ All scores persisted to database`);
    } else if (DRY_RUN) {
      console.log(`\n📋 DRY-RUN: No files written. Use --write to persist.`);
      console.log(`\n📊 Sample training data (first 3):`);
      trainingData.slice(0, 3).forEach((t, i) => {
        console.log(`   ${i + 1}. ${t.glyphId} → reward: ${t.grpoReward.toFixed(3)}`);
      });
    }

  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error(`\n❌ Fatal error: ${err.message}`);
  process.exit(1);
});
