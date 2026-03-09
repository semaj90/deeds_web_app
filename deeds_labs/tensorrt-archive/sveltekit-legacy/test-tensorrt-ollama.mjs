#!/usr/bin/env node

/**
 * Test script for TensorRT-LLM service with Ollama fallback
 * Tests the evidence integration and legal AI capabilities
 */

// Test script for TensorRT-LLM service with Ollama fallback
import fetch from 'node-fetch';

// Mock the TensorRT service for testing since TypeScript service requires SvelteKit environment
class MockTensorRTService {
  constructor() {
    this.tensorrtAvailable = false;
    this.ollamaAvailable = true;
    this.OLLAMA_ENDPOINT = 'http://localhost:11434';
    this.OLLAMA_MODEL = 'gemma3-legal:latest';
  }

  async getHealthStatus() {
    try {
      const ollamaResponse = await fetch(`${this.OLLAMA_ENDPOINT}/api/tags`);
      const ollamaAvailable = ollamaResponse.ok;

      return {
        tensorrt: { available: false, latency: undefined },
        ollama: { available: ollamaAvailable, latency: ollamaAvailable ? 50 : undefined },
        overall: ollamaAvailable ? 'degraded' : 'down'
      };
    } catch (error) {
      return {
        tensorrt: { available: false },
        ollama: { available: false },
        overall: 'down'
      };
    }
  }

  async generateInference(request) {
    const startTime = Date.now();

    try {
      // Use Ollama for legal AI inference
      const payload = {
        model: request.model || this.OLLAMA_MODEL,
        prompt: request.prompt,
        system: 'You are a specialized legal AI assistant with expertise in case analysis, evidence review, legal research, and procedural guidance.',
        options: {
          num_predict: request.max_tokens || 512,
          temperature: request.temperature || 0.1,
          num_ctx: 4096,
          num_gpu: 35,
          num_thread: 8
        },
        stream: false
      };

      const response = await fetch(`${this.OLLAMA_ENDPOINT}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: true,
        response: data.response,
        tokens: data.prompt_eval_count + data.eval_count,
        model: data.model,
        backend: 'ollama',
        processing_time: Date.now() - startTime,
        cached: false
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        processing_time: Date.now() - startTime
      };
    }
  }

  async generateLegalAnalysis(prompt, evidenceIds = [], caseId = '', options = {}) {
    const enhancedPrompt = evidenceIds.length > 0
      ? `[EVIDENCE ANALYSIS] Case ID: ${caseId || 'unknown'}\nEvidence IDs: ${evidenceIds.join(', ')}\n\nAnalysis Request: ${prompt}`
      : prompt;

    return this.generateInference({
      prompt: enhancedPrompt,
      max_tokens: 1024,
      temperature: 0.1,
      ...options
    });
  }

  async getAvailableModels() {
    try {
      const response = await fetch(`${this.OLLAMA_ENDPOINT}/api/tags`);
      if (!response.ok) return [];

      const data = await response.json();
      return data.models?.map(model => ({
        name: model.name,
        backend: 'ollama',
        available: true,
        memory_usage: model.size
      })) || [];
    } catch (error) {
      return [];
    }
  }

  async getPerformanceMetrics() {
    return {
      tensorrt: { avgLatency: 0, throughput: 0, available: false },
      ollama: { avgLatency: 45, throughput: 20, available: true },
      cacheHitRate: 0.25,
      totalRequests: 10
    };
  }
}

const tensorrtLLMService = new MockTensorRTService();

async function testTensorRTOllamaIntegration() {
  console.log('🧪 Testing TensorRT-LLM with Ollama Fallback\n');

  // Test 1: Basic health check
  console.log('1. Health Status Check:');
  try {
    const health = await tensorrtLLMService.getHealthStatus();
    console.log('   TensorRT:', health.tensorrt.available ? '✅ Available' : '❌ Not Available');
    console.log('   Ollama:', health.ollama.available ? '✅ Available' : '❌ Not Available');
    console.log('   Overall:', health.overall);
    console.log('');
  } catch (error) {
    console.error('   Health check failed:', error.message);
  }

  // Test 2: Basic inference
  console.log('2. Basic Legal Inference:');
  try {
    const response = await tensorrtLLMService.generateInference({
      prompt: 'Explain the concept of chain of custody in legal evidence handling.',
      max_tokens: 200,
      temperature: 0.1
    });

    console.log('   Success:', response.success ? '✅' : '❌');
    console.log('   Backend:', response.backend);
    console.log('   Processing Time:', response.processing_time + 'ms');
    console.log('   Response Length:', response.response?.length || 0, 'characters');
    console.log('   Cached:', response.cached ? '✅' : '❌');
    console.log('');
  } catch (error) {
    console.error('   Basic inference failed:', error.message);
  }

  // Test 3: Evidence analysis
  console.log('3. Evidence Analysis with Context:');
  try {
    const evidenceResponse = await tensorrtLLMService.generateLegalAnalysis(
      'Analyze the admissibility of this digital evidence.',
      ['evidence_001', 'evidence_002'],
      'case_12345',
      { max_tokens: 300 }
    );

    console.log('   Success:', evidenceResponse.success ? '✅' : '❌');
    console.log('   Backend:', evidenceResponse.backend);
    console.log('   Processing Time:', evidenceResponse.processing_time + 'ms');
    console.log('   Evidence Context Detected:', evidenceResponse.response?.includes('evidence') ? '✅' : '❌');
    console.log('');
  } catch (error) {
    console.error('   Evidence analysis failed:', error.message);
  }

  // Test 4: Available models
  console.log('4. Available Models:');
  try {
    const models = await tensorrtLLMService.getAvailableModels();
    console.log('   Total Models:', models.length);

    models.forEach(model => {
      console.log(`   - ${model.name} (${model.backend}) ${model.available ? '✅' : '❌'}`);
    });
    console.log('');
  } catch (error) {
    console.error('   Model listing failed:', error.message);
  }

  // Test 5: Performance metrics
  console.log('5. Performance Metrics:');
  try {
    const metrics = await tensorrtLLMService.getPerformanceMetrics();
    console.log('   Total Requests:', metrics.totalRequests);
    console.log('   Cache Hit Rate:', (metrics.cacheHitRate * 100).toFixed(1) + '%');
    console.log('   TensorRT Avg Latency:', metrics.tensorrt.avgLatency + 'ms');
    console.log('   Ollama Avg Latency:', metrics.ollama.avgLatency + 'ms');
    console.log('');
  } catch (error) {
    console.error('   Metrics collection failed:', error.message);
  }

  console.log('✨ TensorRT-LLM + Ollama integration test completed!');
}

// Run the test
testTensorRTOllamaIntegration().catch(console.error);