/**
 * AST Graph Worker — Phase 1 rich structural extraction.
 *
 * Uses regex-based parsing for speed (~5s for 2000 files).
 *
 * Extracts:
 *   Node labels : File, Route, Component, Store, ServerModule (+ always CodebaseFile)
 *   Node props  : usedTables, publishedQueues, consumedQueues, fetchedRoutes, usesNative, hasDynamicImports
 *   Edges       : IMPORTS (static), DYNAMIC_IMPORTS
 *   (USES_COMPONENT / USES_STORE derived in sync module from IMPORTS + nodeLabel)
 *
 * Protocol:
 *   recv: { taskId, type: "ast-graph", payload: { scanDir, srcRoot, maxFiles } }
 *   send: { taskId, result: { nodes, edges, metadata } }
 */
import { parentPort } from 'worker_threads';
import { resolve, relative, basename, dirname, extname } from 'path';
import { readdirSync, statSync, readFileSync } from 'fs';

// Known Drizzle table names (for USES_TABLE metadata)
const WORKER_VERSION = 'v2-phase1-rich-2026-04-13';
console.log('[ast-graph-worker] loaded version:', WORKER_VERSION);

const KNOWN_TABLES = new Set([
  "users","sessions","cases","caseNotes","caseStatuteLinks",
  "evidence","evidenceRelationships","evidenceVectors",
  "documents","legalDocuments","documentChunks",
  "citations","statutes","statuteChunks","legalPrecedents",
  "ragSessions","ragMessages","searchQueries",
  "persons","organizations","routeHealth","errorTracking",
  "embeddingCache","workspaces",
]);

// Known RabbitMQ queue names
const KNOWN_QUEUES = new Set([
  "cache.invalidate","document.embed","evidence.process",
  "vector.index","chat.context","analytics.track","codebase.index",
]);

// ── Regex patterns ────────────────────────────────────────────────────────────
const RE_IMPORT     = /^import\s+(?:type\s+)?(?:[\w*{},\s]+\s+from\s+)?['"]([^'"]+)['"]/gm;
const RE_REEXPORT   = /^export\s+(?:type\s+)?(?:\*|{[^}]*})\s+from\s+['"]([^'"]+)['"]/gm;
const RE_DYN_IMPORT = /\bimport\s*\(\s*['"`]([^'"`\n]+)['"`]\s*\)/gm;
const RE_EXPORT_FN  = /^export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/gm;
const RE_EXPORT_CLS = /^export\s+(?:default\s+)?class\s+(\w+)/gm;
const RE_EXPORT_VAR = /^export\s+(?:const|let|var)\s+(\w+)/gm;
const RE_FN_NAME    = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm;
const RE_CLASS      = /\bclass\s+\w+/g;
const RE_BRANCH     = /\b(if|else|for|while|switch|case|catch)\b|&&|\|\||\?[^:]/g;
const RE_FETCH      = /\bfetch\s*\(\s*[`'"](\/api\/[^'"`\s,\n)]+)/gm;
const RE_PUBLISH    = /(?:publish|sendToQueue)\s*\(\s*['"`]([a-zA-Z][a-zA-Z0-9._-]{2,40})['"`]/gm;
const RE_CONSUME    = /consume\s*\(\s*['"`]([a-zA-Z][a-zA-Z0-9._-]{2,40})['"`]/gm;
const RE_TBL_FROM   = /\.from\s*\(\s*([a-z][a-zA-Z0-9]{2,})\s*[,)]/gm;
const RE_TBL_INS    = /\.insert\s*\(\s*([a-z][a-zA-Z0-9]{2,})\s*\)/gm;
const RE_TBL_UPD    = /\.update\s*\(\s*([a-z][a-zA-Z0-9]{2,})\s*\)/gm;
const RE_TBL_DEL    = /\.delete\s*\(\s*([a-z][a-zA-Z0-9]{2,})\s*\)/gm;
const RE_NATIVE     = /(?:fastJsonParse|computeGpuSimilarity|isCudaAvailable|isSimdJsonAvailable|tensorrt_bridge|libtorchCosineSimilarity)/;

// ── Node label ────────────────────────────────────────────────────────────────
function getNodeLabel(relPath) {
  if (relPath.startsWith("routes/")) return "Route";
  if (relPath.endsWith(".svelte") && relPath.includes("/components/")) return "Component";
  if (relPath.includes("/stores/") || relPath.endsWith(".svelte.ts")) return "Store";
  if (relPath.includes("/server/") || relPath.includes("/services/")) return "ServerModule";
  return "File";
}

function classifyType(relPath) {
  if (relPath.includes('/routes/api/') || relPath.includes('+server.ts')) return 'api';
  if (relPath.startsWith('routes/')) return 'route';
  if (relPath.includes('/stores/') || relPath.endsWith('.svelte.ts')) return 'store';
  if (relPath.endsWith('.svelte') && relPath.includes('/components/')) return 'component';
  if (relPath.includes('/server/') || relPath.includes('/services/')) return 'service';
  return 'util';
}

function deriveCluster(relPath) {
  if (relPath.startsWith('routes/api/')) {
    const p = relPath.split('/');
    return p.length >= 4 ? 'api-' + p[2] : 'api';
  }
  if (relPath.startsWith('routes/(app)/')) {
    const p = relPath.split('/');
    return p.length >= 4 ? 'app-' + p[2] : 'app';
  }
  if (relPath.startsWith('routes/')) return 'routes';
  if (relPath.startsWith('lib/components/')) {
    const p = relPath.split('/');
    return p.length >= 4 ? 'comp-' + p[2] : 'components';
  }
  if (relPath.startsWith('lib/stores/')) return 'stores';
  if (relPath.startsWith('lib/server/')) {
    const p = relPath.split('/');
    return p.length >= 4 ? 'server-' + p[2] : 'server';
  }
  if (relPath.startsWith('lib/ai/')) return 'ai';
  return 'lib';
}

// ── File collection ───────────────────────────────────────────────────────────
function collectFiles(dir, maxFiles) {
  const files = [];
  function walk(d) {
    if (files.length >= maxFiles) return;
    let entries;
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      const full = resolve(d, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (
          ['node_modules', '.svelte-kit', 'deeds_labs', 'static', 'build', 'services'].includes(
            entry
          )
        )
          continue;
        walk(full);
      } else {
        const ext = extname(entry);
        if (['.ts', '.js', '.mts'].includes(ext) && !entry.endsWith('.d.ts')) files.push(full);
      }
    }
  }
  walk(dir);
  return files;
}

// ── Import resolution ─────────────────────────────────────────────────────────
function resolveImport(spec, fromFile, srcRoot) {
  if (spec.startsWith('$lib/')) return 'lib/' + spec.slice(5).replace(/\.js$/, '');
  if (spec.startsWith('$') || spec.startsWith('@') || !spec.startsWith('.')) return null;
  const fromDir = dirname(relative(srcRoot, fromFile));
  const resolved = resolve(srcRoot, fromDir, spec).replace(/\.js$/, '');
  const rel = relative(srcRoot, resolved).replace(/\\/g, '/');
  return rel.startsWith('..') ? null : rel;
}

// ── Extraction helpers ────────────────────────────────────────────────────────
function extractAll(re, src) {
  const out = []; let m;
  re.lastIndex = 0;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}
function filterKnown(names, set) {
  return [...new Set(names.filter(n => set.has(n)))];
}

// ── Main ─────────────────────────────────────────────────────────────────────
function buildGraph({ scanDir, srcRoot, maxFiles }) {
  const startMs = Date.now();
  const filePaths = collectFiles(scanDir, maxFiles);
  const fileRelSet = new Set(filePaths.map((f) => relative(srcRoot, f).replace(/\\/g, '/')));

  const nodeMap = new Map();
  const edges = [];

  for (const fp of filePaths) {
    let src;
    try {
      src = readFileSync(fp, 'utf8');
    } catch {
      continue;
    }

    const relPath = relative(srcRoot, fp).replace(/\\/g, '/');
    const nodeId = relPath.replace(/\.(ts|js|mts)$/, '').replace(/[^a-zA-Z0-9\/_.-]/g, '_');

    // Imports
    const importSpecs = [...extractAll(RE_IMPORT, src), ...extractAll(RE_REEXPORT, src)];
    const dynSpecs = extractAll(RE_DYN_IMPORT, src);

    // Exports / functions
    const exportNames = [
      ...extractAll(RE_EXPORT_FN, src),
      ...extractAll(RE_EXPORT_CLS, src),
      ...extractAll(RE_EXPORT_VAR, src),
    ];
    const funcNames = extractAll(RE_FN_NAME, src);

    // Metadata
    const rawTables = [
      ...extractAll(RE_TBL_FROM, src),
      ...extractAll(RE_TBL_INS, src),
      ...extractAll(RE_TBL_UPD, src),
      ...extractAll(RE_TBL_DEL, src),
    ];
    const usedTables = filterKnown(rawTables, KNOWN_TABLES);
    const publishedQueues = filterKnown(extractAll(RE_PUBLISH, src), KNOWN_QUEUES);
    const consumedQueues = filterKnown(extractAll(RE_CONSUME, src), KNOWN_QUEUES);
    const fetchedRoutes = [...new Set(extractAll(RE_FETCH, src))].slice(0, 20);
    const usesNative = RE_NATIVE.test(src);

    // Metrics
    const lineCount = src.split('\n').length;
    const fileSize = src.length;
    const complexity = (src.match(RE_BRANCH) ?? []).length;
    const classCount = (src.match(RE_CLASS) ?? []).length;

    nodeMap.set(relPath, {
      id: nodeId,
      label: basename(fp),
      nodeLabel: getNodeLabel(relPath),
      type: classifyType(relPath),
      filePath: 'src/' + relPath,
      cluster: deriveCluster(relPath),
      lineCount,
      fileSize,
      complexity,
      classCount,
      importCount: importSpecs.length,
      exportCount: exportNames.length,
      exports: exportNames.slice(0, 20),
      functions: funcNames.slice(0, 20),
      usedTables,
      publishedQueues,
      consumedQueues,
      fetchedRoutes,
      usesNative,
      hasDynamicImports: dynSpecs.length > 0,
    });

    // Static IMPORTS edges
    for (const spec of importSpecs) {
      const t = resolveImport(spec, fp, srcRoot);
      if (!t) continue;
      for (const cand of [
        t,
        t + '.ts',
        t + '.js',
        t + '/index.ts',
        t + '/+server.ts',
        t + '/+page.server.ts',
      ]) {
        if (fileRelSet.has(cand) || nodeMap.has(cand)) {
          edges.push({
            source: nodeId,
            target: cand.replace(/\.(ts|js|mts)$/, '').replace(/[^a-zA-Z0-9\/_.-]/g, '_'),
            type: 'IMPORTS',
          });
          break;
        }
      }
    }

    // DYNAMIC_IMPORTS edges
    for (const spec of dynSpecs) {
      const t = resolveImport(spec, fp, srcRoot);
      if (!t) continue;
      for (const cand of [t, t + '.ts', t + '.js', t + '/index.ts']) {
        if (fileRelSet.has(cand) || nodeMap.has(cand)) {
          edges.push({
            source: nodeId,
            target: cand.replace(/\.(ts|js|mts)$/, '').replace(/[^a-zA-Z0-9\/_.-]/g, '_'),
            type: 'DYNAMIC_IMPORTS',
          });
          break;
        }
      }
    }
  }

  const nodes = Array.from(nodeMap.values());

  const nodeIdSet = new Set(nodes.map((n) => n.id));

  // Deduplicate edges
  const edgeSet = new Set();
  const validEdges = edges
    .filter((e) => {
      const key = e.type + ':' + e.source + '>' + e.target;
      if (edgeSet.has(key)) return false;
      edgeSet.add(key);
      return true;
    })
    .filter((e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target));

  // Label distribution stats
  const labelCounts = {};
  for (const n of nodes) labelCounts[n.nodeLabel] = (labelCounts[n.nodeLabel] ?? 0) + 1;
  const edgeTypeCounts = {};
  for (const e of validEdges) edgeTypeCounts[e.type] = (edgeTypeCounts[e.type] ?? 0) + 1;

  return {
    nodes,
    edges: validEdges,
    metadata: {
      totalNodes: nodes.length,
      totalEdges: validEdges.length,
      labelCounts,
      edgeTypeCounts,
      nodesWithErrors: 0,
      scanTimeMs: Date.now() - startMs,
      maxFiles,
      generatedAt: new Date().toISOString(),
    },
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
parentPort?.on("message", (msg) => {
  const { taskId, type, payload } = msg;
  if (type !== 'ast-graph') {
    parentPort?.postMessage({ taskId, error: 'Unknown task type: ' + type });
    return;
  }
  try {
    parentPort?.postMessage({ taskId, result: buildGraph(payload) });
  } catch (err) {
    parentPort?.postMessage({ taskId, error: String(err) });
  }
});
