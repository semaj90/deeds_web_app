#!/usr/bin/env node
import fs from 'fs/promises';
import fetch from 'node-fetch';

// Test script for Context7 RAG Pipeline
// Tests all components: Context7 MCP, Go RAG Server, SvelteKit API

const ENDPOINTS = {
  context7: 'http://localhost:4000',
  ragQuery: 'http://localhost:8090', 
  svelteKit: 'http://localhost:5173',
  ollama: 'http://localhost:11434'
};

const TEST_QUERIES = [
  'TypeScript interfaces and type definitions',
  'WebGPU shader programming with WGSL',
  'PostgreSQL JSONB indexing and performance',
  'Drizzle ORM schema migrations'
];

interface TestResult {
  test: string;
  success: boolean;
  duration: number;
  data?: any;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(testName: string, testFn: () => Promise<any>): Promise<void> {
  console.log(`🧪 Running test: ${testName}`);
  const startTime = Date.now();
  
  try {
    const data = await testFn();
    const duration = Date.now() - startTime;
    
    results.push({
      test: testName,
      success: true,
      duration,
      data
    });
    
    console.log(`✅ ${testName} - ${duration}ms`);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    results.push({
      test: testName,
      success: false,
      duration,
      error: error.message
    });
    
    console.log(`❌ ${testName} - ${error.message}`);
  }
}

async function testServiceHealth(): Promise<any> {
  const services = [];
  
  // Test Context7 MCP Server
  try {
    const response = await fetch(`${ENDPOINTS.context7}/health`, { timeout: 5000 });
    services.push({
      name: 'Context7 MCP Server',
      status: response.ok ? 'healthy' : 'unhealthy',
      port: 4000
    });
  } catch (error) {
    services.push({
      name: 'Context7 MCP Server',
      status: 'unreachable',
      port: 4000
    });
  }
  
  // Test Go RAG Query Server
  try {
    const response = await fetch(`${ENDPOINTS.ragQuery}/health`, { timeout: 5000 });
    const health = await response.json();
    services.push({
      name: 'Go RAG Query Server',
      status: health.status,
      port: 8090,
      documents: health.documents
    });
  } catch (error) {
    services.push({
      name: 'Go RAG Query Server',
      status: 'unreachable',
      port: 8090
    });
  }
  
  // Test Ollama
  try {
    const response = await fetch(`${ENDPOINTS.ollama}/api/tags`, { timeout: 5000 });
    const tags = await response.json();
    const hasGemma = tags.models?.some((m: any) => m.name.includes('embeddinggemma'));
    services.push({
      name: 'Ollama',
      status: 'healthy',
      port: 11434,
      gemma_available: hasGemma
    });
  } catch (error) {
    services.push({
      name: 'Ollama',
      status: 'unreachable',
      port: 11434
    });
  }
  
  return services;
}

async function testContext7DocFetch(): Promise<any> {
  const payload = {
    name: 'get_library_docs',
    arguments: {
      context7CompatibleLibraryID: 'typescript',
      topic: 'interfaces',
      tokens: 5000,
      format: 'markdown'
    }
  };
  
  const response = await fetch(`${ENDPOINTS.context7}/tools/call`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload),
    timeout: 30000
  });
  
  if (!response.ok) {
    throw new Error(`Context7 fetch failed: ${response.status}`);
  }
  
  const result = await response.json();
  
  if (!result.success || !result.result?.content) {
    throw new Error('No content returned from Context7');
  }
  
  return {
    library: 'typescript',
    topic: 'interfaces',
    content_length: result.result.content.length,
    has_metadata: !!result.result.metadata
  };
}

async function testGemmaEmbedding(): Promise<any> {
  const payload = {
    model: 'embeddinggemma:latest',
    prompt: 'TypeScript interface definition example'
  };
  
  const response = await fetch(`${ENDPOINTS.ollama}/api/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    timeout: 30000
  });
  
  if (!response.ok) {
    throw new Error(`Embedding generation failed: ${response.status}`);
  }
  
  const result = await response.json();
  
  if (!result.embedding || !Array.isArray(result.embedding)) {
    throw new Error('Invalid embedding response');
  }
  
  return {
    model: 'embeddinggemma:latest',
    embedding_dimension: result.embedding.length,
    embedding_sample: result.embedding.slice(0, 5)
  };
}

async function testRAGSearch(query: string): Promise<any> {
  const payload = {
    query,
    limit: 5,
    threshold: 0.7
  };
  
  const response = await fetch(`${ENDPOINTS.ragQuery}/api/rag/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    timeout: 30000
  });
  
  if (!response.ok) {
    throw new Error(`RAG search failed: ${response.status}`);
  }
  
  const result = await response.json();
  
  return {
    query,
    results_count: result.count || 0,
    top_score: result.results?.[0]?.score || 0,
    libraries_found: [...new Set(result.results?.map((r: any) => r.library_name) || [])]
  };
}

async function testSvelteKitAPI(): Promise<any> {
  // Test libraries endpoint
  const libResponse = await fetch(`${ENDPOINTS.svelteKit}/api/context7/docs?action=libraries`, {
    timeout: 10000
  });
  
  if (!libResponse.ok) {
    throw new Error(`SvelteKit API failed: ${libResponse.status}`);
  }
  
  const libResult = await libResponse.json();
  
  // Test search endpoint
  const searchResponse = await fetch(`${ENDPOINTS.svelteKit}/api/context7/docs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'search',
      query: 'TypeScript interfaces',
      limit: 3
    }),
    timeout: 30000
  });
  
  if (!searchResponse.ok) {
    throw new Error(`SvelteKit search failed: ${searchResponse.status}`);
  }
  
  const searchResult = await searchResponse.json();
  
  return {
    libraries_available: libResult.libraries?.length || 0,
    search_results: searchResult.count || 0,
    search_service: searchResult.service || 'unknown'
  };
}

async function testLibrariesAndTopics(): Promise<any> {
  const libResponse = await fetch(`${ENDPOINTS.ragQuery}/api/rag/libraries`);
  const libraries = await libResponse.json();
  
  const topicsResponse = await fetch(`${ENDPOINTS.ragQuery}/api/rag/topics`);
  const topics = await topicsResponse.json();
  
  return {
    libraries_count: libraries.length,
    topics_count: topics.length,
    libraries: libraries.map((l: any) => ({ id: l.id, name: l.name, docs: l.doc_count })),
    topics: topics.slice(0, 10).map((t: any) => ({ topic: t.topic, docs: t.doc_count }))
  };
}

async function generateReport(): Promise<void> {
  const timestamp = new Date().toISOString();
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  const report = {
    timestamp,
    summary: {
      total_tests: totalCount,
      passed: successCount,
      failed: totalCount - successCount,
      success_rate: `${Math.round((successCount / totalCount) * 100)}%`
    },
    results,
    performance: {
      average_duration: Math.round(results.reduce((sum, r) => sum + r.duration, 0) / totalCount),
      fastest_test: results.reduce((min, r) => r.duration < min.duration ? r : min),
      slowest_test: results.reduce((max, r) => r.duration > max.duration ? r : max)
    }
  };
  
  // Save report to file
  const reportPath = `./context7-rag-test-report-${Date.now()}.json`;
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  
  console.log('\n📊 Test Summary:');
  console.log(`✅ Passed: ${successCount}/${totalCount} (${report.summary.success_rate})`);
  console.log(`⏱️  Average Duration: ${report.performance.average_duration}ms`);
  console.log(`📁 Report saved to: ${reportPath}`);
  
  if (successCount === totalCount) {
    console.log('\n🎉 All tests passed! Context7 RAG pipeline is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the report for details.');
  }
}

async function main(): Promise<void> {
  console.log('🚀 Context7 RAG Pipeline Test Suite');
  console.log('=====================================\n');
  
  // Run all tests
  await runTest('Service Health Check', testServiceHealth);
  await runTest('Context7 Documentation Fetch', testContext7DocFetch);
  await runTest('Gemma Embedding Generation', testGemmaEmbedding);
  await runTest('Libraries and Topics', testLibrariesAndTopics);
  
  // Test RAG search with multiple queries
  for (const query of TEST_QUERIES) {
    await runTest(`RAG Search: "${query}"`, () => testRAGSearch(query));
  }
  
  await runTest('SvelteKit API Integration', testSvelteKitAPI);
  
  // Generate report
  console.log('\n📊 Generating test report...');
  await generateReport();
}

// Run the tests
main().catch(console.error);