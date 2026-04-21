#!/usr/bin/env node
/**
 * Phase46 Indexer - Push cached embeddings into Neo4j relationships.
 *
 * This script scans the phase46_adapter cache directory, loads all cached
 * documents with their embeddings, and creates/updates Neo4j graph relationships
 * for similarity-based error code linking and document clustering.
 *
 * Prerequisites:
 *  - Neo4j database running with APOC plugin
 *  - phase46_adapter service has processed documents
 *  - Redis cache contains embeddings from adapter
 */

import 'dotenv/config.js';
import fs from 'fs';
import path from 'path';
import neo4j from 'neo4j-driver';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', '..', 'python_codebase', 'python-services', 'phase46_adapter', 'cache', 'phase46_adapter');
const MANIFEST_PATH = path.join(CACHE_DIR, 'manifest.json');

const REQUIRED_ENV = ['NEO4J_URI', 'NEO4J_USER'];
const OPTIONAL_ENV = ['NEO4J_PASS', 'NEO4J_PASSWORD', 'REDIS_URL'];

function assertEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  const hasNeo4jPassword = process.env.NEO4J_PASS || process.env.NEO4J_PASSWORD;
  if (!hasNeo4jPassword) {
    console.error('Missing Neo4j password. Set NEO4J_PASS or NEO4J_PASSWORD.');
    process.exit(1);
  }

  console.log('✅ Environment variables validated');
}

async function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.log('⚠️ No manifest file found, no documents to index');
    return {};
  }

  try {
    const data = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('❌ Failed to load manifest:', err.message);
    return {};
  }
}

async function createDocumentNodes(driver, manifest) {
  const session = driver.session();
  let indexed = 0;

  try {
    for (const [docId, info] of Object.entries(manifest)) {
      const cachePath = path.join(CACHE_DIR, `${docId}.json`);
      if (!fs.existsSync(cachePath)) {
        console.log(`⚠️ Cache file missing for ${docId}, skipping`);
        continue;
      }

      const docData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));

      // Create document node with metadata
      await session.run(
        `
        MERGE (d:Document {id: $id})
        SET d.title = $title,
            d.source = $source,
            d.lang = $lang,
            d.fetchedAt = $fetchedAt,
            d.chunkCount = $chunkCount,
            d.checksum = $checksum,
            d.adapter = $adapter
        `,
        {
          id: docId,
          title: docData.title || docId,
          source: docData.source || 'unknown',
          lang: docData.lang || 'unknown',
          fetchedAt: docData.fetched_at,
          chunkCount: docData.chunks?.length || 0,
          checksum: docData.checksum,
          adapter: docData.metadata?.adapter || 'phase46'
        }
      );

      // Create chunk nodes with embeddings
      if (docData.chunks) {
        for (const chunk of docData.chunks) {
          await session.run(
            `
            MATCH (d:Document {id: $docId})
            MERGE (c:Chunk {
              id: $chunkId,
              documentId: $docId,
              index: $index
            })
            SET c.text = $text,
                c.tokensEstimate = $tokensEstimate,
                c.embeddingKey = $embeddingKey
            MERGE (d)-[:HAS_CHUNK]->(c)
            `,
            {
              docId,
              chunkId: `${docId}:chunk:${chunk.index}`,
              index: chunk.index,
              text: chunk.text,
              tokensEstimate: chunk.tokens_estimate || 0,
              embeddingKey: chunk.embedding_key
            }
          );
        }
      }

      // Create extraction nodes
      if (docData.extractions) {
        for (const extraction of docData.extractions) {
          if (extraction.extraction_class === 'error_code') {
            await session.run(
              `
              MATCH (d:Document {id: $docId})
              MERGE (e:ErrorCode {code: $code})
              MERGE (d)-[:MENTIONS_ERROR {text: $text, offsetStart: $offsetStart, offsetEnd: $offsetEnd}]->(e)
              `,
              {
                docId,
                code: extraction.extraction_text,
                text: extraction.extraction_text,
                offsetStart: extraction.attributes?.offset_start || 0,
                offsetEnd: extraction.attributes?.offset_end || 0
              }
            );
          }
        }
      }

      indexed++;
      if (indexed % 10 === 0) {
        console.log(`📄 Indexed ${indexed} documents...`);
      }
    }

    console.log(`✅ Created/updated ${indexed} document nodes in Neo4j`);
  } finally {
    await session.close();
  }
}

async function createSimilarityRelationships(driver) {
  const session = driver.session();

  try {
    // Create similarity relationships between error codes based on co-occurrence
    const result = await session.run(
      `
      MATCH (e1:ErrorCode)<-[:MENTIONS_ERROR]-(d:Document)-[:MENTIONS_ERROR]->(e2:ErrorCode)
      WHERE e1 <> e2 AND e1.code < e2.code
      WITH e1, e2, count(d) as coOccurrences
      MERGE (e1)-[r:SIMILAR_TO {weight: coOccurrences}]-(e2)
      RETURN count(r) as relationshipsCreated
      `
    );

    const relationshipsCreated = result.records[0]?.get('relationshipsCreated') || 0;
    console.log(`🔗 Created ${relationshipsCreated} similarity relationships between error codes`);

  } finally {
    await session.close();
  }
}

async function main() {
  console.log('🚀 Phase46 Indexer starting...');

  assertEnv();

  const driver = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(
      process.env.NEO4J_USER,
      process.env.NEO4J_PASS || process.env.NEO4J_PASSWORD
    )
  );

  try {
    // Test connection
    await driver.verifyConnectivity();
    console.log('✅ Connected to Neo4j');

    // Load manifest
    const manifest = await loadManifest();
    const docCount = Object.keys(manifest).length;
    console.log(`📋 Found ${docCount} documents in cache`);

    if (docCount === 0) {
      console.log('ℹ️ No documents to index, exiting');
      return;
    }

    // Create document nodes
    await createDocumentNodes(driver, manifest);

    // Create similarity relationships
    await createSimilarityRelationships(driver);

    console.log('🎉 Phase46 indexing complete!');

  } catch (err) {
    console.error('❌ Indexing failed:', err);
    process.exit(1);
  } finally {
    await driver.close();
  }
}

main().catch((err) => {
  console.error('💥 Unhandled error:', err);
  process.exit(1);
});
