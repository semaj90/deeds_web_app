import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyInspectRef, findSourceRefs, buildAgenticRagContext, buildAgenticRagContextLive, buildLiveAtlasContext, callTraceTool, buildCodebaseFileLookupKeys, collapseDependencyRows, findDependencies } from './atlas-tools-mcp.mjs';

const ROOT = 'C:/Users/james/Videos/deeds-web-app';

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

function fakeDriver(scripted) {
  const queries = [];
  return {
    queries,
    session() {
      return {
        async run(cypher, params) {
          queries.push({ cypher, params });
          const rows = scripted.shift() ?? [];
          return { records: rows.map((row) => ({ toObject: () => row })) };
        },
        async close() {},
      };
    },
  };
}

test('findDependencies reaches both families in one query and never claims canonical authority', async () => {
  const driver = fakeDriver([[
    { nodePath: 'src/a.ts', flagged: null, type: 'IMPORTS', depPath: 'src/b.ts', depKind: 'CodebaseFile' },
    { nodeFilePath: `${ROOT}/sveltekit-frontend/src/a.ts`, flagged: 'ABSOLUTE_DUPLICATE', type: 'CALLS', depKind: 'Function', depName: 'helper' },
  ]]);
  const result = await findDependencies({ target: 'sveltekit-frontend/src/a.ts' }, { driver });
  assert.equal(driver.queries.length, 1, 'phase A hit, so no fallback scan');
  assert.deepEqual(driver.queries[0].params.pathKeys, ['src/a.ts']);
  assert.equal(result.lookup.phase, 'A');
  assert.equal(result.lookup.failure, null);
  assert.deepEqual(result.lookup.nodesMatched.map((n) => n.family).sort(), ['filePath', 'path']);
  assert.equal(result.dependencies.length, 2);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
  assert.equal(result.provenance.graphRevision, null);
  assert.equal(result.provenance.status, 'UNRESOLVED'); // a projection hit is not admitted evidence
});

test('a miss falls back to the case-insensitive scan, and a second miss is reported as PROJECTION_MISSING_FILE', async () => {
  const driver = fakeDriver([[], []]);
  const result = await findDependencies({ target: 'src/brand-new-file.ts' }, { driver });
  assert.equal(driver.queries.length, 2);
  assert.match(driver.queries[1].cypher, /toLower/);
  assert.equal(result.lookup.phase, 'B');
  assert.equal(result.lookup.failure, 'PROJECTION_MISSING_FILE');
  assert.deepEqual(result.dependencies, []);
});

test('a node with no outgoing edge is distinguished from a missing node', async () => {
  const driver = fakeDriver([[{ nodePath: 'src/leaf.ts', flagged: null, type: null }]]);
  const result = await findDependencies({ target: 'src/leaf.ts' }, { driver });
  assert.equal(result.lookup.failure, 'NO_OUTGOING_EDGES');
  assert.equal(result.lookup.nodesMatched.length, 1);
});

test('the row cap truncates and says so', async () => {
  const many = Array.from({ length: 600 }, (_, i) => ({ nodePath: 'src/hub.ts', flagged: null, type: 'IMPORTS', depPath: `src/dep-${i}.ts`, depKind: 'CodebaseFile' }));
  const driver = fakeDriver([many]);
  const result = await findDependencies({ target: 'src/hub.ts' }, { driver });
  assert.equal(result.lookup.truncated, true);
  assert.equal(result.dependencies.length, 500);
  assert.equal(result.lookup.rowCap, 500);
});

test('an empty target is rejected before any query is sent', async () => {
  const driver = fakeDriver([]);
  const result = await findDependencies({ target: '  ' }, { driver });
  assert.equal(driver.queries.length, 0);
  assert.equal(result.lookup.failure, 'EMPTY_TARGET');
});

test('an exact-key hit in only one family triggers the case-insensitive scan, whose superset replaces the partial result', async () => {
  const partial = [{ nodePath: 'src/lib/Example.ts', flagged: null, type: 'IMPORTS', depPath: 'src/b.ts', depKind: 'CodebaseFile' }];
  const superset = [
    ...partial,
    { nodeFilePath: `${ROOT}/sveltekit-frontend/src/lib/Example.ts`, flagged: 'ABSOLUTE_DUPLICATE', type: 'CALLS', depKind: 'Function', depName: 'helper' },
  ];
  const driver = fakeDriver([partial, superset]);
  const result = await findDependencies({ target: 'SRC/LIB/EXAMPLE.TS' }, { driver });
  assert.equal(driver.queries.length, 2);
  assert.equal(result.lookup.phase, 'B');
  assert.deepEqual(result.lookup.nodesMatched.map((n) => n.family).sort(), ['filePath', 'path']);
  assert.deepEqual(result.dependencies.map((d) => d.type).sort(), ['CALLS', 'IMPORTS']);
});

test('a file found in both families on the first query does not pay for the second scan', async () => {
  const both = [
    { nodePath: 'src/a.ts', flagged: null, type: 'IMPORTS', depPath: 'src/b.ts', depKind: 'CodebaseFile' },
    { nodeFilePath: 'sveltekit-frontend/src/a.ts', flagged: null, type: 'CALLS', depKind: 'Function', depName: 'f' },
  ];
  const driver = fakeDriver([both]);
  const result = await findDependencies({ target: 'src/a.ts' }, { driver });
  assert.equal(driver.queries.length, 1);
  assert.equal(result.lookup.phase, 'A');
});

test('a symbol name is reported as TARGET_NOT_A_PATH, not as a missing file', async () => {
  const driver = fakeDriver([[], []]);
  const result = await findDependencies({ target: 'planGraphifyEdgeReplayV1' }, { driver });
  assert.equal(result.lookup.failure, 'TARGET_NOT_A_PATH');
  const missing = await findDependencies({ target: 'src/not-there.ts' }, { driver: fakeDriver([[], []]) });
  assert.equal(missing.lookup.failure, 'PROJECTION_MISSING_FILE');
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
const hit = (id, p, score, content = 'snippet text') => ({ id, path: p, score, content, lenses: [] });
const packet = (key, ref, sha) => ({ packet_key: key, source_ref: ref, feature_id: 'f', sha256: sha ?? null });

test('live cards are query-specific, deduplicated per file, ordered by score and bound to packet identity', async () => {
  const trace = fakeTrace({
    'atlas.query': () => [hit('c1', 'src/a.ts', 0.4, 'a one'), hit('c2', 'sveltekit-frontend/src/b.ts', 0.9, 'b best'), hit('c3', 'src/a.ts', 0.7, 'a better')],
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
  assert.match(result.promptPacket, /packet: packet:aaa/);
  assert.match(result.promptPacket, /packet: unbound/);
});

test('different queries produce different candidate sets (the 01B failure no longer reproduces)', async () => {
  const trace = fakeTrace({
    'atlas.query': ({ query }) => (/hearsay/.test(query) ? [hit('l1', 'src/evidence-rules.ts', 0.8)] : [hit('g1', 'src/graphify-writer.ts', 0.8)]),
    'atlas.packet_search': () => ({ packets: [] }),
  });
  const legal = await buildLiveAtlasContext({ query: 'hearsay admissibility' }, { trace });
  const code = await buildLiveAtlasContext({ query: 'graphify persistence owner' }, { trace });
  assert.notDeepEqual(legal.cards.map((c) => c.sourceRef), code.cards.map((c) => c.sourceRef));
});

test('a failed identity lookup leaves that card unbound but keeps it; a missing packet is IDENTITY_UNBOUND', async () => {
  const trace = fakeTrace({
    'atlas.query': () => [hit('c1', 'src/a.ts', 0.5), hit('c2', 'src/b.ts', 0.4)],
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
  const trace = fakeTrace({ 'atlas.query': () => [hit('c1', 'src/a.ts', 0.5)], 'atlas.packet_search': () => ({ packets: [packet('packet:aaa', 'src/a.ts', 'abc123')] }) });
  const result = await buildLiveAtlasContext({ query: 'q' }, { trace });
  assert.ok(result.cards[0].rejectionReasons.includes('MISSING_SOURCE_REVISION'));
  assert.equal(result.cards[0].proofUsable, false);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
});

test('only an explicit source revision field removes MISSING_SOURCE_REVISION', async () => {
  const sourcePacket = { ...packet('packet:aaa', 'src/a.ts', 'abc123'), source_revision: 'sha256:source-v1' };
  const trace = fakeTrace({ 'atlas.query': () => [hit('c1', 'src/a.ts', 0.5)], 'atlas.packet_search': () => ({ packets: [sourcePacket] }) });
  const result = await buildLiveAtlasContext({ query: 'q' }, { trace });
  assert.ok(!result.cards[0].rejectionReasons.includes('MISSING_SOURCE_REVISION'));
  assert.equal(result.cards[0].proofUsable, false);
});

test('no hits is a successful live answer with a warning, a domain filter is reported as not applied', async () => {
  const trace = fakeTrace({ 'atlas.query': () => [], 'atlas.packet_search': () => ({ packets: [] }) });
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
  const trace = fakeTrace({ 'atlas.query': () => many, 'atlas.packet_search': () => ({ packets: [] }) });
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
  const trace = async (name) => { called += 1; return name === 'atlas.query' ? [hit('c1', 'src/a.ts', 0.5)] : { packets: [] }; };
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
  const trace = fakeTrace({ 'atlas.packet_search': () => ({ packets: [inspectPacket('packet:aaa', 'src/a.ts')] }) });
  const result = await findSourceRefs({ query: 'sveltekit-frontend/src/a.ts' }, { trace });
  assert.equal(trace.calls[0].args.source_ref, 'src/a.ts'); // the canonical workspace-relative form is what is searched
  const [item] = result.inspected;
  assert.equal(item.status, 'IDENTITY_BOUND');
  assert.deepEqual(item.packetKeys, ['packet:aaa']);
  assert.equal(item.packets[0].summary, 'a summary'); // whitespace collapsed
  assert.equal(result.provenance.authority, 'atlas_packets_via_trace');
  assert.equal(result.provenance.status, 'IDENTITY_BOUND_REVISION_UNQUALIFIED');
  assert.equal(result.provenance.graphRevision, null);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
});

test('only an explicit source revision on every packet qualifies the result', async () => {
  const trace = fakeTrace({ 'atlas.packet_search': () => ({ packets: [inspectPacket('packet:aaa', 'src/a.ts', { source_revision: 'sha256:rev1' })] }) });
  const result = await findSourceRefs({ refs: ['src/a.ts'] }, { trace });
  assert.equal(result.provenance.status, 'IDENTITY_BOUND_REVISION_QUALIFIED');
  const withChecksumOnly = fakeTrace({ 'atlas.packet_search': () => ({ packets: [inspectPacket('packet:aaa', 'src/a.ts', { sha256: 'abc' })] }) });
  const second = await findSourceRefs({ refs: ['src/a.ts'] }, { trace: withChecksumOnly });
  assert.equal(second.provenance.status, 'IDENTITY_BOUND_REVISION_UNQUALIFIED');
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
