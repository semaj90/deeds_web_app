#!/usr/bin/env node
import { loadConfig, loadRouteMap, loadRouteGapAtlas, loadClusterAliases, loadHypergraphClusters, loadLlmNotes, streamCodebaseGraph, routeSummary, fileLanguage, workspaceForPath, fileSidecarKind, collectEnvFromRoots, parentAtlasMarkdown, resolveRepoPath, writeJson, writeMarkdown, topEntries } from './_atlas-utils.mjs';

const config = loadConfig();
const routes = loadRouteMap(config);
const routeGaps = loadRouteGapAtlas(config);
const aliases = loadClusterAliases(config);
const hypergraph = loadHypergraphClusters(config);
const llmNotes = loadLlmNotes(config);

const workspaceCounts = new Map();
const languageCounts = new Map();
const importCounts = new Map();
const sidecarCounts = new Map();
const workspaceRoutes = new Map();

let graphMeta = {
  fileCount: 0,
  routeCount: 0,
  componentCount: 0,
  apiCount: 0,
  dirCount: 0
};

let filesCounted = 0;

const sourceGraphPath = resolveRepoPath(config.sources.codebaseGraph);

console.log(`⏳ Streaming codebase graph memory-efficiently: ${config.sources.codebaseGraph}...`);

await streamCodebaseGraph(
  sourceGraphPath,
  (file) => {
    filesCounted++;
    const workspace = workspaceForPath(file.rel, config.workspaces);
    workspaceCounts.set(workspace, (workspaceCounts.get(workspace) ?? 0) + 1);
    
    const language = fileLanguage(file.rel);
    languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
    
    for (const imp of [...(file.imports ?? []), ...(file.dynImports ?? [])]) {
      importCounts.set(imp, (importCounts.get(imp) ?? 0) + 1);
    }
    
    const sidecar = fileSidecarKind(file.rel);
    if (sidecar) {
      sidecarCounts.set(sidecar, (sidecarCounts.get(sidecar) ?? 0) + 1);
    }
    
    if (file.isRoute) {
      workspaceRoutes.set(workspace, (workspaceRoutes.get(workspace) ?? 0) + 1);
    }
  },
  (meta) => {
    graphMeta = { ...graphMeta, ...meta };
  }
);

console.log(`✅ Finished streaming. Processed ${filesCounted} files.`);

const envUsage = collectEnvFromRoots(config.scanRoots, new Set(config.ignoreDirs));
const routeStats = routeSummary(routes);
const routeGapStats = { total: routeGaps?.routes?.length ?? routeGaps?.items?.length ?? 0, unresolved: routeGaps?.gaps?.length ?? 0 };

const summary = {
  repo: config.repoName,
  generatedAt: new Date().toISOString(),
  sourceGraph: config.sources.codebaseGraph,
  fileCount: graphMeta.fileCount ?? filesCounted,
  routeCount: graphMeta.routeCount ?? routeStats.total,
  componentCount: graphMeta.componentCount ?? 0,
  apiCount: graphMeta.apiCount ?? 0,
  dirCount: graphMeta.dirCount ?? 0,
  workspaceCount: workspaceCounts.size,
  languageCount: languageCounts.size,
  envKeyCount: envUsage.envUsage.size,
  clusterAliasCount: Object.keys(aliases ?? {}).length,
  hypergraphClusters: hypergraph?.clusters?.length ?? 0,
  llmNoteChars: llmNotes.length,
  routeGapCount: routeGapStats.unresolved,
};

const rootAtlas = {
  summary,
  routeSummary: routeStats,
  workspaceMap: Object.fromEntries([...workspaceCounts.entries()].sort((a, b) => b[1] - a[1])),
  workspaceRoutes: Object.fromEntries([...workspaceRoutes.entries()].sort((a, b) => b[1] - a[1])),
  languageMap: Object.fromEntries([...languageCounts.entries()].sort((a, b) => b[1] - a[1])),
  importMap: Object.fromEntries(topEntries(importCounts, 50).map(({ key, value }) => [key, value])),
  sidecars: Object.fromEntries([...sidecarCounts.entries()].sort((a, b) => b[1] - a[1])),
  envMap: Object.fromEntries([...envUsage.envUsage.entries()].sort((a, b) => b[1] - a[1])),
  sources: config.sources,
  workspaces: config.workspaces,
  qdrantCollections: config.qdrantCollections,
  redisKeys: config.redisKeys,
  featureFamilies: config.featureFamilies,
  routeGaps,
};

writeJson(resolveRepoPath(config.outputs.rootAtlasJson), rootAtlas);
writeMarkdown(resolveRepoPath(config.outputs.rootAtlasMd), parentAtlasMarkdown('Repo Root Atlas', summary, [
  `routes: ${routeStats.total} total (${routeStats.api} api, ${routeStats.page} page, ${routeStats.layout} layout)`,
  `workspaces: ${[...workspaceCounts.keys()].join(', ')}`,
  `languages: ${[...languageCounts.keys()].slice(0, 8).join(', ')}`,
  `top import: ${topEntries(importCounts, 1)[0]?.key ?? 'none'}`,
  `env keys: ${[...envUsage.envUsage.keys()].slice(0, 10).join(', ') || 'none'}`,
]));

console.log(`Repo root atlas written to ${config.outputs.rootAtlasJson}`);
