#!/usr/bin/env node
/**
 * Error Persistence to legal_ai_db
 * Integrates with chat-vector-storage.ts for semantic search + RAG
 *
 * Features:
 * - Stores errors with embeddings in pgvector
 * - Tracks fix attempts and success rates (confidence scoring)
 * - Enables semantic search for similar errors
 * - AI-assisted fix suggestions using RAG
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

// CLI Arguments (safe parsing: flags separate from values)
const args = process.argv.slice(2);
const FLAGS = new Set(args.filter(a => a.startsWith('--')));
const parseArg = (name, defaultVal) => {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  const next = args[idx + 1];
  return next && !next.startsWith('--') ? next : defaultVal;
};

const positionalInput = args.find(a => !a.startsWith('--'));
const inputFile = parseArg('input', positionalInput || 'reports/errors.jsonl');
const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:123456@localhost:5432/legal_ai_db';
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:4005';
const batchSize = parseInt(parseArg('batch', '100'));
const SHOW_STATS = FLAGS.has('--stats');
const VERBOSE = FLAGS.has('--verbose');

console.log('💾 Error Persistence to legal_ai_db\n');
console.log('═'.repeat(70));
console.log(`Input:    ${inputFile}`);
console.log(`Database: ${databaseUrl.replace(/:[^:@]+@/, ':***@')}`);
console.log(`Redis:    ${redisUrl}`);
console.log(`Batch:    ${batchSize}`);
console.log('═'.repeat(70) + '\n');

// Initialize PostgreSQL connection
const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// Load input data
console.log('📖 Loading error data...\n');

if (!fs.existsSync(inputFile)) {
  console.error(`❌ Input file not found: ${inputFile}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));

const clusters = data.clusters || [];
const metadata = data.metadata || {};

console.log(`  ✅ Loaded ${clusters.length} clusters`);
console.log(`  📊 Total errors: ${metadata.totalErrors || 'unknown'}\n`);

// ============================================================================
// DATABASE SCHEMA SETUP
// ============================================================================

async function ensureSchema() {
  console.log('🔧 Ensuring database schema...\n');

  const client = await pool.connect();

  try {
    // Enable pgvector extension
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('  ✅ pgvector extension enabled');

    // Create error_patterns table (RAG knowledge base)
    await client.query(`
      CREATE TABLE IF NOT EXISTS error_patterns (
        id SERIAL PRIMARY KEY,
        fingerprint VARCHAR(32) UNIQUE NOT NULL,
        error_code VARCHAR(50),
        error_message TEXT NOT NULL,
        normalized_pattern TEXT NOT NULL,
        file_pattern VARCHAR(500),
        category VARCHAR(100),
        severity VARCHAR(20) DEFAULT 'error',
        cluster_id VARCHAR(50),
        embedding VECTOR(768), -- Gemma embeddings
        first_seen TIMESTAMPTZ DEFAULT NOW(),
        last_seen TIMESTAMPTZ DEFAULT NOW(),
        occurrence_count INTEGER DEFAULT 1,
        metadata JSONB DEFAULT '{}'::jsonb
      );
    `);
    console.log('  ✅ error_patterns table ensured');

    // Create fix_attempts table (confidence scoring)
    await client.query(`
      CREATE TABLE IF NOT EXISTS fix_attempts (
        id SERIAL PRIMARY KEY,
        pattern_fingerprint VARCHAR(32) REFERENCES error_patterns(fingerprint) ON DELETE CASCADE,
        fix_type VARCHAR(100) NOT NULL,
        fix_description TEXT,
        fix_diff TEXT,
        applied_at TIMESTAMPTZ DEFAULT NOW(),
        success BOOLEAN,
        verified_at TIMESTAMPTZ,
        verification_method VARCHAR(100),
        files_affected INTEGER DEFAULT 1,
        errors_resolved INTEGER DEFAULT 0,
        errors_introduced INTEGER DEFAULT 0,
        rollback_performed BOOLEAN DEFAULT FALSE,
        metadata JSONB DEFAULT '{}'::jsonb
      );
    `);
    console.log('  ✅ fix_attempts table ensured');

    // Create error_resolution_history (time-series tracking)
    await client.query(`
      CREATE TABLE IF NOT EXISTS error_resolution_history (
        id SERIAL PRIMARY KEY,
        pattern_fingerprint VARCHAR(32) REFERENCES error_patterns(fingerprint) ON DELETE CASCADE,
        snapshot_date DATE DEFAULT CURRENT_DATE,
        total_occurrences INTEGER DEFAULT 0,
        resolved_count INTEGER DEFAULT 0,
        active_count INTEGER DEFAULT 0,
        confidence_score FLOAT DEFAULT 0.0,
        fix_success_rate FLOAT DEFAULT 0.0,
        metadata JSONB DEFAULT '{}'::jsonb
      );
    `);
    console.log('  ✅ error_resolution_history table ensured');

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_error_patterns_cluster
        ON error_patterns(cluster_id);
      CREATE INDEX IF NOT EXISTS idx_error_patterns_category
        ON error_patterns(category);
      CREATE INDEX IF NOT EXISTS idx_error_patterns_embedding
        ON error_patterns USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
      CREATE INDEX IF NOT EXISTS idx_fix_attempts_pattern
        ON fix_attempts(pattern_fingerprint);
      CREATE INDEX IF NOT EXISTS idx_fix_attempts_success
        ON fix_attempts(success) WHERE success = true;
      CREATE INDEX IF NOT EXISTS idx_resolution_history_date
        ON error_resolution_history(snapshot_date DESC);
    `);
    console.log('  ✅ Indexes created\n');

  } finally {
    client.release();
  }
}

// ============================================================================
// ERROR PATTERN PERSISTENCE
// ============================================================================

async function persistErrorPatterns(clusters) {
  console.log('💾 Persisting error patterns...\n');

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (let i = 0; i < clusters.length; i += batchSize) {
    const batch = clusters.slice(i, i + batchSize);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const cluster of batch) {
        // Extract representative pattern
        const dominantPattern = cluster.dominantPattern || cluster.allPatterns?.[0]?.pattern || 'unknown';
        const keywords = cluster.keywords || [];
        const errorCode = cluster.errorCode || 'unknown';

        // Generate fingerprint (consistent with parse-fast.mjs)
        const fingerprint = generateFingerprint(dominantPattern, errorCode);

        // Generate mock embedding (replace with real Gemma embeddings)
        const embedding = generateMockEmbedding(dominantPattern, keywords);

        // Extract file pattern (common directory)
        const filePattern = extractFilePattern(cluster.examples || []);

        // Determine category from pattern
        const category = categorizeError(dominantPattern, errorCode);

        // Insert or update error pattern
        const result = await client.query(`
          INSERT INTO error_patterns (
            fingerprint, error_code, error_message, normalized_pattern,
            file_pattern, category, cluster_id, embedding, occurrence_count, metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9, $10::jsonb)
          ON CONFLICT (fingerprint)
          DO UPDATE SET
            last_seen = NOW(),
            occurrence_count = error_patterns.occurrence_count + EXCLUDED.occurrence_count,
            metadata = error_patterns.metadata || EXCLUDED.metadata
          RETURNING id, (xmax = 0) AS inserted
        `, [
          fingerprint,
          errorCode,
          dominantPattern,
          normalizePattern(dominantPattern),
          filePattern,
          category,
          cluster.id,
          JSON.stringify(embedding),
          cluster.errorCount || 1,
          JSON.stringify({
            keywords,
            percentage: cluster.percentage,
            patternCount: cluster.patternCount,
            examples: (cluster.examples || []).slice(0, 3).map(ex => ({
              file: ex.file,
              line: ex.line,
              message: ex.message?.substring(0, 100)
            }))
          })
        ]);

        if (result.rows[0].inserted) {
          totalInserted++;
        } else {
          totalUpdated++;
        }
      }

      await client.query('COMMIT');

      console.log(`  📦 Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} patterns processed`);

    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  ❌ Batch failed: ${err.message}`);
      totalSkipped += batch.length;
    } finally {
      client.release();
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log('📊 PERSISTENCE RESULTS');
  console.log('═'.repeat(70));
  console.log(`Inserted: ${totalInserted}`);
  console.log(`Updated:  ${totalUpdated}`);
  console.log(`Skipped:  ${totalSkipped}`);
  console.log('═'.repeat(70) + '\n');

  return { totalInserted, totalUpdated, totalSkipped };
}

// ============================================================================
// SEMANTIC SEARCH FUNCTIONS
// ============================================================================

async function findSimilarErrors(errorMessage, limit = 5) {
  console.log('🔍 Searching for similar errors...\n');

  const embedding = generateMockEmbedding(errorMessage, []);

  const result = await pool.query(`
    SELECT
      fingerprint,
      error_code,
      error_message,
      normalized_pattern,
      category,
      occurrence_count,
      1 - (embedding <=> $1::vector) AS similarity
    FROM error_patterns
    WHERE 1 - (embedding <=> $1::vector) > 0.7
    ORDER BY similarity DESC
    LIMIT $2
  `, [JSON.stringify(embedding), limit]);

  console.log(`  ✅ Found ${result.rows.length} similar errors\n`);

  result.rows.forEach((row, idx) => {
    console.log(`  ${idx + 1}. ${row.error_code} (${(row.similarity * 100).toFixed(1)}% match)`);
    console.log(`     Pattern: ${row.normalized_pattern.substring(0, 60)}...`);
    console.log(`     Occurrences: ${row.occurrence_count}\n`);
  });

  return result.rows;
}

// ============================================================================
// CONFIDENCE SCORING
// ============================================================================

async function calculateConfidenceScores() {
  console.log('📈 Calculating confidence scores...\n');

  const result = await pool.query(`
    WITH fix_stats AS (
      SELECT
        pattern_fingerprint,
        COUNT(*) AS total_attempts,
        COUNT(*) FILTER (WHERE success = true) AS successful_fixes,
        SUM(errors_resolved) AS total_resolved,
        SUM(errors_introduced) AS total_introduced
      FROM fix_attempts
      WHERE verified_at IS NOT NULL
      GROUP BY pattern_fingerprint
    )
    SELECT
      ep.fingerprint,
      ep.error_code,
      ep.normalized_pattern,
      ep.occurrence_count,
      COALESCE(fs.total_attempts, 0) AS fix_attempts,
      COALESCE(fs.successful_fixes, 0) AS successful_fixes,
      CASE
        WHEN fs.total_attempts > 0
        THEN (fs.successful_fixes::float / fs.total_attempts::float)
        ELSE 0.0
      END AS success_rate,
      CASE
        WHEN fs.total_attempts >= 3 AND fs.successful_fixes::float / fs.total_attempts::float >= 0.8
        THEN 'high'
        WHEN fs.total_attempts >= 1 AND fs.successful_fixes::float / fs.total_attempts::float >= 0.5
        THEN 'medium'
        ELSE 'low'
      END AS confidence_level
    FROM error_patterns ep
    LEFT JOIN fix_stats fs ON ep.fingerprint = fs.pattern_fingerprint
    WHERE ep.occurrence_count > 0
    ORDER BY success_rate DESC, ep.occurrence_count DESC
    LIMIT 20
  `);

  console.log('  📊 Top 20 Patterns by Confidence:\n');
  console.log('  Rank | Pattern | Occurs | Attempts | Success | Confidence');
  console.log('  ─────┼─────────┼────────┼──────────┼─────────┼───────────');

  result.rows.forEach((row, idx) => {
    const pattern = row.normalized_pattern.substring(0, 30).padEnd(30);
    const occurs = String(row.occurrence_count).padStart(6);
    const attempts = String(row.fix_attempts).padStart(8);
    const success = `${(row.success_rate * 100).toFixed(0)}%`.padStart(7);
    const confidence = row.confidence_level.toUpperCase().padStart(10);

    console.log(`  ${String(idx + 1).padStart(4)} │ ${pattern} │ ${occurs} │ ${attempts} │ ${success} │ ${confidence}`);
  });

  console.log('\n');

  return result.rows;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateFingerprint(pattern, errorCode) {
  const normalized = `${errorCode}:${pattern.substring(0, 100)}`;
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 12);
}

function generateMockEmbedding(text, keywords) {
  // Mock 768-dimensional Gemma embedding
  // In production, use actual Gemma model via ollama
  const embedding = new Array(768).fill(0);

  // Simple hash-based embedding generation
  const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

  for (let i = 0; i < 768; i++) {
    embedding[i] = Math.sin(hash * (i + 1) / 768) * 0.5;
  }

  // Boost dimensions based on keywords
  keywords.forEach((keyword, idx) => {
    const keywordHash = keyword.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const dim = keywordHash % 768;
    embedding[dim] += 0.2;
  });

  return embedding;
}

function normalizePattern(pattern) {
  return pattern
    .toLowerCase()
    .replace(/\bidentifier\b/g, '<ID>')
    .replace(/\btype\b/g, '<TYPE>')
    .replace(/\bnumber\b/g, '<NUM>')
    .replace(/\bstring\b/g, '<STR>')
    .replace(/['"]/g, '')
    .trim();
}

function extractFilePattern(examples) {
  if (!examples || examples.length === 0) return 'unknown';

  const files = examples.map(ex => ex.file || '').filter(Boolean);
  if (files.length === 0) return 'unknown';

  // Find common directory prefix
  const paths = files.map(f => f.replace(/\\/g, '/').split('/'));
  const shortest = paths.reduce((min, p) => p.length < min ? p.length : min, Infinity);

  let commonPrefix = [];
  for (let i = 0; i < shortest; i++) {
    const segment = paths[0][i];
    if (paths.every(p => p[i] === segment)) {
      commonPrefix.push(segment);
    } else {
      break;
    }
  }

  return commonPrefix.slice(-3).join('/') || 'unknown';
}

function categorizeError(pattern, errorCode) {
  const lower = pattern.toLowerCase();

  if (lower.includes('import') && (lower.includes('type') || lower.includes('exported'))) {
    return 'import-type-misuse';
  }
  if (lower.includes('unused') || lower.includes('never read')) {
    return 'unused-variable';
  }
  if (lower.includes('cannot find') || lower.includes('does not exist')) {
    return 'missing-reference';
  }
  if (lower.includes('not assignable') || lower.includes('type mismatch')) {
    return 'type-mismatch';
  }
  if (lower.includes('expected') || lower.includes('identifier')) {
    return 'syntax-error';
  }

  return 'other';
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  try {
    // Step 1: Ensure schema
    await ensureSchema();

    // Step 2: Persist error patterns
    const persistResult = await persistErrorPatterns(clusters);

    // Step 3: Calculate confidence scores
    const confidenceScores = await calculateConfidenceScores();

    // Step 4: Demo semantic search
    console.log('🎯 Example: Semantic Search\n');
    await findSimilarErrors('Module has no exported member', 3);

    // Step 5: Generate summary report
    const summaryFile = path.join(path.dirname(inputFile), 'persistence-summary.json');
    const summary = {
      timestamp: new Date().toISOString(),
      input: inputFile,
      database: databaseUrl.replace(/:[^:@]+@/, ':***@'),
      results: persistResult,
      topConfidencePatterns: confidenceScores.slice(0, 10),
      nextSteps: [
        'Use semantic search: SELECT * FROM error_patterns WHERE 1 - (embedding <=> $1::vector) > 0.7',
        'Track fix success: INSERT INTO fix_attempts (pattern_fingerprint, fix_type, success) VALUES (...)',
        'Query confidence: SELECT * FROM error_patterns WHERE occurrence_count > 10 ORDER BY confidence_score DESC'
      ]
    };

    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    console.log(`📄 Summary saved: ${path.relative(process.cwd(), summaryFile)}\n`);

    console.log('═'.repeat(70));
    console.log('✅ ERROR PERSISTENCE COMPLETE');
    console.log('═'.repeat(70));
    console.log('\n💡 NEXT STEPS:\n');
    console.log('1. Semantic Search:');
    console.log('   SELECT * FROM error_patterns');
    console.log('   WHERE 1 - (embedding <=> \'[...]\'::vector) > 0.7\n');
    console.log('2. Track Fix Attempts:');
    console.log('   INSERT INTO fix_attempts (pattern_fingerprint, fix_type, success)');
    console.log('   VALUES (\'abc123\', \'import-fix\', true)\n');
    console.log('3. Confidence Scoring:');
    console.log('   SELECT fingerprint, success_rate FROM fix_attempts');
    console.log('   WHERE success_rate > 0.8 AND total_attempts >= 3\n');

  } catch (err) {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// ============================================================================
// --stats MODE: SHOW STATISTICS ONLY (NO PERSIST)
// ============================================================================

async function showStats() {
  console.log('📊 ERROR STATISTICS (--stats mode)\n');
  console.log('═'.repeat(70));

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Input file not found: ${inputFile}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
  const clusters = data.clusters || [];
  const metadata = data.metadata || {};

  console.log(`Input file: ${inputFile}`);
  console.log(`Clusters: ${clusters.length}`);
  console.log(`Total errors: ${metadata.totalErrors || 'unknown'}`);
  console.log('═'.repeat(70) + '\n');

  // Cluster distribution
  console.log('📈 DISTRIBUTION:\n');
  const clusterStats = {};
  clusters.forEach(c => {
    clusterStats[c.errorType || 'unknown'] = (clusterStats[c.errorType || 'unknown'] || 0) + (c.errorEvents?.length || 0);
  });

  Object.entries(clusterStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count], i) => {
      const pct = ((count / metadata.totalErrors) * 100).toFixed(1);
      console.log(`  ${String(i + 1).padStart(2)}) ${type.padEnd(40)} ${String(count).padStart(6)} (${pct}%)`);
    });

  console.log('\n✓ Statistics displayed (no changes made)\n');
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

if (SHOW_STATS) {
  await showStats();
} else {
  await main();
}
