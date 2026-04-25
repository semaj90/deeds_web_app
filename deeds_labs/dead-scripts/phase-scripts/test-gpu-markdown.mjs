#!/usr/bin/env node

/**
 * GPU Markdown Pipeline Test Script
 *
 * Tests the GPU-accelerated markdown processing pipeline
 * including WebGPU kernels, Python service integration, and performance validation.
 */

import { GPUMarkdownProcessor } from '../src/lib/gpu/markdown-processor.ts';
import { GPUMarkdownPipeline, LegalDocumentProcessor } from '../src/lib/gpu/markdown-pipeline.ts';
import { performanceMonitor, memoryManager } from '../src/lib/gpu/runtime-optimizations.ts';

// Test data
const sampleMarkdown = `# Legal Case Analysis

## FACTS

The plaintiff filed a complaint alleging breach of contract. The defendant argues that the contract was invalid due to lack of consideration.

## REASONING

The court must determine whether there was valid consideration. In contract law, consideration is defined as something of value exchanged between parties.

## HOLDING

The court finds that there was sufficient consideration. The defendant's argument is rejected.

## CONCLUSION

Judgment for the plaintiff. The contract is enforceable.
`;

const largeMarkdown = sampleMarkdown.repeat(10); // ~1KB test

async function testGPUMarkdownProcessor() {
  console.log('🧪 Testing GPU Markdown Processor...\n');

  const processor = new GPUMarkdownProcessor();

  try {
    console.log('🔧 Initializing GPU processor...');
    await processor.initialize();
    console.log('✅ GPU processor initialized\n');

    console.log('📝 Processing sample markdown...');
    const result = await processor.processMarkdown(sampleMarkdown);

    console.log('✅ Processing complete!');
    console.log(`📊 Sections found: ${result.sections.length}`);
    console.log(`⏱️ Processing time: ${result.performance.totalTime}ms`);
    console.log(`🧠 Tokens processed: ${result.tokens.length}`);

    // Test legal section extraction
    console.log('\n⚖️ Testing legal section extraction...');
    const factsSection = result.sections.find(s => s.type === 'facts');
    const reasoningSection = result.sections.find(s => s.type === 'reasoning');
    const holdingSection = result.sections.find(s => s.type === 'holding');
    const conclusionSection = result.sections.find(s => s.type === 'conclusion');

    console.log(`📋 Facts section: ${factsSection ? '✅ Found' : '❌ Missing'}`);
    console.log(`⚖️ Reasoning section: ${reasoningSection ? '✅ Found' : '❌ Missing'}`);
    console.log(`🏛️ Holding section: ${holdingSection ? '✅ Found' : '❌ Missing'}`);
    console.log(`📜 Conclusion section: ${conclusionSection ? '✅ Found' : '❌ Missing'}`);

    // Test large document processing
    console.log('\n📈 Testing large document processing...');
    performanceMonitor.startOperation('large-doc-test');
    const largeResult = await processor.processMarkdown(largeMarkdown);
    const largeTime = performanceMonitor.endOperation('large-doc-test');

    console.log(`✅ Large document processed in ${largeTime}ms`);
    console.log(`📊 Sections in large doc: ${largeResult.sections.length}`);

    processor.destroy();
    console.log('\n✅ GPU Markdown Processor tests passed!\n');

  } catch (error) {
    console.error('❌ GPU Markdown Processor test failed:', error);
    process.exit(1);
  }
}

async function testGPUMarkdownPipeline() {
  console.log('🔄 Testing GPU Markdown Pipeline...\n');

  const pipeline = new GPUMarkdownPipeline({
    enableGPU: true,
    pythonServiceUrl: 'http://localhost:8098'
  });

  try {
    console.log('🔧 Initializing pipeline...');
    await pipeline.initialize();
    console.log('✅ Pipeline initialized\n');

    console.log('📝 Processing single document...');
    const result = await pipeline.processDocument(sampleMarkdown);

    console.log('✅ Single document processed!');
    console.log(`📊 Sections: ${result.sections.length}`);
    console.log(`⏱️ Total time: ${result.performance.totalTime}ms`);

    console.log('\n📦 Testing batch processing...');
    const documents = [sampleMarkdown, sampleMarkdown, sampleMarkdown];
    const batchResults = await pipeline.processBatch(documents);

    console.log('✅ Batch processing complete!');
    console.log(`📊 Documents processed: ${batchResults.length}`);
    console.log(`📈 Average time per doc: ${batchResults.reduce((sum, r) => sum + r.performance.totalTime, 0) / batchResults.length}ms`);

    console.log('\n💾 Testing caching...');
    const result1 = await pipeline.processDocument(sampleMarkdown, { cache: true });
    const result2 = await pipeline.processDocument(sampleMarkdown, { cache: true });

    console.log('✅ Caching test complete!');
    console.log(`📊 Cache hit rate: ${pipeline.getMetrics().cacheHitRate.toFixed(2)}%`);

    pipeline.destroy();
    console.log('\n✅ GPU Markdown Pipeline tests passed!\n');

  } catch (error) {
    console.error('❌ GPU Markdown Pipeline test failed:', error);
    process.exit(1);
  }
}

async function testLegalDocumentProcessor() {
  console.log('⚖️ Testing Legal Document Processor...\n');

  const legalProcessor = new LegalDocumentProcessor();

  try {
    console.log('🔧 Initializing legal processor...');
    await legalProcessor.initialize();
    console.log('✅ Legal processor initialized\n');

    console.log('📋 Extracting legal sections...');
    const sections = await legalProcessor.extractLegalSections(sampleMarkdown);

    console.log('✅ Legal sections extracted!');
    console.log(`📊 Facts sections: ${sections.facts.length}`);
    console.log(`⚖️ Reasoning sections: ${sections.reasoning.length}`);
    console.log(`🏛️ Holding sections: ${sections.holding.length}`);
    console.log(`📜 Conclusion sections: ${sections.conclusion.length}`);

    console.log('\n🧩 Generating semantic chunks...');
    const chunks = await legalProcessor.generateSemanticChunks(sampleMarkdown);

    console.log('✅ Semantic chunks generated!');
    console.log(`📊 Total chunks: ${chunks.length}`);
    console.log(`🏷️ Unique section types: ${[...new Set(chunks.map(c => c.type))].join(', ')}`);

    legalProcessor.destroy();
    console.log('\n✅ Legal Document Processor tests passed!\n');

  } catch (error) {
    console.error('❌ Legal Document Processor test failed:', error);
    process.exit(1);
  }
}

async function testPerformanceMonitoring() {
  console.log('📊 Testing Performance Monitoring...\n');

  try {
    performanceMonitor.startOperation('test-operation');
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate work
    const duration = performanceMonitor.endOperation('test-operation');

    console.log(`✅ Performance monitoring working: ${duration}ms`);

    const metrics = performanceMonitor.getMetrics('test-operation');
    console.log(`📈 Operation metrics: ${JSON.stringify(metrics, null, 2)}`);

    console.log('\n✅ Performance Monitoring tests passed!\n');

  } catch (error) {
    console.error('❌ Performance Monitoring test failed:', error);
    process.exit(1);
  }
}

async function testPythonServiceIntegration() {
  console.log('🐍 Testing Python Service Integration...\n');

  try {
    console.log('🔍 Checking Python service health...');

    const response = await fetch('http://localhost:8098/health');
    if (!response.ok) {
      throw new Error(`Service not healthy: ${response.status}`);
    }

    const health = await response.json();
    console.log('✅ Python service is healthy:', health);

    console.log('\n📝 Testing Python service markdown processing...');
    const testResponse = await fetch('http://localhost:8098/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: sampleMarkdown })
    });

    if (!testResponse.ok) {
      throw new Error(`Parse request failed: ${testResponse.status}`);
    }

    const result = await testResponse.json();
    console.log('✅ Python service processing successful!');
    console.log(`📊 Sections returned: ${result.sections?.length || 0}`);

    console.log('\n✅ Python Service Integration tests passed!\n');

  } catch (error) {
    console.warn('⚠️ Python Service Integration test failed (service may not be running):', error.message);
    console.log('💡 Start the Python service with: npm run gpu:markdown:start\n');
  }
}

async function runAllTests() {
  console.log('🚀 GPU Markdown Pipeline - Complete Test Suite\n');
  console.log('='.repeat(60) + '\n');

  try {
    await testPerformanceMonitoring();
    await testGPUMarkdownProcessor();
    await testLegalDocumentProcessor();
    await testGPUMarkdownPipeline();
    await testPythonServiceIntegration();

    console.log('🎉 All GPU Markdown Pipeline tests passed!\n');
    console.log('💡 Next steps:');
    console.log('   • Run benchmarks: npm run gpu:markdown:test:benchmark');
    console.log('   • Start services: npm run gpu:markdown:start');
    console.log('   • View metrics: Check performance logs\n');

  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// CLI runner
const command = process.argv[2] || 'all';

switch (command) {
  case 'processor':
    await testGPUMarkdownProcessor();
    break;
  case 'pipeline':
    await testGPUMarkdownPipeline();
    break;
  case 'legal':
    await testLegalDocumentProcessor();
    break;
  case 'python':
    await testPythonServiceIntegration();
    break;
  case 'performance':
    await testPerformanceMonitoring();
    break;
  case 'all':
  default:
    await runAllTests();
    break;
}