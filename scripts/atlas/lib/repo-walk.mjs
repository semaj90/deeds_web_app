import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_IGNORES = new Set([
  '.git', '.svelte-kit', 'node_modules', 'build', 'dist', 'coverage', '.turbo', '.next',
  '__pycache__', '.pytest_cache', '.venv', 'venv', 'target'
]);

const CODE_EXTENSIONS = new Set(['.ts','.mts','.cts','.js','.mjs','.cjs','.svelte','.py','.sql','.json','.md','.yaml','.yml','.toml','.rs','.go']);

export function normalizePath(value) {
  return value.split(path.sep).join('/');
}

export function walkFiles(root, options = {}) {
  const ignores = new Set([...DEFAULT_IGNORES, ...(options.ignores ?? [])]);
  const extensions = options.extensions ? new Set(options.extensions) : CODE_EXTENSIONS;
  const maxFiles = options.maxFiles ?? 250000;
  const out = [];
  const stack = [root];

  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { continue; }
    entries.sort((a,b) => b.name.localeCompare(a.name));
    for (const entry of entries) {
      if (ignores.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) {
        if (extensions && !extensions.has(path.extname(entry.name).toLowerCase())) continue;
        const stat = fs.statSync(full);
        out.push({
          path: normalizePath(path.relative(root, full)),
          fullPath: full,
          extension: path.extname(entry.name).toLowerCase(),
          bytes: stat.size,
          mtimeMs: stat.mtimeMs
        });
        if (out.length >= maxFiles) return out.sort((a,b) => a.path.localeCompare(b.path));
      }
    }
  }
  return out.sort((a,b) => a.path.localeCompare(b.path));
}

export function readTextSafe(filePath, maxBytes = 2_000_000) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    const buffer = fs.readFileSync(filePath);
    if (buffer.includes(0)) return null;
    return buffer.toString('utf8');
  } catch { return null; }
}

export function directoryOf(filePath) {
  const d = path.posix.dirname(normalizePath(filePath));
  return d === '.' ? '' : d;
}
