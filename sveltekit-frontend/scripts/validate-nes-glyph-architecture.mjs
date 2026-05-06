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
 *  ✓ No dangling edge endpoints (both ends exist in node set)
 *  ✓ Cluster nodes have at least one BELONGS_TO_CLUSTER edge
 *  ✓ Summary lens edges reference existing nodes
 *
 * Usage:
 *   node scripts/validate-nes-glyph-architecture.mjs
 *   node scripts/validate-nes-glyph-architecture.mjs --strict
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const STRICT    = process.argv.includes('--strict');

// ── Helpers ───────────────────────────────────────────────────────────────────

let errors = 0;
let warnings = 0;

function fail(msg)  { console.error('  ✗', msg); errors++;   }
function warn(msg)  { console.warn ('  ⚠', msg); warnings++; }
function pass(msg)  { console.log  ('  ✓', msg);             }

function validateFile(filePath, label) {
  console.log(`\n── ${label} (${filePath.split('/').pop()}) ──────────────────`);

  let data;
  try {
    data = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (e) {
    fail(`Cannot read/parse file: ${e.message}`);
    return;
  }

  const nodes = data.nodes ?? [];
  const edges = data.edges ?? [];

  // 1. stableKey uniqueness
  const keySet = new Set();
  let dupCount = 0;
  for (const n of nodes) {
    if (!n.stableKey) { fail(`Node missing stableKey: ${JSON.stringify(n).slice(0, 80)}`); continue; }
    if (keySet.has(n.stableKey)) { dupCount++; }
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

  // 5. No dangling edges (endpoint not in node set)
  let dangling = 0;
  for (const e of edges) {
    if (!keySet.has(e.from) || !keySet.has(e.to)) {
      dangling++;
      if (dangling <= 3 && STRICT) warn(`Dangling edge: ${e.from} → ${e.to} (${e.type})`);
    }
  }
  if (dangling > 0) {
    const fn = STRICT ? fail : warn;
    fn(`${dangling} dangling edge(s) (endpoints not in node set)`);
  } else {
    pass('No dangling edges');
  }

  // 6. Cluster nodes have at least one BELONGS_TO_CLUSTER edge
  const clusterNodes = nodes.filter((n) => n.kind === 'cluster');
  const clustersWithEdges = new Set(
    edges.filter((e) => e.type === 'BELONGS_TO_CLUSTER').map((e) => e.to)
  );
  const emptyClusters = clusterNodes.filter((n) => !clustersWithEdges.has(n.stableKey));
  if (emptyClusters.length > 0) warn(`${emptyClusters.length} cluster node(s) have no BELONGS_TO_CLUSTER edges`);
  else if (clusterNodes.length > 0) pass(`All ${clusterNodes.length} cluster nodes have member edges`);

  // 7. Summary lens edges reference existing nodes
  const lensEdges = edges.filter((e) => e.type === 'HAS_SUMMARY_LENS');
  const badLens = lensEdges.filter((e) => !keySet.has(e.to));
  if (badLens.length > 0) fail(`${badLens.length} HAS_SUMMARY_LENS edge(s) target non-existent nodes`);
  else if (lensEdges.length > 0) pass(`${lensEdges.length} summary lens edges all target existing nodes`);

  // 8. Cluster coverage for file nodes
  const totalFiles   = nodes.filter((n) => fileTypes.has(n.kind)).length;
  const filesWithKey = nodes.filter((n) => fileTypes.has(n.kind) && n.clusterKey).length;
  const pct = totalFiles > 0 ? Math.round((filesWithKey / totalFiles) * 100) : 0;
  const coverMsg = `Cluster coverage: ${filesWithKey}/${totalFiles} files (${pct}%)`;
  if (pct < 50) warn(coverMsg);
  else          pass(coverMsg);

  console.log('');
}

// ── Run validation ────────────────────────────────────────────────────────────

validateFile(resolve(ROOT, 'docs/graph/nes-glyph-architecture.json'), 'NES Glyph Architecture');
validateFile(resolve(ROOT, 'docs/graph/multihop-codebase-map.json'), 'Multihop Codebase Map');

console.log(`\n── Summary ${'─'.repeat(40)}`);
console.log(`Errors:   ${errors}`);
console.log(`Warnings: ${warnings}`);

if (errors > 0) {
  console.error('\nValidation FAILED');
  process.exit(1);
} else if (warnings > 0) {
  console.warn('\nValidation PASSED with warnings');
  process.exit(0);
} else {
  console.log('\nValidation PASSED ✓');
  process.exit(0);
}
