#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const REPORTS_DIR = join(ROOT, 'docs', 'reports');
const GRAPH_DIR = join(ROOT, 'docs', 'graph');
// Qdrant URL resolved from canonical helper
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';

const FILES = {
  neo4jGraphRagReport: join(GRAPH_DIR, 'repo-neo4j-graphrag-report.json'),
  pagerankTop100: join(GRAPH_DIR, 'codebase-pagerank-top100.json'),
  clusterAliases: join(GRAPH_DIR, 'cluster-aliases.json'),
  codebaseGraph: join(GRAPH_DIR, 'codebase-graph.json'),
  traceCommandSuggest: join(ROOT, 'src', 'lib', 'server', 'admin', 'ai-chat-context.ts'),
  atlasAdminUi: join(ROOT, 'src', 'routes', '(app)', 'admin', 'atlas', '+page.svelte'),
  opencodeSkill: join(ROOT, 'src', 'lib', 'server', 'ai', 'opencode-skill.ts'),
  featureRegistry: join(ROOT, 'src', 'lib', 'server', 'db', 'schema', 'feature-registry.ts'),
};

function writeJson(pathname, value) {
  mkdirSync(join(pathname, '..'), { recursive: true });
  writeFileSync(pathname, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(pathname, value) {
  mkdirSync(join(pathname, '..'), { recursive: true });
  writeFileSync(pathname, value, 'utf8');
}

function loadJson(pathname) {
  if (!existsSync(pathname)) return null;
  try {
    return JSON.parse(readFileSync(pathname, 'utf8'));
  } catch {
    return null;
  }
}

function readText(pathname) {
  if (!existsSync(pathname)) return '';
  return readFileSync(pathname, 'utf8');
}

function hasText(pathname, pattern) {
  return readText(pathname).includes(pattern);
}

function normalizeRef(value) {
  return String(value ?? '').trim();
}

import { qdrantScroll, getQdrantUrl } from '../qdrant-client.mjs';
const QDRANT_URL = getQdrantUrl();

async function qdrantScrollSample() {
  try {
    const points = await qdrantScroll(QDRANT_COLLECTION, {
      limit: 25,
      with_payload: true,
      with_vector: false,
    });
    return { ok: true, status: 200, sample: Array.isArray(points) ? points : [] };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      sample: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarizePagerank(report) {
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  return {
    present: Boolean(report),
    count: rows.length,
    top: rows.slice(0, 10).map((row) => ({
      rank: row.rank,
      directory: row.directory,
      score: row.score,
      files: row.files,
      status: row.status,
    })),
  };
}

function summarizeClusterAliases(report) {
  const entries = report && typeof report === 'object' ? Object.entries(report) : [];
  const aliases = entries.map(([clusterId, entry]) => ({
    clusterId,
    alias: normalizeRef(entry?.alias ?? ''),
    topic: normalizeRef(entry?.topic ?? ''),
  }));
  return {
    present: Boolean(report),
    count: aliases.length,
    aliases: aliases.slice(0, 12),
  };
}

function summarizeQdrant(sample) {
  const points = Array.isArray(sample?.sample) ? sample.sample : [];
  const refsStats = points.map((point) => {
    const payload = point?.payload ?? {};
    const sourceRefs = Array.isArray(payload.sourceRefs)
      ? payload.sourceRefs
      : Array.isArray(payload.source_refs)
        ? payload.source_refs
        : [];
    const pagerank = payload.neo4j_pageRankScore ?? payload.pagerank_score ?? null;
    return {
      id: String(point?.id ?? ''),
      filePath: normalizeRef(payload.file_path ?? payload.relativePath ?? ''),
      sourceRefsCount: sourceRefs.length,
      hasSourceRefs: sourceRefs.length > 0,
      hasPagerank: pagerank !== null && pagerank !== undefined,
      cluster: payload.neo4j_gpuCluster ?? payload.som_cluster ?? null,
    };
  });
  const withSourceRefs = refsStats.filter((row) => row.hasSourceRefs).length;
  return {
    ok: Boolean(sample?.ok),
    status: sample?.status ?? 0,
    total: points.length,
    withSourceRefs,
    coverage: points.length > 0 ? Number((withSourceRefs / points.length).toFixed(3)) : 0,
    sample: refsStats.slice(0, 12),
    error: sample?.error ?? null,
  };
}

async function main() {
  const neo4jGraphRagReport = loadJson(FILES.neo4jGraphRagReport);
  const pagerankTop100 = loadJson(FILES.pagerankTop100);
  const clusterAliases = loadJson(FILES.clusterAliases);
  const codebaseGraph = loadJson(FILES.codebaseGraph);
  const qdrant = await qdrantScrollSample();

  const phase3 = {
    authorityAudit: {
      graphReportPresent: Boolean(neo4jGraphRagReport),
      pagerankReportPresent: Boolean(pagerankTop100),
      pagerankTop100: summarizePagerank(pagerankTop100),
      graphReportPath: FILES.neo4jGraphRagReport,
      gap: !neo4jGraphRagReport ? 'missing_repo_neo4j_graphrag_report' : null,
    },
    summaryVerification: {
      codebaseGraphPresent: Boolean(codebaseGraph),
      graphNodeCount: Array.isArray(codebaseGraph?.nodes) ? codebaseGraph.nodes.length : null,
      graphEdgeCount: Array.isArray(codebaseGraph?.edges) ? codebaseGraph.edges.length : null,
      note: neo4jGraphRagReport ? 'graph report available' : 'graph report missing in this checkout',
    },
    embeddingParity: {
      qdrantCollection: QDRANT_COLLECTION,
      qdrantUrl: QDRANT_URL,
      sample: summarizeQdrant(qdrant),
    },
  };

  const phase4 = {
    provenanceDisplay: {
      adminAtlasUiPresent: existsSync(FILES.atlasAdminUi),
      sourceRefsHookPresent: hasText(FILES.atlasAdminUi, 'sourceRefs'),
      graphPathsHookPresent: hasText(FILES.atlasAdminUi, 'graphPaths') || hasText(FILES.atlasAdminUi, 'graph paths'),
    },
    clusterVisualization: {
      clusterAliasesPresent: Boolean(clusterAliases),
      aliasCount: summarizeClusterAliases(clusterAliases).count,
      sampleAliases: summarizeClusterAliases(clusterAliases).aliases,
    },
    directEdit: {
      trustTierHooksPresent: hasText(FILES.traceCommandSuggest, 'trustTier') || hasText(FILES.opencodeSkill, 'trustTier'),
      promotionHooksPresent: hasText(FILES.opencodeSkill, 'promotion') || hasText(FILES.opencodeSkill, 'demotion'),
      note: 'Direct edit remains an implementation lane; current codebase has trust-tier plumbing but no operator UI edit surface in this pass.',
    },
    multiLaneRetrieval: {
      traceCommandSuggestHook: hasText(FILES.traceCommandSuggest, 'trace.command_suggest'),
      opencodeSkillPresent: existsSync(FILES.opencodeSkill),
    },
  };

  const phase5 = {
    featureRegistry: {
      featureRegistrySchemaPresent: existsSync(FILES.featureRegistry),
      featureRegistryMentions: hasText(FILES.featureRegistry, 'sourceRefs') || hasText(FILES.featureRegistry, 'trustTier'),
      masterFeatureMapPresent: existsSync(join(ROOT, 'src', 'lib', 'server', 'atlas', 'master-feature-map.ts')),
    },
    commandMapping: {
      commandSuggestHook: hasText(FILES.traceCommandSuggest, 'trace.command_suggest'),
      allowlistMentions: hasText(FILES.opencodeSkill, 'allowlist') || hasText(FILES.opencodeSkill, 'trustTier'),
    },
    syntheticEvidence: {
      atlasContextFusionPresent: hasText(join(ROOT, 'scripts', 'atlas', 'ace-context-fusion.mjs'), 'sourceRefs'),
      codebaseEvidenceBuilderPresent: hasText(join(ROOT, 'scripts', 'atlas', 'build-parent-master-atlas.ts'), 'sourceRefs'),
    },
  };

  const report = {
    generatedAt: new Date().toISOString(),
    runId: 'stage-2c-500',
    inputs: {
      graphDir: GRAPH_DIR,
      qdrantUrl: QDRANT_URL,
      qdrantCollection: QDRANT_COLLECTION,
    },
    phase3,
    phase4,
    phase5,
    recommendations: [
      !neo4jGraphRagReport
        ? 'Regenerate docs/graph/repo-neo4j-graphrag-report.json from the live Neo4j projection before treating Phase 3 as closed.'
        : 'Phase 3 graph report present; use the authority audit and Qdrant parity sections as the next review gate.',
      'Phase 4 is partially wired in code; keep UI provenance and trust-tier editing behind the admin atlas surface.',
      'Phase 5 should reconcile the feature registry against the code-based evidence before mapping commands or generating synthetic cards.',
    ],
  };

  const jsonPath = join(REPORTS_DIR, 'stage-2c-500-phase-review.json');
  const mdPath = join(REPORTS_DIR, 'stage-2c-500-phase-review.md');
  writeJson(jsonPath, report);
  writeText(mdPath, [
    '# Stage 2C-500 Phase Review',
    '',
    `Generated: ${report.generatedAt}`,
    `RunId: ${report.runId}`,
    '',
    '## Phase 3',
    `- Neo4j graph report present: ${report.phase3.authorityAudit.graphReportPresent ? 'yes' : 'no'}`,
    `- Pagerank report present: ${report.phase3.authorityAudit.pagerankReportPresent ? 'yes' : 'no'}`,
    `- Qdrant sample points: ${report.phase3.embeddingParity.sample.total}`,
    `- Qdrant sourceRefs coverage: ${report.phase3.embeddingParity.sample.coverage}`,
    '',
    '## Phase 4',
    `- Admin atlas UI present: ${report.phase4.provenanceDisplay.adminAtlasUiPresent ? 'yes' : 'no'}`,
    `- trace.command_suggest hook present: ${report.phase4.multiLaneRetrieval.traceCommandSuggestHook ? 'yes' : 'no'}`,
    `- Cluster aliases loaded: ${report.phase4.clusterVisualization.aliasCount}`,
    '',
    '## Phase 5',
    `- Feature registry schema present: ${report.phase5.featureRegistry.featureRegistrySchemaPresent ? 'yes' : 'no'}`,
    `- Command mapping hook present: ${report.phase5.commandMapping.commandSuggestHook ? 'yes' : 'no'}`,
    `- Synthetic evidence helper present: ${report.phase5.syntheticEvidence.atlasContextFusionPresent ? 'yes' : 'no'}`,
    '',
    '## Recommendations',
    ...report.recommendations.map((item) => `- ${item}`),
  ].join('\n'));

  console.log(JSON.stringify({
    ok: true,
    report: { jsonPath, mdPath },
    phase3: report.phase3,
    phase4: report.phase4,
    phase5: report.phase5,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[atlas:stage-2c-500:review] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
