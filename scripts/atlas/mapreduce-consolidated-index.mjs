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

import { existsSync, readdirSync, readFileSync, writeFileSync, statSync, mkdirSync, createWriteStream } from 'fs';
import { join, resolve, dirname, extname, relative } from 'path';
import { createHash } from 'crypto';

const args = process.argv.slice(2);
const limitIndex = args.indexOf('--limit');
const limit = parseInt(
  limitIndex >= 0
    ? args[limitIndex + 1] ?? '10000'
    : args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '10000',
  10
);
const dryRun = args.includes('--dry-run');
const outputIndex = args.indexOf('--output');
const outputFile = outputIndex >= 0
  ? args[outputIndex + 1] ?? 'consolidated-index.ndjson'
  : args.find(a => a.startsWith('--output='))?.split('=')[1] ?? 'consolidated-index.ndjson';
const verbose = args.includes('--verbose');
const slim = args.includes('--slim');

const REPO_ROOT = resolve('.');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'target', 'dist', 'coverage', '.venv', '.venv-py313-backup', '.python311', '.cache', '.vs', 'deeds_labs', '.opencode']);
const ALLOW_HIDDEN_DIRS = new Set(['.tmp', '.cache', '.github', '.vscode', '.svelte-kit', '.docker-build']);
const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.sql', '.md', '.svelte']);
const SKIP_RELATIVE_PREFIXES = [
  '.opencode/cards/',
  '.opencode/embeddings/',
  '.opencode/ace-packets/',
  '.opencode/recommendations/',
  '.opencode/tasks/',
];
const MAX_ANALYZE_BYTES = 2 * 1024 * 1024;

function getAnalysisRoots() {
  const entries = readdirSync(REPO_ROOT, { withFileTypes: true });
  return entries
    .filter((entry) => {
      if (!entry.isDirectory()) return false;
      if (SKIP_DIRS.has(entry.name)) return false;
      if (entry.name.startsWith('.') && !ALLOW_HIDDEN_DIRS.has(entry.name)) return false;
      return true;
    })
    .map((entry) => join(REPO_ROOT, entry.name));
}

console.log(`\n🗺️  MapReduce Consolidated Index Generator`);
console.log(`════════════════════════════════════════════════════════\n`);
console.log(`Repo Root: ${REPO_ROOT}`);
console.log(`Limit: ${limit} files`);
console.log(`Dry Run: ${dryRun}`);
console.log(`Output: ${outputFile}\n`);
const analysisRoots = getAnalysisRoots();
console.log(`Roots: ${analysisRoots.map(root => relative(REPO_ROOT, root) || '.').join(', ')}\n`);

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
    const relPosix = relPath.replace(/\\/g, '/');

    if (SKIP_RELATIVE_PREFIXES.some((prefix) => relPosix.startsWith(prefix))) {
      continue;
    }

    // Skip VCS / dependency dirs, but allow selected gitignored workspace roots.
    if (file.isDirectory() && (SKIP_DIRS.has(file.name) || (file.name.startsWith('.') && !ALLOW_HIDDEN_DIRS.has(file.name)))) {
      continue;
    }

    if (file.isDirectory()) {
      results.push(...scanDirectory(fullPath, relPath));
    } else if (
      ALLOWED_EXTENSIONS.has(extname(file.name)) &&
      statSync(fullPath).size <= MAX_ANALYZE_BYTES
    ) {
      results.push({ fullPath, relPath, name: file.name });
    }

    if (results.length >= limit) break;
  }

  return results;
}

console.log(`📂 Scanning files...`);
const sourceFiles = analysisRoots
  .flatMap((root) => scanDirectory(root, relative(REPO_ROOT, root)))
  .slice(0, limit);

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
  const resolvedStaticImports = doc.staticImports
    .map(importPath => {
      const normalized = normalizeImportPath(importPath, doc.filePath);
      if (!normalized) {
        return {
          path: importPath,
          normalized: null,
          exists: true,
          external: true,
          targetStableKey: null,
          targetFeature: null,
        };
      }
      const target = filesByPath.get(normalized);
      return {
        path: importPath,
        normalized,
        exists: !!target,
        external: false,
        targetStableKey: target?.stableKey,
        targetFeature: target?.feature,
      };
    });

  const resolvedDynamicImports = doc.dynamicImports
    .map(importPath => {
      const normalized = normalizeImportPath(importPath, doc.filePath);
      if (!normalized) {
        return {
          path: importPath,
          normalized: null,
          exists: true,
          external: true,
          targetStableKey: null,
          targetFeature: null,
        };
      }
      const target = filesByPath.get(normalized);
      return {
        path: importPath,
        normalized,
        exists: !!target,
        external: false,
        targetStableKey: target?.stableKey,
        targetFeature: target?.feature,
      };
    });

  const importErrors = [
    ...resolvedStaticImports.filter(i => !i.exists && !i.external),
    ...resolvedDynamicImports.filter(i => !i.exists && !i.external),
  ];

  if (slim) {
    return {
      stableKey: doc.stableKey,
      filePath: doc.filePath,
      fileName: doc.fileName,
      extension: doc.extension,
      size: doc.size,
      lines: doc.lines,
      feature: doc.feature,
      directory: doc.directory,
      staticImports: doc.staticImports ? doc.staticImports.slice(0, 12) : [],
      resolvedStaticImports: resolvedStaticImports.slice(0, 12),
      dynamicImports: doc.dynamicImports ? doc.dynamicImports.slice(0, 12) : [],
      resolvedDynamicImports: resolvedDynamicImports.slice(0, 12),
      importErrorCount: importErrors.length,
      contentHash: doc.contentHash
    };
  }

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
  mkdirSync(dirname(outputFile), { recursive: true });
  const stream = createWriteStream(outputFile, { encoding: 'utf-8' });
  let bytesWritten = 0;
  for (const doc of consolidatedDocs) {
    const line = `${JSON.stringify(doc)}\n`;
    bytesWritten += Buffer.byteLength(line);
    if (!stream.write(line)) {
      await new Promise((resolve) => stream.once('drain', resolve));
    }
  }
  await new Promise((resolve, reject) => {
    stream.end(() => resolve());
    stream.on('error', reject);
  });

  const fileSizeMB = (bytesWritten / 1024 / 1024).toFixed(2);
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
  const p = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  if (p.includes('auth')) return 'auth';
  if (p.includes('rag') || p.includes('retrieval')) return 'rag';
  if (p.includes('graph') || p.includes('neo4j')) return 'graph';
  if (p.includes('vector') || p.includes('qdrant')) return 'vector';
  if (p.includes('llm') || p.includes('ollama')) return 'llm';
  if (p.includes('components') || p.includes('ui')) return 'ui';
  if (p.includes('cache') || p.includes('redis')) return 'cache';
  if (p.includes('sqlite')) return 'database';
  if (
    p.includes('/cli/') ||
    p.includes('/npx-cli/') ||
    p.includes('/server-beta/') ||
    p.includes('/server/generation/') ||
    p.includes('/server/runtime/') ||
    p.includes('/server/services/') ||
    p.includes('/servers/') ||
    p.includes('/services/') ||
    p.includes('/hooks/') ||
    p.includes('/integrations/') ||
    p.includes('/worker/') ||
    p.includes('/workers/') ||
    p.includes('/queue/') ||
    p.includes('/compat/') ||
    p.includes('/transcripts/') ||
    p.includes('/infrastructure/')
  ) return 'agent';
  if (p.includes('admin')) return 'admin';
  if (p.includes('routes') || p.includes('api')) return 'routes';
  if (p.includes('drizzle') || p.includes('schema')) return 'database';
  return 'unclassified';
}

function normalizeImportPath(importPath, fromFile) {
  // Only treat workspace-local imports as resolvable targets.
  // Package/builtin imports are marked external and excluded from dangling-ref counts.

  // SvelteKit auto-generated $types files — never on disk, always mark external
  if (importPath === './$types' || importPath === './$types.js' || importPath.endsWith('/$types') || importPath.endsWith('/$types.js')) {
    return null; // treated as external by caller
  }

  let rawAbs = null;

  if (importPath.startsWith('$lib')) {
    rawAbs = join(REPO_ROOT, 'sveltekit-frontend', 'src', 'lib', importPath.slice('$lib/'.length));
  } else if (importPath.startsWith('.')) {
    const base = dirname(join(REPO_ROOT, fromFile));
    rawAbs = join(base, importPath);
  } else if (importPath.startsWith('src/')) {
    rawAbs = join(REPO_ROOT, 'sveltekit-frontend', importPath);
  } else {
    return null;
  }

  rawAbs = stripKnownImportExtension(rawAbs);
  const candidates = expandImportCandidates(rawAbs);
  for (const candidate of candidates) {
    if (existsSync(candidate) && !statSync(candidate).isDirectory()) {
      return toRepoRelative(candidate);
    }
  }
  // No candidate found on disk — return the .ts probe path so the error normalised is useful
  return toRepoRelative(`${rawAbs.replace(/\.(js|mjs)$/, '')}.ts`);
}

function stripKnownImportExtension(absPath) {
  return absPath.replace(/\.(ts|tsx|js|mjs|cjs|json|svelte)$/i, '');
}

function expandImportCandidates(rawPath) {
  // Strip trailing slashes then strip a trailing .js or .mjs extension so that
  // "foo.js" expands to "foo.ts", "foo.js", etc. rather than "foo.js.ts".
  let base = rawPath.replace(/[\\/]+$/, '');
  base = base.replace(/\.(js|mjs)$/, '');
  const candidates = new Set([
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
    join(base, 'index.js'),
    join(base, 'index.mjs'),
    `${base}.svelte`,
  ]);
  return [...candidates];
}

function toRepoRelative(absPath) {
  // Return path relative to repo root, normalised to backslashes to match
  // the filePath keys stored in filesByPath (e.g. "src\lib\server\db\client.ts").
  // Also strip the "sveltekit-frontend\" prefix so $lib imports map correctly.
  let rel = relative(REPO_ROOT, absPath);
  if (rel.startsWith('sveltekit-frontend\\') || rel.startsWith('sveltekit-frontend/')) {
    rel = rel.slice('sveltekit-frontend/'.length);
  }
  return rel.replace(/\//g, '\\');
}
