#!/usr/bin/env node
/**
 * hyperrag-couchdb-enrich.mjs
 * Phase C: CouchDB GraphRAG Enrichment
 *
 * Reads Phase B NDJSON results (or accepts them on stdin) and enriches each hit
 * with matching wiki notes from the `karpathy_wiki` CouchDB database.
 *
 * Matching strategy (in priority order):
 *   1. Exact doc id:        agents:dir:<dir-slug>
 *   2. source_ref prefix:   match doc ids that start with the file's directory
 *   3. Tag intersection:    docs whose qdrant_tags share ≥1 tag with the hit
 *
 * Usage:
 *   # Pipe from Phase B:
 *   node scripts/atlas/hyperrag-dense-multiquery.mjs --query "XState" --json \
 *     | node scripts/atlas/hyperrag-couchdb-enrich.mjs
 *
 *   # Or pass a result file:
 *   node scripts/atlas/hyperrag-couchdb-enrich.mjs --input /tmp/phaseB.json
 *
 *   # Dry-run (print stats only, no CouchDB fetch):
 *   node scripts/atlas/hyperrag-couchdb-enrich.mjs --dry-run
 *
 * Env:
 *   COUCHDB_URL      default http://admin:legal_ai_pass@127.0.0.1:5984
 *   COUCHDB_DB       default karpathy_wiki
 *   MAX_WIKI_DOCS    default 200  (max docs fetched from allDocs view)
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));

// ── Config ─────────────────────────────────────────────────────────────────────
const argv   = process.argv.slice(2);
const argGet = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

const INPUT_PATH = argGet('--input');
const DRY_RUN    = argv.includes('--dry-run');
const VERBOSE    = argv.includes('--verbose');
const JSON_OUT   = argv.includes('--json') || !process.stdout.isTTY;

const COUCHDB_URL  = (process.env.COUCHDB_URL  ?? 'http://admin:legal_ai_pass@127.0.0.1:5984').replace(/\/+$/, '');
const COUCHDB_DB   = process.env.COUCHDB_DB    ?? 'karpathy_wiki';
const MAX_WIKI     = Number(process.env.MAX_WIKI_DOCS ?? 200);
const REQ_TIMEOUT  = 8_000;

// ── Read Phase B results ───────────────────────────────────────────────────────
async function readInput() {
  if (INPUT_PATH) {
    return JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  }
  // stdin
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8'));
}

// ── CouchDB helpers ────────────────────────────────────────────────────────────
function couchHeaders() {
  return { 'Content-Type': 'application/json', Accept: 'application/json' };
}

async function fetchAllWikiDocs() {
  const url = `${COUCHDB_URL}/${COUCHDB_DB}/_all_docs?include_docs=true&limit=${MAX_WIKI}&startkey=%22agents%3A%22&endkey=%22agents%3A%EF%BF%B0%22`;
  const r = await fetch(url, { headers: couchHeaders(), signal: AbortSignal.timeout(REQ_TIMEOUT) });
  if (!r.ok) throw new Error(`CouchDB allDocs failed: ${r.status} ${await r.text().catch(() => '')}`);
  const { rows } = await r.json();
  return rows
    .filter(row => row.doc && !row.id.startsWith('_design/'))
    .map(row => row.doc);
}

// ── Matching logic ─────────────────────────────────────────────────────────────
function dirSlugOf(sourceRef) {
  if (!sourceRef) return null;
  const dir = path.dirname(sourceRef).replace(/\\/g, '/');
  return dir === '.' ? '' : dir.replace(/\//g, ':');
}

function matchWikiDocs(hit, wikiDocs, wikiBySlug) {
  const matched = [];
  const slug = dirSlugOf(hit.source_ref);

  // 1. Exact dir match
  if (slug) {
    const exact = wikiBySlug.get(`agents:dir:${slug}`);
    if (exact) matched.push({ doc: exact, matchType: 'exact-dir' });
  }

  // 2. Parent-dir prefix match (e.g., src:lib:server matches src:lib:server:cache)
  if (slug) {
    for (const doc of wikiDocs) {
      if (matched.some(m => m.doc._id === doc._id)) continue;
      if (doc._id.startsWith(`agents:dir:${slug}`) && doc._id !== `agents:dir:${slug}`) {
        matched.push({ doc, matchType: 'prefix-dir' });
      }
    }
  }

  // 3. Tag intersection — use hit.tags if present
  const hitTags = new Set(hit.tags ?? []);
  if (hitTags.size > 0) {
    for (const doc of wikiDocs) {
      if (matched.some(m => m.doc._id === doc._id)) continue;
      const docTags = doc.qdrant_tags ?? doc.semantic_tags ?? [];
      const shared = docTags.filter(t => hitTags.has(t));
      if (shared.length > 0) {
        matched.push({ doc, matchType: 'tag-match', sharedTags: shared });
      }
    }
  }

  return matched.slice(0, 3); // cap enrichment per hit at 3 wiki docs
}

function summariseWikiDoc(doc, matchType, sharedTags) {
  return {
    id: doc._id,
    matchType,
    title: doc.title ?? doc.id ?? doc._id,
    summary: doc.summary?.slice(0, 300) ?? null,
    rules: Array.isArray(doc.rules) ? doc.rules.slice(0, 3).map(r => r.text ?? r) : [],
    tools: Array.isArray(doc.tools) ? doc.tools.slice(0, 3).map(t => t.name ?? t) : [],
    sharedTags: sharedTags ?? [],
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
const t0 = Date.now();

if (!JSON_OUT) {
  console.log('\n[phase-c] CouchDB GraphRAG Enrichment');
  console.log(`[phase-c] Database: ${COUCHDB_DB} @ ${COUCHDB_URL.replace(/:[^:@]+@/, ':***@')}`);
}

let phaseBResult;
try {
  phaseBResult = await readInput();
} catch (e) {
  console.error(`[phase-c] Failed to read Phase B input: ${e.message}`);
  process.exit(1);
}

const hits = phaseBResult.results ?? [];
if (!JSON_OUT) console.log(`[phase-c] Phase B hits: ${hits.length}`);

if (DRY_RUN) {
  console.log('[phase-c] Dry run — skipping CouchDB fetch');
  process.exit(0);
}

// Fetch wiki docs
let wikiDocs = [];
try {
  if (!JSON_OUT) process.stdout.write('[phase-c] Fetching wiki docs… ');
  wikiDocs = await fetchAllWikiDocs();
  if (!JSON_OUT) console.log(`${wikiDocs.length} docs (${Date.now() - t0}ms)`);
} catch (e) {
  console.warn(`[phase-c] CouchDB offline: ${e.message} — enrichment skipped`);
}

// Build slug index for O(1) exact lookup
const wikiBySlug = new Map(wikiDocs.map(d => [d._id, d]));

// Enrich each hit
const enriched = hits.map(hit => {
  const matches = matchWikiDocs(hit, wikiDocs, wikiBySlug);
  return {
    ...hit,
    wikiEnrichment: matches.map(({ doc, matchType, sharedTags }) =>
      summariseWikiDoc(doc, matchType, sharedTags)
    ),
  };
});

const enrichedCount = enriched.filter(h => h.wikiEnrichment.length > 0).length;

const output = {
  ...phaseBResult,
  results: enriched,
  phaseC: {
    wikiDocsFetched: wikiDocs.length,
    hitsEnriched: enrichedCount,
    latencyMs: Date.now() - t0,
  },
};

if (JSON_OUT) {
  console.log(JSON.stringify(output, null, 2));
} else {
  console.log(`\n[phase-c] Enriched ${enrichedCount}/${hits.length} hits with wiki notes`);
  console.log(`[phase-c] Total latency: ${Date.now() - t0}ms\n`);

  if (VERBOSE) {
    for (const h of enriched.filter(h => h.wikiEnrichment.length > 0)) {
      console.log(`  ${h.source_ref}`);
      for (const w of h.wikiEnrichment) {
        console.log(`    ↳ [${w.matchType}] ${w.id}`);
        if (w.summary) console.log(`      ${w.summary.slice(0, 100)}…`);
      }
    }
  }
}