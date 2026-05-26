#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_ROOTS = ['scripts', 'src'];
const EXTRA_FILES = ['package.json'];
const IGNORE_PARTS = [
  `${join('scripts', 'phase104-backups')}`,
  `${join('scripts', 'backups')}`,
  `${join('src', 'routes', 'api', 'mcp')}`, // app SSE facade, not TRACE MCP protocol probe
];
const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.ps1', '.json']);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const abs = join(dir, entry.name);
    const rel = relative(ROOT, abs);
    if (IGNORE_PARTS.some((part) => rel.includes(part))) continue;

    if (entry.isDirectory()) {
      walk(abs, out);
      continue;
    }

    const dot = entry.name.lastIndexOf('.');
    const ext = dot >= 0 ? entry.name.slice(dot) : '';
    if (EXTENSIONS.has(ext)) out.push(abs);
  }

  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function excerpt(text, index, length = 360) {
  return text.slice(index, index + length).replace(/\s+/g, ' ').trim();
}

function isAllowedBlock(block) {
  const normalized = block.toLowerCase();
  if (normalized.includes('/health')) return true;
  if (!normalized.includes('/mcp')) return true;
  if (/\/mcp\/[a-z0-9_-]/i.test(block)) return true;

  const hasPost = /method\s*:\s*['"`]post['"`]/i.test(block) || /\b-x\s+post\b/i.test(block);
  const hasJsonRpc = /['"`]?jsonrpc['"`]?\s*[:=]/i.test(block) || /tools\/list|tools\/call|initialize/i.test(block);
  const hasStreamAccept = /text\/event-stream/i.test(block);
  return hasPost && hasJsonRpc && hasStreamAccept;
}

const files = [
  ...SCAN_ROOTS.flatMap((root) => walk(join(ROOT, root))),
  ...EXTRA_FILES.map((file) => join(ROOT, file)),
];

const findings = [];

for (const file of files) {
  let text;
  try {
    if (statSync(file).size > 2_000_000) continue;
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  const patterns = [
    /\/mcp(?:\s|$|[?#'"`),])/gi,
    /GET\s+\/mcp/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const index = match.index ?? 0;
      const callPrefix = text.slice(Math.max(0, index - 180), index);
      const isMcpCall = /\b(fetch|curl)\b/i.test(callPrefix) || /GET\s+\/mcp/i.test(match[0]);
      if (!isMcpCall) continue;
      const block = text.slice(Math.max(0, index - 260), index + 900);
      if (isAllowedBlock(block)) continue;
      findings.push({
        file: relative(ROOT, file),
        line: lineOf(text, index),
        excerpt: excerpt(text, Math.max(0, index - 120)),
      });
    }
  }
}

if (findings.length > 0) {
  console.error(JSON.stringify({ ok: false, findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  scannedFiles: files.length,
  rule: 'MCP protocol probes must use JSON-RPC POST /mcp with Accept: application/json, text/event-stream; use /health for liveness.',
}, null, 2));
