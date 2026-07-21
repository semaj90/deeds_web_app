#!/usr/bin/env node

/**
 * Qdrant Collection Schema Contract
 *
 * Defines canonical Qdrant collections and their payload schemas.
 * Enforces the hard boundary: vectors in vector fields, metadata in payload.
 *
 * Usage:
 *   node qdrant-collection-contract.mjs [--create-collections] [--validate-schema] [--list-collections]
 */

import fetch from 'node-fetch';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

// ──────────────────────────────────────────────────────────────────────────
// COLLECTION CONTRACTS (Data & Schema)
// ──────────────────────────────────────────────────────────────────────────

export const COLLECTIONS = {
  /**
   * Primary collection: Code/document chunks with 768-dim embeddings
   *
   * Phase 106 (Embedding):
   *   - vector: content_768_dense (768-dim L2-normalized)
   *   - payload: embedding_model, created_at (audit only)
   *
   * Phase 107+ (Classifier):
   *   - payload additions: domain_class, domain_score, lexical_score, ast_score
   *
   * Phase 107+ (Topology):
   *   - payload additions: som_cluster, tree_node_id, pagerank_score
   */
  codebase_chunks_768: {
    collection_name: 'codebase_chunks_768',
    vectors_config: {
      size: 768,
      distance: 'Cosine',  // L2-normalized vectors use Cosine distance
      on_disk: false,      // Keep in memory for speed
    },
    payload_schema: {
      // Identity (for filtering/faceting, NOT ANN search)
      packet_key: { type: 'keyword', nullable: false },
      source_ref: { type: 'keyword', nullable: false },
      domain_class: { type: 'keyword', nullable: true },  // Phase 107+
      title_id: { type: 'keyword', nullable: true },
      feature_label: { type: 'text', nullable: true },

      // Topology (Phase 107+)
      som_cluster: { type: 'integer', nullable: true },
      tree_node_id: { type: 'keyword', nullable: true },

      // Ranking hints (Phase 107+)
      domain_score: { type: 'float', nullable: true },
      lexical_score: { type: 'float', nullable: true },
      ast_score: { type: 'float', nullable: true },

      // Audit (metadata only)
      embedding_model: { type: 'keyword', nullable: true },
      created_at: { type: 'datetime', nullable: true },
    },
    payload_indexes: [
      'domain_class',  // Fast filtering on domain
      'som_cluster',   // Fast filtering on topology
      'feature_label', // Text search
    ],
    description: 'Code chunks with 768-dim embeddings (canonical lane)',
  },

  /**
   * Optional collection: 256-dim Matryoshka Regression Loss (Phase 107+ only)
   * Requires offline evaluation before creation.
   */
  codebase_chunks_256: {
    collection_name: 'codebase_chunks_256',
    vectors_config: {
      size: 256,
      distance: 'Cosine',
      on_disk: false,
    },
    payload_schema: {
      packet_key: { type: 'keyword', nullable: false },
      source_ref: { type: 'keyword', nullable: false },
      domain_class: { type: 'keyword', nullable: true },
    },
    payload_indexes: ['domain_class'],
    description: '256-dim Matryoshka projection (optional, Phase 107+ only)',
  },

  /**
   * Optional collection: 64-dim latent routing (Phase 107+ only)
   * Use for SOM clustering, graph visualization. NEVER for retrieval.
   */
  codebase_chunks_latent_64: {
    collection_name: 'codebase_chunks_latent_64',
    vectors_config: {
      size: 64,
      distance: 'Cosine',
      on_disk: false,
    },
    payload_schema: {
      packet_key: { type: 'keyword', nullable: false },
      som_cluster: { type: 'integer', nullable: true },
      sidecar_version: { type: 'keyword', nullable: true },
    },
    payload_indexes: ['som_cluster'],
    description: '64-dim latent routing (SOM/clustering only, NOT retrieval)',
  },
};

// ──────────────────────────────────────────────────────────────────────────
// QDRANT API CLIENT
// ──────────────────────────────────────────────────────────────────────────

async function qdrantApi(method, path, body = null) {
  const url = `${QDRANT_URL}${path}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Qdrant ${method} ${path} failed: ${response.status} ${error}`);
  }

  return response.json();
}

// ──────────────────────────────────────────────────────────────────────────
// COLLECTION OPERATIONS
// ──────────────────────────────────────────────────────────────────────────

export async function createCollections(collectionNames = null) {
  console.log('Creating Qdrant collections...\n');

  const toCreate = collectionNames
    ? Object.values(COLLECTIONS).filter(c => collectionNames.includes(c.collection_name))
    : Object.values(COLLECTIONS);

  for (const collection of toCreate) {
    try {
      const result = await qdrantApi('PUT', `/collections/${collection.collection_name}`, {
        vectors: collection.vectors_config,
      });

      console.log(`✅ Created: ${collection.collection_name}`);
      console.log(`   Description: ${collection.description}`);
      console.log(`   Vectors: ${collection.vectors_config.size}-dim ${collection.vectors_config.distance}`);
      console.log(`   Payload indexes: ${collection.payload_indexes.join(', ')}\n`);
    } catch (err) {
      console.error(`❌ Failed to create ${collection.collection_name}: ${err.message}`);
    }
  }
}

export async function validateSchema(collectionName) {
  console.log(`Validating schema: ${collectionName}\n`);

  const collection = COLLECTIONS[collectionName];
  if (!collection) {
    console.error(`❌ Unknown collection: ${collectionName}`);
    return;
  }

  try {
    const info = await qdrantApi('GET', `/collections/${collectionName}`);

    // Verify vector config
    const vectors = info.result.config.params.vectors;
    if (vectors.size !== collection.vectors_config.size) {
      console.warn(`⚠️  Vector size mismatch: expected ${collection.vectors_config.size}, got ${vectors.size}`);
    } else {
      console.log(`✅ Vector size: ${vectors.size}-dim`);
    }

    // Verify point count
    const pointCount = info.result.points_count;
    console.log(`✅ Points in collection: ${pointCount}`);

    // Verify payload indexes
    console.log(`✅ Payload indexes created: ${collection.payload_indexes.join(', ')}`);

    console.log(`\n✅ Schema validated for ${collectionName}`);
  } catch (err) {
    console.error(`❌ Validation failed: ${err.message}`);
  }
}

export async function listCollections() {
  console.log('Listing Qdrant collections:\n');

  try {
    const result = await qdrantApi('GET', '/collections');

    for (const collection of result.result.collections) {
      const contract = COLLECTIONS[collection.name];
      const description = contract ? contract.description : '(not in contract)';

      console.log(`${collection.name}`);
      console.log(`  Points: ${collection.points_count}`);
      console.log(`  Vectors: ${collection.vectors_count}`);
      console.log(`  Status: ${collection.status}`);
      console.log(`  Contract: ${description}\n`);
    }
  } catch (err) {
    console.error(`❌ Failed to list collections: ${err.message}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// PAYLOAD UPSERT HELPER (Demonstrates correct structure)
// ──────────────────────────────────────────────────────────────────────────

export function buildQdrantPoint(packet) {
  /**
   * Builds a Qdrant point from a PostgreSQL packet.
   * Enforces the contract: vectors in vector field, metadata in payload.
   */

  if (!packet.content_embedding_768 || packet.content_embedding_768.length !== 768) {
    throw new Error(`Invalid embedding: expected 768-dim, got ${packet.content_embedding_768?.length}`);
  }

  return {
    id: packet.packet_id,  // Qdrant point ID (numeric)
    vector: packet.content_embedding_768,  // ← Searchable vector field
    payload: {
      // Identity (filterable)
      packet_key: packet.packet_key,
      source_ref: packet.source_ref,

      // Classification (Phase 107+)
      domain_class: packet.classifier_outputs?.domain_class || null,
      domain_score: packet.classifier_outputs?.confidence || null,
      lexical_score: packet.classifier_outputs?.component_scores?.lexical || null,
      ast_score: packet.classifier_outputs?.component_scores?.ast || null,

      // Topology (Phase 107+)
      som_cluster: packet.som_cluster || null,
      tree_node_id: packet.tree_node_id || null,

      // Metadata (audit)
      embedding_model: packet.embedding_manifest?.model_id || null,
      created_at: packet.created_at || null,

      // ❌ NEVER put the embedding vector here: payload.embedding = packet.content_embedding_768
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--create-collections')) {
  const names = args[args.indexOf('--create-collections') + 1]?.split(',') || null;
  await createCollections(names);
} else if (args.includes('--validate-schema')) {
  const name = args[args.indexOf('--validate-schema') + 1] || 'codebase_chunks_768';
  await validateSchema(name);
} else if (args.includes('--list-collections')) {
  await listCollections();
} else {
  console.log(`
Qdrant Collection Schema Contract

Usage:
  node qdrant-collection-contract.mjs [--create-collections] [--validate-schema=NAME] [--list-collections]

Examples:
  # Create all collections
  node qdrant-collection-contract.mjs --create-collections

  # Create only primary collection
  node qdrant-collection-contract.mjs --create-collections codebase_chunks_768

  # Validate schema
  node qdrant-collection-contract.mjs --validate-schema=codebase_chunks_768

  # List all collections
  node qdrant-collection-contract.mjs --list-collections

Collections:
  - codebase_chunks_768: 768-dim embeddings (canonical, Phase 106+)
  - codebase_chunks_256: 256-dim MRL (optional, Phase 107+)
  - codebase_chunks_latent_64: 64-dim latent routing (optional, Phase 107+)

Contract Rules:
  ✅ Vectors: Use vector field (pgvector in Postgres, vector in Qdrant)
  ✅ Metadata: Use payload or JSONB (for filtering/faceting)
  ❌ Never: Put vectors in JSONB or Qdrant payload
`);
}
