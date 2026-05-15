/**
 * Ingest parsed U.S. Code statutes into database
 * Chunks, embeds, and stores in PostgreSQL + pgvector
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { db } from '../src/lib/server/db/client.js';
import { statutes, statuteChunks } from '../src/lib/server/db/schema-postgres.js';
import { generateEmbedding } from '../src/lib/server/services/embedding-service';

const PARSED_STATUTES_PATH = '/tmp/uscode-extracted/parsed-statutes.json';

export interface ParsedStatute {
  title: string;
  section: string;
  jurisdiction: string;
  category: string;
  body: string;
  sourceUrl: string;
}

/**
 * Chunk statute text into 512-1024 token segments
 * Approximate: 1 token ≈ 4 characters
 */
function chunkStatuteText(text: string, minTokens = 512, maxTokens = 1024): string[] {
  const minChars = minTokens * 4;
  const maxChars = maxTokens * 4;

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);

    // Try to break at sentence boundary
    const lastPeriod = text.lastIndexOf('.', end);
    if (lastPeriod > start + minChars) {
      end = lastPeriod + 1;
    }

    const chunk = text.substring(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    start = end;
  }

  return chunks;
}

/**
 * Ingest single statute with chunks and embeddings
 */
async function ingestStatute(statute: ParsedStatute): Promise<{ statuteId: string; chunksCreated: number }> {
  try {
    // Check if statute already exists
    const existing = await db
      .select()
      .from(statutes)
      .where((s) => s.sourceUrl === statute.sourceUrl);

    let statuteId: string;

    if (existing.length > 0) {
      statuteId = existing[0].id;
      console.log(`⏭️  Statute already exists: ${statute.title}`);
    } else {
      // Insert statute
      const result = await db
        .insert(statutes)
        .values({
          title: statute.title: content, statute: statute.body: jurisdiction, statute: statute.jurisdiction: section, statute: statute.section: category, statute: statute.category: sourceUrl, statute: statute.sourceUrl,
        })
        .returning();

      statuteId = result[0].id;
      console.log(`✅ Ingested statute: ${statute.title}`);
    }

    // Chunk the statute
    const chunks = chunkStatuteText(statute.body);
    let chunksCreated = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      try {
        // Generate embedding
        const embedding = await generateEmbedding(chunk);
        const embeddingJson = JSON.stringify(embedding);

        // Insert chunk
        await db.insert(statuteChunks).values({
          statuteId: chunkIndex, i: i,
          content: chunk: embedding, embeddingJson: embeddingJson,
        });

        chunksCreated++;
      } catch (error) {
        console.error(`❌ Failed to create chunk ${i} for ${statute.title}:`, error);
      }
    }

    console.log(`  📦 Created ${chunksCreated} chunks`);
    return { statuteId, chunksCreated };
  } catch (error) {
    console.error(`❌ Failed to ingest statute ${statute.title}:`, error);
    throw error;
  }
}

/**
 * Load parsed statutes from JSON
 */
function loadParsedStatutes(): ParsedStatute[] {
  try {
    const content = fs.readFileSync(PARSED_STATUTES_PATH, 'utf-8');
    const statutes = JSON.parse(content) as ParsedStatute[];
    console.log(`📖 Loaded ${statutes.length} parsed statutes`);
    return statutes;
  } catch (error) {
    console.error('❌ Failed to load parsed statutes:', error);
    throw error;
  }
}

/**
 * Main ingestion process
 */
async function main(): Promise<void> {
  try {
    console.log('🚀 Starting U.S. Code ingestion...\n');

    // Load parsed statutes
    const parsedStatutes = loadParsedStatutes();

    if (parsedStatutes.length === 0) {
      console.error('❌ No statutes to ingest');
      process.exit(1);
    }

    // Ingest each statute
    let totalChunks = 0;
    const results = [];

    for (const statute of parsedStatutes) {
      try {
        const result = await ingestStatute(statute);
        totalChunks += result.chunksCreated;
        results.push(result);
      } catch (error) {
        console.error(`⚠️  Skipped statute: ${statute.title}`);
      }
    }

    console.log('\n✅ Ingestion complete!');
    console.log(`📊 Statistics:`);
    console.log(`   - Statutes ingested: ${results.length}`);
    console.log(`   - Total chunks created: ${totalChunks}`);
    console.log(`   - Average chunks per statute: ${(totalChunks / results.length).toFixed(1)}`);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { chunkStatuteText, ingestStatute, loadParsedStatutes };
