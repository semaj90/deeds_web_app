#!/usr/bin/env node

/** Read-only filesystem manifest preview for source-lineage reconciliation. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const value = (name, fallback) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const limit = Math.max(1, Number.parseInt(value('--limit', '128'), 10) || 128);
const outputDir = path.resolve(ROOT, value('--output-dir', '.tmp/atlas/indexable-source-manifest-v1'));
const outputPath = path.join(outputDir, 'manifest.jsonl');
const reportPath = path.join(ROOT, 'docs/reports/indexable-source-manifest-v1.json');
const maxBytes = 64 * 1024 * 1024;
const excluded = new Set(['.git', 'node_modules', '.svelte-kit', 'dist', 'build', '.next', '.vite', '.venv', '.venv-cu130', '.venv-gemma4', '.venv_turbovec', '.venv-py313-backup', '.python311', '.cache', '.pytest_cache', '__pycache__', '.agent', '.opencode', '.tmp', 'backups', 'archive', 'tmp', 'logs', 'coverage', 'reports', 'external-docs', 'claude-mem', 'models', 'crates', 'mcp-server-mcp', 'gsd_archives', 'memory', 'target', '.vscode', 'screenshots', 'obsidian-vault', 'scratch', 'phase104-backups', 'docs_readme', 'llama-cpp-turboquant-gemma4', 'neschrom97', '.svelte-error-fixes-backup', '.claude', '.cline', '.clinerules', '.parent-atlas', 'deeds_labs']);
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.py', '.go', '.rs', '.svelte', '.md', '.json', '.yaml', '.yml', '.sql', '.sh']);

function gitRevision() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch { return null; }
}

function sourceRootAuthority(relativePath) {
  if (relativePath.startsWith('llama-cpp-turboquant-gemma4/')) return 'VENDORED_TOOLING';
  if (relativePath.startsWith('neschrom97/cards/')) return 'GENERATED_ARTIFACT';
  const root = relativePath.split('/')[0];
  if (new Set(['crates', 'mcp-server-mcp', 'gsd_archives', 'memory', 'models', 'log', '.vscode', '.proofs', '.gemini', 'datasets', 'artifacts', 'minio-data', 'llm', '.github']).has(root)) return 'REFERENCE_OR_CONFIG';
  return 'CANONICAL_WORKSPACE';
}

async function walk(dir, rows) {
  if (rows.length >= limit) return;
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (rows.length >= limit) return;
    if (excluded.has(entry.name)) continue;
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) { await walk(absolutePath, rows); continue; }
    if (!entry.isFile() || !extensions.has(path.extname(entry.name).toLowerCase())) continue;
    const relativePath = path.relative(ROOT, absolutePath).replaceAll('\\', '/');
    let sizeBytes = null;
    let contentHash = null;
    let status = 'HASHED';
    let error = null;
    try {
      sizeBytes = (await fsp.stat(absolutePath)).size;
      if (sizeBytes > maxBytes) { status = 'SOURCE_TOO_LARGE'; }
      else contentHash = createHash('sha256').update(await fsp.readFile(absolutePath)).digest('hex');
    } catch (cause) {
      status = 'UNREADABLE';
      error = cause instanceof Error ? cause.message : String(cause);
    }
    const sourceRootAuthorityValue = sourceRootAuthority(relativePath);
    rows.push({ schema: 'atlas.indexable-source-manifest-row.v1', relativePath, sizeBytes, contentHash, status, sourceRootAuthority: sourceRootAuthorityValue, canonicalAdmission: sourceRootAuthorityValue === 'CANONICAL_WORKSPACE', error });
  }
}

const rows = [];
await walk(ROOT, rows);
await fsp.mkdir(outputDir, { recursive: true });
await fsp.writeFile(outputPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
const counts = Object.fromEntries([...new Set(rows.map((row) => row.status))].map((status) => [status, rows.filter((row) => row.status === status).length]));
const report = {
  schema: 'atlas.indexable-source-manifest.v1',
  readOnly: true,
  canonicalWrites: false,
  workspaceRevision: gitRevision(),
  sourceRevision: gitRevision(),
  root: ROOT,
  sampleLimit: limit,
  rowCount: rows.length,
  counts,
  exclusions: [...excluded].sort(),
  maxHashBytes: maxBytes,
  output: path.relative(ROOT, outputPath).replaceAll('\\', '/'),
};
await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, reportPath: path.relative(ROOT, reportPath).replaceAll('\\', '/') }, null, 2));
