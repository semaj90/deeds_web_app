#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)));
const ROOT = resolve(SCRIPT_DIR, '..');
const ATLAS_PATH = join(ROOT, 'docs', 'documents-atlas-index.json');

function loadAtlas() {
  const raw = readFileSync(ATLAS_PATH, 'utf8');
  return JSON.parse(raw);
}

function normalizeTerms(input) {
  return input
    .toLowerCase()
    .split(/[^a-z0-9_:-]+/)
    .filter(Boolean);
}

function searchAtlas(atlas, query) {
  const terms = normalizeTerms(query);
  const matchedRefs = new Set();

  for (const term of terms) {
    const refs = atlas.invertedIndex?.[term] ?? [];
    for (const ref of refs) matchedRefs.add(ref);

    // Prefix fallback for partial terms like "semantic" -> "semantic-cache"
    for (const key of Object.keys(atlas.invertedIndex ?? {})) {
      if (key.startsWith(term)) {
        for (const ref of atlas.invertedIndex[key]) matchedRefs.add(ref);
      }
    }
  }

  const byPath = new Map(atlas.entries.map((e) => [e.path, e]));
  const rows = [];
  for (const ref of matchedRefs) {
    const entry = byPath.get(ref);
    if (!entry) continue;
    rows.push({
      sourceRef: ref,
      title: entry.title,
      category: entry.category,
      summary: entry.summary,
      labels: entry.labels,
      protocols: entry.protocolDetected,
    });
  }

  rows.sort((a, b) => a.sourceRef.localeCompare(b.sourceRef));
  return rows;
}

function main() {
  const query = process.argv.slice(2).join(' ').trim() || 'cuda semantic cache';
  const atlas = loadAtlas();
  const results = searchAtlas(atlas, query);

  console.log(`[docs-retrieval] query="${query}"`);
  console.log(`[docs-retrieval] matches=${results.length}`);

  for (const row of results.slice(0, 30)) {
    console.log(`- ${row.sourceRef}`);
    console.log(`  title: ${row.title}`);
    console.log(`  category: ${row.category}`);
    console.log(`  labels: ${row.labels.join(', ') || 'none'}`);
    console.log(`  protocols: ${row.protocols.join(', ') || 'none'}`);
    console.log(`  summary: ${row.summary}`);
  }
}

main();
