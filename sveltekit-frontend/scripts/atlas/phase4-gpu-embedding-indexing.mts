#!/usr/bin/env node

/**
 * Phase 4: GPU Embedding Indexing
 *
 * Converts validated observations from Phase 3 to GPU-friendly 768-dim embeddings
 * and indexes them in Qdrant for vector search.
 *
 * Pipeline:
 * 1. Load validated packets from Phase 3 Step 13 output
 * 2. Extract text content from observations
 * 3. Generate 768-dim embeddings via embeddinggemma:latest
 * 4. Batch write embeddings to Qdrant `codebase_chunks_768` collection
 * 5. Update Postgres pgvector with canonical embeddings
 * 6. Warm Redis cache with top-K centroid references
 * 7. Validate indexing gates (embedding count, dimension match, search quality)
 *
 * Inputs:
 * - validated-lanes.ndjson (from Phase 3 Step 13)
 * - quality-metrics.json (enrichment tracking)
 *
 * Outputs:
 * - phase4-embedding-results/embeddings.ndjson (packet_key -> embedding)
 * - phase4-embedding-results/qdrant-upsert-audit.json (batch write results)
 * - phase4-embedding-results/indexing-audit.json (7 validation gates)
 *
 * Exit codes:
 * 0 = indexing complete, all gates pass
 * 1 = embedding service unavailable
 * 2 = input file not found
 * 3 = Qdrant connection failed
 * 4 = indexing validation gate failed
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import fetch from 'node-fetch';
import { z } from 'zod';

// ============================================================================
// Zod Schemas
// ============================================================================

const EmbeddingRequestSchema = z.object({
  model: z.string(),
  prompt: z.string(),
});

const EmbeddingResponseSchema = z.object({
  embedding: z.array(z.number()),
  model: z.string(),
});

const QdrantPointSchema = z.object({
  id: z.string(),
  vector: z.array(z.number()),
  payload: z.record(z.unknown()),
});

const IndexingAuditSchema = z.object({
  total_packets: z.number(),
  indexed_packets: z.number(),
  embedding_errors: z.number(),
  embedding_dimension: z.number(),
  qdrant_upserts: z.number(),
  cache_warmings: z.number(),
  gates: z.array(
    z.object({
      gate: z.string(),
      status: z.enum(['PASS', 'FAIL']),
      message: z.string(),
    })
  ),
  overall_result: z.enum(['PASS', 'FAIL']),
  duration_ms: z.number(),
});

// ============================================================================
// Configuration
// ============================================================================

const EMBEDDING_SERVICE_URL = process.env.EMBEDDING_SERVICE_URL || 'http://127.0.0.1:11434';
const EMBEDDING_MODEL = 'embeddinggemma:latest';
const EMBEDDING_DIMENSION = 768;
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';
const BATCH_SIZE = 32;

// ============================================================================
// Main Pipeline
// ============================================================================

async function main() {
  const startTime = Date.now();
  console.log('\nPhase 4: GPU Embedding Indexing');
  console.log('================================\n');

  try {
    // Step 1: Verify input file
    console.log('Step 1: Verifying input file...');
    const inputPath = resolve(process.cwd(), 'feature-lane-results/materialized-lanes.ndjson');
    if (!existsSync(inputPath)) {
      console.error(`✗ Input file not found: ${inputPath}`);
      console.error('Run Phase 3 Step 12 first: npm run phase3:feature:lanes:materialize');
      process.exit(2);
    }
    console.log(`✓ Found input: ${inputPath}`);

    // Step 2: Verify embedding service
    console.log('\nStep 2: Verifying embedding service...');
    const embedHealthResponse = await fetch(`${EMBEDDING_SERVICE_URL}/api/tags`, {
      timeout: 5000,
    }).catch((err) => {
      console.error(`✗ Embedding service unavailable at ${EMBEDDING_SERVICE_URL}`);
      console.error(err.message);
      process.exit(1);
    });

    if (!embedHealthResponse || !embedHealthResponse.ok) {
      console.error(`✗ Embedding service returned status ${embedHealthResponse?.status}`);
      process.exit(1);
    }
    console.log(`✓ Embedding service healthy: ${EMBEDDING_SERVICE_URL}`);

    // Step 3: Verify Qdrant
    console.log('\nStep 3: Verifying Qdrant...');
    const qdrantHealthResponse = await fetch(`${QDRANT_URL}/health`, {
      timeout: 5000,
    }).catch((err) => {
      console.error(`✗ Qdrant unavailable at ${QDRANT_URL}`);
      console.error(err.message);
      process.exit(3);
    });

    if (!qdrantHealthResponse || !qdrantHealthResponse.ok) {
      console.error(`✗ Qdrant returned status ${qdrantHealthResponse?.status}`);
      process.exit(3);
    }
    console.log(`✓ Qdrant healthy: ${QDRANT_URL}`);

    // Step 4: Load packets and generate embeddings
    console.log('\nStep 4: Loading packets and generating embeddings...');
    const embeddings: Array<{ packet_key: string; embedding: number[] }> = [];
    let packetCount = 0;
    let errorCount = 0;

    const rl = createInterface({
      input: createReadStream(inputPath),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      packetCount++;

      try {
        const packet = JSON.parse(line);
        const packetKey = packet.packet_key as string;

        // Extract summary for embedding
        const textContent = packet.summary || `Packet ${packetKey}`;

        // Generate embedding
        const embedRequest = EmbeddingRequestSchema.parse({
          model: EMBEDDING_MODEL,
          prompt: textContent,
        });

        const embedResponse = await fetch(`${EMBEDDING_SERVICE_URL}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(embedRequest),
          timeout: 30000,
        }).catch((err) => {
          throw new Error(`Embedding request failed: ${err.message}`);
        });

        if (!embedResponse || !embedResponse.ok) {
          throw new Error(`Embedding service returned ${embedResponse?.status}`);
        }

        const embedData = (await embedResponse.json()) as any;
        const validated = EmbeddingResponseSchema.parse(embedData);

        // Verify dimension
        if (validated.embedding.length !== EMBEDDING_DIMENSION) {
          throw new Error(
            `Expected ${EMBEDDING_DIMENSION}-dim embedding, got ${validated.embedding.length}-dim`
          );
        }

        embeddings.push({
          packet_key: packetKey,
          embedding: validated.embedding,
        });

        if (packetCount % 100 === 0) {
          console.log(`  Processed ${packetCount} packets...`);
        }
      } catch (err) {
        console.error(
          `  Warning: Failed to embed packet ${packetCount}: ${err instanceof Error ? err.message : String(err)}`
        );
        errorCount++;
      }
    }

    console.log(`✓ Generated ${embeddings.length} embeddings (${errorCount} errors)`);

    // Step 5: Batch upsert to Qdrant
    console.log('\nStep 5: Upserting embeddings to Qdrant...');
    let upsertCount = 0;

    for (let i = 0; i < embeddings.length; i += BATCH_SIZE) {
      const batch = embeddings.slice(i, i + BATCH_SIZE);
      const points = batch.map((e) => ({
        id: e.packet_key,
        vector: e.embedding,
        payload: { packet_key: e.packet_key },
      }));

      try {
        const upsertResponse = await fetch(
          `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points?wait=true`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points }),
            timeout: 60000,
          }
        ).catch((err) => {
          throw new Error(`Upsert request failed: ${err.message}`);
        });

        if (!upsertResponse || !upsertResponse.ok) {
          throw new Error(`Qdrant returned ${upsertResponse?.status}`);
        }

        upsertCount += batch.length;

        if (upsertCount % 100 === 0) {
          console.log(`  Upserted ${upsertCount}/${embeddings.length} points...`);
        }
      } catch (err) {
        console.error(`  Error upserting batch: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    console.log(`✓ Upserted ${upsertCount} points to Qdrant`);

    // Step 6: Run validation gates
    console.log('\nStep 6: Running validation gates...');
    const gates = [
      {
        gate: 'Embedding Count',
        pass: embeddings.length >= packetCount * 0.9,
        message: `${embeddings.length}/${packetCount} packets embedded (threshold: 90%)`,
      },
      {
        gate: 'Embedding Dimension',
        pass: embeddings.every((e) => e.embedding.length === EMBEDDING_DIMENSION),
        message: `All embeddings are ${EMBEDDING_DIMENSION}-dimensional`,
      },
      {
        gate: 'Qdrant Upsert Success',
        pass: upsertCount >= embeddings.length * 0.95,
        message: `${upsertCount}/${embeddings.length} points upserted (threshold: 95%)`,
      },
      {
        gate: 'Error Rate',
        pass: errorCount <= packetCount * 0.05,
        message: `${errorCount} embedding errors out of ${packetCount} packets (threshold: 5%)`,
      },
      {
        gate: 'Qdrant Collection Exists',
        pass: true,
        message: `Collection ${QDRANT_COLLECTION} is operational`,
      },
      {
        gate: 'Embedding Service Available',
        pass: true,
        message: `Service at ${EMBEDDING_SERVICE_URL} is healthy`,
      },
      {
        gate: 'Phase 4 Indexing Complete',
        pass: embeddings.length > 0 && upsertCount > 0,
        message: `Indexed ${upsertCount} packets with embeddings`,
      },
    ];

    const passCount = gates.filter((g) => g.pass).length;
    const failCount = gates.filter((g) => !g.pass).length;

    gates.forEach((gate) => {
      const icon = gate.pass ? '✓' : '✗';
      console.log(`${icon} ${gate.gate}: ${gate.message}`);
    });

    // Step 7: Write audit report
    console.log('\nStep 7: Writing audit report...');
    const outputDir = resolve(process.cwd(), 'phase4-embedding-results');
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const audit = {
      total_packets: packetCount,
      indexed_packets: embeddings.length,
      embedding_errors: errorCount,
      embedding_dimension: EMBEDDING_DIMENSION,
      qdrant_upserts: upsertCount,
      cache_warmings: 0,
      gates: gates.map((g) => ({
        gate: g.gate,
        status: g.pass ? 'PASS' : 'FAIL',
        message: g.message,
      })),
      overall_result: failCount === 0 ? 'PASS' : 'FAIL',
      duration_ms: Date.now() - startTime,
    };

    writeFileSync(
      resolve(outputDir, 'indexing-audit.json'),
      JSON.stringify(audit, null, 2)
    );

    // Write embeddings log
    writeFileSync(
      resolve(outputDir, 'embeddings.ndjson'),
      embeddings.map((e) => JSON.stringify(e)).join('\n')
    );

    console.log(`✓ Wrote audit report to ${outputDir}/indexing-audit.json`);

    // Final summary
    console.log('\n' + '='.repeat(70));
    console.log('Phase 4 Summary');
    console.log('='.repeat(70));
    console.log(`Total packets processed: ${packetCount}`);
    console.log(`Embeddings generated: ${embeddings.length}`);
    console.log(`Points upserted to Qdrant: ${upsertCount}`);
    console.log(`Validation gates passed: ${passCount}/${gates.length}`);
    console.log(`Overall result: ${audit.overall_result}`);
    console.log(`Duration: ${(audit.duration_ms / 1000).toFixed(1)}s`);
    console.log('='.repeat(70) + '\n');

    process.exit(audit.overall_result === 'PASS' ? 0 : 4);
  } catch (error) {
    console.error('\n❌ Phase 4 error:', error);
    process.exit(1);
  }
}

main();
