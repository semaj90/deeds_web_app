#!/usr/bin/env node

/**
 * KAG LDR Knowledge Extraction
 *
 * Spawn LDR research tasks for domain knowledge → extract tuples → insert Postgres + Qdrant
 *
 * Usage:
 *   npm run kag:extract:ldr -- --domain topology --max-results 500
 *   npm run kag:extract:ldr -- --domain auth --concepts SESSION_MANAGEMENT OAUTH
 */

import { Command } from 'commander';
import fetch from 'node-fetch';
import crypto from 'crypto';
import pg from 'pg';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';

const { Pool } = pg;

// ============================================================================
// CONFIG
// ============================================================================

const LDR_BASE_URL = process.env.LDR_BASE_URL || 'http://localhost:5000';
const POSTGRES_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:legal_admin_pwd@127.0.0.1:5432/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

const DOMAIN_QUERIES = {
  topology: [
    'What are Self-Organizing Maps (SOM) and how do they organize high-dimensional data?',
    'How do k-means clustering and Kohonen networks compare in terms of algorithms and use cases?',
    'What is tricubic interpolation and when should it be used for spatial searches?',
    'How do HNSW (Hierarchical Navigable Small World) indexes speed up nearest-neighbor search?',
    'What are the advantages of grid-based clustering over hierarchical clustering?',
  ],
  auth: [
    'What are the best practices for implementing session management in web applications?',
    'How do OAuth 2.0 and OpenID Connect differ in their authentication flows?',
    'What is the relationship between JWT tokens and session stores?',
    'How should password reset tokens be securely generated and validated?',
  ],
  infra: [
    'What are the tradeoffs between Redis and Memcached for caching?',
    'How do connection pools optimize database performance under high load?',
    'What are the benefits of using a message queue like RabbitMQ?',
  ],
  legal: [
    'What are the key elements of a legal evidence chain of custody?',
    'How do hearsay rules affect expert testimony in court proceedings?',
    'What is the role of discovery in civil litigation?',
  ],
  analysis: [
    'How do Abstract Syntax Trees (AST) help with code analysis?',
    'What are the differences between static and dynamic program analysis?',
    'How do data flow analysis and control flow analysis complement each other?',
  ],
};

const CONCEPT_SEED = {
  topology: [
    'SOM_GRID',
    'KMEANS_CLUSTERING',
    'TRICUBIC_INTERPOLATION',
    'HNSW_INDEX',
    'BMU_NEIGHBORHOOD',
    'GRID_ADJACENCY',
  ],
  auth: [
    'SESSION_MANAGEMENT',
    'OAUTH_FLOW',
    'JWT_TOKEN',
    'PASSWORD_RESET',
    'SESSION_STORE',
  ],
};

// ============================================================================
// UTILITIES
// ============================================================================

function fnv1a8(s) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

async function ldrFetch(path, init = {}) {
  const res = await fetch(`${LDR_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`LDR ${res.status} ${res.statusText}: ${await res.text()}`);
  }
  return res.json();
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// LDR TASK SPAWNING
// ============================================================================

async function spawnLdrTask(query, maxIterations = 3) {
  console.log(`[LDR] Spawning task: ${query.slice(0, 60)}...`);
  const result = await ldrFetch('/api/research/start', {
    method: 'POST',
    body: JSON.stringify({
      query,
      max_iterations: maxIterations,
      search_engines: ['searxng', 'wikipedia'],
    }),
  });
  return result;
}

async function pollLdrStatus(taskId, maxAttempts = 120) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await ldrFetch(`/api/research/status/${taskId}`);
    console.log(`[LDR] Task ${taskId.slice(0, 8)}: ${status.status}`);

    if (status.status === 'completed') {
      return status.result;
    }
    if (status.status === 'failed') {
      throw new Error(`LDR task ${taskId} failed`);
    }
    await sleep(5000); // Poll every 5s
  }
  throw new Error(`LDR task ${taskId} timed out after ${maxAttempts * 5}s`);
}

// ============================================================================
// KNOWLEDGE TUPLE EXTRACTION
// ============================================================================

function extractTuplesFromResult(result, domainClass, concept) {
  const tuples = [];

  // Main tuple from summary
  if (result.summary) {
    tuples.push({
      tupleId: fnv1a8(`${domainClass}:${concept}:summary`),
      domainClass,
      concept,
      description: result.summary.slice(0, 500),
      sourceType: 'ldr',
      sourceRef: `ldr:${result.taskId || 'unknown'}`,
      confidence: 0.85,
      codeExamples: [],
      queryExamples: [result.query],
    });
  }

  // Source-based tuples
  if (result.sources && Array.isArray(result.sources)) {
    for (const [idx, src] of result.sources.slice(0, 4).entries()) {
      tuples.push({
        tupleId: fnv1a8(`${domainClass}:${concept}:src:${idx}`),
        domainClass,
        concept: `${concept}_SOURCE_${idx}`,
        description: src.snippet || src.title,
        sourceType: 'ldr',
        sourceRef: src.url,
        confidence: Math.max(0.65, 0.85 - idx * 0.05),
        codeExamples: [],
        queryExamples: [],
      });
    }
  }

  return tuples;
}

// ============================================================================
// DATABASE INSERTION
// ============================================================================

async function insertTuplesToPostgres(pool, tuples) {
  const client = await pool.connect();
  try {
    for (const tuple of tuples) {
      const {
        tupleId,
        domainClass,
        concept,
        description,
        sourceType,
        sourceRef,
        confidence,
        queryExamples,
      } = tuple;

      await client.query(
        `INSERT INTO kag_knowledge_tuples (
          tuple_id, domain_class, concept, description,
          source_type, source_ref, confidence, query_examples
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (tuple_id) DO UPDATE SET
          refreshed_at = now()`,
        [
          tupleId,
          domainClass,
          concept,
          description,
          sourceType,
          sourceRef,
          parseFloat(confidence),
          JSON.stringify(queryExamples || []),
        ]
      );
    }
    console.log(`[DB] Inserted ${tuples.length} tuples to Postgres`);
  } finally {
    client.release();
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const program = new Command();

  program
    .option('--domain <string>', 'Domain class (topology, auth, infra, legal, analysis)')
    .option('--concepts <list>', 'Comma-separated concepts to extract')
    .option('--max-results <number>', 'Maximum results per concept', '500')
    .option('--dry-run', 'Print plan without executing')
    .parse();

  const opts = program.opts();
  const domain = opts.domain || 'topology';
  const maxResults = parseInt(opts.maxResults, 10);
  const isDryRun = opts.dryRun || false;

  const queries = DOMAIN_QUERIES[domain] || [];
  const concepts = opts.concepts ? opts.concepts.split(',') : CONCEPT_SEED[domain] || [];

  if (queries.length === 0) {
    console.error(`❌ Unknown domain: ${domain}`);
    console.error(`Available: ${Object.keys(DOMAIN_QUERIES).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n📊 KAG LDR Knowledge Extraction Plan`);
  console.log(`====================================`);
  console.log(`Domain: ${domain}`);
  console.log(`Queries: ${queries.length}`);
  console.log(`Concepts: ${concepts.join(', ')}`);
  console.log(`Max results: ${maxResults}`);
  console.log(`Dry run: ${isDryRun}\n`);

  if (isDryRun) {
    console.log('(Dry run only; use --no-dry-run to execute)\n');
    return;
  }

  const pool = new Pool({ connectionString: POSTGRES_URL });

  try {
    let totalTuples = 0;

    for (const query of queries) {
      console.log(`\n[SPAWNING] ${query.slice(0, 60)}...`);

      try {
        // Spawn LDR task
        const taskRef = await spawnLdrTask(query, 3);
        const taskId = taskRef.research_id || taskRef.task_id;

        // Poll until completed
        const result = await pollLdrStatus(taskId);

        // Extract tuples for each concept
        for (const concept of concepts) {
          const tuples = extractTuplesFromResult(result, domain, concept);
          await insertTuplesToPostgres(pool, tuples);
          totalTuples += tuples.length;
        }
      } catch (err) {
        console.error(`[ERROR] Failed to process query: ${err.message}`);
      }
    }

    console.log(`\n✅ Extraction complete: ${totalTuples} tuples inserted`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
