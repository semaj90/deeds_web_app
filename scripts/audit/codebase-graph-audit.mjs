/**
 * Codebase Knowledge Graph Audit Script
 *
 * Analyzes 15,651 indexed files from Qdrant to prepare for Neo4j graph creation
 * Uses simdjson N-API for 2-5× faster JSON parsing
 *
 * Usage: node scripts/audit/codebase-graph-audit.mjs
 */

import { fastJsonParse, isSimdJsonAvailable } from '../../sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.js';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';

// ANSI colors
const green = '\x1b[32m';
const red = '\x1b[31m';
const yellow = '\x1b[33m';
const blue = '\x1b[34m';
const cyan = '\x1b[36m';
const reset = '\x1b[0m';

function log(msg, color = reset) {
  console.log(`${color}${msg}${reset}`);
}

// ============================================================================
// Graph Analysis State
// ============================================================================

const stats = {
  totalFiles: 0,
  nodeTypes: new Map(), // type -> count
  edgeTypes: new Map(), // type -> count
  imports: new Map(),   // file -> [imports]
  exports: new Map(),   // file -> [exports]
  languages: new Map(), // language -> count
  directories: new Map(), // directory -> count
  orphans: [],          // files with no imports/exports
  clusters: [],         // tightly connected components
  simdHits: 0,          // JSON parsed via simdjson
  v8Hits: 0,            // JSON parsed via V8
};

// ============================================================================
// Qdrant API Helpers
// ============================================================================

async function scrollCollection(offset = null, limit = 100) {
  const body = {
    offset,
    limit,
    with_payload: true,
    with_vector: false, // Don't need embeddings for audit
  };

  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Qdrant scroll failed: ${response.status}`);
  }

  const text = await response.text();

  // Use simdjson if available (2-5× faster)
  let data;
  if (isSimdJsonAvailable() && text.length > 1024) {
    data = fastJsonParse(text);
    stats.simdHits++;
  } else {
    data = JSON.parse(text);
    stats.v8Hits++;
  }

  return data.result;
}

async function getAllPoints() {
  const allPoints = [];
  let offset = null;
  let hasMore = true;

  log(`\n📊 Fetching all points from ${COLLECTION}...`, blue);

  while (hasMore) {
    const result = await scrollCollection(offset, 100);

    if (result.points && result.points.length > 0) {
      allPoints.push(...result.points);
      offset = result.next_page_offset;

      if (allPoints.length % 1000 === 0) {
        log(`  Fetched ${allPoints.length.toLocaleString()} points...`, cyan);
      }
    } else {
      hasMore = false;
    }

    if (!result.next_page_offset) {
      hasMore = false;
    }
  }

  log(`✅ Fetched ${allPoints.length.toLocaleString()} total points`, green);
  log(`  simd JSON parses: ${stats.simdHits}`, cyan);
  log(`  V8 JSON parses: ${stats.v8Hits}`, cyan);

  return allPoints;
}

// ============================================================================
// Graph Analysis Functions
// ============================================================================

function extractLanguage(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const langMap = {
    'ts': 'TypeScript',
    'js': 'JavaScript',
    'mjs': 'JavaScript',
    'svelte': 'Svelte',
    'go': 'Go',
    'proto': 'Protobuf',
    'sql': 'SQL',
    'py': 'Python',
    'md': 'Markdown',
  };
  return langMap[ext] || 'Other';
}

function extractDirectory(filePath) {
  const parts = filePath.split(/[\\/]/);
  if (parts.length <= 2) return '/';
  return parts.slice(0, -1).join('/');
}

function inferNodeType(payload) {
  const path = payload.file_path || '';
  const content = (payload.content || '').toLowerCase();

  if (path.includes('/routes/api/')) return 'api_route';
  if (path.includes('/routes/(app)/')) return 'app_route';
  if (path.includes('/lib/components/')) return 'component';
  if (path.includes('/lib/server/')) return 'server_module';
  if (path.includes('/lib/contracts/')) return 'contract';
  if (path.includes('/lib/types/')) return 'type_definition';
  if (path.endsWith('.proto')) return 'protobuf_schema';
  if (path.endsWith('.sql')) return 'sql_migration';
  if (content.includes('export class')) return 'class_module';
  if (content.includes('export function')) return 'function_module';
  if (content.includes('export interface')) return 'interface_module';

  return 'unknown';
}

function extractImports(content) {
  const imports = [];

  // TypeScript/JavaScript imports
  const importRegex = /import\s+.*?from\s+['"](.+?)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // Dynamic imports
  const dynamicRegex = /import\(['"](.+?)['"]\)/g;
  while ((match = dynamicRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // Require (CJS)
  const requireRegex = /require\(['"](.+?)['"]\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return [...new Set(imports)]; // dedupe
}

function extractExports(content) {
  const exports = [];

  if (/export\s+default/.test(content)) {
    exports.push('default');
  }

  const namedRegex = /export\s+(?:const|let|var|function|class|interface|type)\s+(\w+)/g;
  let match;
  while ((match = namedRegex.exec(content)) !== null) {
    exports.push(match[1]);
  }

  return exports;
}

function analyzePoint(point) {
  const payload = point.payload;
  const filePath = payload.file_path || 'unknown';
  const content = payload.content || '';

  stats.totalFiles++;

  // Node type
  const nodeType = inferNodeType(payload);
  stats.nodeTypes.set(nodeType, (stats.nodeTypes.get(nodeType) || 0) + 1);

  // Language
  const lang = extractLanguage(filePath);
  stats.languages.set(lang, (stats.languages.get(lang) || 0) + 1);

  // Directory
  const dir = extractDirectory(filePath);
  stats.directories.set(dir, (stats.directories.get(dir) || 0) + 1);

  // Imports/Exports
  const imports = extractImports(content);
  const exports = extractExports(content);

  if (imports.length > 0) {
    stats.imports.set(filePath, imports);
    stats.edgeTypes.set('imports', (stats.edgeTypes.get('imports') || 0) + imports.length);
  }

  if (exports.length > 0) {
    stats.exports.set(filePath, exports);
  }

  // Orphan detection
  if (imports.length === 0 && exports.length === 0 && nodeType !== 'sql_migration') {
    stats.orphans.push({
      path: filePath,
      type: nodeType,
      size: content.length,
    });
  }
}

function detectClusters() {
  // Build adjacency list
  const graph = new Map();

  for (const [file, imports] of stats.imports.entries()) {
    if (!graph.has(file)) {
      graph.set(file, new Set());
    }

    for (const imp of imports) {
      // Resolve relative imports to absolute paths
      const resolvedPath = resolveImport(file, imp);
      graph.get(file).add(resolvedPath);

      if (!graph.has(resolvedPath)) {
        graph.set(resolvedPath, new Set());
      }
    }
  }

  // Find strongly connected components (Tarjan's algorithm would be better, but this is quick)
  const visited = new Set();
  const clusters = [];

  function dfs(node, cluster) {
    if (visited.has(node)) return;
    visited.add(node);
    cluster.add(node);

    const neighbors = graph.get(node) || new Set();
    for (const neighbor of neighbors) {
      dfs(neighbor, cluster);
    }
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      const cluster = new Set();
      dfs(node, cluster);
      if (cluster.size > 1) {
        clusters.push(Array.from(cluster));
      }
    }
  }

  return clusters.sort((a, b) => b.length - a.length); // Largest first
}

function resolveImport(fromFile, importPath) {
  // Simple path resolution (could be improved)
  if (importPath.startsWith('$lib/')) {
    return importPath.replace('$lib/', 'src/lib/');
  }
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    const dir = extractDirectory(fromFile);
    return `${dir}/${importPath}`.replace(/\/\.\//g, '/');
  }
  return importPath;
}

// ============================================================================
// Report Generation
// ============================================================================

function printReport() {
  log('\n' + '='.repeat(80), blue);
  log('  CODEBASE KNOWLEDGE GRAPH AUDIT REPORT', blue);
  log('='.repeat(80) + '\n', blue);

  log(`📁 Total Files Indexed: ${stats.totalFiles.toLocaleString()}`, green);
  log(`🚀 SIMD JSON Speedup: ${stats.simdHits} fast parses, ${stats.v8Hits} V8 parses\n`, cyan);

  // Node Types
  log('📊 Node Types:', blue);
  const sortedTypes = Array.from(stats.nodeTypes.entries()).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sortedTypes.slice(0, 10)) {
    const pct = ((count / stats.totalFiles) * 100).toFixed(1);
    log(`  ${type.padEnd(20)} ${count.toString().padStart(6)} (${pct}%)`, reset);
  }

  // Languages
  log('\n🌐 Languages:', blue);
  const sortedLangs = Array.from(stats.languages.entries()).sort((a, b) => b[1] - a[1]);
  for (const [lang, count] of sortedLangs) {
    const pct = ((count / stats.totalFiles) * 100).toFixed(1);
    log(`  ${lang.padEnd(15)} ${count.toString().padStart(6)} (${pct}%)`, reset);
  }

  // Top Directories
  log('\n📂 Top 10 Directories:', blue);
  const sortedDirs = Array.from(stats.directories.entries()).sort((a, b) => b[1] - a[1]);
  for (const [dir, count] of sortedDirs.slice(0, 10)) {
    log(`  ${count.toString().padStart(4)} files - ${dir}`, reset);
  }

  // Edge Types
  log('\n🔗 Edge Types:', blue);
  for (const [type, count] of stats.edgeTypes.entries()) {
    log(`  ${type.padEnd(15)} ${count.toLocaleString().padStart(6)} edges`, reset);
  }

  // Orphans
  log(`\n🏝️  Orphan Files (no imports/exports): ${stats.orphans.length}`, yellow);
  if (stats.orphans.length > 0) {
    log('  Top 10 orphans:', reset);
    const sortedOrphans = stats.orphans.sort((a, b) => b.size - a.size).slice(0, 10);
    for (const orphan of sortedOrphans) {
      log(`    ${orphan.path} (${orphan.type}, ${orphan.size} bytes)`, reset);
    }
  }

  // Clusters
  log('\n🌐 Tightly Connected Clusters:', blue);
  const topClusters = stats.clusters.slice(0, 5);
  for (let i = 0; i < topClusters.length; i++) {
    const cluster = topClusters[i];
    log(`  Cluster ${i + 1}: ${cluster.length} files`, cyan);
    log(`    Sample: ${cluster.slice(0, 3).join(', ')}`, reset);
  }

  // Graph Quality Metrics
  log('\n📈 Graph Quality Metrics:', blue);
  const avgImportsPerFile = Array.from(stats.imports.values()).reduce((sum, arr) => sum + arr.length, 0) / stats.imports.size || 0;
  const avgExportsPerFile = Array.from(stats.exports.values()).reduce((sum, arr) => sum + arr.length, 0) / stats.exports.size || 0;
  const orphanRate = (stats.orphans.length / stats.totalFiles) * 100;

  log(`  Avg imports per file: ${avgImportsPerFile.toFixed(2)}`, reset);
  log(`  Avg exports per file: ${avgExportsPerFile.toFixed(2)}`, reset);
  log(`  Orphan rate: ${orphanRate.toFixed(2)}%`, orphanRate > 10 ? yellow : green);
  log(`  Largest cluster: ${stats.clusters[0]?.length || 0} files`, reset);

  log('\n' + '='.repeat(80), blue);
  log('✅ Audit complete! Ready for Neo4j graph creation.\n', green);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    log('\n🔍 Starting Codebase Graph Audit...', blue);
    log(`   Using simdjson: ${isSimdJsonAvailable() ? '✅ YES (2-5× faster)' : '❌ NO (falling back to V8)'}`, cyan);

    // Fetch all points
    const points = await getAllPoints();

    // Analyze each point
    log('\n🧮 Analyzing files...', blue);
    for (const point of points) {
      analyzePoint(point);
    }

    // Detect clusters
    log('\n🔍 Detecting connected components...', blue);
    stats.clusters = detectClusters();

    // Print report
    printReport();

    // Save JSON output for Neo4j ingestion
    const output = {
      totalFiles: stats.totalFiles,
      nodeTypes: Object.fromEntries(stats.nodeTypes),
      edgeTypes: Object.fromEntries(stats.edgeTypes),
      languages: Object.fromEntries(stats.languages),
      directories: Object.fromEntries(stats.directories),
      orphans: stats.orphans,
      clusters: stats.clusters.map((c, i) => ({ id: i, size: c.length, files: c })),
      imports: Object.fromEntries(stats.imports),
      exports: Object.fromEntries(stats.exports),
    };

    await import('fs/promises').then(fs =>
      fs.writeFile('codebase-graph-audit.json', JSON.stringify(output, null, 2))
    );

    log(`💾 Saved audit data to codebase-graph-audit.json\n`, green);

  } catch (error) {
    log(`\n❌ Error: ${error.message}`, red);
    console.error(error);
    process.exit(1);
  }
}

main();
