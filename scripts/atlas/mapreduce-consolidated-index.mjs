#!/usr/bin/env node
/**
 * mapreduce-consolidated-index.mjs
 *
 * MapReduce pipeline for consolidating file metadata, imports, and semantic tags
 * into unified documents for parent atlas indexing.
 *
 * Usage:
 *   node scripts/atlas/mapreduce-consolidated-index.mjs --limit 100 --dry-run
 *   node scripts/atlas/mapreduce-consolidated-index.mjs --output consolidated.ndjson
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve, relative, dirname, basename, extname } from 'path';
import { createHash } from 'crypto';

const args = process.argv.slice(2);
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '10000', 10);
const dryRun = args.includes('--dry-run');
const outputFile = args.find(a => a.startsWith('--output='))?.split('=')[1] ?? 'consolidated-index.ndjson';
const verbose = args.includes('--verbose');

const REPO_ROOT = resolve('.');
const SRC_ROOT = join(REPO_ROOT, 'sveltekit-frontend', 'src');
const DRIZZLE_ROOT = join(REPO_ROOT, 'sveltekit-frontend', 'drizzle');

console.log(`\n🗺️  MapReduce Consolidated Index Generator`);
console.log(`════════════════════════════════════════════════════════\n`);
console.log(`Repo Root: ${REPO_ROOT}`);
console.log(`Limit: ${limit} files`);
console.log(`Dry Run: ${dryRun}`);
console.log(`Output: ${outputFile}\n`);

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1: MAP — Extract metadata from each file
// ═══════════════════════════════════════════════════════════════════════════════

const mapResults = [];

function scanDirectory(dir, rel = '') {
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir, { withFileTypes: true });
  const results = [];

  for (const file of files) {
    const fullPath = join(dir, file.name);
    const relPath = join(rel, file.name);

    // Skip node_modules, .git, hidden dirs
    if (file.name.startsWith('.') || file.name === 'node_modules' || file.name === 'target') {
      continue;
    }

    if (file.isDirectory()) {
      results.push(...scanDirectory(fullPath, relPath));
    } else if (
      ['.ts', '.tsx', '.js', '.mjs', '.json', '.sql', '.md'].includes(extname(file.name))
    ) {
      results.push({ fullPath, relPath, name: file.name });
    }

    if (results.length >= limit) break;
  }

  return results;
}

console.log(`📂 Scanning files...`);
const sourceFiles = [
  ...scanDirectory(SRC_ROOT, 'src'),
  ...scanDirectory(DRIZZLE_ROOT, 'drizzle'),
].slice(0, limit);

console.log(`   Found ${sourceFiles.length} files\n`);

// ═══════════════════════════════════════════════════════════════════════════════
// MAP PHASE: Extract metadata from each file
// ═══════════════════════════════════════════════════════════════════════════════

console.log(`🗂️  MAP PHASE: Extracting metadata from ${sourceFiles.length} files...`);

for (let i = 0; i < sourceFiles.length; i++) {
  const file = sourceFiles[i];
  const content = readFileSync(file.fullPath, 'utf-8');

  // Extract static imports
  const staticImports = extractStaticImports(content);
  // Extract dynamic imports
  const dynamicImports = extractDynamicImports(content);
  // Extract semantic markers
  const semanticMarkers = extractSemanticMarkers(content);
  // Extract keywords from file content (first 500 chars of comments/docstrings)
  const keywords = extractKeywords(content);

  const stableKey = createHash('sha256').update(file.relPath).digest('hex').slice(0, 12);

  mapResults.push({
    stableKey,
    filePath: file.relPath,
    fileName: file.name,
    extension: extname(file.name),
    size: content.length,
    lines: content.split('\n').length,
    feature: classifyFeature(file.relPath),
    directory: dirname(file.relPath),
    staticImports,
    dynamicImports,
    semanticMarkers,
    keywords,
    contentHash: createHash('sha256').update(content).digest('hex'),
    lastScanned: new Date().toISOString(),
  });

  if ((i + 1) % 100 === 0) {
    console.log(`   ${i + 1}/${sourceFiles.length} files mapped...`);
  }
}

console.log(`   ✅ MAP complete: ${mapResults.length} documents\n`);

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2: REDUCE — Join and aggregate data
// ═══════════════════════════════════════════════════════════════════════════════

console.log(`🔗 REDUCE PHASE: Joining imports and building relationships...\n`);

// Build lookup tables for joins
const filesByPath = new Map();
const filesByFeature = new Map();

for (const doc of mapResults) {
  filesByPath.set(doc.filePath, doc);
  if (!filesByFeature.has(doc.feature)) {
    filesByFeature.set(doc.feature, []);
  }
  filesByFeature.get(doc.feature).push(doc);
}

// Join: resolve import references
const consolidatedDocs = mapResults.map(doc => {
  const resolvedStaticImports = doc.staticImports.map(importPath => {
    const normalized = normalizeImportPath(importPath, doc.filePath);
    const target = filesByPath.get(normalized);
    return {
      path: importPath,
      normalized,
      exists: !!target,
      targetStableKey: target?.stableKey,
      targetFeature: target?.feature,
    };
  });

  const resolvedDynamicImports = doc.dynamicImports.map(importPath => {
    const normalized = normalizeImportPath(importPath, doc.filePath);
    const target = filesByPath.get(normalized);
    return {
      path: importPath,
      normalized,
      exists: !!target,
      targetStableKey: target?.stableKey,
      targetFeature: target?.feature,
    };
  });

  const importErrors = [
    ...resolvedStaticImports.filter(i => !i.exists),
    ...resolvedDynamicImports.filter(i => !i.exists),
  ];

  return {
    ...doc,
    resolvedStaticImports,
    resolvedDynamicImports,
    importErrorCount: importErrors.length,
    colocatedFiles: filesByFeature.get(doc.feature)?.map(f => f.filePath) ?? [],
    metadata: {
      isMigration: doc.fileName.match(/^\d{4}/) ? true : false,
      isSchema: doc.filePath.includes('schema') ? true : false,
      isComponent: doc.extension === '.svelte' || doc.filePath.includes('components') ? true : false,
      isRoute: doc.filePath.includes('routes') && doc.extension === '.ts' ? true : false,
      isTest: doc.fileName.includes('.test.') || doc.fileName.includes('.spec.') ? true : false,
    },
  };
});

console.log(`   ✅ REDUCE complete: ${consolidatedDocs.length} consolidated documents\n`);

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3: ANALYSIS & VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

console.log(`📊 ANALYSIS PHASE: Validating consolidation...\n`);

const stats = {
  totalFiles: consolidatedDocs.length,
  byFeature: {},
  byExtension: {},
  totalStaticImports: 0,
  totalDynamicImports: 0,
  importErrors: 0,
  filesWithErrors: 0,
};

for (const doc of consolidatedDocs) {
  stats.byFeature[doc.feature] = (stats.byFeature[doc.feature] ?? 0) + 1;
  stats.byExtension[doc.extension] = (stats.byExtension[doc.extension] ?? 0) + 1;
  stats.totalStaticImports += doc.staticImports.length;
  stats.totalDynamicImports += doc.dynamicImports.length;
  stats.importErrors += doc.importErrorCount;
  if (doc.importErrorCount > 0) stats.filesWithErrors += 1;
}

console.log(`✅ Statistics:`);
console.log(`   Total files: ${stats.totalFiles}`);
console.log(`   Total static imports: ${stats.totalStaticImports}`);
console.log(`   Total dynamic imports: ${stats.totalDynamicImports}`);
console.log(`   Import errors (dangling refs): ${stats.importErrors}`);
console.log(`   Files with import errors: ${stats.filesWithErrors}`);
console.log(`\n   By feature:`);
Object.entries(stats.byFeature).forEach(([feature, count]) => {
  console.log(`     ${feature}: ${count}`);
});
console.log(`\n   By extension:`);
Object.entries(stats.byExtension).forEach(([ext, count]) => {
  console.log(`     ${ext}: ${count}`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 4: OUTPUT
// ═══════════════════════════════════════════════════════════════════════════════

console.log(`\n💾 OUTPUT PHASE:\n`);

if (dryRun) {
  console.log(`🔍 DRY RUN - No files written`);
  console.log(`\nSample output (first document):`);
  console.log(JSON.stringify(consolidatedDocs[0], null, 2));
} else {
  // Write as NDJSON (one JSON per line, no file size limit)
  const ndjsonLines = consolidatedDocs.map(doc => JSON.stringify(doc)).join('\n');
  writeFileSync(outputFile, ndjsonLines, 'utf-8');

  const fileSizeMB = (Buffer.byteLength(ndjsonLines) / 1024 / 1024).toFixed(2);
  console.log(`✅ Written to: ${outputFile}`);
  console.log(`   Size: ${fileSizeMB} MB`);
  console.log(`   Format: NDJSON (one JSON per line)`);
  console.log(`   Rows: ${consolidatedDocs.length}`);

  // Write manifest
  const manifest = {
    version: '1.0',
    generated: new Date().toISOString(),
    totalDocuments: consolidatedDocs.length,
    statistics: stats,
    outputFile,
    schema: {
      stableKey: 'sha256 hash of filePath',
      filePath: 'relative path from repo root',
      feature: 'classified feature domain',
      resolvedStaticImports: 'array of resolved imports with exists/targetFeature',
      importErrorCount: 'count of dangling references',
      metadata: 'classification flags (isMigration, isSchema, isComponent, etc.)',
    },
  };

  writeFileSync(outputFile + '.manifest.json', JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`   Manifest: ${outputFile}.manifest.json`);
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`✅ MapReduce pipeline complete\n`);

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function extractStaticImports(content) {
  const imports = new Set();
  const pattern = /from\s+['"]([@\w/$._-]+)['"]/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    imports.add(match[1]);
  }
  return Array.from(imports);
}

function extractDynamicImports(content) {
  const imports = new Set();
  const patterns = [
    /import\(\s*['"]([@\w/$._-]+)['"]\s*\)/g,
    /@vite-ignore\s+.+?['"]([@\w/$._-]+)['"]/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      imports.add(match[1]);
    }
  }
  return Array.from(imports);
}

function extractSemanticMarkers(content) {
  const markers = new Set();
  const pattern = /#([a-z_][a-z0-9_]*)/gi;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    markers.add(match[1]);
  }
  return Array.from(markers);
}

function extractKeywords(content) {
  // Extract from docstrings and comments (first 500 chars)
  const sample = content.slice(0, 500);
  const keywords = new Set();
  const docPattern = /(?:\/\*\*?|\/\/)\s*(.+?)(?:\*\/|$)/gs;
  let match;
  while ((match = docPattern.exec(sample)) !== null) {
    const words = match[1].toLowerCase().split(/\W+/).filter(w => w.length > 3);
    words.forEach(w => keywords.add(w));
  }
  return Array.from(keywords).slice(0, 10); // Top 10 keywords
}

function classifyFeature(filePath) {
  if (filePath.includes('auth')) return 'auth';
  if (filePath.includes('rag') || filePath.includes('retrieval')) return 'rag';
  if (filePath.includes('graph') || filePath.includes('neo4j')) return 'graph';
  if (filePath.includes('vector') || filePath.includes('qdrant')) return 'vector';
  if (filePath.includes('llm') || filePath.includes('ollama')) return 'llm';
  if (filePath.includes('components') || filePath.includes('ui')) return 'ui';
  if (filePath.includes('cache') || filePath.includes('redis')) return 'cache';
  if (filePath.includes('admin')) return 'admin';
  if (filePath.includes('routes') || filePath.includes('api')) return 'routes';
  if (filePath.includes('drizzle') || filePath.includes('schema')) return 'database';
  return 'unclassified';
}

function normalizeImportPath(importPath, fromFile) {
  // Resolve $lib -> src/lib
  if (importPath.startsWith('$lib')) {
    return importPath.replace('$lib', 'src/lib') + (importPath.endsWith('.ts') ? '' : '.ts');
  }
  // Relative imports (../../, ./)
  if (importPath.startsWith('.')) {
    const base = dirname(fromFile);
    const resolved = join(base, importPath);
    return resolved + (importPath.endsWith('.ts') ? '' : '.ts');
  }
  // Assume src/lib prefix for bare imports
  return 'src/lib/' + importPath + '.ts';
}
