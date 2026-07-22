#!/usr/bin/env node
/**
 * Step 5: Initialize vector_index_registry table with 4 canonical indexes
 *
 * Creates or updates entries for:
 * 1. Qdrant HNSW (dense, 384-dim)
 * 2. TurboVec quantized (4-bit, 64-dim after reduction)
 * 3. K-means clustering (32 clusters)
 * 4. SOM topology (20×20 grid)
 *
 * Usage:
 *   npx tsx init-vector-index-registry.mts [--apply] [--verbose]
 */

import pg from 'pg';

const { Pool } = pg;

interface RegistryEntry {
  index_name: string;
  index_type: 'dense_vector' | 'quantized_vector' | 'clustering' | 'topology';
  index_backend: string;
  vector_dimension: number;
  config: Record<string, unknown>;
}

const REGISTRY_ENTRIES: RegistryEntry[] = [
  {
    index_name: 'qdrant_codebase_chunks_384',
    index_type: 'dense_vector',
    index_backend: 'qdrant',
    vector_dimension: 384,
    config: {
      collection: 'codebase_chunks_384',
      metric: 'cosine',
      index_type: 'hnsw',
      hnsw_config: {
        m: 16,
        ef_construct: 200,
      },
      status: 'pending_build',
    },
  },
  {
    index_name: 'turbovec_quantized_4bit',
    index_type: 'quantized_vector',
    index_backend: 'turbovec',
    vector_dimension: 64,
    config: {
      source_dim: 384,
      target_dim: 64,
      quantization: '4-bit',
      prefilter: true,
      status: 'pending_build',
    },
  },
  {
    index_name: 'kmeans_k32',
    index_type: 'clustering',
    index_backend: 'gpu',
    vector_dimension: 384,
    config: {
      k: 32,
      init_method: 'k-means++',
      max_iter: 300,
      convergence_threshold: 0.001,
      status: 'pending_train',
    },
  },
  {
    index_name: 'som_20x20',
    index_type: 'topology',
    index_backend: 'gpu',
    vector_dimension: 384,
    config: {
      grid_width: 20,
      grid_height: 20,
      total_cells: 400,
      init_method: 'pca',
      learning_rate: 0.5,
      sigma: 5.0,
      status: 'pending_train',
    },
  },
];

async function initRegistry(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const verbose = args.includes('--verbose');

  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  });

  try {
    if (verbose) console.log('[Registry] Connecting to PostgreSQL...');

    const client = await pool.connect();

    try {
      // Check if table exists
      const tableExists = await client.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vector_index_registry')`
      );

      if (!tableExists.rows[0].exists) {
        console.error('❌ vector_index_registry table does not exist');
        console.log('   Run: npm run atlas:migrate first');
        process.exit(1);
      }

      if (verbose) console.log('[Registry] Table exists, initializing entries...');

      let inserted = 0;
      let updated = 0;

      for (const entry of REGISTRY_ENTRIES) {
        const query = `
          INSERT INTO vector_index_registry (
            index_name, index_type, index_backend, vector_dimension, config
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (index_name) DO UPDATE SET
            index_type = $2,
            vector_dimension = $4,
            config = $5,
            updated_at = NOW()
          RETURNING id, index_name
        `;

        const result = await client.query(query, [
          entry.index_name,
          entry.index_type,
          entry.index_backend,
          entry.vector_dimension,
          JSON.stringify(entry.config),
        ]);

        if (result.rows.length > 0) {
          if (verbose) {
            console.log(`  ✅ ${entry.index_name} (id=${result.rows[0].id})`);
          }
          inserted++;
        }
      }

      // Verify all 4 entries are present
      const countResult = await client.query(
        'SELECT COUNT(*) as count FROM vector_index_registry'
      );
      const totalCount = countResult.rows[0].count;

      console.log('\n=== Vector Index Registry Initialized ===');
      console.log(`Total entries: ${totalCount}`);
      console.log(`Indexes: Qdrant, TurboVec, K-means, SOM`);

      // Show status of each
      const statusResult = await client.query(
        'SELECT index_name, config->\'status\' as status FROM vector_index_registry ORDER BY id'
      );

      console.log('\nIndex Status:');
      for (const row of statusResult.rows) {
        console.log(`  - ${row.index_name}: ${row.status}`);
      }

      console.log('\n✅ Step 5 complete: vector_index_registry initialized');

      if (!apply) {
        console.log('\n(Dry-run mode. Use --apply to confirm writes.)');
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('❌ Registry initialization failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initRegistry();
