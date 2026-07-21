/**
 * Durable Execution Library
 *
 * Core utilities for recording workflow steps, achieving idempotency,
 * and recovering from crashes.
 *
 * Usage pattern:
 *   const executor = new DurableExecutor(runId, db);
 *   const result = await executor.step('step-name', async () => {
 *     // your logic here
 *   });
 *   // On crash, resume with: await executor.resume()
 */

import { eq, and } from 'drizzle-orm';
import crypto from 'node:crypto';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  executionRuns,
  executionJournalSteps,
  executionSideEffects,
  executionDependencies,
  type NewExecutionRun,
  type NewExecutionJournalStep,
  type NewExecutionSideEffect,
} from '$lib/server/db/schema/durable-execution';

/**
 * Generate a deterministic idempotency key for a step.
 * Same input → same key, enabling idempotent re-execution.
 */
export function generateIdempotencyKey(
  runId: string,
  stepName: string,
  input: unknown
): string {
  const inputHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(input ?? {}))
    .digest('hex')
    .slice(0, 16);

  return `${runId}:${stepName}:${inputHash}`;
}

/**
 * Execution step result: either success with output, or failure with error.
 */
export type StepResult<T> =
  | { ok: true; output: T; cached: boolean; durationMs: number }
  | { ok: false; error: Error; durationMs: number };

/**
 * DurableExecutor — Main API for step recording and recovery.
 */
export class DurableExecutor {
  private stepIndex = 0;
  private db: PostgresJsDatabase<any>;
  private runId: string;
  private stepResults = new Map<string, unknown>();

  constructor(runId: string, db: PostgresJsDatabase<any>) {
    this.runId = runId;
    this.db = db;
  }

  /**
   * Execute a step with idempotency guarantee.
   *
   * If the step was already executed successfully, return the cached result.
   * Otherwise, execute it, record the result, and return it.
   */
  async step<T>(
    stepName: string,
    execute: () => Promise<T>,
    stepType: string = 'unknown'
  ): Promise<T> {
    const startTime = Date.now();
    const idempotencyKey = generateIdempotencyKey(this.runId, stepName, {});
    const stepIndex = this.stepIndex++;

    try {
      // Check if already executed
      const existing = await this.db.query.executionJournalSteps.findFirst({
        where: eq(executionJournalSteps.idempotencyKey, idempotencyKey),
      });

      if (existing?.status === 'SUCCESS') {
        const durationMs = Date.now() - startTime;
        return {
          ok: true,
          output: existing.output as T,
          cached: true,
          durationMs,
        } as any;
      }

      // Mark as executing
      const stepRecord = await this.db
        .insert(executionJournalSteps)
        .values({
          runId: this.runId,
          stepIndex,
          stepName,
          stepType,
          idempotencyKey,
          status: 'EXECUTING',
          input: {},
        })
        .returning();

      const stepId = stepRecord[0].id;

      // Execute the step
      let result: T;
      try {
        result = await execute();
      } catch (err) {
        const durationMs = Date.now() - startTime;
        await this.db
          .update(executionJournalSteps)
          .set({
            status: 'FAILED',
            error: (err as Error).message,
            executionDurationMs: durationMs,
          })
          .where(eq(executionJournalSteps.id, stepId));

        throw err;
      }

      // Record success
      const durationMs = Date.now() - startTime;
      await this.db
        .update(executionJournalSteps)
        .set({
          status: 'SUCCESS',
          output: result as unknown,
          executionDurationMs: durationMs,
          executedAt: new Date(),
        })
        .where(eq(executionJournalSteps.id, stepId));

      // Update checkpoint
      await this.db
        .update(executionRuns)
        .set({ checkpointStepId: stepId })
        .where(eq(executionRuns.runId, this.runId));

      this.stepResults.set(stepName, result);

      return result;
    } catch (err) {
      throw err;
    }
  }

  /**
   * Record a side effect (DB mutation, file write, API call).
   * Allows idempotent re-execution via write guards.
   */
  async recordSideEffect(
    stepName: string,
    effect: {
      type: 'db_write' | 'file_write' | 'api_call' | 'cache_invalidate';
      resourceId: string;
      operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'WRITE';
      oldValue?: unknown;
      newValue: unknown;
      reversible?: boolean;
    }
  ): Promise<void> {
    // Find the current step
    const currentStep = await this.db.query.executionJournalSteps.findFirst({
      where: and(
        eq(executionJournalSteps.runId, this.runId),
        eq(executionJournalSteps.stepName, stepName),
        eq(executionJournalSteps.status, 'SUCCESS')
      ),
    });

    if (!currentStep) {
      throw new Error(`Step ${stepName} not found or not completed`);
    }

    await this.db.insert(executionSideEffects).values({
      runId: this.runId,
      stepId: currentStep.id,
      effectType: effect.type,
      resourceId: effect.resourceId,
      operation: effect.operation,
      oldValue: effect.oldValue as unknown,
      newValue: effect.newValue as unknown,
      status: 'RECORDED',
      reversible: effect.reversible ?? false,
    });
  }

  /**
   * Create a dependency edge: fromStep must complete before toStep.
   */
  async addDependency(
    fromStepName: string,
    toStepName: string,
    dependencyType: 'data_dependency' | 'control_flow' | 'temporal' = 'control_flow'
  ): Promise<void> {
    const fromStep = await this.db.query.executionJournalSteps.findFirst({
      where: and(
        eq(executionJournalSteps.runId, this.runId),
        eq(executionJournalSteps.stepName, fromStepName)
      ),
    });

    const toStep = await this.db.query.executionJournalSteps.findFirst({
      where: and(
        eq(executionJournalSteps.runId, this.runId),
        eq(executionJournalSteps.stepName, toStepName)
      ),
    });

    if (!fromStep || !toStep) {
      throw new Error('One or both steps not found');
    }

    await this.db.insert(executionDependencies).values({
      runId: this.runId,
      fromStepId: fromStep.id,
      toStepId: toStep.id,
      dependencyType,
      reason: `${fromStepName} → ${toStepName}`,
    });
  }

  /**
   * Mark the execution as completed.
   */
  async complete(output: unknown): Promise<void> {
    await this.db
      .update(executionRuns)
      .set({
        status: 'COMPLETED',
        output: output as unknown,
        completedAt: new Date(),
      })
      .where(eq(executionRuns.runId, this.runId));
  }

  /**
   * Mark the execution as failed.
   */
  async fail(error: Error): Promise<void> {
    await this.db
      .update(executionRuns)
      .set({
        status: 'FAILED',
        errorMessage: error.message,
        completedAt: new Date(),
      })
      .where(eq(executionRuns.runId, this.runId));
  }

  /**
   * Suspend execution (e.g., for manual review).
   */
  async suspend(): Promise<void> {
    await this.db
      .update(executionRuns)
      .set({
        status: 'SUSPENDED',
      })
      .where(eq(executionRuns.runId, this.runId));
  }

  /**
   * Get the recovery map: step_name → output for all completed steps.
   * Used to resume from a checkpoint.
   */
  async getRecoveryMap(): Promise<Record<string, unknown>> {
    const steps = await this.db.query.executionJournalSteps.findMany({
      where: and(
        eq(executionJournalSteps.runId, this.runId),
        eq(executionJournalSteps.status, 'SUCCESS')
      ),
    });

    return Object.fromEntries(steps.map((s) => [s.stepName, s.output]));
  }
}

/**
 * Resume a suspended or failed execution.
 *
 * Loads the execution_run, its checkpoint, and returns a new DurableExecutor
 * that will skip all completed steps and continue from where it left off.
 */
export async function resumeExecution(
  runId: string,
  db: PostgresJsDatabase<any>
): Promise<{ executor: DurableExecutor; recoveryMap: Record<string, unknown> }> {
  const run = await db.query.executionRuns.findFirst({
    where: eq(executionRuns.runId, runId),
  });

  if (!run) {
    throw new Error(`Execution ${runId} not found`);
  }

  const executor = new DurableExecutor(runId, db);
  const recoveryMap = await executor.getRecoveryMap();

  // Update recovery count
  await db
    .update(executionRuns)
    .set({
      status: 'RESUMED',
      recoveryCount: (run.recoveryCount ?? 0) + 1,
      resumedAt: new Date(),
    })
    .where(eq(executionRuns.runId, runId));

  return { executor, recoveryMap };
}

/**
 * Write guard for idempotent mutations.
 *
 * Before writing to the database, checks if we've already written
 * the same change. If so, returns the cached result. Otherwise,
 * executes the write and records it for future idempotency.
 */
export async function idempotentWrite<T>(
  db: PostgresJsDatabase<any>,
  args: {
    runId: string;
    stepName: string;
    resourceId: string;
    operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'WRITE';
    write: () => Promise<T>;
    oldValue?: unknown;
    newValue: unknown;
  }
): Promise<{ alreadyWritten: boolean; result: T }> {
  // Check if we've already written this change
  const existing = await db.query.executionSideEffects.findFirst({
    where: and(
      eq(executionSideEffects.runId, args.runId),
      eq(executionSideEffects.resourceId, args.resourceId),
      eq(executionSideEffects.operation, args.operation)
    ),
  });

  if (existing?.status === 'VERIFIED') {
    // Already wrote — return cached result
    return {
      alreadyWritten: true,
      result: existing.newValue as T,
    };
  }

  // Execute the write
  const result = await args.write();

  // Find the current step
  const currentStep = await db.query.executionJournalSteps.findFirst({
    where: and(
      eq(executionJournalSteps.runId, args.runId),
      eq(executionJournalSteps.stepName, args.stepName),
      eq(executionJournalSteps.status, 'SUCCESS')
    ),
  });

  if (!currentStep) {
    throw new Error(`Step ${args.stepName} not found or not completed`);
  }

  // Record the side effect
  await db.insert(executionSideEffects).values({
    runId: args.runId,
    stepId: currentStep.id,
    effectType: 'db_write',
    resourceId: args.resourceId,
    operation: args.operation,
    oldValue: args.oldValue,
    newValue: args.newValue,
    status: 'VERIFIED',
  });

  return {
    alreadyWritten: false,
    result,
  };
}

/**
 * Start a new execution run.
 *
 * Creates an execution_runs record and returns a DurableExecutor.
 */
export async function startExecution(
  db: PostgresJsDatabase<any>,
  args: {
    runId: string;
    taskId: string;
    agent: string;
    input: unknown;
  }
): Promise<DurableExecutor> {
  await db.insert(executionRuns).values({
    runId: args.runId,
    taskId: args.taskId,
    agent: args.agent,
    status: 'ACTIVE',
    input: args.input as unknown,
  });

  return new DurableExecutor(args.runId, db);
}
