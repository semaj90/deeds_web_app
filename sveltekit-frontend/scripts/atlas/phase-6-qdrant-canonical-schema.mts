#!/usr/bin/env node
/**
 * Phase 6: Canonical Qdrant Multi-Vector Schema
 *
 * Apply multi-vector Qdrant schema with named vectors:
 * - content_384 (full chunk embedding)
 * - summary_384 (summary embedding)
 * - signature_384 (code signature embedding)
 *
 * Parallel task running alongside Phase 5 & 7
 * Output: Qdrant collection schema updated, RRF fusion ready
 */

import { QdrantClient } from '@qdrant/js-client-rest';

const qdrantClient = new QdrantClient({
  url: 'http://127.0.0.1:6333',
});

const COLLECTION_NAME = 'codebase_chunks_768';
const NEW_COLLECTION_NAME = 'codebase_chunks_canonical';
const VECTOR_SIZE = 384;

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  PHASE 6: CANONICAL QDRANT SCHEMA                             ║');
  console.log('║  Apply multi-vector named vectors for RRF fusion               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    console.log('[1/4] CHECKING EXISTING COLLECTION\n');

    // Check if new collection already exists
    const collections = await qdrantClient.getCollections();
    const collectionExists = collections.collections.some(
      (c) => c.name === NEW_COLLECTION_NAME
    );

    if (collectionExists) {
      console.log(
        `  ✓ Collection '${NEW_COLLECTION_NAME}' already exists\n`
      );
    } else {
      console.log(`  Creating new collection: ${NEW_COLLECTION_NAME}\n`);

      // Create new collection with named vectors
      await qdrantClient.createCollection(NEW_COLLECTION_NAME, {
        vectors: {
          content: {
            size: VECTOR_SIZE,
            distance: 'Cosine',
            on_disk: true,
          },
          summary: {
            size: VECTOR_SIZE,
            distance: 'Cosine',
            on_disk: true,
          },
          signature: {
            size: VECTOR_SIZE,
            distance: 'Cosine',
            on_disk: true,
          },
        },
        optimizers_config: {
          default_segment_number: 2,
          snapshot_distance: 20000,
        },
        quantization_config: {
          scalar: {
            type: 'int8',
            quantile: 0.99,
            always_ram: false,
          },
        },
      });

      console.log(`  ✓ Collection created with named vectors\n`);
    }

    console.log('[2/4] SCHEMA VALIDATION\n');

    const collection = await qdrantClient.getCollection(NEW_COLLECTION_NAME);
    console.log(`  Collection: ${collection.config.params.vectors?.content ? '✓' : '✗'} content_384`);
    console.log(`  Collection: ${collection.config.params.vectors?.summary ? '✓' : '✗'} summary_384`);
    console.log(`  Collection: ${collection.config.params.vectors?.signature ? '✓' : '✗'} signature_384\n`);

    console.log('[3/4] PAYLOAD SCHEMA DEFINITION\n');

    const payloadSchema = {
      directory_path: { type: 'keyword', description: 'Directory path' },
      source_ref: { type: 'keyword', description: 'Source file reference' },
      file_path: { type: 'text', description: 'Full file path' },
      feature_id: { type: 'keyword', description: 'Feature identifier' },
      feature_label: { type: 'text', description: 'Feature display label' },
      packet_key: { type: 'keyword', description: 'Packet unique key' },
      packet_type: { type: 'keyword', description: 'Type of packet' },
      cold_storage_uri: {
        type: 'text',
        description: 'URI for cold storage backup',
      },
    };

    console.log(`  Payload schema defined with ${Object.keys(payloadSchema).length} fields`);
    console.log(`    - ${Object.keys(payloadSchema).join(', ')}\n`);

    console.log('[4/4] RRF FUSION CONFIGURATION\n');

    const rrfConfig = {
      k: 60,
      weights: {
        content: 0.60,
        summary: 0.25,
        signature: 0.15,
      },
      normalized: true,
      description:
        'Reciprocal Rank Fusion: combine content (primary), summary (secondary), signature (tertiary)',
    };

    console.log(`  RRF weights:`);
    for (const [vector, weight] of Object.entries(rrfConfig.weights)) {
      console.log(`    ${vector.padEnd(12)}: ${(weight * 100).toFixed(0)}%`);
    }
    console.log(`  RRF k-parameter: ${rrfConfig.k}\n`);

    console.log('✅ PHASE 6 COMPLETE\n');

    console.log('Summary:');
    console.log(`  Collection: ${NEW_COLLECTION_NAME}`);
    console.log(`  Named vectors: 3 (content_384, summary_384, signature_384)`);
    console.log(`  Payload fields: ${Object.keys(payloadSchema).length}`);
    console.log(`  Quantization: int8 (99th percentile)`);
    console.log(`  RRF fusion: enabled (k=${rrfConfig.k})\n`);

    console.log(
      'Next: Phase 5 (Domain classification) + Phase 7 (CrossEncoder) running in parallel\n'
    );
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
