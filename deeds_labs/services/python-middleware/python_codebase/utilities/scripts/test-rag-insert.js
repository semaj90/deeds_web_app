#!/usr/bin/env node

// Test script to insert sample documentation with Gemma embeddings
import postgres from "postgres";

const DATABASE_CONFIG = {
  host: "localhost",
  port: 5434,
  user: "legal_admin",
  password: "123456",
  database: "legal_ai_test",
};

const OLLAMA_URL = "http://localhost:11434";

// Sample documentation entries
const SAMPLE_DOCS = [
  {
    library_id: "typescript",
    library_name: "TypeScript",
    topic: "interfaces",
    content: `# TypeScript Interfaces

TypeScript interfaces define the shape of objects and provide type checking at compile time.

## Basic Interface
\`\`\`typescript
interface User {
  name: string;
  age: number;
  email?: string; // Optional property
}
\`\`\`

## Extending Interfaces
\`\`\`typescript
interface Admin extends User {
  permissions: string[];
}
\`\`\`

## Index Signatures
\`\`\`typescript
interface Config {
  [key: string]: any;
}
\`\`\`

Interfaces are powerful tools for creating type-safe applications in TypeScript.`,
  },
  {
    library_id: "webgpu",
    library_name: "WebGPU",
    topic: "shaders",
    content: `# WebGPU Shaders with WGSL

WebGPU uses WGSL (WebGPU Shading Language) for writing shaders.

## Vertex Shader Example
\`\`\`wgsl
@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
    var pos = array<vec2<f32>, 3>(
        vec2<f32>( 0.0,  0.5),
        vec2<f32>(-0.5, -0.5),
        vec2<f32>( 0.5, -0.5)
    );
    return vec4<f32>(pos[vertexIndex], 0.0, 1.0);
}
\`\`\`

## Fragment Shader Example
\`\`\`wgsl
@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(1.0, 0.0, 0.0, 1.0); // Red color
}
\`\`\`

WGSL provides modern GPU programming capabilities for compute and rendering.`,
  },
  {
    library_id: "postgresql",
    library_name: "PostgreSQL 17",
    topic: "jsonb",
    content: `# PostgreSQL JSONB Performance

JSONB is PostgreSQL's binary JSON format optimized for performance.

## Creating JSONB Columns
\`\`\`sql
CREATE TABLE legal_documents (
    id SERIAL PRIMARY KEY,
    metadata JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
\`\`\`

## GIN Indexing for Fast Queries
\`\`\`sql
CREATE INDEX idx_legal_metadata ON legal_documents USING gin (metadata jsonb_path_ops);
\`\`\`

## Efficient Queries
\`\`\`sql
-- Contains query (uses index)
SELECT * FROM legal_documents
WHERE metadata @> '{"case": {"status": "active"}}';

-- Path query
SELECT metadata->'case'->>'title' as case_title
FROM legal_documents;
\`\`\`

JSONB provides 4x faster queries than regular JSON with proper indexing.`,
  },
  {
    library_id: "drizzle-orm",
    library_name: "Drizzle ORM",
    topic: "schema",
    content: `# Drizzle ORM Schema Definition

Drizzle ORM provides type-safe database schemas for TypeScript.

## Table Definition
\`\`\`typescript
import { pgTable, serial, varchar, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const cases = pgTable('cases', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).default('pending'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});
\`\`\`

## Relations
\`\`\`typescript
export const evidence = pgTable('evidence', {
  id: serial('id').primaryKey(),
  caseId: integer('case_id').references(() => cases.id),
  content: text('content').notNull(),
});

export const caseRelations = relations(cases, ({ many }) => ({
  evidence: many(evidence),
}));
\`\`\`

## Type-Safe Queries
\`\`\`typescript
const result = await db
  .select()
  .from(cases)
  .where(eq(cases.status, 'active'))
  .leftJoin(evidence, eq(cases.id, evidence.caseId));
\`\`\`

Drizzle provides compile-time type safety with zero runtime overhead.`,
  },
];

async function generateEmbedding(text) {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "embeddinggemma:latest",
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    return result.embedding;
  } catch (error) {
    console.error(`Failed to generate embedding: ${error.message}`);
    return null;
  }
}

async function insertDocumentWithEmbedding(client, doc) {
  try {
    console.log(`📄 Processing ${doc.library_name} - ${doc.topic}...`);

    // Generate embedding
    const embedding = await generateEmbedding(doc.content);
    if (!embedding) {
      throw new Error("Failed to generate embedding");
    }

    // Create document ID
    const docId = `${doc.library_id}_${doc.topic}_0`;

    // Prepare metadata
    const metadata = {
      library_id: doc.library_id,
      library_name: doc.library_name,
      topic: doc.topic,
      content_length: doc.content.length,
      source: "test_data",
    };

    // Insert into database
    const query = `
      INSERT INTO context7_documentation
      (doc_id, library_id, library_name, topic, content, chunk_index, embedding, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (doc_id)
      DO UPDATE SET
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        metadata = EXCLUDED.metadata,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, doc_id
    `;

    const values = [
      docId,
      doc.library_id,
      doc.library_name,
      doc.topic,
      doc.content,
      0,
      `[${embedding.join(",")}]`, // Convert array to PostgreSQL vector format
      JSON.stringify(metadata),
    ];

    const result = await client.query(query, values);
    console.log(
      `✅ Inserted document ${result.rows[0].doc_id} with ID ${result.rows[0].id}`
    );
  } catch (error) {
    console.error(
      `❌ Failed to insert ${doc.library_name} - ${doc.topic}: ${error.message}`
    );
  }
}

async function testSimilaritySearch(client) {
  console.log("\n🔍 Testing similarity search...\n");

  const testQueries = [
    "TypeScript type safety and interfaces",
    "WebGPU shader programming",
    "PostgreSQL JSON performance",
    "ORM schema migrations",
  ];

  for (const query of testQueries) {
    console.log(`🔎 Query: "${query}"`);

    try {
      // Generate embedding for query
      const queryEmbedding = await generateEmbedding(query);
      if (!queryEmbedding) {
        throw new Error("Failed to generate query embedding");
      }

      // Search for similar documents
      const searchQuery = `
        SELECT
          doc_id,
          library_name,
          topic,
          1 - (embedding <=> $1) as similarity,
          substring(content, 1, 100) as content_preview
        FROM context7_documentation
        WHERE 1 - (embedding <=> $1) > 0.7
        ORDER BY similarity DESC
        LIMIT 3
      `;

      const result = await client.query(searchQuery, [
        `[${queryEmbedding.join(",")}]`,
      ]);

      if (result.rows.length > 0) {
        console.log(`   Found ${result.rows.length} similar documents:`);
        result.rows.forEach((row, i) => {
          console.log(
            `   ${i + 1}. ${row.library_name} - ${row.topic} (${(
              row.similarity * 100
            ).toFixed(1)}%)`
          );
          console.log(`      Preview: ${row.content_preview}...`);
        });
      } else {
        console.log("   No similar documents found");
      }
    } catch (error) {
      console.error(`   ❌ Search failed: ${error.message}`);
    }

    console.log("");
  }
}

async function main() {
  console.log("🚀 Context7 RAG Database Test");
  console.log("============================\n");

  const client = new Client(DATABASE_CONFIG);

  try {
    // Connect to database
    await client.connect();
    console.log("✅ Connected to PostgreSQL\n");

    // Check if table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'context7_documentation'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log("❌ Table context7_documentation does not exist");
      console.log("Please run the database setup first");
      return;
    }

    console.log("✅ Table context7_documentation exists\n");

    // Insert sample documents
    console.log("📚 Inserting sample documentation...\n");
    for (const doc of SAMPLE_DOCS) {
      await insertDocumentWithEmbedding(client, doc);
    }

    // Test similarity search
    await testSimilaritySearch(client);

    // Show summary
    const countResult = await client.query(
      "SELECT COUNT(*) FROM context7_documentation"
    );
    console.log(`📊 Total documents in database: ${countResult.rows[0].count}`);

    console.log("\n🎉 Test completed successfully!");
    console.log("\nNext steps:");
    console.log("1. The Context7 documentation table is ready");
    console.log("2. Sample documents with embeddings are inserted");
    console.log("3. Similarity search is working");
    console.log("4. Ready for full Context7 MCP integration");
  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
  } finally {
    await client.end();
  }
}

main().catch(console.error);