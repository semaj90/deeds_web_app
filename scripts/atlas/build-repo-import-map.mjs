#!/usr/bin/env node
import { loadConfig, readExistingGraphFiles, resolveRepoPath, writeJson, writeMarkdown, parentAtlasMarkdown, topEntries } from './_atlas-utils.mjs';

const config = loadConfig();
const files = readExistingGraphFiles(config);
const importTargets = new Map();
const importSources = new Map();

for (const file of files) {
  const source = file.rel;
  const edges = [...(file.imports ?? []), ...(file.dynImports ?? [])];
  if (!edges.length) continue;
  importSources.set(source, edges.length);
  for (const edge of edges) importTargets.set(edge, (importTargets.get(edge) ?? 0) + 1);
}

const payload = { repo: config.repoName, generatedAt: new Date().toISOString(), totalFiles: files.length, topTargets: topEntries(importTargets, 50), topSources: topEntries(importSources, 50) };

writeJson(resolveRepoPath(config.outputs.importMapJson), payload);
writeMarkdown(resolveRepoPath(config.outputs.importMapMd), parentAtlasMarkdown('Repo Import Map', { files: files.length, targets: importTargets.size, sources: importSources.size }, topEntries(importTargets, 12).map(({ key, value }) => `${key}: ${value}`)));

console.log(`Import map written to ${config.outputs.importMapJson}`);
