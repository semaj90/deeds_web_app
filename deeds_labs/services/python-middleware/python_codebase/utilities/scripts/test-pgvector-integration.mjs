#!/usr/bin/env node

/**
 * pgvector Integration Test Suite
 * Comprehensive validation of PostgreSQL + pgvector functionality
 *
 * Best Practices Implementation:
 * - Connection pool testing
 * - Vector similarity search validation
 * - Performance benchmarking
 * - Error handling verification
 * - Index optimization testing
 *
 * Usage: node test-pgvector-integration.mjs [--verbose] [--benchmark]
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// Test configuration
const TEST_CONFIG = {
  baseUrl: 'http://localhost:5175',
  endpoints: {
    connection: '/api/pgvector/test?action=connection',
    stats: '/api/pgvector/test?action=stats',
    seed: '/api/pgvector/test?action=seed&count=25',
    index: '/api/pgvector/test?action=index&lists=100&metric=cosine',
    search: '/api/pgvector/test?action=query',
    insert: '/api/pgvector/test?action=insert'
  },
  benchmarks: {
    maxResponseTime: {
      connection: 500,    // 500ms
      search: 1000,      // 1s
      insert: 200,       // 200ms
      stats: 300         // 300ms
    }
  }
};

// Test queries for vector similarity search
const TEST_QUERIES = [
  'contract liability and indemnification terms',
  'legal agreement obligations and responsibilities',
  'property deed transfer and ownership rights',
  'employment contract termination clauses',
  'intellectual property licensing agreements'
];

// Global test state
let testResults = {
  timestamp: new Date().toISOString(),
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0
  },
  tests: [],
  performance: {
    connectionTest: null,
    vectorSearch: [],
    documentInsert: null,
    databaseStats: null
  },
  errors: []
};

/**
 * HTTP request helper with timeout and error handling
 */
async function makeRequest(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = { rawResponse: text };
    }

    return {
      ok: response.ok,
      status: response.status,
      data
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw new Error(`Request failed: ${error.message}`);
  }
}

/**
 * Log test result with formatting
 */
function logTest(name, passed, message, duration = null) {
  const result = {
    name,
    passed,
    message,
    duration,
    timestamp: new Date().toISOString()
  };

  testResults.tests.push(result);
  testResults.summary.total++;

  if (passed) {
    testResults.summary.passed++;
    console.log(`✅ ${name}: ${message}${duration ? ` (${duration})` : ''}`);
  } else {
    testResults.summary.failed++;
    console.log(`❌ ${name}: ${message}${duration ? ` (${duration})` : ''}`);
    testResults.errors.push(result);
  }
}

/**
 * Test 1: Database Connection and pgvector Extension
 */
async function testDatabaseConnection() {
  console.log('\n🔍 Testing Database Connection...');

  try {
    const startTime = Date.now();
    const response = await makeRequest(`${TEST_CONFIG.baseUrl}${TEST_CONFIG.endpoints.connection}`);
    const duration = `${Date.now() - startTime}ms`;

    testResults.performance.connectionTest = Date.now() - startTime;

    if (!response.ok) {
      logTest('Database Connection', false, `HTTP ${response.status}`, duration);
      return false;
    }

    const { data } = response;

    if (!data.success) {
      logTest('Database Connection', false, data.error || 'Connection failed', duration);
      return false;
    }

    // Validate connection details
    if (!data.details.connection) {
      logTest('Database Connection', false, 'Missing connection details', duration);
      return false;
    }

    logTest('Database Connection', true, 'PostgreSQL connected successfully', duration);

    // Test pgvector extension
    if (data.details.pgvectorExtension?.extversion) {
      logTest('pgvector Extension', true, `Version ${data.details.pgvectorExtension.extversion} detected`, duration);
    } else {
      logTest('pgvector Extension', false, 'pgvector extension not found or not enabled', duration);
      return false;
    }

    // Test connection pool
    const poolStatus = data.details.connectionPool;
    if (poolStatus && poolStatus.totalCount > 0) {
      logTest('Connection Pool', true, `${poolStatus.totalCount} total, ${poolStatus.idleCount} idle connections`, duration);
    } else {
      logTest('Connection Pool', false, 'Connection pool not configured properly', duration);
    }

    return true;
  } catch (error) {
    logTest('Database Connection', false, error.message);
    return false;
  }
}

/**
 * Test 2: Database Statistics and Schema Validation
 */
async function testDatabaseStats() {
  console.log('\n📊 Testing Database Statistics...');

  try {
    const startTime = Date.now();
    const response = await makeRequest(`${TEST_CONFIG.baseUrl}${TEST_CONFIG.endpoints.stats}`);
    const duration = `${Date.now() - startTime}ms`;

    testResults.performance.databaseStats = Date.now() - startTime;

    if (!response.ok) {
      logTest('Database Stats', false, `HTTP ${response.status}`, duration);
      return false;
    }

    const { data } = response;

    if (!data.success) {
      logTest('Database Stats', false, data.error || 'Stats query failed', duration);
      return false;
    }

    logTest('Database Stats', true, 'Statistics retrieved successfully', duration);

    // Validate schema components
    const stats = data.stats;

    if (stats.vectors) {
      logTest('Vector Schema', true, `${stats.vectors.total_embeddings || 0} embeddings found`);
    } else {
      logTest('Vector Schema', false, 'Vector embeddings table not accessible');
    }

    if (stats.documents && Array.isArray(stats.documents)) {
      logTest('Document Types', true, `${stats.documents.length} document types detected`);
    } else {
      logTest('Document Types', false, 'Document metadata not accessible');
    }

    if (stats.indexes && Array.isArray(stats.indexes)) {
      const vectorIndexes = stats.indexes.filter(idx => idx.indexname?.includes('vector') || idx.indexname?.includes('embedding'));
      logTest('Vector Indexes', true, `${vectorIndexes.length} vector indexes found`);
    }

    return true;
  } catch (error) {
    logTest('Database Stats', false, error.message);
    return false;
  }
}

/**
 * Test 3: Document Seeding and Batch Operations
 */
async function testDocumentSeeding() {
  console.log('\n🌱 Testing Document Seeding...');

  try {
    const startTime = Date.now();
    const response = await makeRequest(`${TEST_CONFIG.baseUrl}${TEST_CONFIG.endpoints.seed}`);
    const duration = `${Date.now() - startTime}ms`;

    if (!response.ok) {
      logTest('Document Seeding', false, `HTTP ${response.status}`, duration);
      return false;
    }

    const { data } = response;

    if (!data.success) {
      logTest('Document Seeding', false, data.error || 'Seeding failed', duration);
      return false;
    }

    logTest('Document Seeding', true, `${data.documentsCreated || 'Multiple'} sample documents created`, duration);
    return true;
  } catch (error) {
    logTest('Document Seeding', false, error.message);
    return false;
  }
}

/**
 * Test 4: Vector Index Creation (IVFFLAT)
 */
async function testIndexCreation() {
  console.log('\n🗂️ Testing Vector Index Creation...');

  try {
    const startTime = Date.now();
    const response = await makeRequest(`${TEST_CONFIG.baseUrl}${TEST_CONFIG.endpoints.index}`);
    const duration = `${Date.now() - startTime}ms`;

    if (!response.ok) {
      logTest('Index Creation', false, `HTTP ${response.status}`, duration);
      return false;
    }

    const { data } = response;

    if (!data.success) {
      // Index might already exist - check if it's a "already exists" error
      if (data.error && data.error.includes('already exists')) {
        logTest('Index Creation', true, 'IVFFLAT index already exists (skipped)', duration);
        return true;
      }
      logTest('Index Creation', false, data.error || 'Index creation failed', duration);
      return false;
    }

    logTest('Index Creation', true, 'IVFFLAT index created successfully', duration);
    return true;
  } catch (error) {
    logTest('Index Creation', false, error.message);
    return false;
  }
}

/**
 * Test 5: Vector Similarity Search with Multiple Queries
 */
async function testVectorSimilaritySearch() {
  console.log('\n🔍 Testing Vector Similarity Search...');

  let allPassed = true;

  for (const query of TEST_QUERIES) {
    try {
      const startTime = Date.now();
      const response = await makeRequest(`${TEST_CONFIG.baseUrl}${TEST_CONFIG.endpoints.search}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          limit: 10,
          documentType: undefined
        })
      });

      const duration = Date.now() - startTime;
      const durationStr = `${duration}ms`;

      testResults.performance.vectorSearch.push({
        query,
        duration,
        resultsCount: 0
      });

      if (!response.ok) {
        logTest(`Vector Search: "${query.substring(0, 30)}..."`, false, `HTTP ${response.status}`, durationStr);
        allPassed = false;
        continue;
      }

      const { data } = response;

      if (!data.success) {
        logTest(`Vector Search: "${query.substring(0, 30)}..."`, false, data.error || 'Search failed', durationStr);
        allPassed = false;
        continue;
      }

      const resultsCount = data.results ? data.results.length : 0;
      testResults.performance.vectorSearch[testResults.performance.vectorSearch.length - 1].resultsCount = resultsCount;

      // Performance benchmark check
      if (duration > TEST_CONFIG.benchmarks.maxResponseTime.search) {
        logTest(`Vector Search: "${query.substring(0, 30)}..."`, false, `Too slow: ${durationStr} > ${TEST_CONFIG.benchmarks.maxResponseTime.search}ms`, durationStr);
        allPassed = false;
      } else {
        logTest(`Vector Search: "${query.substring(0, 30)}..."`, true, `${resultsCount} results found`, durationStr);
      }

      // Validate result structure
      if (data.results && data.results.length > 0) {
        const firstResult = data.results[0];
        if (!firstResult.document_id || firstResult.distance === undefined) {
          logTest('Search Result Structure', false, 'Invalid result format (missing document_id or distance)');
          allPassed = false;
        } else {
          logTest('Search Result Structure', true, 'Results properly formatted with distance scores');
        }
      }
    } catch (error) {
      logTest(`Vector Search: "${query.substring(0, 30)}..."`, false, error.message);
      allPassed = false;
    }
  }

  return allPassed;
}

/**
 * Test 6: Document Insertion with Custom Embedding
 */
async function testDocumentInsertion() {
  console.log('\n📝 Testing Document Insertion...');

  const testDoc = {
    documentId: `integration-test-${Date.now()}`,
    content: `
      PGVECTOR INTEGRATION TEST DOCUMENT

      This is a comprehensive test document for validating pgvector integration
      with PostgreSQL. It contains sample legal content including contract terms,
      liability clauses, and indemnification provisions for testing vector
      similarity search functionality.

      The document includes:
      - Contract obligations and responsibilities
      - Liability limitations and exclusions
      - Indemnification and hold harmless clauses
      - Performance standards and benchmarks
      - Termination and breach provisions
    `,
    embedding: generateMockEmbedding(),
    metadata: {
      title: 'pgvector Integration Test Document',
      type: 'test_contract',
      tags: ['integration', 'test', 'pgvector', 'legal'],
      testRun: new Date().toISOString()
    }
  };

  try {
    const startTime = Date.now();
    const response = await makeRequest(`${TEST_CONFIG.baseUrl}${TEST_CONFIG.endpoints.insert}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testDoc)
    });

    const duration = `${Date.now() - startTime}ms`;
    testResults.performance.documentInsert = Date.now() - startTime;

    if (!response.ok) {
      logTest('Document Insertion', false, `HTTP ${response.status}`, duration);
      return false;
    }

    const { data } = response;

    if (!data.success) {
      logTest('Document Insertion', false, data.error || 'Insert failed', duration);
      return false;
    }

    // Performance benchmark check
    if (testResults.performance.documentInsert > TEST_CONFIG.benchmarks.maxResponseTime.insert) {
      logTest('Document Insertion', false, `Too slow: ${duration} > ${TEST_CONFIG.benchmarks.maxResponseTime.insert}ms`, duration);
      return false;
    }

    logTest('Document Insertion', true, `Test document inserted successfully`, duration);

    // Verify document can be found via search
    const searchResponse = await makeRequest(`${TEST_CONFIG.baseUrl}${TEST_CONFIG.endpoints.search}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'pgvector integration test',
        limit: 5
      })
    });

    if (searchResponse.ok && searchResponse.data.success) {
      const foundDoc = searchResponse.data.results?.find(r => r.document_id === testDoc.documentId);
      if (foundDoc) {
        logTest('Document Retrieval', true, `Inserted document found via vector search (distance: ${foundDoc.distance?.toFixed(4)})`);
      } else {
        logTest('Document Retrieval', false, 'Inserted document not found in search results');
      }
    }

    return true;
  } catch (error) {
    logTest('Document Insertion', false, error.message);
    return false;
  }
}

/**
 * Generate mock 1536-dimension embedding for testing
 */
function generateMockEmbedding() {
  const embedding = [];
  for (let i = 0; i < 1536; i++) {
    embedding.push(Math.sin(i * 0.1) * Math.cos(i * 0.05) + Math.random() * 0.1 - 0.05);
  }
  return embedding;
}

/**
 * Performance Analysis and Reporting
 */
function analyzePerformance() {
  console.log('\n📊 Performance Analysis:');

  const perf = testResults.performance;

  // Connection test performance
  if (perf.connectionTest) {
    const connectionGood = perf.connectionTest < TEST_CONFIG.benchmarks.maxResponseTime.connection;
    console.log(`   Connection Test: ${perf.connectionTest}ms ${connectionGood ? '✅' : '⚠️'}`);
  }

  // Vector search performance
  if (perf.vectorSearch.length > 0) {
    const avgSearchTime = perf.vectorSearch.reduce((sum, s) => sum + s.duration, 0) / perf.vectorSearch.length;
    const totalResults = perf.vectorSearch.reduce((sum, s) => sum + s.resultsCount, 0);
    const searchGood = avgSearchTime < TEST_CONFIG.benchmarks.maxResponseTime.search;

    console.log(`   Vector Search Avg: ${Math.round(avgSearchTime)}ms ${searchGood ? '✅' : '⚠️'}`);
    console.log(`   Total Results Found: ${totalResults}`);
  }

  // Document insertion performance
  if (perf.documentInsert) {
    const insertGood = perf.documentInsert < TEST_CONFIG.benchmarks.maxResponseTime.insert;
    console.log(`   Document Insert: ${perf.documentInsert}ms ${insertGood ? '✅' : '⚠️'}`);
  }

  // Database stats performance
  if (perf.databaseStats) {
    const statsGood = perf.databaseStats < TEST_CONFIG.benchmarks.maxResponseTime.stats;
    console.log(`   Database Stats: ${perf.databaseStats}ms ${statsGood ? '✅' : '⚠️'}`);
  }
}

/**
 * Save test results to file
 */
function saveTestResults() {
  const logsDir = join(process.cwd(), 'logs');
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }

  const filename = `pgvector-integration-test-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const filepath = join(logsDir, filename);

  writeFileSync(filepath, JSON.stringify(testResults, null, 2));
  console.log(`\n📄 Test results saved to: ${filepath}`);

  // Also save a summary report
  const summaryFilename = `pgvector-test-summary.json`;
  const summaryPath = join(logsDir, summaryFilename);

  const summary = {
    timestamp: testResults.timestamp,
    summary: testResults.summary,
    performance: testResults.performance,
    recentErrors: testResults.errors.slice(-5) // Last 5 errors
  };

  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`📄 Test summary saved to: ${summaryPath}`);
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🧠 pgvector Integration Test Suite');
  console.log('=====================================');
  console.log(`Testing endpoint: ${TEST_CONFIG.baseUrl}`);

  const tests = [
    testDatabaseConnection,
    testDatabaseStats,
    testDocumentSeeding,
    testIndexCreation,
    testVectorSimilaritySearch,
    testDocumentInsertion
  ];

  let allPassed = true;

  for (const test of tests) {
    try {
      const result = await test();
      if (!result) {
        allPassed = false;
      }
    } catch (error) {
      console.log(`❌ Test failed with exception: ${error.message}`);
      testResults.summary.total++;
      testResults.summary.failed++;
      allPassed = false;
    }
  }

  // Performance analysis
  analyzePerformance();

  // Final summary
  console.log('\n🏁 Test Summary:');
  console.log(`   Total Tests: ${testResults.summary.total}`);
  console.log(`   Passed: ${testResults.summary.passed} ✅`);
  console.log(`   Failed: ${testResults.summary.failed} ❌`);
  console.log(`   Success Rate: ${Math.round((testResults.summary.passed / testResults.summary.total) * 100)}%`);

  if (allPassed) {
    console.log('\n🎉 All tests passed! pgvector integration is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the errors above for details.');
  }

  // Save results
  saveTestResults();

  // Exit with appropriate code
  process.exit(allPassed ? 0 : 1);
}

// Run tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}
