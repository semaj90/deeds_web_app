#!/usr/bin/env node
/**
 * build-rg-search-matrix.mjs
 *
 * Stage 2 of the ACE Feature Context Matrix pipeline.
 * Reads an NDJSON chunk file (output of chunk-text-notes.mjs) and enriches
 * each record with rg (ripgrep) search results to map:
 *
 *   chunk text → related codebase file paths → feature / error / symbol refs
 *
 * This gives every chunk a `rg_paths` array: the set of actual source files
 * that mention the symbols/errors/features in that chunk. These paths feed
 * the Neo4j projection and Qdrant filter stages.
 *
 * Usage:
 *   node scripts/atlas/build-rg-search-matrix.mjs \
 *     --input tmp/chunks/error-context.ndjson \
 *     --out tmp/chunks/error-context-rg.ndjson \
 *     --root .
 *   node scripts/atlas/build-rg-search-matrix.mjs \
 *     --input tmp/chunks/error-context.ndjson --dry-run
 *
 * Output adds to each record:
 *   rg_paths:      string[]   // src/... paths found by rg
 *   rg_terms:      string[]   // the search terms that fired
 *   rg_query:      string     // the combined rg pattern used
 *
 * Requires: ripgrep (rg) in PATH, or falls back to a pure JS grep.
 */

import fs          from 'node:fs';
import path        from 'node:path';
import crypto      from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

// ── Args ─────────────────────────────────────────────────────────────────────
const argv    = process.argv.slice(2);
const inputI  = argv.indexOf('--input');
const outI    = argv.indexOf('--out');
const rootI   = argv.indexOf('--root');
const DRY_RUN = argv.includes('--dry-run');
const VERBOSE = argv.includes('--verbose');

const INPUT_PATH = inputI >= 0 ? argv[inputI + 1] : null;
const OUT_PATH   = outI   >= 0 ? argv[outI + 1]   : null;
const SEARCH_ROOT = rootI >= 0 ? path.resolve(argv[rootI + 1]) : path.join(ROOT, 'src');

// ── rg availability ──────────────────────────────────────────────────────────
let RG_AVAILABLE = false;
try {
  execSync('rg --version', { stdio: 'ignore' });
  RG_AVAILABLE = true;
} catch {
  console.warn('[rg-matrix] rg not found — falling back to JS grep');
}

// ── Term extraction ──────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','shall','should',
  'may','might','must','can','could','not','and','or','but','for',
  'in','on','at','to','from','with','by','as','of','that','this',
  'it','its','they','them','their','we','our','you','your','i','me',
]);

function extractTerms(text) {
  // Pull out identifiers, file paths, error codes, camelCase symbols
  const tokens = new Set();

  // TypeScript error codes
  for (const m of text.matchAll(/TS\d{4}/g))           tokens.add(m[0]);
  // camelCase / PascalCase symbols (≥6 chars to reduce noise)
  for (const m of text.matchAll(/\b[A-Z][a-zA-Z]{5,}\b|\b[a-z][a-zA-Z]{5,}[A-Z]\w*\b/g))
    tokens.add(m[0]);
  // kebab-case identifiers
  for (const m of text.matchAll(/\b[a-z]+-[a-z]+(?:-[a-z]+)*\b/g))
    if (m[0].length >= 8) tokens.add(m[0]);
  // File stems referenced explicitly (e.g. "kmeans-worker")
  for (const m of text.matchAll(/\b([\w\-]+)\.(ts|js|svelte|mjs|sql|json)\b/gi))
    tokens.add(m[1]);

  // Filter stop words and short tokens
  const terms = [...tokens].filter(t => t.length >= 5 && !STOP_WORDS.has(t.toLowerCase()));
  return [...new Set(terms)].slice(0, 8); // cap at 8 terms per chunk
}

// ── rg search ────────────────────────────────────────────────────────────────
function rgSearch(terms, searchRoot) {
  if (!terms.length) return [];
  const pattern = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const cmd = [
    'rg', '--files-with-matches', '--glob', '*.ts', '--glob', '*.svelte',
    '--glob', '*.mjs', '--glob', '*.js',
    '--no-ignore-vcs',
    '-e', JSON.stringify(pattern),
    JSON.stringify(searchRoot),
  ].join(' ');
  try {
    const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 4 });
    return out.trim().split('\n').filter(Boolean).map(p => {
      // Make relative to ROOT
      return path.relative(ROOT, p).replace(/\\/g, '/');
    });
  } catch {
    return [];
  }
}

// JS fallback: scan src directory recursively for terms
function jsFallbackSearch(terms, searchRoot) {
  if (!terms.length) return [];
  const results = new Set();

  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.(ts|svelte|mjs|js)$/.test(e.name)) continue;
      let content;
      try { content = fs.readFileSync(full, 'utf8'); } catch { continue; }
      if (terms.some(t => content.includes(t))) {
        results.add(path.relative(ROOT, full).replace(/\\/g, '/'));
      }
    }
  }
  walk(searchRoot);
  return [...results];
}

function searchForTerms(terms, searchRoot) {
  if (RG_AVAILABLE) return rgSearch(terms, searchRoot);
  return jsFallbackSearch(terms, searchRoot);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!INPUT_PATH) {
    console.error('[rg-matrix] --input required');
    process.exit(1);
  }

  const inputResolved = path.isAbsolute(INPUT_PATH) ? INPUT_PATH : path.join(ROOT, INPUT_PATH);
  const lines = fs.readFileSync(inputResolved, 'utf8').trim().split('\n').filter(Boolean);
  const records = lines.map(l => JSON.parse(l));

  console.log(`[rg-matrix] Loaded ${records.length} chunks from ${INPUT_PATH}`);
  console.log(`[rg-matrix] Search root: ${SEARCH_ROOT}`);
  console.log(`[rg-matrix] rg available: ${RG_AVAILABLE}`);

  let totalPaths = 0;
  const enriched = [];

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const terms = extractTerms(rec.text);
    const rgPaths = DRY_RUN ? [] : searchForTerms(terms, SEARCH_ROOT);
    totalPaths += rgPaths.length;

    if (VERBOSE || DRY_RUN) {
      console.log(`  [${i}] terms=${terms.join(',')}  paths=${rgPaths.length}`);
    } else {
      process.stdout.write(`\r[rg-matrix] ${i + 1}/${records.length} chunks  `);
    }

    enriched.push({
      ...rec,
      rg_terms: terms,
      rg_query: terms.join('|'),
      rg_paths: rgPaths,
    });
  }

  console.log(`\n[rg-matrix] Total rg paths found: ${totalPaths}`);

  if (DRY_RUN) {
    console.log('[rg-matrix] DRY RUN — sample enriched record:');
    console.log(JSON.stringify(enriched[0] ?? {}, null, 2));
    return;
  }

  const ndjson = enriched.map(r => JSON.stringify(r)).join('\n') + '\n';

  if (OUT_PATH) {
    const outResolved = path.isAbsolute(OUT_PATH) ? OUT_PATH : path.join(ROOT, OUT_PATH);
    fs.mkdirSync(path.dirname(outResolved), { recursive: true });
    fs.writeFileSync(outResolved, ndjson, 'utf8');
    console.log(`[rg-matrix] ✅ Wrote ${enriched.length} records → ${OUT_PATH}`);
  } else {
    process.stdout.write(ndjson);
  }
}

main().catch(err => {
  console.error('[rg-matrix]', err.message);
  process.exit(1);
});