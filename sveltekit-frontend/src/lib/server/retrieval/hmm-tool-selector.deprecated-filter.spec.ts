// @vitest-environment node
//
// Regression test for the real bug found + fixed live 2026-09-16
// (openspec/changes/add-packet-ontology-registry/tasks.md §5e): filterDeprecatedTools()'s
// `sql\`ANY(${toolIds})\`` was invalid SQL (drizzle-orm's sql`` tag expands an interpolated array
// into a comma-separated param list, not a single array bind), so every call threw and was
// silently swallowed by the fail-open catch — the deprecated-tool filter never actually excluded
// anything, on any query, despite looking fully wired. Fixed via sql.join(...) + IN (...).
//
// This test mocks db.db.execute (hmm-tool-selector.ts imports the default export
// `{ db, adminDb, closeConnections }` from $lib/server/db/client.js, not the drizzle instance
// directly) with a fake that mirrors real Postgres IN (...) semantics closely enough to catch a
// regression back to the broken ANY(...) form: it inspects the generated SQL text and throws if
// it doesn't look like a valid IN (...) list, the same way the real bug threw against live
// Postgres.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));

vi.mock('$lib/server/db/client.js', () => ({
  default: { db: { execute: mockExecute } },
}));

const { selectTool } = await import('./hmm-tool-selector.js');

type Row = { tool_id: string; tool_capabilities: unknown };

/** tool_registry rows for the tools this test's queries can rank. */
const REGISTRY: Record<string, Row> = {
  'rg.lexical_search': {
    tool_id: 'rg.lexical_search',
    tool_capabilities: { deprecated: false, supportedPacketTypes: ['code', 'test', 'doc'] },
  },
  'atlas.topology_expand': {
    tool_id: 'atlas.topology_expand',
    tool_capabilities: { deprecated: false, supportedPacketTypes: [] },
  },
  'trace.kag_search': {
    tool_id: 'trace.kag_search',
    tool_capabilities: { deprecated: false, supportedPacketTypes: [] },
  },
  // 'trace.explain_retrieval' deliberately has no row — hmm-tool-selector.ts's own ToolId union
  // includes it but tool_registry has zero rows for it (confirmed live in an earlier session).
  // validateToolSchema's permissive-default-on-missing-data rule means it must NOT be excluded.
};

function setDeprecated(toolId: string, deprecated: boolean) {
  const row = REGISTRY[toolId];
  if (!row) throw new Error(`no fixture row for ${toolId}`);
  row.tool_capabilities = { ...(row.tool_capabilities as object), deprecated };
}

beforeEach(() => {
  mockExecute.mockReset();
  setDeprecated('rg.lexical_search', false);
  mockExecute.mockImplementation(async (query: { queryChunks?: unknown[] }) => {
    // Real regression guard, verified against drizzle-orm's actual sql`` object shape (not just a
    // string match): the broken `ANY(${toolIds})` form leaves a bare JS array as one of
    // query.queryChunks' top-level elements (confirmed live via `sql\`ANY(${['a','b']})\`` →
    // queryChunks === [{value:[...]}, ["a","b"], {value:[...]}]) — that raw array is what
    // node-postgres/drizzle serializes into the invalid `ANY(($1, $2))` comma-list at execution
    // time. The fixed sql.join(...) + IN(...) form never produces a bare array chunk (confirmed
    // live the same way). This mock fails the same way live Postgres did if the bug comes back.
    const hasBareArrayChunk = (query.queryChunks ?? []).some((chunk) => Array.isArray(chunk));
    if (hasBareArrayChunk) {
      throw new Error(
        'regression: bare array query chunk detected — this reproduces the ANY(($1, $2)) bug'
      );
    }
    const rows = Object.values(REGISTRY);
    return { rows };
  });
});

describe('filterDeprecatedTools (via selectTool) — live-bug regression', () => {
  it('excludes a tool_registry row marked deprecated: true from the ranked results', async () => {
    setDeprecated('rg.lexical_search', true);

    const result = await selectTool(
      'find function definition for validateSession in auth.ts',
      [],
      5,
      undefined,
      { intent: 'symbol_lookup', domainClass: 'retrieval', intentConfidence: 0.8, domainConfidence: 0.78 }
    );

    expect(result.tool_id).not.toBe('rg.lexical_search');
    expect((result.ranked_tools ?? []).map((r) => r.tool)).not.toContain('rg.lexical_search');
  });

  it('includes the same tool again once deprecated is reverted to false', async () => {
    setDeprecated('rg.lexical_search', false);

    const result = await selectTool(
      'find function definition for validateSession in auth.ts',
      [],
      5,
      undefined,
      { intent: 'symbol_lookup', domainClass: 'retrieval', intentConfidence: 0.8, domainConfidence: 0.78 }
    );

    expect(result.tool_id).toBe('rg.lexical_search');
  });

  it('fails open (does not throw, does not filter) when the DB call errors', async () => {
    mockExecute.mockImplementationOnce(async () => {
      throw new Error('simulated DB error');
    });

    const result = await selectTool(
      'find function definition for validateSession in auth.ts',
      [],
      5,
      undefined,
      { intent: 'symbol_lookup', domainClass: 'retrieval', intentConfidence: 0.8, domainConfidence: 0.78 }
    );

    // Fail-open: unfiltered ranking still returns a real top candidate.
    expect(result.tool_id).toBeTruthy();
  });
});
