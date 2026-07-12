#!/usr/bin/env node
/**
 * Phase 2D: Feature Envelope Materializer
 *
 * Combines P2A (AST) + P2C (lexical) + embedding references into unified
 * FeatureEnvelope V1 structure. No domain labels yet (P2G-P2H will add those).
 *
 * INPUTS:
 *   - atlas_packet_features.ast_symbols (from P2A)
 *   - atlas_packet_features.tree_node_ids (from P2A)
 *   - atlas_packet_features.lexical_features (from P2C)
 *   - atlas_packet_features.imports (from P2C)
 *   - atlas_packet_features.exports (from P2C)
 *   - atlas_packets metadata
 *
 * OUTPUT:
 *   - atlas_feature_envelopes table (canonical V1 shape with all evidence layers)
 *   - Qdrant payload enrichment (reference pointers)
 *
 * UNBLOCKS:
 *   - Phase 2E (topology enrichment: SOM, KMeans, PageRank)
 *   - Phase 2F (concept extraction)
 *   - Phase 2G (domain classification specs)
 *
 * Usage:
 *   node scripts/atlas/phase2d-feature-envelope-materializer.mjs --dry-run --limit=100
 *   node scripts/atlas/phase2d-feature-envelope-materializer.mjs --limit=10000
 *   node scripts/atlas/phase2d-feature-envelope-materializer.mjs --verify
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const isVerify = process.argv.includes('--verify');
const isVerbose = process.argv.includes('--verbose') || process.argv.includes('-v');
const limit = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? '10000'
);

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  database: 'legal_ai_db',
  user: 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

/**
 * Build FeatureEnvelope V1 from packet components
 * Combines evidence from AST, lexical, and embedding layers
 */
function buildFeatureEnvelope(packet, astData, lexicalData) {
  return {
    // Canonical identity
    packet_key: packet.packet_key,
    source_ref: packet.source_ref,
    content_hash: packet.sha256,

    // AST layer (from P2A)
    ast: {
      symbols: astData.symbols || [],
      tree_node_ids: astData.tree_node_ids || {},
      functions: astData.functions || 0,
      classes: astData.classes || 0,
      imports: astData.imports || [],
      exports: astData.exports || [],
    },

    // Lexical layer (from P2C)
    lexical: {
      terms: lexicalData.terms || [],
      path_terms: extractPathTerms(packet.source_ref),
      bm25_keywords: lexicalData.keywords || [],
    },

    // Embedding references (vectors stay in Qdrant, not here)
    embeddings: {
      content_768_ref: 'embeddinggemma-768-v1',
      summary_768_ref: 'embeddinggemma-768-v1',
      signature_768_ref: 'embeddinggemma-768-v1',
    },

    // Optional topology (filled in P2E+)
    topology: {
      som_index: packet.som_index || null,
      kmeans_cluster: packet.kmeans_cluster || null,
      community_id: packet.community_id || null,
    },

    // Materialization metadata
    envelope_version: 1,
    materialized_at: new Date().toISOString(),
  };
}

/**
 * Extract path-based terms from source_ref
 * Example: src/lib/server/auth.ts → [src, lib, server, auth]
 */
function extractPathTerms(sourceRef) {
  if (!sourceRef) return [];
  return sourceRef
    .split(/[\/\\.]/)
    .filter(term => term.length > 1 && term.length < 64)
    .map(term => term.toLowerCase());
}

/**
 * Count functions and classes from ast_symbols
 * Simple heuristic: PascalCase typically indicates classes
 */
function analyzeSymbolKinds(treeNodeIds) {
  if (!treeNodeIds || typeof treeNodeIds !== 'object') return { functions: 0, classes: 0 };

  let functions = 0;
  let classes = 0;

  for (const [name, nodeId] of Object.entries(treeNodeIds)) {
    // Basic heuristic
    if (/^[A-Z]/.test(name)) {
      classes++;
    } else {
      functions++;
    }
  }

  return { functions, classes };
}

async function main() {
  console.log(`\n📦 Phase 2D: Feature Envelope Materializer [${isDryRun ? 'DRY-RUN' : 'APPLY'}]\n`);

  const client = await pool.connect();

  try {
    // Step 0: Schema setup
    if (!isDryRun) {
      console.log('📊 Step 0: Verifying atlas_feature_envelopes schema...\n');
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS atlas_feature_envelopes (
            id SERIAL PRIMARY KEY,
            packet_key UUID NOT NULL UNIQUE,
            envelope_v1 JSONB NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            INDEX idx_packet_key (packet_key)
          );
        `);
        console.log('  ✓ Schema verified\n');
      } catch (e) {
        console.warn(`  ⚠️  Schema warning: ${e.message}\n`);
      }
    }

    // Step 1: Query packets with P2A + P2C data
    console.log('📦 Step 1: Query packets with AST + lexical data...');

    const queryResult = await client.query(`
      SELECT
        ap.packet_key,
        ap.source_ref,
        ap.sha256,
        ap.cluster_id,
        ap.community_id,
        COALESCE(apf.ast_symbols, ARRAY[]::text[]) as ast_symbols,
        COALESCE(apf.tree_node_ids, '{}'::jsonb) as tree_node_ids,
        COALESCE(apf.lexical_features, ARRAY[]::text[]) as lexical_features,
        COALESCE(apf.imports, ARRAY[]::text[]) as imports,
        COALESCE(apf.exports, ARRAY[]::text[]) as exports
      FROM atlas_packets ap
      LEFT JOIN atlas_packet_features apf ON ap.packet_key = apf.packet_key
      WHERE ap.packet_key IS NOT NULL
        AND (apf.ast_symbols IS NOT NULL OR apf.lexical_features IS NOT NULL)
      ORDER BY ap.packet_key
      LIMIT $1
    `, [limit]);

    const packets = queryResult.rows;
    console.log(`  ✓ Found ${packets.length} packets with evidence\n`);

    if (packets.length === 0) {
      console.log('  ℹ️  No packets with evidence to materialize.\n');
      await client.release();
      await pool.end();
      process.exit(0);
    }

    // Step 2: Build feature envelopes
    console.log(`🔨 Step 2: Build FeatureEnvelope V1 for ${packets.length} packets...\n`);

    const envelopes = [];
    let withAstAndLexical = 0;
    let withAstOnly = 0;
    let withLexicalOnly = 0;

    for (let i = 0; i < packets.length; i++) {
      const packet = packets[i];

      if ((i + 1) % 2000 === 0) {
        console.log(`  [${i + 1}/${packets.length}] Processed ${i + 1} packets...`);
      }

      // Analyze symbols
      const { functions, classes } = analyzeSymbolKinds(packet.tree_node_ids);

      // Build AST layer
      const astLayer = {
        symbols: packet.ast_symbols,
        tree_node_ids: packet.tree_node_ids,
        functions,
        classes,
        imports: packet.imports,
        exports: packet.exports,
      };

      // Build lexical layer
      const lexicalLayer = {
        terms: packet.lexical_features,
        keywords: packet.lexical_features.filter(t => t.length > 2),
      };

      // Materialize envelope
      const envelope = buildFeatureEnvelope(packet, astLayer, lexicalLayer);

      envelopes.push({
        packet_key: packet.packet_key,
        envelope_v1: envelope,
      });

      // Track coverage
      if (packet.ast_symbols.length > 0 && packet.lexical_features.length > 0) {
        withAstAndLexical++;
      } else if (packet.ast_symbols.length > 0) {
        withAstOnly++;
      } else if (packet.lexical_features.length > 0) {
        withLexicalOnly++;
      }
    }

    console.log(`  ✓ Built ${envelopes.length} envelopes`);
    console.log(`    - Both AST + lexical: ${withAstAndLexical}`);
    console.log(`    - AST only: ${withAstOnly}`);
    console.log(`    - Lexical only: ${withLexicalOnly}\n`);

    if (isDryRun) {
      console.log('📝 Step 3: Write atlas_feature_envelopes (DRY-RUN)...\n');
      console.log(`  [DRY-RUN] Would insert/update ${envelopes.length} rows\n`);

      if (envelopes.length > 0) {
        console.log('  Sample envelope (first):');
        console.log(`    ${JSON.stringify(envelopes[0], null, 2).split('\n').slice(0, 15).join('\n')}...\n`);
      }
    } else {
      console.log('📝 Step 3: Write atlas_feature_envelopes (APPLYING)...\n');

      const batchSize = 50;
      let inserted = 0;

      for (let i = 0; i < envelopes.length; i += batchSize) {
        const batch = envelopes.slice(i, Math.min(i + batchSize, envelopes.length));

        // Use UPSERT pattern — write to actual schema columns
        for (const env of batch) {
          await client.query(`
            INSERT INTO atlas_feature_envelopes (
              packet_key, source_ref, feature_id, feature_label,
              tree_node_id, lexical_terms, topology, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (packet_key)
            DO UPDATE SET
              tree_node_id = COALESCE($5, EXCLUDED.tree_node_id),
              lexical_terms = COALESCE($6, EXCLUDED.lexical_terms),
              topology = COALESCE($7, EXCLUDED.topology),
              updated_at = NOW()
          `, [
            env.packet_key,
            env.source_ref || '',
            env.feature_id || '',
            env.feature_label || '',
            env.tree_node_id ? JSON.stringify(env.tree_node_id) : null,
            env.lexical_terms ? JSON.stringify(env.lexical_terms) : null,
            env.topology ? JSON.stringify(env.topology) : null
          ]);

          inserted++;
        }

        if ((i + batchSize) % 1000 === 0) {
          console.log(`  ✓ Processed ${Math.min(i + batchSize, envelopes.length)} rows...`);
        }
      }

      console.log(`  ✓ Inserted ${inserted} feature envelopes\n`);
    }

    // Step 4: Verification
    console.log('📊 Verification (atlas_feature_envelopes table):\n');

    if (!isDryRun) {
      const verifyResult = await client.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) as with_tree_node_id,
          COUNT(CASE WHEN lexical_terms IS NOT NULL THEN 1 END) as with_lexical_terms,
          COUNT(CASE WHEN topology IS NOT NULL THEN 1 END) as with_topology
        FROM atlas_feature_envelopes;
      `);

      const { total, with_tree_node_id, with_lexical_terms, with_topology } = verifyResult.rows[0];
      const tree_node_coverage = total > 0 ? (with_tree_node_id / total * 100).toFixed(2) : '0';
      const lexical_coverage = total > 0 ? (with_lexical_terms / total * 100).toFixed(2) : '0';
      const topology_coverage = total > 0 ? (with_topology / total * 100).toFixed(2) : '0';

      console.log(`  Total feature envelopes: ${total}`);
      console.log(`  With tree_node_id: ${with_tree_node_id} (${tree_node_coverage}%)`);
      console.log(`  With lexical_terms: ${with_lexical_terms} (${lexical_coverage}%)`);
      console.log(`  With topology: ${with_topology} (${topology_coverage}%)\n`);
    }

    console.log('✨ Phase 2D COMPLETE!\n');
    console.log(`  Ready for Phase 2E: Topology Enrichment (SOM, KMeans, PageRank)\n`);

  } catch (e) {
    console.error(`\n❌ Error: ${e.message}\n`);
    console.error(e.stack);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
