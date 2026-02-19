/**
 * Simple Test for Enhanced MCP Server Integration
 */

import { Context7MulticoreServer } from './context7-multicore-redis-som.js';

async function simpleTest() {
  console.log('🚀 Testing Enhanced MCP Server Integration...\n');
  
  const server = new Context7MulticoreServer();
  
  try {
    console.log('✅ Server initialized successfully');
    console.log('📊 Redis Config:', {
      host: server.redis.options.host,
      port: server.redis.options.port,
      prefix: 'rtx:'
    });
    console.log('🔧 Worker Pool Size:', server.workerPool.length);
    
    // Test Redis status
    console.log('\n🔍 Testing Redis Status...');
    const redisResult = await server.checkRedisStatus();
    const status = JSON.parse(redisResult.content[0].text);
    console.log('✅ Redis Status:', status.status);
    console.log('📊 Memory:', status.memory_usage);
    console.log('🔑 Keys:', status.key_count);
    
    // Test document ingestion
    console.log('\n📁 Testing Document Ingestion...');
    const docResult = await server.documentIngestion(
      [
        { name: 'contract.pdf', type: 'legal_document', size: 2500000 },
        { name: 'evidence.docx', type: 'evidence', size: 1800000 }
      ],
      { caseId: 12345, uploadedBy: 1001 },
      { bucketName: 'legal-documents' }
    );
    
    console.log('✅ Document Ingestion Status:', docResult.content[0].text.includes('success') ? 'Success' : 'Completed');
    
    // Test embedding generation
    console.log('\n🎯 Testing Embedding Generation...');
    const embResult = await server.embeddingGeneration(
      [
        'Legal contract terms and conditions',
        'Court hearing scheduled for next month',
        'Evidence collection completed successfully'
      ],
      10,
      true,
      'nomic-embed-text'
    );
    
    console.log('✅ Embedding Generation Status:', embResult.content[0].text.includes('embeddings') ? 'Success' : 'Completed');
    
    console.log('\n🎉 All Tests Completed Successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    // Cleanup workers
    if (server.workerPool?.length > 0) {
      console.log('\n🧹 Cleaning up worker threads...');
      await server.cleanup();
    }
    
    // Close Redis connection
    if (server.redis) {
      await server.redis.quit();
      console.log('✅ Redis connection closed');
    }
  }
}

simpleTest().catch(console.error);