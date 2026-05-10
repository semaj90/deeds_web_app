#!/usr/bin/env node
/**
 * test-web-search.mjs
 *
 * Smoke test for the web_search cascade:
 *   1. SearXNG  (self-hosted :8888)
 *   2. DuckDuckGo Instant Answer (fallback)
 *
 * Usage:
 *   node scripts/test-web-search.mjs
 *   node scripts/test-web-search.mjs "hearsay evidence rule"
 *   node scripts/test-web-search.mjs --provider=duckduckgo
 */

import dotenv from 'dotenv';
dotenv.config();

const SEARXNG_URL = process.env.SEARXNG_URL ?? 'http://127.0.0.1:8888';
const rawArgs = process.argv.slice(2).filter(a => !a.startsWith('--'));
const query = rawArgs[0] ?? 'wikipedia hearsay evidence rule';
const forceProvider = process.argv.find(a => a.startsWith('--provider='))?.split('=')[1];

const TIMEOUT_MS = 8000;

// ── SearXNG ───────────────────────────────────────────────────────────────────

async function testSearXNG(q) {
  const url = new URL('/search', SEARXNG_URL);
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'json');
  url.searchParams.set('categories', 'general');

  const t0 = Date.now();
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const ms = Date.now() - t0;

  if (!res.ok) throw new Error(`SearXNG HTTP ${res.status}`);
  const data = await res.json();
  const results = (data.results ?? []).slice(0, 5);

  return { provider: 'searxng', ms, count: results.length, results };
}

// ── DuckDuckGo Instant Answer ─────────────────────────────────────────────────

async function testDuckDuckGo(q) {
  const url = new URL('https://api.duckduckgo.com/');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'json');
  url.searchParams.set('no_html', '1');
  url.searchParams.set('skip_disambig', '1');

  const t0 = Date.now();
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const ms = Date.now() - t0;

  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
  const data = await res.json();

  const results = [];
  if (data.Abstract) {
    results.push({ title: data.Heading, url: data.AbstractURL, snippet: data.Abstract.slice(0, 300) });
  }
  for (const t of (data.RelatedTopics ?? []).slice(0, 4)) {
    if (t.Text && t.FirstURL) {
      results.push({ title: t.Text.slice(0, 80), url: t.FirstURL, snippet: t.Text.slice(0, 200) });
    }
  }

  return { provider: 'duckduckgo', ms, count: results.length, results };
}

// ── Wikipedia direct (bonus) ──────────────────────────────────────────────────

async function testWikipedia(q) {
  // Use Wikipedia opensearch API — works for any query, returns matching articles
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.searchParams.set('action', 'opensearch');
  url.searchParams.set('search', q);
  url.searchParams.set('limit', '3');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');

  const t0 = Date.now();
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const ms = Date.now() - t0;

  if (!res.ok) return { provider: 'wikipedia', ms, count: 0, results: [] };
  const [, titles, snippets, urls] = await res.json();
  const results = titles.map((title, i) => ({
    title, url: urls[i], snippet: snippets[i] ?? '',
  }));
  return { provider: 'wikipedia', ms, count: results.length, results };
}

// ── Runner ────────────────────────────────────────────────────────────────────

function printResult(r) {
  const mark = r.count > 0 ? '✅' : '⚠️ ';
  console.log(`\n${mark} ${r.provider.toUpperCase()}  (${r.ms}ms, ${r.count} results)`);
  for (const [i, hit] of r.results.entries()) {
    console.log(`  [${i + 1}] ${hit.title}`);
    console.log(`      ${hit.url}`);
    console.log(`      ${(hit.snippet ?? '').slice(0, 120)}...`);
  }
  if (r.count === 0) console.log('  (no results)');
}

async function run() {
  console.log(`[web-search-test] query: "${query}"`);
  console.log(`[web-search-test] SearXNG: ${SEARXNG_URL}\n`);

  const tests = [];

  if (!forceProvider || forceProvider === 'searxng') {
    tests.push(
      testSearXNG(query)
        .then(r => { printResult(r); return r; })
        .catch(err => {
          console.log(`\n⚠️  SEARXNG  FAIL: ${err.message}`);
          console.log('   Is SearXNG running? docker compose ps searxng');
          return { provider: 'searxng', ms: 0, count: 0, results: [], error: err.message };
        })
    );
  }

  if (!forceProvider || forceProvider === 'duckduckgo') {
    tests.push(
      testDuckDuckGo(query)
        .then(r => { printResult(r); return r; })
        .catch(err => {
          console.log(`\n⚠️  DUCKDUCKGO  FAIL: ${err.message}`);
          return { provider: 'duckduckgo', ms: 0, count: 0, results: [], error: err.message };
        })
    );
  }

  if (!forceProvider || forceProvider === 'wikipedia') {
    tests.push(
      testWikipedia(query)
        .then(r => { printResult(r); return r; })
        .catch(err => {
          console.log(`\n⚠️  WIKIPEDIA  FAIL: ${err.message}`);
          return { provider: 'wikipedia', ms: 0, count: 0, results: [], error: err.message };
        })
    );
  }

  const results = await Promise.all(tests);
  const anyHit = results.some(r => r.count > 0);
  console.log(`\n${ anyHit ? '✅ PASS' : '❌ FAIL'} — web_search cascade ${anyHit ? 'returned results' : 'returned nothing'}`);

  if (!anyHit) {
    console.log('\nTroubleshooting:');
    console.log('  SearXNG:    docker compose up searxng -d');
    console.log('  DuckDuckGo: check internet connectivity');
    console.log('  Wikipedia:  check internet connectivity');
    process.exitCode = 1;
  }
}

run().catch(e => { console.error(e); process.exitCode = 1; });
