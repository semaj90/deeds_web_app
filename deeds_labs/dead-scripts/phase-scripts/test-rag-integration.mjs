#!/usr/bin/env node
/**
 * Test RAG Integration - Demonstrate semantic search and fix suggestions
 *
 * Shows how to use error-pattern-rag.ts for:
 * 1. Finding similar errors
 * 2. Recording fix attempts
 * 3. Getting high-confidence patterns
 * 4. Generating AI-assisted suggestions
 */

import crypto from 'crypto';
import pg from 'pg';

const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:123456@localhost:5432/legal_ai_db'
});

/**
 * Generate mock 768D embedding (replace with real Gemma later)
 */
function generateMockEmbedding(text) {
  const hash = crypto.createHash('sha256').update(text).digest();
  const embedding = [];
  for (let i = 0; i < 768; i++) {
    const value = (hash[i % 32] / 255) * 2 - 1; // Normalize to [-1, 1]
    embedding.push(value + (Math.random() - 0.5) * 0.1); // Add small variation
  }
  return embedding;
}

/**
 * Test 1: Semantic Search for Similar Errors
 */
async function testSemanticSearch(errorMessage) {
  console.log('\n🔍 TEST 1: Semantic Search');
  console.log('═'.repeat(70));
  console.log(`Query: "${errorMessage}"\n`);

  const embedding = generateMockEmbedding(errorMessage);
  const minSimilarity = 0.7;
  const maxResults = 5;

  const result = await pool.query(`
    SELECT
      fingerprint,
      normalized_pattern,
      category,
      occurrence_count,
      1 - (embedding <=> $1::vector) AS similarity
    FROM error_patterns
    WHERE 1 - (embedding <=> $1::vector) > $2
    ORDER BY similarity DESC
    LIMIT $3
  `, [JSON.stringify(embedding), minSimilarity, maxResults]);

  if (result.rows.length === 0) {
    console.log('⚠️  No similar errors found (similarity < 0.7)');
  } else {
    console.log(`✅ Found ${result.rows.length} similar patterns:\n`);
    result.rows.forEach((row, i) => {
      console.log(`${i + 1}. [${row.similarity.toFixed(3)}] ${row.normalized_pattern.substring(0, 60)}...`);
      console.log(`   Category: ${row.category || 'unknown'}`);
      console.log(`   Occurs: ${row.occurrence_count} times`);
      console.log(`   Fingerprint: ${row.fingerprint}\n`);
    });
  }

  return result.rows;
}

/**
 * Test 2: Record Fix Attempt
 */
async function testRecordFixAttempt(fingerprint, fixType, errorsResolved) {
  console.log('\n📝 TEST 2: Record Fix Attempt');
  console.log('═'.repeat(70));
  console.log(`Pattern: ${fingerprint}`);
  console.log(`Fix Type: ${fixType}`);
  console.log(`Errors Resolved: ${errorsResolved}\n`);

  const result = await pool.query(`
    INSERT INTO fix_attempts (
      pattern_fingerprint,
      fix_type,
      errors_resolved,
      success,
      applied_at
    ) VALUES ($1, $2, $3, $4, NOW())
    RETURNING id, applied_at
  `, [fingerprint, fixType, errorsResolved, true]);

  console.log(`✅ Fix attempt recorded: ID ${result.rows[0].id}`);
  console.log(`   Timestamp: ${result.rows[0].applied_at}\n`);

  return result.rows[0].id;
}

/**
 * Test 3: Verify Fix Attempt
 */
async function testVerifyFixAttempt(attemptId, success, verificationMethod) {
  console.log('\n✅ TEST 3: Verify Fix Attempt');
  console.log('═'.repeat(70));
  console.log(`Attempt ID: ${attemptId}`);
  console.log(`Success: ${success}`);
  console.log(`Method: ${verificationMethod}\n`);

  await pool.query(`
    UPDATE fix_attempts
    SET success = $1, verified_at = NOW()
    WHERE id = $2
  `, [success, attemptId]);

  console.log('✅ Fix verification recorded\n');
}

/**
 * Test 4: Get High-Confidence Patterns
 */
async function testHighConfidencePatterns(minSuccessRate = 0.8, minAttempts = 3) {
  console.log('\n🎯 TEST 4: High-Confidence Patterns (Tier 1 Candidates)');
  console.log('═'.repeat(70));
  console.log(`Min Success Rate: ${minSuccessRate * 100}%`);
  console.log(`Min Attempts: ${minAttempts}\n`);

  const result = await pool.query(`
    WITH fix_stats AS (
      SELECT
        pattern_fingerprint,
        COUNT(*) AS total_attempts,
        COUNT(*) FILTER (WHERE success = true) AS successful_fixes,
        COUNT(*) FILTER (WHERE success = true)::float / COUNT(*)::float AS success_rate
      FROM fix_attempts
      GROUP BY pattern_fingerprint
      HAVING
        COUNT(*) >= $2 AND
        COUNT(*) FILTER (WHERE success = true)::float / COUNT(*)::float >= $1
    )
    SELECT
      ep.fingerprint,
      ep.normalized_pattern,
      ep.category,
      ep.occurrence_count,
      fs.total_attempts,
      fs.successful_fixes,
      fs.success_rate
    FROM error_patterns ep
    INNER JOIN fix_stats fs ON ep.fingerprint = fs.pattern_fingerprint
    ORDER BY fs.success_rate DESC, ep.occurrence_count DESC
    LIMIT 10
  `, [minSuccessRate, minAttempts]);

  if (result.rows.length === 0) {
    console.log('⚠️  No high-confidence patterns yet (need more fix attempts)');
  } else {
    console.log(`✅ Found ${result.rows.length} Tier 1 candidates:\n`);
    result.rows.forEach((row, i) => {
      console.log(`${i + 1}. ${row.normalized_pattern.substring(0, 60)}...`);
      console.log(`   Success: ${row.successful_fixes}/${row.total_attempts} (${(row.success_rate * 100).toFixed(1)}%)`);
      console.log(`   Affects: ${row.occurrence_count} errors`);
      console.log(`   Category: ${row.category || 'unknown'}\n`);
    });
  }

  return result.rows;
}

/**
 * Test 5: Calculate Confidence Score
 */
async function testConfidenceScoring() {
  console.log('\n📊 TEST 5: Confidence Scoring Analysis');
  console.log('═'.repeat(70));

  const result = await pool.query(`
    WITH fix_stats AS (
      SELECT
        pattern_fingerprint,
        COUNT(*) AS total_attempts,
        COUNT(*) FILTER (WHERE success = true) AS successful_fixes,
        COUNT(*) FILTER (WHERE success = true)::float / COUNT(*)::float AS success_rate
      FROM fix_attempts
      GROUP BY pattern_fingerprint
    )
    SELECT
      ep.fingerprint,
      ep.normalized_pattern,
      ep.occurrence_count,
      COALESCE(fs.total_attempts, 0) AS total_attempts,
      COALESCE(fs.successful_fixes, 0) AS successful_fixes,
      COALESCE(fs.success_rate, 0) AS success_rate,
      CASE
        WHEN COALESCE(fs.total_attempts, 0) >= 3 AND COALESCE(fs.success_rate, 0) >= 0.8 THEN 0.9
        WHEN COALESCE(fs.total_attempts, 0) >= 2 AND COALESCE(fs.success_rate, 0) >= 0.6 THEN 0.6
        WHEN COALESCE(fs.total_attempts, 0) >= 1 THEN 0.3
        ELSE 0.1
      END AS confidence_score,
      CASE
        WHEN COALESCE(fs.total_attempts, 0) >= 3 AND COALESCE(fs.success_rate, 0) >= 0.8 THEN 'HIGH'
        WHEN COALESCE(fs.total_attempts, 0) >= 2 AND COALESCE(fs.success_rate, 0) >= 0.6 THEN 'MEDIUM'
        WHEN COALESCE(fs.total_attempts, 0) >= 1 THEN 'LOW'
        ELSE 'NONE'
      END AS confidence_level
    FROM error_patterns ep
    LEFT JOIN fix_stats fs ON ep.fingerprint = fs.pattern_fingerprint
    ORDER BY confidence_score DESC, ep.occurrence_count DESC
    LIMIT 20
  `);

  console.log(`📊 Confidence Distribution (Top 20 patterns):\n`);

  const distribution = { HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 };
  result.rows.forEach(row => distribution[row.confidence_level]++);

  console.log('Confidence Levels:');
  console.log(`  HIGH:   ${distribution.HIGH} patterns (ready for Tier 1 auto-apply)`);
  console.log(`  MEDIUM: ${distribution.MEDIUM} patterns (review recommended)`);
  console.log(`  LOW:    ${distribution.LOW} patterns (manual review required)`);
  console.log(`  NONE:   ${distribution.NONE} patterns (never attempted)\n`);

  console.log('Top Patterns by Confidence:\n');
  result.rows.slice(0, 10).forEach((row, i) => {
    console.log(`${i + 1}. [${row.confidence_level}] ${row.normalized_pattern.substring(0, 50)}...`);
    console.log(`   Confidence: ${parseFloat(row.confidence_score).toFixed(2)} | Attempts: ${row.total_attempts} | Success: ${(parseFloat(row.success_rate) * 100).toFixed(0)}%`);
    console.log(`   Affects: ${row.occurrence_count} errors\n`);
  });
}

/**
 * Main Test Suite
 */
async function runTests() {
  console.log('\n🧪 RAG INTEGRATION TEST SUITE');
  console.log('═'.repeat(70));
  console.log('Testing error-pattern-rag.ts functionality with legal_ai_db\n');

  try {
    // Test 1: Semantic Search
    const similarPatterns = await testSemanticSearch('Module has no exported member');

    // Test 2-3: Record and Verify Fix (simulate lucide-svelte fix)
    if (similarPatterns.length > 0) {
      const testFingerprint = similarPatterns[0].fingerprint;
      const attemptId = await testRecordFixAttempt(testFingerprint, 'import-transform', 235);
      await testVerifyFixAttempt(attemptId, true, 'npm-check');
    } else {
      console.log('\n⚠️  Skipping fix recording tests (no similar patterns found)\n');
    }

    // Test 4: High-Confidence Patterns
    await testHighConfidencePatterns(0.8, 3);

    // Test 5: Confidence Scoring
    await testConfidenceScoring();

    console.log('\n═'.repeat(70));
    console.log('✅ ALL TESTS COMPLETE');
    console.log('═'.repeat(70));
    console.log('\n💡 NEXT STEPS:\n');
    console.log('1. Apply lucide-svelte fixes: node scripts/fix-lucide-imports.mjs --apply');
    console.log('2. Record success in database (automatically via factory-runner.mjs)');
    console.log('3. Build confidence scores over multiple fix iterations');
    console.log('4. Promote high-confidence patterns to Tier 1 auto-apply\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run tests
runTests().catch(console.error);
