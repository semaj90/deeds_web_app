#!/usr/bin/env node
/**
 * Test Full Legal AI Pipeline Integration
 * Tests the complete flow: MCP → Web Crawl → Ingestion → Agent Analysis
 */

import fetch from 'node-fetch';
import { RabbitMQIngestHelper } from './rabbitmq-ingest.js';

async function testWebCrawlService() {
  console.log('🧪 Testing FastAPI Web Crawl Service...');

  try {
    const response = await fetch('http://localhost:8103/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://www.law.com',
        max_depth: 1,
        max_pages: 2,
        delay_seconds: 1.0,
        timeout_seconds: 10
      })
    });

    if (!response.ok) {
      console.log('❌ Web crawl service not available');
      return false;
    }

    const result = await response.json();
    console.log('✅ Web crawl service responding');
    console.log(`📄 Pages crawled: ${result.pages_crawled || 0}`);
    return true;
  } catch (error) {
    console.log('❌ Web crawl service error:', error.message);
    return false;
  }
}

async function testMCPWebCrawl() {
  console.log('🧪 Testing MCP Web Crawl Tool...');

  try {
    const response = await fetch('http://localhost:3003/mcp/tools/web_crawl_legal_documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://www.courtlistener.com',
        maxDepth: 1,
        maxPages: 2,
        legalDomains: ['courtlistener.com']
      })
    });

    if (!response.ok) {
      console.log('❌ MCP web crawl tool not available');
      return false;
    }

    const result = await response.json();
    console.log('✅ MCP web crawl tool responding');

    if (result.content && result.content[0]) {
      const data = JSON.parse(result.content[0].text);
      console.log(`📤 Ingestion job ID: ${data.ingestion_job_id || 'None'}`);
    }

    return true;
  } catch (error) {
    console.log('❌ MCP web crawl error:', error.message);
    return false;
  }
}

async function testRabbitMQIngestion() {
  console.log('🧪 Testing RabbitMQ Ingestion Pipeline...');

  try {
    const helper = new RabbitMQIngestHelper();
    await helper.connect();

    // Test queue status
    const status = await helper.getQueueStatus();
    console.log('✅ RabbitMQ connected');
    console.log(`📊 Queue status: ${status.messageCount} messages, ${status.consumerCount} consumers`);

    // Test publishing mock data
    const mockCrawlResult = {
      url: 'https://test-legal-site.com',
      pages_crawled: 1,
      pages: [{
        url: 'https://test-legal-site.com/contract',
        title: 'Test Legal Contract',
        content: 'This is a test legal contract for pipeline validation.',
        metadata: { test: true },
        crawled_at: new Date().toISOString()
      }]
    };

    const jobId = await helper.publishCrawledDocuments(mockCrawlResult);
    console.log(`✅ Published test ingestion job: ${jobId}`);

    await helper.close();
    return true;
  } catch (error) {
    console.log('❌ RabbitMQ ingestion error:', error.message);
    return false;
  }
}

async function testSvelteKitEvidenceAPI() {
  console.log('🧪 Testing SvelteKit Evidence Collection API...');

  try {
    const response = await fetch('http://localhost:5173/api/evidence/from-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://www.supremecourt.gov',
        maxDepth: 1,
        maxPages: 1
      })
    });

    if (!response.ok) {
      console.log('❌ SvelteKit evidence API not available');
      return false;
    }

    const result = await response.json();
    console.log('✅ SvelteKit evidence API responding');
    console.log(`📋 Evidence collected: ${result.evidence_collected || 0} items`);
    return true;
  } catch (error) {
    console.log('❌ SvelteKit evidence API error:', error.message);
    return false;
  }
}

async function testGemma3LegalAgent() {
  console.log('🧪 Testing Gemma3-Legal Agent Service...');

  try {
    // Test health check
    const healthResponse = await fetch('http://localhost:8095/health');
    if (!healthResponse.ok) {
      console.log('❌ Gemma3-Legal agent not available');
      return false;
    }

    const health = await healthResponse.json();
    console.log('✅ Gemma3-Legal agent responding');
    console.log(`🤖 Agent tools: ${health.tools?.join(', ') || 'None'}`);

    // Test simple analysis
    const analysisResponse = await fetch('http://localhost:8095/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'What are the key elements of a valid contract?'
      })
    });

    if (analysisResponse.ok) {
      const analysis = await analysisResponse.json();
      console.log('✅ Agent analysis working');
      console.log(`📝 Response length: ${analysis.response?.length || 0} chars`);
    } else {
      console.log('⚠️ Agent analysis not working, but health check passed');
    }

    return true;
  } catch (error) {
    console.log('❌ Gemma3-Legal agent error:', error.message);
    return false;
  }
}

async function runFullPipelineTest() {
  console.log('🚀 Starting Full Legal AI Pipeline Integration Test\n');

  const tests = [
    { name: 'FastAPI Web Crawl Service', fn: testWebCrawlService },
    { name: 'MCP Web Crawl Tool', fn: testMCPWebCrawl },
    { name: 'RabbitMQ Ingestion Pipeline', fn: testRabbitMQIngestion },
    { name: 'SvelteKit Evidence API', fn: testSvelteKitEvidenceAPI },
    { name: 'Gemma3-Legal Agent', fn: testGemma3LegalAgent }
  ];

  const results = [];

  for (const test of tests) {
    console.log(`\n--- ${test.name} ---`);
    try {
      const success = await test.fn();
      results.push({ test: test.name, success });
    } catch (error) {
      console.log(`❌ Test failed with exception: ${error.message}`);
      results.push({ test: test.name, success: false });
    }
  }

  console.log('\n📊 Test Results Summary:');
  console.log('='.repeat(50));

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${result.test}`);
    if (result.success) passed++;
    else failed++;
  }

  console.log('='.repeat(50));
  console.log(`Total: ${results.length}, Passed: ${passed}, Failed: ${failed}`);

  if (failed === 0) {
    console.log('🎉 All tests passed! Full pipeline integration successful.');
  } else {
    console.log('⚠️ Some tests failed. Check service availability and configuration.');
    console.log('\n💡 Troubleshooting:');
    console.log('1. Ensure all Docker services are running (docker-compose ps)');
    console.log('2. Check service ports are not in use by other applications');
    console.log('3. Verify Ollama models are downloaded (ollama list)');
    console.log('4. Check Redis and RabbitMQ connections');
  }

  return failed === 0;
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  runFullPipelineTest()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}

export { runFullPipelineTest };
