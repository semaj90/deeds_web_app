import { describe, expect, it } from 'vitest';
import { makeCbmTextSearchHandlerV1, type CbmTextReceiptV1, decideCbmFallbackV1, qualifyCbmObservationV1, makeAstHandlerV1, makeCacheLookupHandlerV1, makeCbmCodeSnippetHandlerV1, makeCbmDefinitionHandlerV1, makeCbmFileOutlineHandlerV1, makeCbmImportCandidateHandlerV1, makeCandidateLaneHandlerV1, makeLexicalHandlerV1, makePacketReadHandlerV1, makeReadOnlyContextCacheLoaderV1, type AstExtractLikeV1, type CacheLookupOutputV1, type CandidateLaneOutputV1, type CbmImportCandidateReceiptV1, type CbmSnippetReceiptV1, type CbmWorktreeReceiptV1, type CbmOutlineReceiptV1, type PacketReadOutputV1, type LexicalOutputV1 } from './context-dag-handlers-v1.js';
import { buildContextToolDagFromPreAgentStages, executeContextToolDagV1 } from './context-tool-dag-contracts.js';
import { AstGrepStructuralCandidateV1Schema } from '../language/ast-grep-structural-topk.js';

const meta = { workflowId: 'wf', requestId: 'rq', workspaceRevision: 'w1', graphRevision: 'g1', producerRevision: 'p1' };

function astCandidate(input: Parameters<AstExtractLikeV1>[0], values: { name: string; startByte: number; endByte: number }) {
  return AstGrepStructuralCandidateV1Schema.parse({
    schema: 'atlas.ast-grep-structural-candidate.v1',
    entityKind: 'FUNCTION', declarationForm: 'FUNCTION_DECLARATION', name: values.name,
    nodeKind: 'function_declaration', signature: values.name, isExported: false, isAsync: false,
    sourceRef: input.sourceRef, filePath: input.filePath,
    startByte: values.startByte, endByte: values.endByte, startLine: 1, startColumn: 0, endLine: 1, endColumn: values.endByte,
    treeNodeId: null, symbolVersionId: null, workspaceRevision: input.workspaceRevision, sourceRevision: input.sourceRevision,
    engine: 'AST_GREP_NAPI', structuralMatchExactForDeclaredRule: true, requiresCanonicalTreeJoin: true,
    logicalLane: 'ast', logicalLaneVoteAdded: false, canonicalWritesAllowed: false, producerRevision: input.producerRevision,
  });
}

describe('context DAG handlers (CONTEXT-DAG-01)', () => {
  it('lexical: one literal search per symbol, started together, merged and ranked by file', async () => {
    const seen: string[] = [];
    let active = 0; let peak = 0;
    const handler = makeLexicalHandlerV1({
      symbols: ['buildA', 'buildB', 'buildA', ' '],
      search: async (i) => {
        seen.push(i.pattern); active += 1; peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 20)); active -= 1;
        expect(i.fixedStrings).toBe(true);
        return i.pattern === 'buildA'
          ? { matches: [{ filePath: './src\\a.ts', lineNumber: 3 }, { filePath: 'src/b.ts', lineNumber: 9 }], totalMatches: 2, truncated: false }
          : { matches: [{ filePath: 'src/a.ts', lineNumber: 7 }], totalMatches: 1, truncated: true };
      },
    });
    const out = (await handler({ nodeId: 'LEXICAL', inputs: {} })) as LexicalOutputV1;
    expect(seen.sort()).toEqual(['buildA', 'buildB']);
    expect(peak).toBe(2);
    expect(out.files[0]).toEqual({ filePath: 'src/a.ts', lineNumbers: [3, 7] });
    expect(out.totalMatches).toBe(3);
    expect(out.truncated).toBe(true);
    expect(out.canonicalAuthority).toBe(false);
  });

  it('ast: parses only TS/JS files with a revision, filters to wanted symbols, reports skips', async () => {
    const handler = makeAstHandlerV1({
      symbols: ['buildA'],
      producerRevision: 'p1',
      readFile: async (f) => { if (f === 'src/bad.ts') throw new Error('nope'); return `// ${f}`; },
      resolveSourceBinding: (f) => (f === 'src/norev.ts' ? null : { sourceRef: `repo:${f}`, workspaceRevision: 'w', sourceRevision: `s:${f}` }),
      extract: async (i) => (i.filePath === 'src/boom.ts'
        ? Promise.reject(new Error('parse'))
        : [astCandidate(i, { name: 'buildA', startByte: 0, endByte: 9 }), astCandidate(i, { name: 'other', startByte: 2, endByte: 5 })]),
    });
    const lexical: LexicalOutputV1 = {
      files: ['src/a.ts', 'src/readme.md', 'src/norev.ts', 'src/bad.ts', 'src/boom.ts'].map((filePath) => ({ filePath, lineNumbers: [1] })),
      symbols: ['buildA'], totalMatches: 5, truncated: false, canonicalAuthority: false,
    };
    const out = (await handler({ nodeId: 'AST_STRUCTURAL_REFINE', inputs: { LEXICAL: lexical } })) as { declarations: Array<{ filePath: string; name: string; sourceRef: string; sourceRevision: string; workspaceRevision: string; spanSha256: string; logicalLaneVoteAdded: false }>; matchedLexicalFilePaths: string[]; skipped: Array<{ filePath: string; reason: string }> };
    expect(out.declarations.map((d) => `${d.filePath}:${d.name}`)).toEqual(['src/a.ts:buildA']);
    expect(out.declarations[0]).toMatchObject({ sourceRef: 'repo:src/a.ts', sourceRevision: 's:src/a.ts', workspaceRevision: 'w', logicalLaneVoteAdded: false });
    expect(out.declarations[0]?.spanSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(out.matchedLexicalFilePaths).toEqual(['src/a.ts']);
    expect(Object.fromEntries(out.skipped.map((s) => [s.filePath, s.reason]))).toEqual({
      'src/readme.md': 'NOT_TS_JS', 'src/norev.ts': 'NO_SOURCE_BINDING', 'src/bad.ts': 'READ_FAILED', 'src/boom.ts': 'EXTRACT_FAILED',
    });
  });

  it('ast-grep refinement rejects spans beyond the exact source bytes', async () => {
    const handler = makeAstHandlerV1({
      symbols: [],
      producerRevision: 'p1',
      readFile: async () => 'short',
      resolveSourceBinding: () => ({ sourceRef: 'repo:src/a.ts', workspaceRevision: 'w', sourceRevision: 'sha256:source' }),
      extract: async (input) => [astCandidate(input, { name: 'buildA', startByte: 0, endByte: 99 })],
    });
    const out = await handler({ nodeId: 'AST_STRUCTURAL_REFINE', inputs: {
      LEXICAL: { files: [{ filePath: 'src/a.ts', lineNumbers: [1] }], symbols: ['buildA'], totalMatches: 1, truncated: false, canonicalAuthority: false },
    } }) as { declarations: unknown[]; skipped: Array<{ reason: string }> };
    expect(out.declarations).toEqual([]);
    expect(out.skipped).toEqual([{ filePath: 'src/a.ts', reason: 'INVALID_SPAN' }]);
  });

  it('ast without LEXICAL output fails loudly (never fabricates input)', async () => {
    const handler = makeAstHandlerV1({ symbols: [], producerRevision: 'p', readFile: async () => '', resolveSourceBinding: () => null, extract: async () => [] });
    await expect(handler({ nodeId: 'AST', inputs: {} })).rejects.toThrow(/LEXICAL/);
  });

  it('executes lexical-dependent ast-grep refinement through the shared read-only DAG', async () => {
    const source = 'export function target() {}';
    const dag = buildContextToolDagFromPreAgentStages({
      ...meta,
      stages: ['QUERY_ANALYSIS', 'LEXICAL', 'AST_STRUCTURAL_REFINE'],
    });
    const receipt = await executeContextToolDagV1(dag, {
      QUERY_ANALYSIS: async () => ({ query: 'target' }),
      LEXICAL: makeLexicalHandlerV1({
        symbols: ['target'],
        search: async () => ({ matches: [{ filePath: 'src/a.ts', lineNumber: 1 }], totalMatches: 1, truncated: false }),
      }),
      AST_STRUCTURAL_REFINE: makeAstHandlerV1({
        symbols: ['target'],
        producerRevision: 'ast-grep-fixture-v1',
        readFile: async () => source,
        resolveSourceBinding: (filePath) => filePath === 'src/a.ts'
          ? { sourceRef: 'repo:src/a.ts', workspaceRevision: 'w1', sourceRevision: 'sha256:source-a' }
          : null,
        extract: async (input) => [astCandidate(input, { name: 'target', startByte: 0, endByte: Buffer.byteLength(source, 'utf8') })],
      }),
      EXACT_PROMOTION: async ({ inputs }) => Object.keys(inputs),
      ACE_PACKET_ASSEMBLY: async () => ({ status: 'FIXTURE_ONLY' }),
    });

    expect(receipt.ok).toBe(true);
    expect(receipt.levels).toContainEqual(['LEXICAL']);
    expect(receipt.levels).toContainEqual(['AST_STRUCTURAL_REFINE']);
    expect(receipt.nodes.find((node) => node.nodeId === 'AST_STRUCTURAL_REFINE')?.status).toBe('OK');
    expect(receipt.outputs.AST_STRUCTURAL_REFINE).toMatchObject({
      schema: 'atlas.ast-grep-refinement-output.v1',
      producerRevision: 'ast-grep-fixture-v1',
      canonicalAuthority: false,
      declarations: [{
        name: 'target',
        sourceRef: 'repo:src/a.ts',
        sourceRevision: 'sha256:source-a',
        workspaceRevision: 'w1',
        logicalLaneVoteAdded: false,
      }],
    });
    expect(dag.canonicalWritesAllowed).toBe(false);
  });

  it('candidate lane adapter returns compact qualified refs only (no content/summary) and flags unqualified hits', async () => {
    const handler = makeCandidateLaneHandlerV1({
      lane: 'ast', query: 'buildA', maxHits: 2,
      retrieve: async () => [
        { packetKey: 'k1', sourceRef: 'src\\a.ts', score: 0.8, workspaceRevision: 'w', sourceRevision: 's', identityStatus: 'canonical', content: 'SECRET BODY', summary: 'x' } as never,
        { packetKey: 'k2', sourceRef: 'src/b.ts', score: 0.9, workspaceRevision: 'w', sourceRevision: null },
        { packetKey: 'k3', sourceRef: 'src/c.ts', score: 0.1, workspaceRevision: 'w', sourceRevision: 's' },
      ],
    });
    const out = (await handler({ nodeId: 'AST', inputs: {} })) as CandidateLaneOutputV1;
    expect(out.hits.map((h) => h.canonicalId)).toEqual(['k2', 'k1']);
    expect(out.hits[1].sourceRef).toBe('src/a.ts');
    expect(out.hits.map((h) => h.qualification)).toEqual(['UNQUALIFIED', 'REVISION_QUALIFIED']);
    expect(out.qualification).toBe('UNQUALIFIED');
    expect(out.totalCandidates).toBe(3);
    expect(JSON.stringify(out)).not.toContain('SECRET BODY');
    const empty = (await makeCandidateLaneHandlerV1({ lane: 'ast', query: 'q', retrieve: async () => [] })({ nodeId: 'AST', inputs: {} })) as CandidateLaneOutputV1;
    expect(empty.qualification).toBe('EMPTY');
  });

  it('end to end through the executor: LEXICAL and AST candidate lanes run side by side', async () => {
    const dag = buildContextToolDagFromPreAgentStages({ ...meta, stages: ['QUERY_ANALYSIS', 'LEXICAL', 'AST', 'ACE_PACKET_ASSEMBLY'] });
    const cand = (id: string) => async () => [{ packetKey: id, sourceRef: `src/${id}.ts`, score: 1, workspaceRevision: 'w', sourceRevision: 's' }];
    const receipt = await executeContextToolDagV1(dag, {
      QUERY_ANALYSIS: async () => 'qa',
      LEXICAL: makeCandidateLaneHandlerV1({ lane: 'exact', query: 'buildA', retrieve: cand('lex') }),
      AST: makeCandidateLaneHandlerV1({ lane: 'ast', query: 'buildA', retrieve: cand('ast') }),
      EXACT_PROMOTION: async ({ inputs }) => Object.keys(inputs),
      ACE_PACKET_ASSEMBLY: async () => 'packet',
    });
    expect(receipt.ok).toBe(true);
    expect(receipt.levels.map((l) => l.join(','))).toEqual(['QUERY_ANALYSIS', 'AST,LEXICAL', 'EXACT_PROMOTION', 'ACE_PACKET_ASSEMBLY']);
    expect(receipt.outputs.EXACT_PROMOTION).toEqual(['LEXICAL', 'AST']);
  });
});

describe('cache lookup handler (CTX-HANDLER-CACHE-01)', () => {
  const ident = { repoGitSha: 'abc123', corpusHash: 'corpus:9f', graphSnapshotHash: 'graph:7c' };
  const mk = (identity: Partial<typeof ident>, load: () => Promise<{ meta: { source: string; estimatedPrefixTokens: number; deltaFields: string[] } } | null>) => {
    let built = 0; let loaded = 0;
    const handler = makeCacheLookupHandlerV1({
      query: 'q', identity,
      buildState: (i) => { built += 1; return { cacheKey: `key:${i.repoGitSha}:${i.corpusHash}:${i.graphSnapshotHash}` }; },
      load: async () => { loaded += 1; return load(); },
    });
    return { handler, counts: () => ({ built, loaded }) };
  };

  it('refuses sentinel/missing identity without calling the owner (fail closed)', async () => {
    const { handler, counts } = mk({ repoGitSha: 'unknown', corpusHash: 'corpus:9f' }, async () => null);
    const out = (await handler({ nodeId: 'CACHE_LOOKUP', inputs: {} })) as CacheLookupOutputV1;
    expect(out.status).toBe('UNQUALIFIED_KEY');
    expect(out.missingIdentity).toEqual(['repoGitSha', 'graphSnapshotHash']);
    expect(counts()).toEqual({ built: 0, loaded: 0 });
  });

  it('qualified key: HIT returns compact metadata only, MISS returns the key', async () => {
    const hit = (await mk(ident, async () => ({ meta: { source: 'redis', estimatedPrefixTokens: 900, deltaFields: ['queryHash'] } })).handler({ nodeId: 'CACHE_LOOKUP', inputs: {} })) as CacheLookupOutputV1;
    expect(hit).toMatchObject({ status: 'HIT', source: 'redis', estimatedPrefixTokens: 900, deltaFields: ['queryHash'] });
    expect(hit.cacheKey).toBe('key:abc123:corpus:9f:graph:7c');
    const miss = (await mk(ident, async () => null).handler({ nodeId: 'CACHE_LOOKUP', inputs: {} })) as CacheLookupOutputV1;
    expect(miss.status).toBe('MISS');
    expect(miss.cacheKey).toBe('key:abc123:corpus:9f:graph:7c');
  });
});

describe('read-only cache loader + packet read handler (CTX-HANDLER-PACKET-01)', () => {
  it('read-only loader maps a hit to compact meta and a miss to null, calling only the getter', async () => {
    const calls: string[] = [];
    const load = makeReadOnlyContextCacheLoaderV1({
      getWithSource: async (k) => { calls.push(k); return k === 'hit' ? { source: 'postgres', pack: { prefixTokensEstimated: 512 } } : { source: 'miss', pack: null }; },
    });
    expect(await load({ cacheKey: 'hit' })).toEqual({ meta: { source: 'postgres', estimatedPrefixTokens: 512, deltaFields: [] } });
    expect(await load({ cacheKey: 'nope' })).toBeNull();
    expect(calls).toEqual(['hit', 'nope']);
  });

  it('packet read handler reads only (no assemble), caps refs, dedupes, never fabricates revision qualification', async () => {
    const reads: string[] = [];
    const handler = makePacketReadHandlerV1({
      maxRefs: 2,
      selectSourceRefs: () => [String.raw`src\a.ts`, 'src/a.ts', 'src/b.ts', 'src/c.ts'],
      readBySourceRef: async (ref) => {
        reads.push(ref);
        return ref === 'src/a.ts'
          ? { packet_id: 'p1', source_refs: [ref], ranked_cards: [1, 2, 3], prompt_context: 'x'.repeat(5000), ttl_seconds: 60, degraded: false }
          : null;
      },
    });
    const out = (await handler({ nodeId: 'ACE_PACKET_ASSEMBLY', inputs: {} })) as PacketReadOutputV1;
    expect(reads.sort()).toEqual(['src/a.ts', 'src/b.ts']);
    expect(out.foundCount).toBe(1);
    expect(out.items[0]).toMatchObject({ found: true, packetId: 'p1', rankedCardCount: 3, promptContextChars: 5000, qualification: 'UNQUALIFIED_NO_REVISION' });
    expect(out.items[0].promptContext).toBeUndefined();
    expect(out.items[1]).toMatchObject({ found: false, qualification: 'NOT_FOUND' });
    expect(out.writesPerformed).toBe(false);
  });

  it('prompt context is returned only on request and is truncated', async () => {
    const handler = makePacketReadHandlerV1({
      includePromptContext: true, maxPromptChars: 10,
      selectSourceRefs: () => ['src/a.ts'],
      readBySourceRef: async () => ({ packet_id: 'p', source_refs: [], ranked_cards: [], prompt_context: 'y'.repeat(100), ttl_seconds: 1, degraded: true }),
    });
    const out = (await handler({ nodeId: 'P', inputs: {} })) as PacketReadOutputV1;
    expect(out.items[0].promptContext).toBe('y'.repeat(10));
    expect(out.items[0].degraded).toBe(true);
  });
});

describe('PRE_AGENT_STAGE_OWNER_MAP_V1 (CTX-HANDLERS-01 ledger)', () => {
  it('covers every stage the pre-agent selector can emit, and READY stages name an adapter that exists', async () => {
    const mod = await import('./context-dag-handlers-v1.js');
    const dag = buildContextToolDagFromPreAgentStages({
      workflowId: 'w', requestId: 'r', workspaceRevision: 'w1', graphRevision: 'g1', producerRevision: 'p',
      stages: ['QUERY_ANALYSIS', 'CACHE_LOOKUP', 'LEXICAL', 'AST', 'MEMORY_PRIOR', 'SEMANTIC_ROUTE', 'GRAPH_EXPANSION', 'ACE_PACKET_ASSEMBLY'],
    });
    for (const n of dag.nodes) {
      if (n.nodeId === 'EXACT_PROMOTION') continue;
      expect(mod.PRE_AGENT_STAGE_OWNER_MAP_V1[n.nodeId], n.nodeId).toBeDefined();
    }
    for (const [stage, entry] of Object.entries(mod.PRE_AGENT_STAGE_OWNER_MAP_V1)) {
      if (entry.status === 'READY' || entry.status === 'READY_WITH_CAVEAT') {
        for (const name of entry.adapter!.split(' + ')) expect(typeof (mod as Record<string, unknown>)[name], `${stage}:${name}`).toBe('function');
      } else {
        expect(entry.adapter).toBeNull();
      }
    }
    expect(Object.entries(mod.PRE_AGENT_STAGE_OWNER_MAP_V1).filter(([, e]) => e.status === 'NEEDS_OWNER').map(([s]) => s).sort()).toEqual(['GRAPH_EXPANSION', 'MEMORY_PRIOR']);
  });
});

describe('CBM WORKTREE_STRUCTURAL definition handler (CBM-ADMISSION-01)', () => {
  // Shape captured from the real binary: `cli search_graph` with format:"json" (v0.11.0), 2026-10-05.
  const REAL = JSON.stringify({
    qn_rule: 'qn = qn_prefix == "" ? name : qn_prefix + "." + name',
    cols: ['name', 'label', 'lines', 'in', 'out'],
    groups: [{
      qn_prefix: 'P.lib.server.atlas.agentic.contracts.learning-outcome-v1',
      file: 'lib/server/atlas/agentic/contracts/learning-outcome-v1.ts',
      rows: [['buildLearningOutcomeV1', 'Function', '118-142', 2, 10], ['buildLearningOutcomeV1Extra', 'Function', '200-210', 0, 1]],
    }],
    total: 2, returned: 2, count: 2, has_more: false, truncated: false,
  });
  const binding = (same: boolean) => ({
    indexedSourceRevision: 'source:r1', currentSourceRevision: same ? 'source:r1' : 'source:r2',
    indexedContentDigest: 'sha256:a', currentContentDigest: same ? 'sha256:a' : 'sha256:b',
    indexedWorkspaceRevision: 'workspace:r1', currentWorkspaceRevision: same ? 'workspace:r1' : 'workspace:r2',
  });
  const mk = (raw: string, resolveSnapshotBinding?: (f: string) => Promise<ReturnType<typeof binding> | null>) =>
    makeCbmDefinitionHandlerV1({ runTool: async () => raw, project: 'P', symbol: 'buildLearningOutcomeV1', resolveSnapshotBinding });

  it('parses the real JSON shape, keeps exact-name definitions only, and stays a non-authoritative tier-1 seed', async () => {
    const r = (await mk(REAL)({ nodeId: 'WORKTREE_STRUCTURAL', inputs: {} })) as CbmWorktreeReceiptV1;
    expect(r).toMatchObject({ backend: 'CODEBASE_MEMORY_MCP', version: '0.11.0', queryClass: 'DEFINITION', trustTier: 1, canonicalAuthority: false, emptyMeansUnknown: true });
    expect(r.observations).toHaveLength(1);
    expect(r.observations[0]).toMatchObject({
      sourceRef: 'lib/server/atlas/agentic/contracts/learning-outcome-v1.ts', symbol: 'buildLearningOutcomeV1', label: 'Function',
      span: { startLine: 118, endLine: 142 }, inDegree: 2, outDegree: 10, stale: null, identity: 'UNRESOLVED_NEEDS_ATLAS_IDENTITY',
    });
    expect(r.observations[0].qualifiedName).toBe('P.lib.server.atlas.agentic.contracts.learning-outcome-v1.buildLearningOutcomeV1');
  });

  it('uses exact revision and digest binding for freshness; missing or failed proof stays unknown', async () => {
    const stale = (await mk(REAL, async () => binding(false))({ nodeId: 'W', inputs: {} })) as CbmWorktreeReceiptV1;
    expect(stale.observations[0].stale).toBe(true);
    const fresh = (await mk(REAL, async () => binding(true))({ nodeId: 'W', inputs: {} })) as CbmWorktreeReceiptV1;
    expect(fresh.observations[0].stale).toBe(false);
    const missing = (await mk(REAL, async () => ({ ...binding(true), indexedContentDigest: null }))({ nodeId: 'W', inputs: {} })) as CbmWorktreeReceiptV1;
    expect(missing.observations[0].stale).toBeNull();
    const failed = (await mk(REAL, async () => { throw new Error('x'); })({ nodeId: 'W', inputs: {} })) as CbmWorktreeReceiptV1;
    expect(failed.observations[0].stale).toBeNull();
  });

  it('empty result is an empty observation list (UNKNOWN, not ABSENT); malformed output fails loudly', async () => {
    const empty = (await mk(JSON.stringify({ cols: ['name', 'label', 'lines', 'in', 'out'], groups: [], total: 0 }))({ nodeId: 'W', inputs: {} })) as CbmWorktreeReceiptV1;
    expect(empty.observations).toEqual([]);
    expect(empty.emptyMeansUnknown).toBe(true);
    await expect(mk('results: 1 (cols: qn label)')({ nodeId: 'W', inputs: {} })).rejects.toThrow(/NOT_JSON/);
    await expect(mk(JSON.stringify({ cols: ['x'], groups: [] }))({ nodeId: 'W', inputs: {} })).rejects.toThrow(/UNEXPECTED_COLUMNS/);
  });
});

describe('CBM WORKTREE_STRUCTURAL outline and snippet adapters', () => {
  const project = 'C-Users-james-Videos-deeds-web-app-sveltekit-frontend-src';
  const relativeFile = 'lib/server/atlas/agentic/contracts/learning-outcome-v1.ts';
  const qn = `${project}.lib.server.atlas.agentic.contracts.learning-outcome-v1.buildLearningOutcomeV1`;
  const outlineJson = JSON.stringify({
    file_path: relativeFile,
    cols: ['name', 'label', 'lines', 'qn'],
    rows: [['buildLearningOutcomeV1', 'Function', '118-142', qn]],
    total: 1, offset: 0, limit: 100, returned: 1, has_more: false,
  });
  const snippetJson = JSON.stringify({
    name: 'buildLearningOutcomeV1', qualified_name: qn, label: 'Function',
    file_path: `C:/repo/sveltekit-frontend/src/${relativeFile}`,
    start_line: 118, end_line: 142, source_mode: 'full', source: 'export function buildLearningOutcomeV1() {}',
    callers: 2, callees: 2,
  });

  it('parses the real outline JSON rows and binds them to the requested relative path', async () => {
    const handler = makeCbmFileOutlineHandlerV1({ runTool: async (_tool, args) => {
      expect(args).toMatchObject({ project, file_path: relativeFile, format: 'json', offset: 0 });
      return outlineJson;
    }, project, filePath: relativeFile });
    const result = await handler({ nodeId: 'WORKTREE_STRUCTURAL', inputs: {} }) as CbmOutlineReceiptV1;
    expect(result).toMatchObject({ queryClass: 'OUTLINE', sourceRef: relativeFile, stale: null, emptyMeansUnknown: true, canonicalAuthority: false });
    expect(result.symbols).toEqual([{ symbol: 'buildLearningOutcomeV1', label: 'Function', span: { startLine: 118, endLine: 142 }, qualifiedName: qn }]);
  });

  it('rejects path mismatch, traversal, malformed rows, and unbounded limits', async () => {
    const make = (raw: string, filePath = relativeFile, maxSymbols = 100) => makeCbmFileOutlineHandlerV1({
      runTool: async () => raw, project, filePath, maxSymbols,
    });
    await expect(make(outlineJson, '../outside.ts')({ nodeId: 'W', inputs: {} })).rejects.toThrow(/INVALID_RELATIVE_PATH/);
    await expect(make(outlineJson.replace(relativeFile, 'other.ts'))({ nodeId: 'W', inputs: {} })).rejects.toThrow(/UNEXPECTED_SHAPE/);
    await expect(make(JSON.stringify({ file_path: relativeFile, cols: ['name', 'label', 'lines', 'qn'], rows: [['broken']], total: 1 }))({ nodeId: 'W', inputs: {} })).rejects.toThrow(/MALFORMED_ROW/);
    await expect(make(outlineJson, relativeFile, 501)({ nodeId: 'W', inputs: {} })).rejects.toThrow(/INVALID_LIMIT/);
  });

  it('parses snippet JSON, constrains its returned path to the configured project root, and caps source text', async () => {
    const handler = makeCbmCodeSnippetHandlerV1({
      runTool: async (_tool, args) => {
        expect(args).toMatchObject({ project, qualified_name: qn, format: 'json' });
        return snippetJson;
      }, project, projectRoot: 'C:/repo/sveltekit-frontend/src', qualifiedName: qn, maxChars: 16,
    });
    const result = await handler({ nodeId: 'WORKTREE_STRUCTURAL', inputs: {} }) as CbmSnippetReceiptV1;
    expect(result).toMatchObject({
      queryClass: 'SNIPPET', sourceRef: relativeFile, symbol: 'buildLearningOutcomeV1',
      span: { startLine: 118, endLine: 142 }, source: 'export function ', sourceTruncated: true,
      stale: null, identity: 'UNRESOLVED_NEEDS_ATLAS_IDENTITY', emptyMeansUnknown: true, canonicalAuthority: false,
    });
  });

  it('rejects snippets outside the configured root and malformed JSON', async () => {
    const make = (raw: string) => makeCbmCodeSnippetHandlerV1({
      runTool: async () => raw, project, projectRoot: 'C:/repo/sveltekit-frontend/src', qualifiedName: qn,
    });
    await expect(make(snippetJson.replace('C:/repo/sveltekit-frontend/src/', 'C:/other/'))({ nodeId: 'W', inputs: {} })).rejects.toThrow(/OUTSIDE_PROJECT/);
    await expect(make('{')({ nodeId: 'W', inputs: {} })).rejects.toThrow(/NOT_JSON/);
  });
});

describe('CBM WORKTREE_STRUCTURAL imports candidate adapter', () => {
  const project = 'C-Users-james-Videos-deeds-web-app-sveltekit-frontend-src';
  const requestedPath = 'lib/agent/bounded-tool-caller.ts';
  const resultJson = JSON.stringify({
    columns: ['source.name', 'source.label', 'source.path', 'target.name', 'target.label', 'target.path'],
    rows: [['bounded-tool-caller.spec.ts', 'File', 'lib/agent/bounded-tool-caller.spec.ts', 'bounded-tool-caller.ts', 'Module', requestedPath]],
    returned: 1, total: 1, total_relation: 'eq', has_more: false, truncated: false,
  });

  it('parses a bounded JSON IMPORTS result as a non-authoritative candidate', async () => {
    const handler = makeCbmImportCandidateHandlerV1({
      runTool: async (_tool, args) => {
        expect(args.project).toBe(project);
        expect(args.format).toBe('json');
        expect(String(args.query)).toContain(`target.path = "${requestedPath}"`);
        expect(String(args.query)).toContain('LIMIT 50');
        return resultJson;
      }, project, filePath: requestedPath, direction: 'IMPORTERS_OF',
    });
    const result = await handler({ nodeId: 'WORKTREE_STRUCTURAL', inputs: {} }) as CbmImportCandidateReceiptV1;
    expect(result).toMatchObject({
      queryClass: 'IMPORTS', trustTier: 2, direction: 'IMPORTERS_OF', requestedPath,
      graphSnapshotBound: false, emptyMeansUnknown: true, canonicalAuthority: false, total: 1, truncated: false,
      candidates: [{
        fromPath: 'lib/agent/bounded-tool-caller.spec.ts', fromLabel: 'File',
        toPath: requestedPath, toLabel: 'Module', relation: 'IMPORTS', identity: 'UNRESOLVED_NEEDS_ATLAS_IDENTITY',
      }],
    });
  });

  it('keeps empty results unknown and rejects malformed, mismatched, or unsafe input', async () => {
    const make = (raw: string, filePath = requestedPath, maxRows = 50) => makeCbmImportCandidateHandlerV1({
      runTool: async () => raw, project, filePath, direction: 'IMPORTERS_OF', maxRows,
    });
    const empty = await make(JSON.stringify({ columns: ['source.name', 'source.label', 'source.path', 'target.name', 'target.label', 'target.path'], rows: [], total: 0 }))({ nodeId: 'W', inputs: {} }) as CbmImportCandidateReceiptV1;
    expect(empty.candidates).toEqual([]);
    expect(empty.emptyMeansUnknown).toBe(true);
    await expect(make(resultJson.replace(requestedPath, 'other.ts'))({ nodeId: 'W', inputs: {} })).rejects.toThrow(/PATH_MISMATCH/);
    await expect(make('{')({ nodeId: 'W', inputs: {} })).rejects.toThrow(/NOT_JSON/);
    await expect(make(resultJson, '../outside.ts')({ nodeId: 'W', inputs: {} })).rejects.toThrow(/INVALID_RELATIVE_PATH/);
    await expect(make(resultJson, requestedPath, 201)({ nodeId: 'W', inputs: {} })).rejects.toThrow(/INVALID_LIMIT/);
  });
});

describe('CBM identity / fallback / negative (CBM-IDENTITY-01, CBM-FALLBACK-01, CBM-NEGATIVE-01)', () => {
  const ok = { canonicalId: 'packet:abc', workspaceRevision: 'w1', sourceRevision: 's1' };
  it('qualifies only fresh + real identity + real revisions', async () => {
    const r = await qualifyCbmObservationV1({ sourceRef: String.raw`src\a.ts`, stale: false }, async () => ok);
    expect(r).toMatchObject({ status: 'QUALIFIED', sourceRef: 'src/a.ts', canonicalId: 'packet:abc' });
  });
  it('stale, unbound, unresolved, sentinel and failing lookups stay diagnostic', async () => {
    expect(await qualifyCbmObservationV1({ sourceRef: 'a.ts', stale: true }, async () => ok)).toMatchObject({ reason: 'STALE_INDEX' });
    expect(await qualifyCbmObservationV1({ sourceRef: 'a.ts', stale: null }, async () => ok)).toMatchObject({ reason: 'SNAPSHOT_UNBOUND' });
    expect(await qualifyCbmObservationV1({ sourceRef: 'a.ts', stale: false }, async () => null)).toMatchObject({ reason: 'IDENTITY_UNRESOLVED' });
    expect(await qualifyCbmObservationV1({ sourceRef: 'a.ts', stale: false }, async () => ({ ...ok, sourceRevision: 'unknown' }))).toMatchObject({ reason: 'REVISION_UNQUALIFIED' });
    expect(await qualifyCbmObservationV1({ sourceRef: 'a.ts', stale: false }, async () => { throw new Error('x'); })).toMatchObject({ reason: 'LOOKUP_FAILED' });
  });
  it('fallback: empty is UNKNOWN never absent; stale/unknown/ambiguous go to rg', () => {
    expect(decideCbmFallbackV1([])).toEqual({ use: 'RG_SOURCE_FALLBACK', reason: 'EMPTY', absence: 'UNKNOWN' });
    expect(decideCbmFallbackV1([{ sourceRef: 'a.ts', stale: true }])).toMatchObject({ reason: 'STALE' });
    expect(decideCbmFallbackV1([{ sourceRef: 'a.ts', stale: null }])).toMatchObject({ reason: 'STALE_UNKNOWN' });
    expect(decideCbmFallbackV1([{ sourceRef: 'a.ts', stale: false }, { sourceRef: 'b.ts', stale: false }])).toMatchObject({ reason: 'AMBIGUOUS' });
    expect(decideCbmFallbackV1([{ sourceRef: 'a.ts', stale: false }, { sourceRef: './a.ts', stale: false }])).toEqual({ use: 'CBM', absence: 'NOT_CLAIMED' });
  });
});

describe('CBM TEXT adapter (bounded search_code)', () => {
  const payload = JSON.stringify({
    raw_matches: { cols: ['file', 'line', 'content'], rows: [['a.ts', 3, 'const x = foo();'], ['sub/b.ts', 9, 'y'.repeat(500)]] },
    total_grep_matches: 7, has_more: true,
  });
  const run = (over: Record<string, unknown> = {}, body = payload) =>
    makeCbmTextSearchHandlerV1({
      runTool: async (_t: string, _a: Record<string, unknown>) => body, project: 'p', pattern: 'foo',
      projectRootRelativeToRepo: 'src/lib', ...over,
    } as Parameters<typeof makeCbmTextSearchHandlerV1>[0])({ nodeId: 'T', inputs: {} });
  it('maps matches to repo-relative refs, bounds content, never claims authority', async () => {
    const r = (await run({ maxContentChars: 100 })) as CbmTextReceiptV1;
    expect(r).toMatchObject({ queryClass: 'TEXT', trustTier: 1, canonicalAuthority: false, emptyMeansUnknown: true, totalGrepMatches: 7, truncated: true });
    expect(r.matches.map((m) => m.sourceRef)).toEqual(['src/lib/a.ts', 'src/lib/sub/b.ts']);
    expect(r.matches[1]).toMatchObject({ contentTruncated: true, stale: null, identity: 'UNRESOLVED_NEEDS_ATLAS_IDENTITY' });
    expect(r.matches[1].content).toHaveLength(100);
  });
  it('rejects bad shape, empty pattern, traversal and bad limits', async () => {
    await expect(run({}, '{')).rejects.toThrow(/NOT_JSON/);
    await expect(run({}, '{}')).rejects.toThrow(/UNEXPECTED_SHAPE/);
    await expect(run({ pattern: ' ' })).rejects.toThrow(/EMPTY_PATTERN/);
    await expect(run({ projectRootRelativeToRepo: '../x' })).rejects.toThrow(/INVALID_RELATIVE_PATH/);
    await expect(run({ maxMatches: 201 })).rejects.toThrow(/INVALID_LIMIT/);
    const bad = JSON.stringify({ raw_matches: { cols: ['file', 'line', 'content'], rows: [['../e.ts', 1, 'x']] } });
    await expect(run({}, bad)).rejects.toThrow(/MALFORMED_ROW/);
  });
  it('empty result is an UNKNOWN-flagged receipt, not an absence claim', async () => {
    const r = (await run({}, JSON.stringify({ raw_matches: { cols: ['file', 'line', 'content'], rows: [] } }))) as CbmTextReceiptV1;
    expect(r.matches).toEqual([]);
    expect(r.emptyMeansUnknown).toBe(true);
  });
});
