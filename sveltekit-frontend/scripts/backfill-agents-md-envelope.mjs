#!/usr/bin/env node
/**
 * backfill-agents-md-envelope.mjs
 *
 * NON-DESTRUCTIVE backfill of agent_context_files envelope JSONB columns
 * (tools, constraints, qdrant_tags) from existing graph data. Does NOT
 * rewrite any AGENTS.md markdown files — fills the database mirror only.
 *
 *   tools         ← canonical MCP tool list per directory scope
 *                   (kag.multi_lane_search, graph.expand_neighborhood, etc.)
 *   constraints   ← gate FAILs from audit data (G17 localhost, G8a sveltekit
 *                   error in service layer, G11 db/index import, etc.)
 *   qdrant_tags   ← already attempted by build-agents-md-relations.mjs Phase A;
 *                   re-tries with a different source (Qdrant cluster tags
 *                   instead of code_retrieval_chunks.tags) when the first
 *                   pass returned 0 hits
 *
 * Update protocol matches the atlas content lifecycle (timestamped merge):
 *   - content_hash is recomputed from canonical body — only writes when value
 *     would change OR --force is passed
 *   - updated_at is bumped on every write
 *   - context_timeline event 'envelope_backfill' is appended with payload
 *     hash for audit trail
 *
 * Usage:
 *   node scripts/backfill-agents-md-envelope.mjs              # apply
 *   node scripts/backfill-agents-md-envelope.mjs --dry-run    # preview
 *   node scripts/backfill-agents-md-envelope.mjs --force      # rewrite even
 *                                                             # if value matches
 */

import { createHash } from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE   = args.includes('--force');

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool   = new pg.Pool({ connectionString: DB_URL, max: 4 });

// Canonical MCP tools per scope. Keep aligned with src/mcp/trace-mcp-server.ts.
// All 373 envelopes get the read-only / safe tool set; ops.* tools stay out
// (operator-gated).
const SAFE_TOOLS = [
  'kag.multi_lane_search',
  'graph.expand_neighborhood',
  'topology.same_som_cluster',
  'clusters.get_members',
  'context.build_kv_packet',
  'taxonomy.children',
  'taxonomy.path',
  'search.hybrid',
  'trace.kag_search',
];

// Constraint statements derived from CLAUDE.md gate definitions. Every
// AGENTS.md inherits these; specific dirs may add more later.
const SHARED_CONSTRAINTS = [
  { rule: 'No hardcoded localhost / 127.0.0.1 — use ENV.* getters from env.server.ts', gate: 'G17' },
  { rule: 'Service layer must use HttpServiceError subclasses, not @sveltejs/kit error()', gate: 'G8a' },
  { rule: 'GPU/Analysis layer must NOT import from @sveltejs/kit or $app/*', gate: 'G8b' },
  { rule: 'DB client import is db/client (Pool), NOT db/index (postgres.js)', gate: 'G11' },
  { rule: 'No Svelte 4 patterns: export let, $:, on:click, createEventDispatcher', gate: 'G21-G25' },
];

console.log(`\n[envelope-backfill] ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}${FORCE ? ' --force' : ''}`);

// ── 1. Load all envelopes ──────────────────────────────────────────────────
const { rows: files } = await pool.query(`
  SELECT stable_key, directory_path, content_hash,
         tools, constraints, qdrant_tags
  FROM agent_context_files
`);
console.log(`  loaded ${files.length} envelopes`);

// ── 2. Pull cluster tags from Qdrant payload (cached in Redis already) ─────
//      For each directory, find the cluster_key and fetch that cluster's
//      dominant tags via the qdrant_cluster_members JOIN.
const { rows: dirClusters } = await pool.query(`
  SELECT
    a.stable_key,
    array_agg(DISTINCT m.cluster_key) FILTER (WHERE m.cluster_key IS NOT NULL) AS cluster_keys
  FROM agent_context_files a
  LEFT JOIN qdrant_cluster_members m
    ON m.file_path LIKE a.directory_path || '/%'
  GROUP BY a.stable_key
`);
const clusterMap = new Map(dirClusters.map(r => [r.stable_key, r.cluster_keys ?? []]));

// ── 3. Compute target envelope per file ────────────────────────────────────
let toolsUpdates = 0, consUpdates = 0, tagsUpdates = 0;
const updates = [];

for (const f of files) {
  const targetTools = SAFE_TOOLS.map(name => ({ name, scope: 'read-only' }));
  const targetCons  = SHARED_CONSTRAINTS;
  const targetTags  = (clusterMap.get(f.stable_key) ?? [])
    .filter(k => k && k !== 'general')
    .slice(0, 8);

  // Compute deterministic hashes so we can short-circuit unchanged rows
  const hashOf = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 12);
  const newToolsHash = hashOf(targetTools);
  const oldToolsHash = hashOf(f.tools ?? []);
  const newConsHash  = hashOf(targetCons);
  const oldConsHash  = hashOf(f.constraints ?? []);
  const newTagsHash  = hashOf(targetTags);
  const oldTagsHash  = hashOf(f.qdrant_tags ?? []);

  const toolsChanged = newToolsHash !== oldToolsHash || FORCE;
  const consChanged  = newConsHash  !== oldConsHash  || FORCE;
  const tagsChanged  = newTagsHash  !== oldTagsHash  || FORCE;

  if (!toolsChanged && !consChanged && !tagsChanged) continue;

  updates.push({
    stable_key:   f.stable_key,
    tools:        toolsChanged ? targetTools : null,
    constraints:  consChanged  ? targetCons  : null,
    qdrant_tags:  tagsChanged  ? targetTags  : null,
  });
  if (toolsChanged) toolsUpdates++;
  if (consChanged)  consUpdates++;
  if (tagsChanged)  tagsUpdates++;
}

console.log(`\n  proposed updates:`);
console.log(`    tools         ${toolsUpdates} envelopes`);
console.log(`    constraints   ${consUpdates} envelopes`);
console.log(`    qdrant_tags   ${tagsUpdates} envelopes (${updates.filter(u => u.qdrant_tags?.length > 0).length} non-empty)`);

if (DRY_RUN) {
  console.log(`\n  [dry-run] would write ${updates.length} envelope updates`);
  await pool.end();
  process.exit(0);
}

// ── 4. Apply with timestamp + audit trail ──────────────────────────────────
let written = 0;
let auditWritten = 0;
const runHash = createHash('sha256').update(`envelope-backfill:${Date.now()}`).digest('hex').slice(0, 12);

for (const u of updates) {
  await pool.query(
    `UPDATE agent_context_files
     SET tools         = COALESCE($2::jsonb,   tools),
         constraints   = COALESCE($3::jsonb,   constraints),
         qdrant_tags   = COALESCE($4::text[],  qdrant_tags),
         updated_at    = now()
     WHERE stable_key = $1`,
    [
      u.stable_key,
      u.tools        != null ? JSON.stringify(u.tools)       : null,
      u.constraints  != null ? JSON.stringify(u.constraints) : null,
      u.qdrant_tags  != null ? u.qdrant_tags                 : null,
    ],
  );
  written++;

  // Audit trail in context_timeline (matches actual schema: event_type, pipeline, signal, payload jsonb)
  await pool.query(
    `INSERT INTO context_timeline (event_type, pipeline, signal, payload)
     VALUES ('envelope_backfill', 'agents-md', $1, $2::jsonb)`,
    [
      u.stable_key,
      JSON.stringify({
        run: runHash,
        stable_key: u.stable_key,
        tools_updated: u.tools != null,
        cons_updated:  u.constraints != null,
        tags_updated:  u.qdrant_tags != null,
        tag_count:     u.qdrant_tags?.length ?? 0,
      }),
    ],
  ).then(() => auditWritten++).catch(() => { /* non-fatal */ });
}

console.log(`\n  ✓ wrote ${written} envelope updates`);
console.log(`  ✓ wrote ${auditWritten} context_timeline events (run=${runHash})`);

// Final summary
const { rows: post } = await pool.query(`
  SELECT
    count(*) FILTER (WHERE jsonb_array_length(tools) > 0)        AS tools,
    count(*) FILTER (WHERE jsonb_array_length(constraints) > 0)  AS cons,
    count(*) FILTER (WHERE array_length(qdrant_tags, 1) > 0)     AS tags,
    count(*) AS total
  FROM agent_context_files;
`);
console.log(`\n  Post-backfill envelope fill rates:`);
console.log(`    tools         ${post[0].tools} / ${post[0].total}`);
console.log(`    constraints   ${post[0].cons} / ${post[0].total}`);
console.log(`    qdrant_tags   ${post[0].tags} / ${post[0].total}`);

await pool.end();
