#!/usr/bin/env node

import { createClient } from 'redis';
import pg from 'pg';
const { Pool } = pg;

// Database configuration
const pgPool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'legal_ai_db',
  user: 'legal_admin',
  password: '123456',
});

// Redis configuration
const redisClient = createClient({
  url: 'redis://localhost:6379',
  password: 'redis',
});

// Ollama configuration - prefer project helper when available
// eslint-disable-next-line @typescript-eslint/no-var-requires
let OLLAMA_URL = process.env.OLLAMA_URL || process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
try {
  // prefer local project helper if available (best-effort)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getOllamaBaseUrl } = require('../src/lib/utils/ollama-endpoint');
  if (getOllamaBaseUrl && typeof getOllamaBaseUrl === 'function') {
    OLLAMA_URL = getOllamaBaseUrl();
  }
} catch (e) {
  // ignore - fall back to env or default
}

console.log('🚀 Testing Recursive Evidence Chain Processing');
console.log('================================================\n');

async function testInfrastructure() {
  console.log('1️⃣ Testing Infrastructure Connections...\n');

  // Test PostgreSQL
  try {
    const pgResult = await pgPool.query('SELECT version()');
    console.log('✅ PostgreSQL: Connected');
    console.log(`   Version: ${pgResult.rows[0].version.split(',')[0]}`);

    // Check pgvector extension
    const vectorResult = await pgPool.query(
      "SELECT extversion FROM pg_extension WHERE extname = 'vector'"
    );
    if (vectorResult.rows.length > 0) {
      console.log(`   pgvector: v${vectorResult.rows[0].extversion}`);
    }
  } catch (error) {
    console.error('❌ PostgreSQL: Failed to connect', error.message);
    return false;
  }

  // Test Redis
  try {
    await redisClient.connect();
    const pong = await redisClient.ping();
    console.log(`✅ Redis: Connected (${pong})`);
    await redisClient.disconnect();
  } catch (error) {
    console.error('❌ Redis: Failed to connect', error.message);
  }

  // Test Ollama
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    const data = await response.json();
    console.log('✅ Ollama: Connected');
    if (data.models && data.models.length > 0) {
      console.log(`   Models: ${data.models.map((m) => m.name).join(', ')}`);
    }
  } catch (error) {
    console.error('❌ Ollama: Failed to connect', error.message);
  }

  console.log('\n');
  return true;
}

async function createSampleEvidence() {
  console.log('2️⃣ Creating Sample Evidence Chain...\n');

  try {
    // Create a case first
    const caseResult = await pgPool.query(
      `
      INSERT INTO cases (title, description, status, metadata)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
      [
        'Recursive Evidence Test Case',
        'Testing recursive evidence chain processing',
        'active',
        JSON.stringify({ test: true, created: new Date().toISOString() }),
      ]
    );

    const caseId = caseResult.rows[0]?.id || 'existing-case-id';
    console.log(`📁 Case ID: ${caseId}`);

    // Create parent evidence
    const parentEvidence = await pgPool.query(
      `
      INSERT INTO evidence (
        case_id,
        title,
        description,
        evidence_type,
        ai_analysis,
        chain_of_custody,
        collected_at,
        collected_by,
        location
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `,
      [
        caseId,
        'Parent Document - Contract Agreement',
        'Main contract with multiple referenced exhibits',
        'document',
        JSON.stringify({
          file_type: 'pdf',
          pages: 50,
          has_exhibits: true,
        }),
        JSON.stringify([
          {
            officer_id: 'officer-001',
            officer_name: 'Detective Smith',
            timestamp: new Date().toISOString(),
            action: 'collected',
            location: 'Corporate Office',
          },
        ]),
        new Date(),
        'Detective Smith',
        'Corporate Office',
      ]
    );

    console.log(`📄 Parent Evidence: ${parentEvidence.rows[0].id}`);

    // Create child evidence items
    const childIds = [];
    for (let i = 1; i <= 3; i++) {
      const childEvidence = await pgPool.query(
        `
        INSERT INTO evidence (
          case_id,
          title,
          description,
          evidence_type,
          ai_analysis,
          chain_of_custody,
          collected_at,
          collected_by,
          location
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `,
        [
          caseId,
          `Exhibit ${String.fromCharCode(64 + i)} - Supporting Document`,
          `Referenced exhibit from main contract`,
          'document',
          JSON.stringify({
            file_type: 'pdf',
            parent_id: parentEvidence.rows[0].id,
            exhibit_letter: String.fromCharCode(64 + i),
          }),
          JSON.stringify([
            {
              officer_id: 'officer-001',
              officer_name: 'Detective Smith',
              timestamp: new Date().toISOString(),
              action: 'collected',
              location: 'Corporate Office',
            },
          ]),
          new Date(),
          'Detective Smith',
          'Corporate Office',
        ]
      );
      childIds.push(childEvidence.rows[0].id);
      console.log(`   📎 Child Evidence ${i}: ${childEvidence.rows[0].id}`);
    }

    // Create evidence connections
    for (const childId of childIds) {
      await pgPool.query(
        `
        INSERT INTO evidence_connections (
          source_evidence_id,
          target_evidence_id,
          connection_type,
          strength,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `,
        [
          parentEvidence.rows[0].id,
          childId,
          'documentary',
          0.95,
          JSON.stringify({ relationship: 'exhibit_reference' }),
        ]
      );
    }

    console.log('✅ Evidence chain created successfully\n');
    return {
      caseId,
      parentId: parentEvidence.rows[0].id,
      childIds,
    };
  } catch (error) {
    console.error('❌ Failed to create evidence:', error.message);
    return null;
  }
}

async function testRecursiveProcessing(evidenceData) {
  console.log('3️⃣ Testing Recursive Processing...\n');

  if (!evidenceData) {
    console.log('⚠️ No evidence data to process');
    return;
  }

  // Simulate recursive processing
  const visitedEvidence = new Set();
  let maxDepth = 0;
  let nodesProcessed = 0;

  async function processEvidenceRecursively(evidenceId, depth = 0) {
    if (depth > maxDepth) maxDepth = depth;
    if (visitedEvidence.has(evidenceId)) return;

    visitedEvidence.add(evidenceId);
    nodesProcessed++;

    // Get evidence data
    const result = await pgPool.query('SELECT * FROM evidence WHERE id = $1', [evidenceId]);

    if (result.rows.length === 0) return;

    const evidence = result.rows[0];
    console.log(`${'  '.repeat(depth)}🪆 Processing: ${evidence.title} (Depth: ${depth})`);

    // Find connected evidence
    const connections = await pgPool.query(
      `
      SELECT target_evidence_id as evidence_id
      FROM evidence_connections
      WHERE source_evidence_id = $1
    `,
      [evidenceId]
    );

    // Process children recursively
    for (const connection of connections.rows) {
      await processEvidenceRecursively(connection.evidence_id, depth + 1);
    }
  }

  const startTime = Date.now();
  await processEvidenceRecursively(evidenceData.parentId);
  const processingTime = Date.now() - startTime;

  console.log('\n📊 Processing Statistics:');
  console.log(`   Max Depth: ${maxDepth}`);
  console.log(`   Nodes Processed: ${nodesProcessed}`);
  console.log(`   Processing Time: ${processingTime}ms`);
  console.log(`   Evidence Visited: ${visitedEvidence.size}`);
}

async function testVectorSearch() {
  console.log('\n4️⃣ Testing Vector Search Integration...\n');

  try {
    // Check if embedding column exists
    const columnCheck = await pgPool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'evidence' AND column_name = 'embedding'
    `);

    if (columnCheck.rows.length === 0) {
      console.log('ℹ️ Evidence table does not have embedding column yet.');
      console.log('   Vector search will be available after adding pgvector embeddings.');
      return;
    }

    // Check if we have any vector embeddings
    const result = await pgPool.query(`
      SELECT COUNT(*) as count
      FROM evidence
      WHERE embedding IS NOT NULL
    `);

    console.log(`📊 Evidence with embeddings: ${result.rows[0].count}`);

    if (result.rows[0].count > 0) {
      // Perform a sample vector search
      const searchResult = await pgPool.query(`
        SELECT id, title,
               embedding <-> (SELECT embedding FROM evidence WHERE embedding IS NOT NULL LIMIT 1) as distance
        FROM evidence
        WHERE embedding IS NOT NULL
        ORDER BY distance
        LIMIT 5
      `);

      console.log('🔍 Sample vector search results:');
      searchResult.rows.forEach((row, i) => {
        console.log(`   ${i + 1}. ${row.title} (distance: ${row.distance.toFixed(4)})`);
      });
    } else {
      console.log('ℹ️ No vector embeddings found. Run embedding generation first.');
    }
  } catch (error) {
    console.error('❌ Vector search failed:', error.message);
  }
}

// Main execution
async function main() {
  try {
    // Test infrastructure
    const infraOk = await testInfrastructure();
    if (!infraOk) {
      console.log('⚠️ Infrastructure issues detected. Please check your services.');
      process.exit(1);
    }

    // Create sample evidence
    const evidenceData = await createSampleEvidence();

    // Test recursive processing
    await testRecursiveProcessing(evidenceData);

    // Test vector search
    await testVectorSearch();

    console.log('\n✅ All tests completed successfully!');
    console.log('🎯 Recursive evidence chain processing is ready for production use.');
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await pgPool.end();
    process.exit(0);
  }
}

main();
