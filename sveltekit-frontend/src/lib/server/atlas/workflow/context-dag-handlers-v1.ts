import type { ContextDagNodeHandlerV1 } from './context-tool-dag-contracts.js';

/**
 * CONTEXT-DAG-01 handler adapters. Thin and read-only: every dependency is injected, so these never spawn
 * a process or touch a datastore themselves. Real wiring passes `ripgrepSearch` (agent/tools/ripgrep-search.ts)
 * and `extractAstGrepStructuralCandidates` (atlas/language/ast-grep-structural-topk.ts). Outputs are
 * transport evidence, not canonical identity (`canonicalAuthority:false`).
 */
/**
 * Which existing owner each pre-agent stage injects, and how ready it is (CTX-HANDLERS-01 ledger). Truthful by
 * construction: READY = an adapter in this file wraps a verified read-only owner function (still unwired, never
 * run live); NEEDS_OWNER = no verified structured read-only owner yet; NO_HANDLER = already-computed input or boundary.
 */
export type StageOwnerStatusV1 = 'READY' | 'READY_WITH_CAVEAT' | 'NEEDS_OWNER' | 'NO_HANDLER';

export const PRE_AGENT_STAGE_OWNER_MAP_V1: Readonly<Record<string, { status: StageOwnerStatusV1; owner: string; adapter: string | null; note: string }>> = {
  QUERY_ANALYSIS: { status: 'NO_HANDLER', owner: 'atlas/semantic-signal-routing.ts::analyzeSemanticQuery (routing owner still to be reconciled)', adapter: null, note: 'computed before the DAG runs; pass it as a constant handler' },
  CACHE_LOOKUP: { status: 'READY_WITH_CAVEAT', owner: 'ace/context-cache-planner.ts + ace/llm-context-cache.ts::getContextCacheWithSource', adapter: 'makeCacheLookupHandlerV1 + makeReadOnlyContextCacheLoaderV1', note: 'needs explicit non-sentinel repoGitSha/corpusHash/graphSnapshotHash; source of real values undecided' },
  LEXICAL: { status: 'READY', owner: 'retrieval/retrieve-candidates.ts::retrieveExactMatches', adapter: 'makeCandidateLaneHandlerV1', note: 'Postgres read; SearchRuntime is the long-term injection point' },
  AST: { status: 'READY_WITH_CAVEAT', owner: 'retrieval/retrieve-candidates.ts::retrieveASTMatches', adapter: 'makeCandidateLaneHandlerV1', note: 'weak ILIKE over tree_node_id, not structural parsing' },
  SEMANTIC_ROUTE: { status: 'READY', owner: 'retrieval/retrieve-candidates.ts::retrieveQdrant (dense_768, codebase_chunks_768)', adapter: 'makeCandidateLaneHandlerV1', note: 'embeds the query then Qdrant ANN (read-only network calls); SearchRuntime remains the sole fusion owner' },
  MEMORY_PRIOR: { status: 'NEEDS_OWNER', owner: 'memory/engram-memory.ts (not inspected)', adapter: null, note: 'Engram today, Claude-Mem adapter later; read function unverified' },
  GRAPH_EXPANSION: { status: 'NEEDS_OWNER', owner: 'ace/graph-expander.ts::fetchDeepImportGraphExpansion(filePaths): Promise<string>', adapter: null, note: 'returns an unstructured string, not revision-qualified refs; a structured read-only graph/PPR owner is still to be identified' },
  WORKTREE_STRUCTURAL: { status: 'READY_WITH_CAVEAT', owner: 'codebase-memory-mcp v0.11.0 (`cli search_graph`, format json) - challenger, admitted for DEFINITION/OUTLINE/SNIPPET/IMPORTS/bounded TEXT', adapter: 'makeCbmDefinitionHandlerV1', note: 'DEFINITION only implemented; not a pre-agent stage in the mapper yet; no Atlas identity (UNRESOLVED), stale-index guard required, empty = UNKNOWN' },
  ACE_PACKET_ASSEMBLY: { status: 'READY_WITH_CAVEAT', owner: 'ace/ace-packet-store.ts::readAcePacketBySourceRef (read only; assemblePacketForSourceRef writes on miss)', adapter: 'makePacketReadHandlerV1', note: 'packets carry no revision => UNQUALIFIED_NO_REVISION; no assemble-on-miss path' },
};

/**
 * VERIFIED-OWNER adapter (CTX-HANDLER-OWNER-01): wraps one existing candidate lane from
 * `retrieval/retrieve-candidates.ts` (`retrieveExactMatches` for LEXICAL, `retrieveASTMatches` for AST) and
 * returns compact qualified refs only. Never returns `content`/`summary`, so pre-agent work does not move the
 * token explosion earlier; packet assembly expands only what it selects. Injected `retrieve` keeps it pure.
 */
export interface CandidateLikeV1 {
  packetKey: string;
  sourceRef: string;
  score: number;
  workspaceRevision?: string | null;
  sourceRevision?: string | null;
  identityStatus?: string | null;
  treeNodeId?: string | null;
}

export interface QualifiedHitV1 {
  sourceRef: string;
  canonicalId: string;
  workspaceRevision: string | null;
  sourceRevision: string | null;
  score: number;
  identityStatus: string | null;
  qualification: 'REVISION_QUALIFIED' | 'UNQUALIFIED';
}

export interface CandidateLaneOutputV1 {
  lane: string;
  hits: QualifiedHitV1[];
  /** REVISION_QUALIFIED only when every returned hit carries both revisions. */
  qualification: 'REVISION_QUALIFIED' | 'UNQUALIFIED' | 'EMPTY';
  totalCandidates: number;
  canonicalAuthority: false;
}

export function makeCandidateLaneHandlerV1(deps: {
  lane: string;
  query: string;
  retrieve: (query: string) => Promise<readonly CandidateLikeV1[]>;
  maxHits?: number;
}): ContextDagNodeHandlerV1 {
  const maxHits = deps.maxHits ?? 10;
  return async () => {
    const candidates = await deps.retrieve(deps.query);
    const hits: QualifiedHitV1[] = [...candidates]
      .sort((a, b) => b.score - a.score || a.sourceRef.localeCompare(b.sourceRef))
      .slice(0, maxHits)
      .map((c) => ({
        sourceRef: norm(c.sourceRef),
        canonicalId: c.packetKey,
        workspaceRevision: c.workspaceRevision ?? null,
        sourceRevision: c.sourceRevision ?? null,
        score: c.score,
        identityStatus: c.identityStatus ?? null,
        qualification: c.workspaceRevision && c.sourceRevision ? 'REVISION_QUALIFIED' as const : 'UNQUALIFIED' as const,
      }));
    const out: CandidateLaneOutputV1 = {
      lane: deps.lane,
      hits,
      qualification: hits.length === 0 ? 'EMPTY' : hits.every((h) => h.qualification === 'REVISION_QUALIFIED') ? 'REVISION_QUALIFIED' : 'UNQUALIFIED',
      totalCandidates: candidates.length,
      canonicalAuthority: false,
    };
    return out;
  };
}

/**
 * CACHE_LOOKUP adapter over `ace/context-cache-planner.ts` (CTX-HANDLER-CACHE-01). Injected `buildState` /
 * `load` keep it pure. Findings baked in:
 *  - `buildAceContextPlannerState` silently defaults `repoGitSha`/`corpusHash`/`graphSnapshotHash` to sentinels
 *    ('unknown', 'codebase-graph:unknown', 'graph:none'), so its cache key can look valid with NO real revision.
 *    This handler refuses to look up unless the caller supplies explicit non-sentinel values (fail closed => miss).
 *  - `loadAceContextPlannerHit` fires `bumpContextCacheHit` (a write). For a strictly read-only DAG, inject a
 *    read-only `load` (e.g. built on `getContextCacheWithSource`) instead of the owner's function as-is.
 * Output is compact (key, source, token estimate, delta fields); the cached packet body is NOT returned.
 */
export const CACHE_SENTINEL_VALUES: ReadonlySet<string> = new Set(['unknown', 'codebase-graph:unknown', 'graph:none', '']);

export interface CacheLookupIdentityV1 {
  repoGitSha: string;
  corpusHash: string;
  graphSnapshotHash: string;
}

export interface CacheLookupOutputV1 {
  status: 'HIT' | 'MISS' | 'UNQUALIFIED_KEY';
  cacheKey: string | null;
  source: string | null;
  estimatedPrefixTokens: number | null;
  deltaFields: string[];
  missingIdentity: string[];
  canonicalAuthority: false;
}

export function makeCacheLookupHandlerV1<S extends { cacheKey: string }>(deps: {
  query: string;
  identity: Partial<CacheLookupIdentityV1>;
  buildState: (input: { query: string } & CacheLookupIdentityV1) => S;
  load: (state: S) => Promise<{ meta: { source: string; estimatedPrefixTokens: number; deltaFields: string[] } } | null>;
}): ContextDagNodeHandlerV1 {
  return async () => {
    const missingIdentity = (['repoGitSha', 'corpusHash', 'graphSnapshotHash'] as const)
      .filter((k) => !deps.identity[k] || CACHE_SENTINEL_VALUES.has(String(deps.identity[k])));
    if (missingIdentity.length > 0) {
      const out: CacheLookupOutputV1 = {
        status: 'UNQUALIFIED_KEY', cacheKey: null, source: null, estimatedPrefixTokens: null, deltaFields: [], missingIdentity, canonicalAuthority: false,
      };
      return out;
    }
    const state = deps.buildState({ query: deps.query, ...(deps.identity as CacheLookupIdentityV1) });
    const hit = await deps.load(state);
    const out: CacheLookupOutputV1 = hit
      ? { status: 'HIT', cacheKey: state.cacheKey, source: hit.meta.source, estimatedPrefixTokens: hit.meta.estimatedPrefixTokens, deltaFields: hit.meta.deltaFields, missingIdentity: [], canonicalAuthority: false }
      : { status: 'MISS', cacheKey: state.cacheKey, source: null, estimatedPrefixTokens: null, deltaFields: [], missingIdentity: [], canonicalAuthority: false };
    return out;
  };
}

/**
 * Read-only loader for `makeCacheLookupHandlerV1`, built on `ace/llm-context-cache.ts::getContextCacheWithSource`
 * (redis `ace:ctx:*` -> postgres `llm_context_cache` -> local-json; verified NOT to write back on a hit) instead
 * of the planner's `loadAceContextPlannerHit`, which bumps a hit counter (a Valkey write + a local JSON file write).
 * `deltaFields` stays empty here because the planner's diff helper is not exported.
 */
export function makeReadOnlyContextCacheLoaderV1(deps: {
  getWithSource: (cacheKey: string) => Promise<{ source: string; pack: { prefixTokensEstimated?: number | null } | null }>;
}) {
  return async (state: { cacheKey: string }) => {
    const { source, pack } = await deps.getWithSource(state.cacheKey);
    if (!pack) return null;
    return { meta: { source, estimatedPrefixTokens: pack.prefixTokensEstimated ?? 0, deltaFields: [] as string[] } };
  };
}

/**
 * Read-only ACE packet fetch (CTX-HANDLER-PACKET-01). `assemblePacketForSourceRef` writes to Valkey on a miss, so
 * this handler never assembles: it only reads existing packets (inject `readAcePacketBySourceRef`; 2 GETs each,
 * all started together) for at most `maxRefs` source refs chosen by the caller from upstream outputs.
 * `AceFullPacket` carries NO workspace/source revision, so every packet is reported UNQUALIFIED_NO_REVISION:
 * this handler can supply bounded context but can never, by itself, prove revision-qualified evidence.
 * `promptContext` is returned only when asked, truncated to `maxPromptChars`.
 */
export interface PacketLikeV1 {
  packet_id: string;
  source_refs: string[];
  ranked_cards: unknown[];
  prompt_context: string;
  ttl_seconds: number;
  degraded: boolean;
}

export interface PacketReadItemV1 {
  sourceRef: string;
  found: boolean;
  packetId: string | null;
  rankedCardCount: number;
  promptContextChars: number;
  promptContext?: string;
  degraded: boolean;
  qualification: 'UNQUALIFIED_NO_REVISION' | 'NOT_FOUND';
}

export interface PacketReadOutputV1 {
  items: PacketReadItemV1[];
  foundCount: number;
  canonicalAuthority: false;
  writesPerformed: false;
}

export function makePacketReadHandlerV1(deps: {
  readBySourceRef: (sourceRef: string) => Promise<PacketLikeV1 | null>;
  selectSourceRefs: (inputs: Record<string, unknown>) => readonly string[];
  maxRefs?: number;
  includePromptContext?: boolean;
  maxPromptChars?: number;
}): ContextDagNodeHandlerV1 {
  const maxRefs = deps.maxRefs ?? 5;
  const maxChars = deps.maxPromptChars ?? 2000;
  return async ({ inputs }) => {
    const refs = [...new Set(deps.selectSourceRefs(inputs).map(norm))].slice(0, maxRefs);
    const items = await Promise.all(refs.map(async (sourceRef): Promise<PacketReadItemV1> => {
      const packet = await deps.readBySourceRef(sourceRef).catch(() => null);
      if (!packet) {
        return { sourceRef, found: false, packetId: null, rankedCardCount: 0, promptContextChars: 0, degraded: false, qualification: 'NOT_FOUND' };
      }
      return {
        sourceRef, found: true, packetId: packet.packet_id, rankedCardCount: packet.ranked_cards.length,
        promptContextChars: packet.prompt_context.length,
        ...(deps.includePromptContext ? { promptContext: packet.prompt_context.slice(0, maxChars) } : {}),
        degraded: packet.degraded, qualification: 'UNQUALIFIED_NO_REVISION',
      };
    }));
    const out: PacketReadOutputV1 = { items, foundCount: items.filter((i) => i.found).length, canonicalAuthority: false, writesPerformed: false };
    return out;
  };
}

/**
 * WORKTREE_STRUCTURAL / DEFINITION adapter over codebase-memory-mcp v0.11.0 (CBM-ADMISSION-01: admitted ONLY for
 * DEFINITION/OUTLINE/SNIPPET/IMPORTS/bounded TEXT; this file implements DEFINITION only). `runTool` is injected
 * (real wiring: the exe's `cli --quiet search_graph` with `format:"json"`, whose shape is
 * `{groups:[{qn_prefix,file,rows:[[name,label,lines,in,out]]}],cols,total,returned,has_more,truncated}`;
 * the plain `--json` flag only wraps the text table, so it is NOT used).
 * Output is a tier-1 SEED: no Atlas identity yet (UNRESOLVED_NEEDS_ATLAS_IDENTITY), `emptyMeansUnknown:true`
 * (an empty result is UNKNOWN, never ABSENT), and a stale-index guard: the index is a snapshot with the watcher off,
 * so `isFresh(file)` (e.g. file mtime <= indexedAt) decides `stale`; null = could not tell.
 */
export interface CbmDefinitionObservationV1 {
  sourceRef: string;
  symbol: string;
  label: string;
  span: { startLine: number; endLine: number } | null;
  inDegree: number;
  outDegree: number;
  qualifiedName: string;
  stale: boolean | null;
  identity: 'UNRESOLVED_NEEDS_ATLAS_IDENTITY';
}

export interface CbmWorktreeReceiptV1 {
  backend: 'CODEBASE_MEMORY_MCP';
  version: string;
  queryClass: 'DEFINITION';
  trustTier: 1;
  project: string;
  observations: CbmDefinitionObservationV1[];
  total: number;
  truncated: boolean;
  emptyMeansUnknown: true;
  canonicalAuthority: false;
}

interface CbmSearchJsonV1 {
  cols?: string[];
  groups?: Array<{ qn_prefix: string; file: string; rows: Array<Array<string | number>> }>;
  total?: number;
  truncated?: boolean;
}

export function makeCbmDefinitionHandlerV1(deps: {
  runTool: (tool: 'search_graph', args: Record<string, unknown>) => Promise<string>;
  project: string;
  symbol: string;
  version?: string;
  maxHits?: number;
  isFresh?: (sourceRef: string) => Promise<boolean | null>;
}): ContextDagNodeHandlerV1 {
  return async () => {
    const raw = await deps.runTool('search_graph', {
      project: deps.project, name_pattern: deps.symbol, limit: deps.maxHits ?? 10, format: 'json',
    });
    let parsed: CbmSearchJsonV1;
    try { parsed = JSON.parse(raw) as CbmSearchJsonV1; } catch { throw new Error('CBM_SEARCH_GRAPH_NOT_JSON'); }
    const cols = parsed.cols ?? [];
    const idx = (c: string) => cols.indexOf(c);
    if (idx('name') < 0 || idx('label') < 0 || idx('lines') < 0) throw new Error('CBM_SEARCH_GRAPH_UNEXPECTED_COLUMNS');
    const observations: CbmDefinitionObservationV1[] = [];
    for (const g of parsed.groups ?? []) {
      const sourceRef = norm(g.file);
      const stale = deps.isFresh ? await deps.isFresh(sourceRef).then((f) => (f === null ? null : !f)).catch(() => null) : null;
      for (const row of g.rows) {
        const name = String(row[idx('name')]);
        if (name !== deps.symbol) continue; // name_pattern is a substring/regex match; keep exact definitions only
        const m = /^(\d+)-(\d+)$/.exec(String(row[idx('lines')]));
        observations.push({
          sourceRef, symbol: name, label: String(row[idx('label')]),
          span: m ? { startLine: Number(m[1]), endLine: Number(m[2]) } : null,
          inDegree: idx('in') >= 0 ? Number(row[idx('in')]) : 0,
          outDegree: idx('out') >= 0 ? Number(row[idx('out')]) : 0,
          qualifiedName: g.qn_prefix === '' ? name : `${g.qn_prefix}.${name}`,
          stale, identity: 'UNRESOLVED_NEEDS_ATLAS_IDENTITY',
        });
      }
    }
    const receipt: CbmWorktreeReceiptV1 = {
      backend: 'CODEBASE_MEMORY_MCP', version: deps.version ?? '0.11.0', queryClass: 'DEFINITION', trustTier: 1,
      project: deps.project, observations, total: parsed.total ?? observations.length, truncated: Boolean(parsed.truncated),
      emptyMeansUnknown: true, canonicalAuthority: false,
    };
    return receipt;
  };
}

export interface LexicalHitV1 {
  filePath: string;
  lineNumbers: number[];
}

export interface LexicalOutputV1 {
  files: LexicalHitV1[];
  symbols: string[];
  totalMatches: number;
  truncated: boolean;
  canonicalAuthority: false;
}

export type RipgrepLikeV1 = (input: {
  pattern: string;
  fixedStrings: true;
  maxResults: number;
  cwd?: string;
}) => Promise<{ matches: Array<{ filePath: string; lineNumber: number }>; totalMatches: number; truncated: boolean }>;

const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');

/** One literal rg search per symbol, all started together (separate OS processes), merged by file. */
export function makeLexicalHandlerV1(deps: {
  search: RipgrepLikeV1;
  symbols: readonly string[];
  cwd?: string;
  maxResultsPerSymbol?: number;
  maxFiles?: number;
}): ContextDagNodeHandlerV1 {
  const symbols = [...new Set(deps.symbols.map((s) => s.trim()).filter(Boolean))].slice(0, 8);
  const maxFiles = deps.maxFiles ?? 12;
  return async () => {
    const results = await Promise.all(
      symbols.map((pattern) => deps.search({ pattern, fixedStrings: true, maxResults: deps.maxResultsPerSymbol ?? 50, cwd: deps.cwd })),
    );
    const byFile = new Map<string, Set<number>>();
    let totalMatches = 0;
    let truncated = false;
    for (const r of results) {
      totalMatches += r.totalMatches;
      truncated ||= r.truncated;
      for (const m of r.matches) {
        const key = norm(m.filePath);
        if (!byFile.has(key)) byFile.set(key, new Set());
        byFile.get(key)!.add(m.lineNumber);
      }
    }
    const files = [...byFile.entries()]
      .map(([filePath, lines]) => ({ filePath, lineNumbers: [...lines].sort((a, b) => a - b) }))
      .sort((a, b) => b.lineNumbers.length - a.lineNumbers.length || a.filePath.localeCompare(b.filePath));
    const out: LexicalOutputV1 = {
      files: files.slice(0, maxFiles),
      symbols,
      totalMatches,
      truncated: truncated || files.length > maxFiles,
      canonicalAuthority: false,
    };
    return out;
  };
}

export interface AstDeclarationV1 {
  filePath: string;
  name: string;
  entityKind: string;
  startByte: number;
  endByte: number;
  startLine: number;
}

export interface AstOutputV1 {
  declarations: AstDeclarationV1[];
  skipped: Array<{ filePath: string; reason: 'NOT_TS_JS' | 'NO_REVISION' | 'READ_FAILED' | 'EXTRACT_FAILED' }>;
  canonicalAuthority: false;
}

type AstLanguage = 'TYPESCRIPT' | 'JAVASCRIPT' | 'TSX' | 'JSX';
const LANG_BY_EXT: Record<string, AstLanguage> = { ts: 'TYPESCRIPT', mts: 'TYPESCRIPT', cts: 'TYPESCRIPT', tsx: 'TSX', js: 'JAVASCRIPT', mjs: 'JAVASCRIPT', cjs: 'JAVASCRIPT', jsx: 'JSX' };

export type AstExtractLikeV1 = (input: {
  schema: 'atlas.ast-grep-structural-extraction-input.v1';
  code: string;
  filePath: string;
  sourceRef: string;
  language: AstLanguage;
  workspaceRevision: string;
  sourceRevision: string;
  producerRevision: string;
}) => Promise<Array<{ name: string; entityKind: string; startByte: number; endByte: number; startLine: number }>>;

/**
 * NOT the handler for the `AST` stage: `buildContextToolDagFromPreAgentStages` makes `AST` a sibling of `LEXICAL`
 * (Postgres-backed `retrieveASTMatches` via `makeCandidateLaneHandlerV1`), so this handler would find no
 * `inputs.LEXICAL` there and throw. It is for a FUTURE separate refinement node (e.g. `AST_STRUCTURAL_REFINE`) that
 * depends on LEXICAL; that node does not exist in the mapper yet. It consumes the LEXICAL output, parses only TS/JS
 * files that have a resolvable revision, and a file without one is skipped and reported, never given a defaulted
 * revision. `filePath` values are relative to the lexical search `cwd`, so `readFile` must resolve against that
 * same base (it receives the bare relative path).
 */
export function makeAstHandlerV1(deps: {
  extract: AstExtractLikeV1;
  readFile: (filePath: string) => Promise<string>;
  resolveRevision: (filePath: string) => { workspaceRevision: string; sourceRevision: string } | null;
  symbols: readonly string[];
  producerRevision: string;
}): ContextDagNodeHandlerV1 {
  const wanted = new Set(deps.symbols.map((s) => s.trim()).filter(Boolean));
  return async ({ inputs }) => {
    const lexical = inputs.LEXICAL as LexicalOutputV1 | undefined;
    if (!lexical || !Array.isArray(lexical.files)) throw new Error('AST handler requires the LEXICAL output');
    const declarations: AstDeclarationV1[] = [];
    const skipped: AstOutputV1['skipped'] = [];
    await Promise.all(lexical.files.map(async ({ filePath }) => {
      const language = LANG_BY_EXT[filePath.split('.').pop()?.toLowerCase() ?? ''];
      if (!language) { skipped.push({ filePath, reason: 'NOT_TS_JS' }); return; }
      const rev = deps.resolveRevision(filePath);
      if (!rev) { skipped.push({ filePath, reason: 'NO_REVISION' }); return; }
      let code: string;
      try { code = await deps.readFile(filePath); } catch { skipped.push({ filePath, reason: 'READ_FAILED' }); return; }
      try {
        const found = await deps.extract({
          schema: 'atlas.ast-grep-structural-extraction-input.v1', code, filePath, sourceRef: filePath, language,
          workspaceRevision: rev.workspaceRevision, sourceRevision: rev.sourceRevision, producerRevision: deps.producerRevision,
        });
        for (const c of found) {
          if (wanted.size === 0 || wanted.has(c.name)) {
            declarations.push({ filePath, name: c.name, entityKind: c.entityKind, startByte: c.startByte, endByte: c.endByte, startLine: c.startLine });
          }
        }
      } catch { skipped.push({ filePath, reason: 'EXTRACT_FAILED' }); }
    }));
    declarations.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.startByte - b.startByte);
    skipped.sort((a, b) => a.filePath.localeCompare(b.filePath));
    const out: AstOutputV1 = { declarations, skipped, canonicalAuthority: false };
    return out;
  };
}
