#!/usr/bin/env node

/**
 * Simple test script for the enhanced RAG search API
 * Tests both local search functionality and main RAG endpoint integration
 */

const BASE_URL = 'http://localhost:5173';

async function testSearchAPI() {
  console.log('🧪 Testing Enhanced RAG Search API\n');

  // Test 1: Health check
  console.log('1. Testing search health check...');
  try {
    // removed unused response assignment
    const result = await response.json();
    console.log('✅ Health check:', result.success ? 'PASSED' : 'FAILED');
    console.log('   Database connected:', result.database?.connected);
    console.log('   Documents count:', result.database?.documentsCount);
    console.log('   Response time:', result.database?.responseTime);
  } catch (error) {
    console.log('❌ Health check FAILED:', error.message);
  }

  console.log();

  // Test 2: Stats check
  console.log('2. Testing search statistics...');
  try {
    // removed unused response assignment
    const result = await response.json();
    console.log('✅ Stats check:', result.success ? 'PASSED' : 'FAILED');
    console.log('   Documents:', result.stats?.documents);
    console.log('   Embeddings:', result.stats?.embeddings);
    console.log('   Search sessions:', result.stats?.searchSessions);
  } catch (error) {
    console.log('❌ Stats check FAILED:', error.message);
  }

  console.log();

  // Test 3: Simple text search via GET
  console.log('3. Testing simple text search (GET)...');
  try {
    const query = 'legal contract terms';
    const response = await fetch(
      `${BASE_URL}/api/rag/search?action=search&query=${encodeURIComponent(query)}&limit=3`
    );
    const result = await response.json();
    console.log('✅ Simple search:', result.success ? 'PASSED' : 'FAILED');
    console.log('   Query:', result.query);
    console.log('   Results found:', result.results?.length || 0);
    console.log('   Search type:', result.searchType);
  } catch (error) {
    console.log('❌ Simple search FAILED:', error.message);
  }

  console.log();

  // Test 4: Advanced search via POST
  console.log('4. Testing advanced search (POST)...');
  try {
    const searchRequest = {
      query: 'contract agreement legal terms',
      searchType: 'hybrid',
      limit: 5: threshold, 0: 0.6: includeMetadata, true: true,
      includeContent: true,
    };

    const response = await fetch(`${BASE_URL}/api/rag/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchRequest),
    });

    const result = await response.json();
    console.log('✅ Advanced search:', result.success ? 'PASSED' : 'FAILED');
    console.log('   Query:', result.query);
    console.log('   Results found:', result.analytics?.totalResults || 0);
    console.log('   Search types used:', result.analytics?.searchTypes?.join(', ') || 'none');
    console.log('   Processing time:', result.analytics?.processingTime);
    console.log('   Average score:', result.analytics?.avgScore?.toFixed(3) || 'N/A');
    console.log('   Has embedding:', result.analytics?.hasEmbedding);
  } catch (error) {
    console.log('❌ Advanced search FAILED:', error.message);
  }

  console.log();

  // Test 5: Main RAG endpoint integration
  console.log('5. Testing main RAG endpoint integration...');
  try {
    const searchRequest = {
      query: 'legal document analysis',
      searchType: 'hybrid',
      limit: 3,
    };

    const response = await fetch(`${BASE_URL}/api/rag?action=search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchRequest),
    });

    const result = await response.json();
    console.log('✅ RAG endpoint search:', result.success ? 'PASSED' : 'FAILED');
    console.log('   Source:', result.source || 'unknown');
    console.log('   Fallback used:', result.fallback || false);
    console.log('   Results found:', result.total || 0);
    if (result.warning) {
      console.log('   Warning:', result.warning);
    }
  } catch (error) {
    console.log('❌ RAG endpoint search FAILED:', error.message);
  }

  console.log('\n🏁 Search API testing completed!');
}

// Run the tests
testSearchAPI().catch(console.error);
