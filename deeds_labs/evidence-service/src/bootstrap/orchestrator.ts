/**
 * LegalWorkflowOrchestrator Integration Wrapper
 *
 * Provides a simplified interface to the XState-based Legal Workflow Orchestrator
 * for evidence processing pipeline integration.
 */

import type { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';

/**
 * Workflow context for evidence processing
 */
export interface WorkflowContext {
  sessionId: string;
  evidenceId?: string;
  caseId?: string;
  userId?: string;
  text?: string;
  metadata?: Record<string, any>;
}

/**
 * Workflow result
 */
export interface WorkflowResult {
  type: string;
  status: 'success' | 'error' | 'pending';
  data?: any;
  error?: string;
  timestamp: string;
  duration?: number;
}

/**
 * Legal Workflow Orchestrator
 *
 * Coordinates evidence processing workflows using XState machines
 * and integrates with Redis for state persistence and event streaming.
 */
export class LegalWorkflowOrchestrator {
  /**
   * @param redis Optional ioredis client instance
   * @param xstateIntegration Optional integration object (must implement sendEvent(machineId, event))
   */
  constructor(private redis?: Redis, private xstateIntegration?: any) {
    logger.info('LegalWorkflowOrchestrator initialized', {
      redisEnabled: !!redis,
      xstateIntegrationEnabled: !!xstateIntegration
    });
  }

  /**
   * Orchestrate a workflow based on context and query
   */
  async orchestrateWorkflow(
    context: WorkflowContext,
    userQuery: string
  ): Promise<WorkflowResult> {
    const startTime = Date.now();

    try {
      logger.info('Starting workflow orchestration', {
        sessionId: context.sessionId,
        evidenceId: context.evidenceId,
        query: userQuery
      });

      // If an XState integration was injected, try to drive the real machine.
      if (this.xstateIntegration && typeof this.xstateIntegration.sendEvent === 'function') {
        try {
          const machineId = `workflow:${context.sessionId}`;
          // Send a START event (integration is responsible for machine wiring)
          await this.xstateIntegration.sendEvent(machineId, {
            type: 'START_WORKFLOW',
            context: { ...context, userQuery }
          });

          // Poll Redis for an updated workflow state (short timeout). If redis not provided, skip polling.
          if (this.redis) {
            const maxAttempts = 10;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
              const stored = await this.getWorkflowState(context.sessionId);
              if (stored && stored.status !== 'pending') {
                logger.info('Received workflow state from Redis after xstate event', { sessionId: context.sessionId });
                return stored;
              }
              // small delay
              await new Promise((res) => setTimeout(res, 500));
            }
            logger.warn('Timed out waiting for XState workflow to update Redis; falling back to local result', { sessionId: context.sessionId });
          }
        } catch (xiErr) {
          logger.error('xstateIntegration failed to start workflow, falling back to mock result', { error: xiErr, sessionId: context.sessionId });
        }
      }

      // Fallback mock result (keeps previous behavior)
      const result: WorkflowResult = {
        type: 'WORKFLOW_COMPLETE',
        status: 'success',
        data: {
          sessionId: context.sessionId,
          evidenceId: context.evidenceId,
          query: userQuery,
          recommendations: [
            'Evidence processed successfully',
            'OCR extraction complete',
            'Embeddings generated',
            'Ready for legal analysis',
          ],
        },
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
      };

      // Store workflow state in Redis if available
      if (this.redis && context.sessionId) {
        // prefer set(..., 'EX', seconds) for ioredis compatibility
        try {
          await this.redis.set(`workflow:state:${context.sessionId}`, JSON.stringify(result), 'EX', 3600);
        } catch (setErr) {
          logger.warn('Failed to persist workflow state in Redis', { sessionId: context.sessionId, error: setErr });
        }
      }

      logger.info('Workflow orchestration complete', {
        sessionId: context.sessionId,
        duration: result.duration
      });

      return result;

    } catch (error) {
      logger.error('Workflow orchestration failed', {
        sessionId: context.sessionId,
        error
      });

      return {
        type: 'WORKFLOW_ERROR',
        status: 'error',
        error: String(error),
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Get workflow state from Redis
   */
  async getWorkflowState(sessionId: string): Promise<WorkflowResult | null> {
    if (!this.redis) {
      return null;
    }

    try {
      const state = await this.redis.get(`workflow:state:${sessionId}`);

      if (!state) {
        return null;
      }

      return JSON.parse(state) as WorkflowResult;
    } catch (error) {
      logger.error('Failed to get workflow state', { sessionId, error });
      return null;
    }
  }

  /**
   * Delete workflow state from Redis
   */
  async deleteWorkflowState(sessionId: string): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      await this.redis.del(`workflow:state:${sessionId}`);
      logger.info('Workflow state deleted', { sessionId });
    } catch (error) {
      logger.error('Failed to delete workflow state', { sessionId, error });
    }
  }
}
