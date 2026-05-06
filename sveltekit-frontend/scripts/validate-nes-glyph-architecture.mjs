/**
 * validate-nes-glyph-architecture.mjs
 *
 * Validates the structural integrity of nes-glyph-architecture.json and
 * multihop-codebase-map.json.
 *
 * Checks:
 *  ✓ Every node has stableKey + kind
 *  ✓ Every file node has manifold4 length 4 with finite values
 *  ✓ Every edge has from + to + type
 *  ✓ No duplicate stableKey
 *  ✓ Dangling edge classification:
 *      - external reference: endpoint exists in NES graph but not in this subset
 *      - true dangling: endpoint missing from both this file and the NES graph
 *  ✓ Cluster nodes have at least one BELONGS_TO_CLUSTER edge
 *  ✓ Summary lens edges reference existing nodes
 *  ✓ Total cluster coverage  (any clusterKey)
 *  ✓ Real cluster coverage   (clusterSource = 'gpu-kmeans')
 *  ✓ Fallback cluster breakdown by source tier
 *
 * Usage:
 *   node scripts/validate-nes-glyph-architecture.mjs
 *   node scripts/validate-nes-glyph-architecture.mjs --strict
 *   node scripts/validate-nes-glyph-architecture.mjs --json   (machine-readable output)
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const STRICT    = process.argv.includes('--strict');
const JSON_OUT  = process.argv.includes('--json');

// ── Load NES glyph as global node truth ──────────────────────────────────────
// NES glyph is the superset. Multihop is a filtered subset.
// Edges in multihop that point to nodes in NES-but-not-multihop are "external
// references", not errors.

const nesGlyphPath  = resolve(ROOT, 'docs/graph/nes-glyph-architecture.json');
const multihopPath  = resolve(ROOT, 'docs/graph/multihop-codebase-map.json');

/** @type {Set<string>} */
let nesNodeSet = new Set();
try {
  const nesData = JSON.parse(readFileSync(nesGlyphPath, 'utf8'));
  for (const n of (nesData.nodes ?? [])) {
    if (n.stableKey) nesNodeSet.add(n.stableKey);
  }
} catch {
  // If we can't load nes-glyph, every missing endpoint counts as a true dangling edge.
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let errors   = 0;
let warnings = 0;

/** @type {Map<string, { errors: number; warnings: number; checks: string[] }>} */
const fileResults = new Map();
let currentFile  = '';

function emit(level, msg) {
  fileResults.get(currentFile)?.checks.push(`${level}:${msg}`);
  if (level === 'fail') {
    if (!JSON_OUT) console.error('  ✗', msg);
    errors++;
    fileResults.get(currentFile).errors++;
  } else if (level === 'warn') {
    if (!JSON_OUT) console.warn('  ⚠', msg);
    warnings++;
    fileResults.get(currentFile).warnings++;
  } else {
    if (!JSON_OUT) console.log('  ✓', msg);
  }
}

const fail = (msg) => emit('fail', msg);
const warn = (msg) => emit('warn', msg);
const pass = (msg) => emit('pass', msg);

// ── Validate one file ─────────────────────────────────────────────────────────

/**
 * @param {string} filePath
 * @param {string} label
 * @param {Set<string>} [globalNodeSet] — when set, classifies cross-file edges
 */
function validateFile(filePath, label, globalNodeSet) {
  currentFile = filePath;
  fileResults.set(filePath, { errors: 0, warnings: 0, checks: [] });
  if (!JSON_OUT) console.log(`\n── ${label} (${filePath.split(/[/\\]/).pop()}) ──────────────────`);

  let data;
  try {
    data = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (e) {
    fail(`Cannot read/parse file: ${e.message}`);
    return null;
  }

  const nodes = data.nodes ?? [];
  const edges = data.edges ?? [];

  // 1. stableKey uniqueness
  const keySet = new Set();
  let dupCount = 0;
  for (const n of nodes) {
    if (!n.stableKey) { fail(`Node missing stableKey: ${JSON.stringify(n).slice(0, 80)}`); continue; }
    if (keySet.has(n.stableKey)) dupCount++;
    keySet.add(n.stableKey);
  }
  if (dupCount > 0) fail(`${dupCount} duplicate stableKey(s)`);
  else              pass(`${nodes.length} unique stableKey(s)`);

  // 2. Every node has kind
  const missingKind = nodes.filter((n) => !n.kind);
  if (missingKind.length > 0) fail(`${missingKind.length} node(s) missing kind`);
  else                         pass('All nodes have kind');

  // 3. File/component/route nodes have valid manifold4
  const fileTypes = new Set(['file', 'component', 'route', 'test', 'script', 'config']);
  const badM4 = nodes.filter((n) => {
    if (!fileTypes.has(n.kind)) return false;
    if (!Array.isArray(n.manifold4)) return true;
    if (n.manifold4.length !== 4) return true;
    if (n.manifold4.some((v) => !Number.isFinite(v))) return true;
    return false;
  });
  if (badM4.length > 0) fail(`${badM4.length} file/component node(s) have invalid manifold4`);
  else                   pass('All file nodes have valid manifold4[4]');

  // 4. Edge structure
  const badEdges = edges.filter((e) => !e.from || !e.to || !e.type);
  if (badEdges.length > 0) fail(`${badEdges.length} malformed edge(s) (missing from/to/type)`);
  else                      pass(`${edges.length} edges all have from/to/type`);

  // 5. Edge endpoint classification:
  //    local     — endpoint in THIS file's node set (fine)
  //    external  — endpoint in globalNodeSet but not local (expected for subsets)
  //    dangling  — endpoint missing from both (true error)
  let localOk   = 0;
  let external  = 0;
  let dangling  = 0;
  const danglingExamples = [];
  const externalExamples = [];

  for (const e of edges) {
    const fromOk = keySet.has(e.from);
    const toOk   = keySet.has(e.to);
    if (fromOk && toOk) {
      localOk++;
    } else {
      // Check each broken endpoint
      for (const ep of [!fromOk && e.from, !toOk && e.to].filter(Boolean)) {
        if (globalNodeSet && globalNodeSet.has(ep)) {
          external++;
          if (externalExamples.length < 3) externalExamples.push(`${ep} (${e.type})`);
        } else {
          dangling++;
          if (danglingExamples.length < 3) danglingExamples.push(`${ep} (${e.type})`);
        }
      }
    }
  }

  if (dangling > 0) {
    const msg = `${dangling} true dangling endpoint(s) (missing from graph entirely)`;
    if (STRICT) fail(msg);
    else        warn(msg);
    if (STRICT) danglingExamples.forEach((ex) => warn(`  · ${ex}`));
  } else {
    pass('No true dangling edges');
  }

  if (external > 0) {
    // External references are expected for subset exports — pass, not warn
    const note = globalNodeSet
      ? `valid against NES graph`
      : `(NES graph unavailable — cannot verify)`;
    pass(`${external} external reference(s) — ${note}`);
    if (STRICT) externalExamples.forEach((ex) => pass(`  · ${ex}`));
  }

  // 6. Cluster nodes have at least one BELONGS_TO_CLUSTER edge
  const clusterNodes = nodes.filter((n) => n.kind === 'cluster');
  const clustersWithEdges = new Set(
    edges.filter((e) => e.type === 'BELONGS_TO_CLUSTER').map((e) => e.to)
  );
  const emptyClusters = clusterNodes.filter((n) => !clustersWithEdges.has(n.stableKey));
  if (emptyClusters.length > 0) warn(`${emptyClusters.length} cluster node(s) have no BELONGS_TO_CLUSTER edges`);
  else if (clusterNodes.length > 0) pass(`All ${clusterNodes.length} cluster nodes have member edges`);

  // 7. Summary lens edges reference existing nodes (local or global)
  const lensEdges = edges.filter((e) => e.type === 'HAS_SUMMARY_LENS');
  const badLens = lensEdges.filter(
    (e) => !keySet.has(e.to) && !(globalNodeSet?.has(e.to))
  );
  if (badLens.length > 0) fail(`${badLens.length} HAS_SUMMARY_LENS edge(s) target non-existent nodes`);
  else if (lensEdges.length > 0) pass(`${lensEdges.length} summary lens edges all target existing nodes`);

  // 8. Cluster coverage — total, real (gpu-kmeans), and per-source breakdown
  const fileNodeList = nodes.filter((n) => fileTypes.has(n.kind));
  const totalFiles   = fileNodeList.length;

  if (totalFiles > 0) {
    const filesWithKey = fileNodeList.filter((n) => n.clusterKey).length;
    const filesGpu     = fileNodeList.filter((n) => n.clusterSource === 'gpu-kmeans').length;
    const filesDir     = fileNodeList.filter((n) => n.clusterSource === 'directory-fallback').length;
    const filesTopo    = fileNodeList.filter((n) => n.clusterSource === 'topo-class-fallback').length;
    const filesKind    = fileNodeList.filter((n) => n.clusterSource === 'kind-fallback').length;
    const filesUnclass = fileNodeList.filter((n) => n.clusterSource === 'unclassified-fallback').length;

    const totalPct = Math.round((filesWithKey / totalFiles) * 100);
    const realPct  = Math.round((filesGpu / totalFiles) * 100);

    if (totalPct < 50) warn(`Total cluster coverage: ${filesWithKey}/${totalFiles} files (${totalPct}%)`);
    else               pass(`Total cluster coverage: ${filesWithKey}/${totalFiles} files (${totalPct}%)`);

    if (filesGpu === 0) warn(`Real cluster coverage (gpu-kmeans): 0/${totalFiles} — run npm run graphify:topology`);
    else               pass(`Real cluster coverage (gpu-kmeans): ${filesGpu}/${totalFiles} files (${realPct}%)`);

    // Per-source breakdown (informational, never fail)
    const parts = [
      filesDir     > 0 && `${filesDir} directory-fallback`,
      filesTopo    > 0 && `${filesTopo} topo-class`,
      filesKind    > 0 && `${filesKind} kind`,
      filesUnclass > 0 && `${filesUnclass} unclassified`,
    ].filter(Boolean);
    if (parts.length > 0) pass(`Fallback breakdown: ${parts.join(', ')}`);
  }

  if (!JSON_OUT) console.log('');

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    externalRefs: external,
    trueDangling: dangling,
  };
}

// ── Run validation ────────────────────────────────────────────────────────────

// NES glyph is the source of truth — no cross-file lookup (it IS the global graph)
const nesResult = validateFile(nesGlyphPath, 'NES Glyph Architecture', null);

// Multihop is a subset — use NES node set to distinguish external vs dangling
const multihopResult = validateFile(multihopPath, 'Multihop Codebase Map', nesNodeSet);

if (!JSON_OUT) {
  console.log(`\n── Summary ${'─'.repeat(40)}`);
  console.log(`Errors:   ${errors}`);
  console.log(`Warnings: ${warnings}`);

  if (errors > 0) {
    console.error('\nValidation FAILED');
  } else if (warnings > 0) {
    console.warn('\nValidation PASSED with warnings');
  } else {
    console.log('\nValidation PASSED ✓');
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({
    ok: errors === 0,
    errors,
    warnings,
    nes: nesResult,
    multihop: multihopResult,
  }, null, 2));
}

process.exit(errors > 0 ? 1 : 0);
