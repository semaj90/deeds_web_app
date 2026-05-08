#!/usr/bin/env node
/**
 * build-agents-md-relations.mjs
 *
 * Two-phase processor:
 *
 *   PHASE A — backfill envelope fields from existing graph data:
 *     qdrant_tags    ← top N tags from code_retrieval_chunks.tags for files in scope
 *     semantic_tags  ← distinct topo_classes covered by files in scope
 *
 *   PHASE B — populate agent_context_relations with 8 edge types:
 *     PARENT_OF            child AGENTS.md → parent AGENTS.md (dir tree)
 *     COVERS_TOPO_CLASS    AGENTS.md → topo:<class> taxonomy node
 *     COVERS_CLUSTER       AGENTS.md → cluster:<key> taxonomy node
 *     SHARES_TAGS          AGENTS.md ↔ AGENTS.md by Jaccard(qdrant_tags) ≥ threshold
 *     MIRRORS_KAG_NOTE     AGENTS.md → wiki:note:dir:<slug>
 *     REFERENCES_FILE      AGENTS.md → file:<path>  (from rules/constraints text)
 *     REFERENCES_TOOL      AGENTS.md → tool:<name>  (from tools JSONB)
 *     OVERRIDES            child rule contradicts parent (heuristic — skipped if no rules)
 *
 * Idempotent: ON CONFLICT (source_key, target_key, relation) DO UPDATE.
 *
 * Usage:
 *   node scripts/build-agents-md-relations.mjs              # backfill + build
 *   node scripts/build-agents-md-relations.mjs --dry-run    # preview, no writes
 *   node scripts/build-agents-md-relations.mjs --skip-backfill   # only Phase B
 *   node scripts/build-agents-md-relations.mjs --jaccard 0.4     # tighter SHARES_TAGS
 */

import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const args        = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const SKIP_BF     = args.includes('--skip-backfill');
const JACCARD_MIN = parseFloat(args.find(a => a.startsWith('--jaccard='))?.split('=')[1]
                              ?? args[args.indexOf('--jaccard') + 1] ?? '0.3') || 0.3;
const TAG_TOP_N   = 10;  // qdrant_tags cap per envelope

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool   = new pg.Pool({ connectionString: DB_URL, max: 4 });

console.log(`\n[agents-md-relations] ${DRY_RUN ? 'DRY-RUN' : 'BUILD'} jaccard≥${JACCARD_MIN}`);

// ── PHASE A: envelope backfill ──────────────────────────────────────────────
let backfilled = 0;
if (!SKIP_BF) {
  console.log('\n  PHASE A — envelope backfill from code_retrieval_chunks');

  // Per-directory tag aggregation: top N tags by frequency across files in scope.
  // code_retrieval_chunks.tags is a comma-separated text column.
  const { rows: dirTags } = await pool.query(`
    WITH per_chunk AS (
      SELECT
        a.stable_key       AS agent_key,
        a.directory_path,
        unnest(string_to_array(c.tags, ',')) AS tag
      FROM agent_context_files a
      JOIN code_retrieval_chunks c
        ON c.file_path LIKE a.directory_path || '/%'
      WHERE c.tags IS NOT NULL AND c.tags <> ''
    ),
    ranked AS (
      SELECT
        agent_key,
        trim(tag) AS tag,
        count(*)  AS freq,
        row_number() OVER (PARTITION BY agent_key ORDER BY count(*) DESC) AS rn
      FROM per_chunk
      WHERE trim(tag) <> ''
      GROUP BY agent_key, trim(tag)
    )
    SELECT agent_key, array_agg(tag ORDER BY freq DESC) AS top_tags
    FROM ranked
    WHERE rn <= ${TAG_TOP_N}
    GROUP BY agent_key
  `);
  console.log(`    qdrant_tags: ${dirTags.length} envelopes have inferable tags`);

  // Per-directory topo_class set
  const { rows: dirTopo } = await pool.query(`
    SELECT
      a.stable_key AS agent_key,
      array_agg(DISTINCT c.topo_class) FILTER (WHERE c.topo_class IS NOT NULL) AS classes
    FROM agent_context_files a
    JOIN code_retrieval_chunks c
      ON c.file_path LIKE a.directory_path || '/%'
    GROUP BY a.stable_key
  `);
  console.log(`    semantic_tags: ${dirTopo.length} envelopes have inferable topo classes`);

  if (!DRY_RUN) {
    const tagMap = new Map(dirTags.map(r => [r.agent_key, r.top_tags]));
    const topoMap = new Map(dirTopo.map(r => [r.agent_key, r.classes ?? []]));
    const allKeys = new Set([...tagMap.keys(), ...topoMap.keys()]);
    for (const key of allKeys) {
      await pool.query(
        `UPDATE agent_context_files
         SET qdrant_tags   = COALESCE($2::text[], qdrant_tags),
             semantic_tags = COALESCE($3::text[], semantic_tags),
             updated_at    = now()
         WHERE stable_key = $1`,
        [key, tagMap.get(key) ?? null, topoMap.get(key) ?? null],
      );
      backfilled++;
    }
    console.log(`    ✓ backfilled ${backfilled} envelopes`);
  } else {
    console.log(`    [dry-run] would backfill ${dirTags.length}`);
  }
}

// ── PHASE B: build relations ────────────────────────────────────────────────
console.log('\n  PHASE B — build agent_context_relations');

const edges = [];
function addEdge(source_key, target_key, relation, weight = 1.0, evidence = {}) {
  edges.push({ source_key, target_key, relation, weight, evidence });
}

/**
 * qdrant_cluster_members.cluster_key has inconsistent shapes:
 *   "gpu:42"      — already namespaced (correct)
 *   ":21"         — bare bigint, missing namespace → assume gpu:N
 *   "general"     — scalar without colon → keep
 *   "dir:src/lib" — directory-fallback (correct)
 * Normalise to "cluster:<ns>:<id>" or "cluster:<scalar>".
 */
function normalizeClusterKey(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^:\d+$/.test(s))   return `cluster:gpu${s}`;   // ":21" → "cluster:gpu:21"
  if (s === 'general')    return `cluster:general`;
  if (s.includes(':'))    return `cluster:${s}`;      // "gpu:42" → "cluster:gpu:42"
  return `cluster:${s}`;                              // "foo"  → "cluster:foo"
}

// 1. PARENT_OF — directory tree
const { rows: files } = await pool.query(`
  SELECT stable_key, directory_path FROM agent_context_files ORDER BY directory_path
`);
const dirToKey = new Map(files.map(r => [r.directory_path, r.stable_key]));
for (const f of files) {
  // Find nearest ancestor that has its own AGENTS.md
  const parts = f.directory_path.split('/');
  for (let depth = parts.length - 1; depth >= 1; depth--) {
    const candidate = parts.slice(0, depth).join('/');
    if (candidate && dirToKey.has(candidate) && candidate !== f.directory_path) {
      addEdge(f.stable_key, dirToKey.get(candidate), 'PARENT_OF', 1.0,
              { depth: parts.length - depth });
      break;
    }
  }
}
console.log(`    PARENT_OF:         ${edges.filter(e => e.relation === 'PARENT_OF').length}`);

// 2. COVERS_TOPO_CLASS — bridge to taxonomy_nodes
const { rows: covTopo } = await pool.query(`
  SELECT
    a.stable_key,
    c.topo_class,
    count(*) AS n_files
  FROM agent_context_files a
  JOIN code_retrieval_chunks c
    ON c.file_path LIKE a.directory_path || '/%'
  WHERE c.topo_class IS NOT NULL
  GROUP BY a.stable_key, c.topo_class
`);
for (const r of covTopo) {
  addEdge(r.stable_key, `topo:${r.topo_class}`, 'COVERS_TOPO_CLASS',
          Math.min(1.0, parseInt(r.n_files, 10) / 50),
          { n_files: parseInt(r.n_files, 10) });
}
console.log(`    COVERS_TOPO_CLASS: ${covTopo.length}`);

// 3. COVERS_CLUSTER — bridge through qdrant_cluster_members
const { rows: covCluster } = await pool.query(`
  SELECT
    a.stable_key,
    m.cluster_key,
    count(*) AS n_members
  FROM agent_context_files a
  JOIN qdrant_cluster_members m
    ON m.file_path LIKE a.directory_path || '/%'
  GROUP BY a.stable_key, m.cluster_key
`).catch(() => ({ rows: [] }));
for (const r of covCluster) {
  const normalized = normalizeClusterKey(r.cluster_key);
  if (!normalized) continue;
  addEdge(r.stable_key, normalized, 'COVERS_CLUSTER',
          Math.min(1.0, parseInt(r.n_members, 10) / 20),
          { n_members: parseInt(r.n_members, 10) });
}
console.log(`    COVERS_CLUSTER:    ${covCluster.length}`);

// 4. SHARES_TAGS — Jaccard over qdrant_tags
function jaccard(a, b) {
  if (!a?.length || !b?.length) return 0;
  const sa = new Set(a), sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}
const { rows: tagged } = await pool.query(`
  SELECT stable_key, qdrant_tags FROM agent_context_files
  WHERE array_length(qdrant_tags, 1) > 0
`);
let sharedCount = 0;
for (let i = 0; i < tagged.length; i++) {
  for (let j = i + 1; j < tagged.length; j++) {
    const j_score = jaccard(tagged[i].qdrant_tags, tagged[j].qdrant_tags);
    if (j_score >= JACCARD_MIN) {
      addEdge(tagged[i].stable_key, tagged[j].stable_key, 'SHARES_TAGS',
              j_score, { jaccard: Math.round(j_score * 1000) / 1000 });
      sharedCount++;
    }
  }
}
console.log(`    SHARES_TAGS:       ${sharedCount}  (jaccard≥${JACCARD_MIN}, ${tagged.length} candidates)`);

// 5. MIRRORS_KAG_NOTE — 1:1 mapping (every AGENTS.md has a wiki:note slug)
for (const f of files) {
  const slug = f.directory_path.replace(/[/-]/g, '_');
  addEdge(f.stable_key, `wiki:note:dir:${slug}`, 'MIRRORS_KAG_NOTE', 1.0, {});
}
console.log(`    MIRRORS_KAG_NOTE:  ${edges.filter(e => e.relation === 'MIRRORS_KAG_NOTE').length}`);

// 6. REFERENCES_TOOL — from tools JSONB array
const { rows: withTools } = await pool.query(`
  SELECT stable_key, tools FROM agent_context_files
  WHERE jsonb_array_length(tools) > 0
`);
let refTool = 0;
for (const r of withTools) {
  const seen = new Set();
  for (const t of (r.tools ?? [])) {
    const name = (t?.name ?? t?.tool ?? (typeof t === 'string' ? t : null))?.slice(0, 200);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    addEdge(r.stable_key, `tool:${name}`, 'REFERENCES_TOOL', 1.0, {});
    refTool++;
  }
}
console.log(`    REFERENCES_TOOL:   ${refTool}`);

// 7. REFERENCES_FILE — extract src/...\.ts paths from rules text
const { rows: withRules } = await pool.query(`
  SELECT stable_key, rules FROM agent_context_files
  WHERE jsonb_array_length(rules) > 0
`);
let refFile = 0;
const FILE_PATTERN = /\b(?:src|scripts|tests)\/[\w./-]+\.(?:ts|svelte|mjs|js|tsx)\b/g;
for (const r of withRules) {
  const seen = new Set();
  for (const rule of (r.rules ?? [])) {
    const text = typeof rule === 'string' ? rule : (rule?.text ?? rule?.rule ?? '');
    for (const m of String(text).matchAll(FILE_PATTERN)) {
      const path = m[0];
      if (seen.has(path)) continue;
      seen.add(path);
      addEdge(r.stable_key, `file:${path}`, 'REFERENCES_FILE', 1.0, {});
      refFile++;
    }
  }
}
console.log(`    REFERENCES_FILE:   ${refFile}`);

// 8. OVERRIDES — heuristic skipped (needs rule conflict detection; rare without P0 envelope work)
console.log(`    OVERRIDES:         0  (skipped — needs rule-text NLP)`);

// Dedup within the build — multiple sources can collapse to the same edge
// after key normalisation. Postgres ON CONFLICT can't see same-batch duplicates,
// so collapse here: keep max(weight) and concatenate evidence arrays.
const dedupMap = new Map();
for (const e of edges) {
  const k = `${e.source_key}\0${e.target_key}\0${e.relation}`;
  const ex = dedupMap.get(k);
  if (ex) {
    ex.weight = Math.max(ex.weight, e.weight);
    ex.evidence = { ...ex.evidence, ...e.evidence, _merged_count: (ex.evidence._merged_count ?? 1) + 1 };
  } else {
    dedupMap.set(k, { ...e });
  }
}
const dedupedEdges = [...dedupMap.values()];
const collapsed = edges.length - dedupedEdges.length;
edges.length = 0;
edges.push(...dedupedEdges);
console.log(`\n  TOTAL edges: ${edges.length}${collapsed > 0 ? `  (${collapsed} merged after dedup)` : ''}`);

// ── Persist ─────────────────────────────────────────────────────────────────
if (DRY_RUN) {
  console.log(`\n  [dry-run] would write ${edges.length} edges`);
  await pool.end();
  process.exit(0);
}

const BATCH = 500;
let written = 0;
for (let i = 0; i < edges.length; i += BATCH) {
  const batch = edges.slice(i, i + BATCH);
  const values = [];
  const params = [];
  let p = 1;
  for (const e of batch) {
    values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}::jsonb)`);
    params.push(e.source_key, e.target_key, e.relation, e.weight, JSON.stringify(e.evidence));
  }
  const res = await pool.query(
    `INSERT INTO agent_context_relations (source_key, target_key, relation, weight, evidence)
     VALUES ${values.join(',')}
     ON CONFLICT (source_key, target_key, relation) DO UPDATE SET
       weight = EXCLUDED.weight,
       evidence = EXCLUDED.evidence`,
    params,
  );
  written += res.rowCount ?? batch.length;
}
console.log(`\n  ✓ wrote ${written} edges to agent_context_relations`);

const { rows: counts } = await pool.query(
  `SELECT relation, count(*) FROM agent_context_relations GROUP BY relation ORDER BY 2 DESC`,
);
console.log(`\n  Final breakdown:`);
for (const c of counts) console.log(`    ${c.relation.padEnd(20)} ${c.count}`);

await pool.end();
console.log();
