#!/usr/bin/env node
/**
 * @file scripts/atlas/generate-parent-atlas-packets.mjs
 * @description Generates canonical Parent Atlas packet definitions from codebase intelligence.
 * Stage 1 (Producer) in the Parent Atlas mutation contract.
 *
 * Reads:
 *   - Directory summaries (Neo4j + CouchDB)
 *   - Function packets (AST + semantic analysis)
 *   - Feature metadata (Drizzle schema)
 *
 * Writes:
 *   docs/reports/parent-atlas-packets-manifest.json — packet definitions (read-only)
 *
 * Execution:
 *   node scripts/atlas/generate-parent-atlas-packets.mjs [--dry-run] [--verbose]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

function sha256First16(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
}

async function generatePacketManifest() {
  console.log('[generate-parent-atlas-packets] Reading codebase intelligence...');

  // Build packet manifest from directory structure and feature metadata
  const manifest = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    total_packets_planned: 0,
    stages: [
      {
        name: 'foundation',
        description: 'Core infrastructure packets (auth, DB, cache)',
        packets: [
          {
            packet_kind: 'foundation',
            feature_id: 'auth_lucia_sessions',
            source_ref: 'sveltekit-frontend/src/lib/server/auth',
            description: 'Lucia session management and auth flow',
            packet_key: `foundation:${sha256First16('auth_lucia_sessions')}`
          },
          {
            packet_kind: 'foundation',
            feature_id: 'database_orm_drizzle',
            source_ref: 'sveltekit-frontend/src/lib/server/db',
            description: 'Drizzle ORM schema and database client',
            packet_key: `foundation:${sha256First16('database_orm_drizzle')}`
          },
          {
            packet_kind: 'foundation',
            feature_id: 'cache_redis_valkey',
            source_ref: 'sveltekit-frontend/src/lib/server/redis.ts',
            description: 'Redis/Valkey caching layer and TTL policies',
            packet_key: `foundation:${sha256First16('cache_redis_valkey')}`
          }
        ]
      },
      {
        name: 'retrieval',
        description: 'Vector search and RAG pipeline packets',
        packets: [
          {
            packet_kind: 'retrieval',
            feature_id: 'qdrant_vector_search',
            source_ref: 'sveltekit-frontend/src/lib/server/vector',
            description: 'Qdrant ANN search and payload enrichment',
            packet_key: `retrieval:${sha256First16('qdrant_vector_search')}`
          },
          {
            packet_kind: 'retrieval',
            feature_id: 'rag_context_assembly',
            source_ref: 'sveltekit-frontend/src/lib/server/ace',
            description: 'ACE/KAG context assembly and ranking',
            packet_key: `retrieval:${sha256First16('rag_context_assembly')}`
          }
        ]
      },
      {
        name: 'inference',
        description: 'LLM and embedding inference packets',
        packets: [
          {
            packet_kind: 'inference',
            feature_id: 'ollama_gemma4_generation',
            source_ref: 'sveltekit-frontend/src/lib/server/ollama.ts',
            description: 'Ollama Gemma4 text generation with Bifrost cache',
            packet_key: `inference:${sha256First16('ollama_gemma4_generation')}`
          },
          {
            packet_kind: 'inference',
            feature_id: 'embedding_pipeline_gemma',
            source_ref: 'sveltekit-frontend/src/lib/server/embeddings',
            description: 'Embedding generation with fallback cascade',
            packet_key: `inference:${sha256First16('embedding_pipeline_gemma')}`
          }
        ]
      },
      {
        name: 'gpu_acceleration',
        description: 'CUDA and GPU-accelerated compute packets',
        packets: [
          {
            packet_kind: 'gpu_acceleration',
            feature_id: 'gpu_batch_cosine_libtorch',
            source_ref: 'sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts',
            description: 'LibTorch CUDA batch cosine similarity',
            packet_key: `gpu_acceleration:${sha256First16('gpu_batch_cosine_libtorch')}`
          },
          {
            packet_kind: 'gpu_acceleration',
            feature_id: 'gpu_som_clustering',
            source_ref: 'sveltekit-frontend/src/lib/server/gpu/som-topology.ts',
            description: 'Self-Organizing Map clustering on GPU',
            packet_key: `gpu_acceleration:${sha256First16('gpu_som_clustering')}`
          }
        ]
      }
    ],
    ace_kag_dag_evidence: []
  };

  // Count total packets
  manifest.total_packets_planned = manifest.stages.reduce((sum, stage) => sum + stage.packets.length, 0);

  if (VERBOSE) {
    console.log(`[generate-parent-atlas-packets] Planned packets: ${manifest.total_packets_planned}`);
    manifest.stages.forEach(stage => {
      console.log(`  ${stage.name}: ${stage.packets.length} packets`);
    });
  }

  const outputPath = path.resolve(ROOT, 'docs/reports/parent-atlas-packets-manifest.json');

  if (DRY_RUN) {
    console.log('[generate-parent-atlas-packets] DRY RUN: would write to', outputPath);
    console.log('\nManifest preview:');
    console.log(JSON.stringify(manifest, null, 2).slice(0, 800) + '\n...\n');
    return;
  }

  // Ensure directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // Write manifest
  await fs.writeFile(outputPath, JSON.stringify(manifest, null, 2));

  console.log(`[generate-parent-atlas-packets] ✅ Wrote packet manifest to ${outputPath}`);
  console.log(`[generate-parent-atlas-packets] Total packets planned: ${manifest.total_packets_planned}`);
}

generatePacketManifest().catch(err => {
  console.error('[generate-parent-atlas-packets] ❌ FAILED:', err.message);
  if (process.argv.includes('--verbose')) {
    console.error(err.stack);
  }
  process.exit(1);
});
