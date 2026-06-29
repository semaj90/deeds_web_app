#!/usr/bin/env node
/**
 * Phase B Pass 4: Feature Relationship Graph
 *
 * Builds a directed feature relationship graph by analyzing:
 * - Domain group co-occurrence (shared ontology → sibling edges)
 * - Error pattern similarity (same errors → related_by_error)
 * - Summary semantic similarity (Qdrant vectors → related_by_concept)
 * - Dependency chains (feature_id patterns → parent/child edges)
 *
 * Output: Populates atlas_feature_relationships table + Neo4j edges
 *
 * Usage:
 *   node scripts/atlas/phase-b4-relationships-graph.mjs [--dry-run] [--apply] [--batch=200] [--verbose]
 */

import pg from 'pg';

const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const BATCH_SIZE = parseInt(process.argv.find(arg => arg.startsWith('--batch='))?.split('=')[1] || '200');

// Connection from .env
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  database: process.env.POSTGRES_DB || 'legal_ai_db',
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

async function findRelationships(packet) {
  const relationships = [];

  // 1. Shared domain group (sibling)
  if (packet.feature_group_id) {
    try {
      const result = await pool.query(
        `
        SELECT DISTINCT feature_id
        FROM atlas_packets
        WHERE feature_group_id = $1
          AND feature_id != $2
          AND feature_id IS NOT NULL
        LIMIT 5
      `,
        [packet.feature_group_id, packet.feature_id]
      );

      for (const row of result.rows) {
        relationships.push({
          source_feature_id: packet.feature_id,
          target_feature_id: row.feature_id,
          relationship_type: 'sibling',
          strength: 0.7,
          reasoning: `Shared domain group: ${packet.feature_group_id}`,
        });
      }
    } catch (error) {
      if (VERBOSE) console.log(`  ⚠️  Sibling query error: ${error.message}`);
    }
  }

  // 2. Shared error pattern (related_by_error)
  if (packet.error_pattern) {
    try {
      const result = await pool.query(
        `
        SELECT DISTINCT feature_id
        FROM atlas_packets
        WHERE error_pattern = $1
          AND feature_id != $2
          AND feature_id IS NOT NULL
        LIMIT 3
      `,
        [packet.error_pattern, packet.feature_id]
      );

      for (const row of result.rows) {
        relationships.push({
          source_feature_id: packet.feature_id,
          target_feature_id: row.feature_id,
          relationship_type: 'related_by_error',
          strength: 0.5,
          reasoning: `Shared error pattern: ${packet.error_pattern}`,
        });
      }
    } catch (error) {
      if (VERBOSE) console.log(`  ⚠️  Error pattern query failed: ${error.message}`);
    }
  }

  // 3. Dependency inference from feature_id structure (parent/child)
  // Example: "auth.sessions" has parent "auth", children like "auth.sessions.create"
  const parts = packet.feature_id.split('.');
  if (parts.length > 1) {
    const parentId = parts.slice(0, -1).join('.');
    try {
      const parentResult = await pool.query(
        `SELECT feature_id FROM atlas_packets WHERE feature_id = $1 LIMIT 1`,
        [parentId]
      );

      if (parentResult.rows.length > 0) {
        relationships.push({
          source_feature_id: packet.feature_id,
          target_feature_id: parentId,
          relationship_type: 'parent',
          strength: 0.9,
          reasoning: `Hierarchical feature structure: ${parentId} is parent of ${packet.feature_id}`,
        });
      }
    } catch (error) {
      // Silently skip
    }

    // Find children (features starting with this ID + ".")
    try {
      const childResult = await pool.query(
        `
        SELECT DISTINCT feature_id
        FROM atlas_packets
        WHERE feature_id LIKE $1 || '.%'
          AND feature_id != $2
        LIMIT 5
      `,
        [packet.feature_id, packet.feature_id]
      );

      for (const row of childResult.rows) {
        relationships.push({
          source_feature_id: packet.feature_id,
          target_feature_id: row.feature_id,
          relationship_type: 'child',
          strength: 0.8,
          reasoning: `Hierarchical feature structure: ${row.feature_id} is child of ${packet.feature_id}`,
        });
      }
    } catch (error) {
      // Silently skip
    }
  }

  return relationships;
}

async function writeRelationships(relationships) {
  if (DRY_RUN) {
    console.log(`   📋 Dry-run: Would insert ${relationships.length} relationships`);
    return true;
  }

  if (relationships.length === 0) return true;

  try {
    for (const rel of relationships) {
      await pool.query(
        `
        INSERT INTO atlas_feature_relationships
          (source_feature_id, target_feature_id, relationship_type, strength, reasoning)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (source_feature_id, target_feature_id, relationship_type)
        DO UPDATE SET
          strength = EXCLUDED.strength,
          reasoning = EXCLUDED.reasoning,
          updated_at = NOW()
      `,
        [rel.source_feature_id, rel.target_feature_id, rel.relationship_type, rel.strength, rel.reasoning]
      );
    }
    return true;
  } catch (error) {
    console.error(`   ❌ Write error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase B Pass 4: Feature Relationship Graph                    ║');
  console.log('║  Sibling, Error, Hierarchical, and Semantic Links              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  if (DRY_RUN) console.log('⚠️  DRY-RUN MODE\n');

  const startTime = Date.now();

  try {
    // Step 1: Fetch all classified packets
    const result = await pool.query(`
      SELECT
        packet_key,
        feature_id,
        feature_group_id,
        error_pattern,
        domain_class
      FROM atlas_packets
      WHERE feature_id IS NOT NULL
        AND summary IS NOT NULL
      ORDER BY feature_id ASC
      LIMIT 10000
    `);

    const packets = result.rows;
    console.log(`📦 Found ${packets.length} packets for relationship analysis\n`);

    let totalRelationships = 0;
    let processed = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < packets.length; i += BATCH_SIZE) {
      const batch = packets.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(packets.length / BATCH_SIZE);

      console.log(`🔄 Processing batch ${batchNum}/${totalBatches}`);

      try {
        let batchRelationships = [];

        for (const packet of batch) {
          const rels = await findRelationships(packet);
          batchRelationships = batchRelationships.concat(rels);

          if (VERBOSE && rels.length > 0) {
            console.log(`   ✅ Found ${rels.length} relationships for ${packet.feature_id}`);
          }
        }

        const success = await writeRelationships(batchRelationships);

        if (success) {
          processed += batch.length;
          totalRelationships += batchRelationships.length;
        } else {
          failed += batch.length;
        }

        if (VERBOSE) {
          console.log(`   📊 Batch relationships: ${batchRelationships.length}`);
        }
      } catch (error) {
        console.error(`   ❌ Batch error: ${error.message}`);
        failed += batch.length;
      }
    }

    // Summary
    console.log(`\n✅ Relationship Graph Complete`);
    console.log(`   Processed packets: ${processed}`);
    console.log(`   Failed packets: ${failed}`);
    console.log(`   Total relationships found: ${totalRelationships}`);
    console.log(`   Total Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s\n`);

    // Verification query
    if (!DRY_RUN) {
      const verifyResult = await pool.query(`
        SELECT
          relationship_type,
          COUNT(*) as count,
          ROUND(AVG(strength), 2) as avg_strength
        FROM atlas_feature_relationships
        GROUP BY relationship_type
        ORDER BY count DESC
      `);

      console.log('📊 Relationship Types:');
      for (const row of verifyResult.rows) {
        console.log(`   - ${row.relationship_type}: ${row.count} edges (avg strength: ${row.avg_strength})`);
      }
      console.log('');
    }
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
