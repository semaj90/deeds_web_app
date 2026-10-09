import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SKIP_DIRS = new Set(['.git', '.next', '.svelte-kit', '.turbo', '.tmp', 'tmp', 'deeds_labs', 'dist', 'build', 'coverage', 'node_modules', 'target', 'vendor', '.venv', 'venv', '.conda', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.cache', '.idea', '.vscode']);
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const rel = (root, file) => path.relative(root, file).replaceAll('\\', '/') || '.';
const isExcludedDirectoryName = (name) => SKIP_DIRS.has(name)
  || /^\.?(?:venv|virtualenv)(?:[-_.].*)?$/i.test(name)
  || /^\.?(?:python|py)(?:[-_.]?\d+)(?:[-_.].*)?$/i.test(name)
  || /^(?:gsd_archives|archive|archives|backups?)$/i.test(name)
  || /^backup(?:s|[-_].*)$/i.test(name)
  || /-backups?$/i.test(name)
  || /^(?:site-packages|dist-packages)$/i.test(name);

export function findFiles(root, wanted, options = {}) {
  const found = [];
  const excludedRootDirs = (options.excludedRootDirs ?? []).map((value) => value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, ''));
  const visit = (dir) => {
    const relativeDir = rel(root, dir);
    if (excludedRootDirs.some((excluded) => relativeDir === excluded || relativeDir.startsWith(`${excluded}/`))) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!isExcludedDirectoryName(entry.name)) visit(path.join(dir, entry.name));
      } else if (wanted.has(entry.name)) found.push(path.join(dir, entry.name));
    }
  };
  visit(root);
  return found.sort((a, b) => rel(root, a).localeCompare(rel(root, b)));
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function npmPackageEntries(lock, name) {
  const suffix = `node_modules/${name}`;
  const rows = Object.entries(lock?.packages ?? {})
    .filter(([key, value]) => (key === suffix || key.endsWith(`/${suffix}`)) && typeof value?.version === 'string')
    .map(([lockPath, value]) => ({ lockPath, version: value.version }));
  if (!rows.length && lock?.dependencies?.[name]?.version) {
    rows.push({ lockPath: `dependencies.${name}`, version: lock.dependencies[name].version });
  }
  return rows.sort((a, b) => a.lockPath.localeCompare(b.lockPath));
}

function findAncestorLock(packageDir, root) {
  let current = packageDir;
  while (current === root || current.startsWith(`${root}${path.sep}`)) {
    for (const name of ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']) {
      const candidate = path.join(current, name);
      if (fs.existsSync(candidate)) return candidate;
    }
    if (current === root) break;
    current = path.dirname(current);
  }
  return null;
}

function installedPackageVersion(packageDir, name, repoRoot) {
  let current = packageDir;
  while (current === repoRoot || current.startsWith(`${repoRoot}${path.sep}`)) {
    const candidate = path.join(current, 'node_modules', ...name.split('/'), 'package.json');
    if (fs.existsSync(candidate)) {
      try { return { installed: true, installedVersion: readJson(candidate).version ?? null, installedPackageJson: candidate }; }
      catch { return { installed: true, installedVersion: null, installedMetadata: 'UNREADABLE', installedPackageJson: candidate }; }
    }
    if (current === repoRoot) break;
    current = path.dirname(current);
  }
  return { installed: false, installedVersion: null };
}

export function inventoryNpm(root, catalog, options = {}) {
  const manifests = findFiles(root, new Set(['package.json']), options);
  const all = new Map();
  const manifestRows = [];
  for (const manifestPath of manifests) {
    let manifest;
    try { manifest = readJson(manifestPath); }
    catch (error) {
      manifestRows.push({ path: rel(root, manifestPath), status: 'INVALID_JSON', error: String(error.message ?? error) });
      continue;
    }
    const lockPath = findAncestorLock(path.dirname(manifestPath), root);
    let lock = null;
    let lockFormat = null;
    if (lockPath) {
      lockFormat = path.basename(lockPath);
      if (lockFormat === 'package-lock.json') {
        try { lock = readJson(lockPath); } catch { lockFormat = 'package-lock.json:INVALID_JSON'; }
      }
    }
    const manifestRel = rel(root, manifestPath);
    manifestRows.push({
      path: manifestRel,
      name: manifest.name ?? null,
      version: manifest.version ?? null,
      packageManager: manifest.packageManager ?? null,
      lockfile: lockPath ? rel(root, lockPath) : null,
      lockFormat,
      packageJsonSha256: sha256(fs.readFileSync(manifestPath)),
      lockfileSha256: lockPath ? sha256(fs.readFileSync(lockPath)) : null,
    });
    const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
    for (const section of sections) {
      for (const [name, declaredRange] of Object.entries(manifest[section] ?? {})) {
        const versions = all.get(name) ?? { name, declarations: [], catalogSources: [] };
        const lockedEntries = lockFormat === 'package-lock.json' && lock ? npmPackageEntries(lock, name) : [];
        const direct = lockedEntries.filter((row) => row.lockPath === `node_modules/${name}`);
        versions.declarations.push({
          manifest: manifestRel,
          section,
          declaredRange,
          lockfile: lockPath ? rel(root, lockPath) : null,
          lockStatus: lockFormat === 'package-lock.json'
            ? (lockedEntries.length ? (new Set(lockedEntries.map((row) => row.version)).size > 1 ? 'RESOLVED_MULTIPLE' : 'RESOLVED') : 'NOT_RESOLVED')
            : (lockPath ? 'LOCK_PRESENT_PARSER_NOT_IMPLEMENTED' : 'NO_LOCKFILE'),
          lockResolvedVersions: [...new Set(lockedEntries.map((row) => row.version))].sort(),
          lockEntries: lockedEntries,
          lockRootVersion: direct[0]?.version ?? null,
          ...installedPackageVersion(path.dirname(manifestPath), name, root),
          runtimeLoaded: 'NOT_PROBED',
          productionCalled: 'NOT_PROBED',
        });
        all.set(name, versions);
      }
    }
  }
  const sourceByPackage = new Map();
  for (const source of catalog.sources ?? []) for (const name of source.packages ?? []) {
    const items = sourceByPackage.get(name) ?? [];
    items.push(source.id);
    sourceByPackage.set(name, items);
  }
  const packages = [...all.values()].map((item) => ({
    ...item,
    catalogSources: sourceByPackage.get(item.name) ?? [],
  })).sort((a, b) => a.name.localeCompare(b.name));
  return { manifestCount: manifestRows.length, packageDeclarationCount: packages.reduce((n, item) => n + item.declarations.length, 0), uniqueNpmPackages: packages.length, manifests: manifestRows, packages };
}

export function inventoryNonNpmManifests(root, options = {}) {
  const names = new Set(['requirements.txt', 'pyproject.toml', 'go.mod', 'Cargo.toml']);
  return findFiles(root, names, options).map((file) => ({ path: rel(root, file), ecosystem: ({ 'requirements.txt': 'python-requirements', 'pyproject.toml': 'python-project', 'go.mod': 'go', 'Cargo.toml': 'rust' })[path.basename(file)], sha256: sha256(fs.readFileSync(file)), installedInventory: 'REQUIRES_EXPLICIT_ENVIRONMENT_PROBE' }));
}
