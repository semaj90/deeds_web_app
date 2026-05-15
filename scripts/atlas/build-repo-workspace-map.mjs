#!/usr/bin/env node
import { loadConfig, loadCodebaseGraph, readExistingGraphFiles, workspaceForPath, fileLanguage, resolveRepoPath, writeJson, writeMarkdown, parentAtlasMarkdown } from './_atlas-utils.mjs';

const config = loadConfig();
const graph = loadCodebaseGraph(config);
if (!graph) throw new Error(`Missing source graph: ${config.sources.codebaseGraph}`);

const files = readExistingGraphFiles(config);
const workspaces = new Map();

for (const file of files) {
  const workspace = workspaceForPath(file.rel, config.workspaces);
  if (!workspaces.has(workspace)) workspaces.set(workspace, { workspace, files: 0, routes: 0, languages: new Map() });
  const entry = workspaces.get(workspace);
  entry.files++;
  if (file.isRoute) entry.routes++;
  const language = fileLanguage(file.rel);
  entry.languages.set(language, (entry.languages.get(language) ?? 0) + 1);
}

const payload = {
  repo: config.repoName,
  generatedAt: new Date().toISOString(),
  totalRoutes: graph.routeCount ?? 0,
  workspaces: [...workspaces.values()].map((workspace) => ({ workspace: workspace.workspace, files: workspace.files, routes: workspace.routes, languages: Object.fromEntries([...workspace.languages.entries()].sort((a, b) => b[1] - a[1])) })),
};

writeJson(resolveRepoPath(config.outputs.workspaceMapJson), payload);
writeMarkdown(resolveRepoPath(config.outputs.workspaceMapMd), parentAtlasMarkdown('Repo Workspace Map', { workspaces: payload.workspaces.length, routes: payload.totalRoutes }, payload.workspaces.slice(0, 12).map((item) => `${item.workspace}: ${item.files} files, ${item.routes} routes`)));

console.log(`Workspace map written to ${config.outputs.workspaceMapJson}`);
