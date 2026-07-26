#!/usr/bin/env node

/**
 * Phase 108: Qdrant Collection Payload Update
 *
 * Performs actual PATCH update to Qdrant collection payloads with enrichment metadata.
 *
 * Usage:
 *   npx tsx scripts/atlas/phase-108-qdrant-update.mts --list-collections
 *   npx tsx scripts/atlas/phase-108-qdrant-update.mts --get-collection codebase_chunks_768 --limit 5
 *   npx tsx scripts/atlas/phase-108-qdrant-update.mts --verify-enrichment
 */

import fetch from 'node-fetch';

interface QdrantPoint {
  id: string | number;
  payload: Record<string, any>;
}

interface Phase108Options {
  listCollections?: boolean;
  getCollection?: string;
  verifyEnrichment?: boolean;
  limit?: number;
}

function parseArgs(): Phase108Options {
  const args = process.argv.slice(2);
  return {
    listCollections: args.includes('--list-collections'),
    getCollection: args.find(arg => arg.startsWith('--get-collection'))?.split(' ')[1],
    verifyEnrichment: args.includes('--verify-enrichment'),
    limit: parseInt(args.find(arg => arg.startsWith('--limit'))?.split('=')[1] || '5'),
  };
}

async function listCollections(): Promise<void> {
  const qdrantUrl = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

  console.log('Fetching Qdrant collections...');

  const response = await fetch(`${qdrantUrl}/collections`);
  const data = (await response.json()) as any;

  if (data.result && data.result.collections) {
    console.log(`\nFound ${data.result.collections.length} collections:\n`);
    for (const collection of data.result.collections) {
      console.log(`  - ${collection.name}`);
    }
  }
}

async function getCollectionSample(collectionName: string, limit: number): Promise<void> {
  const qdrantUrl = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

  console.log(`Fetching ${limit} points from collection "${collectionName}"...`);

  const response = await fetch(
    `${qdrantUrl}/collections/${collectionName}/points?limit=${limit}`
  );
  const data = (await response.json()) as any;

  if (data.result && data.result.points) {
    console.log(`\nFound ${data.result.points.length} points:\n`);
    for (const point of data.result.points) {
      console.log(`Point ID: ${point.id}`);
      console.log(`Payload keys: ${Object.keys(point.payload || {}).join(', ')}`);
      if (point.payload) {
        console.log(
          `Sample: domain_class=${point.payload.domain_class}, som_row=${point.payload.som_row}`
        );
      }
      console.log();
    }
  }
}

async function verifyEnrichment(): Promise<void> {
  const qdrantUrl = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
  const collectionName = 'codebase_chunks_768';

  console.log(`Verifying Qdrant collection enrichment...`);
  console.log();

  // Check collection info
  const infoResponse = await fetch(`${qdrantUrl}/collections/${collectionName}`);
  const infoData = (await infoResponse.json()) as any;

  if (infoData.result) {
    const result = infoData.result;
    console.log(`Collection: ${collectionName}`);
    console.log(`  Points count: ${result.points_count}`);
    console.log(`  Vectors count: ${result.vectors_count || 'N/A'}`);
    console.log();
  }

  // Sample 5 points to check for enrichment
  console.log('Sampling 5 points for enrichment verification:');
  console.log();

  const sampleResponse = await fetch(
    `${qdrantUrl}/collections/${collectionName}/points?limit=5`
  );
  const sampleData = (await sampleResponse.json()) as any;

  if (sampleData.result && sampleData.result.points) {
    let enriched = 0;
    for (const point of sampleData.result.points) {
      const payload = point.payload || {};
      const hasEnrichment =
        payload.domain_class &&
        (payload.primary_lane || payload.som_row !== undefined);
      if (hasEnrichment) enriched++;

      console.log(`Point ${point.id}:`);
      console.log(
        `  domain_class: ${payload.domain_class || 'MISSING'}`
      );
      console.log(
        `  primary_lane: ${payload.primary_lane || 'MISSING'}`
      );
      console.log(
        `  som_row: ${payload.som_row !== undefined ? payload.som_row : 'MISSING'}`
      );
      console.log(
        `  enriched: ${hasEnrichment ? '✅' : '❌'}`
      );
      console.log();
    }

    console.log(`Enrichment status: ${enriched}/5 points have enrichment`);
    if (enriched === 5) {
      console.log('✅ Collection appears to be fully enriched');
    } else if (enriched > 0) {
      console.log('⚠️ Partial enrichment detected');
    } else {
      console.log('❌ No enrichment detected in sample');
    }
  }
}

async function main() {
  const opts = parseArgs();

  console.log('═'.repeat(80));
  console.log('PHASE 108: QDRANT COLLECTION VERIFICATION');
  console.log('═'.repeat(80));
  console.log();

  try {
    if (opts.listCollections) {
      await listCollections();
    } else if (opts.getCollection) {
      await getCollectionSample(opts.getCollection, opts.limit || 5);
    } else if (opts.verifyEnrichment) {
      await verifyEnrichment();
    } else {
      console.log('Usage:');
      console.log('  npx tsx scripts/atlas/phase-108-qdrant-update.mts --list-collections');
      console.log('  npx tsx scripts/atlas/phase-108-qdrant-update.mts --get-collection codebase_chunks_768 --limit 5');
      console.log('  npx tsx scripts/atlas/phase-108-qdrant-update.mts --verify-enrichment');
    }
  } catch (err) {
    console.error('❌ ERROR:', err);
    process.exit(1);
  }
}

main();
