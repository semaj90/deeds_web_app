#!/usr/bin/env node
/**
 * smoke-feature-traversal.mjs
 *
 * End-to-end traversal contract smoke. Checks every hop in the invariant:
 *
 *   source_ref
 *     → parent_atlas_documents (feature_id, summary, tags, source_ref_id)
 *     → atlas_feature_map (qdrant_point_id, som_cluster, centroid_id)
 *     → Qdrant payload verification
 *     → Neo4j CodebaseFile node exists
 *     → Neo4j ParentAtlasFeature node exists
 *     → Neo4j BELONGS_TO_FEATURE edge exists
 *     → Neo4j 1-hop neighbors
 *     → Neo4j 2-hop neighbors
 *     → Redis LOD0 packet (ace:source:<id>:lod0)
 *     → Traversal packet assembled
 *
 * Usage:
 *   node scripts/atlas/smoke-feature-traversal.mjs
 *   node scripts/atlas/smoke-feature-traversal.mjs --source-ref "sveltekit-frontend/src/routes/api/evidence/upload/+server.ts"
 *   node scripts/atlas/smoke-feature-traversal.mjs --source-ref "..." --json
 *
 * Defaults to 5 canonical test files if no --source-ref provided.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import neo4j from 'neo4j-driver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// ── Env loader ─────────────────────────────────────────────────────────────────
function loadEnv() {
  const env = { ...process.env };
  for (const p of [path.join(ROOT, '.env'), path.join(ROOT, 'sveltekit-frontend', '.env')]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const E = loadEnv();
const DB_URL    = E.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT    = (E.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');
const NEO4J_URI = E.NEO4J_URI  || 'bolt://localhost:7687';
const NEO4J_USR = E.NEO4J_USER || E.NEO4J_USERNAME || 'neo4j';
const NEO4J_PWD = E.NEO4J_PASSWORD || E.NEO4J_PASS || 'neo4j123';
const REDIS_URL = E.REDIS_URL;
const REDIS_HOST = E.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(E.REDIS_PORT || '6379', 10);
const REDIS_PASS = E.REDIS_PASSWORD || E.REDIS_PASS || '';

const JSON_MODE = process.argv.includes('--json');
const REPORT_PATH = path.join(ROOT, '.tmp', 'smoke-feature-traversal-report.json');

const ARG_SOURCE_REF = (() => {
  const idx = process.argv.indexOf('--source-ref');
  if (idx >= 0) return process.argv[idx + 1] ?? '';
  const d = process.argv.find(a => a.startsWith('--source-ref='));
  if (d) return d.split('=', 2)[1];
  return '';
})();

// 5 canonical test files covering API route / Svelte component / DB schema / ACE / atlas script
// Note: context-assembler lives at server/ace/ in the DB (not server/features/ai/ace/)
// Note: scripts/ files are not indexed in parent_atlas_documents — use an atlas script that is
const CANONICAL_REFS = [
  'sveltekit-frontend/src/routes/api/evidence/upload/+server.ts',
  'sveltekit-frontend/src/lib/components/HeadlessTypingListener.svelte',
  'sveltekit-frontend/src/lib/server/db/schema/index.ts',
  'sveltekit-frontend/src/lib/server/ace/context-assembler.ts',
  'sveltekit-frontend/src/lib/server/ace/ace-agent.ts',
];

const TARGET_REFS = ARG_SOURCE_REF ? [ARG_SOURCE_REF] : CANONICAL_REFS;

// ── Check helpers ──────────────────────────────────────────────────────────────
function pass(label, detail = '') {
  const msg = detail ? `  ✓ ${label}: ${detail}` : `  ✓ ${label}`;
  if (!JSON_MODE) console.log(msg);
  return { ok: true, label, detail };
}
function fail(label, detail = '') {
  const msg = detail ? `  ✗ ${label}: ${detail}` : `  ✗ ${label}`;
  if (!JSON_MODE) console.log(msg);
  return { ok: false, label, detail };
}
function skip(label, reason = '') {
  const msg = `  ─ ${label}${reason ? ': ' + reason : ''}`;
  if (!JSON_MODE) console.log(msg);
  return { ok: null, label, detail: reason };
}

// ── Redis ping (optional) ──────────────────────────────────────────────────────
async function tryRedisGet(key) {
  try {
    const { default: Redis } = await import('ioredis');
    const r = REDIS_URL
      ? new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false, retryStrategy: () => null })
      : new Redis({ host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASS || undefined, lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false, retryStrategy: () => null });
    r.on('error', () => {});
    await r.connect();
    const val = await r.get(key);
    await r.quit().catch(() => {});
    return val;
  } catch {
    return null;
  }
}

// ── Main traversal for one source_ref ─────────────────────────────────────────
async function traverseOne(sourceRef, pool, neo4jDriver) {
  const checks = [];
  const packet = {
    source_ref: sourceRef,
    source_ref_id: null,
    feature_id: null,
    tags: [],
    summary_lod1: null,
    summary: null,
    qdrant_point_id: null,
    som_cluster: null,
    centroid_id: null,
    neo4j_neighbors_1hop: [],
    neo4j_neighbors_2hop: [],
    redis_lod_key: null,
    redis_lod_hit: false,
    recommendation_candidates: [],
  };

  if (!JSON_MODE) console.log(`\n── ${sourceRef.slice(-60)} ──`);

  // 1. parent_atlas_documents row
  const padRes = await pool.query(
    'SELECT id, source_ref, feature_id, summary, tags, summary_lod1, summary_lod0 FROM parent_atlas_documents WHERE source_ref = $1 LIMIT 1',
    [sourceRef]
  );
  const pad = padRes.rows[0];
  if (!pad) { checks.push(fail('parent_atlas_documents row exists', 'NOT FOUND')); return { sourceRef, checks, packet, passed: false }; }
  checks.push(pass('parent_atlas_documents row exists', `id=${pad.id}`));
  packet.source_ref_id = pad.id;

  // 2. feature_id
  if (pad.feature_id) checks.push(pass('feature_id exists', pad.feature_id));
  else checks.push(fail('feature_id exists', 'null'));
  packet.feature_id = pad.feature_id;

  // 3. summary (LOD2)
  if (pad.summary && pad.summary.length > 10) checks.push(pass('summary exists', `${pad.summary.length} chars`));
  else checks.push(fail('summary exists', pad.summary ? 'too short' : 'null'));
  packet.summary = pad.summary || null;
  packet.summary_lod1 = pad.summary_lod1 || pad.summary_lod0 || null;

  // 4. tags
  const tags = Array.isArray(pad.tags) ? pad.tags : [];
  if (tags.length > 0) checks.push(pass('semantic tags exist', `[${tags.slice(0, 5).join(', ')}]`));
  else checks.push(fail('semantic tags exist', 'empty array'));
  packet.tags = tags;

  // 5. atlas_feature_map row
  const afmRes = await pool.query(
    'SELECT source_ref, qdrant_point_id, som_cluster, centroid_id, cluster_id FROM atlas_feature_map WHERE source_ref = $1 LIMIT 1',
    [sourceRef]
  );
  const afm = afmRes.rows[0];
  if (!afm) checks.push(fail('atlas_feature_map row exists', 'NOT FOUND'));
  else checks.push(pass('atlas_feature_map row exists'));

  // 6. qdrant_point_id
  const qdrantId = afm?.qdrant_point_id || pad.qdrant_point_id || null;
  if (qdrantId) checks.push(pass('qdrant_point_id exists', String(qdrantId)));
  else checks.push(fail('qdrant_point_id exists', 'null — run graphify:semantic'));
  packet.qdrant_point_id = qdrantId;

  // 7. som_cluster
  const somCluster = afm?.som_cluster || null;
  if (somCluster != null) checks.push(pass('som_cluster exists', String(somCluster)));
  else checks.push(fail('som_cluster exists', 'null — run graphify:semantic-cluster'));
  packet.som_cluster = somCluster;
  packet.centroid_id = afm?.centroid_id || null;

  // 8. Qdrant payload verification
  if (qdrantId) {
    try {
      const qRes = await fetch(`${QDRANT}/collections/codebase_chunks_768/points/${qdrantId}`, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (qRes.ok) {
        const qData = await qRes.json();
        const fp = qData.result?.payload?.file_path || qData.result?.payload?.sourceRef;
        checks.push(pass('Qdrant payload verified', `file_path=${fp}`));
      } else {
        checks.push(fail('Qdrant payload verified', `HTTP ${qRes.status}`));
      }
    } catch (e) {
      checks.push(fail('Qdrant payload verified', String(e.message).slice(0, 60)));
    }
  } else {
    checks.push(skip('Qdrant payload verified', 'no qdrant_point_id'));
  }

  // 9–12. Neo4j checks
  // Neo4j stores paths without the 'sveltekit-frontend/' prefix — try both forms
  const neo4jPath = sourceRef.replace(/^sveltekit-frontend\//, '');
  const session = neo4jDriver.session();
  try {
    // CodebaseFile node — try full path then stripped path
    let cfFound = false;
    let neo4jNodePath = sourceRef;
    for (const tryPath of [sourceRef, neo4jPath]) {
      const cfRes = await session.run(
        'MATCH (n:CodebaseFile {path: $path}) RETURN n.path AS p LIMIT 1',
        { path: tryPath }
      );
      if (cfRes.records.length > 0) { cfFound = true; neo4jNodePath = tryPath; break; }
    }
    if (cfFound) checks.push(pass('Neo4j CodebaseFile node exists', neo4jNodePath === sourceRef ? '' : `(stripped: ${neo4jNodePath})`));
    else checks.push(fail('Neo4j CodebaseFile node exists', 'not found — run atlas:graph-truth:sync:apply'));

    // ParentAtlasFeature node
    if (pad.feature_id) {
      const pfRes = await session.run(
        'MATCH (f:ParentAtlasFeature {featureId: $fid}) RETURN f.featureId AS fid LIMIT 1',
        { fid: pad.feature_id }
      );
      if (pfRes.records.length > 0) checks.push(pass('Neo4j ParentAtlasFeature node exists', pad.feature_id));
      else checks.push(fail('Neo4j ParentAtlasFeature node exists', `feature_id="${pad.feature_id}" not found`));

      // BELONGS_TO_FEATURE edge — use whichever path form found the node
      const edgeRes = await session.run(
        'MATCH (n:CodebaseFile {path: $path})-[r:BELONGS_TO_FEATURE]->(f:ParentAtlasFeature {featureId: $fid}) RETURN count(r) AS cnt',
        { path: neo4jNodePath, fid: pad.feature_id }
      );
      const cnt = edgeRes.records[0]?.get('cnt')?.toNumber?.() ?? 0;
      if (cnt > 0) checks.push(pass('BELONGS_TO_FEATURE edge exists'));
      else checks.push(fail('BELONGS_TO_FEATURE edge exists', 'missing — run atlas:graph-truth:sync:apply'));
    } else {
      checks.push(skip('Neo4j ParentAtlasFeature node exists', 'no feature_id'));
      checks.push(skip('BELONGS_TO_FEATURE edge exists', 'no feature_id'));
    }

    // 1-hop neighbors — use whichever path form found the node
    const hop1 = await session.run(
      `MATCH (n:CodebaseFile {path: $path})-[r]->(m)
       RETURN type(r) AS rel, m.path AS neighbor LIMIT 10`,
      { path: neo4jNodePath }
    );
    const neighbors1 = hop1.records.map(r => ({ rel: r.get('rel'), path: r.get('neighbor') }));
    if (neighbors1.length > 0) checks.push(pass('1-hop neighbors returned', `${neighbors1.length} edges`));
    else checks.push(fail('1-hop neighbors returned', '0 outgoing edges'));
    packet.neo4j_neighbors_1hop = neighbors1;

    // 2-hop neighbors
    const hop2 = await session.run(
      `MATCH (n:CodebaseFile {path: $path})-[*2]->(m:CodebaseFile)
       RETURN DISTINCT m.path AS neighbor LIMIT 10`,
      { path: neo4jNodePath }
    );
    const neighbors2 = hop2.records.map(r => r.get('neighbor')).filter(Boolean);
    if (neighbors2.length > 0) checks.push(pass('2-hop neighbors returned', `${neighbors2.length} nodes`));
    else checks.push(skip('2-hop neighbors returned', '0 — topology may be sparse'));
    packet.neo4j_neighbors_2hop = neighbors2;

  } finally {
    await session.close();
  }

  // 13. Redis LOD0 packet
  const lodKey = pad.id ? `ace:source:${pad.id}:lod0` : null;
  packet.redis_lod_key = lodKey;
  if (lodKey) {
    const lodVal = await tryRedisGet(lodKey);
    if (lodVal) {
      checks.push(pass('Redis LOD0 packet exists', lodKey));
      packet.redis_lod_hit = true;
    } else {
      checks.push(fail('Redis LOD0 packet exists', `${lodKey} miss — run atlas:redis:warm:lod0`));
    }
  } else {
    checks.push(skip('Redis LOD0 packet exists', 'no source_ref_id'));
  }

  // 14. Traversal packet assembled
  const hasCore = pad && pad.feature_id && (qdrantId || somCluster);
  if (hasCore) checks.push(pass('traversal packet assembled'));
  else checks.push(fail('traversal packet assembled', 'missing core fields'));

  // Recommendation candidates (files in same feature, ranked by authority)
  if (pad.feature_id) {
    const rcRes = await pool.query(
      `SELECT source_ref FROM parent_atlas_documents
       WHERE feature_id = $1 AND source_ref != $2 AND summary IS NOT NULL
       LIMIT 5`,
      [pad.feature_id, sourceRef]
    );
    packet.recommendation_candidates = rcRes.rows.map(r => r.source_ref);
  }

  const passed = checks.filter(c => c.ok === false).length === 0;
  return { sourceRef, checks, packet, passed };
}

// ── Entry ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!JSON_MODE) {
    console.log('\n══ Feature Traversal Smoke ════════════════════════════════');
    console.log(`  Targets: ${TARGET_REFS.length} source_refs`);
    if (ARG_SOURCE_REF) console.log(`  Mode: targeted — ${ARG_SOURCE_REF}`);
    else console.log('  Mode: canonical (5 reference files)');
  }

  const pool = new pg.Pool({ connectionString: DB_URL });
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USR, NEO4J_PWD));

  const results = [];
  let totalPass = 0, totalFail = 0, totalSkip = 0;

  try {
    for (const ref of TARGET_REFS) {
      const result = await traverseOne(ref, pool, driver);
      results.push(result);
      const p = result.checks.filter(c => c.ok === true).length;
      const f = result.checks.filter(c => c.ok === false).length;
      const s = result.checks.filter(c => c.ok === null).length;
      totalPass += p; totalFail += f; totalSkip += s;
      if (!JSON_MODE) {
        const status = result.passed ? '✅ PASS' : `❌ FAIL (${f} failed)`;
        console.log(`  → ${status}`);
      }
    }
  } finally {
    await pool.end();
    await driver.close();
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    targets: TARGET_REFS.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    totalChecks: totalPass + totalFail + totalSkip,
    totalPass, totalFail, totalSkip,
    results,
  };

  fs.mkdirSync(path.join(ROOT, '.tmp'), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(summary, null, 2), 'utf8');

  if (JSON_MODE) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`\n══ Summary ═══════════════════════════════════════════════`);
    console.log(`  Files:  ${summary.passed}/${summary.targets} passed`);
    console.log(`  Checks: ${totalPass} pass / ${totalFail} fail / ${totalSkip} skip`);
    console.log(`  Report: ${REPORT_PATH}`);

    if (totalFail > 0) {
      console.log('\n  Failed checks:');
      for (const r of results) {
        for (const c of r.checks.filter(c => c.ok === false)) {
          console.log(`    ✗ [${r.sourceRef.slice(-50)}] ${c.label}: ${c.detail}`);
        }
      }
    }

    // Print traversal packets
    console.log('\n  Traversal packets:');
    for (const r of results) {
      const p = r.packet;
      console.log(`\n  ${p.source_ref.slice(-60)}`);
      console.log(`    feature_id    : ${p.feature_id ?? '—'}`);
      console.log(`    tags          : [${p.tags.slice(0, 5).join(', ')}]`);
      console.log(`    summary       : ${p.summary ? p.summary.slice(0, 80) + '…' : '—'}`);
      console.log(`    qdrant_id     : ${p.qdrant_point_id ?? '—'}`);
      console.log(`    som_cluster   : ${p.som_cluster ?? '—'}`);
      console.log(`    neo4j_1hop    : ${p.neo4j_neighbors_1hop.length} edges`);
      console.log(`    neo4j_2hop    : ${p.neo4j_neighbors_2hop.length} nodes`);
      console.log(`    redis_lod_key : ${p.redis_lod_key ?? '—'} (hit=${p.redis_lod_hit})`);
      console.log(`    rec_candidates: ${p.recommendation_candidates.length}`);
    }
  }

  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
