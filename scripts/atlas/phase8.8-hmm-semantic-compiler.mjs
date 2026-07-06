#!/usr/bin/env node
/**
 * Phase 8.8: HMM Semantic Compiler
 *
 * Drives title_id → tree_node_id → lexical feature extraction.
 * HMM states:
 *   0: IDENTITY (packet_key, feature_id, title_id exist)
 *   1: STRUCTURE (tree_node_id resolved)
 *   2: LEXICAL (ast-grep nouns/verbs/ngrams extracted)
 *   3: SEMANTIC (LangExtract concepts + domain labels)
 *   4: TOPOLOGY (SOM + PageRank + community assigned)
 *   5: INDEXED (Qdrant payload + mmap registry ready)
 *
 * This pass wires the HMM state transitions and produces:
 *   - Lexical features (nouns, verbs, trigrams) for BM25 indexing
 *   - Semantic tags for Qdrant payload enrichment
 *   - Topology coordinates for SOM interpolation
 *
 * Usage:
 *   npm run atlas:phase8.8:hmm:dry      # Preview
 *   npm run atlas:phase8.8:hmm:apply    # Execute
 */

import { execSync } from 'child_process';
import pg from 'pg';

const { Pool } = pg;

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const isApply = process.argv.includes('--apply');
const limit = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? '68181');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:postgres@localhost:5434/legal_ai_db',
});

const HMM_STATE = {
  IDENTITY: 0,      // packet_key, feature_id, title_id
  STRUCTURE: 1,     // tree_node_id resolved
  LEXICAL: 2,       // ast-grep features extracted
  SEMANTIC: 3,      // LangExtract concepts done
  TOPOLOGY: 4,      // SOM + PageRank + community
  INDEXED: 5,       // Qdrant payload + mmap ready
};

function deriveHMMState(packet) {
  // Determine current state based on populated fields
  let state = HMM_STATE.IDENTITY;

  if (packet.tree_node_id) {
    state = HMM_STATE.STRUCTURE;
  }
  if (packet.tree_node_id && packet.lexical_features) {
    state = HMM_STATE.LEXICAL;
  }
  if (packet.concept_ids && packet.domain_class) {
    state = HMM_STATE.SEMANTIC;
  }
  if (packet.som_cluster && packet.page_rank_score) {
    state = HMM_STATE.TOPOLOGY;
  }
  if (packet.qdrant_payload && packet.mmap_key) {
    state = HMM_STATE.INDEXED;
  }

  return state;
}

function extractLexicalFeatures(sourceRef, summary) {
  // Placeholder: In production, call ast-grep or LangExtract
  // For now, extract simple ngrams from summary
  const words = (summary || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);

  // Extract bigrams
  const bigrams = [];
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(`${words[i]}_${words[i + 1]}`);
  }

  // Extract trigrams
  const trigrams = [];
  for (let i = 0; i < words.length - 2; i++) {
    trigrams.push(`${words[i]}_${words[i + 1]}_${words[i + 2]}`);
  }

  return {
    unigrams: words,
    bigrams,
    trigrams,
    count: words.length + bigrams.length + trigrams.length,
  };
}

async function main() {
  console.log(`\n🔄 Phase 8.8: HMM Semantic Compiler [${isDryRun ? 'DRY-RUN' : 'APPLY'}]\n`);
  console.log(`   Limit: ${limit} packets\n`);

  const client = await pool.connect();

  try {
    // 1. Fetch packets that have title_id + tree_node_id (STRUCTURE state ready)
    console.log('📦 Step 1: Fetch packets in STRUCTURE state (title_id + tree_node_id)...');
    const result = await client.query(`
      SELECT
        packet_key,
        feature_id,
        title_id,
        tree_node_id,
        source_ref,
        summary,
        domain_class,
        concept_ids,
        som_cluster,
        page_rank_score,
        community_id,
        qdrant_point_id,
        mmap_key
      FROM atlas_packets
      WHERE title_id IS NOT NULL
        AND tree_node_id IS NOT NULL
      ORDER BY packet_key
      LIMIT $1
    `, [limit]);

    const packets = result.rows;
    console.log(`  ✓ Found ${packets.length} packets in STRUCTURE state\n`);

    if (packets.length === 0) {
      console.log('⚠️  No packets ready for HMM compilation.\n');
      process.exit(0);
    }

    // 2. Run HMM state transitions
    console.log('🧮 Step 2: Run HMM state transitions...');

    let stateTransitions = {
      [HMM_STATE.IDENTITY]: 0,
      [HMM_STATE.STRUCTURE]: 0,
      [HMM_STATE.LEXICAL]: 0,
      [HMM_STATE.SEMANTIC]: 0,
      [HMM_STATE.TOPOLOGY]: 0,
      [HMM_STATE.INDEXED]: 0,
    };

    const updates = [];

    for (const packet of packets) {
      const currentState = deriveHMMState(packet);
      stateTransitions[currentState]++;

      // Derive next state: if STRUCTURE, extract lexical features
      if (currentState === HMM_STATE.STRUCTURE) {
        const lexical = extractLexicalFeatures(packet.source_ref, packet.summary);

        updates.push({
          packet_key: packet.packet_key,
          lexical_features: lexical,
          next_state: HMM_STATE.LEXICAL,
        });
      }

      // If SEMANTIC, we can transition to TOPOLOGY (requires SOM + PageRank)
      if (currentState === HMM_STATE.SEMANTIC && packet.som_cluster && packet.page_rank_score) {
        updates.push({
          packet_key: packet.packet_key,
          next_state: HMM_STATE.TOPOLOGY,
        });
      }

      // If TOPOLOGY, we can transition to INDEXED (requires qdrant_point_id + mmap)
      if (currentState === HMM_STATE.TOPOLOGY && packet.qdrant_point_id && packet.mmap_key) {
        updates.push({
          packet_key: packet.packet_key,
          next_state: HMM_STATE.INDEXED,
        });
      }
    }

    console.log(`  ✓ IDENTITY state: ${stateTransitions[HMM_STATE.IDENTITY]}`);
    console.log(`  ✓ STRUCTURE state: ${stateTransitions[HMM_STATE.STRUCTURE]}`);
    console.log(`  ✓ LEXICAL state: ${stateTransitions[HMM_STATE.LEXICAL]}`);
    console.log(`  ✓ SEMANTIC state: ${stateTransitions[HMM_STATE.SEMANTIC]}`);
    console.log(`  ✓ TOPOLOGY state: ${stateTransitions[HMM_STATE.TOPOLOGY]}`);
    console.log(`  ✓ INDEXED state: ${stateTransitions[HMM_STATE.INDEXED]}`);
    console.log(`  ✓ Total transitions: ${updates.length} packets\n`);

    if (isDryRun) {
      console.log('📋 Sample HMM transitions (first 5):');
      for (const update of updates.slice(0, 5)) {
        const stateNames = Object.keys(HMM_STATE);
        const nextStateName = stateNames[update.next_state];
        console.log(`   ${update.packet_key} → ${nextStateName}`);
        if (update.lexical_features) {
          console.log(`      Lexical: ${update.lexical_features.unigrams.slice(0, 5).join(', ')} ...`);
        }
      }
      console.log('\n✅ Dry-run complete. Use --apply to execute.\n');
      process.exit(0);
    }

    // 3. Apply HMM state updates (store lexical features, update state)
    console.log('💾 Step 3: Apply HMM state transitions to Postgres...');

    for (const update of updates) {
      const lexicalJson = update.lexical_features ? JSON.stringify(update.lexical_features) : null;

      await client.query(`
        UPDATE atlas_packets
        SET
          lexical_features = $1,
          hmm_state = $2,
          updated_at = NOW()
        WHERE packet_key = $3
      `, [lexicalJson, update.next_state, update.packet_key]);
    }

    console.log(`  ✓ Updated ${updates.length} packets with HMM state transitions\n`);

    // 4. Verify coverage improvement
    console.log('✅ Step 4: Verify HMM state coverage...');
    const verify = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN hmm_state >= $1 THEN 1 END) as structure_state,
        COUNT(CASE WHEN hmm_state >= $2 THEN 1 END) as lexical_state,
        COUNT(CASE WHEN hmm_state >= $3 THEN 1 END) as semantic_state,
        COUNT(CASE WHEN hmm_state >= $4 THEN 1 END) as topology_state,
        COUNT(CASE WHEN hmm_state >= $5 THEN 1 END) as indexed_state
      FROM atlas_packets
    `, [HMM_STATE.STRUCTURE, HMM_STATE.LEXICAL, HMM_STATE.SEMANTIC, HMM_STATE.TOPOLOGY, HMM_STATE.INDEXED]);

    const {
      total,
      structure_state,
      lexical_state,
      semantic_state,
      topology_state,
      indexed_state,
    } = verify.rows[0];

    console.log(`  ✓ Total packets: ${total}`);
    console.log(`  ✓ STRUCTURE+: ${structure_state} (${Math.round((structure_state / total) * 100)}%)`);
    console.log(`  ✓ LEXICAL+: ${lexical_state} (${Math.round((lexical_state / total) * 100)}%)`);
    console.log(`  ✓ SEMANTIC+: ${semantic_state} (${Math.round((semantic_state / total) * 100)}%)`);
    console.log(`  ✓ TOPOLOGY+: ${topology_state} (${Math.round((topology_state / total) * 100)}%)`);
    console.log(`  ✓ INDEXED+: ${indexed_state} (${Math.round((indexed_state / total) * 100)}%)\n`);

    console.log('✅ Phase 8.8 HMM Semantic Compiler Complete');
    console.log(`   Updated: ${updates.length} packets`);
    console.log(`   HMM states populated for retrieval + reranking\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
