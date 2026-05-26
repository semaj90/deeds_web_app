#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { OUT_DIR, stableHash, writeJson } from './shared.mjs';
import { toToon } from './toon-encoder.mjs';

function readJson(fileName, fallback = {}) {
  const full = path.join(OUT_DIR, fileName);
  if (!fs.existsSync(full)) return fallback;
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function readJsonl(fileName) {
  const full = path.join(OUT_DIR, fileName);
  if (!fs.existsSync(full)) return [];
  return fs.readFileSync(full, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function slimFeature(row) {
  return {
    file: row.file,
    kind: row.kind,
    feature: row.feature,
    language: row.language,
    defined: (row.symbols_defined ?? []).slice(0, 4).join('|'),
    calls: (row.symbols_called ?? []).slice(0, 4).join('|'),
    stubs: (row.mocks_or_stubs ?? []).length,
  };
}

const featureSummary = readJson('feature-summary.json');
const astSummary = readJson('ast-summary.json');
const docsSummary = readJson('docs-summary.json');
const lexicalSummary = readJson('lexical-summary.json');
const allFeatures = readJsonl('feature-map.jsonl');
const featurePriority = (row) => {
  const file = String(row.file ?? '');
  let score = 0;
  if (file.startsWith('src/lib/server/ai/')) score += 80;
  if (file.startsWith('src/lib/server/ace/')) score += 75;
  if (file.startsWith('src/lib/server/cache/')) score += 70;
  if (file.startsWith('src/lib/server/memory/')) score += 70;
  if (file.startsWith('src/mcp/') || file.startsWith('scripts/mcp/')) score += 65;
  if (file.startsWith('src/routes/api/')) score += 55;
  if (file.startsWith('scripts/index/')) score += 50;
  if (file.startsWith('scripts/')) score += 35;
  if (file.startsWith('src/')) score += 30;
  if (file.startsWith('docs/') || file.startsWith('next_steps/')) score -= 20;
  if ((row.symbols_defined ?? []).length) score += 10;
  if ((row.symbols_called ?? []).length) score += 8;
  if ((row.mocks_or_stubs ?? []).length) score += 4;
  return score;
};
const features = allFeatures
  .slice()
  .sort((a, b) => featurePriority(b) - featurePriority(a) || String(a.file).localeCompare(String(b.file)))
  .slice(0, 80)
  .map(slimFeature);

const packet = {
  policy: {
    synthesis_model: 'Gemma4 via TurboQuant',
    stable_prefix: true,
    volatile_suffix: 'user query, git diff, retrieved snippets, logs, tests',
    retrieval_order: 'rg -> ast/regex structure -> docs map -> semantic recall -> ACE packet -> Gemma4',
  },
  cache: {
    key: `deeds:v1:gemma4-rotorquant:ace-prefix:${featureSummary.digest ?? 'no-index'}`,
    digest: featureSummary.digest ?? 'no-index',
  },
  lanes: {
    lexical_rows: lexicalSummary.count ?? 0,
    structural_rows: astSummary.count ?? 0,
    structural_parser: astSummary.lane ?? 'unknown',
    docs_rows: docsSummary.count ?? 0,
    feature_rows: featureSummary.count ?? 0,
  },
  endpoints: [
    { name: 'llama-server', url: 'http://127.0.0.1:8090/v1', role: 'Gemma4 synthesis, 64K ctx' },
    { name: 'trace', url: 'http://127.0.0.1:8788/mcp', role: 'graph and compact context MCP' },
    { name: 'turbovec-sidecar', url: 'http://127.0.0.1:8791/mcp', role: 'semantic prefilter and cosine scoring' },
    { name: 'engram-embed', url: 'http://127.0.0.1:8792/mcp', role: 'embedding, ACE packet, chat memory Redis writes' },
    { name: 'langextract', url: 'http://127.0.0.1:8793/mcp', role: 'entity/citation extraction and compression' },
  ],
  features,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const toon = toToon(packet, 'ace_prefix');
const out = path.join(OUT_DIR, 'ace-prefix.toon');
fs.writeFileSync(out, toon + '\n', 'utf8');

const summary = {
  artifact: out,
  bytes: Buffer.byteLength(toon, 'utf8'),
  cache_key: packet.cache.key,
  digest: stableHash(toon),
  generated_by: 'scripts/index/ace-prefix-toon.mjs',
  source_digest: featureSummary.digest ?? 'no-index',
};
writeJson('ace-prefix-toon-summary.json', summary);
console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
