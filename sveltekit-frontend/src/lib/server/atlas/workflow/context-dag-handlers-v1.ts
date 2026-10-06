import type { ContextDagNodeHandlerV1 } from './context-tool-dag-contracts.js';
import { isAbsolute, relative, resolve, sep } from 'node:path';

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
  WORKTREE_STRUCTURAL: { status: 'READY_WITH_CAVEAT', owner: 'codebase-memory-mcp v0.11.0 (read-only challenger; admitted for DEFINITION/OUTLINE/SNIPPET/IMPORTS/bounded TEXT)', adapter: 'makeCbmDefinitionHandlerV1 + makeCbmFileOutlineHandlerV1 + makeCbmCodeSnippetHandlerV1 + makeCbmImportCandidateHandlerV1', note: 'DEFINITION/OUTLINE/SNIPPET/IMPORTS diagnostic adapters only; not wired as a pre-agent stage; identity and graph snapshot remain unresolved; empty = UNKNOWN' },
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
 * `stale` is decided only from exact source revision, content digest, and workspace
 * revision equality. Timestamps or branch labels alone are insufficient; null means
 * the index snapshot cannot be bound to the current source.
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

export interface CbmSnapshotBindingCheckV1 {
  indexedSourceRevision: string | null;
  currentSourceRevision: string | null;
  indexedContentDigest: string | null;
  currentContentDigest: string | null;
  indexedWorkspaceRevision: string | null;
  currentWorkspaceRevision: string | null;
}

function isCbmSnapshotStaleV1(check: CbmSnapshotBindingCheckV1): boolean | null {
  const values = Object.values(check);
  if (values.some((value) => typeof value !== 'string' || value.length === 0)) return null;
  return check.indexedSourceRevision !== check.currentSourceRevision
    || check.indexedContentDigest !== check.currentContentDigest
    || check.indexedWorkspaceRevision !== check.currentWorkspaceRevision;
}

export function makeCbmDefinitionHandlerV1(deps: {
  runTool: (tool: 'search_graph', args: Record<string, unknown>) => Promise<string>;
  project: string;
  symbol: string;
  version?: string;
  maxHits?: number;
  resolveSnapshotBinding?: (sourceRef: string) => Promise<CbmSnapshotBindingCheckV1 | null>;
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
      const binding = deps.resolveSnapshotBinding
        ? await deps.resolveSnapshotBinding(sourceRef).catch(() => null)
        : null;
      const stale = binding ? isCbmSnapshotStaleV1(binding) : null;
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

export interface CbmOutlineSymbolV1 {
  symbol: string;
  label: string;
  span: { startLine: number; endLine: number } | null;
  qualifiedName: string;
}

export interface CbmOutlineReceiptV1 {
  backend: 'CODEBASE_MEMORY_MCP';
  version: string;
  queryClass: 'OUTLINE';
  trustTier: 1;
  project: string;
  sourceRef: string;
  symbols: CbmOutlineSymbolV1[];
  total: number;
  truncated: boolean;
  stale: boolean | null;
  emptyMeansUnknown: true;
  canonicalAuthority: false;
}

interface CbmOutlineJsonV1 {
  file_path?: string;
  cols?: string[];
  rows?: Array<Array<string | number>>;
  total?: number;
  has_more?: boolean;
}

function parseCbmJsonV1<T>(raw: string, errorCode: string): T {
  try { return JSON.parse(raw) as T; } catch { throw new Error(errorCode); }
}

function parseCbmLineSpanV1(value: unknown): { startLine: number; endLine: number } | null {
  const match = /^(\d+)-(\d+)$/.exec(String(value));
  if (!match) return null;
  const startLine = Number(match[1]);
  const endLine = Number(match[2]);
  return Number.isSafeInteger(startLine) && Number.isSafeInteger(endLine) && startLine > 0 && endLine >= startLine
    ? { startLine, endLine }
    : null;
}

function getCbmFreshnessV1(
  check: ((sourceRef: string) => Promise<CbmSnapshotBindingCheckV1 | null>) | undefined,
  sourceRef: string,
): Promise<boolean | null> {
  if (!check) return Promise.resolve(null);
  return check(sourceRef)
    .then((binding) => binding ? isCbmSnapshotStaleV1(binding) : null)
    .catch(() => null);
}

export function makeCbmFileOutlineHandlerV1(deps: {
  runTool: (tool: 'get_file_outline', args: Record<string, unknown>) => Promise<string>;
  project: string;
  filePath: string;
  version?: string;
  maxSymbols?: number;
  resolveSnapshotBinding?: (sourceRef: string) => Promise<CbmSnapshotBindingCheckV1 | null>;
}): ContextDagNodeHandlerV1 {
  return async () => {
    const sourceRef = norm(deps.filePath);
    if (!sourceRef || sourceRef.startsWith('/') || sourceRef.split('/').some((part) => part === '..')) {
      throw new Error('CBM_OUTLINE_INVALID_RELATIVE_PATH');
    }
    const limit = deps.maxSymbols ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('CBM_OUTLINE_INVALID_LIMIT');
    const raw = await deps.runTool('get_file_outline', {
      project: deps.project, file_path: sourceRef, format: 'json', offset: 0, limit,
    });
    const parsed = parseCbmJsonV1<CbmOutlineJsonV1>(raw, 'CBM_OUTLINE_NOT_JSON');
    if (norm(parsed.file_path ?? '') !== sourceRef || !Array.isArray(parsed.cols) || !Array.isArray(parsed.rows)) {
      throw new Error('CBM_OUTLINE_UNEXPECTED_SHAPE');
    }
    const col = (name: string) => parsed.cols!.indexOf(name);
    const nameIndex = col('name');
    const labelIndex = col('label');
    const lineIndex = col('lines');
    const qnIndex = col('qn');
    if ([nameIndex, labelIndex, lineIndex, qnIndex].some((index) => index < 0)) throw new Error('CBM_OUTLINE_UNEXPECTED_COLUMNS');
    const symbols = parsed.rows.slice(0, limit).map((row) => {
      if (row.length <= Math.max(nameIndex, labelIndex, lineIndex, qnIndex)) throw new Error('CBM_OUTLINE_MALFORMED_ROW');
      return {
        symbol: String(row[nameIndex]), label: String(row[labelIndex]),
        span: parseCbmLineSpanV1(row[lineIndex]), qualifiedName: String(row[qnIndex]),
      };
    });
    return {
      backend: 'CODEBASE_MEMORY_MCP', version: deps.version ?? '0.11.0', queryClass: 'OUTLINE', trustTier: 1,
      project: deps.project, sourceRef, symbols, total: parsed.total ?? symbols.length,
      truncated: Boolean(parsed.has_more || (parsed.total !== undefined && parsed.total > symbols.length)),
      stale: await getCbmFreshnessV1(deps.resolveSnapshotBinding, sourceRef),
      emptyMeansUnknown: true, canonicalAuthority: false,
    } satisfies CbmOutlineReceiptV1;
  };
}

export interface CbmSnippetReceiptV1 {
  backend: 'CODEBASE_MEMORY_MCP';
  version: string;
  queryClass: 'SNIPPET';
  trustTier: 1;
  project: string;
  sourceRef: string;
  symbol: string;
  span: { startLine: number; endLine: number } | null;
  sourceMode: string;
  source: string;
  sourceTruncated: boolean;
  stale: boolean | null;
  identity: 'UNRESOLVED_NEEDS_ATLAS_IDENTITY';
  emptyMeansUnknown: true;
  canonicalAuthority: false;
}

interface CbmSnippetJsonV1 {
  name?: string;
  qualified_name?: string;
  file_path?: string;
  start_line?: number;
  end_line?: number;
  source_mode?: string;
  source?: string;
}

function getCbmRelativePathV1(projectRoot: string, filePath: string): string {
  const root = resolve(projectRoot);
  const candidate = resolve(isAbsolute(filePath) ? filePath : resolve(root, filePath));
  const relativePath = relative(root, candidate);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error('CBM_SNIPPET_PATH_OUTSIDE_PROJECT');
  }
  return norm(relativePath);
}

export function makeCbmCodeSnippetHandlerV1(deps: {
  runTool: (tool: 'get_code_snippet', args: Record<string, unknown>) => Promise<string>;
  project: string;
  projectRoot: string;
  qualifiedName: string;
  version?: string;
  maxChars?: number;
  resolveSnapshotBinding?: (sourceRef: string) => Promise<CbmSnapshotBindingCheckV1 | null>;
}): ContextDagNodeHandlerV1 {
  return async () => {
    const maxChars = deps.maxChars ?? 12000;
    if (!Number.isSafeInteger(maxChars) || maxChars < 1 || maxChars > 50000) throw new Error('CBM_SNIPPET_INVALID_LIMIT');
    const raw = await deps.runTool('get_code_snippet', {
      project: deps.project, qualified_name: deps.qualifiedName, format: 'json',
    });
    const parsed = parseCbmJsonV1<CbmSnippetJsonV1>(raw, 'CBM_SNIPPET_NOT_JSON');
    if (parsed.qualified_name !== deps.qualifiedName || typeof parsed.name !== 'string'
      || typeof parsed.file_path !== 'string' || typeof parsed.source !== 'string'
      || typeof parsed.source_mode !== 'string') throw new Error('CBM_SNIPPET_UNEXPECTED_SHAPE');
    const sourceRef = getCbmRelativePathV1(deps.projectRoot, parsed.file_path);
    const startLine = parsed.start_line;
    const endLine = parsed.end_line;
    const span = Number.isSafeInteger(startLine) && Number.isSafeInteger(endLine)
      && (startLine as number) > 0 && (endLine as number) >= (startLine as number)
      ? { startLine: startLine as number, endLine: endLine as number }
      : null;
    const source = parsed.source.slice(0, maxChars);
    return {
      backend: 'CODEBASE_MEMORY_MCP', version: deps.version ?? '0.11.0', queryClass: 'SNIPPET', trustTier: 1,
      project: deps.project, sourceRef, symbol: parsed.name, span, sourceMode: parsed.source_mode, source,
      sourceTruncated: source.length < parsed.source.length,
      stale: await getCbmFreshnessV1(deps.resolveSnapshotBinding, sourceRef),
      identity: 'UNRESOLVED_NEEDS_ATLAS_IDENTITY', emptyMeansUnknown: true, canonicalAuthority: false,
    } satisfies CbmSnippetReceiptV1;
  };
}

export type CbmImportDirectionV1 = 'IMPORTERS_OF' | 'IMPORTS_FROM';

export interface CbmImportCandidateV1 {
  fromPath: string;
  fromLabel: string;
  toPath: string;
  toLabel: string;
  relation: 'IMPORTS';
  identity: 'UNRESOLVED_NEEDS_ATLAS_IDENTITY';
}

export interface CbmImportCandidateReceiptV1 {
  backend: 'CODEBASE_MEMORY_MCP';
  version: string;
  queryClass: 'IMPORTS';
  trustTier: 2;
  project: string;
  direction: CbmImportDirectionV1;
  requestedPath: string;
  candidates: CbmImportCandidateV1[];
  total: number;
  truncated: boolean;
  graphSnapshotBound: false;
  emptyMeansUnknown: true;
  canonicalAuthority: false;
}

interface CbmImportJsonV1 {
  columns?: string[];
  rows?: Array<Array<string | number>>;
  total?: number;
  has_more?: boolean;
  truncated?: boolean;
}

function normalizeCbmRelativePathV1(value: string): string {
  const result = norm(value);
  if (!result || result.startsWith('/') || /^[A-Za-z]:/.test(result)
    || result.split('/').some((part) => part === '..') || /[\u0000-\u001f]/.test(result)) {
    throw new Error('CBM_IMPORT_INVALID_RELATIVE_PATH');
  }
  return result;
}

export function makeCbmImportCandidateHandlerV1(deps: {
  runTool: (tool: 'query_graph', args: Record<string, unknown>) => Promise<string>;
  project: string;
  filePath: string;
  direction: CbmImportDirectionV1;
  version?: string;
  maxRows?: number;
}): ContextDagNodeHandlerV1 {
  return async () => {
    const requestedPath = normalizeCbmRelativePathV1(deps.filePath);
    const limit = deps.maxRows ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error('CBM_IMPORT_INVALID_LIMIT');
    if (deps.direction !== 'IMPORTERS_OF' && deps.direction !== 'IMPORTS_FROM') throw new Error('CBM_IMPORT_INVALID_DIRECTION');
    const endpoint = deps.direction === 'IMPORTERS_OF' ? 'target' : 'source';
    const query = `MATCH (source)-[:IMPORTS]->(target) WHERE ${endpoint}.path = ${JSON.stringify(requestedPath)} RETURN source.name, source.label, source.path, target.name, target.label, target.path LIMIT ${limit}`;
    const raw = await deps.runTool('query_graph', { project: deps.project, query, format: 'json' });
    const parsed = parseCbmJsonV1<CbmImportJsonV1>(raw, 'CBM_IMPORT_NOT_JSON');
    const requiredColumns = ['source.name', 'source.label', 'source.path', 'target.name', 'target.label', 'target.path'];
    if (!Array.isArray(parsed.columns) || !Array.isArray(parsed.rows)
      || requiredColumns.some((column) => !parsed.columns!.includes(column))) {
      throw new Error('CBM_IMPORT_UNEXPECTED_SHAPE');
    }
    const index = (column: string) => parsed.columns!.indexOf(column);
    const candidates = parsed.rows.map((row): CbmImportCandidateV1 => {
      if (row.length <= Math.max(...requiredColumns.map(index))) throw new Error('CBM_IMPORT_MALFORMED_ROW');
      const fromPath = normalizeCbmRelativePathV1(String(row[index('source.path')]));
      const toPath = normalizeCbmRelativePathV1(String(row[index('target.path')]));
      if ((endpoint === 'target' ? toPath : fromPath) !== requestedPath) throw new Error('CBM_IMPORT_PATH_MISMATCH');
      return {
        fromPath, fromLabel: String(row[index('source.label')]),
        toPath, toLabel: String(row[index('target.label')]),
        relation: 'IMPORTS', identity: 'UNRESOLVED_NEEDS_ATLAS_IDENTITY',
      };
    });
    const total = parsed.total ?? candidates.length;
    return {
      backend: 'CODEBASE_MEMORY_MCP', version: deps.version ?? '0.11.0', queryClass: 'IMPORTS', trustTier: 2,
      project: deps.project, direction: deps.direction, requestedPath, candidates, total,
      truncated: Boolean(parsed.truncated || parsed.has_more || total > candidates.length),
      graphSnapshotBound: false, emptyMeansUnknown: true, canonicalAuthority: false,
    } satisfies CbmImportCandidateReceiptV1;
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

/**
 * CBM-IDENTITY-01 / CBM-FALLBACK-01 / CBM-NEGATIVE-01. Pure decision helpers over CBM receipts; they never
 * call CBM or Atlas themselves. An observation is QUALIFIED only when the injected Atlas lookup returns a
 * canonicalId plus real (non-sentinel) workspace and source revisions AND the CBM index is provably fresh
 * (stale === false). Everything else stays a diagnostic challenger observation.
 */
export interface CbmObservationRefV1 {
  sourceRef: string;
  symbol?: string;
  span?: { startLine: number; endLine: number } | null;
  stale: boolean | null;
}

export interface CbmAtlasIdentityLookupV1 {
  canonicalId: string | null;
  workspaceRevision: string | null;
  sourceRevision: string | null;
}

export type CbmQualificationV1 =
  | { status: 'QUALIFIED'; sourceRef: string; canonicalId: string; workspaceRevision: string; sourceRevision: string }
  | { status: 'DIAGNOSTIC_ONLY'; sourceRef: string; reason: 'STALE_INDEX' | 'SNAPSHOT_UNBOUND' | 'IDENTITY_UNRESOLVED' | 'REVISION_UNQUALIFIED' | 'LOOKUP_FAILED' };

const isRealId = (v: string | null | undefined): v is string => typeof v === 'string' && !CACHE_SENTINEL_VALUES.has(v.trim().toLowerCase());

export async function qualifyCbmObservationV1(
  obs: CbmObservationRefV1,
  lookup: (sourceRef: string) => Promise<CbmAtlasIdentityLookupV1 | null>,
): Promise<CbmQualificationV1> {
  const sourceRef = norm(obs.sourceRef);
  if (obs.stale === true) return { status: 'DIAGNOSTIC_ONLY', sourceRef, reason: 'STALE_INDEX' };
  if (obs.stale === null) return { status: 'DIAGNOSTIC_ONLY', sourceRef, reason: 'SNAPSHOT_UNBOUND' };
  let found: CbmAtlasIdentityLookupV1 | null;
  try { found = await lookup(sourceRef); } catch { return { status: 'DIAGNOSTIC_ONLY', sourceRef, reason: 'LOOKUP_FAILED' }; }
  if (!found || !isRealId(found.canonicalId)) return { status: 'DIAGNOSTIC_ONLY', sourceRef, reason: 'IDENTITY_UNRESOLVED' };
  if (!isRealId(found.workspaceRevision) || !isRealId(found.sourceRevision)) {
    return { status: 'DIAGNOSTIC_ONLY', sourceRef, reason: 'REVISION_UNQUALIFIED' };
  }
  return { status: 'QUALIFIED', sourceRef, canonicalId: found.canonicalId, workspaceRevision: found.workspaceRevision, sourceRevision: found.sourceRevision };
}

export type CbmFallbackDecisionV1 =
  | { use: 'CBM'; absence: 'NOT_CLAIMED' }
  | { use: 'RG_SOURCE_FALLBACK'; reason: 'EMPTY' | 'STALE' | 'STALE_UNKNOWN' | 'AMBIGUOUS'; absence: 'UNKNOWN' };

/** Empty/stale/unknown-freshness/ambiguous CBM results route to rg/source; empty is UNKNOWN, never ABSENT. */
export function decideCbmFallbackV1(observations: CbmObservationRefV1[]): CbmFallbackDecisionV1 {
  if (observations.length === 0) return { use: 'RG_SOURCE_FALLBACK', reason: 'EMPTY', absence: 'UNKNOWN' };
  if (observations.some((o) => o.stale === true)) return { use: 'RG_SOURCE_FALLBACK', reason: 'STALE', absence: 'UNKNOWN' };
  if (observations.some((o) => o.stale === null)) return { use: 'RG_SOURCE_FALLBACK', reason: 'STALE_UNKNOWN', absence: 'UNKNOWN' };
  if (new Set(observations.map((o) => norm(o.sourceRef))).size > 1) return { use: 'RG_SOURCE_FALLBACK', reason: 'AMBIGUOUS', absence: 'UNKNOWN' };
  return { use: 'CBM', absence: 'NOT_CLAIMED' };
}

export interface CbmTextMatchV1 {
  sourceRef: string;
  line: number;
  content: string;
  contentTruncated: boolean;
  stale: boolean | null;
  identity: 'UNRESOLVED_NEEDS_ATLAS_IDENTITY';
}

export interface CbmTextReceiptV1 {
  backend: 'CODEBASE_MEMORY_MCP';
  version: string;
  queryClass: 'TEXT';
  trustTier: 1;
  project: string;
  pattern: string;
  matches: CbmTextMatchV1[];
  totalGrepMatches: number;
  truncated: boolean;
  emptyMeansUnknown: true;
  canonicalAuthority: false;
}

interface CbmTextJsonV1 {
  raw_matches?: { cols?: string[]; rows?: Array<Array<string | number | boolean | null>> };
  total_grep_matches?: number;
  has_more?: boolean;
  raw_has_more?: boolean;
}

/**
 * TEXT query class: bounded `search_code`. Shape verified against CBM 0.11.0 `search_code format:json`
 * (`raw_matches.{cols,rows}` with file/line/content). `file` is relative to the CBM project root, so callers
 * pass `projectRootRelativeToRepo` to produce repo-relative sourceRefs. Empty is UNKNOWN, never ABSENT.
 */
export function makeCbmTextSearchHandlerV1(deps: {
  runTool: (tool: 'search_code', args: Record<string, unknown>) => Promise<string>;
  project: string;
  pattern: string;
  projectRootRelativeToRepo?: string;
  pathFilter?: string;
  version?: string;
  maxMatches?: number;
  maxContentChars?: number;
  resolveSnapshotBinding?: (sourceRef: string) => Promise<CbmSnapshotBindingCheckV1 | null>;
}): ContextDagNodeHandlerV1 {
  return async () => {
    const maxMatches = deps.maxMatches ?? 20;
    const maxChars = deps.maxContentChars ?? 240;
    if (!deps.pattern.trim()) throw new Error('CBM_TEXT_EMPTY_PATTERN');
    if (!Number.isSafeInteger(maxMatches) || maxMatches < 1 || maxMatches > 200) throw new Error('CBM_TEXT_INVALID_LIMIT');
    if (!Number.isSafeInteger(maxChars) || maxChars < 1 || maxChars > 2000) throw new Error('CBM_TEXT_INVALID_LIMIT');
    const prefix = deps.projectRootRelativeToRepo ? norm(deps.projectRootRelativeToRepo).replace(/\/+$/, '') + '/' : '';
    if (prefix && (prefix.startsWith('/') || prefix.split('/').includes('..'))) throw new Error('CBM_TEXT_INVALID_RELATIVE_PATH');
    const args: Record<string, unknown> = { project: deps.project, pattern: deps.pattern, limit: maxMatches, format: 'json' };
    if (deps.pathFilter) args.path_filter = deps.pathFilter;
    const parsed = parseCbmJsonV1<CbmTextJsonV1>(await deps.runTool('search_code', args), 'CBM_TEXT_NOT_JSON');
    const raw = parsed.raw_matches;
    if (!raw || !Array.isArray(raw.cols) || !Array.isArray(raw.rows)) throw new Error('CBM_TEXT_UNEXPECTED_SHAPE');
    const idx = (c: string) => raw.cols!.indexOf(c);
    const [iFile, iLine, iContent] = [idx('file'), idx('line'), idx('content')];
    if (iFile < 0 || iLine < 0 || iContent < 0) throw new Error('CBM_TEXT_UNEXPECTED_COLUMNS');
    const rows = raw.rows.slice(0, maxMatches);
    const freshness = new Map<string, Promise<boolean | null>>();
    const matches: CbmTextMatchV1[] = [];
    for (const row of rows) {
      const file = norm(String(row[iFile]));
      const line = Number(row[iLine]);
      if (!file || file.startsWith('/') || file.split('/').includes('..') || !Number.isSafeInteger(line) || line < 1) {
        throw new Error('CBM_TEXT_MALFORMED_ROW');
      }
      const sourceRef = prefix + file;
      if (!freshness.has(sourceRef)) freshness.set(sourceRef, getCbmFreshnessV1(deps.resolveSnapshotBinding, sourceRef));
      const text = String(row[iContent]);
      matches.push({
        sourceRef, line, content: text.slice(0, maxChars), contentTruncated: text.length > maxChars,
        stale: await freshness.get(sourceRef)!, identity: 'UNRESOLVED_NEEDS_ATLAS_IDENTITY',
      });
    }
    return {
      backend: 'CODEBASE_MEMORY_MCP', version: deps.version ?? '0.11.0', queryClass: 'TEXT', trustTier: 1,
      project: deps.project, pattern: deps.pattern, matches,
      totalGrepMatches: parsed.total_grep_matches ?? matches.length,
      truncated: Boolean(parsed.has_more || parsed.raw_has_more || raw.rows.length > matches.length),
      emptyMeansUnknown: true, canonicalAuthority: false,
    } satisfies CbmTextReceiptV1;
  };
}
