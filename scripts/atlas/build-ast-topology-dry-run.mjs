#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd());
const OUT_DIR = path.join(ROOT, '.tmp');
const GLOB_PATHS = ['src', 'sveltekit-frontend', 'scripts'];
// Exclude noisy backup/archive/generated folders to avoid polluting unresolved imports
const EXCLUDE_PATTERNS = [
  'scripts/api-cleanup/reports',
  'sveltekit-frontend/scripts/phase104-backups',
  '/backup',
  '/backups',
  '/archive',
  '/archives',
  '/dead-scripts',
  'generated-reports'
];
const FILE_EXT = ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.svelte'];

function ensureOut() {
  try { fs.mkdirSync(OUT_DIR, { recursive: true }); } catch (e) {}
}

function walk(dir) {
  const results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of list) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      // skip generated / vendor directories early to avoid parsing framework output
      if (['node_modules', '.git', '.tmp', 'dist', 'build', '.svelte-kit', '.vite', 'deeds_labs'].includes(ent.name)) continue;
      // skip configured exclude patterns anywhere in the path
      const rel = path.relative(ROOT, full).replace(/\\/g, '/');
      let skip = false;
      for (const pat of EXCLUDE_PATTERNS) {
        if (rel.includes(pat) || full.includes(pat)) { skip = true; break; }
      }
      if (skip) continue;
      results.push(...walk(full));
    } else if (ent.isFile()) {
      if (FILE_EXT.includes(path.extname(ent.name))) results.push(full);
    }
  }
  return results;
}

function read(f) {
  try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; }
}

function writeJsonl(name, lines) {
  const p = path.join(OUT_DIR, name);
  fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  console.log('Wrote', p, lines.length, 'lines');
}

function isLocalImport(v) {
  return v.startsWith('.') || v.startsWith('/') || v.startsWith('$');
}

function extractImports(src) {
  const imports = [];
  const reImport = /import\s+(?:[^'"\n]+)\s+from\s+['"]([^'"]+)['"]/g;
  const reImportBare = /import\s+['"]([^'"]+)['"]/g;
  const reRequire = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = reImport.exec(src))) imports.push(m[1]);
  while ((m = reImportBare.exec(src))) imports.push(m[1]);
  while ((m = reRequire.exec(src))) imports.push(m[1]);
  // dynamic import(...) calls
  const reDyn = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = reDyn.exec(src))) imports.push(m[1]);
  return Array.from(new Set(imports));
}

function extractCalls(src) {
  // heuristic: capture simple identifier calls like fooBar( or obj.method(
  const calls = new Set();
  const re = /([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    // skip keywords like if, for, while, switch, function
    if (/^(if|for|while|switch|function|return|catch|console|new)$/.test(name)) continue;
    calls.add(name);
  }
  return Array.from(calls);
}

function detectDbUsage(src) {
  const hints = [];
  if (/\b\bdb\b\.|\bdrizzle\b|from\s+\'\$lib\/server\/db\//.test(src)) hints.push('db');
  if (/\.select\(|\.insert\(|\.update\(|\.delete\(|pgvector|vector\(|embedding/.test(src)) hints.push('sql');
  return hints;
}

function detectStoreUsage(src) {
  const hints = [];
  if (/\$state\(|\$derived\(|writable\(|readable\(|get\(|set\(|subscribe\(/.test(src)) hints.push('store');
  return hints;
}

function detectToolUsage(src) {
  const hints = [];
  if (/(mcp|runTool|toolCall|ToolLoopAgent|llama-server|ollama|gemma|qdrant|neo4j|redis)/i.test(src)) hints.push('tool');
  return hints;
}

async function main() {
  ensureOut();
  const files = [];
  for (const p of GLOB_PATHS) {
    const abs = path.join(ROOT, p);
    if (!fs.existsSync(abs)) continue;
    files.push(...walk(abs));
  }

  const fileNodes = [];
  const importEdges = [];
  const callEdges = [];
  const dbEdges = [];
  const toolEdges = [];

  for (const f of files) {
    const rel = path.relative(ROOT, f).replace(/\\/g,'/');
    const src = read(f);
    if (src === null) continue;
    const stat = fs.statSync(f);
    // attach a sourceRef for node (first line) for Parent Atlas mapping
    fileNodes.push({ path: rel, size: stat.size, mtime: stat.mtime.toISOString(), ext: path.extname(f), sourceRef: `${rel}#L1` });

    const imports = extractImports(src);
    for (const imp of imports) {
      importEdges.push({ from: rel, to: imp, local: isLocalImport(imp) });
    }

    const calls = extractCalls(src).slice(0, 200);
    if (calls.length) callEdges.push({ file: rel, calls: calls });

    const db = detectDbUsage(src);
    if (db.length) dbEdges.push({ file: rel, reasons: db });

    const stores = detectStoreUsage(src);
    if (stores.length) toolEdges.push({ file: rel, hints: stores });

    const tools = detectToolUsage(src);
    if (tools.length) toolEdges.push({ file: rel, hints: tools });
  }

  writeJsonl('ast-file-nodes.jsonl', fileNodes);
  writeJsonl('ast-import-edges.jsonl', importEdges);
  writeJsonl('ast-call-edges.jsonl', callEdges);
  writeJsonl('ast-db-edges.jsonl', dbEdges);
  writeJsonl('ast-tool-edges.jsonl', toolEdges);

  const summary = {
    generatedAt: new Date().toISOString(),
    filesScanned: fileNodes.length,
    importEdges: importEdges.length,
    callEntries: callEdges.length,
    dbEdges: dbEdges.length,
    toolEntries: toolEdges.length
  };
  fs.writeFileSync(path.join(OUT_DIR, 'ast-topology-summary.json'), JSON.stringify(summary, null, 2));
  console.log('AST topology dry-run complete. Summary:', summary);
}

function normalizeRel(p) {
  return p.replace(/\\/g, '/');
}

function buildFileSet(fileNodes) {
  const s = new Set();
  for (const f of fileNodes) s.add(normalizeRel(f.path));
  return s;
}

function tryResolveCandidates(baseDir, spec, fileSet) {
  const exts = ['','.ts','.js','.mjs','.mts','.svelte','.tsx','.jsx'];
  const candidates = [];
  // absolute or relative path resolved
  const candidateBase = path.resolve(ROOT, baseDir, spec);

  // If spec already has an extension (e.g. .js), also try the same path without that extension
  const specExt = path.extname(spec);
  const candidateBases = [candidateBase];
  if (specExt) {
    const withoutExt = candidateBase.slice(0, -specExt.length);
    candidateBases.push(withoutExt);
  }

  // For each candidate base, try with common extensions and index files
  for (const base of candidateBases) {
    for (const ext of exts) {
      candidates.push(normalizeRel(path.relative(ROOT, base + ext)));
      candidates.push(normalizeRel(path.relative(ROOT, path.join(base, 'index' + ext))));
    }
  }

  // Filter unique
  return Array.from(new Set(candidates)).filter(c => fileSet.has(c));
}

function resolveImportsAndWrite(importEdges, fileNodes) {
  const fileSet = buildFileSet(fileNodes);
  const resolved = [];
  const unresolved = [];
  const externalPackages = {};
  const localHubs = {};

  for (const e of importEdges) {
    const from = e.from;
    // normalize spec: trim, collapse whitespace, and strip inline comments
    // handle malformed imports like "$lib // ..." or bare "$lib"
    let spec = (e.to || '');
    // remove inline // comments
    if (spec.includes('//')) spec = spec.split('//')[0];
    // remove block comments if present
    if (spec.includes('/*')) spec = spec.split('/*')[0];
    // collapse multiple spaces and trim
    spec = spec.replace(/\s+/g, ' ').trim();
    // normalize bare $lib to $lib/ so downstream replacements are consistent
    if (/^\$lib\b/.test(spec) && !spec.startsWith('$lib/')) {
      spec = spec.replace(/^\$lib\b\s*\/?/, '$lib/');
    }
    let classification = 'package_external';
    let resolvedPath = null;
    let sourceRefEdge = `${from}#L1`;
    let targetSourceRef = null;
    let confidence = 0.5;

    // detect framework-generated $types imports and Windows path pollution early
    const specBase = spec.split('?')[0].split('#')[0];
    if (/\$types(\.js)?$/.test(specBase) || specBase.endsWith('/$types') || specBase.endsWith('/$types.js')) {
      classification = 'framework_virtual';
      confidence = 0.99;
      resolvedPath = null;
    }
    // Windows path pollution detection
    else if (/\bUsers\b|\bjames\b/i.test(spec)) {
      classification = 'path_parse_error';
      confidence = 0.95;
    }

    // Soft-ignore/generated noise when either the importer (`from`) or the spec references
    // build/framework outputs. These should not pollute the unresolved set.
    const genNoisePattern = /(\.svelte-kit|\.vite|node_modules|\/build\/|\/dist\/)/;
    if (genNoisePattern.test(from) || genNoisePattern.test(spec)) {
      classification = 'generated_ignored';
      confidence = 0.99;
      resolvedPath = null;
    }

    if (spec.startsWith('.') || spec.startsWith('/')) {
      // relative/local
      const baseDir = path.dirname(from);
      const found = tryResolveCandidates(baseDir, spec, fileSet);
      if (found.length) {
        resolvedPath = found[0];
        classification = 'local_resolved';
        localHubs[resolvedPath] = (localHubs[resolvedPath] || 0) + 1;
      } else {
        if (classification === 'framework_virtual' || classification === 'generated_ignored' || classification === 'path_parse_error') {
          // leave classification as-is and do not add to unresolved list
        } else {
          classification = 'local_unresolved';
          unresolved.push({ from, spec });
        }
      }
    } else if (spec.startsWith('$lib')) {
      // Explicit alias: $lib/* -> sveltekit-frontend/src/lib/* (primary mapping)
      // Fallbacks: src/lib/* and sveltekit-frontend/lib/* for alternate layouts
      const candidatesToTry = [
        spec.replace(/^\$lib\//, 'sveltekit-frontend/src/lib/'),
        spec.replace(/^\$lib\//, 'src/lib/'),
        spec.replace(/^\$lib\//, 'sveltekit-frontend/lib/')
      ];
      let found = [];
      for (const rel of candidatesToTry) {
        found = tryResolveCandidates('', rel, fileSet);
        if (found.length) {
          resolvedPath = found[0];
          classification = 'local_resolved';
          localHubs[resolvedPath] = (localHubs[resolvedPath] || 0) + 1;
          break;
        }
      }
      if (!found.length) {
        if (classification === 'framework_virtual' || classification === 'generated_ignored' || classification === 'path_parse_error') {
          // leave as-is, do not add to unresolved
        } else {
          classification = 'local_unresolved';
          unresolved.push({ from, spec });
        }
      }
    } else if (spec.startsWith('$app')) {
      classification = 'framework_virtual';
    } else if (spec.startsWith('@/')) {
      // try src/ then sveltekit-frontend/src
      const rel1 = spec.replace(/^@\//, 'src/');
      const rel2 = spec.replace(/^@\//, 'sveltekit-frontend/src/');
      const found1 = tryResolveCandidates('', rel1, fileSet);
      const found2 = tryResolveCandidates('', rel2, fileSet);
      if (found1.length) { resolvedPath = found1[0]; classification = 'local_resolved'; localHubs[resolvedPath] = (localHubs[resolvedPath] || 0) + 1; }
      else if (found2.length) { resolvedPath = found2[0]; classification = 'local_resolved'; localHubs[resolvedPath] = (localHubs[resolvedPath] || 0) + 1; }
      else {
        if (classification === 'framework_virtual' || classification === 'generated_ignored' || classification === 'path_parse_error') {
          // leave as-is
        } else {
          classification = 'local_unresolved';
          unresolved.push({ from, spec });
        }
      }
    } else if (/^virtual:/.test(spec) || /:generated$/.test(spec)) {
      classification = 'generated_ignored';
    } else {
      // package external
      classification = 'package_external';
      externalPackages[spec] = (externalPackages[spec] || 0) + 1;
    }

    // set targetSourceRef and confidence for resolved local edges
    if (resolvedPath) {
      targetSourceRef = `${resolvedPath}#L1`;
      confidence = 0.98;
    }

    const edgeRecord = {
      edgeType: 'IMPORTS',
      from,
      to: spec,
      spec,
      resolved: Boolean(resolvedPath),
      classification,
      sourceRef: sourceRefEdge,
      targetSourceRef,
      confidence
    };

    resolved.push(edgeRecord);
  }

  // write outputs
  writeJsonl('ast-import-edges-resolved.jsonl', resolved);
  writeJsonl('ast-unresolved-imports.jsonl', unresolved);

  // compute summary
  const summary = {
    generatedAt: new Date().toISOString(),
    totalImportEdges: importEdges.length,
    resolvedCount: resolved.filter(r => r.classification === 'local_resolved').length,
    unresolvedCount: unresolved.length,
    packageExternalCount: resolved.filter(r => r.classification === 'package_external').length,
    frameworkVirtualCount: resolved.filter(r => r.classification === 'framework_virtual').length,
    generatedIgnoredCount: resolved.filter(r => r.classification === 'generated_ignored').length,
    pathParseErrorCount: resolved.filter(r => r.classification === 'path_parse_error').length,
    topUnresolvedPrefixes: [],
    topExternalPackages: [],
    topLocalDependencyHubs: []
  };

  // top unresolved prefixes
  const prefixCounts = {};
  for (const u of unresolved) {
    const p = u.spec.split('/')[0]; prefixCounts[p] = (prefixCounts[p]||0)+1;
  }
  summary.topUnresolvedPrefixes = Object.entries(prefixCounts).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([k,v])=>({prefix:k,count:v}));

  summary.topExternalPackages = Object.entries(externalPackages).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([k,v])=>({pkg:k,count:v}));

  summary.topLocalDependencyHubs = Object.entries(localHubs).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([k,v])=>({path:k,count:v}));

  fs.writeFileSync(path.join(OUT_DIR, 'ast-resolution-summary.json'), JSON.stringify(summary, null, 2));
  console.log('Import resolution complete. Summary:', { resolved: summary.resolvedCount, unresolved: summary.unresolvedCount });
  return summary;
}

// Extend main flow to support --resolve-imports
if (process.argv.includes('--resolve-imports')) {
  // re-run main but then resolve imports
  (async () => {
    await main();
    const importEdgesPath = path.join(OUT_DIR, 'ast-import-edges.jsonl');
    const importEdges = fs.readFileSync(importEdgesPath, 'utf8').trim().split('\n').map(l=>JSON.parse(l));
    const fileNodes = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'ast-file-nodes.jsonl'), 'utf8').split('\n').filter(Boolean)[0]);
    // fileNodes in file is many lines; need to read all lines
    const fileNodesAll = fs.readFileSync(path.join(OUT_DIR, 'ast-file-nodes.jsonl'), 'utf8').trim().split('\n').map(l=>JSON.parse(l));
    await resolveImportsAndWrite(importEdges, fileNodesAll);
  })().catch(err=>{ console.error(err); process.exit(1); });
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('build-ast-topology-dry-run.mjs')) {
  if (!process.argv.includes('--resolve-imports')) {
    main().catch(err => { console.error(err); process.exit(1); });
  }
}
