#!/usr/bin/env node

/**
 * Redis → Neo4j embedding synchroniser.
 *
 * Listens for embedding cache events published by Phase43/Phase44 (`embeddings.new` by default),
 * loads the full cache payload from Redis, and upserts nodes/relationships in Neo4j so that
 * recommendations can be generated from the graph.
 */

import { createClient } from "redis";
import neo4j from "neo4j-driver";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const redisChannel = process.env.EMBED_EVENTS_CHANNEL || "embeddings.new";

const neo4jUri = process.env.NEO4J_URI || "neo4j://localhost:7687";
const neo4jUser = process.env.NEO4J_USER || "neo4j";
const neo4jPassword = process.env.NEO4J_PASSWORD || "neo4j";

const driver = neo4j.driver(neo4jUri, neo4j.auth.basic(neo4jUser, neo4jPassword));
const redisClient = createClient({ url: redisUrl });
const redisSubscriber = redisClient.duplicate();

async function ensureConnections() {
  await Promise.all([redisClient.connect(), redisSubscriber.connect()]);
  await driver.verifyConnectivity();
  console.log(`✅ Neo4j connected (${neo4jUri})`);
  console.log(`✅ Redis connected (${redisUrl})`);
}

async function handleEmbeddingEvent(rawMessage) {
  const session = driver.session();

  try {
    const message = JSON.parse(rawMessage);
    const key = `ai:embedding:${message.id}`;
    const cacheEntry = await redisClient.hGetAll(key);

    if (!cacheEntry || !cacheEntry.vector) {
      console.warn(`⚠️ Missing vector payload for ${key}, skipping Neo4j upsert.`);
      return;
    }

    let vector;
    try {
      vector = JSON.parse(cacheEntry.vector).map((value) => Number(value) || 0);
    } catch (err) {
      console.error(`⚠️ Failed to parse embedding vector for ${key}:`, err.message || err);
      return;
    }

    const tags = safeParseJson(cacheEntry.tags) ?? [];
    const params = {
      id: cacheEntry.id,
      summary: cacheEntry.summary || "",
      file: cacheEntry.file || "",
      line: Number(cacheEntry.line) || 0,
      errorCode: cacheEntry.errorCode || "",
      errorMessage: cacheEntry.errorMessage || "",
      vector,
      tags,
      updatedAt: new Date().toISOString(),
    };

    await session.executeWrite(async (tx) => {
      await tx.run(
        `
        MERGE (e:Embedding {id: $id})
        SET
          e.summary = $summary,
          e.file = $file,
          e.line = $line,
          e.errorCode = $errorCode,
          e.errorMessage = $errorMessage,
          e.vector = $vector,
          e.updatedAt = datetime($updatedAt)
        `,
        params
      );

      if (params.file) {
        await tx.run(
          `
          MERGE (f:SourceFile {path: $file})
          MERGE (e:Embedding {id: $id})-[:FROM_FILE]->(f)
          `,
          params
        );
      }

      if (params.errorCode) {
        await tx.run(
          `
          MERGE (code:TypeScriptError {code: $errorCode})
          MERGE (e:Embedding {id: $id})-[:HAS_ERROR_CODE]->(code)
          `,
          params
        );
      }

      if (params.tags.length) {
        await tx.run(
          `
          MATCH (e:Embedding {id: $id})
          WITH e, $tags AS tags
          UNWIND tags AS tag
          MERGE (t:Tag {name: tag})
          MERGE (e)-[:TAGGED_AS]->(t)
          `,
          params
        );
      }
    });

    await redisClient.hSet(key, { neo4jLastSync: params.updatedAt });
    console.log(
      `🧠 Synced embedding ${params.id} (${params.summary.slice(0, 80)}…) to Neo4j graph.`
    );
  } catch (err) {
    console.error("⚠️ Failed to upsert embedding into Neo4j:", err.message || err);
  } finally {
    await session.close();
  }
}

function safeParseJson(value) {
  try {
    if (!value) return null;
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function run() {
  await ensureConnections();
  console.log(`📡 Listening for embedding events on Redis channel '${redisChannel}'`);

  await redisSubscriber.subscribe(redisChannel, handleEmbeddingEvent);
}

async function shutdown(reason) {
  console.log(`\n🛑 Shutting down embedding synchroniser (${reason}).`);
  await redisSubscriber.disconnect().catch(() => {});
  await redisClient.disconnect().catch(() => {});
  await driver.close().catch(() => {});
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (err) => {
  console.error("Unhandled error:", err);
  shutdown("uncaughtException");
});

run().catch((err) => {
  console.error("Failed to start embedding synchroniser:", err.message || err);
  shutdown("startup failure");
});
