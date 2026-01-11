# LLM Orchestrator Integration Documentation

## Overview

The LLM Orchestrator Integration provides a unified interface for managing multiple AI processing backends in your legal AI application. It intelligently routes requests to the optimal orchestrator based on task type, performance requirements, and available resources.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    LLM Orchestrator Bridge                  │
├─────────────────────────────────────────────────────────────┤
│  • Intelligent Routing                                     │
│  • Load Balancing                                          │
│  • Performance Monitoring                                  │
│  • Fallback Handling                                       │
└─────────────┬─────────────┬─────────────┬─────────────────┘
              │             │             │
              ▼             ▼             ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │   Server    │ │   Client    │ │     MCP     │
    │Orchestrator │ │Orchestrator │ │ Multi-Core  │
    ├─────────────┤ ├─────────────┤ ├─────────────┤
    │ • XState    │ │ • Gemma270M │ │ • Parallel  │
    │ • Ollama    │ │ • Legal-BERT│ │ • Workers   │
    │ • pgvector  │ │ • ONNX.js   │ │ • Load Bal. │
    │ • Neo4j     │ │ • WASM      │ │ • Scaling   │
    │ • Redis     │ │ • GPU       │ │ • MCP API   │
    └─────────────┘ └─────────────┘ └─────────────┘
```

## Components

### 1. LLM Orchestrator Bridge (`llm-orchestrator-bridge.ts`)

The central routing component that:
- Analyzes incoming requests
- Selects optimal processing backend
- Handles fallback scenarios
- Tracks performance metrics
- Manages request lifecycle

### 2. Enhanced AI Orchestrator (`enhanced-orchestrator.ts`)

Server-side orchestrator featuring:
- XState workflow management
- Ollama integration with gemma3-legal model
- PostgreSQL + pgvector for document storage
- Neo4j for graph relationships
- Redis caching layer
- Comprehensive legal analysis pipeline

### 3. Unified Client LLM Orchestrator (`unified-client-llm-orchestrator.ts`)

Client-side orchestrator providing:
- Lightweight Gemma 270M model
- Legal-BERT for context switching
- ONNX.js for embeddings
- WebAssembly execution
- GPU acceleration support
- Memory management

### 4. MCP Multi-Core Integration (`multi-core-integration.ts`)

Distributed processing backend with:
- Multiple worker cores
- Dynamic load balancing
- Task prioritization
- Health monitoring
- Parallel execution

## API Endpoints

### Main Chat API: `/api/ai/chat`
Enhanced chat endpoint with automatic orchestrator routing.

```javascript
// Request
POST /api/ai/chat
{
  "messages": [
    {"role": "user", "content": "What are the key elements of a valid contract?"}
  ],
  "model": "auto",  // or "gemma3-legal", "gemma270m", etc.
  "temperature": 0.3,
  "stream": false
}

// Response
{
  "choices": [{
    "message": {
      "role": "assistant", 
      "content": "A valid contract requires..."
    },
    "finish_reason": "stop"
  }],
  "usage": {...},
  "model": "gemma3-legal:latest",
  "orchestrator": {
    "used": "server",
    "confidence": 0.9,
    "executionMetrics": {...}
  }
}
```

### Unified Orchestrator: `/api/ai/unified-orchestrator`
Direct access to the orchestrator bridge with full control.

```javascript
// Request
POST /api/ai/unified-orchestrator
{
  "content": "Analyze this contract clause...",
  "type": "legal_analysis",
  "context": {
    "legalDomain": "contract",
    "documentType": "agreement"
  },
  "options": {
    "model": "auto",
    "priority": "high",
    "useGPU": true
  }
}

// Response  
{
  "success": true,
  "response": "Analysis of the contract clause...",
  "orchestratorUsed": "server",
  "modelUsed": "gemma3-legal:latest",
  "executionMetrics": {
    "totalLatency": 1250,
    "routingTime": 15,
    "processingTime": 1200,
    "gpuAccelerated": true
  },
  "confidence": 0.92
}
```

### Test API: `/api/ai/test-orchestrator`
Comprehensive testing and diagnostics.

```javascript
// Health Check
GET /api/ai/test-orchestrator
{
  "type": "health_check",
  "healthy": true,
  "status": {...},
  "performance": {...}
}

// Full Integration Test
GET /api/ai/test-orchestrator?test=full
{
  "type": "full_integration_test",
  "success": true,
  "results": [...],
  "summary": "5/5 tests passed (100%)"
}

// Specific Orchestrator Test
GET /api/ai/test-orchestrator?test=specific&orchestrator=server
POST /api/ai/test-orchestrator
{
  "type": "chat",
  "content": "Test message",
  "orchestrator": "server"
}
```

## Routing Logic

The bridge uses intelligent routing based on:

### Task Type Priority
- **Chat**: Auto-route based on latency requirements
- **Legal Analysis**: Prefer server for complex analysis, client for simple
- **Document Processing**: Server orchestrator (requires full pipeline)
- **Embedding**: Client orchestrator (ONNX optimization)
- **Search**: Server orchestrator (pgvector/Neo4j integration)
- **Workflow**: Server orchestrator (XState workflows)

### Performance Criteria
- **Realtime** (< 200ms): Client orchestrator
- **High Priority**: MCP multi-core if available
- **Complex Legal**: Server orchestrator
- **Simple Queries**: Client orchestrator

### Resource Availability
- Server orchestrator health status
- Client models loaded count
- MCP worker core availability
- Current system load

## Usage Examples

### Basic Chat Integration

```typescript
import { llmOrchestratorBridge } from '$lib/server/ai/llm-orchestrator-bridge.js';

// Simple chat request
const response = await llmOrchestratorBridge.processRequest({
  id: 'chat-1',
  type: 'chat',
  content: 'What is tort law?',
  context: { userId: 'user123' },
  options: { model: 'auto', priority: 'normal' }
});

console.log(`Response from ${response.orchestratorUsed}: ${response.response}`);
```

### Legal Document Analysis

```typescript
// Complex legal analysis
const analysis = await llmOrchestratorBridge.processRequest({
  id: 'analysis-1',
  type: 'legal_analysis',
  content: 'Analyze this employment contract...',
  context: {
    legalDomain: 'employment',
    documentType: 'contract'
  },
  options: {
    model: 'auto',
    priority: 'high',
    temperature: 0.2,
    maxTokens: 1000
  }
});

if (analysis.success) {
  console.log('Analysis confidence:', analysis.confidence);
  console.log('Citations:', analysis.citations);
}
```

### Realtime Chat with Client Preference

```typescript
// Optimized for low latency
const realtimeResponse = await llmOrchestratorBridge.processRequest({
  id: 'realtime-1',
  type: 'chat',
  content: 'Quick legal question...',
  options: {
    priority: 'realtime',
    maxLatency: 300,
    model: 'gemma270m' // Force client-side
  }
});
```

### Embedding Generation

```typescript
// Generate embeddings for legal text
const embedding = await llmOrchestratorBridge.processRequest({
  id: 'embed-1',
  type: 'embedding',
  content: 'Contract law principles and applications',
  options: {
    model: 'auto' // Will prefer ONNX client-side
  }
});
```

## Configuration

### Environment Variables

```bash
# Ollama Configuration
OLLAMA_URL=http://localhost:11434

# Database Configuration  
POSTGRES_URL=postgresql://user:pass@localhost:5432/legal_ai
NEO4J_URL=bolt://localhost:7687
REDIS_URL=redis://localhost:6379

# MCP Multi-Core
MCP_MULTICORE_URL=http://localhost:3002

# GPU Settings
CUDA_VISIBLE_DEVICES=0
```

### Model Configuration

```typescript
// Server orchestrator models
const serverModels = {
  legal: 'gemma3-legal:latest',
  embedding: 'nomic-embed-text:latest'
};

// Client orchestrator models  
const clientModels = {
  gemma: 'gemma270m',
  bert: 'legal-bert', 
  embeddings: 'onnx-embeddings'
};
```

## Performance Monitoring

### Metrics Available

```typescript
const metrics = llmOrchestratorBridge.getPerformanceMetrics();
console.log('Total requests:', metrics.totalRequests);
console.log('Success rate:', metrics.successfulRequests / metrics.totalRequests);
console.log('Average latency:', metrics.averageLatency);
console.log('Server routing:', metrics.serverRoutedRequests);
console.log('Client routing:', metrics.clientRoutedRequests);
```

### Health Checking

```typescript
const status = await llmOrchestratorBridge.getStatus();
console.log('Bridge status:', status.bridge.status);
console.log('Server orchestrator:', status.serverOrchestrator.status);
console.log('Client models loaded:', status.clientOrchestrator.modelsLoaded);
```

## Troubleshooting

### Common Issues

1. **Bridge Status: 'offline'**
   - Check Ollama is running: `ollama serve`
   - Verify database connections
   - Ensure required models are pulled

2. **High Latency**
   - Check GPU availability
   - Monitor system resources
   - Consider client-side routing for simple queries

3. **Low Confidence Scores**
   - Verify legal domain context is provided
   - Check model specialization for task type
   - Review prompt engineering

4. **MCP Integration Issues**
   - Verify MCP server is running on port 3002
   - Check worker core availability
   - Monitor load balancing metrics

### Debug Mode

```typescript
// Enable debug logging
process.env.DEBUG = 'llm-orchestrator:*';

// Test specific orchestrators
import { testSpecificOrchestrator } from '$lib/server/ai/orchestrator-test.js';

const serverTest = await testSpecificOrchestrator('server', 'Test message');
const clientTest = await testSpecificOrchestrator('client', 'Test message');
const mcpTest = await testSpecificOrchestrator('mcp', 'Test message');
```

## Integration Testing

Run the test suite to verify integration:

```bash
# Via API
curl http://localhost:5173/api/ai/test-orchestrator?test=full

# Via code
import { testOrchestratorIntegration } from '$lib/server/ai/orchestrator-test.js';
const results = await testOrchestratorIntegration();
```

## Best Practices

1. **Always use 'auto' model selection** for optimal routing
2. **Set appropriate priority levels** based on user expectations
3. **Provide legal domain context** for better analysis quality
4. **Monitor performance metrics** regularly
5. **Test fallback scenarios** to ensure reliability
6. **Use realtime priority sparingly** to preserve resources
7. **Cache frequently requested analyses** when possible

## Future Enhancements

- Streaming response support across all orchestrators
- Advanced ML-based routing decisions
- Custom model fine-tuning integration
- Distributed caching across orchestrators
- Advanced monitoring and alerting
- A/B testing framework for orchestrator selection