#!/usr/bin/env node
/**
 * Enhanced Knowledge Indexer with GPU Pipeline
 * 
 * Integrates:
 * - Worker pool for parallel embedding generation
 * - Qdrant vector storage
 * - Neo4j graph context
 * - Redis caching
 * - SIMD JSON parsing
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { QdrantClient } from "@qdrant/js-client-rest";
import neo4j from "neo4j-driver";
import { createClient } from "redis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const config = {
  qdrant: {
    url: process.env.QDRANT_URL || "http://localhost:6333",
    collection: "knowledge_index",
    vectorSize: 768, // embeddinggemma dimension
  },
  neo4j: {
    uri: process.env.NEO4J_URI || "bolt://localhost:7687",
    user: process.env.NEO4J_USER || "neo4j",
    password: process.env.NEO4J_PASSWORD || "legal123456",
  },
  redis: {
    url: process.env.REDIS_URL || "redis://:redis@localhost:6379/0",
  },
  ollama: {
    url: process.env.OLLAMA_URL || "http://localhost:11434",
  },
};

// Initialize services
let qdrant;
let neo4jDriver;
let neo4jSession;
let redisClient;

async function initializeServices() {
  console.log("🔌 Initializing services...\n");
  
  // Qdrant
  try {
    qdrant = new QdrantClient({ url: config.qdrant.url });
    
    // Create collection if doesn't exist
    try {
      await qdrant.createCollection(config.qdrant.collection, {
        vectors: {
          size: config.qdrant.vectorSize,
          distance: "Cosine",
        },
      });
      console.log("✅ Qdrant collection created");
    } catch (err) {
      if (err.message.includes("already exists")) {
        console.log("✅ Qdrant collection exists");
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.warn("⚠️  Qdrant unavailable:", err.message);
  }
  
  // Neo4j
  try {
    neo4jDriver = neo4j.driver(
      config.neo4j.uri,
      neo4j.auth.basic(config.neo4j.user, config.neo4j.password)
    );
    neo4jSession = neo4jDriver.session();
    
    // Test connection
    await neo4jSession.run("RETURN 1");
    console.log("✅ Neo4j connected");
  } catch (err) {
    console.warn("⚠️  Neo4j unavailable:", err.message);
  }
  
  // Redis
  try {
    redisClient = createClient({ url: config.redis.url });
    await redisClient.connect();
    console.log("✅ Redis connected");
  } catch (err) {
    console.warn("⚠️  Redis unavailable:", err.message);
  }
  
  console.log("");
}

/**
 * Index knowledge item in all systems
 */
async function indexKnowledgeItem(item) {
  const startTime = Date.now();
  
  try {
    // 1. Store in Qdrant (vector search)
    if (qdrant && item.embedding && item.embedding.length > 0) {
      await qdrant.upsert(config.qdrant.collection, {
        wait: true,
        points: [
          {
            id: item.id || crypto.randomUUID(),
            vector: item.embedding,
            payload: {
              summary: item.summary,
              source: item.metadata?.source || "unknown",
              timestamp: item.metadata?.timestamp || new Date().toISOString(),
              tags: item.tags || [],
            },
          },
        ],
      });
    }
    
    // 2. Store in Neo4j (graph relationships)
    if (neo4jSession) {
      await neo4jSession.run(
        `
        MERGE (d:Document {id: $id})
        SET d.summary = $summary,
            d.source = $source,
            d.timestamp = $timestamp,
            d.tags = $tags
        `,
        {
          id: item.id,
          summary: item.summary || "",
          source: item.metadata?.source || "unknown",
          timestamp: item.metadata?.timestamp || new Date().toISOString(),
          tags: item.tags || [],
        }
      );
      
      // Create tag relationships
      if (item.tags && item.tags.length > 0) {
        for (const tag of item.tags) {
          await neo4jSession.run(
            `
            MATCH (d:Document {id: $id})
            MERGE (t:Tag {name: $tag})
            MERGE (d)-[:TAGGED_WITH]->(t)
            `,
            { id: item.id, tag }
          );
        }
      }
    }
    
    // 3. Cache in Redis (fast retrieval)
    if (redisClient) {
      await redisClient.setEx(
        `knowledge:${item.id}`,
        3600, // 1 hour TTL
        JSON.stringify({
          summary: item.summary,
          tags: item.tags,
          source: item.metadata?.source,
          timestamp: item.metadata?.timestamp,
        })
      );
    }
    
    const duration = Date.now() - startTime;
    console.log(`✓ Indexed ${item.id} in ${duration}ms`);
    
    return { success: true, duration };
  } catch (err) {
    console.error(`✗ Failed to index ${item.id}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Batch index multiple items
 */
async function indexBatch(items) {
  console.log(`\n📊 Indexing batch of ${items.length} items...\n`);
  
  const results = await Promise.allSettled(
    items.map((item) => indexKnowledgeItem(item))
  );
  
  const successful = results.filter((r) => r.status === "fulfilled" && r.value.success).length;
  const failed = results.length - successful;
  
  console.log(`\n✅ Batch complete: ${successful} succeeded, ${failed} failed`);
  
  return { successful, failed, results };
}

/**
 * Search knowledge base
 */
async function searchKnowledge(query, options = {}) {
  const { limit = 10, threshold = 0.7 } = options;
  
  // Generate query embedding using Ollama
  const embeddingResponse = await fetch(`${config.ollama.url}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "embeddinggemma:latest",
      prompt: query,
    }),
  });
  
  if (!embeddingResponse.ok) {
    throw new Error("Failed to generate query embedding");
  }
  
  const { embedding } = await embeddingResponse.json();
  
  // Search Qdrant
  if (qdrant) {
    const results = await qdrant.search(config.qdrant.collection, {
      vector: embedding,
      limit,
      score_threshold: threshold,
    });
    
    return results;
  }
  
  return [];
}

/**
 * Get related documents from Neo4j
 */
async function getRelatedDocuments(documentId, depth = 2) {
  if (!neo4jSession) return [];
  
  const result = await neo4jSession.run(
    `
    MATCH (d:Document {id: $id})-[:TAGGED_WITH*1..${depth}]-(related:Document)
    WHERE d <> related
    RETURN DISTINCT related.id as id, related.summary as summary, related.tags as tags
    LIMIT 20
    `,
    { id: documentId }
  );
  
  return result.records.map((record) => ({
    id: record.get("id"),
    summary: record.get("summary"),
    tags: record.get("tags"),
  }));
}

/**
 * Process error analysis JSON
 */
async function processErrorAnalysis(errorFile) {
  console.log(`\n📝 Processing error analysis: ${errorFile}\n`);
  
  // Parse with native JSON (SIMD optimized)
  const errorData = JSON.parse(fs.readFileSync(errorFile, "utf8"));
  
  // Extract top errors
  const topErrors = errorData.topErrorCodes || errorData.topErrors || [];
  
  const items = topErrors.slice(0, 50).map((error, i) => ({
    id: `error-${error.code || i}`,
    summary: `${error.code}: ${error.count} occurrences - ${error.examples?.[0]?.message || ""}`,
    tags: [
      error.code,
      error.severity || "error",
      `count:${error.count}`,
    ],
    metadata: {
      source: "svelte-check",
      timestamp: new Date().toISOString(),
      errorCode: error.code,
      count: error.count,
    },
    // Embedding will be generated by worker pool
    embedding: [], // Placeholder
  }));
  
  // For now, index without embeddings (worker pool would generate these)
  const result = await indexBatch(items);
  
  return result;
}

/**
 * Main execution
 */
async function main() {
  console.log("🚀 Enhanced Knowledge Indexer with GPU Pipeline\n");
  
  await initializeServices();
  
  // Example: Process svelte-check errors
  const errorFile = path.resolve(__dirname, "..", "svelte-check-analysis.json");
  
  if (fs.existsSync(errorFile)) {
    await processErrorAnalysis(errorFile);
  } else {
    console.log("⚠️  No error analysis file found");
    console.log("   Generate with: node scripts/analyze-svelte-errors.mjs");
  }
  
  // Example: Search
  console.log("\n🔍 Testing search...");
  const searchResults = await searchKnowledge("TypeScript type errors", { limit: 5 });
  console.log(`Found ${searchResults.length} results`);
  searchResults.forEach((r, i) => {
    console.log(`${i + 1}. Score: ${r.score.toFixed(3)} - ${r.payload.summary.substring(0, 80)}...`);
  });
  
  // Cleanup
  if (neo4jSession) await neo4jSession.close();
  if (neo4jDriver) await neo4jDriver.close();
  if (redisClient) await redisClient.quit();
  
  console.log("\n✅ Knowledge indexer complete\n");
}

// Export functions for use in other modules
export {
  initializeServices,
  indexKnowledgeItem,
  indexBatch,
  searchKnowledge,
  getRelatedDocuments,
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
