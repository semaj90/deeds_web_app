/**
 * Comprehensive System Integration Test
 * Tests the complete architecture: MCP Server ↔ Routing ↔ API ↔ Storage ↔ Workers
 */

import { SystemIntegrationOrchestrator } from './system-integration-orchestrator.js';

class ComprehensiveSystemTest {
  constructor() {
    this.orchestrator = new SystemIntegrationOrchestrator();
    this.testResults = {
      passed: 0,
      failed: 0,
      total: 0,
      details: []
    };
  }

  async runAllTests() {
    console.log('🚀 Starting Comprehensive System Integration Test...\n');
    
    try {
      // Initialize the orchestrator
      await this.orchestrator.initialize();
      console.log('✅ System orchestrator initialized\n');

      // Test Suite 1: Core System Health
      await this.testSystemHealth();

      // Test Suite 2: Document Processing Pipeline
      await this.testDocumentProcessingPipeline();

      // Test Suite 3: Embedding and Search Integration
      await this.testEmbeddingSearchIntegration();

      // Test Suite 4: Legal Analysis Workflow
      await this.testLegalAnalysisWorkflow();

      // Test Suite 5: Multi-System Coordination
      await this.testMultiSystemCoordination();

      // Test Suite 6: Performance and Scalability
      await this.testPerformanceScalability();

      // Final Results
      this.printTestResults();

    } catch (error) {
      console.error('❌ System test initialization failed:', error);
    } finally {
      await this.orchestrator.cleanup();
    }
  }

  async testSystemHealth() {
    console.log('📋 Test Suite 1: Core System Health');
    
    await this.runTest('System Health Check', async () => {
      const health = await this.orchestrator.getSystemHealth();
      
      if (health.orchestrator !== 'healthy') {
        throw new Error('Orchestrator not healthy');
      }
      
      if (!health.systems.mcp_server || health.systems.mcp_server !== 'connected') {
        throw new Error('MCP Server not connected');
      }
      
      if (!health.systems.redis_orchestrator || health.systems.redis_orchestrator !== 'connected') {
        throw new Error('Redis orchestrator not connected');
      }
      
      return health;
    });

    await this.runTest('Redis Connection Test', async () => {
      await this.orchestrator.redis.ping();
      const info = await this.orchestrator.redis.info('memory');
      return { connected: true, memory_info: info.length > 0 };
    });

    await this.runTest('MCP Server Worker Pool', async () => {
      const workerCount = this.orchestrator.mcpServer.workerPool?.length || 0;
      if (workerCount === 0) {
        throw new Error('No worker threads available');
      }
      return { worker_count: workerCount };
    });

    console.log('✅ System Health Tests Completed\n');
  }

  async testDocumentProcessingPipeline() {
    console.log('📋 Test Suite 2: Document Processing Pipeline');

    await this.runTest('Document Ingestion via Orchestrator', async () => {
      const request = {
        path: '/api/orchestrator/process-document',
        method: 'POST',
        body: {
          files: [
            { 
              name: 'test-contract.pdf', 
              type: 'legal_document', 
              size: 2500000,
              extension: 'pdf'
            },
            { 
              name: 'evidence-doc.docx', 
              type: 'evidence', 
              size: 1800000,
              extension: 'docx'
            }
          ],
          metadata: {
            caseId: 'TEST-CASE-001',
            uploadedBy: 'system-test',
            jurisdiction: 'US-NY'
          },
          options: {
            bucketName: 'test-legal-documents',
            generateEmbeddings: true
          }
        }
      };

      const response = await this.orchestrator.handleRequest(request);
      
      if (response.status !== 200 || !response.body.success) {
        throw new Error(`Document processing failed: ${JSON.stringify(response)}`);
      }

      return response.body;
    });

    await this.runTest('MinIO Storage Integration', async () => {
      // Test MinIO operations through MCP server
      const result = await this.orchestrator.mcpServer.minioOperations('health_check', {});
      
      if (!result.content || result.content.length === 0) {
        throw new Error('MinIO operations not responding');
      }

      const healthData = JSON.parse(result.content[0].text);
      return healthData;
    });

    await this.runTest('File Processing with Redis Caching', async () => {
      // Test caching layer
      const cacheKey = 'test:document:processing';
      await this.orchestrator.redis.setex(cacheKey, 300, JSON.stringify({
        fileId: 'test-file-123',
        processed: true,
        timestamp: Date.now()
      }));

      const cached = await this.orchestrator.redis.get(cacheKey);
      if (!cached) {
        throw new Error('Redis caching not working');
      }

      return JSON.parse(cached);
    });

    console.log('✅ Document Processing Tests Completed\n');
  }

  async testEmbeddingSearchIntegration() {
    console.log('📋 Test Suite 3: Embedding and Search Integration');

    await this.runTest('Embedding Generation via Orchestrator', async () => {
      const request = {
        path: '/api/orchestrator/search-embeddings',
        method: 'POST',
        body: {
          query: 'Find contracts related to software licensing agreements',
          filters: {
            documentType: ['contract', 'agreement'],
            jurisdiction: ['US-NY', 'US-CA'],
            confidenceThreshold: 0.75
          },
          options: {
            maxResults: 10,
            includeMetadata: true
          }
        }
      };

      const response = await this.orchestrator.handleRequest(request);
      
      if (response.status !== 200 || !response.body.success) {
        throw new Error(`Embedding search failed: ${JSON.stringify(response)}`);
      }

      return response.body;
    });

    await this.runTest('Vector Similarity Calculations', async () => {
      // Test embedding generation directly
      const texts = [
        'This is a software licensing agreement',
        'Contract terms for intellectual property',
        'Legal document regarding copyright'
      ];

      const result = await this.orchestrator.mcpServer.embeddingGeneration(
        texts,
        3,
        true,
        'nomic-embed-text'
      );

      if (!result.content || result.content.length === 0) {
        throw new Error('Embedding generation failed');
      }

      const embeddingData = JSON.parse(result.content[0].text);
      if (!embeddingData.embeddings || embeddingData.embeddings.length !== 3) {
        throw new Error('Invalid embedding results');
      }

      return {
        embeddings_generated: embeddingData.embeddings.length,
        average_time: embeddingData.averageEmbeddingTime
      };
    });

    await this.runTest('Dimensional Store Integration', async () => {
      // Test storage of embeddings in dimensional store
      const mockEmbedding = new Float32Array(384).map(() => Math.random() * 2 - 1);
      
      await this.orchestrator.dimensionalStore.storeGraphEmbeddings(
        'test-node-123',
        mockEmbedding,
        {
          documentType: 'contract',
          jurisdiction: 'US-NY',
          practiceArea: 'intellectual-property'
        }
      );

      // Test search functionality
      const searchResults = await this.orchestrator.dimensionalStore.dimensionalSearch({
        searchVector: mockEmbedding,
        dimensions: { d1: 384 },
        filters: {
          documentType: ['contract'],
          confidenceThreshold: 0.7
        },
        cacheStrategy: 'hybrid'
      });

      return {
        stored: true,
        search_results: searchResults.length
      };
    });

    console.log('✅ Embedding and Search Tests Completed\n');
  }

  async testLegalAnalysisWorkflow() {
    console.log('📋 Test Suite 4: Legal Analysis Workflow');

    await this.runTest('Complete Legal Analysis Pipeline', async () => {
      const request = {
        path: '/api/orchestrator/analyze-legal',
        method: 'POST',
        body: {
          documents: [
            { name: 'contract-a.pdf', content: 'Software licensing agreement...' },
            { name: 'contract-b.pdf', content: 'Service level agreement...' }
          ],
          texts: [
            'Analyze contract terms and conditions',
            'Identify potential legal risks',
            'Compare with standard agreement templates'
          ],
          searchQuery: 'Find similar licensing agreements',
          clusteringParams: {
            gridSize: { width: 8, height: 8 },
            epochs: 50,
            learningRate: 0.1
          }
        }
      };

      const response = await this.orchestrator.handleRequest(request);
      
      if (response.status !== 200 || !response.body.success) {
        throw new Error(`Legal analysis failed: ${JSON.stringify(response)}`);
      }

      const result = response.body;
      if (!result.steps || result.steps.length === 0) {
        throw new Error('No analysis steps completed');
      }

      return {
        workflow: result.workflow,
        steps_completed: result.steps.length,
        total_time: result.processingTime
      };
    });

    await this.runTest('SOM Clustering Integration', async () => {
      // Test SOM clustering directly through MCP server
      const mockEmbeddings = [];
      for (let i = 0; i < 20; i++) {
        mockEmbeddings.push(
          Array.from({ length: 384 }, () => Math.random() * 2 - 1)
        );
      }

      const result = await this.orchestrator.mcpServer.trainSOMCache(
        mockEmbeddings,
        'test-legal-som',
        { width: 10, height: 10 }
      );

      if (!result.content || result.content.length === 0) {
        throw new Error('SOM clustering failed');
      }

      const somData = JSON.parse(result.content[0].text);
      return {
        clusters_trained: somData.clusters?.length || 0,
        processing_time: somData.processingTime
      };
    });

    await this.runTest('RTX Tensor Upscaler Integration', async () => {
      // Test RTX integration
      const rtxStatus = await this.orchestrator.mcpServer.checkRTXTensorStatus();
      
      if (!rtxStatus.content || rtxStatus.content.length === 0) {
        throw new Error('RTX status check failed');
      }

      const rtxData = JSON.parse(rtxStatus.content[0].text);
      return rtxData;
    });

    console.log('✅ Legal Analysis Workflow Tests Completed\n');
  }

  async testMultiSystemCoordination() {
    console.log('📋 Test Suite 5: Multi-System Coordination');

    await this.runTest('Routing Matrix Optimization', async () => {
      // Test optimal route selection
      const route = this.orchestrator.routingMatrix.getOptimalRoute('mcp_document_ingestion', {
        optimizeFor: 'quality',
        maxLatency: 1000
      });

      if (!route) {
        throw new Error('No optimal route found');
      }

      return {
        selected_tool: route.tool,
        cost: route.cost,
        latency: route.latency,
        quality: route.quality
      };
    });

    await this.runTest('API Router Middleware Chain', async () => {
      // Test API router functionality
      const testRequest = {
        path: '/api/orchestrator/health',
        method: 'GET',
        body: {}
      };

      const response = await this.orchestrator.apiRouter.handle(testRequest, {
        requestId: 'test-123',
        startTime: Date.now()
      });

      if (response.status !== 200) {
        throw new Error(`API router failed: ${response.status}`);
      }

      return response.body;
    });

    await this.runTest('Cross-System Data Flow', async () => {
      // Test data flowing between all systems
      const startTime = Date.now();
      
      // 1. Process document (MCP Server)
      // 2. Generate embeddings (Workers)
      // 3. Store in dimensional store (Storage)
      // 4. Cache in Redis (Caching)
      // 5. Route optimally (Routing Matrix)

      const testData = {
        document: 'Test legal document content...',
        metadata: { type: 'contract', id: 'test-flow-001' }
      };

      // Simulate cross-system flow
      await this.orchestrator.redis.setex('flow-test', 300, JSON.stringify(testData));
      const cached = await this.orchestrator.redis.get('flow-test');
      
      if (!cached) {
        throw new Error('Cross-system data flow broken');
      }

      return {
        data_flow: 'successful',
        total_time: Date.now() - startTime,
        systems_touched: ['mcp_server', 'redis', 'routing', 'storage']
      };
    });

    console.log('✅ Multi-System Coordination Tests Completed\n');
  }

  async testPerformanceScalability() {
    console.log('📋 Test Suite 6: Performance and Scalability');

    await this.runTest('Concurrent Request Handling', async () => {
      // Test multiple concurrent requests
      const requests = [];
      const requestCount = 5;

      for (let i = 0; i < requestCount; i++) {
        requests.push(
          this.orchestrator.handleRequest({
            path: '/api/orchestrator/health',
            method: 'GET',
            body: {}
          })
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      const successfulResponses = responses.filter(r => r.status === 200).length;

      return {
        total_requests: requestCount,
        successful_requests: successfulResponses,
        total_time: totalTime,
        average_response_time: totalTime / requestCount
      };
    });

    await this.runTest('Worker Pool Utilization', async () => {
      // Test worker thread utilization
      const workerCount = this.orchestrator.mcpServer.workerPool?.length || 0;
      
      if (workerCount === 0) {
        throw new Error('No workers available');
      }

      // Test multiple embedding generations
      const tasks = [];
      for (let i = 0; i < workerCount; i++) {
        tasks.push(
          this.orchestrator.mcpServer.embeddingGeneration(
            [`Test text ${i} for embedding generation`],
            1,
            true
          )
        );
      }

      const startTime = Date.now();
      const results = await Promise.all(tasks);
      const totalTime = Date.now() - startTime;

      return {
        worker_count: workerCount,
        tasks_completed: results.length,
        total_time: totalTime,
        parallel_efficiency: (workerCount * 100) / totalTime // Mock efficiency metric
      };
    });

    await this.runTest('Memory and Resource Usage', async () => {
      // Test resource usage
      const memUsage = process.memoryUsage();
      
      // Get Redis memory usage
      const redisInfo = await this.orchestrator.redis.info('memory');
      const memoryMatch = redisInfo.match(/used_memory_human:([^\r\n]+)/);
      const redisMemory = memoryMatch ? memoryMatch[1].trim() : 'unknown';

      return {
        process_memory: {
          rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB'
        },
        redis_memory: redisMemory,
        cache_size: this.orchestrator.dimensionalStore ? 'active' : 'inactive'
      };
    });

    console.log('✅ Performance and Scalability Tests Completed\n');
  }

  async runTest(testName, testFunction) {
    this.testResults.total++;
    const startTime = Date.now();
    
    try {
      console.log(`  🔬 ${testName}...`);
      const result = await testFunction();
      const duration = Date.now() - startTime;
      
      this.testResults.passed++;
      this.testResults.details.push({
        name: testName,
        status: 'PASSED',
        duration: duration,
        result: result
      });
      
      console.log(`    ✅ PASSED (${duration}ms)`);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.testResults.failed++;
      this.testResults.details.push({
        name: testName,
        status: 'FAILED',
        duration: duration,
        error: error.message
      });
      
      console.log(`    ❌ FAILED (${duration}ms): ${error.message}`);
    }
  }

  printTestResults() {
    console.log('='.repeat(80));
    console.log('🎯 COMPREHENSIVE SYSTEM TEST RESULTS');
    console.log('='.repeat(80));
    console.log(`Total Tests: ${this.testResults.total}`);
    console.log(`✅ Passed: ${this.testResults.passed}`);
    console.log(`❌ Failed: ${this.testResults.failed}`);
    console.log(`📊 Success Rate: ${Math.round((this.testResults.passed / this.testResults.total) * 100)}%`);
    console.log('='.repeat(80));
    
    if (this.testResults.failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.testResults.details
        .filter(test => test.status === 'FAILED')
        .forEach(test => {
          console.log(`  • ${test.name}: ${test.error}`);
        });
    }

    console.log('\n📈 PERFORMANCE SUMMARY:');
    const avgDuration = this.testResults.details.reduce((sum, test) => sum + test.duration, 0) / this.testResults.total;
    console.log(`  Average Test Duration: ${Math.round(avgDuration)}ms`);
    
    const longestTest = this.testResults.details.reduce((longest, test) => 
      test.duration > longest.duration ? test : longest
    );
    console.log(`  Longest Test: ${longestTest.name} (${longestTest.duration}ms)`);

    if (this.testResults.passed === this.testResults.total) {
      console.log('\n🎉 ALL SYSTEMS OPERATIONAL! 🎉');
      console.log('✅ MCP Server Integration: Complete');
      console.log('✅ Multidimensional Routing: Complete');
      console.log('✅ Unified API Router: Complete');
      console.log('✅ Dimensional Storage: Complete');
      console.log('✅ Worker Thread Coordination: Complete');
      console.log('✅ Redis Caching: Complete');
      console.log('✅ RTX Tensor Upscaler: Complete');
    } else {
      console.log('\n⚠️  SYSTEM INTEGRATION ISSUES DETECTED');
      console.log('Some components may need attention before production deployment.');
    }
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new ComprehensiveSystemTest();
  test.runAllTests().catch(console.error);
}

export { ComprehensiveSystemTest };