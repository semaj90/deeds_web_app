/**
 * Mastra OKF Schema Loader & Validator
 *
 * Loads the mastra-workflows.okf.yaml schema and provides:
 * - Workflow discovery
 * - Schema validation
 * - Step execution planning
 * - Recovery pattern application
 *
 * Usage:
 *   const loader = new MastraOkfLoader();
 *   const workflow = loader.getWorkflow('error-repair-durable');
 *   const steps = workflow.getExecutionPlan();
 *   const recoveryMap = await loader.buildRecoveryMap(runId);
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';

// ============================================================================
// Type Definitions (based on OKF schema)
// ============================================================================

export interface OkfWorkflowSpec {
  name: string;
  description: string;
  agent: string;
  tags: string[];
  criticality: 'low' | 'medium' | 'high' | 'critical';
  estimated_duration_ms: number;

  spec: {
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    steps: OkfStep[];
  };
}

export interface OkfStep {
  name: string;
  stepType:
    | 'llm_completion'
    | 'tool_call'
    | 'db_mutation'
    | 'file_write'
    | 'validation';
  description: string;
  timeout_ms: number;
  depends_on?: string[];

  input: Record<string, unknown>;
  output: Record<string, unknown>;

  idempotency?: {
    enabled: boolean;
    key_formula: string;
    cache_ttl_seconds?: number;
    strategy?: string;
    check_table?: string;
    check_columns?: string[];
  };

  side_effects?: Array<{
    type: string;
    resource_id: string;
    operation: string;
    reversible?: boolean;
    reverse_operation?: string;
  }>;

  retry?: {
    max_attempts: number;
    backoff_ms: number;
  };

  model?: string;
}

export interface OkfWorkflowSchema {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
    description: string;
    version: string;
    created: string;
  };

  workflows: Record<string, OkfWorkflowSpec>;
  tools: Record<string, unknown>;
  stepTypes: Record<string, unknown>;
  idempotency_strategies: Record<string, unknown>;
  recovery: Record<string, unknown>;
  error_handling: Record<string, unknown>;
  observability: Record<string, unknown>;
  registry: Record<string, unknown>;
  annotations: Record<string, unknown>;
  examples: Record<string, unknown>;
  validation_rules: Array<Record<string, unknown>>;
}

// ============================================================================
// Validation Schemas (Zod)
// ============================================================================

const OkfStepSchema = z.object({
  name: z.string().min(1),
  stepType: z.enum([
    'llm_completion',
    'tool_call',
    'db_mutation',
    'file_write',
    'validation',
  ]),
  description: z.string(),
  timeout_ms: z.number().min(1000).max(300000),
  depends_on: z.array(z.string()).optional(),
  input: z.record(z.unknown()),
  output: z.record(z.unknown()),
  idempotency: z
    .object({
      enabled: z.boolean(),
      key_formula: z.string(),
      cache_ttl_seconds: z.number().optional(),
      strategy: z.string().optional(),
      check_table: z.string().optional(),
      check_columns: z.array(z.string()).optional(),
    })
    .optional(),
  side_effects: z
    .array(
      z.object({
        type: z.string(),
        resource_id: z.string(),
        operation: z.string(),
        reversible: z.boolean().optional(),
        reverse_operation: z.string().optional(),
      })
    )
    .optional(),
  retry: z
    .object({
      max_attempts: z.number().min(0),
      backoff_ms: z.number().min(0),
    })
    .optional(),
  model: z.string().optional(),
});

const OkfWorkflowSpecSchema = z.object({
  metadata: z.object({
    name: z.string(),
    description: z.string(),
    agent: z.string(),
    tags: z.array(z.string()),
    criticality: z.enum(['low', 'medium', 'high', 'critical']),
    estimated_duration_ms: z.number(),
  }),
  spec: z.object({
    input: z.record(z.unknown()),
    output: z.record(z.unknown()),
    steps: z.array(OkfStepSchema),
  }),
});

// ============================================================================
// Mastra OKF Loader
// ============================================================================

export class MastraOkfLoader {
  private schema: OkfWorkflowSchema | null = null;
  private workflows: Map<string, OkfWorkflowSpec> = new Map();
  private schemaPath: string;

  constructor(schemaPath?: string) {
    this.schemaPath =
      schemaPath ||
      resolve(
        __dirname,
        '../../server/okf/mastra-workflows.okf.yaml'
      );
  }

  /**
   * Load the OKF schema from YAML file
   */
  async load(): Promise<OkfWorkflowSchema> {
    if (this.schema) {
      return this.schema;
    }

    const yaml = readFileSync(this.schemaPath, 'utf-8');
    this.schema = YAML.parse(yaml) as OkfWorkflowSchema;

    // Validate and index workflows
    for (const [name, spec] of Object.entries(this.schema.workflows)) {
      this.validateWorkflow(spec);
      this.workflows.set(name, spec as OkfWorkflowSpec);
    }

    return this.schema;
  }

  /**
   * Get a specific workflow by name
   */
  getWorkflow(workflowName: string): OkfWorkflowSpec | null {
    return this.workflows.get(workflowName) || null;
  }

  /**
   * List all available workflows
   */
  listWorkflows(): OkfWorkflowSpec[] {
    return Array.from(this.workflows.values());
  }

  /**
   * List workflows by tag
   */
  listWorkflowsByTag(tag: string): OkfWorkflowSpec[] {
    return this.listWorkflows().filter((w) =>
      w.metadata?.tags?.includes(tag)
    );
  }

  /**
   * List workflows by agent
   */
  listWorkflowsByAgent(agent: string): OkfWorkflowSpec[] {
    return this.listWorkflows().filter((w) => w.metadata?.agent === agent);
  }

  /**
   * Validate a workflow spec against the schema
   */
  validateWorkflow(workflow: OkfWorkflowSpec): void {
    try {
      OkfWorkflowSpecSchema.parse(workflow);
    } catch (err) {
      throw new Error(
        `Invalid workflow ${workflow.metadata?.name}: ${(err as Error).message}`
      );
    }

    // Additional validation: check dependency graph
    this.validateDependencyGraph(workflow);
  }

  /**
   * Validate that dependencies form an acyclic graph
   */
  private validateDependencyGraph(workflow: OkfWorkflowSpec): void {
    const steps = workflow.spec.steps;
    const stepNames = new Set(steps.map((s) => s.name));

    // Check all dependencies exist
    for (const step of steps) {
      if (step.depends_on) {
        for (const dep of step.depends_on) {
          if (!stepNames.has(dep)) {
            throw new Error(
              `Step ${step.name} depends on non-existent step ${dep}`
            );
          }
        }
      }
    }

    // Check for cycles (DFS)
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (stepName: string): boolean => {
      visited.add(stepName);
      recursionStack.add(stepName);

      const step = steps.find((s) => s.name === stepName);
      if (step?.depends_on) {
        for (const dep of step.depends_on) {
          if (!visited.has(dep)) {
            if (hasCycle(dep)) return true;
          } else if (recursionStack.has(dep)) {
            return true;
          }
        }
      }

      recursionStack.delete(stepName);
      return false;
    };

    for (const step of steps) {
      if (!visited.has(step.name)) {
        if (hasCycle(step.name)) {
          throw new Error(`Circular dependency detected in workflow`);
        }
      }
    }
  }

  /**
   * Get execution plan (topologically sorted steps)
   */
  getExecutionPlan(workflow: OkfWorkflowSpec): OkfStep[] {
    const steps = workflow.spec.steps;
    const stepMap = new Map(steps.map((s) => [s.name, s]));
    const visited = new Set<string>();
    const plan: OkfStep[] = [];

    const visit = (stepName: string) => {
      if (visited.has(stepName)) return;
      visited.add(stepName);

      const step = stepMap.get(stepName);
      if (!step) return;

      // Visit dependencies first
      if (step.depends_on) {
        for (const dep of step.depends_on) {
          visit(dep);
        }
      }

      plan.push(step);
    };

    // Visit all steps in dependency order
    for (const step of steps) {
      visit(step.name);
    }

    return plan;
  }

  /**
   * Get idempotency configuration for a step
   */
  getIdempotencyConfig(step: OkfStep): {
    enabled: boolean;
    key_formula: string;
    cache_ttl_seconds?: number;
    strategy?: string;
  } | null {
    if (!step.idempotency?.enabled) {
      return null;
    }

    return {
      enabled: step.idempotency.enabled,
      key_formula: step.idempotency.key_formula,
      cache_ttl_seconds: step.idempotency.cache_ttl_seconds,
      strategy: step.idempotency.strategy,
    };
  }

  /**
   * Get retry configuration for a step
   */
  getRetryConfig(step: OkfStep): {
    max_attempts: number;
    backoff_ms: number;
  } | null {
    if (!step.retry || step.stepType === 'db_mutation') {
      return null; // Mutations never retry
    }

    return {
      max_attempts: step.retry.max_attempts,
      backoff_ms: step.retry.backoff_ms,
    };
  }

  /**
   * Check if a step is idempotent
   */
  isIdempotent(step: OkfStep): boolean {
    return (
      step.idempotency?.enabled === true ||
      step.stepType === 'llm_completion' ||
      step.stepType === 'tool_call' ||
      step.stepType === 'validation'
    );
  }

  /**
   * Check if a step is safe to retry
   */
  isRetryable(step: OkfStep): boolean {
    if (step.stepType === 'db_mutation' || step.stepType === 'file_write') {
      return false; // Mutations are not retryable
    }
    return true;
  }

  /**
   * Get side effects for a step
   */
  getSideEffects(step: OkfStep): OkfStep['side_effects'] {
    return step.side_effects || [];
  }

  /**
   * Check if a workflow has write operations
   */
  hasWriteOperations(workflow: OkfWorkflowSpec): boolean {
    return workflow.spec.steps.some(
      (s) =>
        s.stepType === 'db_mutation' ||
        s.stepType === 'file_write'
    );
  }

  /**
   * Generate a human-readable execution plan
   */
  formatExecutionPlan(workflow: OkfWorkflowSpec): string {
    const plan = this.getExecutionPlan(workflow);
    const lines: string[] = [];

    lines.push(`\n📋 Execution Plan: ${workflow.metadata.name}`);
    lines.push(`⏱️  Estimated Duration: ${workflow.metadata.estimated_duration_ms}ms\n`);

    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];
      const icon =
        step.stepType === 'llm_completion'
          ? '🤖'
          : step.stepType === 'tool_call'
            ? '🔧'
            : step.stepType === 'db_mutation'
              ? '💾'
              : step.stepType === 'file_write'
                ? '📝'
                : '✔️';

      lines.push(
        `${i + 1}. ${icon} ${step.name} (${step.stepType}, timeout: ${step.timeout_ms}ms)`
      );
      lines.push(`   ${step.description}`);

      if (step.depends_on && step.depends_on.length > 0) {
        lines.push(`   ← depends on: ${step.depends_on.join(', ')}`);
      }

      if (this.getSideEffects(step).length > 0) {
        lines.push(`   ⚠️  has side effects`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let loaderInstance: MastraOkfLoader | null = null;

export async function getMastraOkfLoader(): Promise<MastraOkfLoader> {
  if (!loaderInstance) {
    loaderInstance = new MastraOkfLoader();
    await loaderInstance.load();
  }
  return loaderInstance;
}

// ============================================================================
// Exported Utilities
// ============================================================================

/**
 * Load and validate a workflow, returning typed execution plan
 */
export async function loadWorkflowExecutionPlan(
  workflowName: string
): Promise<OkfStep[]> {
  const loader = await getMastraOkfLoader();
  const workflow = loader.getWorkflow(workflowName);

  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowName}`);
  }

  return loader.getExecutionPlan(workflow);
}

/**
 * Print workflow documentation
 */
export async function printWorkflowDoc(workflowName: string): Promise<string> {
  const loader = await getMastraOkfLoader();
  const workflow = loader.getWorkflow(workflowName);

  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowName}`);
  }

  return loader.formatExecutionPlan(workflow);
}
