#!/usr/bin/env tsx
// Vector Data Sync Script
// Syncs existing database documents with vector embeddings and Qdrant
import { db, isPostgreSQL } from "../src/lib/server/db/index.js";
import { qdrant } from "../src/lib/server/vector/qdrant.js";
import { syncDocumentEmbeddings } from "../src/lib/server/ai/embeddings.js";
import { generateEmbedding } from "../src/lib/server/ai/embeddings-simple.js";
import { sql } from "drizzle-orm";
import { config } from "dotenv";

// Load environment variables
config();

interface SyncStats {
  total: number;
  updated: number;
  errors: number;
  skipped: number;
}

async function syncEmbeddings(
  type: "cases" | "evidence" | "documents",
  batchSize: number = 10,
  limit?: number,
): Promise<SyncStats> {
  console.log(`\n📋 Syncing ${type} embeddings...`);

  const stats: SyncStats = {
    total: 0,
    updated: 0,
    errors: 0,
    skipped: 0,
  };

  try {
    let query: string;
    let updateQuery: (id: string, embedding: number[]) => Promise<void>;

    // Define queries based on type
    switch (type) {
      case "cases":
        query = `
          SELECT id, title, description, notes 
          FROM cases 
          WHERE embedding IS NULL OR array_length(embedding, 1) IS NULL
          ${limit ? `LIMIT ${limit}` : ""}
        `;
        updateQuery = async (id: string, embedding: number[]) => {
          await db.execute(sql`
            UPDATE cases 
            SET embedding = ${embedding}::vector, updated_at = NOW() 
            WHERE id = ${id}
          `);
        };
        break;

      case "evidence":
        query = `
          SELECT id, title, description, content 
          FROM evidence 
          WHERE embedding IS NULL OR array_length(embedding, 1) IS NULL
          ${limit ? `LIMIT ${limit}` : ""}
        `;
        updateQuery = async (id: string, embedding: number[]) => {
          await db.execute(sql`
            UPDATE evidence 
            SET embedding = ${embedding}::vector, updated_at = NOW() 
            WHERE id = ${id}
          `);
        };
        break;

      case "documents":
        query = `
          SELECT id, title, content, metadata 
          FROM documents 
          WHERE embedding IS NULL OR array_length(embedding, 1) IS NULL
          ${limit ? `LIMIT ${limit}` : ""}
        `;
        updateQuery = async (id: string, embedding: number[]) => {
          await db.execute(sql`
            UPDATE documents 
            SET embedding = ${embedding}::vector, updated_at = NOW() 
            WHERE id = ${id}
          `);
        };
        break;

      default:
        throw new Error(`Unknown sync type: ${type}`);
    }

    // Get documents to sync
    const result = await db.execute(sql.raw(query));
    const documents = result.rows || [];
    stats.total = documents.length;

    if (stats.total === 0) {
      console.log(`   ✅ All ${type} already have embeddings`);
      return stats;
    }

    console.log(`   Found ${stats.total} ${type} without embeddings`);

    // Process in batches
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      console.log(
        `   Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(documents.length / batchSize)}...`,
      );

      for (const doc of batch) {
        try {
          // Create text content for embedding
          let textContent = "";
          switch (type) {
            case "cases":
              textContent =
                `${doc.title || ""} ${doc.description || ""} ${doc.notes || ""}`.trim();
              break;
            case "evidence":
              textContent =
                `${doc.title || ""} ${doc.description || ""} ${doc.content || ""}`.trim();
              break;
            case "documents":
              textContent = `${doc.title || ""} ${doc.content || ""}`.trim();
              break;
          }

          if (!textContent) {
            console.log(`     ⚠️  Skipping ${doc.id} - no content`);
            stats.skipped++;
            continue;
          }

          // Generate embedding
          const embedding = await generateEmbedding(textContent);

          // Update PostgreSQL
          await updateQuery(doc.id, embedding);

          // Also store in Qdrant if available
          if (await qdrant.healthCheck()) {
            await qdrant.upsertPoints(type, [
              {
                id: doc.id,
                vector: embedding,
                payload: {
                  title: doc.title || "",
                  content: textContent.substring(0, 1000), // Truncate for storage
                  type,
                  updated_at: new Date().toISOString(),
                },
              },
            ]);
          }

          stats.updated++;
        } catch (error) {
          console.error(`     ❌ Error processing ${doc.id}:`, error);
          stats.errors++;
        }
      }

      // Small delay between batches to avoid rate limits
      if (i + batchSize < documents.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    console.log(
      `   ✅ Completed: ${stats.updated} updated, ${stats.errors} errors, ${stats.skipped} skipped`,
    );
    return stats;
  } catch (error) {
    console.error(`❌ Failed to sync ${type}:`, error);
    throw error;
  }
}

async function main() {
  console.log("🔄 Starting Vector Data Sync...\n");

  try {
    // Check database connection
    console.log("1. Testing database connection...");
    await db.execute(sql`SELECT 1`);
    console.log("✅ Database connected");

    // Check if we're using PostgreSQL
    if (!isPostgreSQL()) {
      console.log(
        "⚠️  SQLite detected - vector embeddings will not be stored in database",
      );
      console.log("   Embeddings will only be stored in Qdrant if available");
    }

    // Check Qdrant availability
    console.log("\n2. Testing Qdrant connection...");
    const qdrantHealthy = await qdrant.healthCheck();
    if (qdrantHealthy) {
      console.log("✅ Qdrant available");
    } else {
      console.log(
        "⚠️  Qdrant not available - embeddings will only be stored in PostgreSQL",
      );
    }

    // Test embedding generation
    console.log("\n3. Testing embedding generation...");
    const testEmbedding = await generateEmbedding("test");
    console.log(
      `✅ Embedding service working (${testEmbedding.length} dimensions)`,
    );

    // Parse command line arguments
    const args = process.argv.slice(2);
    const syncType =
      (args.find((arg) =>
        ["cases", "evidence", "documents", "all"].includes(arg),
      ) as "cases" | "evidence" | "documents" | "all") || "all";
    const batchSize = parseInt(
      args.find((arg) => arg.startsWith("--batch="))?.split("=")[1] || "10",
    );
    const limit = args.find((arg) => arg.startsWith("--limit="))?.split("=")[1];
    const limitNum = limit ? parseInt(limit) : undefined;

    console.log(
      `\n4. Starting sync (type: ${syncType}, batch: ${batchSize}${limitNum ? `, limit: ${limitNum}` : ""})...`,
    );

    const totalStats: SyncStats = {
      total: 0,
      updated: 0,
      errors: 0,
      skipped: 0,
    };

    // Sync based on type
    if (syncType === "all") {
      for (const type of ["cases", "evidence", "documents"] as const) {
        try {
          const stats = await syncEmbeddings(type, batchSize, limitNum);
          totalStats.total += stats.total;
          totalStats.updated += stats.updated;
          totalStats.errors += stats.errors;
          totalStats.skipped += stats.skipped;
        } catch (error) {
          console.error(`Failed to sync ${type}:`, error);
          totalStats.errors++;
        }
      }
    } else {
      const stats = await syncEmbeddings(syncType, batchSize, limitNum);
      totalStats.total = stats.total;
      totalStats.updated = stats.updated;
      totalStats.errors = stats.errors;
      totalStats.skipped = stats.skipped;
    }

    // Summary
    console.log("\n🎉 Sync Complete!\n");
    console.log("📊 Summary:");
    console.log(`   Total documents: ${totalStats.total}`);
    console.log(`   Successfully updated: ${totalStats.updated}`);
    console.log(`   Errors: ${totalStats.errors}`);
    console.log(`   Skipped: ${totalStats.skipped}\n`);

    if (totalStats.updated > 0) {
      console.log("✅ Vector search is now ready to use!");
      console.log("   Test with: POST /api/search/vector");
      console.log("   Or try the Ask AI feature in the web interface");
    }
  } catch (error) {
    console.error("\n❌ Sync failed:", error);
    console.log("\nTroubleshooting:");
    console.log("  • Ensure database is running and accessible");
    console.log("  • Check your .env configuration");
    console.log(
      "  • Verify embedding service is working (OpenAI API key, etc.)",
    );
    process.exit(1);
  }
}

// Show usage if help requested
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("Vector Data Sync Script\n");
  console.log("Usage: npm run vector:sync [type] [options]\n");
  console.log("Types:");
  console.log("  cases      - Sync case documents only");
  console.log("  evidence   - Sync evidence items only");
  console.log("  documents  - Sync general documents only");
  console.log("  all        - Sync all document types (default)\n");
  console.log("Options:");
  console.log("  --batch=N    - Process N documents per batch (default: 10)");
  console.log("  --limit=N    - Limit to N documents total");
  console.log("  --help, -h   - Show this help\n");
  console.log("Examples:");
  console.log("  npm run vector:sync");
  console.log("  npm run vector:sync cases --batch=5");
  console.log("  npm run vector:sync evidence --limit=100");
  process.exit(0);
}

main().catch(console.error);
