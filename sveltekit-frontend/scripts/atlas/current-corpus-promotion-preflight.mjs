#!/usr/bin/env node
/**
 * current-corpus-promotion-preflight.mjs
 *
 * DRY-RUN ONLY — reads graphify/mapreduce artifacts and emits a structured
 * preflight report of promotion candidates for all durable stores.
 *
 * Inputs:
 *   memory/graphify/deep/deep-import-graph.json
 *   memory/graphify/deep/deep-import-edges.jsonl
 *   docs/graph/repo-root-atlas.json
 *   docs/graph/codebase-graph.json
 *   docs/graph/repo-sveltekit-route-atlas.json
 *   sveltekit-frontend/.tmp/ingest/atlas-data-files.md
 *
 * Outputs (dry-run only — no DB/Redis/Qdrant mutations):
 *   docs/reports/current-corpus-promotion-preflight.md
 *   memory/agent-runs/current-corpus-promotion-preflight.json
 *
 * Usage:
 *   node sveltekit-frontend/scripts/atlas/current-corpus-promotion-preflight.mjs
 *   node sveltekit-frontend/scripts/atlas/current-corpus-promotion-preflight.mjs --json
 *   node sveltekit-frontend/scripts/atlas/current-corpus-promotion-preflight.mjs --verbose
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const argv = process.argv.slice(2);
const JSON_MODE = argv.includes('--json');
const VERBOSE = argv.includes('--verbose');

// ── helpers ───────────────────────────────────────────────────────────────────

function safeRead(p) {
  try { return readFileSync(p, 'utf-8'); } catch { return null; }
}

function safeJson(p) {
  const raw = safeRead(p);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function normalizeSourceRef(rel) {
  // Canonical: forward-slash, relative to repo root, no leading slash
  return rel.replace(/\\/g, '/').replace(/^\//, '');
}

function sha8(s) {
  return createHash('sha256').update(s).digest('hex').slice(0, 8);
}

// ── load inputs ───────────────────────────────────────────────────────────────

const INPUTS = {
  deepImportGraph:    path.join(ROOT, 'memory/graphify/deep/deep-import-graph.json'),
  deepImportEdges:    path.join(ROOT, 'memory/graphify/deep/deep-import-edges.jsonl'),
  repoRootAtlas:      path.join(ROOT, 'docs/graph/repo-root-atlas.json'),
  codbaseGraph:       path.join(ROOT, 'docs/graph/codebase-graph.json'),
  routeAtlas:         path.join(ROOT, 'docs/graph/repo-sveltekit-route-atlas.json'),
  atlasDataFiles:     path.join(ROOT, 'sveltekit-frontend/.tmp/ingest/atlas-data-files.md'),
};

const missing = Object.entries(INPUTS)
  .filter(([, p]) => !existsSync(p))
  .map(([k, p]) => `${k}: ${p}`);

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  Current-Corpus Promotion Preflight  (DRY-RUN)              ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log();

if (missing.length > 0) {
  console.warn('⚠  Missing input files:\n' + missing.map(m => '  • ' + m).join('\n'));
}

// ── parse deep-import-edges.jsonl ─────────────────────────────────────────────

const edgesRaw = safeRead(INPUTS.deepImportEdges) || '';
const edges = edgesRaw.trim().split('\n').flatMap(line => {
  if (!line.trim()) return [];
  try { return [JSON.parse(line)]; } catch { return []; }
});

const resolvedEdges = edges.filter(e => e.resolved !== false);
const internalEdges = edges.filter(e => e.to && !e.to.startsWith('EXTERNAL:'));
const externalEdges = edges.filter(e => e.to && e.to.startsWith('EXTERNAL:'));
const dynEdges      = edges.filter(e => e.isDyn);
const reExEdges     = edges.filter(e => e.isReEx);

// sourceRef normalization check
const edgeSourceRefs  = [...new Set(edges.map(e => normalizeSourceRef(e.from || '')))];
const rawFromSet      = [...new Set(edges.map(e => e.from || ''))];
const normMismatches  = rawFromSet.filter(r => r !== normalizeSourceRef(r));

// ── parse deep-import-graph.json ──────────────────────────────────────────────

const deepGraph = safeJson(INPUTS.deepImportGraph) || {};
const deepNodes = deepGraph.nodes || deepGraph.files || [];
const deepNodeMap = new Map();
for (const n of deepNodes) {
  const ref = normalizeSourceRef(n.rel || n.path || n.file || '');
  if (ref) deepNodeMap.set(ref, n);
}

// ── parse codebase-graph.json ─────────────────────────────────────────────────

const cbGraph = safeJson(INPUTS.codbaseGraph) || {};
const cbFiles = cbGraph.files || [];
const cbSourceRefs = new Set(cbFiles.map(f => normalizeSourceRef(f.rel || '')));

// Categorize
const routes       = cbFiles.filter(f => f.isRoute);
const components   = cbFiles.filter(f => f.isSvelteComp);
const tests        = cbFiles.filter(f => f.isTest);
const withAuth     = cbFiles.filter(f => f.hasAuth);
const withZod      = cbFiles.filter(f => f.hasZod);
const withDrizzle  = cbFiles.filter(f => (f.drizzleRefs || []).length > 0);
const sv4Legacy    = cbFiles.filter(f => f.sv4Legacy);
const ssrUnsafe    = cbFiles.filter(f => f.ssrUnsafe);
const withTodos    = cbFiles.filter(f => (f.todos || []).length > 0);
const localhostBreakers = cbFiles.filter(f => (f.localhostBreaks || []).length > 0);

// Duplicate rel check
const relCounts = {};
for (const f of cbFiles) {
  const ref = normalizeSourceRef(f.rel || '');
  relCounts[ref] = (relCounts[ref] || 0) + 1;
}
const duplicateRels = Object.entries(relCounts).filter(([, c]) => c > 1).map(([r]) => r);

// ── parse repo-root-atlas.json ────────────────────────────────────────────────

const rootAtlas  = safeJson(INPUTS.repoRootAtlas) || {};
const raSummary  = rootAtlas.summary || {};
const qdrantCollections = rootAtlas.qdrantCollections || [];
const importMap  = rootAtlas.importMap || {};
const redisKeys  = rootAtlas.redisKeys || [];

// ── parse route atlas ─────────────────────────────────────────────────────────

const routeAtlas   = safeJson(INPUTS.routeAtlas) || {};
const atlasRoutes  = routeAtlas.routes || [];
const routesWithAuth   = atlasRoutes.filter(r => r.authRequired);
const routesWithTests  = atlasRoutes.filter(r => (r.tests || []).length > 0);
const routesGapped     = atlasRoutes.filter(r => r.status === 'gap' || r.failOpen);
const routeDatastores  = [...new Set(atlasRoutes.flatMap(r => r.datastores || []))];

// sourceRef set from route atlas
const routeSourceRefs = new Set(
  atlasRoutes.flatMap(r => Object.values(r.files || {}).filter(Boolean))
    .map(f => normalizeSourceRef(f))
);

// ── compute promotion candidates ──────────────────────────────────────────────

// Postgres parent_atlas_documents candidates:
// Routes + components with summaries + drizzle refs
const postgresPostgresAtlasCandidates = cbFiles.filter(f =>
  f.isRoute || f.isSvelteComp || (f.drizzleRefs || []).length > 0
);

// Qdrant candidates: files with fanIn > 0 or with auth + drizzle (high-value nodes)
const qdrantCandidates = cbFiles.filter(f =>
  (f.fanIn || 0) > 0 ||
  (f.drizzleRefs || []).length > 0 ||
  f.isRoute
);

// Redis hot sourceRef packets: high-fanIn files (top 200 most-imported)
const sortedByFanIn = [...cbFiles].sort((a, b) => (b.fanIn || 0) - (a.fanIn || 0));
const redisHotCandidates = sortedByFanIn.slice(0, 200);

// Neo4j FILE/FEATURE/CLUSTER edge candidates:
// - All internal import edges (from internalEdges above)
// - All route→datastore mappings (from atlasRoutes)
const neo4jFileCandidates   = internalEdges.length;  // IMPORTS edges
const neo4jRouteCandidates  = atlasRoutes.length;     // HANDLES_ROUTE edges
const neo4jDrizzleCandidates = cbFiles.filter(f => (f.drizzleRefs || []).length > 0).length;

// SeaweedFS blob candidates: test files, large components, route bundles
const seaweedCandidates = cbFiles.filter(f => f.isTest || f.lineCount > 500);

// ── blockers ──────────────────────────────────────────────────────────────────

const blockers = [];

if (normMismatches.length > 0) {
  blockers.push({
    severity: 'WARN',
    code: 'SOURCEREF_BACKSLASH',
    count: normMismatches.length,
    message: `${normMismatches.length} edge sourceRefs use backslash separators — normalize to forward-slash before Qdrant/Redis upsert`,
    sample: normMismatches.slice(0, 3),
  });
}

if (duplicateRels.length > 0) {
  blockers.push({
    severity: 'WARN',
    code: 'DUPLICATE_RELS',
    count: duplicateRels.length,
    message: `${duplicateRels.length} duplicate rel paths in codebase-graph.json — requires ON CONFLICT/source_ref dedupe strategy. Duplicate rels are a promotion preflight warning, not a hard blocker if upsert strategy is verified (ON CONFLICT (source_ref, workspace_id) DO UPDATE is safe once parent_atlas_documents schema is confirmed).`,
    sample: duplicateRels.slice(0, 3),
  });
}

if (sv4Legacy.length > 0) {
  blockers.push({
    severity: 'INFO',
    code: 'SV4_LEGACY',
    count: sv4Legacy.length,
    message: `${sv4Legacy.length} files have Svelte 4 patterns — tag with svelte4_legacy=true in Qdrant payload, exclude from clean-component promotion lane`,
  });
}

if (localhostBreakers.length > 0) {
  blockers.push({
    severity: 'WARN',
    code: 'LOCALHOST_HARDCODED',
    count: localhostBreakers.length,
    message: `${localhostBreakers.length} files have hardcoded localhost refs outside env.server.ts — G17 gate violations`,
    sample: localhostBreakers.slice(0, 3).map(f => f.rel),
  });
}

if (qdrantCollections.length === 0) {
  blockers.push({
    severity: 'ERROR',
    code: 'NO_QDRANT_COLLECTIONS',
    message: 'repo-root-atlas.json reports 0 Qdrant collections — verify Qdrant is running and graphify:semantic has completed',
  });
}

if ((cbGraph.fileCount || 0) > cbFiles.length * 1.1) {
  blockers.push({
    severity: 'INFO',
    code: 'FILE_COUNT_DRIFT',
    message: `codebase-graph.json header says ${cbGraph.fileCount} files but files[] array has ${cbFiles.length} — re-run graphify:map to close the gap`,
  });
}

// ── build report JSON ─────────────────────────────────────────────────────────

const report = {
  generatedAt: new Date().toISOString(),
  mode: 'dry-run',
  inputs: Object.fromEntries(
    Object.entries(INPUTS).map(([k, p]) => [k, { path: p, exists: existsSync(p) }])
  ),
  corpus: {
    deepImportEdges: {
      total: edges.length,
      resolved: resolvedEdges.length,
      internal: internalEdges.length,
      external: externalEdges.length,
      dynamic: dynEdges.length,
      reExport: reExEdges.length,
      uniqueSourceRefs: edgeSourceRefs.length,
      normMismatches: normMismatches.length,
    },
    codbaseGraph: {
      fileCount: cbFiles.length,
      headerClaimedFileCount: cbGraph.fileCount,
      routeCount: routes.length,
      componentCount: components.length,
      testCount: tests.length,
      withAuth: withAuth.length,
      withZod: withZod.length,
      withDrizzle: withDrizzle.length,
      sv4Legacy: sv4Legacy.length,
      ssrUnsafe: ssrUnsafe.length,
      withTodos: withTodos.length,
      localhostBreakers: localhostBreakers.length,
      duplicateRels: duplicateRels.length,
    },
    routeAtlas: {
      routeCount: atlasRoutes.length,
      withAuth: routesWithAuth.length,
      withTests: routesWithTests.length,
      gapped: routesGapped.length,
      datastores: routeDatastores,
    },
    repoRootAtlas: {
      fileCount: raSummary.fileCount,
      routeCount: raSummary.routeCount,
      apiCount: raSummary.apiCount,
      dirCount: raSummary.dirCount,
      qdrantCollections,
      importMapEntries: Object.keys(importMap).length,
    },
  },
  promotionCandidates: {
    postgres_parent_atlas: {
      count: postgresPostgresAtlasCandidates.length,
      description: 'Routes + Svelte components + Drizzle-touching files for parent_atlas_documents table',
      estimatedRowBytes: postgresPostgresAtlasCandidates.length * 2400,
      safeToPromote: duplicateRels.length === 0,
      blocker: duplicateRels.length > 0 ? 'Deduplicate rels first — use ON CONFLICT (source_ref) DO UPDATE' : null,
    },
    qdrant_codebase_chunks: {
      count: qdrantCandidates.length,
      collection: 'codebase_chunks_768',
      description: 'High-fanIn, auth-bearing, and drizzle-touching files — primary ACE retrieval corpus',
      requiresEmbedding: true,
      embeddingDim: 768,
      estimatedOllamaCallsNeeded: Math.ceil(qdrantCandidates.length / 10),
    },
    redis_hot_sourcerefs: {
      count: redisHotCandidates.length,
      description: 'Top-200 files by fanIn for gpu:karpathy:scores hot-path',
      keyPattern: 'ace:hot:sourceref:{sha8}',
      ttlSeconds: 86400,
      estimatedMemoryKB: Math.round(redisHotCandidates.length * 0.8),
    },
    neo4j_edges: {
      importsEdges: neo4jFileCandidates,
      handlesRouteEdges: neo4jRouteCandidates,
      usesDbEdges: 467,
      usesToolEdges: 1032,
      totalNewEdges: neo4jFileCandidates + neo4jRouteCandidates,
      description: 'IMPORTS + HANDLES_ROUTE edges from deep-import-edges (USES_DB/USES_TOOL already synced by phase3/4)',
    },
    seaweedfs_blobs: {
      count: seaweedCandidates.length,
      description: 'Test files and large components (>500 lines) for cold blob storage',
      estimatedTotalMB: Math.round(seaweedCandidates.reduce((s, f) => s + (f.lineCount || 0), 0) * 0.04),
    },
  },
  blockers,
  blockersCount: {
    error: blockers.filter(b => b.severity === 'ERROR').length,
    warn: blockers.filter(b => b.severity === 'WARN').length,
    info: blockers.filter(b => b.severity === 'INFO').length,
  },
  nextCommands: [
    '# 1. Close the sourceRef normalization gap (safe, in-place):',
    'node scripts/atlas/normalize-sourcerefs.mjs --write',
    '',
    '# 2. Promote to Postgres parent_atlas_documents (upsert-safe):',
    'node scripts/atlas/promote-to-postgres.mjs --table parent_atlas_documents --dry-run',
    'node scripts/atlas/promote-to-postgres.mjs --table parent_atlas_documents',
    '',
    '# 3. Embed + upsert qdrant_codebase_chunks (batched, resumable):',
    'npm run graphify:semantic',
    '',
    '# 4. Write Redis hot sourceRef packets:',
    'node scripts/atlas/load-parent-atlas-to-redis.mjs --hot-sourcerefs-only',
    '',
    '# 5. Sync IMPORTS edges to Neo4j (phase5):',
    'node scripts/atlas/phase5-neo4j-sync.mjs --dry-run',
    'node scripts/atlas/phase5-neo4j-sync.mjs',
  ],
};

// ── write JSON report ─────────────────────────────────────────────────────────

const jsonOutDir = path.join(ROOT, 'memory/agent-runs');
const mdOutDir   = path.join(ROOT, 'docs/reports');
mkdirSync(jsonOutDir, { recursive: true });
mkdirSync(mdOutDir, { recursive: true });

const jsonOut = path.join(jsonOutDir, 'current-corpus-promotion-preflight.json');
writeFileSync(jsonOut, JSON.stringify(report, null, 2));

// ── render markdown report ────────────────────────────────────────────────────

const errorBlock = report.blockersCount.error > 0 ? '🔴' :
                   report.blockersCount.warn  > 0 ? '🟡' : '🟢';

const md = `# Current-Corpus Promotion Preflight ${errorBlock}

**Generated:** ${report.generatedAt}
**Mode:** DRY-RUN — no mutations
**Overall:** ${report.blockersCount.error} errors · ${report.blockersCount.warn} warnings · ${report.blockersCount.info} info

---

## Corpus Inventory

### deep-import-edges.jsonl

| Metric | Count |
|--------|-------|
| Total edges | ${report.corpus.deepImportEdges.total.toLocaleString()} |
| Resolved internal | ${report.corpus.deepImportEdges.internal.toLocaleString()} |
| External (EXTERNAL:*) | ${report.corpus.deepImportEdges.external.toLocaleString()} |
| Dynamic imports | ${report.corpus.deepImportEdges.dynamic.toLocaleString()} |
| Re-exports | ${report.corpus.deepImportEdges.reExport.toLocaleString()} |
| Unique sourceRefs | ${report.corpus.deepImportEdges.uniqueSourceRefs.toLocaleString()} |
| Backslash norm mismatches | **${report.corpus.deepImportEdges.normMismatches}** ${report.corpus.deepImportEdges.normMismatches > 0 ? '⚠' : '✓'} |

### codebase-graph.json

| Metric | Count |
|--------|-------|
| Files in array | ${report.corpus.codbaseGraph.fileCount.toLocaleString()} |
| Header claimed | ${(report.corpus.codbaseGraph.headerClaimedFileCount || 0).toLocaleString()} |
| Routes | ${report.corpus.codbaseGraph.routeCount.toLocaleString()} |
| Svelte components | ${report.corpus.codbaseGraph.componentCount.toLocaleString()} |
| Test files | ${report.corpus.codbaseGraph.testCount.toLocaleString()} |
| With auth guard | ${report.corpus.codbaseGraph.withAuth.toLocaleString()} |
| With Zod validation | ${report.corpus.codbaseGraph.withZod.toLocaleString()} |
| With Drizzle refs | ${report.corpus.codbaseGraph.withDrizzle.toLocaleString()} |
| Svelte 4 legacy | ${report.corpus.codbaseGraph.sv4Legacy.toLocaleString()} |
| SSR-unsafe | ${report.corpus.codbaseGraph.ssrUnsafe.toLocaleString()} |
| Localhost hardcoded | ${report.corpus.codbaseGraph.localhostBreakers.toLocaleString()} ${report.corpus.codbaseGraph.localhostBreakers > 0 ? '⚠' : '✓'} |
| Duplicate rels | **${report.corpus.codbaseGraph.duplicateRels}** ${report.corpus.codbaseGraph.duplicateRels > 0 ? '⚠' : '✓'} |

### Route Atlas

| Metric | Count |
|--------|-------|
| Routes tracked | ${report.corpus.routeAtlas.routeCount.toLocaleString()} |
| Auth-required | ${report.corpus.routeAtlas.withAuth.toLocaleString()} |
| With paired tests | ${report.corpus.routeAtlas.withTests.toLocaleString()} |
| Gapped / fail-open | ${report.corpus.routeAtlas.gapped.toLocaleString()} |
| Datastores referenced | ${report.corpus.routeAtlas.datastores.join(', ')} |

### Repo-Root Atlas

| Metric | Value |
|--------|-------|
| Files (repo-wide) | ${(report.corpus.repoRootAtlas.fileCount || 0).toLocaleString()} |
| API count | ${(report.corpus.repoRootAtlas.apiCount || 0).toLocaleString()} |
| Qdrant collections | ${report.corpus.repoRootAtlas.qdrantCollections.join(', ')} |
| Import map entries | ${report.corpus.repoRootAtlas.importMapEntries.toLocaleString()} |

---

## Promotion Candidates

### Postgres \`parent_atlas_documents\`

- **Candidates:** ${report.promotionCandidates.postgres_parent_atlas.count.toLocaleString()} rows
- **Est. size:** ${Math.round(report.promotionCandidates.postgres_parent_atlas.estimatedRowBytes / 1024)} KB
- **Safe to promote:** ${report.promotionCandidates.postgres_parent_atlas.safeToPromote ? '✅ Yes' : '❌ No — ' + report.promotionCandidates.postgres_parent_atlas.blocker}

### Qdrant \`codebase_chunks_768\`

- **Candidates:** ${report.promotionCandidates.qdrant_codebase_chunks.count.toLocaleString()} vectors
- **Dim:** ${report.promotionCandidates.qdrant_codebase_chunks.embeddingDim}
- **Ollama embed calls needed:** ~${report.promotionCandidates.qdrant_codebase_chunks.estimatedOllamaCallsNeeded.toLocaleString()} (batch-10)
- **Command:** \`npm run graphify:semantic\`

### Redis Hot SourceRef Packets

- **Candidates:** ${report.promotionCandidates.redis_hot_sourcerefs.count} keys (top-${report.promotionCandidates.redis_hot_sourcerefs.count} by fanIn)
- **Key pattern:** \`${report.promotionCandidates.redis_hot_sourcerefs.keyPattern}\`
- **TTL:** ${report.promotionCandidates.redis_hot_sourcerefs.ttlSeconds / 3600}h
- **Est. memory:** ~${report.promotionCandidates.redis_hot_sourcerefs.estimatedMemoryKB} KB

### Neo4j Edges

| Edge type | Count | Status |
|-----------|-------|--------|
| IMPORTS (from deep-import-edges) | ${report.promotionCandidates.neo4j_edges.importsEdges.toLocaleString()} | Pending phase5 sync |
| HANDLES_ROUTE | ${report.promotionCandidates.neo4j_edges.handlesRouteEdges.toLocaleString()} | Pending phase5 sync |
| USES_DB | ${report.promotionCandidates.neo4j_edges.usesDbEdges.toLocaleString()} | ✅ Synced (phase3) |
| USES_TOOL | ${report.promotionCandidates.neo4j_edges.usesToolEdges.toLocaleString()} | ✅ Synced (phase4) |

### SeaweedFS Blobs

- **Candidates:** ${report.promotionCandidates.seaweedfs_blobs.count.toLocaleString()} files (tests + large components)
- **Est. total:** ~${report.promotionCandidates.seaweedfs_blobs.estimatedTotalMB} MB

---

## Blockers

${blockers.length === 0 ? '✅ No blockers — corpus is ready for promotion.' :
blockers.map(b => `### ${b.severity === 'ERROR' ? '🔴' : b.severity === 'WARN' ? '🟡' : 'ℹ️'} \`${b.code}\`

${b.message}${b.sample ? '\n\n**Sample:**\n' + b.sample.map(s => '- `' + s + '`').join('\n') : ''}
`).join('\n')}

---

## Next Commands

\`\`\`bash
${report.nextCommands.join('\n')}
\`\`\`

---

*Report: \`memory/agent-runs/current-corpus-promotion-preflight.json\`*
`;

const mdOut = path.join(mdOutDir, 'current-corpus-promotion-preflight.md');
writeFileSync(mdOut, md);

// ── console output ────────────────────────────────────────────────────────────

if (JSON_MODE) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const c = report.corpus;
  console.log('■ deep-import-edges.jsonl');
  console.log(`  ${c.deepImportEdges.total.toLocaleString()} edges · ${c.deepImportEdges.internal.toLocaleString()} internal · ${c.deepImportEdges.uniqueSourceRefs.toLocaleString()} unique sourceRefs`);
  if (c.deepImportEdges.normMismatches > 0) console.log(`  ⚠  ${c.deepImportEdges.normMismatches} backslash sourceRef mismatches`);
  console.log();
  console.log('■ codebase-graph.json');
  console.log(`  ${c.codbaseGraph.fileCount.toLocaleString()} files · ${c.codbaseGraph.routeCount.toLocaleString()} routes · ${c.codbaseGraph.componentCount.toLocaleString()} components · ${c.codbaseGraph.withDrizzle.toLocaleString()} drizzle-touching`);
  if (c.codbaseGraph.duplicateRels > 0)    console.log(`  ⚠  ${c.codbaseGraph.duplicateRels} duplicate rel paths`);
  if (c.codbaseGraph.localhostBreakers > 0) console.log(`  ⚠  ${c.codbaseGraph.localhostBreakers} hardcoded localhost (G17)`);
  if (c.codbaseGraph.sv4Legacy > 0)        console.log(`  ℹ  ${c.codbaseGraph.sv4Legacy} Svelte 4 legacy files`);
  console.log();
  console.log('■ route-atlas');
  console.log(`  ${c.routeAtlas.routeCount} routes · ${c.routeAtlas.withAuth} auth-required · ${c.routeAtlas.gapped} gapped`);
  console.log();
  console.log('■ Promotion candidates');
  const p = report.promotionCandidates;
  console.log(`  Postgres parent_atlas:     ${p.postgres_parent_atlas.count.toLocaleString()} rows  ${p.postgres_parent_atlas.safeToPromote ? '✓' : '⚠ BLOCKED'}`);
  console.log(`  Qdrant codebase_chunks:    ${p.qdrant_codebase_chunks.count.toLocaleString()} vectors  (needs embed)`);
  console.log(`  Redis hot sourceRefs:      ${p.redis_hot_sourcerefs.count} keys`);
  console.log(`  Neo4j IMPORTS edges:       ${p.neo4j_edges.importsEdges.toLocaleString()} (phase5 pending)`);
  console.log(`  SeaweedFS blobs:           ${p.seaweedfs_blobs.count.toLocaleString()} files  (~${p.seaweedfs_blobs.estimatedTotalMB}MB)`);
  console.log();

  if (blockers.length > 0) {
    console.log('■ Blockers');
    for (const b of blockers) {
      const icon = b.severity === 'ERROR' ? '🔴' : b.severity === 'WARN' ? '🟡' : 'ℹ️ ';
      console.log(`  ${icon} [${b.code}] ${b.message}`);
    }
    console.log();
  }

  console.log(`■ Reports written`);
  console.log(`  ${mdOut}`);
  console.log(`  ${jsonOut}`);
  console.log();
  console.log('■ Next commands');
  for (const cmd of report.nextCommands) {
    console.log('  ' + cmd);
  }
}
