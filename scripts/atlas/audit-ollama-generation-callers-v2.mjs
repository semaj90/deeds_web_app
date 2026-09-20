#!/usr/bin/env node
/**
 * Read-only Ollama ownership census.
 *
 * Ollama /api/embed(s), /api/tags, /api/ps, and embedding lifecycle calls are
 * allowed. Raw /api/chat and /api/generate remain prohibited outside an
 * explicit compatibility helper. This audit classifies callers before Batch 5
 * edits; it never rewrites callers or changes runtime state.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.resolve(repoRoot, 'docs/reports/ollama-generation-callers-v2.json');
const scanRoots = ['scripts', 'sveltekit-frontend/scripts', 'sveltekit-frontend/src', 'docker', 'python', 'packages'];
const skip = new Set(['node_modules', '.git', 'archive', 'dist', '.svelte-kit', '__pycache__', 'static', 'api-cleanup']);
const extensions = new Set(['.mjs', '.mts', '.ts', '.js', '.cjs', '.py', '.svelte']);
const rawGeneration = /\/api\/(?:chat|generate)\b/i;
const rawTransport = /\bfetch\s*\(|\.post\s*\(/i;
const ollamaHint = /11434|OLLAMA|ollama|ChatOllama|new\s+Ollama/i;
const embeddingEndpoint = /\/api\/(?:embed|embeddings|tags|ps)\b/i;
const embeddingLifecycle = /embeddinggemma|OLLAMA_EMBED|keep_alive\s*:\s*0/i;
const archivedLegacy = /@atlas-disposition\s+ARCHIVED_LEGACY/i;
const centralHelper = /llama-inference|llama-server|LLAMA_SERVER_URL|ornith-1\.5/i;

function rel(file) { return path.relative(repoRoot, file).replaceAll(path.sep, '/'); }
function category(file, text, raw) {
  const name = rel(file).toLowerCase();
  if (archivedLegacy.test(text)) return 'ARCHIVE';
  if (!raw && embeddingEndpoint.test(text)) return 'EMBEDDING_KEEPER';
  if (/health|startup|probe/.test(name)) return 'HEALTH_PROBE';
  if (/test|spec|bench|fixture/.test(name)) return 'TEST_FIXTURE';
  if (/stream|synthesis|caption|vision/.test(name)) return 'SPECIAL_STREAMING';
  if (centralHelper.test(text) && !raw) return 'CENTRAL_COMPATIBILITY_HELPER';
  if (raw) return 'CONVERT';
  return 'ARCHIVE';
}

function batch5Action(file) {
  const name = rel(file);
  if (name === 'sveltekit-frontend/scripts/graphify-svg-architecture.mjs') return 'CONVERT';
  if (name === 'scripts/batch_repair_chat.py' || name === 'scripts/gemma3-legal-agent.mjs') return 'ARCHIVE_OR_CONVERT_AFTER_REACHABILITY_REVIEW';
  if (name.includes('/test') || name.includes('test-') || name.includes('fix-cluster4')) return 'TEST_FIXTURE';
  return null;
}

// Use ripgrep for the initial bounded candidate census; avoid reading every
// generated/static file in the workstation tree one-by-one.
const rgArgs = [
  '-l', '--hidden',
  '-e', 'ollama', '-e', 'OLLAMA', '-e', '/api/chat', '-e', '/api/generate',
  '-e', '/api/embed', '-e', '/api/embeddings', '-e', '/api/tags', '-e', '/api/ps',
  '-g', '!**/node_modules/**', '-g', '!**/.svelte-kit/**',
  '-g', '!**/static/**', '-g', '!**/archive/**', '-g', '!**/api-cleanup/**', '-g', '!**/phase104-backups/**',
  ...scanRoots,
];
let candidatePaths = [];
try {
  candidatePaths = execFileSync('rg', rgArgs, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    .split(/\r?\n/).filter(Boolean).map((entry) => path.resolve(repoRoot, entry));
} catch { candidatePaths = []; }
const files = candidatePaths.filter((file) => extensions.has(path.extname(file).toLowerCase()) && !file.toLowerCase().includes('phase104-backups'));
const entries = [];
for (const file of files) {
  let text;
  try { text = await fs.readFile(file, 'utf8'); } catch { continue; }
  const raw = !archivedLegacy.test(text) && text.split(/\r?\n/).some((line) => rawGeneration.test(line) && rawTransport.test(line) && ollamaHint.test(line));
  const allowedEmbedding = embeddingEndpoint.test(text) || embeddingLifecycle.test(text);
  if (!raw && !allowedEmbedding && !/ollama/i.test(text)) continue;
  const lines = text.split(/\r?\n/);
  const matchedLines = lines.reduce((acc, line, index) => {
    if (/\/api\/(?:chat|generate|embed|embeddings|tags|ps)\b/i.test(line)) acc.push(index + 1);
    return acc;
  }, []);
  entries.push({
    file: rel(file),
    category: category(file, text, raw),
    prohibitedRawGeneration: raw && !embeddingLifecycle.test(text),
    allowedEmbeddingOrLifecycle: allowedEmbedding,
    archivedLegacy: archivedLegacy.test(text),
    matchedLines,
    evidence: raw ? 'RAW_OLLAMA_GENERATION' : allowedEmbedding ? 'EMBEDDING_OR_LIFECYCLE' : 'OLLAMA_REFERENCE',
    batch5Action: raw ? batch5Action(file) : null,
  });
}
entries.sort((a, b) => a.file.localeCompare(b.file));
const prohibited = entries.filter((entry) => entry.prohibitedRawGeneration);
const counts = Object.fromEntries([...new Set(entries.map((entry) => entry.category))].sort().map((key) => [key, entries.filter((entry) => entry.category === key).length]));
const report = {
  schema: 'atlas.ollama-generation-callers.v2',
  status: prohibited.length === 0 ? 'RAW_OLLAMA_CHAT_CALLERS_ZERO' : 'RAW_OLLAMA_CHAT_CALLERS_REMAIN',
  policy: {
    chatOwner: 'llama-server:8090',
    embeddingOwner: 'ollama:11434/EmbeddingGemma',
    prohibitedEndpoints: ['/api/chat', '/api/generate'],
    allowedEndpoints: ['/api/embed', '/api/embeddings', '/api/tags', '/api/ps'],
  },
  counts,
  prohibitedCount: prohibited.length,
  entries,
  prohibitedCallers: prohibited,
  batch5: {
    source: 'CURRENT_RAW_OLLAMA_GENERATION_CALLERS',
    dispositionRequiredBeforeEditing: true,
    entries: entries
      .filter((entry) => entry.batch5Action || entry.archivedLegacy || entry.prohibitedRawGeneration)
      .map((entry) => ({ file: entry.file, action: entry.archivedLegacy ? 'ARCHIVE' : (entry.batch5Action ?? entry.category) })),
  },
  writesPerformed: false,
  canonicalAuthority: false,
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, status: report.status, prohibitedCount: prohibited.length, counts }, null, 2));
