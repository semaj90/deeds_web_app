#!/usr/bin/env node
/**
 * enrich-atlas-concept-ids.mjs
 *
 * Phase 4B concept enrichment: replaces thin path-derived concept_ids with
 * semantic tokens drawn from Qdrant payload fields and chunk content.
 *
 * Enrichment sources per file (union across all chunks):
 *   1. Existing concept_ids (preserved)
 *   2. Qdrant payload.tags (already has import-reference variants like "multi-modal-ranker.js")
 *   3. Qdrant payload.feature_ids (e.g., ["ai-agents","atlas","synthesis"])
 *   4. Qdrant payload.agent_area (e.g., "ai-agents")
 *   5. Qdrant payload.domain (e.g., "utility" — skip generic values)
 *   6. Qdrant payload.hot_keyword_cluster (path-derived, skip if same as existing)
 *   7. Code identifiers extracted from chunk content: camelCase splits,
 *      function/class/const/type names, import module stems
 *
 * Token normalization:
 *   - Lowercase, strip .js/.ts/.svelte extensions from import refs
 *   - Split camelCase/PascalCase into constituent words
 *   - Filter stopwords (the, a, an, of, to, be, and, or, not, new, etc.)
 *   - Skip tokens < 3 chars or > 40 chars
 *   - Deduplicate; cap at 80 tokens per packet
 *
 * Usage:
 *   node scripts/atlas/enrich-atlas-concept-ids.mjs
 *   node scripts/atlas/enrich-atlas-concept-ids.mjs --dry-run
 *   node scripts/atlas/enrich-atlas-concept-ids.mjs --limit 50
 *   node scripts/atlas/enrich-atlas-concept-ids.mjs --verbose
 */

import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

const DRY_RUN   = process.argv.includes('--dry-run');
const VERBOSE   = process.argv.includes('--verbose');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const MAX_PACKETS = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;

// ---------------------------------------------------------------------------
// Generic stopwords + structural noise tokens that add no retrieval signal
// ---------------------------------------------------------------------------
const STOPWORDS = new Set([
  'the','a','an','of','to','be','and','or','not','new','in','is','it',
  'this','that','with','for','on','at','by','from','as','are','was',
  'but','has','have','had','do','does','did','can','will','may','should',
  'would','could','let','var','const','type','interface','class','function',
  'async','await','return','import','export','default','extends','implements',
  'null','undefined','true','false','void','any','unknown',
  // Structural noise dominant in current concept_ids
  'routes','api','server','lib','scripts','components','src','svelte',
  'mjs','cjs','ts','js','json','md','txt','css','html','svg',
  // Very generic domain values from Qdrant
  'utility','candidate','complete','workspace','gap','atlas','context',
  'general','card','spine','topology',
]);

// Feature IDs worth keeping (sufficiently specific)
const SKIP_FEATURE_IDS = new Set([
  'routes','api','lib','utility','scripts','atlas-context','codebase',
  'atlas','workspace_gap','candidate_complete',
]);

// ---------------------------------------------------------------------------
// Token normalization helpers
// ---------------------------------------------------------------------------

/** Split camelCase / PascalCase into lowercase words */
function splitCamel(s) {
  return s
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z\d])([A-Z])/g, '$1-$2')
    .split(/[-_\s]+/)
    .map(w => w.toLowerCase())
    .filter(w => w.length >= 3 && w.length <= 40 && !STOPWORDS.has(w));
}

/** Strip common file extensions and return stem + camel-split variants */
function processTag(raw) {
  const s = raw
    .replace(/\.(js|ts|svelte|mjs|cjs|json|css|html)$/, '')
    .replace(/\+/, '')
    .toLowerCase()
    .trim();
  if (!s || s.length < 3 || s.length > 40) return [];
  const tokens = new Set([s, ...splitCamel(s)]);
  return [...tokens].filter(t => !STOPWORDS.has(t) && t.length >= 3);
}

/** Extract identifier tokens from raw chunk content */
function extractContentTokens(content) {
  if (!content || content.length > 8000) return [];
  const tokens = new Set();

  // Function / class / const / type / interface names
  const ident = /(?:function|class|const|let|var|type|interface|async\s+function)\s+([A-Za-z_$][A-Za-z0-9_$]+)/g;
  let m;
  while ((m = ident.exec(content)) !== null) {
    for (const t of splitCamel(m[1])) tokens.add(t);
  }

  // Import module stems: from '$lib/server/something/module.js'
  const imp = /from\s+['"]([^'"]+)['"]/g;
  while ((m = imp.exec(content)) !== null) {
    const parts = m[1].split('/');
    const stem = parts[parts.length - 1].replace(/\.[^.]+$/, '');
    for (const t of processTag(stem)) tokens.add(t);
  }

  // Decorator / annotation patterns: @something
  const deco = /@([A-Za-z][A-Za-z0-9]+)/g;
  while ((m = deco.exec(content)) !== null) {
    for (const t of splitCamel(m[1])) tokens.add(t);
  }

  return [...tokens].filter(t => !STOPWORDS.has(t) && t.length >= 3 && t.length <= 40);
}

/** Merge all token sources and return deduplicated array capped at maxLen */
function mergeTokens(existing, qdrantTags, featureIds, agentArea, content, maxLen = 80) {
  const seen = new Set();
  const out  = [];

  function add(tokens) {
    for (const t of tokens) {
      const norm = t.toLowerCase().trim();
      if (norm.length >= 3 && norm.length <= 40 && !STOPWORDS.has(norm) && !seen.has(norm)) {
        seen.add(norm);
        out.push(norm);
      }
    }
  }

  // Priority: existing tokens first (preserve ranking signal)
  add(existing);

  // Qdrant tags (highest value — already capture import refs)
  for (const tag of (qdrantTags || [])) {
    add(processTag(tag));
  }

  // Feature IDs (skip generic ones)
  for (const fid of (featureIds || [])) {
    if (!SKIP_FEATURE_IDS.has(fid)) add(processTag(fid));
  }

  // Agent area
  if (agentArea && !SKIP_FEATURE_IDS.has(agentArea)) {
    add(processTag(agentArea));
  }

  // Content-derived identifiers
  add(extractContentTokens(content));

  return out.slice(0, maxLen);
}

// ---------------------------------------------------------------------------
// Qdrant scroll — fetch all points for given source_ref
// ---------------------------------------------------------------------------
async function qdrantScrollByFile(sourceRef) {
  const points = [];
  let offset = null;

  for (;;) {
    const body = {
      limit: 50,
      with_payload: true,
      with_vector: false,
      filter: {
        must: [{ key: 'canonicalSourceRef', match: { value: sourceRef } }],
      },
    };
    if (offset !== null) body.offset = offset;

    const res = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      if (VERBOSE) console.warn(`  Qdrant scroll failed for ${sourceRef}: ${res.status}`);
      break;
    }
    const data = await res.json();
    const pts = data.result?.points ?? [];
    points.push(...pts);
    offset = data.result?.next_page_offset;
    if (!offset || pts.length === 0) break;
  }
  return points;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Load all packets
    const { rows: packets } = await pool.query(
      `SELECT packet_id, source_ref, concept_ids FROM atlas_packets ORDER BY source_ref`
    );

    const total = Math.min(packets.length, MAX_PACKETS);
    console.log(`Enriching ${total} of ${packets.length} atlas_packets${DRY_RUN ? ' (dry-run)' : ''}`);

    let updated = 0;
    let skipped = 0;
    let errors  = 0;
    let avgDelta = 0;

    for (let i = 0; i < total; i++) {
      const pkt = packets[i];
      const { packet_id, source_ref, concept_ids: existing } = pkt;

      if (VERBOSE) process.stdout.write(`[${i + 1}/${total}] ${source_ref} ... `);

      // Fetch all Qdrant chunks for this file
      let points;
      try {
        points = await qdrantScrollByFile(source_ref);
      } catch (e) {
        if (VERBOSE) console.log(`ERROR: ${e.message}`);
        errors++;
        continue;
      }

      if (points.length === 0) {
        if (VERBOSE) console.log('no Qdrant points found, skipping');
        skipped++;
        continue;
      }

      // Aggregate payload fields across all chunks
      const allTags      = [];
      const allFeatureIds = [];
      const agentAreas   = new Set();
      const allContent   = [];

      for (const pt of points) {
        const p = pt.payload ?? {};
        if (Array.isArray(p.tags))        allTags.push(...p.tags);
        if (Array.isArray(p.feature_ids)) allFeatureIds.push(...p.feature_ids);
        if (p.agent_area)                 agentAreas.add(p.agent_area);
        if (p.content)                    allContent.push(p.content);
      }

      // Merge tokens
      const enriched = mergeTokens(
        existing ?? [],
        allTags,
        allFeatureIds,
        [...agentAreas].join(' '),
        allContent.join('\n').slice(0, 6000),
      );

      const delta = enriched.length - (existing?.length ?? 0);
      avgDelta += delta;

      if (VERBOSE) {
        console.log(`${points.length} chunks → ${existing?.length ?? 0}→${enriched.length} tokens (+${delta})`);
      }

      if (!DRY_RUN) {
        await pool.query(
          `UPDATE atlas_packets SET concept_ids = $1 WHERE packet_id = $2`,
          [enriched, packet_id]
        );
      }
      updated++;

      // Progress every 100
      if ((i + 1) % 100 === 0 && !VERBOSE) {
        console.log(`  ${i + 1}/${total} processed (${updated} updated, ${skipped} skipped, ${errors} errors)`);
      }
    }

    avgDelta = updated > 0 ? (avgDelta / updated).toFixed(1) : 0;
    console.log(`\nDone.`);
    console.log(`  Updated:  ${updated}`);
    console.log(`  Skipped:  ${skipped} (no Qdrant points)`);
    console.log(`  Errors:   ${errors}`);
    console.log(`  Avg token delta: +${avgDelta} per packet`);
    if (DRY_RUN) console.log(`  (dry-run — no DB writes)`);

  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
