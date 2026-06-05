#!/usr/bin/env node
/**
 * scripts/atlas/derive-lod-summaries.mjs
 *
 * Derives LOD0, LOD1, source_kind, index_lane, and profile_card_visible
 * for all parent_atlas_documents rows. No LLM calls — fully deterministic.
 *
 * LOD model (Pokémon ROM-bank):
 *   LOD0  = behavior tag string (hot Redis packet)
 *   LOD1  = 1-line rule-based description (warm cache)
 *   LOD2  = Gemma4 paragraph (written by gemma4-parent-atlas-summaries.mjs)
 *   LOD3  = Qdrant chunk pointers (existing qdrant_point_id)
 *   LOD4  = full file on NVMe/CouchDB (cold storage)
 *
 * source_kind classification:
 *   source      → app TypeScript/Svelte files
 *   dependency  → node_modules/.venv/turbovec/vendor
 *   config      → .json/.yml/.toml config files
 *   test        → *.test.ts / *.spec.ts / playwright
 *   generated   → .svelte-kit/build/dist/.tmp generated output
 *   doc         → .md/.mdx documentation
 *
 * Usage:
 *   node scripts/atlas/derive-lod-summaries.mjs --dry-run
 *   node scripts/atlas/derive-lod-summaries.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

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

// ── Feature extraction & labeling helper functions ──────────────────────────────

function extractBehaviorTags(row) {
  const currentTags = Array.isArray(row.tags) ? [...row.tags] : [];
  const tagSet = new Set(currentTags);

  const ref = (row.source_ref || '').toLowerCase();
  const imports = Array.isArray(row.imports) ? row.imports.map(i => String(i).toLowerCase()) : [];

  // Path-based extraction
  if (ref.includes('/api/')) tagSet.add('route:api');
  if (ref.includes('+page.svelte')) tagSet.add('route:page');
  if (ref.endsWith('.svelte')) tagSet.add('component:svelte');
  if (row.is_route) tagSet.add('route:api');
  if (row.is_svelte_comp) tagSet.add('component:svelte');

  // Runtime context
  if (ref.includes('/server/') || ref.includes('.server.ts') || ref.includes('+server.ts')) {
    tagSet.add('runtime:server');
  }
  if (ref.includes('/client/') || ref.includes('.client.ts') || ref.includes('+page.svelte')) {
    tagSet.add('runtime:client');
  }

  // Auth / auth:required
  const authKeywords = ['lucia', 'session', 'login', 'register', 'auth'];
  const hasAuthImport = imports.some(i => authKeywords.some(kw => i.includes(kw)));
  if (row.has_auth || ref.includes('auth') || hasAuthImport) {
    tagSet.add('has_auth');
    if (ref.includes('/api/') || ref.includes('+page.svelte') || ref.includes('+server.ts')) {
      tagSet.add('auth:required');
    }
  }
  
  // Zod
  if (row.has_zod || imports.some(i => i.includes('zod') || i.includes('supervalidate'))) {
    tagSet.add('has_zod');
  }

  // Database / ORM
  if (imports.some(i => i.includes('drizzle') || i.includes('db/client') || i.includes('schema-postgres'))) {
    tagSet.add('has_drizzle');
  }

  // Vector Search / Qdrant / api:search
  if (imports.some(i => i.includes('qdrant') || i.includes('vector') || i.includes('turbovec'))) {
    tagSet.add('has_qdrant');
  }
  if (ref.includes('search') || ref.includes('query') || imports.some(i => i.includes('search'))) {
    tagSet.add('api:search');
  }

  // Redis
  if (imports.some(i => i.includes('redis') || i.includes('ioredis') || i.includes('valkey'))) {
    tagSet.add('has_redis');
  }

  // LLM
  if (imports.some(i => i.includes('ollama') || i.includes('gemma') || i.includes('llama') || i.includes('openai'))) {
    tagSet.add('has_llm');
  }

  // Streaming / SSE
  if (ref.includes('stream') || ref.includes('sse') || imports.some(i => i.includes('stream') || i.includes('sse') || i.includes('event-stream'))) {
    tagSet.add('has_streaming');
  }

  // CRUD Entities
  if (ref.includes('evidence') || ref.includes('uploader') || imports.some(i => i.includes('evidence'))) {
    tagSet.add('crud:evidence');
  }
  if (ref.includes('case') || ref.includes('timeline') || imports.some(i => i.includes('case'))) {
    tagSet.add('crud:case');
  }
  if (ref.includes('user') || ref.includes('profile')) {
    tagSet.add('crud:user');
  }
  if (ref.includes('document') || imports.some(i => i.includes('document'))) {
    tagSet.add('crud:document');
  }
  if (ref.includes('statute') || ref.includes('citation') || imports.some(i => i.includes('statute') || i.includes('citation'))) {
    tagSet.add('crud:statute');
  }

  return [...tagSet];
}

function deriveFeatureId(row) {
  // If it already has a feature_id, keep it
  if (row.feature_id && row.feature_id.trim() !== '' && row.feature_id !== 'general' && row.feature_id !== 'unknown') {
    return row.feature_id;
  }
  const ref = row.source_ref || '';
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const imports = Array.isArray(row.imports) ? row.imports : [];
  const combined = (ref + ' ' + tags.join(' ') + ' ' + imports.join(' ')).toLowerCase();

  const rules = [
    { label: 'evidence-upload',    patterns: [/evidence.*upload|upload.*evidence/i] },
    { label: 'case-timeline',      patterns: [/case.*timeline|timeline.*case/i] },
    { label: 'ace-packet',         patterns: [/ace.packet|compress.card|rank.card/i] },
    { label: 'qdrant-search',      patterns: [/qdrant|vector.search|embed.search/i] },
    { label: 'redis-cache',        patterns: [/redis|valkey|cache.*ttl|ttl.*cache/i] },
    { label: 'bifrost-cache',      patterns: [/bifrost|semantic.cache|l2.cache/i] },
    { label: 'gemma4-inference',   patterns: [/gemma4|llama.server|turboquant|inference/i] },
    { label: 'neo4j-graph',        patterns: [/neo4j|graph.edge|cypher|pagerank/i] },
    { label: 'som-topology',       patterns: [/som|self.organiz|topology|bmu/i] },
    { label: 'auth-session',       patterns: [/lucia|session|login|register|auth/i] },
    { label: 'rabbitmq-queue',     patterns: [/rabbitmq|amqp|queue|exchange/i] },
    { label: 'svelte-component',   patterns: [/\.svelte|svelte.component|runes/i] },
    { label: 'api-route',          patterns: [/\+server\.ts|api\/|route.*handler/i] },
    { label: 'drizzle-schema',     patterns: [/drizzle|schema.postgres|migration|sql/i] },
    { label: 'turbovec-rerank',    patterns: [/turbovec|rerank|cosine.blend/i] },
    { label: 'feature-labeling',   patterns: [/feature.label|domain.topology|graphify/i] },
  ];

  for (const rule of rules) {
    if (rule.patterns.some(p => p.test(combined))) {
      return rule.label;
    }
  }

  // Fallback to directory name or general
  const parts = ref.split('/');
  if (parts.length > 2) {
    const sub = parts[parts.length - 2];
    if (sub && sub.length > 2 && sub !== 'server' && sub !== 'lib') return sub.toLowerCase();
  }
  return 'general';
}

// ── source_kind classifier ────────────────────────────────────────────────────

const VENDOR_PREFIXES = [
  'turbovec/', 'docker/langgraph-synthesis/.venv/', '.venv/',
  'node_modules/', '.svelte-kit/', '.vite/', 'models/',
];
const VENDOR_SUBSTRINGS = ['/.venv/', '/node_modules/', '/dist-info/', '/site-packages/'];
const GENERATED_PREFIXES = ['dist/', 'build/', '.tmp/', '.cache/'];
const DOC_EXTS = new Set(['.md', '.mdx', '.rst', '.txt', '.adoc']);
const CONFIG_EXTS = new Set(['.json', '.yaml', '.yml', '.toml', '.env', '.ini', '.cfg']);
const TEST_PATTERNS = ['.test.ts', '.spec.ts', '.test.js', '.spec.js', 'playwright', '__tests__'];

function classifySourceKind(row) {
  const ref = row.source_ref;
  const tags = row.tags ?? [];

  // Already vendor-tagged
  if (tags.includes('vendor')) {
    return { source_kind: 'dependency', profile_card_visible: false, index_lane: 'dependency' };
  }

  // Vendor path detection
  if (VENDOR_PREFIXES.some(p => ref.startsWith(p)) ||
      VENDOR_SUBSTRINGS.some(s => ref.includes(s))) {
    return { source_kind: 'dependency', profile_card_visible: false, index_lane: 'dependency' };
  }

  // Generated
  if (GENERATED_PREFIXES.some(p => ref.startsWith(p))) {
    return { source_kind: 'generated', profile_card_visible: false, index_lane: 'generated' };
  }

  // Test files
  if (TEST_PATTERNS.some(p => ref.includes(p))) {
    return { source_kind: 'test', profile_card_visible: true, index_lane: 'test' };
  }

  // Docs
  const ext = path.extname(ref).toLowerCase();
  if (DOC_EXTS.has(ext)) {
    return { source_kind: 'doc', profile_card_visible: true, index_lane: 'doc' };
  }

  // Config
  if (CONFIG_EXTS.has(ext)) {
    return { source_kind: 'config', profile_card_visible: false, index_lane: 'config' };
  }

  // App source — default
  return { source_kind: 'source', profile_card_visible: true, index_lane: 'source' };
}

// ── LOD0: behavior tag string ─────────────────────────────────────────────────
// Format: "route:api | has_auth | crud:evidence | auth:required | has_zod"
// Omit path-segment style tags. Prefer behavior tags in priority order.

const TAG_PRIORITY = [
  'route:api', 'route:page', 'component:svelte',
  'runtime:server', 'runtime:client', 'runtime:ssr',
  'auth:required', 'has_auth',
  'crud:evidence', 'crud:case', 'crud:user', 'crud:document', 'crud:statute',
  'api:read', 'api:write', 'api:delete', 'api:search',
  'has_sse', 'has_streaming', 'has_upload', 'has_form_action', 'has_server_action',
  'has_zod', 'has_drizzle', 'has_qdrant', 'has_redis', 'has_neo4j',
  'has_couchdb', 'has_duckdb', 'has_playwright', 'has_llm',
];

function deriveLOD0(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  // Sort by priority, then alphabetically for remainder
  const prioritySet = new Set(TAG_PRIORITY);
  const prioritized = TAG_PRIORITY.filter(t => tags.includes(t));
  const remainder = tags
    .filter(t => !prioritySet.has(t) && !t.startsWith('vendor') && !t.startsWith('excluded_'))
    .sort();
  const all = [...prioritized, ...remainder].slice(0, 8); // cap at 8 for hot cache
  return all.join(' | ');
}

// ── LOD1: 1-line rule-based summary ──────────────────────────────────────────
// Target: "Evidence upload route. Auth required. Writes to Drizzle."

const FEATURE_LABELS = {
  evidence: 'Evidence', case: 'Case', user: 'User', auth: 'Auth',
  document: 'Document', statute: 'Statute', qdrant: 'Vector search',
  redis: 'Cache', neo4j: 'Graph', couchdb: 'Document store',
  atlas: 'Atlas', ace: 'ACE context', chat: 'AI chat',
  gemma: 'Gemma4 AI', llm: 'LLM', embedding: 'Embeddings',
  gpu: 'GPU bridge', mcp: 'MCP server', warden: 'Warden',
  search: 'Search', timeline: 'Timeline', workspace: 'Workspace',
  analytics: 'Analytics', forensics: 'Forensics',
};

function deriveLOD1(row, sourceKind) {
  const { source_ref, feature_id, is_route, is_svelte_comp, has_auth, has_zod, line_count } = row;
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const featureLabel = FEATURE_LABELS[feature_id] ?? (feature_id ? capitalize(feature_id) : null);

  // Vendor/dependency
  if (sourceKind === 'dependency') {
    return `Vendor dependency file. Not indexed for profile cards.`;
  }
  if (sourceKind === 'generated') {
    return `Auto-generated file. Not directly authored.`;
  }

  // Build parts
  const parts = [];

  // What kind of file
  if (tags.includes('route:api') && tags.includes('has_sse')) {
    parts.push(`${featureLabel ?? 'SSE'} streaming server route`);
  } else if (tags.includes('route:api') && tags.includes('has_upload')) {
    parts.push(`${featureLabel ?? 'File'} upload API route`);
  } else if (tags.includes('route:api')) {
    parts.push(`${featureLabel ?? 'API'} server route`);
  } else if (tags.includes('route:page')) {
    parts.push(`${featureLabel ?? 'Page'} UI page component`);
  } else if (tags.includes('component:svelte') && !is_route) {
    parts.push(`${featureLabel ?? 'UI'} Svelte component`);
  } else if (sourceKind === 'test') {
    parts.push(`Test suite for ${featureLabel ?? feature_id ?? 'unknown feature'}`);
  } else if (sourceKind === 'doc') {
    parts.push(`Documentation: ${featureLabel ?? feature_id ?? path.basename(source_ref)}`);
  } else if (sourceKind === 'config') {
    parts.push(`Config: ${path.basename(source_ref)}`);
  } else {
    parts.push(`${featureLabel ?? 'TypeScript'} module`);
  }

  // Key behaviors
  const behaviors = [];
  if (has_auth || tags.includes('auth:required')) behaviors.push('auth required');
  if (has_zod) behaviors.push('Zod validated');
  if (tags.includes('has_drizzle')) behaviors.push('Drizzle ORM');
  if (tags.includes('has_qdrant')) behaviors.push('Qdrant search');
  if (tags.includes('has_llm')) behaviors.push('LLM');
  if (tags.includes('has_redis')) behaviors.push('Redis');
  if (tags.includes('has_streaming')) behaviors.push('streaming');
  if (behaviors.length > 0) parts.push(behaviors.slice(0, 3).join(', '));

  // CRUD target
  const crudTags = tags.filter(t => t.startsWith('crud:')).map(t => t.replace('crud:', ''));
  if (crudTags.length > 0) parts.push(`touches ${crudTags.join('/')}`);

  // Line count hint
  if (line_count && line_count > 400) parts.push(`large file (${line_count} lines)`);

  return parts.join('. ') + '.';
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ── Assign sequential source_ref_id ──────────────────────────────────────────
function assignIds(rows) {
  // Group: source files first (lower IDs), then others
  const sorted = [...rows].sort((a, b) => {
    const ka = a.source_kind === 'source' ? 0 : 1;
    const kb = b.source_kind === 'source' ? 0 : 1;
    if (ka !== kb) return ka - kb;
    return a.source_ref.localeCompare(b.source_ref);
  });
  sorted.forEach((r, i) => { r._new_id = i + 1; });
  return sorted;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══ Derive LOD Summaries ════════════════════════════════════');
  console.log(`  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // Load all rows (including feature:* skip)
  console.log('\n  Step 1: Load parent_atlas_documents...');
  const { rows } = await pool.query(`
    SELECT
      id, source_ref, feature_id, tags,
      is_route, is_svelte_comp, has_auth, has_zod, line_count,
      source_kind, summary_lod0, summary_lod1, imports
    FROM parent_atlas_documents
    WHERE source_ref NOT LIKE 'feature:%'
    ORDER BY source_ref
  `);
  console.log(`  ✅ ${rows.length} rows loaded`);

  // Derive everything
  console.log('\n  Step 2: Extracting behavior tags and deriving feature_ids...');
  const enriched = rows.map(row => {
    const originalTagsJson = JSON.stringify(row.tags || []);
    const enrichedTags = extractBehaviorTags(row);
    const featureId = deriveFeatureId({ ...row, tags: enrichedTags });

    const kindData = classifySourceKind({ ...row, tags: enrichedTags });
    const lod0 = deriveLOD0(enrichedTags);
    const lod1 = deriveLOD1({ ...row, feature_id: featureId, tags: enrichedTags }, kindData.source_kind);

    const needsUpdate =
      row.source_kind !== kindData.source_kind ||
      row.summary_lod0 !== lod0 ||
      row.summary_lod1 !== lod1 ||
      row.feature_id !== featureId ||
      originalTagsJson !== JSON.stringify(enrichedTags);

    return {
      id: row.id,
      source_ref: row.source_ref,
      feature_id: featureId,
      tags: enrichedTags,
      ...kindData,
      lod0,
      lod1,
      needsUpdate,
    };
  });

  // Assign sequential integer IDs
  const withIds = assignIds(enriched);

  // Stats
  const kindCounts = {};
  const laneCounts = {};
  let needsUpdateCount = 0;
  for (const r of withIds) {
    kindCounts[r.source_kind] = (kindCounts[r.source_kind] ?? 0) + 1;
    laneCounts[r.index_lane] = (laneCounts[r.index_lane] ?? 0) + 1;
    if (r.needsUpdate) needsUpdateCount++;
  }

  console.log('\n  source_kind distribution:');
  Object.entries(kindCounts).sort((a,b) => b[1]-a[1]).forEach(([k, n]) =>
    console.log(`    ${String(n).padStart(5)}  ${k}`));

  console.log('\n  index_lane distribution:');
  Object.entries(laneCounts).sort((a,b) => b[1]-a[1]).forEach(([k, n]) =>
    console.log(`    ${String(n).padStart(5)}  ${k}`));

  console.log(`\n  Rows needing update: ${needsUpdateCount}`);

  if (VERBOSE) {
    console.log('\n  Sample LOD derivations (first 5 source kind=source):');
    withIds.filter(r => r.source_kind === 'source').slice(0, 5).forEach(r => {
      console.log(`\n  [${r._new_id}] ${r.source_ref}`);
      console.log(`    Feature ID: ${r.feature_id}`);
      console.log(`    Tags:       ${r.tags.join(', ')}`);
      console.log(`    LOD0:       ${r.lod0}`);
      console.log(`    LOD1:       ${r.lod1}`);
    });
  }

  // Write dictionary file always (for packet builder)
  const dictPath = path.join(ROOT, '.tmp', 'atlas-dict.json');
  const sourceDict = {};
  withIds.forEach(r => { sourceDict[r.source_ref] = r._new_id; });
  fs.mkdirSync(path.dirname(dictPath), { recursive: true });
  fs.writeFileSync(dictPath, JSON.stringify({ sources: sourceDict, generated: new Date().toISOString() }, null, 2));
  console.log(`\n  Dictionary written → ${dictPath}`);

  if (!APPLY) {
    console.log('\n  [DRY-RUN] No DB writes. Pass --apply to persist.');
    await pool.end();
    return;
  }

  // Apply: bulk UPDATE in batches
  console.log('\n  Step 3: Upserting LOD data to Postgres and mirroring features...');
  let updated = 0;
  let failed = 0;
  const BATCH = 200;

  for (let i = 0; i < withIds.length; i += BATCH) {
    const batch = withIds.slice(i, i + BATCH);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of batch) {
        await client.query(`
          UPDATE parent_atlas_documents SET
            source_kind         = $1,
            profile_card_visible = $2,
            index_lane          = $3,
            summary_lod0        = $4,
            summary_lod1        = $5,
            source_ref_id       = $6,
            feature_id          = $7,
            tags                = $8,
            updated_at          = now()
          WHERE id = $9
        `, [
          r.source_kind, r.profile_card_visible, r.index_lane,
          r.lod0, r.lod1, r._new_id, r.feature_id, r.tags, r.id,
        ]);

        // Mirror in atlas_feature_map
        await client.query(`
          INSERT INTO public.atlas_feature_map (normalized_path, source_ref, feature_id)
          VALUES ($1, $1, $2)
          ON CONFLICT (normalized_path) DO UPDATE SET feature_id = EXCLUDED.feature_id
        `, [r.source_ref, r.feature_id]);

        updated++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      failed += batch.length;
      console.error(`  [batch ${i}] failed: ${err.message}`);
    } finally {
      client.release();
    }
    if ((i + BATCH) % 1000 === 0 || i + BATCH >= withIds.length) {
      console.log(`  updated ${Math.min(i + BATCH, withIds.length)}...`);
    }
  }

  // Verify
  const { rows: verify } = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE summary_lod0 IS NOT NULL AND summary_lod0 != '') AS lod0_filled,
      COUNT(*) FILTER (WHERE summary_lod1 IS NOT NULL AND summary_lod1 != '') AS lod1_filled,
      COUNT(*) FILTER (WHERE summary_lod2 IS NOT NULL AND summary_lod2 != '') AS lod2_filled,
      COUNT(*) FILTER (WHERE source_ref_id IS NOT NULL) AS with_id
    FROM parent_atlas_documents
    WHERE source_ref NOT LIKE 'feature:%'
  `);

  await pool.end();

  const v = verify[0];
  console.log('\n══ Results ════════════════════════════════════════════════');
  console.log(`  Total rows:   ${v.total}`);
  console.log(`  LOD0 filled:  ${v.lod0_filled} (${Math.round(v.lod0_filled/v.total*100)}%)`);
  console.log(`  LOD1 filled:  ${v.lod1_filled} (${Math.round(v.lod1_filled/v.total*100)}%)`);
  console.log(`  LOD2 filled:  ${v.lod2_filled} (${Math.round(v.lod2_filled/v.total*100)}%)`);
  console.log(`  source_ref_id:${v.with_id} (${Math.round(v.with_id/v.total*100)}%)`);
  console.log(`  Updated:      ${updated}`);
  console.log(`  Failed:       ${failed}`);
  console.log('\n  ✅ LOD derivation complete. Next: build-compressed-packets.mjs');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
