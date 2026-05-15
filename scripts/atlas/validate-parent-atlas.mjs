#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { loadConfig, resolveRepoPath, readJson, readText } from './_atlas-utils.mjs';

const config = loadConfig();
const requiredFiles = [
  config.outputs.rootAtlasJson, 
  config.outputs.workspaceMapJson, 
  config.outputs.languageMapJson, 
  config.outputs.importMapJson, 
  config.outputs.envMapJson, 
  config.outputs.routeAtlasJson, 
  config.outputs.qdrantReportJson, 
  config.outputs.neo4jReportJson, 
  config.outputs.couchdbReportJson, 
  config.outputs.redisReportJson, 
  config.outputs.batchReportJson,
  config.outputs.writeManifest
];


const missing = requiredFiles.filter((rel) => !existsSync(resolveRepoPath(rel)));
const rootAtlas = readJson(resolveRepoPath(config.outputs.rootAtlasJson), null);
const batchReport = readJson(resolveRepoPath(config.outputs.batchReportJson), null);
const routeMapText = readText(resolveRepoPath(config.sources.routeMap), '');

const result = { repo: config.repoName, generatedAt: new Date().toISOString(), missing, ok: missing.length === 0 && Boolean(rootAtlas) && Boolean(batchReport), routeMapBytes: routeMapText.length, rootAtlasRoutes: rootAtlas?.routeSummary?.total ?? 0, batchPayloads: batchReport?.payloadCount ?? 0 };

if (missing.length > 0) {
  console.error(`Missing atlas outputs: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`Parent atlas validation passed for ${config.repoName}.`);
console.log(JSON.stringify(result, null, 2));
