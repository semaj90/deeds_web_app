import { describe, expect, it } from 'vitest';
import { makeAstHandlerV1, makeCacheLookupHandlerV1, makeCandidateLaneHandlerV1, makeLexicalHandlerV1, makePacketReadHandlerV1, makeReadOnlyContextCacheLoaderV1, type CacheLookupOutputV1, type CandidateLaneOutputV1, type PacketReadOutputV1, type LexicalOutputV1 } from './context-dag-handlers-v1.js';
import { buildContextToolDagFromPreAgentStages, executeContextToolDagV1 } from './context-tool-dag-contracts.js';

const meta = { workflowId: 'wf', requestId: 'rq', workspaceRevision: 'w1', graphRevision: 'g1', producerRevision: 'p1' };

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
      resolveRevision: (f) => (f === 'src/norev.ts' ? null : { workspaceRevision: 'w', sourceRevision: `s:${f}` }),
      extract: async (i) => (i.filePath === 'src/boom.ts'
        ? Promise.reject(new Error('parse'))
        : [{ name: 'buildA', entityKind: 'FUNCTION', startByte: 0, endByte: 9, startLine: 1 }, { name: 'other', entityKind: 'FUNCTION', startByte: 10, endByte: 20, startLine: 2 }]),
    });
    const lexical: LexicalOutputV1 = {
      files: ['src/a.ts', 'src/readme.md', 'src/norev.ts', 'src/bad.ts', 'src/boom.ts'].map((filePath) => ({ filePath, lineNumbers: [1] })),
      symbols: ['buildA'], totalMatches: 5, truncated: false, canonicalAuthority: false,
    };
    const out = (await handler({ nodeId: 'AST', inputs: { LEXICAL: lexical } })) as { declarations: Array<{ filePath: string; name: string }>; skipped: Array<{ filePath: string; reason: string }> };
    expect(out.declarations.map((d) => `${d.filePath}:${d.name}`)).toEqual(['src/a.ts:buildA']);
    expect(Object.fromEntries(out.skipped.map((s) => [s.filePath, s.reason]))).toEqual({
      'src/readme.md': 'NOT_TS_JS', 'src/norev.ts': 'NO_REVISION', 'src/bad.ts': 'READ_FAILED', 'src/boom.ts': 'EXTRACT_FAILED',
    });
  });

  it('ast without LEXICAL output fails loudly (never fabricates input)', async () => {
    const handler = makeAstHandlerV1({ symbols: [], producerRevision: 'p', readFile: async () => '', resolveRevision: () => null, extract: async () => [] });
    await expect(handler({ nodeId: 'AST', inputs: {} })).rejects.toThrow(/LEXICAL/);
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
