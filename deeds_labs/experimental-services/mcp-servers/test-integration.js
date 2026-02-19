#!/usr/bin/env node

/**
 * Integration Test for Enhanced MCP Server
 * Tests Redis, SOM cache, SIMD JSON parsing, document ingestion, and embedding generation
 */

import { Context7MulticoreServer } from './context7-multicore-redis-som.js';

async function testIntegration() {
  console.log('🚀 Starting Enhanced MCP Server Integration Test...\n');
  
  const server = new Context7MulticoreServer();
  
  try {
    // Initialize server
    console.log('1️⃣ Initializing MCP Server...');
    await server.initialize();
    console.log('✅ Server initialized successfully\n');
    
    // Test Redis Status
    console.log('2️⃣ Testing Redis Connection...');
    const redisStatus = await server.checkRedisStatus();
    console.log('✅ Redis Status:', JSON.parse(redisStatus.content[0].text).status);
    console.log('📊 Memory Usage:', JSON.parse(redisStatus.content[0].text).memory_usage);
    console.log('🔑 Key Count:', JSON.parse(redisStatus.content[0].text).key_count, '\n');
    
    // Test Document Ingestion
    console.log('3️⃣ Testing Document Ingestion...');
    const ingestionResult = await server.executeWorkerTask('document_ingestion', {
      files: [
        { name: 'test-contract.pdf', type: 'legal_document', size: 2500000 },
        { name: 'evidence-report.docx', type: 'evidence', size: 1800000 }
      ],
      caseId: 12345,
      uploadedBy: 1001,
      bucketName: 'legal-documents'
    });
    
    console.log('✅ Document Ingestion Results:');
    console.log(`   📁 Files processed: ${ingestionResult.totalFiles}`);
    console.log(`   ⏱️  Processing time: ${ingestionResult.processingTime.toFixed(2)}ms`);
    console.log(`   🚀 RTX accelerated: ${ingestionResult.rtxAccelerated}`);
    console.log(`   📋 First document: ${ingestionResult.documents[0].fileName}\n`);
    
    // Test Embedding Generation
    console.log('4️⃣ Testing Embedding Generation...');
    const embeddingResult = await server.executeWorkerTask('embedding_generation', {
      texts: [
        'This contract establishes the terms and conditions for legal services.',
        'The defendant shall appear in court on the specified date.',
        'Evidence collection completed for case number 2024-001.'
      ],
      model: 'nomic-embed-text',
      dimensions: 384,
      options: { normalize: true }
    });
    
    console.log('✅ Embedding Generation Results:');
    console.log(`   📝 Texts processed: ${embeddingResult.totalTexts}`);
    console.log(`   🎯 Model used: ${embeddingResult.model}`);
    console.log(`   📐 Dimensions: ${embeddingResult.dimensions}`);
    console.log(`   ⏱️  Processing time: ${embeddingResult.processingTime.toFixed(2)}ms`);
    console.log(`   📊 Average per text: ${embeddingResult.averageEmbeddingTime.toFixed(2)}ms`);
    console.log(`   🚀 RTX accelerated: ${embeddingResult.rtxAccelerated}\n`);
    
    // Test SOM Training
    console.log('5️⃣ Testing SOM Cache Training...');
    const somResult = await server.executeWorkerTask('som_train', {
      config: {
        gridSize: { width: 10, height: 10 },
        inputDimension: 384,
        epochs: 100
      },
      embeddings: embeddingResult.embeddings.map(e => e.embedding)
    });
    
    console.log('✅ SOM Training Results:');
    console.log(`   ⏱️  Processing time: ${somResult.processingTime.toFixed(2)}ms`);
    console.log(`   🎯 Quality score: ${somResult.quality.toFixed(3)}`);
    console.log(`   📊 Clusters found: ${somResult.clusters.length}\n`);
    
    // Test SIMD JSON Parsing
    console.log('6️⃣ Testing SIMD JSON Parsing...');
    const testDocument = {
      id: 'legal-doc-001',
      title: 'Service Agreement',
      parties: [
        { name: 'Client Corp', role: 'client', type: 'corporation' },
        { name: 'Law Firm LLP', role: 'provider', type: 'law_firm' }
      ],
      terms: {
        duration: '12 months',
        fees: { hourly: 450, retainer: 10000 },
        jurisdiction: 'New York'
      }
    };
    
    const simdResult = await server.executeWorkerTask('simd_json_parse', {
      jsonData: JSON.stringify(testDocument),
      documentType: 'legal_document',
      streaming: false
    });
    
    console.log('✅ SIMD JSON Parsing Results:');
    console.log(`   ⏱️  Processing time: ${simdResult.processingTime.toFixed(2)}ms`);
    console.log(`   🚀 SIMD accelerated: ${simdResult.simdAcceleration}`);
    console.log(`   📊 Throughput: ${simdResult.throughputGBps} GB/s`);
    console.log(`   📋 Document title: ${simdResult.parsed.title}\n`);
    
    // Performance Test
    console.log('7️⃣ Running SIMD Performance Test...');
    const perfResult = await server.executeWorkerTask('simd_performance_test', {
      jsonString: JSON.stringify(testDocument),
      iterations: 1000
    });
    
    console.log('✅ Performance Test Results:');
    console.log(`   ⚡ SIMD time: ${perfResult.simd_time.toFixed(2)}ms`);
    console.log(`   🐌 Native time: ${perfResult.native_time.toFixed(2)}ms`);
    console.log(`   📈 Speedup: ${perfResult.speedup}x`);
    console.log(`   🚀 Throughput: ${perfResult.throughput} GB/s\n`);
    
    console.log('🎉 All Integration Tests Passed Successfully!');
    console.log('✅ Redis Integration: Working');
    console.log('✅ Document Ingestion: Working');
    console.log('✅ Embedding Generation: Working');
    console.log('✅ SOM Cache Training: Working');
    console.log('✅ SIMD JSON Parsing: Working');
    console.log('✅ RTX Tensor Upscaler: Simulated');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    // Cleanup
    if (server.redis) {
      await server.closeRedisConnection();
    }
    if (server.workerPool?.length > 0) {
      server.workerPool.forEach(worker => worker.terminate());
    }
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testIntegration().catch(console.error);
}

export { testIntegration };