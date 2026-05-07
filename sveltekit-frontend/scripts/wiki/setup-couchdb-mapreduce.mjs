#!/usr/bin/env node
/**
 * CouchDB MapReduce setup — creates databases and installs design docs
 *
 * Databases created:
 *   wiki_cards       — gap analysis wiki cards (indexed by tag, file, gap)
 *   code_relations   — relationship map artifacts per run
 *   synthesis_runs   — llm_synthesis outputs per run
 *   mapreduce_jobs   — MapReduce job tracking (map/shuffle/reduce phases)
 *
 * Design docs installed per DB with MapReduce views:
 *   wiki_cards/_design/by_tag        → emit(tag, card._id)
 *   wiki_cards/_design/by_file       → emit(file, card._id)
 *   wiki_cards/_design/open_gaps     → emit(gap.id, gap) if gap.status='open'
 *   code_relations/_design/by_type   → emit([relationType, runId], count)
 *   synthesis_runs/_design/by_cluster → emit(clusterKey, synthesis._id)
 *   mapreduce_jobs/_design/by_status → emit([status, phase], job._id)
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
dotenv.config({ path: resolve(ROOT, '.env') });

const COUCH_URL = (process.env.COUCHDB_URL ?? 'http://admin:deeds123@localhost:5984')
  .replace(/^(https?:\/\/)([^@]+@)/, (_, proto, creds) => {
    // Rebuild as header-based auth to avoid fetch credential URL restriction
    return `${proto}`;
  });

const rawUrl = process.env.COUCHDB_URL ?? 'http://admin:deeds123@localhost:5984';
const urlMatch = rawUrl.match(/^https?:\/\/([^:]+):([^@]+)@(.+)$/);
const [, COUCH_USER, COUCH_PASS, COUCH_HOST] = urlMatch ?? ['', 'admin', 'deeds123', 'localhost:5984'];
const BASE = `http://${COUCH_HOST}`;
const AUTH = 'Basic ' + Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64');

async function couch(method, path, body) {
  const opts = { method, headers: { Authorization: AUTH, 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  const json = await r.json();
  return { status: r.status, ok: r.ok, json };
}

// ── Database list ─────────────────────────────────────────────────────────────
const DBS = ['wiki_cards', 'code_relations_runs', 'synthesis_runs', 'mapreduce_jobs'];

// ── Design documents ──────────────────────────────────────────────────────────
const DESIGNS = {
  wiki_cards: [
    {
      _id: '_design/by_tag',
      views: {
        by_tag: {
          map: `function(doc) {
  if (doc.type !== 'wiki_card') return;
  (doc.tags || []).forEach(function(tag) { emit(tag, doc._id); });
}`,
          reduce: '_count',
        },
      },
    },
    {
      _id: '_design/by_file',
      views: {
        by_file: {
          map: `function(doc) {
  if (doc.type !== 'wiki_card') return;
  (doc.files || []).forEach(function(f) { emit(f, doc._id); });
}`,
        },
      },
    },
    {
      _id: '_design/open_gaps',
      views: {
        open_gaps: {
          map: `function(doc) {
  if (doc.type !== 'wiki_card') return;
  (doc.gaps || []).forEach(function(gap) {
    if (gap.status === 'open') emit([gap.severity, gap.id], {id: gap.id, title: gap.title, severity: gap.severity});
  });
}`,
          reduce: '_count',
        },
      },
    },
    {
      _id: '_design/by_cluster',
      views: {
        by_cluster: {
          map: `function(doc) {
  if (doc.type !== 'wiki_card') return;
  if (doc.clusterKey) emit(doc.clusterKey, doc._id);
}`,
        },
      },
    },
  ],

  code_relations_runs: [
    {
      _id: '_design/by_type',
      views: {
        by_type: {
          map: `function(doc) {
  if (doc.type !== 'relation_run') return;
  var counts = doc.edgeCounts || {};
  Object.keys(counts).forEach(function(rt) { emit([rt, doc.runId], counts[rt]); });
}`,
          reduce: '_sum',
        },
      },
    },
    {
      _id: '_design/by_run',
      views: {
        by_run: {
          map: `function(doc) {
  if (doc.type !== 'relation_run') return;
  emit(doc.runId, {totalEdges: doc.totalEdges, durationMs: doc.durationMs, files: doc.totalFiles});
}`,
        },
      },
    },
  ],

  synthesis_runs: [
    {
      _id: '_design/by_cluster',
      views: {
        by_cluster: {
          map: `function(doc) {
  if (doc.type !== 'synthesis_run') return;
  (doc.clusterKeys || []).forEach(function(k) { emit(k, doc._id); });
}`,
          reduce: '_count',
        },
      },
    },
    {
      _id: '_design/by_query_hash',
      views: {
        by_query_hash: {
          map: `function(doc) {
  if (doc.type !== 'synthesis_run') return;
  if (doc.queryHash) emit(doc.queryHash, {text: (doc.synthesisText||'').slice(0,200), clusterKeys: doc.clusterKeys});
}`,
        },
      },
    },
  ],

  mapreduce_jobs: [
    {
      _id: '_design/by_status',
      views: {
        by_status: {
          map: `function(doc) {
  if (doc.type !== 'mapreduce_job') return;
  emit([doc.status, doc.phase, doc.jobId], {phase: doc.phase, files: doc.fileCount, durationMs: doc.durationMs});
}`,
          reduce: '_count',
        },
      },
    },
    {
      _id: '_design/by_phase',
      views: {
        by_phase: {
          map: `function(doc) {
  if (doc.type !== 'mapreduce_job') return;
  emit([doc.phase, doc.createdAt], doc._id);
}`,
        },
      },
    },
  ],
};

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`[couch] Connecting to ${BASE} as ${COUCH_USER}`);

// Verify connectivity
const ping = await couch('GET', '/');
if (!ping.ok) { console.error('[error] Cannot reach CouchDB:', ping.json); process.exit(1); }
console.log(`[couch] CouchDB ${ping.json.version} OK`);

// List existing databases
const existing = await couch('GET', '/_all_dbs');
const existingSet = new Set(existing.json ?? []);
console.log(`[couch] Existing databases: ${[...existingSet].join(', ')}`);

// Create missing databases
for (const db of DBS) {
  if (existingSet.has(db)) {
    console.log(`[couch] DB ${db} — already exists`);
  } else {
    const r = await couch('PUT', `/${db}`);
    console.log(`[couch] DB ${db} — ${r.ok ? 'CREATED' : 'FAILED: ' + JSON.stringify(r.json)}`);
  }
}

// Install design documents
for (const [db, designs] of Object.entries(DESIGNS)) {
  for (const design of designs) {
    const getRes = await couch('GET', `/${db}/${design._id}`);
    const existingRev = getRes.ok ? getRes.json._rev : null;
    const doc = existingRev ? { ...design, _rev: existingRev } : design;
    const putRes = await couch('PUT', `/${db}/${design._id}`, doc);
    const status = putRes.ok ? (existingRev ? 'updated' : 'created') : 'FAILED: ' + JSON.stringify(putRes.json);
    console.log(`[couch] ${db}/${design._id} — ${status}`);
  }
}

// Verify views by warming them (trigger indexing)
console.log('\n[couch] Warming views...');
const warmChecks = [
  '/wiki_cards/_design/open_gaps/_view/open_gaps?limit=1',
  '/code_relations_runs/_design/by_type/_view/by_type?limit=1',
  '/synthesis_runs/_design/by_cluster/_view/by_cluster?limit=1',
  '/mapreduce_jobs/_design/by_status/_view/by_status?limit=1',
];
for (const path of warmChecks) {
  const r = await couch('GET', path);
  console.log(`  ${path.split('/')[2]}/${path.split('/')[4]} — ${r.ok ? 'OK (' + (r.json.rows?.length ?? 0) + ' rows)' : 'WARN: ' + JSON.stringify(r.json).slice(0,80)}`);
}

console.log('\n✅ CouchDB MapReduce setup complete.');
console.log('   Databases:', DBS.join(', '));
console.log('   Design docs installed with map/reduce views.');
