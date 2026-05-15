#!/usr/bin/env node
import { loadConfig, loadCodebaseGraph, readExistingGraphFiles, fileLanguage, resolveRepoPath, writeJson, writeMarkdown, parentAtlasMarkdown } from './_atlas-utils.mjs';

const config = loadConfig();
const graph = loadCodebaseGraph(config);
if (!graph) throw new Error(`Missing source graph: ${config.sources.codebaseGraph}`);

const counts = new Map();
for (const file of readExistingGraphFiles(config)) {
  const language = fileLanguage(file.rel);
  counts.set(language, (counts.get(language) ?? 0) + 1);
}

const payload = { repo: config.repoName, generatedAt: new Date().toISOString(), totalFiles: graph.fileCount ?? 0, languages: Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1])) };

writeJson(resolveRepoPath(config.outputs.languageMapJson), payload);
writeMarkdown(resolveRepoPath(config.outputs.languageMapMd), parentAtlasMarkdown('Repo Language Map', { languages: counts.size }, [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([language, count]) => `${language}: ${count}`)));

console.log(`Language map written to ${config.outputs.languageMapJson}`);
