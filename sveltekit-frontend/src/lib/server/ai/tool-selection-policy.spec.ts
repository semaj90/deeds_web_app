import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ALWAYS_INCLUDE_TOOL_NAMES,
  normalizeRecentToolUsage,
  rankToolsByQuery,
  selectToolDescriptors,
  type ToolDescriptor,
} from './tool-selection-policy.js';

const CATALOG: ToolDescriptor[] = [
  { name: 'ops.search_tools', description: 'Search the bounded tool catalog.', category: 'ops', inputSchema: {} },
  { name: 'read', description: 'Read a file or record.', category: 'io', inputSchema: {} },
  { name: 'grep', description: 'Search text patterns.', category: 'io', inputSchema: {} },
  { name: 'glob', description: 'List files by pattern.', category: 'io', inputSchema: {} },
  { name: 'shell', description: 'Run a bounded shell command.', category: 'io', inputSchema: {} },
  { name: 'edit', description: 'Edit a file.', category: 'io', inputSchema: {} },
  { name: 'write', description: 'Write a file.', category: 'io', inputSchema: {} },
  { name: 'task', description: 'Spawn a bounded task.', category: 'agent', inputSchema: {} },
  { name: 'vector.search', description: 'Search vector embeddings for retrieval.', category: 'retrieval', inputSchema: {} },
  { name: 'graph.expand', description: 'Expand the graph neighborhood.', category: 'graph', inputSchema: {} },
  { name: 'db.validate', description: 'Validate database state.', category: 'database', inputSchema: {} },
  { name: 'report.generate', description: 'Generate a report.', category: 'docs', inputSchema: {} },
];

describe('tool-selection-policy', () => {
  it('keeps the always-include set and resolves tool_search aliases', () => {
    const selection = selectToolDescriptors({
      query: 'retrieve embeddings and inspect files',
      turnNumber: 1,
      tools: CATALOG,
      usage: [],
      discoveryCallsInWindow: 0,
      toolBudget: 8,
      alwaysIncludeToolNames: [...DEFAULT_ALWAYS_INCLUDE_TOOL_NAMES],
    });

    expect(selection.selected.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'ops.search_tools',
        'read',
        'grep',
        'glob',
        'shell',
        'edit',
        'write',
        'task',
      ]),
    );
    expect(selection.fallbackMode).toBe('BOOTSTRAP_ALL');
  });

  it('prefers explicit requests over recent usage and deduplicates names', () => {
    const selection = selectToolDescriptors({
      query: 'validate database output',
      turnNumber: 4,
      tools: CATALOG,
      usage: [
        { name: 'vector.search', lastUsedAt: 20, callCount: 4 },
        { name: 'graph.expand', lastUsedAt: 10, callCount: 2 },
      ],
      requestedToolNames: ['db.validate', 'tool_search', 'db.validate'],
      previousToolNames: ['read'],
      discoveryCallsInWindow: 0,
      toolBudget: 5,
    });

    const names = selection.selected.map((tool) => tool.name);
    expect(names[0]).toBe('read');
    expect(names).toContain('db.validate');
    expect(names).toContain('ops.search_tools');
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeLessThanOrEqual(5);
    expect(selection.reasonByTool['db.validate']).toBe('explicit_request');
  });

  it('ranks query-matching tools ahead of weaker matches', () => {
    const ranked = rankToolsByQuery('vector retrieval search', CATALOG, 4).map((tool) => tool.name);
    expect(ranked[0]).toBe('vector.search');
    expect(ranked).toContain('ops.search_tools');
  });

  it('normalizes recent usage and keeps the latest entry per tool', () => {
    const normalized = normalizeRecentToolUsage([
      { name: 'graph.expand', lastUsedAt: 2, callCount: 1 },
      { name: 'graph.expand', lastUsedAt: 9, callCount: 3 },
      { name: 'read', lastUsedAt: 7, callCount: 2 },
    ]);

    expect(normalized).toEqual([
      { name: 'graph.expand', lastUsedAt: 9, callCount: 3 },
      { name: 'read', lastUsedAt: 7, callCount: 2 },
    ]);
  });

  it('respects the tool budget', () => {
    const selection = selectToolDescriptors({
      query: 'search anything',
      turnNumber: 4,
      tools: CATALOG,
      usage: [],
      discoveryCallsInWindow: 0,
      toolBudget: 3,
      alwaysIncludeToolNames: ['ops.search_tools', 'read'],
      requestedToolNames: ['db.validate'],
    });

    expect(selection.selected.length).toBeLessThanOrEqual(3);
    expect(selection.selected.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['ops.search_tools', 'read', 'db.validate']),
    );
  });
});
