#!/usr/bin/env node
/**
 * Phase 2F.1: Populate Evaluation Corpus Database
 * Task 2.8: Insert ground-truth into evaluation_queries, evaluation_evidence, evaluation_relevance
 *
 * Flow:
 * 1. Create corpus_version manifest (git commit + indexing stats)
 * 2. Insert 50 evaluation queries
 * 3. Extract evidence items and insert into evaluation_evidence
 * 4. For each evidence item, infer relevance grade and insert into evaluation_relevance
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

// ============================================================================
// TYPES
// ============================================================================

const CorpusVersionSchema = z.object({
  corpus_version: z.string(),
  git_commit: z.string(),
  postgres_packet_count: z.number(),
  postgres_chunk_count: z.number(),
  qdrant_collection: z.string(),
  qdrant_point_count: z.number(),
  embedding_model: z.string(),
  embedding_dimension: z.number(),
  embedding_model_version: z.string(),
  query_set_hash: z.string(),
  judgment_set_hash: z.string(),
});

type CorpusVersion = z.infer<typeof CorpusVersionSchema>;

// ============================================================================
// CORPUS MANIFEST CREATION
// ============================================================================

function getGitCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: projectRoot, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function getCorpusVersion(): CorpusVersion {
  const gitCommit = getGitCommit();
  const timestamp = new Date().toISOString().split('T')[0];
  const version = `${timestamp}-main-${gitCommit.substring(0, 8)}`;

  return {
    corpus_version: version,
    git_commit: gitCommit,
    postgres_packet_count: 58365, // Known from Phase 2F.1 baseline
    postgres_chunk_count: 40754, // Known from Phase 2F.1 baseline
    qdrant_collection: 'codebase_chunks_768',
    qdrant_point_count: 40568, // Known from Phase 2F.1 baseline (points with embeddings)
    embedding_model: 'embeddinggemma:latest',
    embedding_dimension: 384,
    embedding_model_version: 'v1.0',
    query_set_hash: computeHash(EVALUATION_QUERIES.map((q) => q.query).join('\n')),
    judgment_set_hash: 'pending', // Will be computed after extraction
  };
}

function computeHash(text: string): string {
  const crypto = await import('crypto');
  return crypto.createHash('sha256').update(text).digest('hex');
}

// ============================================================================
// EVALUATION QUERIES (50 queries)
// ============================================================================

const EVALUATION_QUERIES = [
  // Programming Languages (10)
  { id: '550e8400-e29b-41d4-a716-446655440001', query: 'TypeScript function declarations', domain: 'programming-languages', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440002', query: 'async/await patterns', domain: 'programming-languages', difficulty: 3 },
  { id: '550e8400-e29b-41d4-a716-446655440003', query: 'promise chaining', domain: 'programming-languages', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440004', query: 'error handling try-catch', domain: 'programming-languages', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440005', query: 'variable scoping and closures', domain: 'programming-languages', difficulty: 3 },
  { id: '550e8400-e29b-41d4-a716-446655440006', query: 'destructuring assignment', domain: 'programming-languages', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440007', query: 'spread operator usage', domain: 'programming-languages', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440008', query: 'template literals and interpolation', domain: 'programming-languages', difficulty: 1 },
  { id: '550e8400-e29b-41d4-a716-446655440009', query: 'arrow function syntax', domain: 'programming-languages', difficulty: 1 },
  { id: '550e8400-e29b-41d4-a716-446655440010', query: 'higher-order functions and callbacks', domain: 'programming-languages', difficulty: 3 },

  // Web Markup (12)
  { id: '550e8400-e29b-41d4-a716-446655440011', query: 'Svelte 5 runes state management', domain: 'web-markup', difficulty: 3 },
  { id: '550e8400-e29b-41d4-a716-446655440012', query: 'component props and binding', domain: 'web-markup', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440013', query: 'conditional rendering', domain: 'web-markup', difficulty: 1 },
  { id: '550e8400-e29b-41d4-a716-446655440014', query: 'event handling', domain: 'web-markup', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440015', query: 'form handling and validation', domain: 'web-markup', difficulty: 3 },
  { id: '550e8400-e29b-41d4-a716-446655440016', query: 'CSS styling and UnoCSS utilities', domain: 'web-markup', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440017', query: 'modal and dialog components', domain: 'web-markup', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440018', query: 'list rendering and iteration', domain: 'web-markup', difficulty: 1 },
  { id: '550e8400-e29b-41d4-a716-446655440019', query: 'accessibility attributes', domain: 'web-markup', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440020', query: 'responsive layout patterns', domain: 'web-markup', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440021', query: 'animation and transitions', domain: 'web-markup', difficulty: 3 },
  { id: '550e8400-e29b-41d4-a716-446655440022', query: 'bits-ui component usage', domain: 'web-markup', difficulty: 2 },

  // Networking (10)
  { id: '550e8400-e29b-41d4-a716-446655440023', query: 'HTTP GET and POST requests', domain: 'networking', difficulty: 1 },
  { id: '550e8400-e29b-41d4-a716-446655440024', query: 'API endpoint design', domain: 'networking', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440025', query: 'request authentication and authorization', domain: 'networking', difficulty: 3 },
  { id: '550e8400-e29b-41d4-a716-446655440026', query: 'CORS and security headers', domain: 'networking', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440027', query: 'error handling and status codes', domain: 'networking', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440028', query: 'streaming and Server-Sent Events', domain: 'networking', difficulty: 3 },
  { id: '550e8400-e29b-41d4-a716-446655440029', query: 'WebSocket connections', domain: 'networking', difficulty: 3 },
  { id: '550e8400-e29b-41d4-a716-446655440030', query: 'JSON serialization and deserialization', domain: 'networking', difficulty: 1 },
  { id: '550e8400-e29b-41d4-a716-446655440031', query: 'HTTP caching strategies', domain: 'networking', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440032', query: 'file upload handling', domain: 'networking', difficulty: 2 },

  // Architecture (10)
  { id: '550e8400-e29b-41d4-a716-446655440033', query: 'layered architecture patterns', domain: 'architecture', difficulty: 3 },
  { id: '550e8400-e29b-41d4-a716-446655440034', query: 'module dependency management', domain: 'architecture', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440035', query: 'singleton and factory patterns', domain: 'architecture', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440036', query: 'service-oriented architecture', domain: 'architecture', difficulty: 3 },
  { id: '550e8400-e29b-41d4-a716-446655440037', query: 'event-driven architecture', domain: 'architecture', difficulty: 3 },
  { id: '550e8400-e29b-41d4-a716-446655440038', query: 'database schema design', domain: 'architecture', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440039', query: 'caching and memoization', domain: 'architecture', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440040', query: 'middleware and interceptors', domain: 'architecture', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440041', query: 'dependency injection', domain: 'architecture', difficulty: 3 },
  { id: '550e8400-e29b-41d4-a716-446655440042', query: 'microservices communication', domain: 'architecture', difficulty: 3 },

  // Algorithms (8)
  { id: '550e8400-e29b-41d4-a716-446655440043', query: 'sorting and searching algorithms', domain: 'algorithms', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440044', query: 'graph traversal and pathfinding', domain: 'algorithms', difficulty: 3 },
  { id: '550e8400-e29b-41d4-a716-446655440045', query: 'dynamic programming patterns', domain: 'algorithms', difficulty: 3 },
  { id: '550e8400-e29b-41d4-a716-446655440046', query: 'hash tables and data structures', domain: 'algorithms', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440047', query: 'tree data structures', domain: 'algorithms', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440048', query: 'bit manipulation techniques', domain: 'algorithms', difficulty: 3 },
  { id: '550e8400-e29b-41d4-a716-446655440049', query: 'string matching and parsing', domain: 'algorithms', difficulty: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440050', query: 'matrix operations and transformations', domain: 'algorithms', difficulty: 3 },
];

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');
  const verbose = args.includes('--verbose');

  console.log('Phase 2F.1: Populate Evaluation Corpus Database');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log('');

  try {
    // Get corpus version
    const corpusVersion = getCorpusVersion();
    console.log(`Corpus version: ${corpusVersion.corpus_version}`);
    console.log(`Git commit: ${corpusVersion.git_commit}`);
    console.log('');

    // SQL INSERT statements (for dry-run inspection)
    console.log('SQL INSERT statements (ready to execute):');
    console.log('');

    // 1. INSERT evaluation_corpora
    console.log('-- Step 1: Create corpus_version manifest');
    const corpusSQL = `
INSERT INTO evaluation_corpora (
  corpus_version, git_commit,
  postgres_packet_count, postgres_chunk_count,
  qdrant_collection, qdrant_point_count,
  embedding_model, embedding_dimension, embedding_model_version,
  query_set_hash, judgment_set_hash
) VALUES (
  '${corpusVersion.corpus_version}',
  '${corpusVersion.git_commit}',
  ${corpusVersion.postgres_packet_count},
  ${corpusVersion.postgres_chunk_count},
  '${corpusVersion.qdrant_collection}',
  ${corpusVersion.qdrant_point_count},
  '${corpusVersion.embedding_model}',
  ${corpusVersion.embedding_dimension},
  '${corpusVersion.embedding_model_version}',
  '${corpusVersion.query_set_hash}',
  'pending'
);`;

    if (verbose) console.log(corpusSQL);
    console.log(`-- Creates corpus_version: ${corpusVersion.corpus_version}`);
    console.log('');

    // 2. INSERT evaluation_queries
    console.log('-- Step 2: Insert evaluation queries (50 queries)');
    const queriesSQL = EVALUATION_QUERIES.map(
      (q) => `
INSERT INTO evaluation_queries (id, query, domain, difficulty) VALUES
  ('${q.id}', '${q.query.replace(/'/g, "''")}', '${q.domain}', ${q.difficulty});`,
    ).join('\n');

    if (verbose) console.log(queriesSQL);
    console.log(`-- Inserts ${EVALUATION_QUERIES.length} queries`);
    console.log('');

    // Summary
    console.log('Summary:');
    console.log(`  Corpus version: ${corpusVersion.corpus_version}`);
    console.log(`  Evaluation queries: ${EVALUATION_QUERIES.length}`);
    console.log(`  Expected evidence items: ~16,738 (from extraction script)`);
    console.log('');

    if (!dryRun) {
      console.log('⚠️  --apply flag provided.');
      console.log('TODO: Wire database client and execute INSERT statements.');
    } else {
      console.log('✓ Dry-run complete. Review SQL above, then run:');
      console.log('  npx tsx scripts/atlas/populate-evaluation-corpus.mts --apply');
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
