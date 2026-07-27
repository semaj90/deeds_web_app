import { describe, it, expect, beforeEach } from 'vitest';
import {
  phase18RequestEnvelopeSchema,
  phase18ResponseEnvelopeSchema,
  offlineStorageEnvelopeSchema,
  mcpToolInputSchema,
  trpcProcedureInputSchema,
  mastraAgentMessageSchema,
  validatePhase18Request,
  validatePhase18Response,
  validateEnvelope,
  type Phase18RequestEnvelope,
  type Phase18ResponseEnvelope,
  type OfflineStorageEnvelope,
  type MCPToolInput,
  type MastraAgentMessage,
} from './phase18-envelope-schema.js';
import { randomUUID } from 'node:crypto';

/**
 * Phase 18 XGBoost Reranker Integration Tests
 *
 * Validates:
 * - Input/output envelope schemas
 * - Cross-transport compatibility (MCP, tRPC, Mastra, offline)
 * - Feature validation and normalization
 * - Error handling and graceful degradation
 */

const createMockRequestEnvelope = (): Phase18RequestEnvelope => ({
  metadata: {
    envelopeId: randomUUID(),
    phase: 18,
    createdAt: new Date().toISOString(),
    source: 'trpc',
    version: '1.0',
    correlationId: randomUUID(),
    mode: 'inference'
  },
  packets: [
    {
      packetKey: 'test:packet:001',
      sourceRef: 'src/lib/test.ts',
      featureId: 'test.feature',
      features: {
        values: Array(13).fill(0.5),
        names: [
          'qdrant_score', 'cluster_score', 'topological_score', 'fusion_score',
          'authority_score', 'member_count', 'summary_length', 'source_ref_depth',
          'is_core_library', 'is_test_file', 'has_packets', 'packet_count',
          'avg_packet_authority'
        ]
      }
    }
  ],
  params: {
    topK: 10,
    returnReasons: true,
    returnLatency: true
  }
});

const createMockResponseEnvelope = (
  requestId: string
): Phase18ResponseEnvelope => ({
  metadata: {
    envelopeId: randomUUID(),
    phase: 18,
    createdAt: new Date().toISOString(),
    source: 'trpc',
    version: '1.0',
    correlationId: randomUUID(),
    mode: 'inference'
  },
  requestId,
  success: true,
  results: [
    {
      packetKey: 'test:packet:001',
      rerankScore: 0.85,
      confidence: 0.92,
      reason: 'High feature average score',
      modelVersion: '1.0',
      latencyMs: 12
    }
  ],
  summary: {
    totalPackets: 1,
    successCount: 1,
    errorCount: 0,
    avgScore: 0.85,
    avgConfidence: 0.92,
    totalLatencyMs: 12
  },
  cache: {
    cacheKey: `phase18:${randomUUID()}`,
    ttlSeconds: 3600,
    canCache: true
  }
});

describe('Phase 18 Envelope Schema Integration', () => {
  describe('Input Validation', () => {
    it('should validate a correct request envelope', () => {
      const request = createMockRequestEnvelope();
      const validation = validatePhase18Request(request);

      expect(validation.success).toBe(true);
      expect(validation.data).toBeDefined();
    });

    it('should reject request with invalid feature dimension', () => {
      const request = createMockRequestEnvelope();
      request.packets[0].features.values = Array(12).fill(0.5); // Wrong dimension

      const validation = validatePhase18Request(request);
      expect(validation.success).toBe(false);
    });

    it('should reject request with missing metadata', () => {
      const request = createMockRequestEnvelope();
      const { metadata: _metadata, ...invalidRequest } = request;

      const validation = validatePhase18Request(invalidRequest);
      expect(validation.success).toBe(false);
    });

    it('should accept feature vectors with all values in [0, 1]', () => {
      const request = createMockRequestEnvelope();
      request.packets[0].features.values = [
        0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0,
        0.2, 0.3, 0.4, 0.6, 0.7, 0.8
      ];

      const validation = validatePhase18Request(request);
      expect(validation.success).toBe(true);
    });

    it('should reject feature vectors with out-of-range values', () => {
      const request = createMockRequestEnvelope();
      request.packets[0].features.values[0] = 1.5; // Out of [0, 1] range

      const validation = validatePhase18Request(request);
      expect(validation.success).toBe(false);
    });
  });

  describe('Output Validation', () => {
    it('should validate a correct response envelope', () => {
      const response = createMockResponseEnvelope(randomUUID());
      const validation = validatePhase18Response(response);

      expect(validation.success).toBe(true);
    });

    it('should validate response with empty results', () => {
      const response = createMockResponseEnvelope(randomUUID());
      response.results = [];
      response.summary!.totalPackets = 0;

      const validation = validatePhase18Response(response);
      expect(validation.success).toBe(true);
    });

    it('should reject response with invalid prediction score', () => {
      const response = createMockResponseEnvelope(randomUUID());
      response.results[0].rerankScore = 1.5; // Out of [0, 1] range

      const validation = validatePhase18Response(response);
      expect(validation.success).toBe(false);
    });

    it('should require requestId in response', () => {
      const response = createMockResponseEnvelope(randomUUID());
      const { requestId: _rid, ...invalidResponse } = response;

      const validation = validatePhase18Response(invalidResponse);
      expect(validation.success).toBe(false);
    });
  });

  describe('MCP JSON 2.0 Transport', () => {
    it('should parse MCP tool input schema', () => {
      const mcpInput: MCPToolInput = {
        packetKeys: ['test:001', 'test:002'],
        features: [
          { values: Array(13).fill(0.5) },
          { values: Array(13).fill(0.6) }
        ],
        topK: 5,
        returnReasons: true
      };

      const validation = mcpToolInputSchema.safeParse(mcpInput);
      expect(validation.success).toBe(true);
    });

    it('should enforce minimum packet count in MCP input', () => {
      const mcpInput = {
        packetKeys: [],
        features: [],
        topK: 10
      };

      const validation = mcpToolInputSchema.safeParse(mcpInput);
      expect(validation.success).toBe(false);
    });

    it('should validate MCP input with all optional parameters', () => {
      const mcpInput: MCPToolInput = {
        packetKeys: ['test:001'],
        features: [{ values: Array(13).fill(0.5), names: Array(13).fill('feature') }],
        topK: 20,
        returnReasons: true
      };

      const validation = mcpToolInputSchema.safeParse(mcpInput);
      expect(validation.success).toBe(true);
    });
  });

  describe('tRPC Transport', () => {
    it('should parse tRPC procedure input with context', () => {
      const trpcInput = {
        ...createMockRequestEnvelope(),
        trpcContext: {
          userId: randomUUID(),
          sessionId: randomUUID(),
          isAuthenticated: true
        }
      };

      const validation = trpcProcedureInputSchema.safeParse(trpcInput);
      expect(validation.success).toBe(true);
    });

    it('should accept tRPC input without context', () => {
      const trpcInput = createMockRequestEnvelope();
      const validation = trpcProcedureInputSchema.safeParse(trpcInput);

      expect(validation.success).toBe(true);
    });
  });

  describe('Offline Storage', () => {
    it('should validate offline request storage envelope', () => {
      const envelope: OfflineStorageEnvelope = {
        storageId: randomUUID(),
        payloadType: 'request',
        payload: createMockRequestEnvelope() as any,
        storedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        storageLayer: 'indexeddb',
        syncStatus: 'pending',
        syncAttempts: 0
      };

      const validation = offlineStorageEnvelopeSchema.safeParse(envelope);
      expect(validation.success).toBe(true);
    });

    it('should validate offline response storage envelope', () => {
      const envelope: OfflineStorageEnvelope = {
        storageId: randomUUID(),
        payloadType: 'response',
        payload: createMockResponseEnvelope(randomUUID()) as any,
        storedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        storageLayer: 'localstorage',
        syncStatus: 'synced',
        syncAttempts: 0
      };

      const validation = offlineStorageEnvelopeSchema.safeParse(envelope);
      expect(validation.success).toBe(true);
    });

    it('should track sync status changes', () => {
      const envelope: OfflineStorageEnvelope = {
        storageId: randomUUID(),
        payloadType: 'request',
        payload: {} as any,
        storedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        storageLayer: 'indexeddb',
        syncStatus: 'pending',
        syncAttempts: 0
      };

      // Verify all valid sync statuses
      const statuses = ['pending', 'syncing', 'synced', 'failed'] as const;
      for (const status of statuses) {
        envelope.syncStatus = status;
        const validation = offlineStorageEnvelopeSchema.safeParse(envelope);
        expect(validation.success).toBe(true);
      }
    });
  });

  describe('Mastra Agent Orchestration', () => {
    it('should validate Mastra agent message with request payload', () => {
      const message: MastraAgentMessage = {
        id: randomUUID(),
        workflowId: randomUUID(),
        stepId: 'rerank-stage-1',
        type: 'request',
        payload: createMockRequestEnvelope(),
        metadata: {
          toolName: 'phase18_reranker',
          toolVersion: '1.0',
          executionTime: 125
        }
      };

      const validation = mastraAgentMessageSchema.safeParse(message);
      expect(validation.success).toBe(true);
    });

    it('should validate Mastra agent message with response payload', () => {
      const requestId = randomUUID();
      const message: MastraAgentMessage = {
        id: randomUUID(),
        workflowId: randomUUID(),
        stepId: 'rerank-stage-1',
        type: 'response',
        payload: createMockResponseEnvelope(requestId),
        metadata: {
          toolName: 'phase18_reranker',
          toolVersion: '1.0'
        }
      };

      const validation = mastraAgentMessageSchema.safeParse(message);
      expect(validation.success).toBe(true);
    });

    it('should validate Mastra agent message with batch payload', () => {
      const message: MastraAgentMessage = {
        id: randomUUID(),
        workflowId: randomUUID(),
        stepId: 'rerank-batch',
        type: 'request',
        payload: {
          metadata: {
            envelopeId: randomUUID(),
            phase: 18,
            createdAt: new Date().toISOString(),
            source: 'mastra',
            version: '1.0',
            mode: 'inference'
          },
          batchId: randomUUID(),
          totalPackets: 100,
          chunkIndex: 0,
          totalChunks: 10,
          packets: [
            {
              packetKey: 'test:001',
              sourceRef: 'src/test.ts',
              featureId: 'test.feature',
              features: { values: Array(13).fill(0.5) }
            }
          ]
        },
        metadata: {
          toolName: 'phase18_reranker',
          toolVersion: '1.0'
        }
      };

      const validation = mastraAgentMessageSchema.safeParse(message);
      expect(validation.success).toBe(true);
    });
  });

  describe('Cross-Transport Compatibility', () => {
    it('should convert request from tRPC to MCP format', () => {
      const trpcRequest = createMockRequestEnvelope();
      const mcpInput: MCPToolInput = {
        packetKeys: trpcRequest.packets.map(p => p.packetKey),
        features: trpcRequest.packets.map(p => p.features),
        topK: trpcRequest.params?.topK || 10,
        returnReasons: trpcRequest.params?.returnReasons || false
      };

      const mcpValidation = mcpToolInputSchema.safeParse(mcpInput);
      expect(mcpValidation.success).toBe(true);
    });

    it('should route request through all transports without loss', () => {
      const original = createMockRequestEnvelope();

      // MCP validation
      const mcpInput = {
        packetKeys: original.packets.map(p => p.packetKey),
        features: original.packets.map(p => p.features)
      };
      const mcpValid = mcpToolInputSchema.safeParse(mcpInput);
      expect(mcpValid.success).toBe(true);

      // tRPC validation
      const trpcValid = trpcProcedureInputSchema.safeParse(original);
      expect(trpcValid.success).toBe(true);

      // Offline storage validation
      const offlineValid = offlineStorageEnvelopeSchema.safeParse({
        storageId: randomUUID(),
        payloadType: 'request',
        payload: original as any,
        storedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        storageLayer: 'indexeddb',
        syncStatus: 'pending',
        syncAttempts: 0
      });
      expect(offlineValid.success).toBe(true);

      // Mastra validation
      const mastraValid = mastraAgentMessageSchema.safeParse({
        id: randomUUID(),
        workflowId: randomUUID(),
        stepId: 'rerank',
        type: 'request',
        payload: original
      });
      expect(mastraValid.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should provide detailed validation errors for debugging', () => {
      const invalidRequest = {
        metadata: { ...createMockRequestEnvelope().metadata, phase: 17 }, // Wrong phase
        packets: []
      };

      const validation = validatePhase18Request(invalidRequest);
      expect(validation.success).toBe(false);
      if (!validation.success && validation.error) {
        expect(validation.error.errors.length).toBeGreaterThan(0);
      }
    });

    it('should handle missing optional fields gracefully', () => {
      const response = createMockResponseEnvelope(randomUUID());
      delete response.summary?.totalLatencyMs;
      delete response.summary?.avgScore;

      const validation = validatePhase18Response(response);
      expect(validation.success).toBe(true);
    });
  });

  describe('Batch Processing', () => {
    it('should validate request with multiple packets', () => {
      const request = createMockRequestEnvelope();
      request.packets = Array(100)
        .fill(0)
        .map((_, i) => ({
          packetKey: `test:packet:${i.toString().padStart(3, '0')}`,
          sourceRef: `src/lib/test-${i}.ts`,
          featureId: 'test.feature',
          features: {
            values: Array(13).fill(0.5 + Math.random() * 0.5)
          }
        }));

      const validation = validatePhase18Request(request);
      expect(validation.success).toBe(true);
    });

    it('should handle large feature arrays', () => {
      const response = createMockResponseEnvelope(randomUUID());
      response.results = Array(1000)
        .fill(0)
        .map((_, i) => ({
          packetKey: `test:packet:${i}`,
          rerankScore: Math.random(),
          confidence: 0.5 + Math.random() * 0.5
        }));

      const validation = validatePhase18Response(response);
      expect(validation.success).toBe(true);
    });
  });
});
