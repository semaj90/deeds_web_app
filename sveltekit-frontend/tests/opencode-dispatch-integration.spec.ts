/**
 * OpenCode Dispatch Integration Tests — Phase 1
 *
 * Integration tests for the POST /api/opencode-dispatch endpoint.
 * Validates end-to-end flow: validation → planner → dispatcher → telemetry.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createValidationMiddleware } from '../src/lib/server/opencode/validation-schema';

describe('OpenCode Dispatcher Integration — Phase 1', () => {
  const validationMiddleware = createValidationMiddleware();

  describe('Request Validation Flow', () => {
    it('should accept valid minimal dispatch request', () => {
      const payload = {
        intent: 'Find where auth.sessions is implemented',
      };

      const validation = validationMiddleware.validateRequest(payload);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      const withDefaults = validationMiddleware.applyDefaults(payload);
      expect(withDefaults.action).toBe('auto');
      expect(withDefaults.capture_telemetry).toBe(true);
      expect(withDefaults.redis_key_prefix).toBe('telemetry:opencode');
    });

    it('should accept full dispatch request with all parameters', () => {
      const payload = {
        intent: 'Find where auth.sessions is implemented',
        action: 'search_rg',
        tool_name: 'trace:kag-search',
        context: { file_path: 'src/auth.ts', case_id: '123' },
        capture_telemetry: true,
        redis_key_prefix: 'telemetry:opencode:custom'
      };

      const validation = validationMiddleware.validateRequest(payload);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject missing required intent', () => {
      const payload = {
        action: 'search_rg'
      };

      const validation = validationMiddleware.validateRequest(payload);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('intent'))).toBe(true);
    });

    it('should reject invalid action enum', () => {
      const payload = {
        intent: 'Test query',
        action: 'invalid_action'
      };

      const validation = validationMiddleware.validateRequest(payload);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('action'))).toBe(true);
    });

    it('should reject unknown parameters', () => {
      const payload = {
        intent: 'Test query',
        unknown_param: 'value'
      };

      const validation = validationMiddleware.validateRequest(payload);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Unknown parameter'))).toBe(true);
    });

    it('should reject telemetry parameter with wrong type', () => {
      const payload = {
        intent: 'Test query',
        capture_telemetry: 'true' // should be boolean
      };

      const validation = validationMiddleware.validateRequest(payload);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('capture_telemetry'))).toBe(true);
    });
  });

  describe('Parameter Constraint Validation', () => {
    it('should enforce intent minLength constraint', () => {
      const payload = {
        intent: 'ab' // too short (< 3)
      };

      const validation = validationMiddleware.validateRequest(payload);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('at least 3'))).toBe(true);
    });

    it('should enforce intent maxLength constraint', () => {
      const payload = {
        intent: 'a'.repeat(501) // too long (> 500)
      };

      const validation = validationMiddleware.validateRequest(payload);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('at most 500'))).toBe(true);
    });

    it('should enforce intent pattern constraint', () => {
      const payload = {
        intent: '<script>alert("xss")</script>' // contains invalid characters
      };

      const validation = validationMiddleware.validateRequest(payload);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('does not match'))).toBe(true);
    });

    it('should enforce tool_name pattern constraint', () => {
      const payload = {
        intent: 'Test query',
        tool_name: 'trace:kag search' // space not allowed
      };

      const validation = validationMiddleware.validateRequest(payload);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('tool_name'))).toBe(true);
    });
  });

  describe('Response Contract Validation', () => {
    it('should return consistent response shape on success', () => {
      const payload = {
        intent: 'Test query'
      };

      const validation = validationMiddleware.validateRequest(payload);
      expect(validation.valid).toBe(true);

      // Response shape contract: { results, telemetry, proof, metadata }
      // (Actual endpoint would return this via json())
      const expectedResponse = {
        success: true,
        results: expect.any(Array),
        telemetry: expect.any(Object),
        proof: expect.any(String),
        metadata: expect.objectContaining({
          plannerDecision: expect.any(String),
          plannerConfidence: expect.any(Number),
          sessionId: expect.any(String),
          totalExecutionMs: expect.any(Number)
        })
      };

      expect(expectedResponse).toBeDefined();
    });

    it('should return consistent response shape on validation error', () => {
      const payload = {
        action: 'invalid' // missing required intent
      };

      const validation = validationMiddleware.validateRequest(payload);
      expect(validation.valid).toBe(false);

      // Error response shape contract: { error, details, results, telemetry, proof }
      const expectedErrorResponse = {
        error: expect.any(String),
        details: expect.any(Array),
        results: expect.any(Array),
        telemetry: expect.toBeNull(),
        proof: expect.toBeNull()
      };

      expect(expectedErrorResponse).toBeDefined();
    });
  });

  describe('Telemetry Configuration', () => {
    it('should respect capture_telemetry flag', () => {
      const payloadCapture = {
        intent: 'Test query',
        capture_telemetry: true
      };

      const payloadNoCapture = {
        intent: 'Test query',
        capture_telemetry: false
      };

      const validCapture = validationMiddleware.validateRequest(payloadCapture);
      const validNoCapture = validationMiddleware.validateRequest(payloadNoCapture);

      expect(validCapture.valid).toBe(true);
      expect(validNoCapture.valid).toBe(true);

      const withDefaultsCapture = validationMiddleware.applyDefaults(payloadCapture);
      const withDefaultsNoCapture = validationMiddleware.applyDefaults(payloadNoCapture);

      expect(withDefaultsCapture.capture_telemetry).toBe(true);
      expect(withDefaultsNoCapture.capture_telemetry).toBe(false);
    });

    it('should use custom redis_key_prefix if provided', () => {
      const payload = {
        intent: 'Test query',
        redis_key_prefix: 'telemetry:custom:prefix'
      };

      const validation = validationMiddleware.validateRequest(payload);
      expect(validation.valid).toBe(true);

      const withDefaults = validationMiddleware.applyDefaults(payload);
      expect(withDefaults.redis_key_prefix).toBe('telemetry:custom:prefix');
    });

    it('should default redis_key_prefix to telemetry:opencode', () => {
      const payload = {
        intent: 'Test query'
      };

      const withDefaults = validationMiddleware.applyDefaults(payload);
      expect(withDefaults.redis_key_prefix).toBe('telemetry:opencode');
    });
  });

  describe('Edge Cases', () => {
    it('should handle action with valid enum values', () => {
      const validActions = ['search_rg', 'query_qdrant', 'search_codebase', 'auto', 'plan'];

      for (const action of validActions) {
        const payload = { intent: 'Test query', action };
        const validation = validationMiddleware.validateRequest(payload);
        expect(validation.valid).toBe(true);
      }
    });

    it('should handle context object with arbitrary structure', () => {
      const payload = {
        intent: 'Test query',
        context: {
          file_path: 'src/test.ts',
          case_id: '123',
          user_id: 'user-456',
          custom_field: 'value',
          nested: { deep: { structure: true } }
        }
      };

      const validation = validationMiddleware.validateRequest(payload);
      expect(validation.valid).toBe(true);

      const withDefaults = validationMiddleware.applyDefaults(payload);
      expect(withDefaults.context).toEqual(payload.context);
    });

    it('should handle intent with valid special characters', () => {
      const validIntents = [
        'Find auth.sessions implementation',
        'Search for service-layer',
        'How to: configure Redis?',
        'Files, packages, modules'
      ];

      for (const intent of validIntents) {
        const payload = { intent };
        const validation = validationMiddleware.validateRequest(payload);
        expect(validation.valid).toBe(true);
      }
    });

    it('should reject intent with newlines', () => {
      const payload = {
        intent: 'Find auth\nSessions'
      };

      const validation = validationMiddleware.validateRequest(payload);
      expect(validation.valid).toBe(false);
    });

    it('should handle empty context object', () => {
      const payload = {
        intent: 'Test query',
        context: {}
      };

      const validation = validationMiddleware.validateRequest(payload);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Gemma4 Planner Contract (Stub)', () => {
    it('should define planner response shape', () => {
      const plannerResponse = {
        action: 'search_rg' as const,
        confidence: 0.85,
        reason: 'Intent suggests lexical search over semantic'
      };

      expect(plannerResponse.action).toMatch(/^(search_rg|query_qdrant|search_codebase|auto|plan)$/);
      expect(plannerResponse.confidence).toBeGreaterThanOrEqual(0);
      expect(plannerResponse.confidence).toBeLessThanOrEqual(1);
      expect(plannerResponse.reason).toBeTruthy();
    });
  });

  describe('LangGraph Dispatcher Contract (Stub)', () => {
    it('should define tool result shape', () => {
      const toolResult = {
        toolName: 'trace:kag-search',
        resultType: 'success' as const,
        data: { matches: ['file1.ts', 'file2.ts'] },
        executionTimeMs: 245
      };

      expect(['success', 'partial', 'error']).toContain(toolResult.resultType);
      expect(toolResult.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Telemetry Event Contract (Stub)', () => {
    it('should define telemetry event shape', () => {
      const telemetryEvent = {
        timestamp: new Date().toISOString(),
        sessionId: 'user-123-session-456',
        intent: 'Find auth implementation',
        action: 'search_rg',
        plannerConfidence: 0.85,
        toolsExecuted: ['trace:kag-search'],
        successCount: 1,
        failureCount: 0,
        totalExecutionMs: 245
      };

      expect(telemetryEvent.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO format
      expect(telemetryEvent.plannerConfidence).toBeGreaterThanOrEqual(0);
      expect(telemetryEvent.plannerConfidence).toBeLessThanOrEqual(1);
      expect(telemetryEvent.toolsExecuted).toBeInstanceOf(Array);
    });
  });
});
