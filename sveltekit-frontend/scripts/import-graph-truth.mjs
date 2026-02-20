#!/usr/bin/env node
/**
 * Import Graph Truth Report
 *
 * For each unreachable file, determines:
 * 1. Does ANY file (reachable or unreachable) import it?
 * 2. Is there a reachable file with the same basename?
 * 3. What symbols does it export?
 *
 * Outputs:
 * - unreachable-unused.txt      (no importers anywhere)
 * - unreachable-duplicate.txt   (same basename as reachable file)
 * - unreachable-candidates.txt  (unique, has exports, not duplicated)
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, basename, dirname, relative, extname, join } from 'path';
import { writeFileSync } from 'fs';

const ROOT = resolve(import.meta.dirname, '..');
const SEP = '\\';

// --- Load category lists ---
function loadList(name) {
  const p = resolve(ROOT, name);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').trim().split('\n')
    .map(l => l.trim().split(SEP).join('/'))
    .filter(l => l.length > 0);
}

const unreachable = loadList('unreachable.txt');
const reachable = loadList('reachable.txt');
const reachableSet = new Set(reachable);
const unreachableSet = new Set(unreachable);

console.log(`Loaded: ${reachable.length} reachable, ${unreachable.length} unreachable`);

// --- Build basename maps ---
const reachableByBasename = new Map();
for (const f of reachable) {
  const bn = basename(f);
  if (!reachableByBasename.has(bn)) reachableByBasename.set(bn, []);
  reachableByBasename.get(bn).push(f);
}

// --- Walk all source files and extract imports ---
function walkDir(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (['node_modules', '.svelte-kit', 'build', 'dist', '.git', 'deeds_labs'].includes(e.name)) continue;
        results.push(...walkDir(full));
      } else if (/\.(ts|svelte|js)$/.test(e.name) && !e.name.endsWith('.d.ts')) {
        results.push(full);
      }
    }
  } catch { /* permission errors */ }
  return results;
}

console.log('Scanning source files for imports...');
const allSourceFiles = walkDir(resolve(ROOT, 'src'));
console.log(`Found ${allSourceFiles.length} source files to scan`);

// Extract import paths from a file
const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
const dynamicImportRegex = /import\(['"]([^'"]+)['"]\)/g;

function extractImports(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const imports = new Set();

    for (const match of content.matchAll(importRegex)) {
      imports.add(match[1]);
    }
    for (const match of content.matchAll(dynamicImportRegex)) {
      imports.add(match[1]);
    }
    return imports;
  } catch {
    return new Set();
  }
}

// Resolve an import path to a file path relative to ROOT
function resolveImport(importPath, importerPath) {
  const importerDir = dirname(importerPath);

  // $lib/ alias
  if (importPath.startsWith('$lib/')) {
    const libPath = importPath.replace('$lib/', 'src/lib/');
    return resolveToFile(resolve(ROOT, libPath));
  }

  // Relative imports
  if (importPath.startsWith('.')) {
    const resolved = resolve(importerDir, importPath);
    return resolveToFile(resolved);
  }

  return null; // node_modules or other
}

// Resolve a path to an actual file (try extensions)
function resolveToFile(basePath) {
  const extensions = ['', '.ts', '.svelte', '.js', '.svelte.ts', '.svelte.js'];

  for (const ext of extensions) {
    const candidate = basePath + ext;
    if (existsSync(candidate)) {
      return relative(ROOT, candidate).split(SEP).join('/');
    }
  }

  // Try index files
  for (const idx of ['index.ts', 'index.js', 'index.svelte']) {
    const candidate = join(basePath, idx);
    if (existsSync(candidate)) {
      return relative(ROOT, candidate).split(SEP).join('/');
    }
  }

  return null;
}

// --- Build reverse import graph ---
console.log('Building reverse import graph...');
const importedBy = new Map(); // file -> Set<importer>

let scanned = 0;
for (const absPath of allSourceFiles) {
  const relPath = relative(ROOT, absPath).split(SEP).join('/');
  const imports = extractImports(absPath);

  for (const imp of imports) {
    const resolved = resolveImport(imp, absPath);
    if (resolved) {
      if (!importedBy.has(resolved)) importedBy.set(resolved, new Set());
      importedBy.get(resolved).add(relPath);
    }
  }

  scanned++;
  if (scanned % 500 === 0) console.log(`  Scanned ${scanned}/${allSourceFiles.length}...`);
}
console.log(`  Scanned ${scanned}/${allSourceFiles.length} files`);

// --- Extract export symbols from a file ---
const exportRegex = /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/g;
const exportFromRegex = /export\s*\{([^}]+)\}/g;

function getExportedSymbols(filePath) {
  const absPath = resolve(ROOT, filePath);
  if (!existsSync(absPath)) return [];
  try {
    const content = readFileSync(absPath, 'utf8');
    const symbols = new Set();

    for (const match of content.matchAll(exportRegex)) {
      symbols.add(match[1]);
    }
    for (const match of content.matchAll(exportFromRegex)) {
      const names = match[1].split(',').map(s => {
        const parts = s.trim().split(/\s+as\s+/);
        return (parts[1] || parts[0]).trim();
      }).filter(s => s.length > 0);
      names.forEach(n => symbols.add(n));
    }

    return [...symbols];
  } catch {
    return [];
  }
}

// --- Classify unreachable files ---
console.log('\nClassifying unreachable files...');

const unused = [];       // No importers at all
const duplicates = [];   // Same basename as reachable file
const candidates = [];   // Unique, has exports, potential feature

for (const file of unreachable) {
  const importers = importedBy.get(file);
  const hasImporters = importers && importers.size > 0;
  const bn = basename(file);
  const reachableDups = reachableByBasename.get(bn) || [];
  const hasDuplicate = reachableDups.length > 0;
  const exports = getExportedSymbols(file);

  // Count how many importers are themselves reachable
  let reachableImporterCount = 0;
  let unreachableImporterCount = 0;
  if (hasImporters) {
    for (const imp of importers) {
      if (reachableSet.has(imp)) reachableImporterCount++;
      else unreachableImporterCount++;
    }
  }

  const entry = {
    path: file,
    importerCount: hasImporters ? importers.size : 0,
    reachableImporters: reachableImporterCount,
    unreachableImporters: unreachableImporterCount,
    exports: exports.slice(0, 10), // Top 10
    exportCount: exports.length,
    duplicateOf: hasDuplicate ? reachableDups : []
  };

  if (!hasImporters) {
    if (hasDuplicate) {
      duplicates.push(entry);
    } else if (exports.length > 0) {
      candidates.push(entry);
    } else {
      unused.push(entry);
    }
  } else {
    // Has importers but unreachable — means only unreachable files import it
    if (hasDuplicate) {
      duplicates.push(entry);
    } else if (exports.length > 0) {
      candidates.push(entry);
    } else {
      unused.push(entry);
    }
  }
}

// Sort candidates by export count (most exports = most likely valuable)
candidates.sort((a, b) => b.exportCount - a.exportCount);
duplicates.sort((a, b) => b.exportCount - a.exportCount);

// --- Output reports ---
console.log(`\n=== IMPORT GRAPH TRUTH REPORT ===`);
console.log(`  Unused (no exports, safe to archive):    ${unused.length}`);
console.log(`  Duplicates (same basename as reachable):  ${duplicates.length}`);
console.log(`  Feature candidates (unique with exports): ${candidates.length}`);
console.log(`  Total classified: ${unused.length + duplicates.length + candidates.length} / ${unreachable.length}`);

// Write simple lists
writeFileSync(resolve(ROOT, 'unreachable-unused.txt'),
  unused.map(e => e.path).join('\n') + '\n');
writeFileSync(resolve(ROOT, 'unreachable-duplicate.txt'),
  duplicates.map(e => `${e.path}\t→\t${e.duplicateOf.join(', ')}`).join('\n') + '\n');
writeFileSync(resolve(ROOT, 'unreachable-candidates.txt'),
  candidates.map(e => `${e.path}\t[${e.exportCount} exports: ${e.exports.slice(0,5).join(', ')}]`).join('\n') + '\n');

// Write detailed JSON report
const report = {
  generated: new Date().toISOString(),
  summary: {
    totalUnreachable: unreachable.length,
    unused: unused.length,
    duplicates: duplicates.length,
    candidates: candidates.length
  },
  unused: unused.map(e => e.path),
  duplicates: duplicates.map(e => ({
    unreachable: e.path,
    reachableDuplicates: e.duplicateOf,
    exports: e.exports,
    importedBy: e.importerCount
  })),
  candidates: candidates.slice(0, 50).map(e => ({
    path: e.path,
    exportCount: e.exportCount,
    topExports: e.exports,
    importedByUnreachable: e.unreachableImporters
  }))
};

writeFileSync(resolve(ROOT, 'import-graph-report.json'), JSON.stringify(report, null, 2));

// --- Print top duplicates ---
console.log(`\n── TOP DUPLICATES (unreachable with reachable twin) ──`);
for (const d of duplicates.slice(0, 15)) {
  console.log(`  ${basename(d.path).padEnd(40)} ${d.path}`);
  console.log(`    → reachable: ${d.duplicateOf[0]}`);
  if (d.exportCount > 0) console.log(`    exports: ${d.exports.slice(0, 5).join(', ')}`);
}

// --- Print top candidates ---
console.log(`\n── TOP FEATURE CANDIDATES (unique, high export count) ──`);
for (const c of candidates.slice(0, 15)) {
  console.log(`  [${String(c.exportCount).padStart(3)} exports]  ${c.path}`);
  if (c.unreachableImporters > 0) console.log(`    imported by ${c.unreachableImporters} unreachable files`);
  console.log(`    exports: ${c.exports.slice(0, 5).join(', ')}`);
}

// --- Print directory summary for unused ---
console.log(`\n── UNUSED FILES BY DIRECTORY ──`);
const unusedDirs = {};
for (const u of unused) {
  const parts = u.path.split('/');
  const dir = parts.slice(0, Math.min(3, parts.length - 1)).join('/');
  unusedDirs[dir] = (unusedDirs[dir] || 0) + 1;
}
Object.entries(unusedDirs)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([dir, count]) => console.log(`  ${String(count).padStart(4)}  ${dir}`));

console.log(`\nReports written:`);
console.log(`  unreachable-unused.txt       (${unused.length} files)`);
console.log(`  unreachable-duplicate.txt    (${duplicates.length} files)`);
console.log(`  unreachable-candidates.txt   (${candidates.length} files)`);
console.log(`  import-graph-report.json     (detailed JSON)`);