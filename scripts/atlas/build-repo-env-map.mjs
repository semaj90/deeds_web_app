#!/usr/bin/env node
import { loadConfig, collectEnvFromRoots, resolveRepoPath, writeJson, writeMarkdown, parentAtlasMarkdown, topEntries } from './_atlas-utils.mjs';

const config = loadConfig();
const { envUsage, envFiles } = collectEnvFromRoots(config.scanRoots, new Set(config.ignoreDirs));

const payload = { repo: config.repoName, generatedAt: new Date().toISOString(), envKeys: Object.fromEntries([...envUsage.entries()].sort((a, b) => b[1] - a[1])), envFiles };

writeJson(resolveRepoPath(config.outputs.envMapJson), payload);
writeMarkdown(resolveRepoPath(config.outputs.envMapMd), parentAtlasMarkdown('Repo Env Map', { envKeys: envUsage.size, envFiles: envFiles.length }, topEntries(envUsage, 12).map(({ key, value }) => `${key}: ${value}`)));

console.log(`Env map written to ${config.outputs.envMapJson}`);
