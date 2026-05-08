/**
 * hypergraph-build-4d.ts
 *
 * Standalone runner for the 4D topological hypergraph build process.
 * Populates manifold4 columns in:
 *   - research_summaries
 *   - embedded_summaries
 *   - codebase_chunk_index
 *
 * Usage:
 *   npx tsx scripts/hypergraph-build-4d.ts
 */

import { buildHypergraph4D } from '../src/lib/server/graph/hypergraph-4d';
import dotenv from 'dotenv';
import path from 'path';

// Load environment from .env or default dev settings
dotenv.config();

// Ensure critical env vars are set for standalone execution
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
process.env.OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

async function main() {
  console.log('🚀 Starting 4D Hypergraph Build (High-Resolution Topology)...');
  const t0 = Date.now();

  try {
    const result = await buildHypergraph4D();

    const duration = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n✅ Hypergraph build complete in ${duration}s`);
    console.log(`   Nodes Tagged:  ${result.nodesTagged}`);
    console.log(`   Hyperedges:    ${result.hyperedges}`);
    console.log(`   Grade A:       ${result.gradeA}`);
    console.log(`   Grade B:       ${result.gradeB}`);
    console.log(`   Grade C:       ${result.gradeC}`);
    console.log(`   Grade D:       ${result.gradeD}`);
    console.log(`   Compute:       ${result.source.toUpperCase()}`);

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Hypergraph build failed:', err);
    process.exit(1);
  }
}

main();
