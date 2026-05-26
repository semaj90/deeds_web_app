// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { classifyWorkflowInput, runWorkflowLoop } from './workflow-loop.js';
import { runWorkflowLoopLangGraph } from './workflow-loop-langgraph.js';
import { traceKagRun } from '$lib/server/observability/trace-kag-run.js';

vi.mock('$lib/server/observability/trace-kag-run.js', () => {
  return {
    traceKagRun: vi.fn(),
  };
});

// Mock the queryLogger to avoid writing to CouchDB/other services during unit tests
vi.mock('$lib/server/training/query-logger.js', () => {
  return {
    queryLogger: {
      logQuery: vi.fn(),
    },
  };
});

describe('workflow-loop core', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('classifies HMM errors into lane, risk, and severity', () => {
    const classification = classifyWorkflowInput({
      query: 'repair route contract mismatch',
      hmmErrorClass: 'route_contract_mismatch',
    });

    expect(classification.lane).toBe('contracts');
    expect(classification.severity).toBe('medium');
    expect(classification.riskScore).toBeGreaterThan(0.5);
  });

  it('runs classify -> repair -> smoke -> log with injected deps', async () => {
    const stages: string[] = [];
    const result = await runWorkflowLoop(
      {
        query: 'fix api validation gap',
        hmmErrorClass: 'api_validation_gap',
        targetPath: 'src/routes/api/example/+server.ts',
      },
      {
        createRunId: () => 'run-test-1',
        now: () => new Date('2026-05-22T00:00:00.000Z'),
        repair: async () => {
          stages.push('repair');
          return {
            ok: true,
            summary: 'patched validation',
            suggestedFixes: ['add zod schema'],
            touchedFiles: ['src/routes/api/example/+server.ts'],
          };
        },
        smoke: async () => {
          stages.push('smoke');
          return {
            passed: true,
            command: 'npm run test:network-contracts',
            outputSummary: 'all green',
          };
        },
        log: async () => {
          stages.push('log');
        },
      },
    );

    expect(result.runId).toBe('run-test-1');
    expect(result.status).toBe('repaired');
    expect(result.repair.summary).toBe('patched validation');
    expect(result.smoke.passed).toBe(true);
    expect(result.logged).toBe(true);
    expect(stages).toEqual(['repair', 'smoke', 'log']);
    
    // traceKagRun should NOT be called since log was overridden
    expect(traceKagRun).not.toHaveBeenCalled();
  });

  it('triggers traceKagRun when default log is executed', async () => {
    const result = await runWorkflowLoop(
      {
        query: 'fix api validation gap',
        hmmErrorClass: 'api_validation_gap',
        targetPath: 'src/routes/api/example/+server.ts',
        metadata: {
          selectedCards: [{ id: 'card-1', content: 'test card context' }],
          cacheHits: 2,
        },
      },
      {
        createRunId: () => 'run-test-default-log',
        now: () => new Date('2026-05-22T00:00:00.000Z'),
        repair: async () => ({
          ok: true,
          summary: 'patched validation via default log flow',
          suggestedFixes: [],
          touchedFiles: [],
        }),
        smoke: async () => ({
          passed: true,
          command: 'npm run test',
          outputSummary: 'passed',
        }),
        // Do NOT provide log to test defaultLog calling traceKagRun
      },
    );

    expect(result.logged).toBe(true);
    expect(traceKagRun).toHaveBeenCalledTimes(1);
    expect(traceKagRun).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'fix api validation gap',
        selectedCards: expect.arrayContaining([expect.objectContaining({ id: 'card-1' })]),
        toonHash: 'run-test-default-log',
        cacheHits: 2,
        output: 'patched validation via default log flow',
      })
    );
  });
});

describe('workflow-loop LangGraph adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wraps the same classify -> repair -> smoke -> log loop in StateGraph', async () => {
    const stages: string[] = [];
    const result = await runWorkflowLoopLangGraph(
      {
        query: 'resolve ssr safety issue',
        hmmErrorClass: 'ssr_safety_violation',
      },
      {
        createRunId: () => 'run-graph-1',
        now: () => new Date('2026-05-22T00:00:00.000Z'),
        repair: async () => {
          stages.push('repair');
          return {
            ok: true,
            summary: 'guarded browser globals',
            suggestedFixes: ['move window access into onMount'],
            touchedFiles: ['src/routes/example/+page.svelte'],
          };
        },
        smoke: async () => {
          stages.push('smoke');
          return {
            passed: true,
            command: 'npm run check',
            outputSummary: 'no ssr violations',
          };
        },
        log: async () => {
          stages.push('log');
        },
      },
    );

    expect(result.runId).toBe('run-graph-1');
    expect(result.status).toBe('repaired');
    expect(result.classification.lane).toBe('safety');
    expect(stages).toEqual(['repair', 'smoke', 'log']);
    expect(traceKagRun).not.toHaveBeenCalled();
  });

  it('triggers traceKagRun in LangGraph adapter when default log runs', async () => {
    const result = await runWorkflowLoopLangGraph(
      {
        query: 'resolve ssr safety issue',
        hmmErrorClass: 'ssr_safety_violation',
      },
      {
        createRunId: () => 'run-graph-default-log',
        now: () => new Date('2026-05-22T00:00:00.000Z'),
        repair: async () => ({
          ok: true,
          summary: 'guarded browser globals via graph',
          suggestedFixes: [],
          touchedFiles: [],
        }),
        smoke: async () => ({
          passed: true,
          command: 'npm run check',
          outputSummary: 'passed',
        }),
        // Do NOT provide log to test defaultLog calling traceKagRun
      },
    );

    expect(result.runId).toBe('run-graph-default-log');
    expect(traceKagRun).toHaveBeenCalledTimes(1);
    expect(traceKagRun).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'resolve ssr safety issue',
        toonHash: 'run-graph-default-log',
        output: 'guarded browser globals via graph',
      })
    );
  });
});
