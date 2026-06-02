// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  insertedByTable: new Map<string, unknown[]>(),
  updatedByTable: new Map<string, unknown[]>(),
  selectedByTable: new Map<string, unknown[]>(),
}));

const mockDb = vi.hoisted(() => ({
  select: vi.fn(() => ({
    from: vi.fn((table: unknown) => ({
      where: vi.fn(() => {
        const tableName =
          table && typeof table === 'object' && '__name' in table
            ? String((table as { __name: unknown }).__name)
            : 'unknown';
        const rows = calls.selectedByTable.get(tableName) ?? [];
        return {
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => rows),
          })),
          limit: vi.fn(async () => rows),
        };
      }),
    })),
  })),
  insert: vi.fn((table: unknown) => ({
    values: vi.fn(async (payload: unknown) => {
      const tableName =
        table && typeof table === 'object' && '__name' in table
          ? String((table as { __name: unknown }).__name)
          : 'unknown';
      const rows = calls.insertedByTable.get(tableName) ?? [];
      rows.push(payload);
      calls.insertedByTable.set(tableName, rows);
      return undefined;
    }),
  })),
  update: vi.fn((table: unknown) => ({
    set: vi.fn((payload: unknown) => ({
      where: vi.fn(async () => {
        const tableName =
          table && typeof table === 'object' && '__name' in table
            ? String((table as { __name: unknown }).__name)
            : 'unknown';
        const rows = calls.updatedByTable.get(tableName) ?? [];
        rows.push(payload);
        calls.updatedByTable.set(tableName, rows);
        return undefined;
      }),
    })),
  })),
}));

vi.mock('$lib/server/db/client.js', () => ({
  db: mockDb,
}));

vi.mock('$lib/server/db/client', () => ({
  db: mockDb,
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
  contextTimeline: {
    __name: 'context_timeline',
    id: 'id',
    sessionId: 'sessionId',
    eventType: 'eventType',
    pipeline: 'pipeline',
    summaryId: 'summaryId',
    payload: 'payload',
    createdAt: 'createdAt',
  },
}));

vi.mock('$lib/server/db/schema.js', () => ({
  contextTimeline: { __name: 'context_timeline' },
  engramCards: { __name: 'engram_cards', id: 'id', memoryId: 'memoryId' },
  intentEvalRuns: { __name: 'intent_eval_runs' },
  memoryRegistry: { __name: 'memory_registry', id: 'id', memoryId: 'memoryId' },
}));

vi.mock('$lib/server/analysis/agentic-fix-proposal.js', () => ({
  buildAgenticFixProposal: vi.fn(async () => ({
    suggestions: [],
    proposalMarkdown: '',
    proposalKind: 'repair_proposal',
    laneOrder: [],
    observedStates: {},
  })),
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: vi.fn(() => ({
    status: 'ready',
    keys: vi.fn(async () => []),
    pipeline: vi.fn(() => ({ exec: vi.fn(async () => []) })),
  })),
}));

vi.mock('$lib/intent/regex-intent.js', () => ({
  rankIntent: vi.fn(() => ({ label: 'repair_proposal', confidence: 0.92, fallback: false })),
}));

vi.mock('$lib/server/ai/engram-memory.js', () => ({
  getDidYouMeanFromEngram: vi.fn(async () => []),
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  desc: vi.fn((value: unknown) => value),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
  inArray: vi.fn((left: unknown, right: unknown) => ({ left, right })),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

describe('agentic proposal join spine', () => {
  beforeEach(() => {
    calls.insertedByTable.clear();
    calls.updatedByTable.clear();
    calls.selectedByTable.clear();
    mockDb.select.mockClear();
    mockDb.insert.mockClear();
    mockDb.update.mockClear();
  });

  it('normalizes timeline rows with both camelCase and snake_case aliases', async () => {
    const { normalizeAgenticProposalTimelineRow } = await import('./agentic-proposal-timeline.js');

    const event = normalizeAgenticProposalTimelineRow({
      id: 'evt-1',
      sessionId: 'session-1',
      eventType: 'agentic_proposal',
      pipeline: 'agentic-fix-proposal',
      summaryId: null,
      payload: {
        feature_id: 'semantic.cache.policy',
        source_ref: 'src/lib/server/cache/redis-semantic-cache.ts',
        source_refs: ['src/lib/server/cache/redis-semantic-cache.ts'],
        workspace_task_id: 'task-7',
        parent_atlas_card_id: 'card-9',
        missingFeatureId: false,
        warning: null,
      },
      createdAt: '2026-06-01T12:00:00.000Z',
    });

    expect(event.featureId).toBe('semantic.cache.policy');
    expect(event.feature_id).toBe('semantic.cache.policy');
    expect(event.sourceRef).toBe('src/lib/server/cache/redis-semantic-cache.ts');
    expect(event.source_ref).toBe('src/lib/server/cache/redis-semantic-cache.ts');
    expect(event.sourceRefs).toEqual(['src/lib/server/cache/redis-semantic-cache.ts']);
    expect(event.source_refs).toEqual(['src/lib/server/cache/redis-semantic-cache.ts']);
    expect(event.workspaceTaskId).toBe('task-7');
    expect(event.workspace_task_id).toBe('task-7');
    expect(event.parentAtlasCardId).toBe('card-9');
    expect(event.parent_atlas_card_id).toBe('card-9');
    expect(event.missingFeatureId).toBe(false);
  });

  it('timeline API exposes normalized join-spine metadata on reads', async () => {
    calls.selectedByTable.set('context_timeline', [
      {
        id: 'evt-2',
        sessionId: 'session-2',
        eventType: 'agentic_proposal',
        pipeline: 'agentic-fix-proposal',
        summaryId: null,
        payload: {
          feature_id: 'deep_research',
          source_ref: 'src/lib/server/analysis/agentic-fix-proposal.ts',
          source_refs: ['src/lib/server/analysis/agentic-fix-proposal.ts'],
          workspace_task_id: 'task-17',
          parent_atlas_card_id: 'card-17',
          missingFeatureId: false,
          warning: null,
        },
        createdAt: '2026-06-01T12:00:00.000Z',
      },
    ]);

    const { GET } = await import('../../../routes/api/v1/agentic/+server.ts');
    const response = await GET({
      url: new URL('http://localhost/api/v1/agentic?action=timeline&query=deep_research'),
      locals: { user: { id: 'user-1' } },
    } as never);
    const body = await response.json();

    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({
      featureId: 'deep_research',
      feature_id: 'deep_research',
      sourceRef: 'src/lib/server/analysis/agentic-fix-proposal.ts',
      source_ref: 'src/lib/server/analysis/agentic-fix-proposal.ts',
      sourceRefs: ['src/lib/server/analysis/agentic-fix-proposal.ts'],
      source_refs: ['src/lib/server/analysis/agentic-fix-proposal.ts'],
      workspaceTaskId: 'task-17',
      workspace_task_id: 'task-17',
      parentAtlasCardId: 'card-17',
      parent_atlas_card_id: 'card-17',
      missingFeatureId: false,
      warning: null,
    });
  });

  it('recordAgenticProposalEngram writes both sourceRef and feature_id aliases to context_timeline', async () => {
    calls.selectedByTable.set('memory_registry', []);
    calls.selectedByTable.set('engram_cards', []);

    const { recordAgenticProposalEngram } = await import('../ai/engram-registry.js');

    await recordAgenticProposalEngram({
      sessionId: 'session-3',
      query: 'feature id drift',
      filePath: 'src/lib/server/analysis/agentic-fix-proposal.ts',
      clusterId: 4,
      feature_id: 'agentic.timeline',
      source_ref: 'src/routes/api/v1/agentic/+server.ts',
      source_refs: ['src/routes/api/v1/agentic/+server.ts'],
      workspace_task_id: 'task-23',
      parent_atlas_card_id: 'card-23',
      tupleHash: 'tuple-1',
      semanticHash: 'semantic-1',
      missingFeatureId: false,
      warning: null,
      observedStates: { parsed: true },
      laneOrder: ['langextract'],
      suggestionCount: 1,
      proposalSummary: 'Preserve feature_id through the timeline read path.',
    });

    const timelineRows = (calls.insertedByTable.get('context_timeline') ?? []) as Array<Record<string, any>>;
    expect(timelineRows).toHaveLength(1);
    expect(timelineRows[0].payload).toMatchObject({
      featureId: 'agentic.timeline',
      feature_id: 'agentic.timeline',
      sourceRef: 'src/routes/api/v1/agentic/+server.ts',
      source_ref: 'src/routes/api/v1/agentic/+server.ts',
      sourceRefs: ['src/routes/api/v1/agentic/+server.ts', 'src/lib/server/analysis/agentic-fix-proposal.ts'],
      source_refs: ['src/routes/api/v1/agentic/+server.ts', 'src/lib/server/analysis/agentic-fix-proposal.ts'],
      workspaceTaskId: 'task-23',
      workspace_task_id: 'task-23',
      parentAtlasCardId: 'card-23',
      parent_atlas_card_id: 'card-23',
      missingFeatureId: false,
      warning: null,
    });
  });
});