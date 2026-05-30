#!/usr/bin/env node
/**
 * dependency-context-mapper.mjs
 *
 * Extracts the full import/dependency graph from the codebase feature map and
 * resolves $lib aliases + TypeScript path mappings to canonical NDJSON edges.
 *
 * Output:
 *   .tmp/dependency-graph.ndjson   — one edge per line: { from, to, kind, resolved }
 *   .tmp/dependency-summary.json   — aggregated stats + top hub files
 *
 * Usage:
 *   node scripts/atlas/dependency-context-mapper.mjs
 *   node scripts/atlas/dependency-context-mapper.mjs --dry-run
 *   node scripts/atlas/dependency-context-mapper.mjs --limit 500
 *   node scripts/atlas/dependency-context-mapper.mjs --verbose
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REPO_ROOT, loadConfig, resolveRepoPath, readJson, toPosixPath,
  extractImportsFromText, readText,
} from './_atlas-utils.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const argv  = process.argv.slice(2);

const DRY_RUN  = argv.includes('--dry-run');
const VERBOSE  = argv.includes('--verbose');
const LIMIT_I  = argv.indexOf('--limit');
const LIMIT    = LIMIT_I >= 0 ? parseInt(argv[LIMIT_I + 1], 10) : Infinity;

const FEATURE_MAP_PATH = resolveRepoPath('.tmp/codebase-feature-map.json');
const GRAPH_OUT        = resolveRepoPath('.tmp/dependency-graph.ndjson');
const SUMMARY_OUT      = resolveRepoPath('.tmp/dependency-summary.json');

const config  = loadConfig();

// ── Resolve $lib and tsconfig path aliases ─────────────────────────────────
const LIB_ALIASES = {
  '$lib': 'sveltekit-frontend/src/lib',
  '$app': 'sveltekit-frontend/.svelte-kit/runtime/app',
  '$env': 'sveltekit-frontend/.svelte-kit/runtime/env',
};

// Load any additional aliases from tsconfig paths
function loadTsAlias() {
  const tsconfig = readJson(resolveRepoPath('sveltekit-frontend/tsconfig.json'), {});
  const paths = tsconfig?.compilerOptions?.paths ?? {};
  const result = { ...LIB_ALIASES };
  for (const [alias, targets] of Object.entries(paths)) {
    const key = alias.replace(/\/\*$/, '');
    const val = (targets[0] ?? '').replace(/\/\*$/, '').replace(/^\.\//, 'sveltekit-frontend/');
    if (key && val) result[key] = val;
  }
  return result;
}

function resolveImport(importPath, fromRel, aliases) {
  // Already absolute alias
  for (const [alias, target] of Object.entries(aliases)) {
    if (importPath === alias || importPath.startsWith(alias + '/')) {
      return toPosixPath(importPath.replace(alias, target));
    }
  }
  // Relative import
  if (importPath.startsWith('.')) {
    const fromDir = path.dirname(fromRel);
    const resolved = toPosixPath(path.join(fromDir, importPath));
    return resolved;
  }
  // npm package — keep as-is, mark as external
  return null;
}

// ── Import edge kinds ──────────────────────────────────────────────────────
function edgeKind(imp) {
  if (imp.includes('server')) return 'server';
  if (imp.includes('$lib/')) return 'lib';
  if (imp.startsWith('.')) return 'relative';
  if (imp.startsWith('$')) return 'sveltekit';
  return 'npm';
}

// ── Extract all edges from the feature map files ───────────────────────────
async function extractEdges(featureMap, aliases) {
  const edges = [];
  const files = featureMap?.files ?? [];
  let count = 0;

  for (const fileEntry of files) {
    if (count >= LIMIT) break;
    const { rel, imports } = fileEntry;
    if (!rel) continue;

    // Use pre-extracted imports if available
    const importList = imports ?? [];

    for (const imp of importList) {
      const resolved = resolveImport(imp, rel, aliases);
      edges.push({
        from: rel,
        to: imp,
        resolved: resolved ?? imp,
        kind: edgeKind(imp),
        external: resolved === null,
      });
    }

    count++;
  }

  return edges;
}

// ── Build hub analysis (files most imported) ───────────────────────────────
function buildHubs(edges) {
  const inDegree = new Map();
  const outDegree = new Map();

  for (const e of edges) {
    if (!e.external) {
      inDegree.set(e.resolved, (inDegree.get(e.resolved) ?? 0) + 1);
    }
    outDegree.set(e.from, (outDegree.get(e.from) ?? 0) + 1);
  }

  const topHubs = [...inDegree.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([file, count]) => ({ file, importedBy: count }));

  const topFans = [...outDegree.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([file, count]) => ({ file, importsCount: count }));

  return { topHubs, topFans };
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('[dep-mapper] Dependency context mapper');
  console.log(`[dep-mapper] dry=${DRY_RUN}  limit=${isFinite(LIMIT) ? LIMIT : 'all'}`);

  if (!fs.existsSync(FEATURE_MAP_PATH)) {
    console.error('[dep-mapper] Feature map not found — run Stage 1 first:');
    console.error('  node scripts/atlas/build-codebase-feature-map.mjs');
    process.exit(1);
  }

  const featureMap = JSON.parse(fs.readFileSync(FEATURE_MAP_PATH, 'utf8'));
  console.log(`[dep-mapper] Loaded feature map: ${featureMap.totalFiles ?? '?'} files, ${featureMap.totalFeatureAreas ?? '?'} features`);

  const aliases = loadTsAlias();
  if (VERBOSE) console.log('[dep-mapper] Aliases:', aliases);

  const edges = await extractEdges(featureMap, aliases);
  console.log(`[dep-mapper] Extracted ${edges.length} import edges`);

  const { topHubs, topFans } = buildHubs(edges);

  // Compute kind stats
  const kindCounts = {};
  for (const e of edges) kindCounts[e.kind] = (kindCounts[e.kind] ?? 0) + 1;

  const summary = {
    generatedAt: new Date().toISOString(),
    totalEdges: edges.length,
    externalEdges: edges.filter(e => e.external).length,
    internalEdges: edges.filter(e => !e.external).length,
    edgesByKind: kindCounts,
    topHubs,
    topFans,
  };

  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(GRAPH_OUT), { recursive: true });

    // Write NDJSON edges
    const ndjson = edges.map(e => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(GRAPH_OUT, ndjson, 'utf8');

    // Write summary
    fs.writeFileSync(SUMMARY_OUT, JSON.stringify(summary, null, 2) + '\n', 'utf8');

    console.log(`\n[dep-mapper] Written:`);
    console.log(`  Edges NDJSON : ${GRAPH_OUT}`);
    console.log(`  Summary JSON : ${SUMMARY_OUT}`);
  } else {
    console.log('\n[dep-mapper] Dry-run — no files written');
  }

  console.log('\n[dep-mapper] Edge kind breakdown:');
  for (const [kind, count] of Object.entries(kindCounts)) {
    console.log(`  ${kind.padEnd(12)} ${count}`);
  }

  console.log('\n[dep-mapper] Top hub files (most imported):');
  for (const h of topHubs.slice(0, 10)) {
    console.log(`  ${h.importedBy.toString().padStart(4)}x  ${h.file}`);
  }
}

main().catch(e => { console.error('[dep-mapper] Fatal:', e); process.exit(1); });
