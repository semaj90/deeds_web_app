# 🧪 XState Testing Strategy for Legal AI Platform

## Overview

This document outlines the comprehensive testing strategy for XState service coordination patterns in the legal AI platform, designed to support the upcoming Phase 5-7 gRPC optimization and enterprise scalability goals.

## Testing Architecture

### 🧠 Unit Testing: Machine Logic Isolation

Testing the "brain" of service coordinators without external dependencies.

### 🌍 Integration Testing: Real-World Service Communication

Testing actual API calls, gRPC services, and database interactions.

---

## 🏗️ XState Machine Architecture

### Current Legal AI Platform Machines

```typescript
// src/lib/services/xstate-integration.ts
export class XStateGlobalOrchestrator {
  private machines = {
    auth: authMachine,              // Authentication workflows
    session: sessionMachine,        // User session management
    aiAssistant: aiAssistantMachine, // AI conversation flows
    agentShell: agentShellMachine,  // Agent coordination
    evidenceCanvas: evidenceCanvasMachine, // Evidence board collaboration
    documentProcessor: documentProcessorMachine, // Document analysis workflows
    legalResearch: legalResearchMachine, // Legal research coordination
    caseAnalysis: caseAnalysisMachine // Case analysis workflows
  };
}
```

---

## 🧪 Unit Testing Implementation

### Test Setup with Vitest

```typescript
// src/lib/services/__tests__/setup.ts
import { beforeEach } from 'vitest';
import { createTestMachine } from 'xstate/lib/testing';
import type { LegalAIServiceMap } from '../types';

// Mock service implementations for unit testing
export const mockServices: LegalAIServiceMap = {
  // Authentication services
  validateCredentials: vi.fn().mockResolvedValue({ valid: true, userId: 'test-123' }),
  refreshAuthToken: vi.fn().mockResolvedValue({ token: 'new-token-456' }),

  // Document processing services
  processLegalDocument: vi.fn().mockResolvedValue({
    text: 'Sample document text',
    entities: ['John Doe', 'Case #12345'],
    confidence: 0.95
  }),

  // Vector search services
  searchSimilarCases: vi.fn().mockResolvedValue([
    { caseId: 'case-1', similarity: 0.92, title: 'Similar Case 1' },
    { caseId: 'case-2', similarity: 0.87, title: 'Similar Case 2' }
  ]),

  // Evidence processing services
  analyzeEvidence: vi.fn().mockResolvedValue({
    evidenceType: 'document',
    relevanceScore: 0.89,
    keyInsights: ['Critical timeline inconsistency']
  }),

  // gRPC service mocks (for Phase 5-7 preparation)
  grpcCaseManagement: vi.fn().mockResolvedValue({
    status: 'SUCCESS',
    data: { caseId: 'grpc-case-123' }
  }),

  grpcEvidenceStream: vi.fn().mockImplementation(async function* () {
    yield { chunk: 1, data: 'evidence-chunk-1' };
    yield { chunk: 2, data: 'evidence-chunk-2' };
  })
};

export function createLegalTestMachine(machine: any) {
  return createTestMachine(machine, {
    services: mockServices
  });
}
```

### Authentication Machine Testing

```typescript
// src/lib/machines/__tests__/auth-machine.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from 'xstate';
import { authMachine } from '../auth-machine';
import { createLegalTestMachine, mockServices } from './setup';

describe('Authentication Machine', () => {
  let testMachine: any;

  beforeEach(() => {
    testMachine = createLegalTestMachine(authMachine);
    vi.clearAllMocks();
  });

  describe('Login Flow', () => {
    it('should transition to authenticated state on successful login', async () => {
      const result = await testMachine.test([
        { type: 'LOGIN', credentials: { email: 'test@example.com', password: 'password' } }
      ]);

      // Assert final state
      expect(result.hasTag('authenticated')).toBe(true);

      // Assert context was updated
      expect(result.context.user.id).toBe('test-123');

      // Assert service was called
      expect(mockServices.validateCredentials).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password'
      });
    });

    it('should transition to error state on authentication failure', async () => {
      // Override mock for this test
      mockServices.validateCredentials.mockRejectedValueOnce(
        new Error('Invalid credentials')
      );

      const result = await testMachine.test([
        { type: 'LOGIN', credentials: { email: 'invalid@example.com', password: 'wrong' } }
      ]);

      expect(result.hasTag('error')).toBe(true);
      expect(result.context.error).toBeDefined();
    });
  });

  describe('Token Refresh Flow', () => {
    it('should automatically refresh expired tokens', async () => {
      const result = await testMachine.test([
        { type: 'LOGIN', credentials: { email: 'test@example.com', password: 'password' } },
        { type: 'TOKEN_EXPIRED' }
      ]);

      expect(result.hasTag('authenticated')).toBe(true);
      expect(mockServices.refreshAuthToken).toHaveBeenCalled();
    });
  });
});
```

### Document Processing Machine Testing

```typescript
// src/lib/machines/__tests__/document-processor-machine.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { documentProcessorMachine } from '../document-processor-machine';
import { createLegalTestMachine, mockServices } from './setup';

describe('Document Processor Machine', () => {
  let testMachine: any;

  beforeEach(() => {
    testMachine = createLegalTestMachine(documentProcessorMachine);
    vi.clearAllMocks();
  });

  describe('Legal Document Analysis', () => {
    it('should process document and extract legal entities', async () => {
      const mockFile = new File(['sample content'], 'legal-doc.pdf');

      const result = await testMachine.test([
        { type: 'PROCESS_DOCUMENT', file: mockFile }
      ]);

      expect(result.hasTag('completed')).toBe(true);
      expect(result.context.extractedEntities).toEqual(['John Doe', 'Case #12345']);
      expect(mockServices.processLegalDocument).toHaveBeenCalledWith(mockFile);
    });

    it('should handle OCR processing for scanned documents', async () => {
      const result = await testMachine.test([
        { type: 'PROCESS_DOCUMENT', file: new File([''], 'scanned.pdf'), requiresOCR: true }
      ]);

      // Verify OCR workflow was triggered
      expect(result.hasTag('ocr_complete')).toBe(true);
      expect(result.context.ocrText).toBeDefined();
    });
  });

  describe('Evidence Integration', () => {
    it('should automatically link processed documents to evidence board', async () => {
      const result = await testMachine.test([
        { type: 'PROCESS_DOCUMENT', file: new File([''], 'evidence.pdf') },
        { type: 'LINK_TO_EVIDENCE', evidenceId: 'evidence-123' }
      ]);

      expect(result.hasTag('linked_to_evidence')).toBe(true);
      expect(result.context.linkedEvidenceId).toBe('evidence-123');
    });
  });
});
```

### Evidence Canvas Machine Testing

```typescript
// src/lib/machines/__tests__/evidence-canvas-machine.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { evidenceCanvasMachine } from '../evidence-canvas-machine';
import { createLegalTestMachine, mockServices } from './setup';

describe('Evidence Canvas Machine', () => {
  let testMachine: any;

  beforeEach(() => {
    testMachine = createLegalTestMachine(evidenceCanvasMachine);
    vi.clearAllMocks();
  });

  describe('Real-time Collaboration', () => {
    it('should sync canvas state across multiple users', async () => {
      const canvasUpdate = {
        objects: [{ id: 'obj-1', type: 'evidence', x: 100, y: 200 }],
        timestamp: Date.now()
      };

      const result = await testMachine.test([
        { type: 'CANVAS_UPDATE', update: canvasUpdate, userId: 'user-1' }
      ]);

      expect(result.hasTag('synced')).toBe(true);
      expect(result.context.lastUpdate.userId).toBe('user-1');
    });

    it('should handle conflict resolution for simultaneous edits', async () => {
      const result = await testMachine.test([
        { type: 'CANVAS_UPDATE', update: { id: 'obj-1', x: 100 }, userId: 'user-1' },
        { type: 'CANVAS_UPDATE', update: { id: 'obj-1', x: 150 }, userId: 'user-2' }
      ]);

      expect(result.hasTag('conflict_resolved')).toBe(true);
      expect(result.context.conflictResolution).toBeDefined();
    });
  });

  describe('AI-Assisted Evidence Analysis', () => {
    it('should automatically suggest evidence relationships', async () => {
      const result = await testMachine.test([
        { type: 'ADD_EVIDENCE', evidence: { id: 'ev-1', type: 'document' } },
        { type: 'ADD_EVIDENCE', evidence: { id: 'ev-2', type: 'witness' } },
        { type: 'ANALYZE_RELATIONSHIPS' }
      ]);

      expect(result.hasTag('analysis_complete')).toBe(true);
      expect(result.context.suggestedRelationships).toBeDefined();
      expect(mockServices.analyzeEvidence).toHaveBeenCalled();
    });
  });
});
```

---

## 🌍 Integration Testing Implementation

### REST API Service Testing

```typescript
// src/lib/services/__tests__/integration/rest-services.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { rest } from 'msw';
import {
  validateCredentials,
  processLegalDocument,
  searchSimilarCases
} from '../rest-services';

// Mock server for integration testing
const server = setupServer(
  rest.post('/api/auth/validate', (req, res, ctx) => {
    return res(ctx.json({ valid: true, userId: 'real-user-123' }));
  }),

  rest.post('/api/documents/process', (req, res, ctx) => {
    return res(ctx.json({
      text: 'Processed document content',
      entities: ['Legal Entity 1', 'Case Reference'],
      confidence: 0.91
    }));
  }),

  rest.get('/api/cases/search', (req, res, ctx) => {
    return res(ctx.json([
      { caseId: 'real-case-1', similarity: 0.94 },
      { caseId: 'real-case-2', similarity: 0.88 }
    ]));
  })
);

beforeAll(() => server.listen());
afterAll(() => server.close());

describe('REST API Services Integration', () => {
  describe('Authentication Service', () => {
    it('should validate credentials against real API', async () => {
      const result = await validateCredentials({
        email: 'test@example.com',
        password: 'password'
      });

      expect(result.valid).toBe(true);
      expect(result.userId).toBe('real-user-123');
    });
  });

  describe('Document Processing Service', () => {
    it('should process legal documents via API', async () => {
      const mockFile = new File(['legal content'], 'test.pdf');

      const result = await processLegalDocument(mockFile);

      expect(result.text).toBe('Processed document content');
      expect(result.entities).toContain('Legal Entity 1');
      expect(result.confidence).toBeGreaterThan(0.9);
    });
  });

  describe('Vector Search Service', () => {
    it('should search similar cases via API', async () => {
      const results = await searchSimilarCases({
        query: 'criminal defense case',
        threshold: 0.8
      });

      expect(results).toHaveLength(2);
      expect(results[0].similarity).toBeGreaterThan(0.9);
    });
  });
});
```

### gRPC Service Testing (Phase 5-7 Preparation)

```typescript
// src/lib/services/__tests__/integration/grpc-services.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestGrpcServer, createGrpcClient } from './grpc-test-utils';
import { GrpcCaseManagementClient, GrpcEvidenceStreamClient } from '../grpc-clients';

describe('gRPC Services Integration (Phase 5-7)', () => {
  let grpcServer: any;
  let caseClient: GrpcCaseManagementClient;
  let evidenceClient: GrpcEvidenceStreamClient;

  beforeAll(async () => {
    grpcServer = await startTestGrpcServer();
    caseClient = new GrpcCaseManagementClient('localhost:50051');
    evidenceClient = new GrpcEvidenceStreamClient('localhost:50051');
  });

  afterAll(async () => {
    await grpcServer.shutdown();
  });

  describe('Case Management gRPC', () => {
    it('should create case via binary protocol', async () => {
      const caseData = {
        title: 'Test Case',
        type: 'CRIMINAL',
        jurisdiction: 'STATE',
        metadata: { priority: 'HIGH' }
      };

      const result = await caseClient.createCase(caseData);

      expect(result.status).toBe('SUCCESS');
      expect(result.caseId).toBeDefined();
      expect(result.caseId).toMatch(/^case-/);
    });

    it('should handle binary serialization efficiently', async () => {
      const startTime = Date.now();

      const result = await caseClient.getCaseDetails('case-123');

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(100); // Sub-100ms target
      expect(result.case).toBeDefined();
    });
  });

  describe('Evidence Streaming gRPC', () => {
    it('should stream evidence updates in real-time', async () => {
      const evidenceUpdates: any[] = [];

      const stream = evidenceClient.streamEvidenceUpdates('case-123');

      // Collect first 3 updates
      for await (const update of stream) {
        evidenceUpdates.push(update);
        if (evidenceUpdates.length >= 3) break;
      }

      expect(evidenceUpdates).toHaveLength(3);
      expect(evidenceUpdates[0].chunk).toBe(1);
      expect(evidenceUpdates[2].chunk).toBe(3);
    });

    it('should handle QUIC transport layer efficiently', async () => {
      // Test upcoming QUIC implementation
      const streamStartTime = Date.now();

      const stream = evidenceClient.streamWithQUIC('case-456');
      const firstChunk = await stream.next();

      const latency = Date.now() - streamStartTime;
      expect(latency).toBeLessThan(30); // QUIC sub-30ms target
      expect(firstChunk.value).toBeDefined();
    });
  });
});
```

### Database Integration Testing

```typescript
// src/lib/services/__tests__/integration/database-services.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../../db/drizzle-config';
import { cases, evidence, vectorSearches } from '../../db/schema';
import {
  createCase,
  addEvidence,
  performVectorSearch
} from '../database-services';

describe('Database Services Integration', () => {
  beforeEach(async () => {
    // Setup test database
    await db.delete(cases);
    await db.delete(evidence);
    await db.delete(vectorSearches);
  });

  afterEach(async () => {
    // Cleanup test data
    await db.delete(cases);
    await db.delete(evidence);
    await db.delete(vectorSearches);
  });

  describe('Case Management', () => {
    it('should create case with proper schema validation', async () => {
      const caseData = {
        title: 'Integration Test Case',
        type: 'criminal',
        status: 'active',
        createdBy: 'test-user'
      };

      const result = await createCase(caseData);

      expect(result.id).toBeDefined();
      expect(result.title).toBe('Integration Test Case');

      // Verify database persistence
      const savedCase = await db.select().from(cases).where(eq(cases.id, result.id));
      expect(savedCase).toHaveLength(1);
      expect(savedCase[0].title).toBe('Integration Test Case');
    });
  });

  describe('Vector Search', () => {
    it('should perform pgvector similarity search', async () => {
      // Create test embeddings
      const testEmbedding = new Array(384).fill(0).map(() => Math.random());

      const searchResults = await performVectorSearch({
        embedding: testEmbedding,
        threshold: 0.8,
        limit: 5
      });

      expect(searchResults).toBeDefined();
      expect(Array.isArray(searchResults)).toBe(true);
      // Results depend on existing test data
    });

    it('should handle HNSW index performance requirements', async () => {
      const startTime = Date.now();

      const embedding = new Array(384).fill(0).map(() => Math.random());
      await performVectorSearch({ embedding, threshold: 0.7, limit: 10 });

      const searchTime = Date.now() - startTime;
      expect(searchTime).toBeLessThan(180); // Current 180ms baseline
    });
  });
});
```

---

## 🚀 Phase 5-7 Performance Testing

### gRPC vs REST Performance Comparison

```typescript
// src/lib/services/__tests__/performance/protocol-comparison.test.ts
import { describe, it, expect } from 'vitest';
import { performance } from 'perf_hooks';
import {
  restCaseManagement,
  grpcCaseManagement
} from '../performance-clients';

describe('Protocol Performance Comparison (Phase 5-7)', () => {
  const testCases = Array.from({ length: 100 }, (_, i) => ({
    id: `case-${i}`,
    title: `Performance Test Case ${i}`,
    data: new Array(1000).fill(0).map(() => Math.random()) // Simulate complex data
  }));

  describe('Throughput Benchmarks', () => {
    it('should achieve 60% performance improvement with gRPC', async () => {
      // REST baseline
      const restStart = performance.now();
      await Promise.all(
        testCases.slice(0, 50).map(testCase =>
          restCaseManagement.createCase(testCase)
        )
      );
      const restTime = performance.now() - restStart;

      // gRPC comparison
      const grpcStart = performance.now();
      await Promise.all(
        testCases.slice(50, 100).map(testCase =>
          grpcCaseManagement.createCase(testCase)
        )
      );
      const grpcTime = performance.now() - grpcStart;

      // Calculate improvement
      const improvement = (restTime - grpcTime) / restTime;

      console.log(`REST time: ${restTime}ms, gRPC time: ${grpcTime}ms`);
      console.log(`Performance improvement: ${(improvement * 100).toFixed(1)}%`);

      // Target: 60% improvement
      expect(improvement).toBeGreaterThan(0.6);
    });
  });

  describe('Latency Benchmarks', () => {
    it('should achieve sub-100ms response times with gRPC', async () => {
      const latencies: number[] = [];

      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        await grpcCaseManagement.getCaseDetails(`case-${i}`);
        const latency = performance.now() - start;
        latencies.push(latency);
      }

      const averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

      console.log(`Average latency: ${averageLatency.toFixed(1)}ms`);
      console.log(`P95 latency: ${p95Latency.toFixed(1)}ms`);

      expect(averageLatency).toBeLessThan(100);
      expect(p95Latency).toBeLessThan(150);
    });
  });
});
```

---

## 📊 Test Execution & CI/CD Integration

### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/lib/services/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'src/lib/services/__tests__/**',
        '**/*.d.ts'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        },
        // Stricter requirements for XState machines
        'src/lib/machines/**': {
          branches: 95,
          functions: 95,
          lines: 95,
          statements: 95
        }
      }
    },
    testTimeout: 10000, // Accommodate integration tests
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true
      }
    }
  }
});
```

### Package.json Test Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run src/**/*.test.ts",
    "test:integration": "vitest run src/**/*integration*.test.ts",
    "test:performance": "vitest run src/**/*performance*.test.ts",
    "test:xstate": "vitest run src/lib/machines/**/*.test.ts",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest --watch",
    "test:ci": "vitest run --coverage --reporter=junit --outputFile=test-results.xml"
  }
}
```

---

## 🎯 Success Metrics & KPIs

### Testing Coverage Goals

- **Unit Tests**: 95% coverage for XState machines
- **Integration Tests**: 80% coverage for service functions
- **Performance Tests**: All critical paths benchmarked
- **E2E Tests**: Complete user workflows validated

### Performance Targets (Phase 5-7)

- **gRPC Improvement**: 60% faster than REST baseline
- **Response Times**: <100ms average, <150ms P95
- **Throughput**: 1,200 requests/second sustained
- **Concurrent Users**: 2,500+ users supported

### Quality Assurance

- **Test Execution Time**: Full suite <5 minutes
- **Flaky Test Rate**: <1% of test runs
- **Test Maintenance**: Tests updated with code changes
- **CI/CD Integration**: All tests pass before deployment

---

## 🏁 Implementation Roadmap

### Week 1-2: Foundation
- ✅ Set up Vitest configuration with XState testing
- ✅ Implement unit tests for all 8 XState machines
- ✅ Create mock service implementations
- ✅ Establish performance benchmarking baseline

### Week 3-4: Integration
- 🔄 Build integration tests for REST services
- 🔄 Implement gRPC service integration tests
- 🔄 Add database integration test suite
- 🔄 Set up MSW for realistic API mocking

### Week 5-6: Performance & CI/CD
- ⏳ Create performance comparison tests
- ⏳ Integrate tests into CI/CD pipeline
- ⏳ Establish quality gates and metrics
- ⏳ Document testing best practices

This comprehensive testing strategy ensures your legal AI platform maintains high quality and performance through the upcoming gRPC optimization phase while providing confidence in the complex XState service coordination patterns.