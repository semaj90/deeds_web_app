import path from 'node:path';
import { readTextSafe } from './repo-walk.mjs';

const IMPORT_PATTERNS = [
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s+['"]([^'"]+)['"]/g
];

const EXTENSIONS = ['.ts','.mts','.cts','.js','.mjs','.cjs','.svelte','.json'];

function candidates(sourcePath, spec) {
  if (!(spec.startsWith('.') || spec.startsWith('/'))) return [];
  const sourceDir = path.posix.dirname(sourcePath);
  const raw = path.posix.normalize(path.posix.join(sourceDir, spec));
  const out = [raw];
  if (!path.posix.extname(raw)) {
    for (const ext of EXTENSIONS) out.push(raw + ext);
    for (const ext of EXTENSIONS) out.push(path.posix.join(raw, 'index' + ext));
  }
  return out;
}

export function buildImportGraph(files) {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const edges = [];
  const externalImports = new Map();
  for (const file of files) {
    if (!['.ts','.mts','.cts','.js','.mjs','.cjs','.svelte'].includes(file.extension)) continue;
    const text = readTextSafe(file.fullPath);
    if (!text) continue;
    const specs = new Set();
    for (const re of IMPORT_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) specs.add(m[1]);
    }
    for (const spec of specs) {
      let target = null;
      for (const candidate of candidates(file.path, spec)) {
        if (byPath.has(candidate)) { target = candidate; break; }
      }
      if (target) edges.push({ from: file.path, to: target, relation: 'imports' });
      else if (!spec.startsWith('.') && !spec.startsWith('/')) {
        externalImports.set(spec, (externalImports.get(spec) ?? 0) + 1);
      }
    }
  }
  edges.sort((a,b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return {
    edges,
    externalImports: [...externalImports.entries()]
      .sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]))
      .map(([module,count]) => ({ module, count }))
  };
}

export function graphDegrees(files, edges) {
  const degree = new Map(files.map((f) => [f.path, { in:0, out:0 }]));
  for (const edge of edges) {
    if (!degree.has(edge.from)) degree.set(edge.from, { in:0, out:0 });
    if (!degree.has(edge.to)) degree.set(edge.to, { in:0, out:0 });
    degree.get(edge.from).out++;
    degree.get(edge.to).in++;
  }
  return degree;
}
