# Legal AI Platform - API Endpoint Documentation

## Overview
This document provides comprehensive documentation for all AI-related API endpoints with typed request/response schemas.

---

## 1. Routing Analysis Endpoint

**Purpose**: Analyzes document type and system load to determine optimal routing

**Endpoint**: `POST /api/routing/analyze`

### Request Schema
```typescript
interface RoutingAnalysisRequest {
  document?: {
    id: string;
    type: 'evidence' | 'contract' | 'brief' | 'deposition';
    confidence: number;
  };
  metrics: {
    averageLatency: number;
    queueDepth: number;
    throughput: number;
    errorRate: number;
  };
  timestamp: string; // ISO 8601 format
}
```

### Response Schema
```typescript
interface RoutingAnalysisResponse {
  routingKeys: string[];
  recommendedQueue: string; // e.g., 'legal.priority.high', 'legal.priority.standard'
  recommendedModel: string; // e.g., 'gemma3:legal-latest', 'ollama:latest'
  reasoning?: string; // Optional explanation for routing decision
}
```

### Status Codes
- `200 OK` - Analysis successful
- `400 Bad Request` - Invalid request format
- `500 Internal Server Error` - Server error during analysis

---

## 2. Queue Publishing Endpoint

**Purpose**: Routes recommendation requests to appropriate RabbitMQ queue

**Endpoint**: `POST /api/queue/publish`

### Request Schema
```typescript
interface QueuePublishRequest {
  exchange: string; // e.g., 'legal-ai-exchange'
  routingKey: string; // Destination queue routing key
  message: {
    sessionId: string;
    userId: string;
    caseId?: string;
    document?: {
      id: string;
      type: 'evidence' | 'contract' | 'brief' | 'deposition';
      confidence: number;
    };
    timestamp: string; // ISO 8601 format
    priority: 'high' | 'standard' | 'background';
    requestedModel: string;
  };
  options: {
    persistent: boolean; // Message persistence in queue
    timestamp: number; // Milliseconds since epoch
    messageId: string; // Unique message identifier
  };
}
```

### Response Schema
```typescript
interface QueuePublishResponse {
  messageId: string; // ID of published message
  routingKey: string; // Routing key used
  queue?: string; // Destination queue (if available)
  timestamp: string; // Server timestamp
  [key: string]: unknown; // Additional fields from broker
}
```

### Status Codes
- `200 OK` - Message published successfully
- `400 Bad Request` - Invalid routing key or exchange
- `503 Service Unavailable` - RabbitMQ unavailable

---

## 3. Cache Check Endpoint

**Purpose**: Checks Redis cache for existing recommendations

**Endpoint**: `POST /api/cache/check`

### Request Schema
```typescript
interface CacheCheckRequest {
  keys: string[]; // Cache keys to check
  operation: 'mget' | 'exists'; // Operation type
}
```

### Response Schema
```typescript
interface CacheCheckResponse {
  cacheHit: boolean; // Whether data was found in cache
  hitRate: number; // Cache hit ratio (0-1)
  cachedData?: {
    legal: Array<{
      id: string;
      type: 'precedent' | 'statute' | 'regulation' | 'case_law';
      title: string;
      relevance: number;
      summary: string;
      citation?: string;
      confidence: number;
    }>;
    documents: Array<{
      id: string;
      filename: string;
      documentType: string;
      similarity: number;
      excerpt: string;
      metadata: Record<string, unknown>;
    }>;
    actions: Array<{
      id: string;
      action: 'review' | 'investigate' | 'file_motion' | 'gather_evidence' | 'analyze_risk';
      priority: 'low' | 'medium' | 'high' | 'urgent';
      description: string;
      reasoning: string;
      estimatedTime: string;
    }>;
    risks: Array<{
      id: string;
      category: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      probability: number;
      impact: string;
      mitigation: string[];
    }>;
  };
  keys?: string[]; // Keys that were checked
}
```

### Status Codes
- `200 OK` - Cache check successful
- `400 Bad Request` - Invalid cache keys
- `503 Service Unavailable` - Redis unavailable

---

## 4. Recommendation Generation Endpoint

**Purpose**: Generates AI recommendations for legal cases

**Endpoint**: `POST /api/recommendations/generate`

### Request Schema
```typescript
interface GenerateRecommendationsRequest {
  sessionId: string;
  userId: string;
  caseId?: string;
  document?: {
    id: string;
    type: 'evidence' | 'contract' | 'brief' | 'deposition';
    confidence: number;
  };
  model: string; // AI model to use
  messageId: string; // RabbitMQ message ID
  options: {
    includeLegal: boolean;
    includeDocuments: boolean;
    includeActions: boolean;
    includeRisks: boolean;
    maxRecommendations: number;
    confidenceThreshold: number; // 0-1
  };
}
```

### Response Schema
```typescript
interface GenerateRecommendationsResponse {
  recommendations: {
    legal: Array<LegalRecommendation>;
    documents: Array<DocumentRecommendation>;
    actions: Array<ActionRecommendation>;
    risks: Array<RiskRecommendation>;
  };
  metrics: {
    latency: number; // Response time in milliseconds
    throughput: number; // Requests per second
    errorRate?: number; // Error rate (0-1)
  };
  model: string; // Model used for generation
  timestamp: string; // Generation timestamp
}
```

### Status Codes
- `200 OK` - Recommendations generated successfully
- `400 Bad Request` - Invalid request parameters
- `500 Internal Server Error` - Generation failed
- `503 Service Unavailable` - AI service unavailable

---

## 5. Cache Storage Endpoint

**Purpose**: Stores recommendations in Redis cache

**Endpoint**: `POST /api/cache/store`

### Request Schema
```typescript
interface CacheStoreRequest {
  data: {
    legal: Array<LegalRecommendation>;
    documents: Array<DocumentRecommendation>;
    actions: Array<ActionRecommendation>;
    risks: Array<RiskRecommendation>;
  };
  keys: string[]; // Cache keys to store under
  ttl: number; // Time-to-live in seconds
  compression: boolean; // Enable SIMD JSON compression
}
```

### Response Schema
```typescript
interface CacheStoreResponse {
  newKeys: string[]; // Keys that were stored
  storedCount: number; // Number of items stored
  compressionRatio?: number; // Compression ratio if compression enabled
  timestamp: string; // Storage timestamp
}
```

### Status Codes
- `200 OK` - Data stored successfully
- `400 Bad Request` - Invalid cache data
- `503 Service Unavailable` - Redis unavailable

---

## Shared Type Definitions

### LegalRecommendation
```typescript
interface LegalRecommendation {
  id: string;
  type: 'precedent' | 'statute' | 'regulation' | 'case_law';
  title: string;
  relevance: number; // 0-1
  summary: string;
  citation?: string;
  confidence: number; // 0-1
}
```

### DocumentRecommendation
```typescript
interface DocumentRecommendation {
  id: string;
  filename: string;
  documentType: string;
  similarity: number; // 0-1 cosine similarity
  excerpt: string;
  metadata: Record<string, unknown>;
}
```

### ActionRecommendation
```typescript
interface ActionRecommendation {
  id: string;
  action: 'review' | 'investigate' | 'file_motion' | 'gather_evidence' | 'analyze_risk';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  description: string;
  reasoning: string;
  estimatedTime: string; // e.g., '2-3 hours', '1 day'
}
```

### RiskRecommendation
```typescript
interface RiskRecommendation {
  id: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  probability: number; // 0-1
  impact: string;
  mitigation: string[];
}
```

---

## Error Response Format

All endpoints follow a consistent error response format:

```typescript
interface ApiErrorResponse {
  error: string; // Error message
  code: string; // Error code (e.g., 'INVALID_REQUEST', 'SERVICE_UNAVAILABLE')
  details?: Record<string, unknown>; // Additional error details
  timestamp: string; // Error timestamp
  requestId?: string; // Request tracking ID
}
```

### Example Error Response
```json
{
  "error": "Invalid routing key",
  "code": "INVALID_ROUTING_KEY",
  "details": {
    "providedKey": "invalid.key",
    "validQueues": ["legal.priority.high", "legal.priority.standard", "legal.background"]
  },
  "timestamp": "2025-10-15T14:30:00Z",
  "requestId": "req-12345"
}
```

---

## Rate Limiting

All endpoints implement rate limiting:

- **Default**: 100 requests per minute per user
- **Headers**:
  - `X-RateLimit-Limit`: Maximum requests per window
  - `X-RateLimit-Remaining`: Remaining requests in window
  - `X-RateLimit-Reset`: Time until limit resets (Unix timestamp)

---

## Authentication

All endpoints require authentication via bearer token:

```
Authorization: Bearer <token>
```

---

## Examples

### Example: Generate Recommendations
```bash
curl -X POST http://localhost:5173/api/recommendations/generate \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session_1726420200000",
    "userId": "user-123",
    "caseId": "case-456",
    "model": "gemma3:legal-latest",
    "messageId": "msg_1726420200000_xyz",
    "options": {
      "includeLegal": true,
      "includeDocuments": true,
      "includeActions": true,
      "includeRisks": true,
      "maxRecommendations": 10,
      "confidenceThreshold": 0.7
    }
  }'
```

### Example: Check Cache
```bash
curl -X POST http://localhost:5173/api/cache/check \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "keys": [
      "rec:user-123:case-456:legal",
      "rec:user-123:case-456:documents"
    ],
    "operation": "mget"
  }'
```

---

## Performance Metrics

### Typical Response Times
- **Routing Analysis**: 10-50ms
- **Cache Check**: 5-20ms
- **Recommendation Generation**: 500-2000ms (depends on model)
- **Cache Storage**: 20-100ms

### Recommended Timeouts
- Routing Analysis: 5 seconds
- Recommendation Generation: 10 seconds
- Cache Operations: 3 seconds

---

## Future Enhancements

- [ ] GraphQL endpoint for flexible querying
- [ ] WebSocket support for streaming recommendations
- [ ] Batch processing endpoint for multiple documents
- [ ] Export recommendations to PDF/DOC formats
- [ ] Integration with legal citation APIs

---

**Last Updated**: October 15, 2025
**Version**: 1.0.0
**Maintainer**: Legal AI Platform Team
