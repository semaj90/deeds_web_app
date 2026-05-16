#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '../..');
dotenv.config({ path: resolve(REPO_ROOT, '.env') });
export const CONFIG_PATH = resolve(REPO_ROOT, 'atlas.config.json');

export function loadConfig() {
  const argConfigIndex = process.argv.findIndex((arg) => arg === '--config');
  const argConfigPath = argConfigIndex >= 0 ? process.argv[argConfigIndex + 1] : null;
  const configPath = argConfigPath ? resolve(process.cwd(), argConfigPath) : CONFIG_PATH;
  return readJson(configPath, {
    repoName: 'deeds-web-app',
    repoRoot: '.',
    outputs: {},
    sources: {},
    workspaces: [],
    ignoreDirs: [],
    scanRoots: [],
    qdrantCollections: [],
    redisKeys: [],
    featureFamilies: [],
  });
}

export function resolveRepoPath(relPath) {
  return resolve(REPO_ROOT, relPath);
}

export function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

export function readText(filePath, fallback = '') {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

export function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function writeJson(filePath, data) {
  ensureDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function writeMarkdown(filePath, markdown) {
  ensureDir(filePath);
  writeFileSync(filePath, markdown.endsWith('\n') ? markdown : `${markdown}\n`, 'utf8');
}

export function toPosixPath(value) {
  return value.split(sep).join('/');
}

export function fileLanguage(relPath) {
  const base = relPath.split(/[\\/]/).pop() ?? relPath;
  if (base === 'Dockerfile' || base.startsWith('Dockerfile.')) return 'dockerfile';
  if (base === 'Makefile') return 'makefile';
  const ext = extname(base).toLowerCase();
  return {
    '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.svelte': 'svelte', '.json': 'json', '.md': 'markdown', '.ps1': 'powershell', '.sh': 'shell', '.py': 'python',
    '.go': 'go', '.sql': 'sql', '.toml': 'toml', '.yml': 'yaml', '.yaml': 'yaml',
  }[ext] ?? 'other';
}

export function workspaceForPath(relPath, workspaces = []) {
  const normalized = toPosixPath(relPath);
  for (const workspace of workspaces) {
    if (normalized === workspace || normalized.startsWith(`${workspace}/`)) return workspace;
  }
  const top = normalized.split('/')[0];
  if (!top || top.includes('.')) return 'repo-root';
  return top;
}

export function collectFiles(startDir, ignoreDirs = new Set(), predicate = () => true, out = []) {
  if (!existsSync(startDir)) return out;
  for (const entry of readdirSync(startDir, { withFileTypes: true })) {
    if (ignoreDirs.has(entry.name)) continue;
    const fullPath = join(startDir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, ignoreDirs, predicate, out);
      continue;
    }
    if (!predicate(fullPath, entry.name)) continue;
    out.push(fullPath);
  }
  return out;
}

export function topEntries(map, limit = 10) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([key, value]) => ({ key, value }));
}

export function extractEnvKeys(text) {
  const keys = new Set();
  const patterns = [/\bprocess\.env\.([A-Z0-9_]+)/g, /\bimport\.meta\.env\.([A-Z0-9_]+)/g, /\benv\.([A-Z0-9_]+)/g];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(text))) keys.add(match[1]);
  }
  return [...keys];
}

export function extractImportsFromText(text) {
  const imports = new Set();
  const staticRe = /\bimport\s+(?:type\s+)?(?:[^'"`]+?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicRe = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const re of [staticRe, dynamicRe]) {
    let match;
    while ((match = re.exec(text))) imports.add(match[1]);
  }
  return [...imports];
}

export function loadCodebaseGraph(config = loadConfig()) {
  return readJson(resolveRepoPath(config.sources.codebaseGraph), null);
}

export function loadRouteMap(config = loadConfig()) {
  return readJson(resolveRepoPath(config.sources.routeMap), null);
}

export function loadRouteGapAtlas(config = loadConfig()) {
  return readJson(resolveRepoPath(config.sources.routeGapAtlas), null);
}
/**
 * Helper to log progress for long-running loops
 */
export function createProgressLogger({
  label,
  total,
  every = 100,
}) {
  const startedAt = Date.now();
  let last = 0;

  return function progress(current, extra = {}) {
    if (current !== total && (current - last < every)) return;
    last = current;

    const elapsedSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const rate = current / elapsedSec;
    const pct = total > 0 ? ((current / total) * 100).toFixed(1) : '0.0';
    const remaining = (total > current && rate > 0)
      ? Math.round((total - current) / rate)
      : 0;

    const extraText = Object.entries(extra)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');

    console.log(
      `[${label}] ${current}/${total} ${pct}% ` +
      `rate=${rate.toFixed(1)}/s eta=${remaining}s ${extraText}`.trim()
    );
  };
}

export function loadClusterAliases(config = loadConfig()) {
  return readJson(resolveRepoPath(config.sources.clusterAliases), {});
}

export function loadHypergraphClusters(config = loadConfig()) {
  return readJson(resolveRepoPath(config.sources.hypergraphClusters), null);
}

export function loadLlmNotes(config = loadConfig()) {
  return readText(resolveRepoPath(config.sources.llms), '');
}

export function routeSummary(routeMap) {
  const records = routeMap?.records ?? routeMap?.routes ?? [];
  const total = routeMap?.meta?.totalRoutes ?? routeMap?.summary?.total ?? records.length;
  const api = routeMap?.meta?.apiRoutes ?? routeMap?.summary?.api ?? records.filter((record) => record.kind === 'api').length;
  const page = routeMap?.meta?.pageRoutes ?? routeMap?.summary?.page ?? records.filter((record) => record.kind === 'page').length;
  const layout = routeMap?.meta?.layoutRoutes ?? routeMap?.summary?.layout ?? records.filter((record) => record.kind === 'layout').length;
  const partial = routeMap?.meta?.partialRoutes ?? routeMap?.summary?.partial ?? records.filter((record) => record.status !== 'SHIPPED').length;
  return { total, api, page, layout, partial };
}

export function parentAtlasMarkdown(title, summary, rows) {
  const lines = [`# ${title}`, ''];
  for (const [label, value] of Object.entries(summary)) lines.push(`- ${label}: ${value}`);
  lines.push('', '## Top Entries', '');
  for (const row of rows) lines.push(`- ${row}`);
  return lines.join('\n');
}

export function collectEnvFromRoots(roots, ignoreDirs = new Set()) {
  const envUsage = new Map();
  const envFiles = [];
  for (const root of roots) {
    const absRoot = resolveRepoPath(root);
    if (!existsSync(absRoot)) continue;
    const files = collectFiles(absRoot, ignoreDirs, (filePath) => /\.(ts|tsx|js|mjs|cjs|svelte|json|md|ps1|sh|py)$/i.test(filePath) || filePath.split(/[\\/]/).pop()?.startsWith('.env'));
    for (const file of files) {
      const text = readText(file, '');
      const keys = extractEnvKeys(text);
      if (!keys.length) continue;
      envFiles.push(toPosixPath(relative(REPO_ROOT, file)));
      for (const key of keys) envUsage.set(key, (envUsage.get(key) ?? 0) + 1);
    }
  }
  return { envUsage, envFiles };
}

export function fileSidecarKind(relPath) {
  const normalized = toPosixPath(relPath);
  const name = normalized.split('/').pop() ?? normalized;
  if (name === 'AGENTS.md') return 'agents';
  if (name === 'CLAUDE.md') return 'claude';
  if (name === 'package.json') return 'package';
  if (name === 'tsconfig.json') return 'tsconfig';
  if (name.startsWith('Dockerfile')) return 'docker';
  if (name.endsWith('.lock')) return 'lockfile';
  if (name.startsWith('.env')) return 'env';
  return null;
}

export function readExistingGraphFiles(config = loadConfig()) {
  return loadCodebaseGraph(config)?.files ?? [];
}

export async function scanKeys(redis, pattern, limit = 1000) {
  let cursor = '0';
  const keys = [];
  do {
    const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    keys.push(...batch);
    if (keys.length >= limit) break;
  } while (cursor !== '0');
  return keys;
}

