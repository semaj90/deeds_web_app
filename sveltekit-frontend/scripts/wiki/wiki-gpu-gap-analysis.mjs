#!/usr/bin/env node
// @ts-check
/**
 * wiki:gpu-gap-analysis — offline wiki gap detection + artifact writer
 *
 * Flow:
 *   1. analyzeWikiGaps()   — static file inspection → WikiGap[]
 *   2. buildWikiCards()    — group gaps into WikiCard[]
 *   3. writeWikiArtifacts()— write memory/runs/<run_id>/
 *   4. (optional) CouchDB / Neo4j / Redis sync
 *
 * Flags:
 *   --dry-run       Print gaps and cards, skip all persistence
 *   --no-couch      Skip CouchDB sync
 *   --no-neo4j      Skip Neo4j sync
 *   --no-redis      Skip Redis cache warm
 *   --quiet         Suppress per-gap detail; print only summary line
 *   --run-id=<id>   Override auto-generated run ID
 */

import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SVELTEKIT_ROOT = resolve(__dirname, '../..');
const SRC_ROOT = resolve(SVELTEKIT_ROOT, 'src');
const MEMORY_ROOT = resolve(SVELTEKIT_ROOT, 'memory');

// ── CLI flags ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const NO_COUCH = DRY_RUN || args.includes('--no-couch');
const NO_NEO4J = DRY_RUN || args.includes('--no-neo4j');
const NO_REDIS = DRY_RUN || args.includes('--no-redis');
const QUIET = args.includes('--quiet');
const RUN_ID_OVERRIDE = args.find((a) => a.startsWith('--run-id='))?.split('=')[1];

// ── Dynamic module loader (handles TS source via tsx if available) ────────────

async function loadTsModule(relPath) {
  const absPath = resolve(SVELTEKIT_ROOT, relPath);
  // On Windows, dynamic import() requires a file:// URL, not a raw C: path
  const url = new URL(`file:///${absPath.replace(/\\/g, '/')}`);
  return import(url.href);
}

// ── Logger ───────────────────────────────────────────────────────────────────

function log(...args) { if (!QUIET) console.log(...args); }
function info(...args) { console.log(...args); }
function err(...args)  { console.error(...args); }

// ── CouchDB sync (direct fetch, no $lib imports) ─────────────────────────────

const COUCH_URL  = process.env.COUCHDB_URL  ?? 'http://localhost:5984';
const COUCH_USER = process.env.COUCHDB_USER ?? 'admin';
const COUCH_PASS = process.env.COUCHDB_PASS ?? 'password';
const WIKI_DB    = process.env.COUCHDB_WIKI_DB ?? 'wiki';

function couchAuth() {
  return 'Basic ' + Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64');
}

async function couchUpsert(id, doc) {
  const base = `${COUCH_URL}/${encodeURIComponent(WIKI_DB)}`;
  const headers = { 'Content-Type': 'application/json', Authorization: couchAuth() };

  const getRes = await fetch(`${base}/${encodeURIComponent(id)}`, { headers });
  let rev;
  if (getRes.status === 200) rev = (await getRes.json())._rev;

  const body = rev ? { ...doc, _id: id, _rev: rev } : { ...doc, _id: id };
  const putRes = await fetch(`${base}/${encodeURIComponent(id)}`, {
    method: 'PUT', headers, body: JSON.stringify(body),
  });
  if (!putRes.ok) throw new Error(`CouchDB ${putRes.status}: ${await putRes.text()}`);
}

async function syncToCouchDB(cards, gaps, report) {
  // Ensure DB exists
  await fetch(`${COUCH_URL}/${encodeURIComponent(WIKI_DB)}`, {
    method: 'PUT', headers: { Authorization: couchAuth() },
  });

  let written = 0, errors = 0;

  for (const card of cards) {
    try {
      await couchUpsert(card.id, card);
      written++;
    } catch (e) { err(`  couch err ${card.id}:`, e.message); errors++; }
  }

  for (const gap of gaps) {
    try {
      await couchUpsert(`gap:${gap.id}`, gap);
      written++;
    } catch (e) { err(`  couch err gap:${gap.id}:`, e.message); errors++; }
  }

  try {
    await couchUpsert(`run:gap-report:${report.runId}`, report);
    written++;
  } catch (e) { err('  couch err report:', e.message); errors++; }

  return { written, errors };
}

// ── Redis cache warm (direct ioredis, no $lib) ────────────────────────────────

async function syncToRedis(cards, gaps) {
  let { default: Redis } = await import('ioredis').catch(() => ({ default: null }));
  if (!Redis) { log('  ioredis not available, skipping Redis cache'); return; }

  const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
    password: process.env.REDIS_PASSWORD,
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  try {
    await redis.connect();
    const pipe = redis.pipeline();
    const TTL = 3600;

    for (const card of cards) {
      const slug = card.id.replace(/^wiki:/, '');
      pipe.setex(`wiki:page:${slug}`, TTL, JSON.stringify(card));
    }

    const fileIdx = new Map();
    const symIdx  = new Map();

    for (const gap of gaps.filter((g) => g.status === 'open')) {
      pipe.setex(`wiki:gap:${gap.id}`, TTL, JSON.stringify(gap));
      for (const f of gap.affectedFiles) {
        const list = fileIdx.get(f) ?? [];
        list.push(gap.id);
        fileIdx.set(f, list);
      }
      for (const s of gap.affectedSymbols) {
        const list = symIdx.get(s) ?? [];
        list.push(gap.id);
        symIdx.set(s, list);
      }
    }

    for (const [fp, ids] of fileIdx)   pipe.setex(`wiki:file:${fp}`,    TTL, JSON.stringify(ids));
    for (const [sym, ids] of symIdx)   pipe.setex(`wiki:symbol:${sym}`, TTL, JSON.stringify(ids));

    await pipe.exec();
    log(`  Redis: ${cards.length + gaps.filter(g => g.status === 'open').length} keys written`);
  } catch (e) {
    err('  Redis sync error:', e.message);
  } finally {
    await redis.quit().catch(() => {});
  }
}

// ── Neo4j sync ────────────────────────────────────────────────────────────────

async function syncToNeo4j(cards, gaps, runId) {
  const { syncWikiToNeo4j } = await loadTsModule('src/lib/server/wiki/wiki-neo4j-sync.ts');
  return syncWikiToNeo4j(cards, gaps, runId);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  info('\n🔍 wiki:gpu-gap-analysis starting...');
  if (DRY_RUN) info('   (dry-run mode — no persistence)\n');

  // 1. Gap analysis
  const { analyzeWikiGaps } = await loadTsModule('src/lib/server/wiki/wiki-gap-analyzer.ts');
  const report = await analyzeWikiGaps({ srcRoot: SRC_ROOT, runIdOverride: RUN_ID_OVERRIDE });

  log(`\n📊 Gap analysis complete: run=${report.runId}`);
  log(`   Total: ${report.summary.total} | Open: ${report.summary.open} | HIGH: ${report.summary.high} | MED: ${report.summary.med} | LOW: ${report.summary.low}`);

  if (!QUIET) {
    const open = report.gaps
      .filter((g) => g.status === 'open')
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    for (const g of open) {
      const icon = g.severity === 'HIGH' ? '🔴' : g.severity === 'MED' ? '🟡' : '🟢';
      const score = g.score != null ? ` (score=${g.score.toFixed(2)})` : '';
      console.log(`   ${icon} ${g.id}${score}: ${g.title}`);
    }
  }

  // 2. Build wiki cards
  const { buildWikiCards } = await loadTsModule('src/lib/server/wiki/wiki-card-writer.ts');
  const cards = buildWikiCards(report.gaps);
  log(`\n📄 Wiki cards built: ${cards.length}`);

  // 3. Write artifacts
  const { writeWikiArtifacts } = await loadTsModule('src/lib/server/wiki/wiki-artifact-writer.ts');
  const { runDir, filesWritten } = writeWikiArtifacts(report, cards, MEMORY_ROOT);
  log(`\n📁 Artifacts written to: ${runDir}`);
  for (const f of filesWritten) log(`   ${f}`);

  if (DRY_RUN) {
    info('\n✅ Dry run complete — no persistence performed');
    info(`\nTo run for real:\n  npm run wiki:gpu-gap-analysis\n  (remove --dry-run from the command or env)\n`);
    return;
  }

  // 4. CouchDB
  if (!NO_COUCH) {
    log('\n📦 Syncing to CouchDB...');
    try {
      const r = await syncToCouchDB(cards, report.gaps, report);
      log(`   Written: ${r.written}  Errors: ${r.errors}`);
    } catch (e) { err('   CouchDB sync failed:', e.message); }
  }

  // 5. Neo4j
  if (!NO_NEO4J) {
    log('\n🕸️  Syncing to Neo4j...');
    try {
      const r = await syncToNeo4j(cards, report.gaps, report.runId);
      log(`   WikiPages: ${r.wikiPagesUpserted}  Gaps: ${r.gapsUpserted}  Rels: ${r.relationshipsCreated}`);
      if (r.errors.length) r.errors.forEach((e) => err('   neo4j err:', e));
    } catch (e) { err('   Neo4j sync failed:', e.message); }
  }

  // 6. Redis
  if (!NO_REDIS) {
    log('\n⚡ Warming Redis wiki cache...');
    await syncToRedis(cards, report.gaps);
  }

  info(`\n✅ Done — run ID: ${report.runId}`);
  info(`   Artifacts: ${runDir}`);
  info(`   To view: cat "${runDir}/wiki_gap_report.md"\n`);
}

main().catch((e) => { err('Fatal:', e); process.exit(1); });
