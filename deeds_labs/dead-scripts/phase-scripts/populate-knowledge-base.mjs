#!/usr/bin/env node
/**
 * Populate Qdrant with evidence embeddings from the database
 * This wires up the knowledge base for RAG queries
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { QdrantClient } from '@qdrant/js-client-rest';
import * as dotenv from 'dotenv';
import { evidence } from '../src/lib/db/schema/evidence.js';
import { generateEmbedding } from '../src/lib/server/embedding-service.js';

// Load environment variables
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'phase72_evidence_embeddings';

// Initialize clients
const dbClient = postgres(DATABASE_URL);
const db = drizzle(dbClient);
const qdrantClient = new QdrantClient({ url: QDRANT_URL });

async function populateKnowledgeBase() {
  console.log('🔍 Starting knowledge base population...');

  try {
    // 1. Check Qdrant collection exists
    console.log('📊 Checking Qdrant collection...');
    const collections = await qdrantClient.getCollections();
    const collectionExists = collections.collections.some(c => c.name === COLLECTION_NAME);

    if (!collectionExists) {
      console.log(`❌ Collection ${COLLECTION_NAME} not found. Run init-qdrant.mjs first.`);
      return;
    }

    // 2. Get all evidence from database
    console.log('📚 Fetching evidence from database...');
    const evidenceRecords = await db.select().from(evidence);

    console.log(`📋 Found ${evidenceRecords.length} evidence records`);

    if (evidenceRecords.length === 0) {
      console.log('⚠️ No evidence found in database. Run seed-evidence.ts first.');
      return;
    }

    // 3. Check existing points in Qdrant
    const collectionInfo = await qdrantClient.getCollection(COLLECTION_NAME);
    const existingPoints = collectionInfo.points_count || 0;
    console.log(`📊 Collection has ${existingPoints} existing points`);

    // 4. Process each evidence record
    let processed = 0;
    let skipped = 0;

    for (const record of evidenceRecords) {
      try {
        // Create text content for embedding
        const content = [
          record.title,
          record.description,
          record.evidenceType,
          record.content || '',
          record.metadata ? JSON.stringify(record.metadata) : ''
        ].filter(Boolean).join(' | ');

        if (!content.trim()) {
          console.log(`⚠️ Skipping ${record.id} - no content`);
          skipped++;
          continue;
        }

        console.log(`🔄 Processing: ${record.title} (${record.id})`);

        // Generate embedding
        const embedding = await generateEmbedding(content);

        // Prepare payload for Qdrant
        const payload = {
          evidence_id: record.id,
          case_id: record.caseId,
          title: record.title,
          description: record.description || '',
          evidence_type: record.evidenceType || '',
          content: content,
          text: content, // For backward compatibility
          file_name: record.title,
          jurisdiction: record.jurisdiction || 'Unknown',
          tags: record.tags || [],
          created_at: record.createdAt,
          updated_at: record.updatedAt,
        };

        // Insert into Qdrant
        await qdrantClient.upsert(COLLECTION_NAME, {
          points: [{
            id: record.id, // Use evidence ID as point ID
            vector: embedding,
            payload: payload
          }]
        });

        processed++;
        console.log(`✅ Processed: ${record.title}`);

        // Small delay to avoid overwhelming the services
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`❌ Failed to process ${record.id}:`, error.message);
        skipped++;
      }
    }

    // 5. Final stats
    console.log('\n🎉 Knowledge base population complete!');
    console.log(`✅ Processed: ${processed} evidence records`);
    console.log(`⚠️ Skipped: ${skipped} records`);
    console.log(`📊 Total in Qdrant: ${existingPoints + processed} points`);

    // 6. Test the knowledge base
    console.log('\n🧪 Testing knowledge base...');
    const testQuery = 'security camera footage';
    const testEmbedding = await generateEmbedding(testQuery);

    const searchResults = await qdrantClient.search(COLLECTION_NAME, {
      vector: testEmbedding,
      limit: 3,
      score_threshold: 0.1
    });

    console.log(`🔍 Test query "${testQuery}" found ${searchResults.length} results:`);
    searchResults.forEach((result, i) => {
      console.log(`  ${i + 1}. ${result.payload.title} (score: ${result.score.toFixed(3)})`);
    });

  } catch (error) {
    console.error('❌ Knowledge base population failed:', error);
  } finally {
    await dbClient.end();
  }
}

// Run the script
populateKnowledgeBase().catch(console.error);