/**
 * Tests for Mastra OKF Schema Loader
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getMastraOkfLoader, loadWorkflowExecutionPlan } from '$lib/server/okf/mastra-okf-loader';

describe('MastraOkfLoader', () => {
  let loader: Awaited<ReturnType<typeof getMastraOkfLoader>>;

  beforeAll(async () => {
    loader = await getMastraOkfLoader();
  });

  describe('Loading & Discovery', () => {
    it('loads the schema on first call', async () => {
      expect(loader).toBeDefined();
    });

    it('lists all available workflows', () => {
      const workflows = loader.listWorkflows();
      expect(workflows.length).toBeGreaterThan(0);
      expect(workflows.some(w => w.metadata.name === 'error-repair-durable')).toBe(true);
    });

    it('gets a specific workflow by name', () => {
      const workflow = loader.getWorkflow('error-repair-durable');
      expect(workflow).toBeDefined();
      expect(workflow?.metadata.name).toBe('error-repair-durable');
      expect(workflow?.metadata.agent).toBe('error-repair-agent');
    });

    it('returns null for non-existent workflow', () => {
      const workflow = loader.getWorkflow('non-existent-workflow');
      expect(workflow).toBeNull();
    });

    it('lists workflows by tag', () => {
      const workflows = loader.listWorkflowsByTag('repair');
      expect(workflows.length).toBeGreaterThan(0);
      expect(workflows.every(w => w.metadata.tags.includes('repair'))).toBe(true);
    });

    it('lists workflows by agent', () => {
      const workflows = loader.listWorkflowsByAgent('error-repair-agent');
      expect(workflows.length).toBeGreaterThan(0);
      expect(workflows.every(w => w.metadata.agent === 'error-repair-agent')).toBe(true);
    });
  });

  describe('Validation', () => {
    it('validates workflow spec', () => {
      const workflow = loader.getWorkflow('error-repair-durable');
      expect(() => loader.validateWorkflow(workflow!)).not.toThrow();
    });

    it('detects circular dependencies', () => {
      const workflow = {
        metadata: {
          name: 'circular-test',
          description: 'Test',
          agent: 'test',
          tags: [],
          criticality: 'low' as const,
          estimated_duration_ms: 1000,
        },
        spec: {
          input: { type: 'object' },
          output: { type: 'object' },
          steps: [
            {
              name: 'step-a',
              stepType: 'validation' as const,
              description: 'Step A',
              timeout_ms: 1000,
              input: {},
              output: {},
              depends_on: ['step-b'],
            },
            {
              name: 'step-b',
              stepType: 'validation' as const,
              description: 'Step B',
              timeout_ms: 1000,
              input: {},
              output: {},
              depends_on: ['step-a'],
            },
          ],
        },
      };

      expect(() => loader.validateWorkflow(workflow as any)).toThrow('Circular dependency');
    });

    it('detects missing dependencies', () => {
      const workflow = {
        metadata: {
          name: 'missing-dep-test',
          description: 'Test',
          agent: 'test',
          tags: [],
          criticality: 'low' as const,
          estimated_duration_ms: 1000,
        },
        spec: {
          input: { type: 'object' },
          output: { type: 'object' },
          steps: [
            {
              name: 'step-a',
              stepType: 'validation' as const,
              description: 'Step A',
              timeout_ms: 1000,
              input: {},
              output: {},
              depends_on: ['non-existent-step'],
            },
          ],
        },
      };

      expect(() => loader.validateWorkflow(workflow as any)).toThrow('non-existent-step');
    });
  });

  describe('Execution Planning', () => {
    it('returns topologically sorted steps', () => {
      const workflow = loader.getWorkflow('error-repair-durable');
      const plan = loader.getExecutionPlan(workflow!);

      expect(plan.length).toBe(workflow!.spec.steps.length);
      expect(plan[0].name).toBe('classify-error');
      expect(plan[1].name).toBe('propose-repair');
      expect(plan[2].name).toBe('apply-repair');
      expect(plan[3].name).toBe('run-smoke-test');
      expect(plan[4].name).toBe('log-outcome');
    });

    it('respects dependency order', () => {
      const workflow = loader.getWorkflow('error-repair-durable');
      const plan = loader.getExecutionPlan(workflow!);

      // Get indices
      const nameToIndex = new Map(plan.map((s, i) => [s.name, i]));

      // Check dependencies
      for (const step of plan) {
        if (step.depends_on) {
          for (const dep of step.depends_on) {
            const depIndex = nameToIndex.get(dep)!;
            const stepIndex = nameToIndex.get(step.name)!;
            expect(depIndex).toBeLessThan(stepIndex);
          }
        }
      }
    });
  });

  describe('Idempotency Configuration', () => {
    it('gets idempotency config for LLM step', () => {
      const workflow = loader.getWorkflow('error-repair-durable');
      const step = workflow!.spec.steps.find(s => s.name === 'classify-error')!;

      const config = loader.getIdempotencyConfig(step);
      expect(config).toBeDefined();
      expect(config?.enabled).toBe(true);
      expect(config?.key_formula).toBe('runId:classify-error:input_hash');
      expect(config?.cache_ttl_seconds).toBe(3600);
    });

    it('returns null for non-idempotent step', () => {
      const step = {
        name: 'test',
        stepType: 'db_mutation' as const,
        description: 'Test',
        timeout_ms: 1000,
        input: {},
        output: {},
        idempotency: { enabled: false, key_formula: '' },
      };

      const config = loader.getIdempotencyConfig(step as any);
      expect(config).toBeNull();
    });

    it('checks if step is idempotent', () => {
      const workflow = loader.getWorkflow('error-repair-durable');

      const classifyStep = workflow!.spec.steps.find(s => s.name === 'classify-error')!;
      expect(loader.isIdempotent(classifyStep)).toBe(true);

      const applyStep = workflow!.spec.steps.find(s => s.name === 'apply-repair')!;
      expect(loader.isIdempotent(applyStep)).toBe(false);
    });
  });

  describe('Retry Configuration', () => {
    it('gets retry config for retriable step', () => {
      const workflow = loader.getWorkflow('error-repair-durable');
      const step = workflow!.spec.steps.find(s => s.name === 'classify-error')!;

      const config = loader.getRetryConfig(step);
      expect(config).toBeDefined();
      expect(config?.max_attempts).toBe(2);
      expect(config?.backoff_ms).toBe(1000);
    });

    it('returns null for non-retriable mutation', () => {
      const workflow = loader.getWorkflow('error-repair-durable');
      const step = workflow!.spec.steps.find(s => s.name === 'apply-repair')!;

      const config = loader.getRetryConfig(step);
      expect(config).toBeNull();
    });

    it('checks if step is retryable', () => {
      const workflow = loader.getWorkflow('error-repair-durable');

      const classifyStep = workflow!.spec.steps.find(s => s.name === 'classify-error')!;
      expect(loader.isRetryable(classifyStep)).toBe(true);

      const applyStep = workflow!.spec.steps.find(s => s.name === 'apply-repair')!;
      expect(loader.isRetryable(applyStep)).toBe(false);
    });
  });

  describe('Side Effects', () => {
    it('gets side effects for mutation step', () => {
      const workflow = loader.getWorkflow('error-repair-durable');
      const step = workflow!.spec.steps.find(s => s.name === 'apply-repair')!;

      const effects = loader.getSideEffects(step);
      expect(effects).toBeDefined();
      expect(effects!.length).toBeGreaterThan(0);
      expect(effects![0].type).toBe('file_write');
      expect(effects![0].operation).toBe('WRITE');
      expect(effects![0].reversible).toBe(true);
    });

    it('returns empty array for step with no side effects', () => {
      const workflow = loader.getWorkflow('error-repair-durable');
      const step = workflow!.spec.steps.find(s => s.name === 'classify-error')!;

      const effects = loader.getSideEffects(step);
      expect(effects).toBeDefined();
      expect(effects!.length).toBe(0);
    });

    it('checks if workflow has write operations', () => {
      const workflow = loader.getWorkflow('error-repair-durable');
      expect(loader.hasWriteOperations(workflow!)).toBe(true);
    });
  });

  describe('Documentation', () => {
    it('generates human-readable execution plan', () => {
      const workflow = loader.getWorkflow('error-repair-durable');
      const doc = loader.formatExecutionPlan(workflow!);

      expect(doc).toContain('Execution Plan');
      expect(doc).toContain('error-repair-durable');
      expect(doc).toContain('classify-error');
      expect(doc).toContain('propose-repair');
      expect(doc).toContain('apply-repair');
      expect(doc).toContain('run-smoke-test');
      expect(doc).toContain('log-outcome');
    });

    it('includes step icons in documentation', () => {
      const workflow = loader.getWorkflow('error-repair-durable');
      const doc = loader.formatExecutionPlan(workflow!);

      expect(doc).toContain('🤖'); // llm_completion
      expect(doc).toContain('📝'); // file_write
      expect(doc).toContain('💾'); // db_mutation
    });

    it('shows dependencies in documentation', () => {
      const workflow = loader.getWorkflow('error-repair-durable');
      const doc = loader.formatExecutionPlan(workflow!);

      expect(doc).toContain('depends on');
    });
  });

  describe('Export Functions', () => {
    it('loads workflow execution plan', async () => {
      const plan = await loadWorkflowExecutionPlan('error-repair-durable');
      expect(plan).toBeDefined();
      expect(plan.length).toBeGreaterThan(0);
      expect(plan[0].name).toBe('classify-error');
    });

    it('throws error for non-existent workflow', async () => {
      await expect(loadWorkflowExecutionPlan('non-existent')).rejects.toThrow('not found');
    });
  });
});
