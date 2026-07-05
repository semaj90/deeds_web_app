#!/usr/bin/env node
/**
 * tag-backfill-qdrant.mjs
 *
 * Track 7 Phase B — Deterministic tag backfill for Qdrant codebase_chunks_768.
 *
 * Assigns rule-based tags to ALL points that lack them, based solely on
 * existing payload fields (file_path, extension, topo_class, domain, kind, etc.).
 * No LLM, no GPU, no Redis — pure fetch() to Qdrant.
 *
 * Flags:
 *   --dry-run      scroll + compute tags but skip writes; print sample output
 *   --limit N      only process first N points (for testing)
 *   --missing-only only update points where tags is empty/absent (DEFAULT)
 *   --force        update ALL points even if already tagged
 *
 * Run:
 *   node scripts/atlas/tag-backfill-qdrant.mjs
 *   node scripts/atlas/tag-backfill-qdrant.mjs --dry-run --limit 50
 *   node scripts/atlas/tag-backfill-qdrant.mjs --force
 *
 * npm aliases:
 *   graphify:tag-backfill
 *   graphify:tag-backfill:dry
 *   graphify:tag-backfill:force
 */
import dotenv from 'dotenv';
import { resolveAtlasPaths } from './lib/repo-paths.mjs';

dotenv.config();

const { frontendRoot: ROOT } = resolveAtlasPaths(import.meta.url);

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';
const BATCH_SIZE = 100;
const SCROLL_LIMIT = 250;
const CONCURRENT_REQUESTS = 20; // max parallel payload-set requests per flush

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN      = args.includes('--dry-run');
const FORCE        = args.includes('--force');
const MISSING_ONLY = !FORCE; // default behaviour
const LIMIT_IDX    = args.indexOf('--limit');
const LIMIT        = LIMIT_IDX !== -1 ? parseInt(args[LIMIT_IDX + 1], 10) : 0;

// ── Tag derivation rules (deterministic, no LLM) ─────────────────────────────
function deriveTags(payload) {
  const tags = new Set();
  const fp = payload.file_path || payload.relativePath || payload.path || '';
  // extension may be stored as '.ts' (with leading dot) or 'ts' — normalise both
  const rawExt = (payload.extension || fp.split('.').pop() || '').replace(/^\./, '');
  const ext = rawExt.toLowerCase();
  const kind = (payload.kind || '').toLowerCase();
  const topoClass = payload.topo_class || '';
  const domain = payload.domain || '';
  const lang = (payload.language || '').toLowerCase();

  // ── language field (authoritative when present) ─────────────────────────────
  if (lang === 'typescript' || lang === 'ts')        tags.add('typescript');
  if (lang === 'javascript' || lang === 'js')        tags.add('javascript');
  if (lang === 'svelte')                             { tags.add('svelte'); tags.add('component'); }
  if (lang === 'python')                             tags.add('python');
  if (lang === 'go')                                 tags.add('go');
  if (lang === 'rust')                               tags.add('rust');

  // ── extension tags ──────────────────────────────────────────────────────────
  if (['ts', 'tsx'].includes(ext))                   tags.add('typescript');
  if (['js', 'mjs', 'cjs'].includes(ext))            tags.add('javascript');
  if (ext === 'svelte')                               tags.add('svelte');
  if (ext === 'py')                                   tags.add('python');
  if (ext === 'go')                                   tags.add('go');
  if (['css', 'scss'].includes(ext))                  tags.add('css');
  if (ext === 'sql')                                  tags.add('sql');
  if (['md', 'mdx'].includes(ext))                    tags.add('docs');
  if (ext === 'json')                                 tags.add('config');
  if (['yaml', 'yml', 'toml'].includes(ext))          tags.add('config');
  if (ext === 'proto')                                tags.add('grpc');
  if (ext === 'wgsl')                                 tags.add('gpu');
  if (ext === 'sh')                                   tags.add('script');
  if (ext === 'rs')                                   tags.add('rust');
  if (ext === 'cpp' || ext === 'cc' || ext === 'c')  tags.add('cpp');
  if (ext === 'dockerfile' || ext === 'dockerignore') tags.add('config');

  // ── path-pattern tags ───────────────────────────────────────────────────────
  const fpLower = fp.toLowerCase();

  if (fpLower.includes('/api/'))                                           tags.add('api');
  if (fpLower.includes('/server/'))                                        tags.add('server');
  if (fpLower.includes('/client/') || fpLower.includes('/lib/ai/'))        tags.add('client');
  if (fpLower.includes('/db/') || fpLower.includes('schema'))              tags.add('database');
  if (fpLower.includes('drizzle') || fpLower.includes('migration'))        tags.add('migration');
  if (fpLower.includes('/auth/') || fpLower.includes('session') || fpLower.includes('lucia')) tags.add('auth');
  if (fpLower.includes('/queue/') || fpLower.includes('rabbitmq') || fpLower.includes('amqp')) tags.add('queue');
  if (fpLower.includes('/vector/') || fpLower.includes('qdrant') || fpLower.includes('embedding')) tags.add('vector');
  if (fpLower.includes('redis') || fpLower.includes('cache'))              tags.add('redis');
  if (fpLower.includes('/graph/') || fpLower.includes('neo4j') || fpLower.includes('cypher')) tags.add('graph');
  if (fpLower.includes('ollama') || fpLower.includes('/llm/') || fpLower.includes('inference')) tags.add('inference');
  if (fpLower.includes('grpc') || fpLower.includes('.proto'))              tags.add('grpc');
  if (fpLower.includes('test') || fpLower.includes('spec') || fpLower.includes('playwright')) tags.add('test');
  if (fpLower.includes('script') || fpLower.includes('/atlas/') || fpLower.includes('/startup/')) tags.add('script');
  if (fpLower.includes('/components/') || (fpLower.includes('.svelte') && !fpLower.includes('/routes/'))) tags.add('component');
  if (fpLower.includes('/routes/'))                                        tags.add('route');
  if (fpLower.includes('/stores/') || fpLower.includes('.svelte.ts'))      tags.add('store');
  if (fpLower.includes('worker') || fpLower.includes('/gpu/') || fpLower.includes('cuda') || fpLower.includes('wgsl')) tags.add('gpu');
  if (fpLower.includes('evidence') || fpLower.includes('legal') || fpLower.includes('/cases/')) tags.add('legal');
  if (fpLower.includes('/mcp/') || fpLower.includes('mcp'))               tags.add('mcp');
  if (fpLower.includes('onnx') || fpLower.includes('wasm'))               tags.add('onnx');
  if (fpLower.includes('docker') || fpLower.includes('compose'))          tags.add('config');
  if (fpLower.includes('unocss') || fpLower.includes('tailwind'))         tags.add('css');
  if (fpLower.includes('vite') || fpLower.includes('svelte.config'))      tags.add('config');
  if (fpLower.includes('/hooks') || fpLower.includes('hooks.server'))     tags.add('server');

  // ── topo_class → tag ────────────────────────────────────────────────────────
  const topoMap = {
    'api-route':        'api',
    'server-lib':       'server',
    'client-lib':       'client',
    'svelte-component': 'component',
    'svelte-page':      'route',
    'config-file':      'config',
    'test-file':        'test',
    'script-file':      'script',
    'schema-file':      'database',
    'migration-file':   'migration',
  };
  if (topoMap[topoClass]) tags.add(topoMap[topoClass]);

  // ── domain tags ─────────────────────────────────────────────────────────────
  if (domain) {
    const domainTag = domain.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (domainTag.length > 0 && domainTag.length <= 30) tags.add(domainTag);
  }

  // ── kind tags ───────────────────────────────────────────────────────────────
  if (kind === 'function' || kind === 'method') tags.add('function');
  if (kind === 'class')                          tags.add('class');
  if (kind === 'interface' || kind === 'type')   tags.add('type');
  if (kind === 'component')                      { tags.add('component'); tags.add('svelte'); }

  // ── minimum: always include the extension if meaningful ─────────────────────
  if (ext && ext.length > 0 && ext.length < 10 && /^[a-z0-9]+$/.test(ext)) {
    tags.add(ext);
  }

  return [...tags].filter(Boolean);
}

// ── Qdrant helpers ────────────────────────────────────────────────────────────

async function scrollPage(offset) {
  const scrollBody = {
    with_payload: ['tags', 'file_path', 'relativePath', 'path', 'extension', 'kind', 'topo_class', 'domain', 'language'],
    with_vector: false,
    limit: SCROLL_LIMIT,
    ...(offset != null ? { offset } : {}),
    ...(MISSING_ONLY ? {
      filter: {
        should: [
          { is_empty: { key: 'tags' } },
          { is_null:  { key: 'tags' } },
        ],
      },
    } : {}),
  };

  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scrollBody),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Qdrant scroll failed ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.result;
}

/** Send one payload-set request (wait=false for speed). */
async function setPayload(pointId, payload) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload?wait=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, points: [pointId] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`\n[tag-backfill] WARN: payload set failed for ${pointId}: ${res.status} ${body}`);
  }
}

/** Flush a batch of {id, payload} entries with bounded concurrency. */
async function flushBatch(batch) {
  if (DRY_RUN) return;

  // Process in groups of CONCURRENT_REQUESTS to avoid overwhelming Qdrant
  for (let i = 0; i < batch.length; i += CONCURRENT_REQUESTS) {
    const chunk = batch.slice(i, i + CONCURRENT_REQUESTS);
    await Promise.all(chunk.map(b => setPayload(b.id, b.payload)));
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`[tag-backfill] Collection : ${COLLECTION}`);
  console.log(`[tag-backfill] Qdrant URL : ${QDRANT_URL}`);
  console.log(`[tag-backfill] Mode       : ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`[tag-backfill] Scope      : ${FORCE ? 'all points (--force)' : 'missing-tag points only (--missing-only)'}`);
  if (LIMIT) console.log(`[tag-backfill] Limit      : ${LIMIT} points`);
  console.log('');

  // Verify collection exists
  const infoRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
  if (!infoRes.ok) {
    console.error(`[tag-backfill] Collection '${COLLECTION}' not found or Qdrant unreachable`);
    process.exit(1);
  }
  const info = await infoRes.json();
  const totalPts = info.result?.points_count ?? '?';
  console.log(`[tag-backfill] Total points in collection: ${totalPts}`);
  console.log('');

  let offset = null;
  let totalProcessed = 0;
  let totalUpdated   = 0;
  let totalSkipped   = 0;
  let totalEmpty     = 0;  // derived empty tag sets (unparseable paths)
  const updateBatch  = [];
  let samplesPrinted = 0;
  const MAX_SAMPLES  = 10;

  do {
    const page = await scrollPage(offset);
    const points = page.points ?? [];

    for (const pt of points) {
      if (LIMIT && totalProcessed >= LIMIT) break;

      const existingTags = pt.payload?.tags;
      const hasRealTags = Array.isArray(existingTags) && existingTags.length > 0;

      // If --missing-only (default) the scroll filter already excludes tagged points,
      // but --force bypasses the filter so we re-check here.
      if (hasRealTags && !FORCE) {
        totalSkipped++;
        totalProcessed++;
        continue;
      }

      const newTags = deriveTags(pt.payload ?? {});

      if (newTags.length === 0) {
        totalEmpty++;
        totalProcessed++;
        continue;
      }

      // Dry-run sample output
      if (DRY_RUN && samplesPrinted < MAX_SAMPLES) {
        const fp = pt.payload?.file_path || pt.payload?.relativePath || pt.payload?.path || '(no path)';
        console.log(`[tag-backfill] sample pt ${String(pt.id).slice(0, 8)}… | ${fp.slice(-60)} → tags: [${newTags.join(', ')}]`);
        samplesPrinted++;
      }

      updateBatch.push({ id: pt.id, payload: { tags: newTags } });
      totalUpdated++;
      totalProcessed++;

      if (updateBatch.length >= BATCH_SIZE) {
        await flushBatch(updateBatch);
        updateBatch.length = 0;
      }
    }

    // Progress line
    process.stdout.write(
      `\r[tag-backfill] processed ${totalProcessed} pts | updated ${totalUpdated} | skipped ${totalSkipped} | empty ${totalEmpty}   `
    );

    offset = page.next_page_offset ?? null;

    if (LIMIT && totalProcessed >= LIMIT) break;
  } while (offset !== null);

  // Flush remainder
  if (updateBatch.length > 0) {
    await flushBatch(updateBatch);
    updateBatch.length = 0;
  }

  console.log(''); // newline after progress
  console.log('');

  if (DRY_RUN) {
    console.log(`[tag-backfill] DRY RUN complete — would update ~${totalUpdated} points (0 written)`);
    console.log(`[tag-backfill]   skipped (already tagged): ${totalSkipped}`);
    console.log(`[tag-backfill]   empty (no path data):     ${totalEmpty}`);
  } else {
    console.log(`[tag-backfill] DONE — processed ${totalProcessed} pts | updated ${totalUpdated} | skipped ${totalSkipped} | empty ${totalEmpty}`);

    // Verify coverage after full run
    if (!LIMIT) {
      const infoAfter = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`).then(r => r.json()).catch(() => null);
      const schemaAfter = infoAfter?.result?.payload_schema;
      const tagPts = schemaAfter?.tags?.points ?? '(schema not updated yet)';
      console.log(`[tag-backfill] payload_schema tags.points after run: ${tagPts}`);
    }
  }
}

run().catch(err => {
  console.error('\n[tag-backfill] fatal error:', err.message);
  process.exit(1);
});
