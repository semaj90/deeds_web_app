import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  classifyInspectRef,
  findSourceRefs,
  buildAgenticRagContext,
  buildAgenticRagContextLive,
  buildLiveAtlasContext,
  buildRecommendation,
  callTraceTool,
  buildCodebaseFileLookupKeys,
  collapseDependencyRows,
  findDependencies,
  inspectPostgresBackend,
  traceDatabase,
  assertOutcomeReceiptScratchUrl,
  recommendKanbanDagPrefillAlgorithm,
  validateToolCallArguments,
  dispatch,
} from './atlas-tools-mcp.mjs';

const ROOT = 'C:/Users/james/Videos/deeds-web-app';

test('MCP call arguments are validated against the exact schema advertised by tools/list', async () => {
  const initialized = await dispatch('initialize', {}, 0);
  const listed = await dispatch('tools/list', {}, 0);
  assert.equal(initialized.serverInfo.version, '0.4.0');
  assert.ok(listed.tools.some((tool) => tool.name === 'inspect_postgres_backend'));
  assert.equal(validateToolCallArguments('classify_intent', { prompt: 'repair this error' }).valid, true);
  assert.equal(validateToolCallArguments('classify_intent', {}).valid, false);
  assert.equal(validateToolCallArguments('classify_intent', { prompt: 'repair', unexpected: true }).valid, false);
  assert.equal(validateToolCallArguments('find_source_refs', {}).valid, true);

  const invalidCall = await dispatch('tools/call', {
    name: 'record_outcome',
    arguments: { intent: 'repair' },
  }, 1);
  assert.equal(invalidCall.isError, true);
  assert.match(invalidCall.content[0].text, /Invalid arguments for record_outcome/);

  const validCall = await dispatch('tools/call', {
    name: 'classify_intent',
    arguments: { prompt: 'repair this TypeScript error' },
  }, 2);
  assert.equal(validCall.isError, undefined);
  assert.equal(JSON.parse(validCall.content[0].text).intent, 'repair');
});

test('inspect_postgres_backend checks PostgreSQL 18 tables inside a read-only transaction without touching Neo4j or Valkey', async () => {
  const sql = [];
  class FakePool {
    constructor(options) { this.options = options; }
    async query(statement) {
      sql.push(statement.trim());
      if (statement.includes('current_database()')) {
        return { rows: [{ database: 'atlas_test', version_num: 180004, transaction_read_only: true }] };
      }
      if (statement.includes('to_regclass')) {
        return { rows: [{
          workspace_source_bindings: true,
          codebase_chunk_index: true,
          graph_snapshots: true,
          graph_nodes: true,
          graph_edges: true,
        }] };
      }
      if (statement.includes('GROUP BY status')) {
        return { rows: [{ status: 'SUPERSEDED', count: 2, revision_qualified_count: 0 }] };
      }
      if (statement.includes('GROUP BY s.status')) {
        return { rows: [{ status: 'SUPERSEDED', edge_type: 'CONTAINS', count: 5 }] };
      }
      return { rows: [] };
    }
    async end() {}
  }
  const result = await inspectPostgresBackend({ poolFactory: FakePool });
  assert.equal(result.status, 'READY');
  assert.match(result.serverBuildRevision, /^[a-f0-9]{64}$/);
  assert.equal(result.postgres.database, 'atlas_test');
  assert.equal(result.postgres.majorVersion, 18);
  assert.equal(result.postgres.transactionReadOnly, true);
  assert.equal(result.graphSnapshotSummary.status, 'SUPERSEDED_OR_REJECTED_ONLY');
  assert.equal(result.graphSnapshotSummary.snapshotCount, 2);
  assert.equal(result.graphSnapshotSummary.revisionQualifiedSnapshotCount, 0);
  assert.deepEqual(result.graphSnapshotSummary.edgeTypeCountsByStatus, [{ status: 'SUPERSEDED', edgeType: 'CONTAINS', count: 5 }]);
  assert.equal(result.otherBackends.neo4j, 'NOT_QUERIED');
  assert.equal(result.otherBackends.valkey, 'NOT_QUERIED');
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
  assert.match(sql[0], /^BEGIN READ ONLY$/);
  assert.equal(sql.at(-1), 'ROLLBACK');
  assert.equal(validateToolCallArguments('inspect_postgres_backend', {}).valid, true);
  assert.equal(validateToolCallArguments('inspect_postgres_backend', { query: 'unexpected' }).valid, false);
});

test('inspect_postgres_backend reports unavailable or incomplete databases without fallback', async () => {
  class UnavailablePool {
    constructor() {}
    async query() { throw Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }); }
    async end() {}
  }
  const unavailable = await inspectPostgresBackend({ poolFactory: UnavailablePool });
  assert.equal(unavailable.status, 'UNAVAILABLE');
  assert.equal(unavailable.failure, 'POSTGRES_QUERY_FAILED:ECONNREFUSED');
  assert.equal(unavailable.otherBackends.neo4j, 'NOT_QUERIED');

  class IncompletePool {
    constructor() {}
    async query(statement) {
      if (statement.includes('current_database()')) {
        return { rows: [{ database: 'atlas_test', version_num: 180004, transaction_read_only: true }] };
      }
      return { rows: [{ workspace_source_bindings: true, codebase_chunk_index: true, graph_snapshots: false, graph_nodes: false, graph_edges: false }] };
    }
    async end() {}
  }
  const incomplete = await inspectPostgresBackend({ poolFactory: IncompletePool });
  assert.equal(incomplete.status, 'SCHEMA_INCOMPLETE');
  assert.equal(incomplete.tables.graphEdges, false);
  assert.equal(incomplete.graphSnapshotSummary.status, 'NO_SNAPSHOTS');
});

test('trace_database searches PostgreSQL read-only and returns only revision-bound lexical candidates', async () => {
  const statements = [];
  const digest = 'a'.repeat(64);
  class FakePool {
    constructor(options) { this.options = options; }
    async query(statement, values) {
      statements.push({ sql: statement.trim(), values });
      if (statement.includes('WITH q AS')) return { rows: [
        {
          source_ref: 'src/lib/server/db/example.ts', chunk_id: 'chunk-1', relative_path: 'src/lib/server/db/example.ts',
          symbol: 'loadRows', kind: 'function', line_start: 8, line_end: 14, content: 'FROM atlas_external_doc_chunks',
          file_content_hash: digest, content_digest: digest, source_revision: digest,
          workspace_revision: 'b'.repeat(64), binding_observed_at: new Date('2026-11-20T00:00:00Z'), score: 0.75,
        },
        {
          source_ref: 'src/lib/server/db/stale.ts', chunk_id: 'chunk-2', relative_path: 'src/lib/server/db/stale.ts',
          symbol: null, kind: null, line_start: 1, line_end: 2, content: 'stale mention',
          file_content_hash: digest, content_digest: digest, source_revision: 'c'.repeat(64),
          workspace_revision: 'b'.repeat(64), score: 0.5,
        },
        {
          source_ref: 'src/lib/server/db/changed-after-index.ts', chunk_id: 'chunk-3', relative_path: 'src/lib/server/db/changed-after-index.ts',
          symbol: null, kind: null, line_start: 2, line_end: 3, content: 'indexed text no longer matches disk',
          file_content_hash: digest, content_digest: digest, source_revision: digest,
          workspace_revision: 'b'.repeat(64), score: 0.4,
        },
      ] };
      return { rows: [] };
    }
    async end() {}
  }
  const result = await traceDatabase({ query: ' atlas_external_doc_chunks ' }, {
    poolFactory: FakePool,
    sourceFileHashResolver: (sourceRef) => ({
      sha256: sourceRef.includes('changed-after-index') ? `sha256:${'d'.repeat(64)}` : `sha256:${digest}`,
      byteLength: 128,
    }),
  });
  assert.equal(result.lookup.backend, 'POSTGRESQL_CODE_INDEX_FTS');
  assert.equal(result.lookup.status, 'CANDIDATES_FOUND');
  assert.equal(result.traces.length, 1);
  assert.equal(result.traces[0].sourceRef, 'src/lib/server/db/example.ts');
  assert.equal(result.traces[0].relationStatus, 'LEXICAL_MENTION_CANDIDATE');
  assert.equal(result.lookup.currentWorkspaceBytesHashed, 256);
  assert.equal(result.provenance.status, 'REVISION_BOUND_CANDIDATES');
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
  assert.equal(statements[0].sql, 'BEGIN READ ONLY');
  assert.equal(statements[1].values[0], 'atlas_external_doc_chunks');
  assert.match(statements[1].sql, /latest_observation/);
  assert.match(statements[1].sql, /JOIN LATERAL/);
  assert.doesNotMatch(statements[1].sql, /OR\s+c\.(?:source_ref|relative_path)\s*=\s*b\.canonical_source_ref/i);
  assert.equal(result.traces[0].bindingObservedAt, '2026-11-20T00:00:00.000Z');
  assert.equal(statements.at(-1).sql, 'ROLLBACK');
});

test('trace_database rejects empty input and reports PostgreSQL failure without Neo4j fallback', async () => {
  const empty = await traceDatabase({ query: '  ' });
  assert.equal(empty.lookup.failure, 'EMPTY_QUERY');
  class UnavailablePool {
    constructor() {}
    async query() { throw Object.assign(new Error('unavailable'), { code: 'ECONNREFUSED' }); }
    async end() {}
  }
  const unavailable = await traceDatabase({ query: 'accounts' }, { poolFactory: UnavailablePool });
  assert.equal(unavailable.lookup.failure, 'POSTGRES_QUERY_FAILED:ECONNREFUSED');
  assert.equal(unavailable.traces.length, 0);
  assert.equal(unavailable.provenance.authority, 'postgresql_source_index');
});

test('outcome receipt persistence accepts only an explicit loopback scratch database', () => {
  assert.equal(
    assertOutcomeReceiptScratchUrl('postgresql://atlas:secret@127.0.0.1:5434/legal_ai_live_integration_scratch').databaseName,
    'legal_ai_live_integration_scratch',
  );
  assert.throws(
    () => assertOutcomeReceiptScratchUrl('postgresql://atlas:secret@127.0.0.1:5434/legal_ai_db'),
    /OUTCOME_RECEIPT_DATABASE_MUST_BE_LOOPBACK_SCRATCH/,
  );
  assert.throws(
    () => assertOutcomeReceiptScratchUrl('postgresql://atlas:secret@127.0.0.1:5434/another_scratch'),
    /OUTCOME_RECEIPT_DATABASE_MUST_BE_LOOPBACK_SCRATCH/,
  );
  assert.throws(
    () => assertOutcomeReceiptScratchUrl('postgresql://atlas:secret@127.0.0.1:5432/legal_ai_live_integration_scratch'),
    /OUTCOME_RECEIPT_DATABASE_MUST_BE_LOOPBACK_SCRATCH/,
  );
  assert.throws(
    () => assertOutcomeReceiptScratchUrl('postgresql://atlas:secret@example.test:5434/legal_ai_scratch'),
    /OUTCOME_RECEIPT_DATABASE_MUST_BE_LOOPBACK_SCRATCH/,
  );
  assert.throws(() => assertOutcomeReceiptScratchUrl(''), /OUTCOME_RECEIPT_DATABASE_URL_REQUIRED/);
});

test('Kanban DAG recommender fetches the exact bounded OpenSpec cohort and returns proposal-only selection', async () => {
  const calls = [];
  const snapshotHash = 'b'.repeat(64);
  const result = await recommendKanbanDagPrefillAlgorithm({
    featureId: 'openspec:parent-atlas-agentic-file-compiler',
    maxPrefillTasks: 1,
  }, {
    trace: async (name, args) => {
      calls.push({ name, args });
      return {
        schema: 'atlas.kanban-task-dag-snapshot.v1',
        status: 'READY',
        featureId: args.featureId,
        snapshotAt: '2026-11-02T00:00:00.000Z',
        snapshotHash,
        tasks: [
          { taskId: 'task-b', featureLabel: 'Task B', lane: 'todo', status: 'pending', priority: 1, sourceRefs: ['openspec/changes/change/tasks.md'] },
          { taskId: 'task-a', featureLabel: 'Task A', lane: 'todo', status: 'pending', priority: 2, sourceRefs: ['openspec/changes/change/tasks.md'] },
        ],
        dependencies: [],
        sourceAuthority: 'KANBAN_TASKS_POSTGRES_READ_ONLY_SNAPSHOT',
        canonicalAuthority: false,
        writesPerformed: false,
      };
    },
  });
  assert.deepEqual(calls, [{
    name: 'atlas.kanban_dag_snapshot',
    args: { featureId: 'openspec:parent-atlas-agentic-file-compiler', limit: 128 },
  }]);
  assert.equal(result.status, 'PROPOSED');
  assert.deepEqual(result.readyTaskIds, ['task-a']);
  assert.equal(result.omittedReadyTaskCount, 1);
  assert.equal(result.sourceSnapshotHash, snapshotHash);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
});

test('Kanban DAG recommender tool rejects non-cohort scope and appears in the advertised tool list', async () => {
  assert.equal(validateToolCallArguments('recommend_kanban_dag_prefill_algorithm', {
    featureId: 'all',
  }).valid, false);
  assert.equal(validateToolCallArguments('recommend_kanban_dag_prefill_algorithm', {
    featureId: 'openspec:parent-atlas-agentic-file-compiler',
    maxPrefillTasks: 33,
  }).valid, false);
  assert.equal(validateToolCallArguments('recommend_kanban_dag_prefill_algorithm', {
    featureId: 'nextsteps:sveltekit-frontend-next-steps-plans-bitfrost-turboquant-turbovec-production-todo',
  }).valid, true);
  assert.equal(validateToolCallArguments('recommend_kanban_dag_prefill_algorithm', {
    featureId: 'nextsteps:../legal_ai_db',
  }).valid, false);
  const listed = await dispatch('tools/list', {}, 1);
  assert.ok(listed.tools.some((tool) => tool.name === 'recommend_kanban_dag_prefill_algorithm'));
});

test('Kanban DAG recommender normalizes TRACE failures into an explicit blocked proposal', async () => {
  const result = await recommendKanbanDagPrefillAlgorithm({
    featureId: 'openspec:parent-atlas-evidence-agent-proposals',
  }, {
    trace: async () => {
      throw Object.assign(new Error('snapshot tool is not registered'), { code: 'TRACE_TOOL_ERROR' });
    },
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reasonCode, 'TRACE_TOOL_ERROR');
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
});

test('every input form of one file resolves to the same canonical key', () => {
  const forms = [
    'src/hooks.server.ts',
    'sveltekit-frontend/src/hooks.server.ts',
    'sveltekit-frontend\\src\\hooks.server.ts',
    'C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/hooks.server.ts',
    'C:\\Users\\james\\Videos\\deeds-web-app\\sveltekit-frontend\\src\\hooks.server.ts',
    'file:///C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/hooks.server.ts',
    './src/hooks.server.ts',
  ];
  for (const form of forms) {
    const keys = buildCodebaseFileLookupKeys(form, ROOT);
    assert.equal(keys.canonical, 'src/hooks.server.ts', form);
    assert.ok(keys.pathKeys.includes('src/hooks.server.ts'), form);
    assert.ok(keys.filePathKeys.includes('sveltekit-frontend/src/hooks.server.ts'), form);
    assert.ok(keys.filePathKeys.includes(`${ROOT}/sveltekit-frontend/src/hooks.server.ts`), form);
  }
});

test('the file own case is kept in the indexed path key while canonical is lowercase', () => {
  const keys = buildCodebaseFileLookupKeys('src/lib/Example.ts', ROOT);
  assert.equal(keys.canonical, 'src/lib/example.ts');
  assert.deepEqual(keys.pathKeys, ['src/lib/Example.ts', 'src/lib/example.ts']);
  assert.ok(keys.lowerFilePathKeys.every((k) => k === k.toLowerCase()));
});

test('empty or non-path input yields no keys, and a symbol name is never rewritten into a path', () => {
  assert.equal(buildCodebaseFileLookupKeys('', ROOT), null);
  assert.equal(buildCodebaseFileLookupKeys('   ', ROOT), null);
  assert.equal(buildCodebaseFileLookupKeys(undefined, ROOT), null);
  assert.equal(buildCodebaseFileLookupKeys('planGraphifyEdgeReplayV1', ROOT).canonical, 'plangraphifyedgereplayv1');
});

test('a path segment that merely contains the folder name is not stripped', () => {
  const keys = buildCodebaseFileLookupKeys('src/lib/sveltekit-frontend/notes.ts', ROOT);
  assert.equal(keys.canonical, 'src/lib/sveltekit-frontend/notes.ts');
});

test('rows from both node families collapse to one deduplicated edge list and keep the duplicate flag honest', () => {
  const rows = [
    { nodePath: 'src/a.ts', flagged: null, type: 'IMPORTS', depPath: 'src/b.ts', depKind: 'CodebaseFile' },
    { nodeFilePath: `${ROOT}/sveltekit-frontend/src/a.ts`, flagged: 'ABSOLUTE_DUPLICATE', type: 'CALLS', depKind: 'Function', depName: 'helper' },
    { nodeFilePath: `${ROOT}/sveltekit-frontend/src/a.ts`, flagged: 'ABSOLUTE_DUPLICATE', type: 'CALLS', depKind: 'Function', depName: 'helper' },
    { nodePath: 'src/a.ts', flagged: null, type: null }, // OPTIONAL MATCH with no outgoing edge
    { nodePath: 'src/a.ts', flagged: null, type: 'IMPORTS', depFilePath: `${ROOT}/sveltekit-frontend/src/b.ts`, depKind: 'CodebaseFile' },
  ];
  const out = collapseDependencyRows(rows);
  assert.equal(out.length, 2); // IMPORTS src/b.ts (relative and absolute dep forms collapse), CALLS helper (duplicate row collapses)
  const imports = out.find((d) => d.type === 'IMPORTS');
  assert.equal(imports.depCanonical, 'src/b.ts');
  assert.equal(imports.viaFlaggedDuplicate, false);
  const calls = out.find((d) => d.type === 'CALLS');
  assert.equal(calls.depName, 'helper');
  assert.equal(calls.viaFlaggedDuplicate, true); // only ever reached through a duplicate-tagged node
});

test('findDependencies uses the canonical source revision and Atlas graph resolver, without a Neo4j fallback', async () => {
  const sourceIdentity = {
    sourceRef: 'src/a.ts',
    sourceRevision: `sha256:${'a'.repeat(64)}`,
    workspaceRevision: `sha256:${'b'.repeat(64)}`,
  };
  let graphInput;
  const result = await findDependencies(
    { target: 'sveltekit-frontend/src/a.ts' },
    {
      sourceIndexResolver: async (_target, keys) => ({ ok: true, identity: { ...sourceIdentity, sourceRef: keys.canonical } }),
      graphResolver: async (input) => {
        graphInput = input;
        return {
          target: 'src/a.ts',
          dependencies: [{ dep: 'src/b.ts', type: 'IMPORTS', evidenceRefs: ['ast:src/a.ts:0-10'], pageRankPrior: 0.5 }],
          failure: null,
          graphRevision: `sha256:${'c'.repeat(64)}`,
          sourceRevision: sourceIdentity.sourceRevision,
          workspaceRevision: sourceIdentity.workspaceRevision,
          evidenceRefs: ['ast:src/a.ts:0-10'],
          pageRank: { backend: 'networkx' },
          canonicalAuthority: false,
          writesPerformed: false,
        };
      },
    },
  );
  assert.equal(graphInput.target, 'src/a.ts');
  assert.equal(graphInput.sourceIdentity.sourceRevision, sourceIdentity.sourceRevision);
  assert.equal(result.lookup.phase, 'atlas-graph');
  assert.equal(result.lookup.failure, null);
  assert.deepEqual(result.dependencies.map((row) => row.dep), ['src/b.ts']);
  assert.equal(result.provenance.graphRevision, `sha256:${'c'.repeat(64)}`);
  assert.equal(result.provenance.pageRankBackend, 'networkx');
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
});

test('an unindexed or stale source fails closed before graph traversal', async () => {
  let graphCalls = 0;
  const missing = await findDependencies(
    { target: 'src/missing.ts' },
    { sourceIndexResolver: async () => ({ ok: false, failure: 'SOURCE_NOT_INDEXED' }), graphResolver: async () => { graphCalls += 1; return {}; } },
  );
  assert.equal(missing.lookup.failure, 'SOURCE_NOT_INDEXED');
  assert.equal(missing.provenance.authority, 'atlas_typed_graph_projection');
  assert.equal(graphCalls, 0);

  const empty = await findDependencies({ target: '  ' }, {
    sourceIndexResolver: async () => { throw new Error('must not run'); },
    graphResolver: async () => { throw new Error('must not run'); },
  });
  assert.equal(empty.lookup.failure, 'EMPTY_TARGET');
});

test('graph artifact errors remain typed unresolved results and never fall back to Neo4j', async () => {
  const result = await findDependencies(
    { target: 'src/a.ts' },
    {
      sourceIndexResolver: async (_target, keys) => ({ ok: true, identity: { sourceRef: keys.canonical, sourceRevision: `sha256:${'a'.repeat(64)}`, workspaceRevision: `sha256:${'b'.repeat(64)}` } }),
      graphResolver: async () => ({ failure: 'SOURCE_GRAPH_PLAN_INCOMPLETE', dependencies: [], graphRevision: null }),
    },
  );
  assert.equal(result.lookup.failure, 'SOURCE_GRAPH_PLAN_INCOMPLETE');
  assert.equal(result.provenance.graphRevision, null);
  assert.deepEqual(result.dependencies, []);
  assert.equal(result.canonicalAuthority, false);
});

test('unqualified graph resolver output cannot be presented as dependencies', async () => {
  const result = await findDependencies(
    { target: 'src/a.ts' },
    {
      sourceIndexResolver: async (_target, keys) => ({ ok: true, identity: { sourceRef: keys.canonical, sourceRevision: `sha256:${'a'.repeat(64)}`, workspaceRevision: `sha256:${'b'.repeat(64)}` } }),
      graphResolver: async () => ({ dependencies: [{ type: 'IMPORTS', dep: 'src/b.ts', evidenceRefs: [] }] }),
    },
  );
  assert.equal(result.lookup.failure, 'ATLAS_GRAPH_RESOLVER_RESPONSE_UNQUALIFIED');
  assert.deepEqual(result.dependencies, []);
  assert.equal(result.provenance.status, 'UNRESOLVED');
});

const REAL_PACKET = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../../../reports/semantic-contracts/reconciliation-ace-packet.json');

function withPacketCwd(mutate, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-ctx-'));
  const packet = JSON.parse(fs.readFileSync(REAL_PACKET, 'utf8'));
  mutate(packet);
  fs.mkdirSync(path.join(dir, '.opencode'));
  fs.writeFileSync(path.join(dir, '.opencode', 'ace-packet.json'), JSON.stringify(packet));
  const previous = process.cwd();
  process.chdir(dir);
  let result;
  try {
    result = run();
  } catch (error) {
    process.chdir(previous);
    throw error;
  }
  if (result && typeof result.then === 'function') {
    return result.finally(() => process.chdir(previous));
  }
  process.chdir(previous);
  return result;
}

test('atlas_context states that its candidate set is a fixed packet, not query-specific retrieval', () => {
  const result = withPacketCwd(() => {}, () => buildAgenticRagContext({ query: 'anything at all', maxCards: 5 }));
  assert.equal(result.ok, true);
  assert.equal(result.querySpecific, false);
  assert.equal(result.candidateSetBasis, 'FIXED_PACKET_CARDS');
  assert.equal(result.contextSource.kind, 'STATIC_PACKET_FILE');
  assert.equal(result.contextSource.packetPath, '.opencode/ace-packet.json');
  assert.ok(result.warnings.includes('NO_QUERY_SPECIFIC_RETRIEVAL'));
});

test('an expired packet is flagged in contextSource and warnings, a fresh one is not', () => {
  const expired = withPacketCwd((p) => { p.createdAt = '2020-01-01T00:00:00.000Z'; p.expiresInSeconds = 60; }, () => buildAgenticRagContext({ query: 'x' }));
  assert.equal(expired.contextSource.expired, true);
  assert.ok(expired.warnings.includes('PACKET_EXPIRED'));
  const fresh = withPacketCwd((p) => { p.createdAt = new Date().toISOString(); p.expiresInSeconds = 3600; }, () => buildAgenticRagContext({ query: 'x' }));
  assert.equal(fresh.contextSource.expired, false);
  assert.ok(!fresh.warnings.includes('PACKET_EXPIRED'));
  assert.equal(fresh.querySpecific, false, 'a fresh packet is still not query-specific');
});

test('a missing source revision is surfaced as a warning', () => {
  const result = withPacketCwd((p) => { delete p.sourceRevision; delete p.source_revision; if (p.sourceArtifact && typeof p.sourceArtifact === 'object') delete p.sourceArtifact.sourceRevision; }, () => buildAgenticRagContext({ query: 'x' }));
  assert.ok(result.warnings.includes('MISSING_SOURCE_REVISION'));
});

// ── live, query-specific context ──────────────────────────────────────────────────────────────────
function fakeTrace(script) {
  const calls = [];
  const trace = async (name, args) => {
    calls.push({ name, args });
    const handler = script[name];
    if (!handler) throw Object.assign(new Error('no handler'), { code: 'TRACE_TOOL_ERROR' });
    return handler(args);
  };
  trace.calls = calls;
  return trace;
}
const hit = (id, p, score, content = 'snippet text', sources = []) => ({ id, path: p, score, content, sources, lenses: [] });
const packet = (key, ref, sha) => ({ packet_key: key, source_ref: ref, feature_id: 'f', sha256: sha ?? null, identity_lane: 'canonical' });

test('live cards are query-specific, deduplicated per file, ordered by score and bound to packet identity', async () => {
  const trace = fakeTrace({
    'search.hybrid': () => ({ results: [hit('c1', 'src/a.ts', 0.4, 'a one'), hit('c2', 'sveltekit-frontend/src/b.ts', 0.9, 'b best'), hit('c3', 'src/a.ts', 0.7, 'a better')] }),
    'atlas.packet_search': ({ source_ref }) => ({ packets: source_ref === 'src/a.ts' ? [packet('packet:aaa', 'src/a.ts')] : [packet('packet:b1', 'src/b.ts'), packet('ace:packet:b2', 'sveltekit-frontend/src/b.ts')] }),
  });
  const result = await buildLiveAtlasContext({ query: 'who owns persistence', maxCards: 10 }, { trace });
  assert.equal(result.querySpecific, true);
  assert.equal(result.candidateSetBasis, 'LIVE_TRACE_RANKED_SEARCH');
  assert.equal(result.contextSource.kind, 'TRACE_MCP_LIVE');
  assert.deepEqual(result.cards.map((c) => c.sourceRef), ['src/b.ts', 'src/a.ts']); // best score first, one card per file
  const [b, a] = result.cards;
  assert.equal(a.score, 0.7);
  assert.equal(a.summary, 'a better');
  assert.deepEqual(a.chunkIds, ['c1', 'c3']);
  assert.equal(a.identityBound, true);
  assert.equal(a.packetKey, 'packet:aaa');
  assert.equal(b.identityBound, false);
  assert.equal(b.identityConflict, true); // two packets for one file is a conflict, never silently picked
  assert.equal(b.packetKey, null);
  assert.deepEqual([...b.packetKeys].sort(), ['ace:packet:b2', 'packet:b1']);
  assert.ok(b.rejectionReasons.includes('IDENTITY_CONFLICT'));
  assert.ok(result.cards.every((c) => c.proofUsable === false && c.rejectionReasons.includes('MISSING_SOURCE_REVISION')));
  assert.equal(result.admissionStatus, 'UNADMITTED_RETRIEVAL_CANDIDATES');
  assert.equal(result.retrievalAdmission.proofUsable, false);
  assert.ok(result.warnings.includes('SOME_CARDS_IDENTITY_UNBOUND'));
  assert.equal(result.promptPacket, ''); // unadmitted live hits cannot be formatted as model context
});

test('live cards retain Qdrant provenance when a lower-scoring semantic hit follows an FTS hit', async () => {
  const trace = fakeTrace({
    'search.hybrid': () => ({ results: [
      hit('fts-1', 'scripts/atlas/owner.mjs', 0.9, 'lexical snippet', ['postgres_fts']),
      hit('packet:semantic-1', 'scripts/atlas/owner.mjs', 0.6, 'semantic snippet', ['qdrant']),
    ] }),
    'atlas.packet_search': ({ source_ref }) => ({ packets: [{
      packet_key: 'packet:owner', source_ref, source_revision: `sha256:${'c'.repeat(64)}`, identity_lane: 'canonical',
    }] }),
  });
  const result = await buildLiveAtlasContext({ query: 'owner' }, { trace });
  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].score, 0.9);
  assert.deepEqual(result.cards[0].retrievalSources, ['postgres_fts', 'qdrant']);
  assert.equal(result.cards[0].identityBound, true);
});

test('build_recommendation queries live retrieval and only returns revision-bound source targets', async () => {
  const trace = fakeTrace({
    'search.hybrid': ({ query }) => ({ results: [hit('chunk-1', 'scripts/atlas/owner.mjs', 0.91, `evidence for ${query}`, ['postgres_fts', 'qdrant'])] }),
    'atlas.packet_search': ({ source_ref }) => ({ packets: [{
      packet_key: 'packet:grounded1', source_ref, source_revision: 'sha256:' + 'a'.repeat(64),
      workspace_revision: 'sha256:' + 'b'.repeat(64), sha256: 'a'.repeat(64),
      identity_lane: 'canonical',
    }] }),
  });
  const result = await buildRecommendation({
    intent: 'repair', domain: 'retrieval', errorSummary: 'repair lookup',
    evidenceLines: ['caller supplied unverified claim'], patchTargets: ['../../invented.ts'], proposedFix: 'untrusted',
  }, { trace });
  assert.equal(trace.calls[0].name, 'search.hybrid');
  assert.deepEqual(result.patch_targets, ['scripts/atlas/owner.mjs']);
  assert.equal(result.evidence[0].source_revision, 'sha256:' + 'a'.repeat(64));
  assert.equal(result.evidence[0].source_sha256, 'a'.repeat(64));
  assert.deepEqual(result.evidence[0].retrieval_sources, ['postgres_fts', 'qdrant']);
  assert.equal(result.proposed_fix, null);
  assert.equal(result.canonicalAuthority, false);
  assert.ok(!JSON.stringify(result).includes('caller supplied unverified claim'));
});

test('build_recommendation rejects source-revision-only packets without a workspace revision', async () => {
  const trace = fakeTrace({
    'search.hybrid': () => ({ results: [hit('chunk-1', 'scripts/atlas/owner.mjs', 0.91, 'unqualified snippet', ['postgres_fts'])] }),
    'atlas.packet_search': ({ source_ref }) => ({ packets: [{
      packet_key: 'packet:grounded1', source_ref, source_revision: 'sha256:' + 'a'.repeat(64),
      identity_lane: 'canonical',
    }] }),
  });
  const result = await buildRecommendation({
    intent: 'repair', domain: 'retrieval', errorSummary: 'repair lookup',
  }, { trace });
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.patch_targets, []);
  assert.equal(result.retrievalEvidenceCount, 0);
});

test('live binding ignores Qdrant chunk locators when one exact canonical packet is present', async () => {
  const canonical = { ...packet('packet:canonical', 'src/owner.ts', 'a'.repeat(64)), source_revision: `sha256:${'a'.repeat(64)}` };
  const retrievalLocator = { packet_key: 'ace:packet:qdrant', source_ref: 'src/owner.ts', identity_lane: 'qdrant_chunk' };
  const trace = fakeTrace({
    'search.hybrid': () => ({ results: [hit('qdrant:chunk-1', 'src/owner.ts', 0.9, 'hybrid hit', ['qdrant'])] }),
    'atlas.packet_search': () => ({ packets: [retrievalLocator, canonical] }),
  });
  const result = await buildLiveAtlasContext({ query: 'owner', maxCards: 1 }, { trace });
  assert.equal(result.cards[0].identityBound, true);
  assert.equal(result.cards[0].canonicalPacketCount, 1);
  assert.equal(result.cards[0].matchingPacketCount, 2);
  assert.deepEqual(result.cards[0].packetKeys, ['packet:canonical']);
  assert.deepEqual(result.cards[0].retrievalSources, ['qdrant']);
  assert.ok(!result.cards[0].rejectionReasons.includes('IDENTITY_CONFLICT'));
});

test('live binding rejects contradictory revisions even when packet keys match', async () => {
  const trace = fakeTrace({
    'search.hybrid': () => ({ results: [hit('qdrant:chunk-1', 'src/owner.ts', 0.9, 'candidate', ['qdrant'])] }),
    'atlas.packet_search': () => ({ packets: [
      { packet_key: 'packet:owner', source_ref: 'src/owner.ts', identity_lane: 'canonical', source_revision: 'sha256:rev1', workspace_revision: 'sha256:workspace' },
      { packet_key: 'packet:owner', source_ref: 'src/owner.ts', identity_lane: 'canonical', source_revision: 'sha256:rev2', workspace_revision: 'sha256:workspace' },
    ] }),
  });
  const result = await buildLiveAtlasContext({ query: 'owner', maxCards: 1 }, { trace });
  assert.equal(result.cards[0].identityBound, false);
  assert.equal(result.cards[0].identityConflict, true);
  assert.deepEqual(result.cards[0].identityConflictReasons, ['MULTIPLE_SOURCE_REVISIONS']);
  assert.equal(result.cards[0].packetKey, null);
  assert.equal(result.promptPacket, '');
});

test('different queries produce different candidate sets (the 01B failure no longer reproduces)', async () => {
  const trace = fakeTrace({
    'search.hybrid': ({ query }) => ({ results: [/hearsay/.test(query) ? hit('l1', 'src/evidence-rules.ts', 0.8) : hit('g1', 'src/graphify-writer.ts', 0.8)] }),
    'atlas.packet_search': () => ({ packets: [] }),
  });
  const legal = await buildLiveAtlasContext({ query: 'hearsay admissibility' }, { trace });
  const code = await buildLiveAtlasContext({ query: 'graphify persistence owner' }, { trace });
  assert.notDeepEqual(legal.cards.map((c) => c.sourceRef), code.cards.map((c) => c.sourceRef));
});

test('a failed identity lookup leaves that card unbound but keeps it; a missing packet is IDENTITY_UNBOUND', async () => {
  const trace = fakeTrace({
    'search.hybrid': () => ({ results: [hit('c1', 'src/a.ts', 0.5), hit('c2', 'src/b.ts', 0.4)] }),
    'atlas.packet_search': ({ source_ref }) => {
      if (source_ref === 'src/a.ts') throw Object.assign(new Error('timeout'), { code: 'TRACE_TIMEOUT' });
      return { packets: [] };
    },
  });
  const result = await buildLiveAtlasContext({ query: 'q' }, { trace });
  assert.equal(result.totalCards, 2);
  const a = result.cards.find((c) => c.sourceRef === 'src/a.ts');
  assert.equal(a.identityLookupError, 'TRACE_TIMEOUT');
  assert.ok(a.rejectionReasons.includes('IDENTITY_UNBOUND'));
  assert.equal(result.contextSource.identityBoundCount, 0);
});

test('a packet content checksum does not satisfy source revision, and proofUsable stays false', async () => {
  const trace = fakeTrace({ 'search.hybrid': () => ({ results: [hit('c1', 'src/a.ts', 0.5)] }), 'atlas.packet_search': () => ({ packets: [packet('packet:aaa', 'src/a.ts', 'abc123')] }) });
  const result = await buildLiveAtlasContext({ query: 'q' }, { trace });
  assert.ok(result.cards[0].rejectionReasons.includes('MISSING_SOURCE_REVISION'));
  assert.equal(result.cards[0].proofUsable, false);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
});

test('only an explicit source revision field removes MISSING_SOURCE_REVISION', async () => {
  const sourcePacket = {
    ...packet('packet:aaa', 'src/a.ts', 'abc123'),
    source_revision: 'sha256:source-v1',
    workspace_revision: 'sha256:workspace-v1',
    byte_start: 12,
    byte_end: 32,
  };
  const trace = fakeTrace({ 'search.hybrid': () => ({ results: [hit('c1', 'src/a.ts', 0.5)] }), 'atlas.packet_search': () => ({ packets: [sourcePacket] }) });
  const result = await buildLiveAtlasContext({ query: 'q' }, { trace });
  assert.ok(!result.cards[0].rejectionReasons.includes('MISSING_SOURCE_REVISION'));
  assert.deepEqual(result.cards[0].packetBindings, [{
    packetKey: 'packet:aaa',
    sourceRevision: 'sha256:source-v1',
    workspaceRevision: 'sha256:workspace-v1',
    sha256: 'abc123',
    byteStart: 12,
    byteEnd: 32,
  }]);
  assert.equal(result.cards[0].proofUsable, false);
});

test('no hits is a successful live answer with a warning, a domain filter is reported as not applied', async () => {
  const trace = fakeTrace({ 'search.hybrid': () => ({ results: [] }), 'atlas.packet_search': () => ({ packets: [] }) });
  const result = await buildLiveAtlasContext({ query: 'nothing matches', domainFilter: 'legal' }, { trace });
  assert.equal(result.ok, true);
  assert.equal(result.totalCards, 0);
  assert.equal(result.querySpecific, true);
  assert.ok(result.warnings.includes('LIVE_QUERY_NO_HITS'));
  assert.ok(result.warnings.includes('DOMAIN_FILTER_NOT_APPLIED'));
  assert.equal(trace.calls.filter((c) => c.name === 'atlas.packet_search').length, 0);
});

test('the payload budget truncates cards and says so', async () => {
  const many = Array.from({ length: 20 }, (_, i) => hit(`c${i}`, `src/file-${i}.ts`, 1 - i / 100, 'x'.repeat(400)));
  const trace = fakeTrace({ 'search.hybrid': () => ({ results: many }), 'atlas.packet_search': () => ({ packets: [] }) });
  const result = await buildLiveAtlasContext({ query: 'q', maxPayloadBytes: 4096 }, { trace });
  assert.equal(result.payloadTruncated, true);
  assert.ok(result.payloadBytes <= 4096);
  assert.ok(result.totalCards < 20);
});

function fakeFetch(responses) {
  const queue = [...responses];
  const fn = async () => {
    fn.calls += 1;
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return { ok: next.ok ?? true, status: next.status ?? 200, text: async () => next.text };
  };
  fn.calls = 0;
  return fn;
}
const sse = (payload) => `event: message\ndata: ${JSON.stringify({ result: { content: [{ type: 'text', text: JSON.stringify(payload) }] }, jsonrpc: '2.0', id: 1 })}\n\n`;
const fast = { retryDelayMs: 0, timeoutMs: 1000 };

test('callTraceTool parses SSE framing and retries once after an empty cold-start response', async () => {
  const fetchImpl = fakeFetch([{ text: '' }, { text: sse([{ id: 1 }]) }]);
  const result = await callTraceTool('atlas.query', { query: 'q' }, { fetchImpl, ...fast });
  assert.deepEqual(result, [{ id: 1 }]);
  assert.equal(fetchImpl.calls, 2);
});

test('callTraceTool reports typed failures instead of returning empty data', async () => {
  await assert.rejects(callTraceTool('t', {}, { fetchImpl: fakeFetch([{ text: '' }, { text: '' }]), ...fast }), { code: 'TRACE_EMPTY_RESPONSE' });
  await assert.rejects(callTraceTool('t', {}, { fetchImpl: fakeFetch([{ ok: false, status: 503, text: 'x' }, { ok: false, status: 503, text: 'x' }]), ...fast }), { code: 'TRACE_HTTP_503' });
  await assert.rejects(callTraceTool('t', {}, { fetchImpl: fakeFetch([{ text: sse({ ok: false, error: 'canceling statement due to statement timeout' }) }, { text: sse({ ok: false, error: 'x' }) }]), ...fast }), { code: 'TRACE_TOOL_ERROR' });
  await assert.rejects(callTraceTool('t', {}, { fetchImpl: fakeFetch([new Error('connect ECONNREFUSED'), new Error('connect ECONNREFUSED')]), ...fast }), { code: 'TRACE_UNREACHABLE' });
  await assert.rejects(callTraceTool('t', {}, { fetchImpl: fakeFetch([{ text: 'not json at all' }, { text: 'not json at all' }]), ...fast }), (error) => Boolean(error.code));
});

test('when live search fails it returns no static fallback evidence and names the failure', async () => {
  const failing = async () => { throw Object.assign(new Error('boom'), { code: 'TRACE_EMPTY_RESPONSE' }); };
  const result = await withPacketCwd(() => {}, () => buildAgenticRagContextLive({ query: 'q', maxCards: 3 }, { trace: failing }));
  assert.equal(result.ok, false);
  assert.equal(result.querySpecific, false);
  assert.equal(result.contextSource.kind, 'NONE');
  assert.equal(result.candidateSetBasis, 'NONE');
  assert.equal(result.totalCards, 0);
  assert.deepEqual(result.cards, []);
  assert.deepEqual(result.sourceRefs, []);
  assert.equal(result.promptPacket, '');
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.liveRetrieval.status, 'LIVE_RETRIEVAL_UNAVAILABLE');
  assert.deepEqual(result.liveRetrieval, {
    attempted: true,
    failure: 'TRACE_EMPTY_RESPONSE',
    message: 'boom',
    status: 'LIVE_RETRIEVAL_UNAVAILABLE',
  });
  assert.ok(result.warnings.includes('LIVE_RETRIEVAL_UNAVAILABLE'));
});

test('disableLive returns no evidence without calling TRACE, and live success is explicitly non-fallback', async () => {
  let called = 0;
  const trace = async (name) => { called += 1; return name === 'search.hybrid' ? { results: [hit('c1', 'src/a.ts', 0.5)] } : { packets: [] }; };
  const disabled = await withPacketCwd(() => {}, () => buildAgenticRagContextLive({ query: 'q' }, { trace, disableLive: true }));
  assert.equal(called, 0);
  assert.equal(disabled.liveRetrieval.failure, 'LIVE_DISABLED');
  assert.equal(disabled.totalCards, 0);
  assert.deepEqual(disabled.cards, []);
  assert.equal(disabled.fallbackUsed, false);
  const live = await buildAgenticRagContextLive({ query: 'q' }, { trace });
  assert.equal(live.querySpecific, true);
  assert.equal(live.liveRetrieval, undefined);
  assert.equal(live.fallbackUsed, false);
  assert.ok(!live.warnings.includes('LIVE_RETRIEVAL_UNAVAILABLE'));
});

// ── inspect: packet identity ──────────────────────────────────────────────────────────────────────
const inspectPacket = (key, ref, extra = {}) => ({ packet_key: key, source_ref: ref, feature_id: 'f.x', feature_label: 'F X', summary: '  a   summary  ', sha256: null, ...extra });
function fakeNeo4j(rowsByQuery) {
  const runs = [];
  return {
    runs,
    session: () => ({
      run: async (_cypher, params) => { runs.push(params); return { records: (rowsByQuery[params.query] ?? []).map((name) => ({ get: () => name })) }; },
      close: async () => {},
    }),
  };
}

test('classifyInspectRef separates paths, packet keys, names and empties', () => {
  assert.equal(classifyInspectRef('src/hooks.server.ts'), 'PATH');
  assert.equal(classifyInspectRef('C:\\x\\y.ts'), 'PATH');
  assert.equal(classifyInspectRef('README.md'), 'PATH');
  assert.equal(classifyInspectRef('packet:649b6f79c506'), 'PACKET_KEY');
  assert.equal(classifyInspectRef('ace:packet:b5aa13ce0a61'), 'PACKET_KEY');
  assert.equal(classifyInspectRef('graphify'), 'NAME');
  assert.equal(classifyInspectRef('retry dead letter'), 'NAME');
  assert.equal(classifyInspectRef('   '), 'EMPTY');
});

test('a path resolves to exactly one packet and is identity-bound but revision-unqualified', async () => {
  const trace = fakeTrace({ 'atlas.packet_search': () => ({ packets: [inspectPacket('packet:aaa', 'src/a.ts', { workspace_revision: 'sha256:workspace-v1' })] }) });
  const result = await findSourceRefs({ query: 'sveltekit-frontend/src/a.ts' }, { trace });
  assert.equal(trace.calls[0].args.source_ref, 'src/a.ts'); // the canonical workspace-relative form is what is searched
  const [item] = result.inspected;
  assert.equal(item.status, 'IDENTITY_BOUND');
  assert.deepEqual(item.packetKeys, ['packet:aaa']);
  assert.equal(item.packets[0].summary, 'a summary'); // whitespace collapsed
  assert.equal(item.packets[0].workspaceRevision, 'sha256:workspace-v1');
  assert.equal(result.provenance.authority, 'atlas_packets_via_trace');
  assert.equal(result.provenance.status, 'IDENTITY_BOUND_REVISION_UNQUALIFIED');
  assert.equal(result.provenance.graphRevision, null);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
});

test('only an explicit source revision on every packet qualifies the result', async () => {
  const trace = fakeTrace({ 'atlas.packet_search': () => ({ packets: [inspectPacket('packet:aaa', 'src/a.ts', { source_revision: 'sha256:rev1', workspace_revision: 'sha256:workspace1' })] }) });
  const result = await findSourceRefs({ refs: ['src/a.ts'] }, { trace });
  assert.equal(result.provenance.status, 'IDENTITY_BOUND_REVISION_QUALIFIED');
  const withChecksumOnly = fakeTrace({ 'atlas.packet_search': () => ({ packets: [inspectPacket('packet:aaa', 'src/a.ts', { sha256: 'abc' })] }) });
  const second = await findSourceRefs({ refs: ['src/a.ts'] }, { trace: withChecksumOnly });
  assert.equal(second.provenance.status, 'IDENTITY_BOUND_REVISION_UNQUALIFIED');
  const withoutWorkspaceRevision = fakeTrace({ 'atlas.packet_search': () => ({ packets: [inspectPacket('packet:aaa', 'src/a.ts', { source_revision: 'sha256:rev1' })] }) });
  const third = await findSourceRefs({ refs: ['src/a.ts'] }, { trace: withoutWorkspaceRevision });
  assert.equal(third.provenance.status, 'IDENTITY_BOUND_REVISION_UNQUALIFIED');
});

test('same packet key with contradictory revisions is an identity conflict', async () => {
  const trace = fakeTrace({ 'atlas.packet_search': () => ({ packets: [
    inspectPacket('packet:aaa', 'src/a.ts', { source_revision: 'sha256:rev1', workspace_revision: 'sha256:workspace1' }),
    inspectPacket('packet:aaa', 'src/a.ts', { source_revision: 'sha256:rev2', workspace_revision: 'sha256:workspace1' }),
  ] }) });
  const result = await findSourceRefs({ refs: ['src/a.ts'] }, { trace });
  assert.equal(result.inspected[0].status, 'IDENTITY_CONFLICT');
  assert.deepEqual(result.inspected[0].identityConflictReasons, ['MULTIPLE_SOURCE_REVISIONS']);
  assert.equal(result.provenance.status, 'UNRESOLVED');
});

test('identical repeated packet readbacks remain bound and revision-qualified', async () => {
  const packet = inspectPacket('packet:aaa', 'src/a.ts', { source_revision: 'sha256:rev1', workspace_revision: 'sha256:workspace1' });
  const trace = fakeTrace({ 'atlas.packet_search': () => ({ packets: [packet, { ...packet }] }) });
  const result = await findSourceRefs({ refs: ['src/a.ts'] }, { trace });
  assert.equal(result.inspected[0].status, 'IDENTITY_BOUND');
  assert.equal(result.provenance.status, 'IDENTITY_BOUND_REVISION_QUALIFIED');
});

test('two packets for one file is a conflict that is reported, never resolved by picking one', async () => {
  const trace = fakeTrace({ 'atlas.packet_search': () => ({ packets: [inspectPacket('packet:649b', 'sveltekit-frontend/src/hooks.server.ts'), inspectPacket('ace:packet:b5aa', 'src/hooks.server.ts')] }) });
  const result = await findSourceRefs({ query: 'src/hooks.server.ts' }, { trace });
  assert.equal(result.inspected[0].status, 'IDENTITY_CONFLICT');
  assert.deepEqual([...result.inspected[0].packetKeys].sort(), ['ace:packet:b5aa', 'packet:649b']);
  assert.equal(result.provenance.status, 'UNRESOLVED');
});

test('packets for other files returned by a fuzzy search are filtered out; none left means NO_PACKET', async () => {
  const trace = fakeTrace({ 'atlas.packet_search': () => ({ packets: [inspectPacket('packet:zzz', 'src/other.ts')] }) });
  const result = await findSourceRefs({ query: 'src/a.ts' }, { trace });
  assert.equal(result.inspected[0].status, 'NO_PACKET');
  assert.deepEqual(result.inspected[0].packets, []);
});

test('one failed lookup does not fail the others, and the failure is named', async () => {
  const trace = fakeTrace({
    'atlas.packet_search': ({ source_ref }) => {
      if (source_ref === 'src/bad.ts') throw Object.assign(new Error('x'), { code: 'TRACE_EMPTY_RESPONSE' });
      return { packets: [inspectPacket('packet:ok', source_ref)] };
    },
  });
  const result = await findSourceRefs({ refs: ['src/ok.ts', 'src/bad.ts'] }, { trace });
  const byRef = Object.fromEntries(result.inspected.map((i) => [i.ref, i]));
  assert.equal(byRef['src/ok.ts'].status, 'IDENTITY_BOUND');
  assert.equal(byRef['src/bad.ts'].status, 'LOOKUP_FAILED');
  assert.equal(byRef['src/bad.ts'].failure, 'TRACE_EMPTY_RESPONSE');
  assert.equal(result.provenance.status, 'UNRESOLVED');
});

test('refs and query are deduplicated and capped at ten with the overflow reported', async () => {
  const trace = fakeTrace({ 'atlas.packet_search': ({ source_ref }) => ({ packets: [inspectPacket(`packet:${source_ref}`, source_ref)] }) });
  const refs = Array.from({ length: 12 }, (_, i) => `src/f${i}.ts`);
  const result = await findSourceRefs({ query: 'src/f0.ts', refs }, { trace });
  assert.equal(result.inspected.length, 10);
  assert.equal(result.lookup.truncatedInputs, 2);
  assert.equal(trace.calls.length, 10);
});

test('a plain name uses the legacy Neo4j SourceRef name search and never calls TRACE', async () => {
  const trace = fakeTrace({});
  const driver = fakeNeo4j({ graphify: ['graphify_edges', 'graphify_symbols'] });
  const result = await findSourceRefs({ query: 'graphify' }, { trace, driver });
  assert.equal(trace.calls.length, 0);
  assert.deepEqual(result.sourceRefs, ['graphify_edges', 'graphify_symbols']);
  assert.equal(result.inspected[0].status, 'NAME_MATCHED');
  assert.equal(result.provenance.authority, 'neo4j_projection');
  assert.equal(result.provenance.status, 'UNRESOLVED');
});

test('a packet key is reported as unsupported instead of guessed, and empty input is rejected', async () => {
  const trace = fakeTrace({});
  const result = await findSourceRefs({ refs: ['packet:649b6f79c506'] }, { trace });
  assert.equal(result.inspected[0].status, 'UNSUPPORTED_REF_KIND');
  assert.equal(result.inspected[0].failure, 'PACKET_KEY_LOOKUP_NOT_AVAILABLE');
  assert.equal(trace.calls.length, 0);
  const empty = await findSourceRefs({}, { trace });
  assert.equal(empty.lookup.failure, 'EMPTY_INSPECT_INPUT');
});

test('findDependencies forwards direction=incoming to the Atlas graph resolver', async () => {
  const seenRequests = [];
  const sourceRev = `sha256:${'a'.repeat(64)}`;
  const workspaceRev = `sha256:${'b'.repeat(64)}`;
  const graphRev = `sha256:${'c'.repeat(64)}`;
  const result = await findDependencies(
    { target: 'src/lib/leaf.ts', direction: 'incoming' },
    {
      sourceIndexResolver: async (_target, keys) => ({
        ok: true,
        identity: { sourceRef: keys.canonical, sourceRevision: sourceRev, workspaceRevision: workspaceRev },
      }),
      graphResolver: async (req) => {
        seenRequests.push(req);
        return {
          target: req.target,
          direction: req.direction,
          graphRevision: graphRev,
          sourceRevision: sourceRev,
          workspaceRevision: workspaceRev,
          canonicalAuthority: false,
          writesPerformed: false,
          dependencies: [
            {
              dep: 'src/lib/caller.ts',
              depCanonical: 'src/lib/caller.ts',
              type: 'IMPORTS',
              evidenceRefs: ['ast:src/lib/caller.ts:bytes:0-24'],
              pageRankPrior: 0.42,
            },
          ],
          evidenceRefs: ['ast:src/lib/caller.ts:bytes:0-24'],
        };
      },
    },
  );
  assert.equal(seenRequests.length, 1);
  assert.equal(seenRequests[0].direction, 'incoming');
  assert.equal(result.lookup.failure, null);
  assert.equal(result.dependencies.length, 1);
  assert.equal(result.dependencies[0].dep, 'src/lib/caller.ts');
  assert.equal(result.provenance.authority, 'atlas_typed_graph_projection');
});
