import { generateContextHash } from '$lib/server/cache-keys.js';
import type { FeatureWikiPacket } from './token-aware-context-packer.js';
import {
  buildContextCacheKey,
  getContextCacheWithSource,
  setContextCache,
  bumpContextCacheHit,
  normalizeContextPack,
  type ContextPack,
} from './llm-context-cache.js';

export type AceContextPlannerState = {
  query: string;
  queryHash: string;
  cacheKey: string;
  modelName: string;
  modelQuant: string;
  backend: string;
  tokenizerHash: string;
  systemPromptHash: string;
  toolDefinitionsHash: string;
  repoGitSha: string;
  corpusHash: string;
  evidenceBundleHash: string;
  ragBundleHash: string;
  graphSnapshotHash: string;
  retrievalModeHash: string;
  sectionTypesHash: string;
  personaKey: string;
  tokenAwarePacking: boolean;
  userId?: string;
  caseId?: string;
  conversationId?: string;
  filePath?: string;
};

export type AceContextPlannerMeta = {
  source: 'redis' | 'postgres' | 'local' | 'miss';
  retrievedAt: string;
  deltaFields: string[];
  estimatedPrefixTokens: number;
};

export type AceContextPlannerHit = {
  cacheKey: string;
  contextHash: string;
  state: AceContextPlannerState;
  packet: FeatureWikiPacket;
  meta: AceContextPlannerMeta;
};

const PLANNER_STATE_KEYS: Array<keyof AceContextPlannerState> = [
  'queryHash',
  'modelName',
  'modelQuant',
  'backend',
  'tokenizerHash',
  'systemPromptHash',
  'toolDefinitionsHash',
  'repoGitSha',
  'corpusHash',
  'evidenceBundleHash',
  'ragBundleHash',
  'graphSnapshotHash',
  'retrievalModeHash',
  'sectionTypesHash',
  'personaKey',
  'tokenAwarePacking',
  'userId',
  'caseId',
  'conversationId',
  'filePath',
];

function diffPlannerState(current: AceContextPlannerState, cached?: Partial<AceContextPlannerState>): string[] {
  if (!cached) return [];
  return PLANNER_STATE_KEYS.filter((key) => current[key] !== cached[key]);
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
}

function estimateTokens(text: string): number {
  return Math.ceil(Math.max(0, text.length) / 4);
}

function normalizePacket(packet: FeatureWikiPacket): FeatureWikiPacket {
  return {
    ...packet,
    topTriples: packet.topTriples ?? packet.topGraphTriples ?? [],
    topGraphTriples: packet.topGraphTriples ?? packet.topTriples ?? [],
    selectedSourceIds: packet.selectedSourceIds ?? [],
    cacheKeys: packet.cacheKeys ?? [],
    warnings: packet.warnings ?? [],
  };
}

function toContextPack(
  state: AceContextPlannerState,
  packet: FeatureWikiPacket,
  meta: AceContextPlannerMeta
): ContextPack {
  const normalized = normalizePacket(packet);
  return normalizeContextPack({
    summary: normalized.summary,
    chunk_ids: normalized.selectedSourceIds.slice(0, 8),
    graph_paths: normalized.topTriples.slice(0, 8).map((triple) => triple.join(' | ')),
    tool_policy: {
      featureId: normalized.featureId,
      glyphMask: normalized.glyphMask,
      topFiles: normalized.topFiles.slice(0, 8),
      topTriples: normalized.topTriples.slice(0, 8),
      cacheKeys: normalized.cacheKeys.slice(0, 8),
      warnings: normalized.warnings.slice(0, 8),
    },
    prefix_tokens_estimated: meta.estimatedPrefixTokens,
    cache_hit: meta.source !== 'miss',
    retrieval_skipped: meta.source !== 'miss',
    backend: state.backend,
    model_name: state.modelName,
    model_quant: state.modelQuant,
    tokenizer_hash: state.tokenizerHash,
    system_prompt_hash: state.systemPromptHash,
    tool_definitions_hash: state.toolDefinitionsHash,
    repo_git_sha: state.repoGitSha,
    corpus_hash: state.corpusHash,
    rag_bundle_hash: state.ragBundleHash,
    graph_snapshot_hash: state.graphSnapshotHash,
    cache_key: state.cacheKey,
    featureId: normalized.featureId,
    glyphMask: normalized.glyphMask,
    topFiles: normalized.topFiles.slice(0, 8),
    topTriples: normalized.topTriples.slice(0, 8),
    selectedSourceIds: normalized.selectedSourceIds.slice(0, 8),
    cacheKeys: normalized.cacheKeys.slice(0, 8),
    warnings: normalized.warnings.slice(0, 8),
    planner_state: {
      queryHash: state.queryHash,
      modelName: state.modelName,
      modelQuant: state.modelQuant,
      backend: state.backend,
      tokenizerHash: state.tokenizerHash,
      systemPromptHash: state.systemPromptHash,
      toolDefinitionsHash: state.toolDefinitionsHash,
      repoGitSha: state.repoGitSha,
      corpusHash: state.corpusHash,
      evidenceBundleHash: state.evidenceBundleHash,
      ragBundleHash: state.ragBundleHash,
      graphSnapshotHash: state.graphSnapshotHash,
      retrievalModeHash: state.retrievalModeHash,
      sectionTypesHash: state.sectionTypesHash,
      personaKey: state.personaKey,
      tokenAwarePacking: state.tokenAwarePacking,
      userId: state.userId,
      caseId: state.caseId,
      conversationId: state.conversationId,
      filePath: state.filePath,
    },
  });
}

function toFeatureWikiPacket(pack: ContextPack): FeatureWikiPacket {
  return {
    featureId: pack.featureId ?? pack.cache_key ?? 'ace-context',
    glyphMask: pack.glyphMask ?? 0,
    summary: pack.summary,
    topFiles: pack.topFiles ?? [],
    topTriples: pack.topTriples ?? [],
    selectedSourceIds: pack.selectedSourceIds ?? pack.chunk_ids ?? [],
    cacheKeys: pack.cacheKeys ?? [],
    warnings: pack.warnings ?? [],
    topGraphTriples: pack.topTriples ?? [],
    toolPolicy: pack.tool_policy ?? {},
  };
}

export function buildAceContextPlannerState(input: {
  query: string;
  userId?: string;
  caseId?: string;
  conversationId?: string;
  filePath?: string;
  modelName?: string;
  modelQuant?: string;
  backend?: string;
  tokenizerHash?: string;
  systemPromptHash?: string;
  toolDefinitionsHash?: string;
  repoGitSha?: string;
  corpusHash?: string;
  evidenceBundleHash?: string;
  ragBundleHash?: string;
  graphSnapshotHash?: string;
  enableWebSearch?: boolean;
  enableWikipedia?: boolean;
  enableCodebaseContext?: boolean;
  includeResearch?: boolean;
  sectionTypes?: string[];
  persona?: string;
  tokenAwarePacking?: boolean;
}): AceContextPlannerState {
  const sectionTypesHash = generateContextHash(JSON.stringify((input.sectionTypes ?? []).slice().sort()));
  const retrievalModeHash = generateContextHash(
    stableStringify({
      enableWebSearch: Boolean(input.enableWebSearch),
      enableWikipedia: Boolean(input.enableWikipedia),
      enableCodebaseContext: Boolean(input.enableCodebaseContext),
      includeResearch: Boolean(input.includeResearch),
      tokenAwarePacking: Boolean(input.tokenAwarePacking),
    })
  );
  const state = {
    query: input.query.trim(),
    queryHash: generateContextHash(input.query.trim()),
    modelName: input.modelName ?? 'gemma4-legal:latest',
    modelQuant: input.modelQuant ?? 'iq4_xs',
    backend: input.backend ?? 'openai-facade',
    tokenizerHash: input.tokenizerHash ?? 'embeddinggemma:latest:768',
    systemPromptHash: input.systemPromptHash ?? generateContextHash('system:yorha-legal'),
    toolDefinitionsHash: input.toolDefinitionsHash ?? generateContextHash('ace-tools:v1'),
    repoGitSha: input.repoGitSha ?? process.env.GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown',
    corpusHash: input.corpusHash ?? 'codebase-graph:unknown',
    evidenceBundleHash: input.evidenceBundleHash ?? 'evidence:none',
    ragBundleHash: input.ragBundleHash ?? 'rag:none',
    graphSnapshotHash: input.graphSnapshotHash ?? 'graph:none',
    retrievalModeHash,
    sectionTypesHash,
    personaKey: input.persona ?? 'default',
    tokenAwarePacking: Boolean(input.tokenAwarePacking),
    userId: input.userId,
    caseId: input.caseId,
    conversationId: input.conversationId,
    filePath: input.filePath,
  };

  const cacheKey = buildContextCacheKey({
    queryHash: state.queryHash,
    modelName: state.modelName,
    modelQuant: state.modelQuant,
    backend: state.backend,
    tokenizerHash: state.tokenizerHash,
    systemPromptHash: state.systemPromptHash,
    toolDefinitionsHash: state.toolDefinitionsHash,
    repoGitSha: state.repoGitSha,
    corpusHash: state.corpusHash,
    evidenceBundleHash: state.evidenceBundleHash,
    ragBundleHash: state.ragBundleHash,
    graphSnapshotHash: state.graphSnapshotHash,
    retrievalModeHash: state.retrievalModeHash,
    sectionTypesHash: state.sectionTypesHash,
    personaKey: state.personaKey,
    tokenAwarePacking: state.tokenAwarePacking,
    userId: state.userId,
    caseId: state.caseId,
    conversationId: state.conversationId,
    filePath: state.filePath,
  });
  return {
    ...state,
    cacheKey,
  };
}

export async function loadAceContextPlannerHit(state: AceContextPlannerState): Promise<AceContextPlannerHit | null> {
  const retrievedAt = new Date().toISOString();

  try {
    const { source, pack } = await getContextCacheWithSource(state.cacheKey);
    if (pack) {
      const packet = toFeatureWikiPacket(pack);
      void bumpContextCacheHit(state.cacheKey).catch(() => {});
      const deltaFields = diffPlannerState(state, pack.planner_state as Partial<AceContextPlannerState> | undefined);
      return {
        cacheKey: state.cacheKey,
        contextHash: state.cacheKey,
        state,
        packet,
        meta: {
          source,
          retrievedAt,
          deltaFields,
          estimatedPrefixTokens: pack.prefix_tokens_estimated ?? estimateTokens(JSON.stringify(packet)),
        },
      };
    }
  } catch {
    // Cache lane is optional.
  }

  return null;
}

export async function storeAceContextPlannerHit(
  state: AceContextPlannerState,
  packet: FeatureWikiPacket,
  meta: Partial<AceContextPlannerMeta> = {}
): Promise<void> {
  const normalizedPacket = normalizePacket(packet);
  const contextPack = toContextPack(state, normalizedPacket, {
    source: meta.source ?? 'miss',
    retrievedAt: meta.retrievedAt ?? new Date().toISOString(),
    deltaFields: meta.deltaFields ?? [],
    estimatedPrefixTokens: meta.estimatedPrefixTokens ?? estimateTokens(JSON.stringify(normalizedPacket)),
  });

  await setContextCache(state.cacheKey, contextPack).catch(() => {});
}
