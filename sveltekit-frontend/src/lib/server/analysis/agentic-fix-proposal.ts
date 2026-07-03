import { handleRepairToolCall } from '../../../mcp/tools/repair_tools.js';
import { recordAgenticProposalEngram } from '../ai/engram-registry.js';

type ToolJson = Record<string, unknown>;

type ProvenanceLike = {
  featureId?: string | null;
  feature_id?: string | null;
  titleId?: string | null;
  title_id?: string | null;
  packetKey?: string | null;
  packet_key?: string | null;
  packetUlid?: string | null;
  packet_ulid?: string | null;
  sourceRef?: string | null;
  source_ref?: string | null;
  sourceRefs?: string[] | null;
  source_refs?: string[] | null;
  workspaceTaskId?: string | null;
  workspace_task_id?: string | null;
  parentAtlasCardId?: string | null;
  parent_atlas_card_id?: string | null;
  tupleHash?: string | null;
  semanticHash?: string | null;
};

export interface AgenticFixProposalInput {
  query: string;
  filePath?: string;
  clusterId?: number | null;
  featureId?: string | null;
  feature_id?: string | null;
  titleId?: string | null;
  title_id?: string | null;
  packetKey?: string | null;
  packet_key?: string | null;
  packetUlid?: string | null;
  packet_ulid?: string | null;
  sourceRef?: string | null;
  source_ref?: string | null;
  sourceRefs?: string[] | null;
  source_refs?: string[] | null;
  workspaceTaskId?: string | null;
  workspace_task_id?: string | null;
  parentAtlasCardId?: string | null;
  parent_atlas_card_id?: string | null;
  tupleHash?: string | null;
  semanticHash?: string | null;
  rawText?: string | null;
  errorText?: string | null;
  jsonPayload?: Record<string, unknown> | null;
  provenance?: ProvenanceLike | null;
  semanticTuple?: {
    provenance?: ProvenanceLike | null;
  } | null;
}

export interface AgenticFixProposalResult {
  ok: boolean;
  query: string;
  filePath: string | null;
  clusterId: number | null;
  featureId: string | null;
  feature_id: string | null;
  sourceRef: string | null;
  sourceRefs: string[];
  workspaceTaskId: string | null;
  workspace_task_id: string | null;
  parentAtlasCardId: string | null;
  parent_atlas_card_id: string | null;
  tupleHash: string | null;
  semanticHash: string | null;
  missingFeatureId: boolean;
  warning: string | null;
  proposalKind: 'parallel-agentic-proposal';
  observedStates: Record<string, boolean>;
  laneOrder: string[];
  tools: {
    langextract: ToolJson | null;
    hmm: ToolJson | null;
    topologicalSort: ToolJson | null;
    graphrag: ToolJson | null;
    rerank: ToolJson | null;
    wiki: ToolJson | null;
  };
  canonicalEnvelope: ToolJson | null;
  suggestions: Array<{
    suggestion: string;
    successRate: number;
    similarError: string;
    relevance: number;
  }>;
  proposalMarkdown: string;
}

function asJsonPayload(payload: unknown): ToolJson | null {
  if (!payload || typeof payload !== 'object') return null;
  return payload as ToolJson;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanStringArray(values: unknown[]): string[] {
  return [...new Set(values.map((value) => cleanString(value)).filter((value): value is string => Boolean(value)))];
}

function resolveFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    const cleaned = cleanString(value);
    if (cleaned) return cleaned;
  }
  return null;
}

const FEATURE_ID_RE =
  /(?:^|[\s,{])["']?(?:feature_id|featureId)["']?\s*[:=]\s*["']?([A-Za-z0-9._:/@#-]+)["']?/m;
const WORKSPACE_TASK_ID_RE =
  /(?:^|[\s,{])["']?(?:workspace_task_id|workspaceTaskId)["']?\s*[:=]\s*["']?([A-Za-z0-9._:/@#-]+)["']?/m;
const PARENT_ATLAS_CARD_ID_RE =
  /(?:^|[\s,{])["']?(?:parent_atlas_card_id|parentAtlasCardId)["']?\s*[:=]\s*["']?([A-Za-z0-9._:/@#-]+)["']?/m;
const SOURCE_REF_RE =
  /(?:^|[\s,{])["']?(?:source_ref|sourceRef)["']?\s*[:=]\s*["']?([^"',}\n\r]+)["']?/m;

function extractRegexValue(input: unknown, regex: RegExp): string | null {
  if (typeof input !== 'string') return null;
  const match = regex.exec(input);
  return match?.[1]?.trim() || null;
}

function extractPayloadString(payload: Record<string, unknown> | null | undefined, ...keys: string[]): string | null {
  if (!payload) return null;
  return resolveFirstString(...keys.map((key) => payload[key]));
}

function extractPayloadStringArray(payload: Record<string, unknown> | null | undefined, ...keys: string[]): string[] {
  if (!payload) return [];
  const values = keys.flatMap((key) => {
    const value = payload[key];
    return Array.isArray(value) ? value : [];
  });
  return cleanStringArray(values);
}

function buildFallbackRawText(input: AgenticFixProposalInput): string {
  return [input.rawText, input.query, input.errorText]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n');
}

function normalizeProposalJoinKeys(input: AgenticFixProposalInput): {
  featureId: string | null;
  feature_id: string | null;
  workspaceTaskId: string | null;
  workspace_task_id: string | null;
  parentAtlasCardId: string | null;
  parent_atlas_card_id: string | null;
  sourceRef: string | null;
  source_ref: string | null;
  sourceRefs: string[];
  source_refs: string[];
  missingFeatureId: boolean;
  warning: string | null;
} {
  const payload = input.jsonPayload ?? null;
  const fallbackRaw = buildFallbackRawText(input);

  // Regex extraction is fallback only. sourceRef + feature_id remains the canonical Parent Atlas replay/join spine.
  const featureId = resolveFirstString(
    input.featureId,
    input.feature_id,
    input.provenance?.featureId,
    input.provenance?.feature_id,
    input.semanticTuple?.provenance?.featureId,
    input.semanticTuple?.provenance?.feature_id,
    extractPayloadString(payload, 'featureId', 'feature_id'),
    extractRegexValue(fallbackRaw, FEATURE_ID_RE),
  );
  const workspaceTaskId = resolveFirstString(
    input.workspaceTaskId,
    input.workspace_task_id,
    input.provenance?.workspaceTaskId,
    input.provenance?.workspace_task_id,
    input.semanticTuple?.provenance?.workspaceTaskId,
    input.semanticTuple?.provenance?.workspace_task_id,
    extractPayloadString(payload, 'workspaceTaskId', 'workspace_task_id'),
    extractRegexValue(fallbackRaw, WORKSPACE_TASK_ID_RE),
  );
  const parentAtlasCardId = resolveFirstString(
    input.parentAtlasCardId,
    input.parent_atlas_card_id,
    input.provenance?.parentAtlasCardId,
    input.provenance?.parent_atlas_card_id,
    input.semanticTuple?.provenance?.parentAtlasCardId,
    input.semanticTuple?.provenance?.parent_atlas_card_id,
    extractPayloadString(payload, 'parentAtlasCardId', 'parent_atlas_card_id'),
    extractRegexValue(fallbackRaw, PARENT_ATLAS_CARD_ID_RE),
  );
  const sourceRef = resolveFirstString(
    input.sourceRef,
    input.source_ref,
    input.provenance?.sourceRef,
    input.provenance?.source_ref,
    input.semanticTuple?.provenance?.sourceRef,
    input.semanticTuple?.provenance?.source_ref,
    extractPayloadString(payload, 'sourceRef', 'source_ref'),
    extractRegexValue(fallbackRaw, SOURCE_REF_RE),
  );
  const sourceRefs = cleanStringArray([
    input.sourceRef,
    input.source_ref,
    input.provenance?.sourceRef,
    input.provenance?.source_ref,
    input.semanticTuple?.provenance?.sourceRef,
    input.semanticTuple?.provenance?.source_ref,
    ...(input.sourceRefs ?? []),
    ...(input.source_refs ?? []),
    ...(input.provenance?.sourceRefs ?? []),
    ...(input.provenance?.source_refs ?? []),
    ...(input.semanticTuple?.provenance?.sourceRefs ?? []),
    ...(input.semanticTuple?.provenance?.source_refs ?? []),
    ...extractPayloadStringArray(payload, 'sourceRefs', 'source_refs'),
    sourceRef,
  ]);
  const missingFeatureId = !featureId;

  return {
    featureId,
    feature_id: featureId,
    workspaceTaskId,
    workspace_task_id: workspaceTaskId,
    parentAtlasCardId,
    parent_atlas_card_id: parentAtlasCardId,
    sourceRef,
    source_ref: sourceRef,
    sourceRefs,
    source_refs: sourceRefs,
    missingFeatureId,
    warning: missingFeatureId ? 'agentic_proposal_missing_feature_id' : null,
  };
}

function resolveFeatureId(input: AgenticFixProposalInput): string | null {
  return resolveFirstString(
    input.featureId,
    input.feature_id,
    input.provenance?.featureId,
    input.provenance?.feature_id,
    input.semanticTuple?.provenance?.featureId,
    input.semanticTuple?.provenance?.feature_id,
  );
}

function resolveWorkspaceTaskId(input: AgenticFixProposalInput): string | null {
  return resolveFirstString(
    input.workspaceTaskId,
    input.workspace_task_id,
    input.provenance?.workspaceTaskId,
    input.provenance?.workspace_task_id,
    input.semanticTuple?.provenance?.workspaceTaskId,
    input.semanticTuple?.provenance?.workspace_task_id,
  );
}

function resolveParentAtlasCardId(input: AgenticFixProposalInput): string | null {
  return resolveFirstString(
    input.parentAtlasCardId,
    input.parent_atlas_card_id,
    input.provenance?.parentAtlasCardId,
    input.provenance?.parent_atlas_card_id,
    input.semanticTuple?.provenance?.parentAtlasCardId,
    input.semanticTuple?.provenance?.parent_atlas_card_id,
  );
}

function resolveSourceRefs(input: AgenticFixProposalInput): string[] {
  const sourceRefs = [
    input.sourceRef,
    input.provenance?.sourceRef,
    input.semanticTuple?.provenance?.sourceRef,
    ...(input.sourceRefs ?? []),
    ...(input.provenance?.sourceRefs ?? []),
    ...(input.semanticTuple?.provenance?.sourceRefs ?? []),
  ];
  return cleanStringArray(sourceRefs);
}

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolJson | null> {
  const response = await handleRepairToolCall(name, args);
  const text = response?.content?.[0]?.text;
  if (!text) return null;
  try {
    return JSON.parse(text) as ToolJson;
  } catch {
    return { raw: text };
  }
}

function buildObservedStates(query: string, filePath?: string): Record<string, boolean> {
  const haystack = `${filePath ?? ''}\n${query}`.toLowerCase();
  return {
    langextract: /langextract|extract|entity|citation|sourceref/.test(haystack),
    graph: /graph|neo4j|kag|hypergraph|edge|node/.test(haystack),
    rerank: /rerank|rank|score|bm25|cosine|retrieval/.test(haystack),
    hmm: /hmm|state|transition|sequence/.test(haystack),
    ace_packet: /ace|packet|tuple|cache|provenance/.test(haystack),
    engram_memory: /engram|memory|claude-mem|memo/.test(haystack),
    atlas_memory: /atlas|sourceRef|feature_id|alias_id|cluster/.test(haystack),
    gemma4_memory: /gemma|tool-calling|function-call|agentic/.test(haystack),
  };
}

function buildGraphFacts(query: string, filePath?: string): string[][] {
  const facts: string[][] = [];
  const lines = String(query ?? '').split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    facts.push([filePath ?? 'query', `line:${index + 1}`, trimmed]);
    if (facts.length >= 20) break;
  }
  if (facts.length === 0 && filePath) {
    facts.push([filePath, 'source', 'error query had no structured lines']);
  }
  return facts;
}

function buildRerankCandidates(
  query: string,
  filePath?: string,
  envelope?: {
    featureId?: string | null;
    titleId?: string | null;
    packetKey?: string | null;
    packetUlid?: string | null;
    sourceRef?: string | null;
    canonicalSourceRef?: string | null;
  }
): Array<Record<string, unknown>> {
  const lines = String(query ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 20);
  return lines.map((text, index) => ({
    chunkId: `${filePath ?? 'query'}:${index + 1}`,
    packet_id: null,
    packet_ulid: envelope?.packetUlid ?? null,
    packet_key: envelope?.packetKey ?? `${filePath ?? 'query'}:${index + 1}`,
    title_id: envelope?.titleId ?? null,
    feature_id: envelope?.featureId ?? null,
    source_ref: envelope?.sourceRef ?? filePath ?? null,
    canonical_source_ref: envelope?.canonicalSourceRef ?? envelope?.sourceRef ?? filePath ?? null,
    text,
    filePath: filePath ?? null,
    qdrantScore: Math.max(0, 1 - index * 0.04),
    concepts: [],
    entities: [],
    nouns: [],
    verbs: [],
    ast_tags: [],
  }));
}

function topSuggestion(query: string, orderedStates: string[]): Array<{
  suggestion: string;
  successRate: number;
  similarError: string;
  relevance: number;
}> {
  return orderedStates.slice(0, 5).map((state, index) => ({
    suggestion: `Route ${state} into the ${index + 1}th repair lane and validate dependencies before edits.`,
    successRate: Math.max(0.35, 0.9 - index * 0.08),
    similarError: query.slice(0, 120),
    relevance: Math.max(0.4, 0.95 - index * 0.1),
  }));
}

function computeSessionId(query: string, filePath: string | null, clusterId: number | null): string {
  return [
    'agentic-fix-proposal',
    clusterId ?? 'no-cluster',
    filePath ?? 'no-file',
    query.slice(0, 48).replace(/\s+/g, '_'),
  ].join(':');
}

export async function buildAgenticFixProposal(
  input: AgenticFixProposalInput
): Promise<AgenticFixProposalResult> {
  const query = String(input.query ?? '').trim();
  const filePath = input.filePath?.trim() ?? null;
  const clusterId = typeof input.clusterId === 'number' ? input.clusterId : null;
  const normalizedJoinKeys = normalizeProposalJoinKeys(input);
  const featureId = normalizedJoinKeys.featureId;
  const sourceRefs = normalizedJoinKeys.sourceRefs;
  const sourceRef = resolveFirstString(
    normalizedJoinKeys.sourceRef,
    ...normalizedJoinKeys.sourceRefs,
    filePath,
  );
  const workspaceTaskId = normalizedJoinKeys.workspaceTaskId;
  const parentAtlasCardId = normalizedJoinKeys.parentAtlasCardId;
  const tupleHash = resolveFirstString(
    input.tupleHash,
    input.provenance?.tupleHash,
    input.semanticTuple?.provenance?.tupleHash,
  );
  const semanticHash = resolveFirstString(
    input.semanticHash,
    input.provenance?.semanticHash,
    input.semanticTuple?.provenance?.semanticHash,
  );
  const missingFeatureId = normalizedJoinKeys.missingFeatureId;
  const warning = normalizedJoinKeys.warning;

  const observedStates = buildObservedStates(query, filePath ?? undefined);
  const graphFacts = buildGraphFacts(query, filePath ?? undefined);
  const rerankCandidates = buildRerankCandidates(query, filePath ?? undefined, {
    featureId,
    titleId: featureId ?? filePath ?? null,
    packetKey: tupleHash ?? semanticHash ?? null,
    packetUlid: null,
    sourceRef,
    canonicalSourceRef: sourceRef,
  });

  const [langextract, hmm, graphrag, rerank, wiki] = await Promise.all([
    callTool('langextract_extract_error_facts', { text: query, mode: 'error' }),
    callTool('hmm_infer_repair_states', {
      observed: observedStates,
      graphFacts,
      featureId,
    }),
    callTool('graphrag_expand_context', {
      featureId,
      startNode: filePath ?? query.slice(0, 128),
    }),
    callTool('marco_rerank_chunks', {
      query,
      candidates: rerankCandidates,
      limit: 10,
    }),
    callTool('wiki_encyclopedia_search', {
      query: filePath ? `${filePath} ${query}` : query,
    }),
  ]);

  const rerankPayload = asJsonPayload(rerank);
  const canonicalEnvelope =
    (rerankPayload?.canonical_envelope as ToolJson | undefined) ??
    (Array.isArray(rerankPayload?.reranked) ? (rerankPayload.reranked[0] as { canonical_envelope?: ToolJson })?.canonical_envelope ?? null : null) ??
    null;

  const hmmStates = asJsonPayload(hmm)?.states;
  const missingStates = Array.isArray(hmmStates)
    ? hmmStates.map((entry) => String((entry as { state?: unknown }).state ?? '')).filter(Boolean)
    : [];

  const topologicalSort = await callTool('toposort_repair_plan', {
    missingStates,
  });

  const orderedStates = Array.isArray(asJsonPayload(topologicalSort)?.ordered)
    ? (asJsonPayload(topologicalSort)?.ordered as Array<{ state?: string }>).map((row) => String(row.state ?? '')).filter(Boolean)
    : missingStates;

  const laneOrder = [
    'serialization',
    'encoding',
    'indexing',
    'retrieval',
    'ranking',
    'ingestion',
    'repair',
  ];

  const suggestionRows = topSuggestion(query, orderedStates.length ? orderedStates : laneOrder);
  const proposalMarkdown = [
    `# Agentic Repair Proposal`,
    ``,
    `**Trigger:** ${filePath ?? 'query'}`,
    `**Cluster:** ${clusterId ?? 'n/a'}`,
    `**Generated:** ${new Date().toISOString()}`,
    ``,
    `## Observed states`,
    Object.entries(observedStates)
      .map(([state, present]) => `- ${state}: ${present ? 'present' : 'missing'}`)
      .join('\n'),
    ``,
    `## Ordered repair lanes`,
    laneOrder.map((lane, index) => `${index + 1}. ${lane}`).join('\n'),
    ``,
    `## Parallel subagents`,
    `- LangExtract: parse error facts and candidate evidence`,
    `- HMM: infer missing states and repair dependencies`,
    `- GraphRAG: expand neighborhood context`,
    `- Marco rerank: score extracted chunks`,
    `- Wiki: search adjacent documentation`,
    ``,
    `## Evidence snapshot`,
    `### LangExtract`,
    JSON.stringify(langextract ?? {}, null, 2),
    ``,
    `### HMM`,
    JSON.stringify(hmm ?? {}, null, 2),
    ``,
    `### GraphRAG`,
    JSON.stringify(graphrag ?? {}, null, 2),
    ``,
    `### Rerank`,
    JSON.stringify(rerank ?? {}, null, 2),
    ``,
    `### Canonical envelope`,
    JSON.stringify(canonicalEnvelope ?? {}, null, 2),
    ``,
    `### Wiki`,
    JSON.stringify(wiki ?? {}, null, 2),
    ``,
    `## Proposed next actions`,
    ...suggestionRows.map((row, index) => `${index + 1}. ${row.suggestion}`),
    ``,
    `## Serialization / encoding / indexing / retrieval / ranking / ingestion order`,
    `1. Serialization — normalize error payloads into immutable JSON packets.`,
    `2. Encoding — generate tuple-safe provenance and summaries.`,
    `3. Indexing — persist canonical rows and labels before write-back.`,
    `4. Retrieval — route exact-match, semantic, Qdrant, and graph hits.`,
    `5. Ranking — rerank candidate proposals with provenance scores.`,
    `6. Ingestion — backfill durable stores only after validation passes.`,
  ].join('\n');

  const sessionId = computeSessionId(query, filePath, clusterId);
  await recordAgenticProposalEngram({
    sessionId,
    query,
    filePath,
    clusterId,
    featureId,
    feature_id: normalizedJoinKeys.feature_id,
    sourceRef,
    source_ref: normalizedJoinKeys.source_ref,
    sourceRefs,
    source_refs: normalizedJoinKeys.source_refs,
    workspaceTaskId,
    workspace_task_id: normalizedJoinKeys.workspace_task_id,
    parentAtlasCardId,
    parent_atlas_card_id: normalizedJoinKeys.parent_atlas_card_id,
    tupleHash,
    semanticHash,
    missingFeatureId,
    warning,
    observedStates,
    laneOrder,
    suggestionCount: suggestionRows.length,
    proposalSummary: proposalMarkdown,
    canonicalEnvelope,
  });

  return {
    ok: true,
    query,
    filePath,
    clusterId,
    featureId,
    feature_id: featureId,
    sourceRef,
    sourceRefs,
    workspaceTaskId,
    workspace_task_id: workspaceTaskId,
    parentAtlasCardId,
    parent_atlas_card_id: parentAtlasCardId,
    tupleHash,
    semanticHash,
    missingFeatureId,
    warning,
    proposalKind: 'parallel-agentic-proposal',
    observedStates,
    laneOrder,
    tools: {
      langextract,
      hmm,
      topologicalSort,
      graphrag,
      rerank,
      wiki,
    },
    canonicalEnvelope,
    suggestions: suggestionRows,
    proposalMarkdown,
  };
}
