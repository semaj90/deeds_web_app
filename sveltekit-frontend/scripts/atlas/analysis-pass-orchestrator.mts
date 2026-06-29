#!/usr/bin/env node
/**
 * Analysis Pass Orchestrator
 *
 * Records provenance for every analysis pass independently:
 * - Gemma4 summarization (pass_key: gemma4_summary_v1)
 * - Embedding generation (pass_key: embeddinggemma_summary_embed_v1)
 * - Feature extraction (pass_key: langextract_feature_v1)
 * - Cache pushes (pass_key: bitfrost_cache_push_v1)
 * - GPU clustering (pass_key: semantic_kmeans_v1, som_topology_v1)
 *
 * Each pass is independent; identity stays stable in atlas_packets.
 * Variance is recorded in provenance JSONB.
 *
 * Usage:
 *   npm run analysis:pass:log gemma4_summary_v1 [--packet=key] [--apply]
 */

import { Pool } from 'pg';
import { createHash } from 'crypto';

const PASS_KEY = process.argv[2] || '';
const PACKET_KEY = process.argv.find(arg => arg.startsWith('--packet='))?.split('=')[1];
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

// Valid pass keys
const VALID_PASSES = [
  'gemma4_summary_v1',
  'embeddinggemma_summary_embed_v1',
  'langextract_feature_v1',
  'bitfrost_cache_push_v1',
  'qdrant_payload_tag_sync_v1',
  'neo4j_relation_projection_v1',
  'gds_pagerank_v1',
  'semantic_kmeans_v1',
  'som_topology_v1',
];

interface AnalysisPassRecord {
  pass_key: string;
  packet_key: string;
  source_ref?: string;
  feature_id?: string;
  pass_type: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  input_hash?: string;
  prompt_hash?: string;
  model_name?: string;
  temperature?: number;
  max_tokens?: number;
  output: Record<string, any>;
  scores: Record<string, number>;
  index_push: Record<string, boolean>;
  provenance: {
    source: string;
    repo_analysis: boolean;
    input_kind: string;
    summary_variance?: {
      temperature: number;
      max_tokens: number;
      seed: null;
      deterministic: boolean;
    };
    runtime?: {
      endpoint: string;
      worker: string;
      concurrency: number;
    };
    identity?: {
      identity_mutated: boolean;
      join_key: string;
      fallback_join: string;
    };
  };
}

const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  database: process.env.POSTGRES_DB || 'legal_ai_db',
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

async function logAnalysisPass(record: AnalysisPassRecord): Promise<number> {
  if (!APPLY) {
    console.log(`\n📋 DRY-RUN: Would log analysis pass`);
    console.log(`  Pass: ${record.pass_key}`);
    console.log(`  Packet: ${record.packet_key}`);
    console.log(`  Status: ${record.status}`);
    return 0;
  }

  try {
    const result = await pgPool.query(
      `
      INSERT INTO analysis_pass_results (
        pass_key, packet_key, source_ref, feature_id,
        pass_type, status,
        input_hash, prompt_hash, model_name, temperature, max_tokens,
        output, scores, index_push, provenance,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15,
        NOW(), NOW()
      )
      RETURNING id
      `,
      [
        record.pass_key,
        record.packet_key,
        record.source_ref || null,
        record.feature_id || null,
        record.pass_type,
        record.status,
        record.input_hash || null,
        record.prompt_hash || null,
        record.model_name || null,
        record.temperature || null,
        record.max_tokens || null,
        JSON.stringify(record.output),
        JSON.stringify(record.scores),
        JSON.stringify(record.index_push),
        JSON.stringify(record.provenance),
      ]
    );

    return result.rows[0].id;
  } catch (err) {
    console.error(`❌ Failed to log analysis pass: ${err}`);
    return 0;
  }
}

function createGemma4SummaryRecord(
  packetKey: string,
  sourceRef: string,
  featureId: string,
  summary: string,
  temperature: number = 0.3,
  maxTokens: number = 128
): AnalysisPassRecord {
  const promptHash = createHash('sha256')
    .update(`summary:${sourceRef}:${featureId}`)
    .digest('hex');
  const inputHash = createHash('sha256')
    .update(`${sourceRef}:${featureId}`)
    .digest('hex');

  return {
    pass_key: 'gemma4_summary_v1',
    packet_key: packetKey,
    source_ref: sourceRef,
    feature_id: featureId,
    pass_type: 'summarization',
    status: 'success',
    input_hash: inputHash,
    prompt_hash: promptHash,
    model_name: 'gemma4-legal-iq4xs-direct.gguf',
    temperature,
    max_tokens: maxTokens,
    output: {
      summary,
      summary_tokens: Math.ceil(summary.length / 4),
    },
    scores: {
      confidence: 0.85,
      coherence: 0.90,
    },
    index_push: {
      postgres: true,
      qdrant: true,
      bitfrost: true,
      neo4j: false,
    },
    provenance: {
      source: 'offline_summary_worker',
      repo_analysis: true,
      input_kind: 'repo_file_packet',
      summary_variance: {
        temperature,
        max_tokens: maxTokens,
        seed: null,
        deterministic: false,
      },
      runtime: {
        endpoint: 'http://127.0.0.1:8090/v1/completions',
        worker: 'python_async',
        concurrency: 5,
      },
      identity: {
        identity_mutated: false,
        join_key: 'packet_key',
        fallback_join: 'normalized_source_ref',
      },
    },
  };
}

function createEmbeddingRecord(
  packetKey: string,
  sourceRef: string,
  featureId: string,
  embedding: number[]
): AnalysisPassRecord {
  return {
    pass_key: 'embeddinggemma_summary_embed_v1',
    packet_key: packetKey,
    source_ref: sourceRef,
    feature_id: featureId,
    pass_type: 'embedding',
    status: 'success',
    model_name: 'embeddinggemma:latest',
    output: {
      embedding_dim: embedding.length,
      embedding_sample: embedding.slice(0, 5),
    },
    scores: {
      magnitude: Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0)),
    },
    index_push: {
      postgres: false,
      qdrant: true,
      bitfrost: false,
      neo4j: false,
    },
    provenance: {
      source: 'embedding_worker',
      repo_analysis: true,
      input_kind: 'summary_text',
      identity: {
        identity_mutated: false,
        join_key: 'packet_key',
        fallback_join: 'normalized_source_ref',
      },
    },
  };
}

function createKMeansRecord(
  packetKey: string,
  sourceRef: string,
  featureId: string,
  clusterAssignment: number,
  clusterDistance: number
): AnalysisPassRecord {
  return {
    pass_key: 'semantic_kmeans_v1',
    packet_key: packetKey,
    source_ref: sourceRef,
    feature_id: featureId,
    pass_type: 'clustering',
    status: 'success',
    model_name: 'libTorch_kmeans_cuda',
    output: {
      cluster_id: clusterAssignment,
      cluster_distance: clusterDistance,
    },
    scores: {
      intra_cluster_distance: clusterDistance,
    },
    index_push: {
      postgres: true,
      qdrant: true,
      bitfrost: true,
      neo4j: true,
    },
    provenance: {
      source: 'gpu_kmeans_worker',
      repo_analysis: true,
      input_kind: 'embedding_vector',
      runtime: {
        endpoint: 'cuda:0',
        worker: 'tensorrt_bridge_node',
        concurrency: 32,
      },
      identity: {
        identity_mutated: false,
        join_key: 'packet_key',
        fallback_join: 'normalized_source_ref',
      },
    },
  };
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Analysis Pass Orchestrator (Provenance Logger)                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  if (!PASS_KEY || !VALID_PASSES.includes(PASS_KEY)) {
    console.log('❌ Invalid pass_key. Valid options:');
    VALID_PASSES.forEach(p => console.log(`  - ${p}`));
    process.exit(1);
  }

  console.log(`Pass: ${PASS_KEY}`);
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  if (PACKET_KEY) console.log(`Packet: ${PACKET_KEY}`);
  console.log('');

  try {
    // Example: Log a Gemma4 summary pass for a single packet
    if (PASS_KEY === 'gemma4_summary_v1' && PACKET_KEY) {
      // Fetch packet from DB
      const result = await pgPool.query(
        'SELECT packet_key, source_ref, feature_id FROM atlas_packets WHERE packet_key = $1 LIMIT 1',
        [PACKET_KEY]
      );

      if (result.rows.length === 0) {
        console.log(`❌ Packet not found: ${PACKET_KEY}`);
        process.exit(1);
      }

      const packet = result.rows[0];
      const record = createGemma4SummaryRecord(
        packet.packet_key,
        packet.source_ref,
        packet.feature_id,
        'Example summary from Gemma4 for this packet.'
      );

      const passId = await logAnalysisPass(record);
      if (passId > 0) {
        console.log(`✅ Logged analysis pass with ID: ${passId}`);
      }
    } else if (!PACKET_KEY) {
      console.log('ℹ️  Example usage: npm run analysis:pass:log gemma4_summary_v1 --packet=<key> --apply');
      console.log('\nAvailable pass types:');
      VALID_PASSES.forEach(p => console.log(`  - ${p}`));
    }

    console.log('\n✅ Complete\n');
  } catch (err) {
    console.error(`\n❌ Error: ${err}`);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

main();
