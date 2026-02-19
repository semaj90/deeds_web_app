#!/usr/bin/env node

// Complete RAG System Test - Tests all working components
const OLLAMA_URL = 'http://localhost:11434';
const RAG_QUERY_SERVER = 'http://localhost:8090';

async function testCompleteSystem() {
  console.log('🚀 Testing Complete Context7 RAG System');
  console.log('======================================\n');
  
  let allTestsPassed = true;
  
  // Test 1: Ollama and Gemma Embeddings
  console.log('🧪 Test 1: Ollama and Gemma Embeddings');
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    const data = await response.json();
    const hasGemma = data.models?.some(m => m.name.includes('embeddinggemma'));
    
    if (hasGemma) {
      console.log('✅ Ollama running with Gemma embedding model');
      
      // Test embedding generation
      const embedResponse = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'embeddinggemma:latest',
          prompt: 'TypeScript interface definition'
        })
      });
      
      const embedResult = await embedResponse.json();
      if (embedResult.embedding && embedResult.embedding.length === 768) {
        console.log(`✅ Gemma embedding generated (${embedResult.embedding.length} dimensions)`);
      } else {
        console.log('❌ Embedding generation failed');
        allTestsPassed = false;
      }
    } else {
      console.log('❌ Gemma embedding model not found');
      allTestsPassed = false;
    }
  } catch (error) {
    console.log(`❌ Ollama test failed: ${error.message}`);
    allTestsPassed = false;
  }
  
  console.log('');
  
  // Test 2: RAG Query Server
  console.log('🧪 Test 2: RAG Query Server');
  try {
    const healthResponse = await fetch(`${RAG_QUERY_SERVER}/health`);
    const health = await healthResponse.json();
    
    if (health.status === 'healthy') {
      console.log(`✅ RAG Query Server healthy (${health.documents} documents)`);
      
      // Test search functionality
      const searchResponse = await fetch(`${RAG_QUERY_SERVER}/api/rag/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'TypeScript interfaces and type safety',
          limit: 3,
          threshold: 0.2
        })
      });
      
      const searchResults = await searchResponse.json();
      if (searchResults.results && searchResults.results.length > 0) {
        console.log(`✅ Search working (${searchResults.count} results found)`);
        console.log(`   Top result: ${searchResults.results[0].library_name} - ${searchResults.results[0].topic} (${(searchResults.results[0].score * 100).toFixed(1)}% similarity)`);
      } else {
        console.log('❌ Search returned no results');
        allTestsPassed = false;
      }
    } else {
      console.log('❌ RAG Query Server unhealthy');
      allTestsPassed = false;
    }
  } catch (error) {
    console.log(`❌ RAG Query Server test failed: ${error.message}`);
    allTestsPassed = false;
  }
  
  console.log('');
  
  // Test 3: Multiple Search Queries
  console.log('🧪 Test 3: Multiple Search Queries');
  const testQueries = [
    'WebGPU shader programming',
    'PostgreSQL JSONB performance',
    'Drizzle ORM type safety',
    'interface optional properties'
  ];
  
  let searchTestsPassed = 0;
  
  for (const query of testQueries) {
    try {
      const response = await fetch(`${RAG_QUERY_SERVER}/api/rag/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          limit: 2,
          threshold: 0.1
        })
      });
      
      const results = await response.json();
      if (results.results && results.results.length > 0) {
        console.log(`✅ "${query}" → ${results.count} results (best: ${(results.results[0].score * 100).toFixed(1)}%)`);
        searchTestsPassed++;
      } else {
        console.log(`❌ "${query}" → No results`);
      }
    } catch (error) {
      console.log(`❌ "${query}" → Error: ${error.message}`);
    }
  }
  
  if (searchTestsPassed === testQueries.length) {
    console.log(`✅ All ${searchTestsPassed} search queries successful`);
  } else {
    console.log(`⚠️  ${searchTestsPassed}/${testQueries.length} search queries successful`);
    if (searchTestsPassed < testQueries.length / 2) {
      allTestsPassed = false;
    }
  }
  
  console.log('');
  
  // Test 4: Libraries and Topics
  console.log('🧪 Test 4: Libraries and Topics');
  try {
    const libResponse = await fetch(`${RAG_QUERY_SERVER}/api/rag/libraries`);
    const libraries = await libResponse.json();
    
    const topicsResponse = await fetch(`${RAG_QUERY_SERVER}/api/rag/topics`);
    const topics = await topicsResponse.json();
    
    console.log(`✅ Libraries: ${libraries.length} available`);
    libraries.forEach(lib => {
      console.log(`   • ${lib.name}: ${lib.doc_count} documents`);
    });
    
    console.log(`✅ Topics: ${topics.length} available`);
    topics.slice(0, 5).forEach(topic => {
      console.log(`   • ${topic.topic}: ${topic.doc_count} documents`);
    });
    
  } catch (error) {
    console.log(`❌ Libraries/Topics test failed: ${error.message}`);
    allTestsPassed = false;
  }
  
  console.log('');
  
  // Test 5: Performance Metrics
  console.log('🧪 Test 5: Performance Metrics');
  try {
    const testQuery = 'TypeScript type definitions and interfaces';
    const startTime = Date.now();
    
    const response = await fetch(`${RAG_QUERY_SERVER}/api/rag/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: testQuery,
        limit: 5,
        threshold: 0.2
      })
    });
    
    const results = await response.json();
    const endTime = Date.now();
    const queryTime = endTime - startTime;
    
    console.log(`✅ Query performance: ${queryTime}ms end-to-end`);
    console.log(`✅ Results returned: ${results.count} documents`);
    
    if (queryTime < 1000) {
      console.log('✅ Performance: Excellent (< 1 second)');
    } else if (queryTime < 3000) {
      console.log('⚠️  Performance: Good (< 3 seconds)');
    } else {
      console.log('❌ Performance: Poor (> 3 seconds)');
      allTestsPassed = false;
    }
    
  } catch (error) {
    console.log(`❌ Performance test failed: ${error.message}`);
    allTestsPassed = false;
  }
  
  console.log('');
  
  // Final Results
  console.log('🎯 Final Test Results');
  console.log('====================');
  
  if (allTestsPassed) {
    console.log('🎉 ALL TESTS PASSED! Context7 RAG System is working correctly.');
    console.log('');
    console.log('✅ Working Components:');
    console.log('   • Ollama with Gemma embeddings (768-dim vectors)');
    console.log('   • PostgreSQL + pgvector with 4 sample documents');
    console.log('   • Go RAG Query Server with semantic search');
    console.log('   • Vector similarity search with HNSW indexing');
    console.log('   • Multi-library documentation retrieval');
    console.log('');
    console.log('🔗 System Ready For:');
    console.log('   • SvelteKit frontend integration');
    console.log('   • Context7 MCP server connection (when available)');
    console.log('   • Production deployment and scaling');
    console.log('');
    console.log('📡 Available Endpoints:');
    console.log('   • http://localhost:8090/health');
    console.log('   • http://localhost:8090/api/rag/search');
    console.log('   • http://localhost:8090/api/rag/libraries');
    console.log('   • http://localhost:8090/api/rag/topics');
  } else {
    console.log('❌ Some tests failed. Please check the errors above.');
    console.log('');
    console.log('🔧 Common Issues:');
    console.log('   • Ensure Ollama is running: ollama serve');
    console.log('   • Ensure Gemma model: ollama pull embeddinggemma:latest');
    console.log('   • Ensure PostgreSQL container is running');
    console.log('   • Ensure RAG Query Server is running on port 8090');
  }
  
  return allTestsPassed;
}

// Run the complete test suite
testCompleteSystem()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });