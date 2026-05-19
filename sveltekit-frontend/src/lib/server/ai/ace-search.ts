import { HyperRagFusionService } from '$lib/server/retrieval/hyperrag-fusion-service.js';
import { countTokens } from '$lib/server/llm/token-budget.js';
import type { HyperRagResult, HyperRagHit } from '$lib/server/retrieval/hyperrag-fusion-service.js';

export type AceSearchInput = {
  query: string;
  intent?: 'code' | 'schema' | 'legal' | 'startup' | 'debug';
  limit?: number;
  includeFullText?: boolean;
  tokenBudget?: number;
};

export type AceSearchOutput = {
  query: string;
  hits: AceSearchHit[];
  ontology: AceSearchOntology;
  llm_synthesis: AceSearchSynthesis;
};

export type AceSearchHit = {
  chunk_id: string;
  file: string;
  lines?: string;
  summary?: string;
  cacheLayer?: string | null;
  why: string;
  tags: string[];
  weights: {
    attention_weight: number;
    cosine_weight: number;
    bm25_weight: number;
    topology_weight: number;
    authority_weight: number;
    llm_synthesis_weight: number;
  };
};

export type AceSearchOntology = {
  entities: string[];
  relations: Array<[string, string, string]>;
};

export type AceSearchSynthesis = {
  summary: string;
  next_actions: string[];
  token_estimate: number;
};

const INTENT_MODE_MAP: Record<NonNullable<AceSearchInput['intent']>, string> = {
  code: 'codebase',
  schema: 'docs',
  legal: 'legal',
  startup: 'codebase',
  debug: 'codebase',
};

function hitTags(hit: HyperRagHit): string[] {
  const payload = hit.payload as Record<string, unknown> | undefined;
  const tags = Array.isArray(payload?.tags) ? payload.tags.filter((t): t is string => typeof t === 'string') : [];
  if (hit.signals?.topoClass && !tags.includes(String(hit.signals.topoClass))) {
    tags.push(String(hit.signals.topoClass));
  }
  return tags;
}

function hitWhy(hit: HyperRagHit): string {
  if (hit.reasons?.length) {
    return hit.reasons.join(' | ');
  }
  const payload = hit.payload as Record<string, unknown> | undefined;
  return typeof payload?.summary === 'string'
    ? payload.summary
    : hit.title ?? 'Relevant chunk matched by hybrid retrieval';
}

function normalizeHit(hit: HyperRagHit, includeFullText: boolean): AceSearchHit {
  const payload = hit.payload as Record<string, unknown> | undefined;
  const chunkId = String(payload?.chunk_id ?? hit.id ?? 'unknown');
  const file = String(payload?.doc_id ?? payload?.sourcePath ?? hit.sourcePath ?? 'unknown');
  const lineRange = payload?.lines ?? payload?.lineRange ?? payload?.range;
  const cosineWeight = Number(hit.signals?.dense ?? 0);
  const bm25Weight = Number(hit.signals?.lexicalBoost ?? 0);
  const topologyWeight = Number(hit.signals?.clusterMatch ?? 0);
  const authorityWeight = Number(hit.signals?.pagerank ?? hit.signals?.graphAuthority ?? 0);
  const attentionWeight = Number(hit.signals?.dense ?? hit.score ?? 0);
  const llmSynthesisWeight =
    0.35 * cosineWeight +
    0.2 * bm25Weight +
    0.2 * topologyWeight +
    0.15 * authorityWeight +
    0.2 * attentionWeight;

  return {
    chunk_id: chunkId,
    file,
    lines: typeof lineRange === 'string' ? lineRange : undefined,
    summary: typeof payload?.summary === 'string' ? payload.summary : undefined,
    cacheLayer:
      typeof payload?.cacheLayer === 'string'
        ? payload.cacheLayer
        : typeof payload?.cache_layer === 'string'
        ? payload.cache_layer
        : null,
    why: hitWhy(hit),
    tags: hitTags(hit),
    weights: {
      attention_weight: attentionWeight,
      cosine_weight: cosineWeight,
      bm25_weight: bm25Weight,
      topology_weight: topologyWeight,
      authority_weight: authorityWeight,
      llm_synthesis_weight: llmSynthesisWeight,
    },
  };
}

function buildOntology(result: HyperRagResult): AceSearchOntology {
  const entitiesSet = new Set<string>();
  const relationsSet = new Set<string>();

  const addRelation = (subject: unknown, predicate: unknown, object: unknown) => {
    if (typeof subject === 'string' && typeof predicate === 'string' && typeof object === 'string') {
      relationsSet.add(`${subject}|||${predicate}|||${object}`);
    }
  };

  const addEntityArray = (source: unknown) => {
    if (Array.isArray(source)) {
      for (const item of source) {
        if (typeof item === 'string') entitiesSet.add(item);
      }
    }
  };

  if (result.contextPack && typeof result.contextPack === 'object') {
    const ctx = result.contextPack as Record<string, unknown>;
    addEntityArray(ctx.entities);
    if (Array.isArray(ctx.relations)) {
      for (const relation of ctx.relations) {
        if (Array.isArray(relation) && relation.length === 3) {
          addRelation(relation[0], relation[1], relation[2]);
        }
      }
    }
  }

  for (const hit of result.hits) {
    const payload = hit.payload as Record<string, unknown> | undefined;
    addEntityArray(payload?.entities);
    if (Array.isArray(payload?.relations)) {
      for (const relation of payload.relations) {
        if (Array.isArray(relation) && relation.length === 3) {
          addRelation(relation[0], relation[1], relation[2]);
        }
      }
    }
  }

  return {
    entities: Array.from(entitiesSet),
    relations: Array.from(relationsSet).map((item) => item.split('|||') as [string, string, string]),
  };
}

function buildSynthesis(result: HyperRagResult): AceSearchSynthesis {
  const summary = typeof result.synthesis === 'string' ? result.synthesis : '';
  const tokenEstimate = countTokens(summary);
  const contextPackObj = result.contextPack as Record<string, unknown> | undefined;
  const nextActions = Array.isArray(contextPackObj?.recommendations)
    ? (contextPackObj!.recommendations as string[]).slice(0, 5)
    : [];

  return {
    summary,
    next_actions: nextActions,
    token_estimate: tokenEstimate,
  };
}

export async function searchAce(input: AceSearchInput, userId?: string): Promise<AceSearchOutput> {
  const service = HyperRagFusionService.getInstance();
  const mode = input.intent ? INTENT_MODE_MAP[input.intent] : 'codebase';
  const topK = input.limit ?? 3;

  const result = await service.search({
    query: input.query,
    mode: mode as any,
    topK: topK * 3,
    synthesize: true,
    useAceCache: true,
    useGraph: true,
    useTurboVec: true,
    useTopologyRouting: true,
    topologyTopK: Math.min(5, topK),
    userId,
    tokenBudget: input.tokenBudget,
  });

  const hits = result.hits.slice(0, topK).map((hit) => normalizeHit(hit, Boolean(input.includeFullText)));

  return {
    query: input.query,
    hits,
    ontology: buildOntology(result),
    llm_synthesis: buildSynthesis(result),
  };
}
