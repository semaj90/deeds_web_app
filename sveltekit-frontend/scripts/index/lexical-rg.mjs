#!/usr/bin/env node
import { listFiles, readRel, run, stableHash, writeJson, writeJsonl } from './shared.mjs';
const patterns = [
  'TODO|FIXME|not implemented|status:\\s*501|status:\\s*503|vi\\.mock|jest\\.mock|test\\.todo|\\.skip\\(',
  'qdrant|redis|neo4j|couchdb|bifrost|engram|langextract|turbovec|mcp',
  'pgvector|vector\\(768\\)|embedding_cache|research_summaries|cosine|hnsw',
  'OPENAI|llama-server|TURBO_CTX|LLM_CONTEXT_SIZE|OLLAMA_CONTEXT_LENGTH'
];
const rows = [];
const fallbackFiles = () => listFiles({ extensions: ['.ts', '.svelte', '.js', '.mjs', '.md', '.json'], roots: ['src', 'scripts', 'tests', 'docs'] })
  .filter((file) => !file.startsWith('docs/graph/') && !file.startsWith('docs/obsidian-vault/'));

function scanWithJs(pattern) {
  const re = new RegExp(pattern, 'i');
  for (const file of fallbackFiles()) {
    let text = '';
    try { text = readRel(file); } catch { continue; }
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!re.test(line)) continue;
      const trimmed = line.trim();
      rows.push({
        file,
        kind: 'lexical_hit',
        language: file.split('.').pop(),
        line: index + 1,
        pattern,
        scanner: 'js-fallback',
        stable_id: stableHash(file + ':' + (index + 1) + ':' + trimmed),
        text: trimmed.slice(0, 300),
      });
    }
  }
}

for (const pattern of patterns) {
  const result = run('rg', [
    '--json',
    '-n',
    '-i',
    '--glob', '!node_modules/**',
    '--glob', '!memory/**',
    '--glob', '!docs/graph/**',
    '--glob', '!docs/obsidian-vault/**',
    '--glob', '!phase104-backups/**',
    pattern,
    'src',
    'scripts',
    'tests',
    'docs',
  ]);
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  if (result.error?.message) {
    scanWithJs(pattern);
    continue;
  }
  if (!stdout && result.status && result.status > 1) {
    rows.push({
      file: 'scripts/index/lexical-rg.mjs',
      kind: 'lexical_scan_error',
      language: 'mjs',
      line: 0,
      pattern,
      stable_id: stableHash(`lexical-scan-error:${pattern}`),
      text: String(result.stderr || result.error?.message || 'rg returned no output').slice(0, 300),
    });
    continue;
  }
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type !== 'match') continue;
    const file = event.data?.path?.text;
    const lineNumber = event.data?.line_number;
    const text = event.data?.lines?.text?.trim();
    if (!file || !lineNumber || !text) continue;
    rows.push({ file, kind: 'lexical_hit', language: file.split('.').pop(), line: lineNumber, pattern, scanner: 'rg', stable_id: stableHash(file + ':' + lineNumber + ':' + text), text: text.slice(0, 300) });
  }
}
const out = writeJsonl('lexical-hits.jsonl', rows);
const scanners = [...new Set(rows.map((row) => row.scanner ?? 'unknown'))].sort();
writeJson('lexical-summary.json', { artifact: out, count: rows.length, generated_by: 'scripts/index/lexical-rg.mjs', lane: scanners.includes('rg') ? 'rg' : 'js-fallback', scanners });
console.log(JSON.stringify({ ok: true, lane: scanners.includes('rg') ? 'rg' : 'js-fallback', scanners, count: rows.length, artifact: out }, null, 2));
