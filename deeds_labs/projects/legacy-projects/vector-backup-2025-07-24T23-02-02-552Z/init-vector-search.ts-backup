// Vector search initialization script
// Sets up Qdrant collections and PostgreSQL vector indexes
import { env } from "$env/dynamic/private";
import { qdrant } from "../src/lib/server/vector/qdrant";
import { db, isPostgreSQL } from "../src/lib/server/db";
import { sql } from "drizzle-orm";

async function initializeVectorSearch() {
  console.log("🔍 Initializing vector search capabilities...");

  // Check if we're in the right environment
  if (!isPostgreSQL()) {
    console.log("⚠️  Vector search requires PostgreSQL. ");
    console.log(
      "💡 Switch to testing or production environment to use vector search.",
    );
    return;
  }

  try {
    // Initialize Qdrant collections
    console.log("🗂️  Setting up Qdrant collections...");
    await qdrant.initializeCollections();

    // Check Qdrant health
    const qdrantHealthy = await qdrant.isHealthy();
    if (qdrantHealthy) {
      console.log("✅ Qdrant is healthy and ready");
    } else {
      console.log(
        "⚠️  Qdrant is not available. Vector search will use pgvector only.",
      );
    }

    // Create vector indexes if they don't exist (PostgreSQL/pgvector)
    console.log("📊 Setting up PostgreSQL vector indexes...");

    try {
      // Cases vector indexes
      await db.execute(sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS cases_title_embedding_idx 
        ON cases USING hnsw (title_embedding vector_cosine_ops)
      `);

      await db.execute(sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS cases_description_embedding_idx 
        ON cases USING hnsw (description_embedding vector_cosine_ops)
      `);

      // Evidence vector indexes
      await db.execute(sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS evidence_title_embedding_idx 
        ON evidence USING hnsw (title_embedding vector_cosine_ops)
      `);

      await db.execute(sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS evidence_content_embedding_idx 
        ON evidence USING hnsw (content_embedding vector_cosine_ops)
      `);

      console.log("✅ Vector indexes created successfully");
    } catch (error) {
      console.log(
        "ℹ️  Vector indexes may already exist or pgvector extension is not installed",
      );
      console.log(
        "   This is normal if running for the first time or in development mode",
      );
    }

    // Test vector search functionality
    console.log("🧪 Testing vector search functionality...");

    // Simple test to verify embeddings work
    const { generateEmbedding } = await import(
      "../src/lib/server/ai/embeddings-simple"
    );
    const testEmbedding = await generateEmbedding("test legal case");

    if (testEmbedding && testEmbedding.length === 1536) {
      console.log("✅ Embedding generation is working correctly");
    } else {
      console.log("⚠️  Embedding generation may not be configured properly");
      console.log("   Check your OPENAI_API_KEY in the environment file");
    }

    console.log("");
    console.log("🎉 Vector search initialization complete!");
    console.log("");
    console.log("📋 Available search endpoints:");
    console.log("  GET /api/search/cases?q=query&type=semantic");
    console.log("  GET /api/search/cases?q=query&type=hybrid");
    console.log("  GET /api/search/evidence?q=query&mode=content");
    console.log("");
    console.log("🔧 Search types:");
    console.log("  text     - Fast SQL-based search");
    console.log("  semantic - AI-powered similarity search");
    console.log("  hybrid   - Combines text and semantic results");
    console.log("");
  } catch (error) {
    console.error("❌ Vector search initialization failed:", error);
    console.log("");
    console.log("🛠️  Troubleshooting:");
    console.log("  1. Ensure PostgreSQL is running with pgvector extension");
    console.log("  2. Check that Qdrant is running (optional)");
    console.log("  3. Verify OpenAI API key is configured");
    console.log("  4. Run database migrations: npm run db:push:test");
  }
}

// Run if called directly
if (import.meta.url === new URL(process.argv[1], "file://").href) {
  initializeVectorSearch()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Initialization failed:", error);
      process.exit(1);
    });
}

export { initializeVectorSearch };
