#!/usr/bin/env node
import { loadConfig, loadCodebaseGraph, loadRouteMap, resolveRepoPath, writeJson, routeSummary } from './_atlas-utils.mjs';

const config = loadConfig();
const graph = loadCodebaseGraph(config);
const routeMap = loadRouteMap(config);
const routeStats = routeSummary(routeMap);

const runId = `run_${Date.now()}`;

const manifest = {
  repo: config.repoName,
  runId,
  generatedAt: new Date().toISOString(),
  targets: {
    qdrant: {
      collection: config.qdrantCollections[0],
      count: graph?.files?.length ?? 0
    },
    neo4j: {
      nodeCount: (graph?.files?.length ?? 0) + routeStats.total,
      edgeCount: (graph?.files?.length ?? 0) * 2
    },
    couchdb: {
      docCount: (graph?.files?.length ?? 0) + (graph?.dirCount ?? 0)
    },
    redis: {
      keyCount: (graph?.files?.length ?? 0) + config.redisKeys.length
    }
  },
  safety: {
    noHiddenThoughts: true,
    noRawTensors: true,
    noKvCache: true,
    stagedWriteOnly: true
  }
};

const manifestPath = resolveRepoPath(config.outputs.writeManifest || 'docs/graph/atlas-write-manifest.json');
writeJson(manifestPath, manifest);
console.log(`Atlas write manifest created: ${manifestPath} [runId: ${runId}]`);
