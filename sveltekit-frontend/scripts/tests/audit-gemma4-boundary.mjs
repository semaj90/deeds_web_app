#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const TARGETS = [
  'src/lib/server/memory',
  'src/lib/server/cache',
  'src/lib/server/ai/engram-memory.ts',
  'src/lib/server/ai/intent-ranker.ts',
  'src/lib/server/memory/local-engram-memory-adapter.ts',
  'scripts/mcp/engram-embed-mcp.mjs',
];

const FORBIDDEN = [
  { name: 'chat-completions', pattern: /\/v1\/chat|chat\/completions/i },
  { name: 'ollama-generate', pattern: /\/api\/generate|\/api\/chat/i },
  { name: 'direct-gemma4-call', pattern: /\b(callGemma4WithTools|gemma4_chat|gemma4_summarize|gemma4_classify)\b/i },
  { name: 'llama-server-chat', pattern: /\bTURBO_BASE\b|\bLLAMA_SERVER_URL\b|\bOLLAMA_MODEL\b/i },
];

const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts']);

function walk(path, out = []) {
  if (!existsSync(path)) return out;
  const stat = statSync(path);
  if (stat.isFile()) {
    const dot = path.lastIndexOf('.');
    const ext = dot >= 0 ? path.slice(dot) : '';
    if (EXTENSIONS.has(ext)) out.push(path);
    return out;
  }

  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const abs = join(path, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else walk(abs, out);
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

const files = TARGETS.flatMap((target) => walk(join(ROOT, target)));
const findings = [];

for (const file of files) {
  let text;
  try {
    if (statSync(file).size > 1_000_000) continue;
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  for (const rule of FORBIDDEN) {
    for (const match of text.matchAll(new RegExp(rule.pattern, 'gi'))) {
      const index = match.index ?? 0;
      const context = text.slice(Math.max(0, index - 180), index + 220);
      // Metadata-only cache records may mention a model name. The forbidden
      // gate is direct synthesis transport, not stored provenance strings.
      if (!/\b(fetch|post|generate|chat|completions|callGemma4|TURBO_BASE|LLAMA_SERVER_URL|OLLAMA_MODEL)\b/i.test(context)) {
        continue;
      }
      findings.push({
        file: relative(ROOT, file),
        line: lineOf(text, index),
        rule: rule.name,
        excerpt: context.replace(/\s+/g, ' ').trim(),
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
  rule: 'Engram/memory/cache lanes must not call Gemma4/chat-completions directly; Gemma4 stays final synthesis only.',
}, null, 2));
