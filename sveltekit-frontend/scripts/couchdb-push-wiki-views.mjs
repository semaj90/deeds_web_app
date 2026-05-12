#!/usr/bin/env node
/**
 * Push the karpathy_wiki/_design/wiki design document to CouchDB.
 *
 * Usage:
 *   node scripts/couchdb-push-wiki-views.mjs
 *   node scripts/couchdb-push-wiki-views.mjs --dry-run
 *   COUCHDB_URL=http://admin:pass@host:5984 node scripts/couchdb-push-wiki-views.mjs
 *
 * Idempotent — reads the existing _rev and updates in place.
 * Safe to re-run after adding new views.
 */

const COUCH_URL = process.env.COUCHDB_URL ?? 'http://admin:legal_ai_pass@127.0.0.1:5984';
const DB        = 'karpathy_wiki';
const DESIGN_ID = '_design/wiki';
const DRY_RUN   = process.argv.includes('--dry-run');

// ── MapReduce view functions ──────────────────────────────────────────────────

const DESIGN_DOC = {
  language: 'javascript',
  views: {

    /** All docs in a SOM cluster, grouped by (clusterId, type) */
    by_cluster: {
      map: `function (doc) {
  if (doc.som_cluster !== undefined) {
    emit([doc.som_cluster, doc.type], {
      id: doc._id,
      chunk_id: doc.chunk_id,
      case_id: doc.case_id,
      document_id: doc.document_id,
      label: doc.label,
      tags: doc.tags || []
    });
  }
}`,
    },

    /** All docs for a case */
    by_case: {
      map: `function (doc) {
  if (doc.case_id) {
    emit([doc.case_id, doc.type, doc._id], {
      id: doc._id,
      type: doc.type,
      title: doc.title || doc.label,
      tags: doc.tags || [],
      created_at: doc.created_at
    });
  }
}`,
    },

    /** Transcript segments ordered by case → video → timestamp */
    by_video_timestamp: {
      map: `function (doc) {
  if (doc.type === 'transcript_segment' && doc.video_id && doc.start_sec !== undefined) {
    emit([doc.case_id, doc.video_id, doc.start_sec], {
      id: doc._id,
      start_sec: doc.start_sec,
      end_sec: doc.end_sec,
      text: doc.text,
      speaker: doc.speaker,
      tags: doc.tags || [],
      entities: doc.entities || []
    });
  }
}`,
    },

    /** All docs that mention a named entity */
    by_entity: {
      map: `function (doc) {
  if (doc.entities && Array.isArray(doc.entities)) {
    for (var i = 0; i < doc.entities.length; i++) {
      emit(doc.entities[i].toLowerCase(), {
        id: doc._id,
        type: doc.type,
        case_id: doc.case_id,
        tags: doc.tags || []
      });
    }
  }
}`,
    },

    /** All docs by tag */
    by_tag: {
      map: `function (doc) {
  if (doc.tags && Array.isArray(doc.tags)) {
    for (var i = 0; i < doc.tags.length; i++) {
      emit(doc.tags[i], {
        id: doc._id,
        type: doc.type,
        case_id: doc.case_id,
        som_cluster: doc.som_cluster
      });
    }
  }
}`,
    },

    /**
     * Cluster encyclopedia entries missing a Gemma4 summary.
     * Query: /by_missing_summary?key=true to find gaps.
     */
    by_missing_summary: {
      map: `function (doc) {
  if (doc.type === 'cluster_encyclopedia') {
    var missing = !doc.summary || doc.summary.length < 20;
    emit(missing, { id: doc._id, cluster_id: doc.cluster_id, label: doc.label });
  }
}`,
    },

    /**
     * Chunks that have a som_cluster but no corresponding Neo4j BELONGS_TO_CLUSTER edge.
     * Set doc.neo4j_edge_written = true after syncing to Neo4j.
     */
    by_missing_graph_edge: {
      map: `function (doc) {
  if (doc.som_cluster !== undefined && !doc.neo4j_edge_written) {
    emit(doc.som_cluster, { id: doc._id, type: doc.type, case_id: doc.case_id });
  }
}`,
    },

    /**
     * did_you_mean aliases → cluster encyclopedia entries.
     * Powers fallback contextual injection when a user query is vague.
     */
    by_did_you_mean: {
      map: `function (doc) {
  if (doc.did_you_mean && Array.isArray(doc.did_you_mean)) {
    for (var i = 0; i < doc.did_you_mean.length; i++) {
      emit(doc.did_you_mean[i].toLowerCase(), {
        id: doc._id,
        type: doc.type,
        cluster_id: doc.cluster_id,
        label: doc.label,
        summary: doc.summary
      });
    }
  }
}`,
    },

    /** All cluster encyclopedia docs, keyed by note_type */
    by_note_type: {
      map: `function (doc) {
  if (doc.type) {
    emit(doc.type, {
      id: doc._id,
      case_id: doc.case_id,
      cluster_id: doc.cluster_id,
      label: doc.label
    });
  }
}`,
      reduce: '_count',
    },
  },
};

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function couchGet(path) {
  const res = await fetch(`${COUCH_URL}/${DB}/${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function couchPut(path, body) {
  const res = await fetch(`${COUCH_URL}/${DB}/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Ensure the database exists ────────────────────────────────────────────────

async function ensureDb() {
  const res = await fetch(`${COUCH_URL}/${DB}`, { method: 'HEAD' });
  if (res.status === 404) {
    console.log(`[wiki-views] Creating database: ${DB}`);
    const cr = await fetch(`${COUCH_URL}/${DB}`, { method: 'PUT' });
    if (!cr.ok && cr.status !== 412) throw new Error(`Create DB → ${cr.status}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[wiki-views] Target: ${COUCH_URL}/${DB}/${DESIGN_ID}`);
  if (DRY_RUN) console.log('[wiki-views] DRY RUN — no writes');

  await ensureDb();

  const existing = await couchGet(DESIGN_ID);
  const viewNames = Object.keys(DESIGN_DOC.views);

  if (existing) {
    console.log(`[wiki-views] Existing design doc rev=${existing._rev}`);
    const existingViews = Object.keys(existing.views ?? {});
    const added   = viewNames.filter((v) => !existingViews.includes(v));
    const updated = viewNames.filter((v) => {
      if (!existing.views?.[v]) return false;
      return JSON.stringify(existing.views[v]) !== JSON.stringify(DESIGN_DOC.views[v]);
    });
    if (added.length === 0 && updated.length === 0) {
      console.log('[wiki-views] ✅ Design doc is up-to-date — nothing to do');
      return;
    }
    if (added.length)   console.log(`[wiki-views] Adding views: ${added.join(', ')}`);
    if (updated.length) console.log(`[wiki-views] Updating views: ${updated.join(', ')}`);
  } else {
    console.log(`[wiki-views] Design doc not found — creating with ${viewNames.length} views`);
  }

  if (DRY_RUN) {
    console.log('[wiki-views] Views to push:');
    viewNames.forEach((v) => console.log(`  • ${v}`));
    return;
  }

  const payload = { ...DESIGN_DOC };
  if (existing?._rev) payload._rev = existing._rev;

  const result = await couchPut(DESIGN_ID, payload);
  console.log(`[wiki-views] ✅ Design doc pushed  rev=${result.rev}  views=${viewNames.length}`);
  viewNames.forEach((v) => console.log(`  • ${v}`));
}

main().catch((err) => { console.error('[wiki-views]', err.message); process.exit(1); });