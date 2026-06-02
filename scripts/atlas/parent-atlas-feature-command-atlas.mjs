#!/usr/bin/env node
import { readJson, readText, resolveRepoPath, writeJson, writeMarkdown, parentAtlasMarkdown, topEntries } from './_atlas-utils.mjs';

const FEATURE_REGISTRY_PATH = resolveRepoPath('docs/atlas/feature-registry.json');
const TODO_PATH = resolveRepoPath('MASTER-FEATURE-TODO-2026-05-20.md');
const REPORT_JSON = resolveRepoPath('docs/reports/parent-atlas-feature-command-atlas.json');
const REPORT_MD = resolveRepoPath('docs/reports/parent-atlas-feature-command-atlas.md');

const LANE_DEFS = [
  {
    laneId: 'sourceRef_spine',
    title: 'SourceRef Spine',
    description: 'Parent Atlas join spine, NES chrom packets, feature_id joins, and card replay surfaces.',
    keywords: ['sourceref', 'feature_id', 'featureid', 'nes chrom', 'parent atlas', 'replay spine'],
  },
  {
    laneId: 'durable_truth',
    title: 'Durable Truth',
    description: 'Postgres 18, JSONB, pgvector, DuckDB mirrors, CouchDB envelopes, and SeaweedFS archives.',
    keywords: ['postgres', 'pgvector', 'jsonb', 'duckdb', 'couchdb', 'seaweedfs', 'drizzle'],
  },
  {
    laneId: 'retrieval_memory',
    title: 'Retrieval Memory',
    description: 'Qdrant, Redis, Bitfrost, ACE packets, multi-query tags, and semantic search caches.',
    keywords: ['qdrant', 'redis', 'bitfrost', 'multi-query', 'retrieval', 'ace packet', 'turbovec'],
  },
  {
    laneId: 'graph_topology',
    title: 'Graph Topology',
    description: 'Neo4j hypergraph merges, SOM topology, cluster joins, and graph path proofs.',
    keywords: ['neo4j', 'hypergraph', 'som', 'pagerank', 'topology'],
  },
  {
    laneId: 'compute_ranking',
    title: 'Compute Ranking',
    description: 'PyTorch, LibTorch, XGBoost, CUDA, reranking, clustering, and feature extraction lanes.',
    keywords: ['pytorch', 'libtorch', 'xgboost', 'cuda', 'rerank', 'gradient boosting', 'feature extractor', 'autoencoder'],
  },
  {
    laneId: 'orchestration_future',
    title: 'Future Orchestration',
    description: 'OpenCode, Gemma4, deep_research, MCP tools, and LLM orchestration guardrails.',
    keywords: ['opencode', 'gemma4', 'deep_research', 'mcp', 'llm orchestration'],
  },
];

function scoreEntry(entry, lane) {
  const haystack = [
    entry.featureKey,
    entry.title,
    entry.status,
    entry.summary,
    entry.nextQuery,
    ...(entry.sourceRefs ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const matches = lane.keywords.filter((keyword) => haystack.includes(keyword.toLowerCase()));
  return {
    score: matches.length,
    matches,
  };
}

function collectTodoAnchors(todoText, lane) {
  const lines = todoText.split(/\r?\n/);
  const keywords = lane.keywords.map((keyword) => keyword.toLowerCase());
  return lines
    .filter((line) => keywords.some((keyword) => line.toLowerCase().includes(keyword)))
    .slice(0, 24);
}

function renderMarkdown(report) {
  const summary = {
    registryRows: report.summary.registryRows,
    matchedRows: report.summary.matchedRows,
    laneCount: report.summary.laneCount,
    sourceRefAnchors: report.summary.sourceRefAnchors,
  };
  const rows = report.lanes.map((lane) =>
    `${lane.title}: ${lane.matchCount} matches, keywords=${lane.keywords.join(', ')}, todoAnchors=${lane.todoAnchors.length}`
  );
  return parentAtlasMarkdown('Parent Atlas Feature Command Atlas', summary, rows);
}

function main() {
  const registry = readJson(FEATURE_REGISTRY_PATH, []);
  const todoText = readText(TODO_PATH, '');

  const lanes = LANE_DEFS.map((lane) => {
    const scored = registry
      .map((entry) => {
        const { score, matches } = scoreEntry(entry, lane);
        return score > 0 ? { ...entry, laneScore: score, laneMatches: matches } : null;
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b.laneScore !== a.laneScore) return b.laneScore - a.laneScore;
        const aSources = a.sourceRefs?.length ?? 0;
        const bSources = b.sourceRefs?.length ?? 0;
        if (bSources !== aSources) return bSources - aSources;
        return String(a.title ?? '').localeCompare(String(b.title ?? ''));
      });

    return {
      ...lane,
      matchCount: scored.length,
      topMatches: scored.slice(0, 25).map((entry) => ({
        featureKey: entry.featureKey ?? null,
        title: entry.title ?? null,
        status: entry.status ?? null,
        sourceRefs: entry.sourceRefs ?? [],
        nextQuery: entry.nextQuery ?? null,
        laneScore: entry.laneScore ?? 0,
        laneMatches: entry.laneMatches ?? [],
      })),
      todoAnchors: collectTodoAnchors(todoText, lane),
    };
  });

  const matchedRows = lanes.reduce((sum, lane) => sum + lane.matchCount, 0);
  const sourceRefAnchors = new Set();
  for (const lane of lanes) {
    for (const entry of lane.topMatches) {
      for (const sourceRef of entry.sourceRefs ?? []) sourceRefAnchors.add(sourceRef);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      featureRegistryPath: FEATURE_REGISTRY_PATH,
      todoPath: TODO_PATH,
    },
    summary: {
      registryRows: registry.length,
      matchedRows,
      laneCount: lanes.length,
      sourceRefAnchors: sourceRefAnchors.size,
    },
    lanes,
    topKeywords: topEntries(
      new Map(
        lanes.flatMap((lane) => lane.topMatches.map((entry) => [entry.featureKey ?? entry.title ?? 'unknown', entry.laneScore ?? 0]))
      ),
      12
    ),
  };

  writeJson(REPORT_JSON, report);
  writeMarkdown(REPORT_MD, renderMarkdown(report));

  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
  console.log(`Rows: ${report.summary.registryRows}`);
  console.log(`Matched: ${report.summary.matchedRows}`);
}

main();
