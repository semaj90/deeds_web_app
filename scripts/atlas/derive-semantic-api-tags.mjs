#!/usr/bin/env node
/**
 * scripts/atlas/derive-semantic-api-tags.mjs
 *
 * Replaces dumb path-segment tags with rich behavior/API semantic tags derived
 * entirely from existing Postgres columns — no LLM calls, fully deterministic.
 *
 * Tag categories derived:
 *   Capability:   has_sse, has_upload, has_form_action, has_streaming, has_llm,
 *                 has_auth, has_zod, has_drizzle, has_qdrant, has_redis,
 *                 has_neo4j, has_couchdb, has_duckdb, has_playwright
 *   CRUD intent:  crud:evidence, crud:case, crud:user, crud:document, crud:statute
 *   API shape:    api:read, api:write, api:delete, api:search
 *   Auth:         auth:required
 *   Runtime:      runtime:server, runtime:client, runtime:ssr
 *   Component:    component:svelte, route:api, route:page
 *
 * Usage:
 *   node scripts/atlas/derive-semantic-api-tags.mjs --dry-run
 *   node scripts/atlas/derive-semantic-api-tags.mjs --apply
 *   node scripts/atlas/derive-semantic-api-tags.mjs --apply --limit=500
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const LIMIT_IDX = process.argv.indexOf('--limit');
const LIMIT = LIMIT_IDX >= 0 ? parseInt(process.argv[LIMIT_IDX + 1], 10) : 0;

function loadEnv() {
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
}
loadEnv();

const DATABASE_URL = process.env.DATABASE_URL
  ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

// ── Tag derivation logic ────────────────────────────────────────────────────

function importsContains(imports, ...terms) {
  if (!imports) return false;
  const imp = JSON.stringify(imports).toLowerCase();
  return terms.some(t => imp.includes(t.toLowerCase()));
}

function handlersContain(handlers, ...methods) {
  if (!handlers) return false;
  const h = JSON.stringify(handlers).toUpperCase();
  return methods.some(m => h.includes(m));
}

function refContains(sourceRef, ...terms) {
  const ref = sourceRef.toLowerCase();
  return terms.some(t => ref.includes(t.toLowerCase()));
}

function deriveTags(row) {
  const {
    source_ref,
    is_route,
    is_svelte_comp,
    has_auth,
    has_zod,
    drizzle_refs,
    imports,
    exports,
    route_handlers,
    payload,
    tags: existingTags,
  } = row;

  const tags = new Set();

  // ── Preserve non-semantic existing tags (not path segments) ──
  if (Array.isArray(existingTags)) {
    for (const t of existingTags) {
      // Keep semantic tags already there, drop dumb directory segments
      if (
        t.startsWith('has_') || t.startsWith('crud:') || t.startsWith('api:') ||
        t.startsWith('auth:') || t.startsWith('runtime:') || t.startsWith('route:') ||
        t.startsWith('component:') || t === 'vendor' || t === 'excluded_from_profile_cards'
      ) {
        tags.add(t);
      }
    }
  }

  // ── Capability tags ──────────────────────────────────────────
  if (has_auth) tags.add('has_auth');
  if (has_zod) tags.add('has_zod');
  if (drizzle_refs && (Array.isArray(drizzle_refs) ? drizzle_refs.length > 0 : Object.keys(drizzle_refs).length > 0)) {
    tags.add('has_drizzle');
  }

  if (importsContains(imports, 'qdrant') || refContains(source_ref, 'qdrant', 'vector')) tags.add('has_qdrant');
  if (importsContains(imports, 'redis', 'ioredis', 'valkey')) tags.add('has_redis');
  if (importsContains(imports, 'neo4j')) tags.add('has_neo4j');
  if (importsContains(imports, 'couchdb', 'nano', 'pouchdb')) tags.add('has_couchdb');
  if (importsContains(imports, 'duckdb')) tags.add('has_duckdb');
  if (importsContains(imports, 'playwright', 'chromium')) tags.add('has_playwright');

  // SSE: GET handler on an SSE route
  if (handlersContain(route_handlers, 'GET') && refContains(source_ref, 'sse', 'stream', 'event')) {
    tags.add('has_sse');
    tags.add('has_streaming');
  }
  // Streaming from imports
  if (importsContains(imports, 'ReadableStream', 'EventSource', 'stream')) {
    tags.add('has_streaming');
  }

  // Upload
  if (
    (handlersContain(route_handlers, 'POST') && refContains(source_ref, 'upload', 'ingest', 'import')) ||
    importsContains(imports, 'formData', 'multer', 'busboy')
  ) {
    tags.add('has_upload');
  }

  // Form action
  if (is_route && payload && JSON.stringify(payload).includes('actions')) {
    tags.add('has_form_action');
  }
  if (is_route && refContains(source_ref, 'form', 'action', 'submit')) {
    tags.add('has_form_action');
  }

  // LLM
  if (
    refContains(source_ref, 'gemma', 'ollama', 'llm', 'chat', 'ai/') ||
    importsContains(imports, 'ollama', 'openai', 'gemma', 'llm', 'langchain', 'fastmcp')
  ) {
    tags.add('has_llm');
  }

  // Server action (SvelteKit)
  if (is_route && refContains(source_ref, '+server')) {
    tags.add('has_server_action');
  }

  // ── CRUD intent ──────────────────────────────────────────────
  if (refContains(source_ref, 'evidence', 'exhibit')) tags.add('crud:evidence');
  if (refContains(source_ref, 'cases/', 'case/', '/case')) tags.add('crud:case');
  if (refContains(source_ref, 'user', 'auth', 'login', 'register', 'profile')) tags.add('crud:user');
  if (refContains(source_ref, 'document', 'pdf', 'ocr')) tags.add('crud:document');
  if (refContains(source_ref, 'statute', 'legal-corpus', 'citation')) tags.add('crud:statute');

  // ── API shape ────────────────────────────────────────────────
  if (handlersContain(route_handlers, 'GET')) tags.add('api:read');
  if (handlersContain(route_handlers, 'POST', 'PUT', 'PATCH')) tags.add('api:write');
  if (handlersContain(route_handlers, 'DELETE')) tags.add('api:delete');
  if (refContains(source_ref, 'search', 'query', 'retriev', 'lookup')) tags.add('api:search');

  // ── Auth ─────────────────────────────────────────────────────
  if (has_auth && is_route) tags.add('auth:required');

  // ── Runtime ─────────────────────────────────────────────────
  if (is_route && refContains(source_ref, '+server')) {
    tags.add('runtime:server');
  } else if (is_route) {
    tags.add('runtime:ssr');
    tags.add('runtime:server');
  }
  if (is_svelte_comp && !is_route) {
    tags.add('runtime:client');
  }

  // ── Component type ───────────────────────────────────────────
  if (is_svelte_comp) tags.add('component:svelte');
  if (is_route && refContains(source_ref, 'routes/api/', '/api/')) tags.add('route:api');
  if (is_route && is_svelte_comp) tags.add('route:page');
  if (is_route && refContains(source_ref, '+server')) tags.add('route:api');

  return [...tags].sort();
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══ Derive Semantic API Tags ══════════════════════════════');
  console.log(`  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  if (LIMIT) console.log(`  Limit: ${LIMIT} rows`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  console.log('\n  Step 1: Load source rows (excluding vendor + feature:*)...');
  const limitClause = LIMIT ? `LIMIT ${LIMIT}` : '';
  const { rows } = await pool.query(`
    SELECT
      id, source_ref, is_route, is_svelte_comp, has_auth, has_zod,
      drizzle_refs, imports, exports, route_handlers, payload, tags
    FROM parent_atlas_documents
    WHERE source_ref NOT LIKE 'feature:%'
      AND NOT ('vendor' = ANY(COALESCE(tags, '{}')))
    ORDER BY source_ref
    ${limitClause}
  `);
  console.log(`  ✅ Loaded ${rows.length} source rows`);

  // Derive tags for each
  console.log('\n  Step 2: Derive semantic tags...');
  const results = rows.map(row => ({
    id: row.id,
    source_ref: row.source_ref,
    old_tags: row.tags ?? [],
    new_tags: deriveTags(row),
  }));

  // Stats
  const tagFreq = {};
  for (const r of results) {
    for (const t of r.new_tags) {
      tagFreq[t] = (tagFreq[t] ?? 0) + 1;
    }
  }

  const avgOld = results.reduce((s, r) => s + r.old_tags.length, 0) / results.length;
  const avgNew = results.reduce((s, r) => s + r.new_tags.length, 0) / results.length;

  console.log(`  Tags avg before: ${avgOld.toFixed(1)}`);
  console.log(`  Tags avg after:  ${avgNew.toFixed(1)}`);

  console.log('\n  Top 20 tag frequencies:');
  Object.entries(tagFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([t, n]) => console.log(`    ${String(n).padStart(5)}  ${t}`));

  if (VERBOSE) {
    console.log('\n  Sample (first 3):');
    results.slice(0, 3).forEach(r => {
      console.log(`\n  ${r.source_ref}`);
      console.log(`    old: ${JSON.stringify(r.old_tags)}`);
      console.log(`    new: ${JSON.stringify(r.new_tags)}`);
    });
  }

  // Report
  const report = {
    timestamp: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    rows_processed: results.length,
    avg_tags_before: avgOld,
    avg_tags_after: avgNew,
    tag_frequencies: tagFreq,
    sample: results.slice(0, 10).map(r => ({
      source_ref: r.source_ref,
      new_tags: r.new_tags,
    })),
  };
  const reportPath = path.join(ROOT, '.tmp', 'semantic-api-tags-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n  Report → ${reportPath}`);

  if (!APPLY) {
    console.log('\n  [DRY-RUN] No writes. Pass --apply to update tags.');
    await pool.end();
    return;
  }

  // Apply: bulk UPDATE
  console.log('\n  Step 3: Writing tags to parent_atlas_documents...');
  let updated = 0;
  let failed = 0;
  const BATCH = 200;

  for (let i = 0; i < results.length; i += BATCH) {
    const batch = results.slice(i, i + BATCH);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of batch) {
        await client.query(`
          UPDATE parent_atlas_documents
          SET tags = $1::text[], updated_at = now()
          WHERE id = $2
        `, [r.new_tags, r.id]);
        updated++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      failed += batch.length;
      console.error(`  [batch ${i}] failed:`, err.message);
    } finally {
      client.release();
    }
    if ((i + BATCH) % 1000 === 0 || i + BATCH >= results.length) {
      console.log(`  updated ${Math.min(i + BATCH, results.length)}...`);
    }
  }

  await pool.end();

  // Refresh report with applied stats
  report.applied = { updated, failed };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n══ Results ════════════════════════════════════════════════');
  console.log(`  Rows processed: ${results.length}`);
  console.log(`  Updated:        ${updated}`);
  console.log(`  Failed:         ${failed}`);
  console.log('\n  ✅ Semantic tags written. Next: gemma4-parent-atlas-summaries.mjs');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
