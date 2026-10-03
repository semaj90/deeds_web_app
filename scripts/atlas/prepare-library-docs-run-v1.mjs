#!/usr/bin/env node
/**
 * Prepare an immutable, timestamped capture run for the existing OKF docs pipeline.
 * This resolves consumer package versions from the explicitly selected npm project,
 * but never claims an unversioned upstream docs page is that package version.
 * It performs no network or datastore writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_BASE = path.join(ROOT, 'docs/.okf/dev/pinned-docs.manifest.json');
const DEFAULT_COORDS = path.join(ROOT, 'docs/.okf/dev/pinned-docs.coordinates.json');
const RUNS = path.join(ROOT, 'docs/.okf/library-docs/runs');

function parseArgs(argv) {
  const out = { repoDir: path.join(ROOT, 'sveltekit-frontend'), base: DEFAULT_BASE, coordinates: DEFAULT_COORDS, asOf: null, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo-dir') out.repoDir = path.resolve(argv[++i] ?? '');
    else if (arg === '--base-manifest') out.base = path.resolve(argv[++i] ?? '');
    else if (arg === '--coordinates') out.coordinates = path.resolve(argv[++i] ?? '');
    else if (arg === '--as-of') out.asOf = argv[++i] ?? null;
    else if (arg === '--dry-run') out.dryRun = true;
    else throw new Error(`UNKNOWN_ARGUMENT:${arg}`);
  }
  if (out.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(out.asOf)) throw new Error('INVALID_AS_OF_DATE');
  return out;
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const readBytes = (file) => fs.readFileSync(file);
const readJson = (file) => JSON.parse(readBytes(file).toString('utf8'));
const safeName = (value) => value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();

function packageEntries(lock, name) {
  const exact = `node_modules/${name}`;
  const entries = Object.entries(lock.packages ?? {})
    .filter(([key, value]) => (key === exact || key.endsWith(`/${exact}`)) && typeof value?.version === 'string')
    .map(([key, value]) => ({ lockPath: key, version: value.version }));
  if (!entries.length && lock.dependencies?.[name]?.version) {
    entries.push({ lockPath: `dependencies.${name}`, version: lock.dependencies[name].version });
  }
  return entries.sort((a, b) => a.lockPath.localeCompare(b.lockPath));
}

function packageSnapshot(repoDir, manifest, coordinates, asOfUTC) {
  const packagePath = path.join(repoDir, 'package.json');
  const lockPath = path.join(repoDir, 'package-lock.json');
  if (!fs.existsSync(packagePath)) throw new Error(`PACKAGE_JSON_NOT_FOUND:${packagePath}`);
  if (!fs.existsSync(lockPath)) throw new Error(`PACKAGE_LOCK_NOT_FOUND:${lockPath}`);
  const packageBytes = readBytes(packagePath);
  const lockBytes = readBytes(lockPath);
  const pkg = JSON.parse(packageBytes.toString('utf8'));
  const lock = JSON.parse(lockBytes.toString('utf8'));
  const declared = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}), ...(pkg.optionalDependencies ?? {}) };
  const rows = [];
  for (const source of manifest.sources ?? []) {
    const runtime = coordinates.sources?.[source.source_id]?.runtime;
    const name = runtime?.kind === 'npm' ? runtime.package : null;
    if (!name) continue;
    const locked = packageEntries(lock, name);
    const topLevelVersion = lock.packages?.[`node_modules/${name}`]?.version ?? lock.dependencies?.[name]?.version ?? null;
    const allVersions = [...new Set(locked.map((item) => item.version))];
    rows.push({
      sourceId: source.source_id,
      product: source.product ?? source.source_id,
      packageName: name,
      declaredDirectly: Object.hasOwn(declared, name),
      declaredRange: declared[name] ?? null,
      resolvedVersionAtLockRoot: topLevelVersion,
      allLockResolvedVersions: allVersions,
      lockEntries: locked,
      status: !locked.length ? 'NOT_RESOLVED_IN_SELECTED_REPO' : allVersions.length > 1 ? 'LOCK_RESOLVED_MULTIPLE_INSTANCES' : 'LOCK_RESOLVED',
      docsVersionQualification: coordinates.sources[source.source_id].versionQualification ?? 'UNSPECIFIED',
      docsVersion: source.product_version ?? null,
      asOfUTC,
    });
  }
  return {
    schema: 'atlas.library-docs-package-lock-snapshot.v1',
    repository: {
      repoDir: path.relative(ROOT, repoDir).replaceAll('\\', '/') || '.',
      packageName: pkg.name ?? null,
      packageVersion: pkg.version ?? null,
      packageJsonSha256: sha256(packageBytes),
      packageLockSha256: sha256(lockBytes),
      lockfileVersion: lock.lockfileVersion ?? null,
    },
    asOfUTC,
    packages: rows,
    packageSnapshotSha256: sha256(JSON.stringify(rows)),
    canonicalAuthority: false,
  };
}

function prepare({ repoDir, base, coordinates, asOf, dryRun }) {
  const manifest = readJson(base);
  const coords = readJson(coordinates);
  const now = new Date();
  const asOfUTC = asOf ?? now.toISOString().slice(0, 10);
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const packageSnapshotData = packageSnapshot(repoDir, manifest, coords, asOfUTC);
  const runKey = sha256(`${sha256(readBytes(base))}\n${packageSnapshotData.repository.packageLockSha256}\n${asOfUTC}`).slice(0, 12);
  const runId = `${timestamp}-${runKey}`;
  const runRelative = `docs/.okf/library-docs/runs/${runId}`;
  const runPath = path.join(ROOT, runRelative);
  const runManifest = structuredClone(manifest);
  runManifest.manifest_revision = `library-docs-${runId}`;
  runManifest.source_snapshot_revision = `library-docs-upstream-${asOfUTC}-${runKey}`;
  runManifest.output_root = '.';
  runManifest.sources = runManifest.sources.map((source) => ({
    ...source,
    output_namespace: `${runRelative}/sources/${safeName(source.source_id)}`,
  }));
  const runCoordinates = structuredClone(coords);
  const result = {
    schema: 'atlas.library-docs-capture-run.v1',
    runId,
    generatedAt: now.toISOString(),
    asOfUTC,
    repoDir: packageSnapshotData.repository.repoDir,
    sourceManifest: path.relative(ROOT, base).replaceAll('\\', '/'),
    sourceManifestSha256: sha256(readBytes(base)),
    coordinatesSha256: sha256(readBytes(coordinates)),
    runPreparerRevision: 'prepare-library-docs-run-v1',
    packageSnapshot: 'package-lock-snapshot.json',
    packageSnapshotSha256: packageSnapshotData.packageSnapshotSha256,
    pageCountPlanned: runManifest.sources.reduce((sum, source) => sum + source.pages.length, 0),
    sources: runManifest.sources.map((source) => ({ sourceId: source.source_id, sourceRevision: source.source_revision, pageCount: source.pages.length })),
    writes: { networkFetch: false, postgres: 0, qdrant: 0, valkey: 0, neo4j: 0 },
    canonicalAuthority: false,
  };
  if (dryRun) return { ...result, status: 'PLAN_ONLY', runPath };
  fs.mkdirSync(RUNS, { recursive: true });
  fs.mkdirSync(runPath, { recursive: false });
  fs.writeFileSync(path.join(runPath, 'manifest.json'), `${JSON.stringify(runManifest, null, 2)}\n`, { flag: 'wx' });
  fs.writeFileSync(path.join(runPath, 'coordinates.json'), `${JSON.stringify(runCoordinates, null, 2)}\n`, { flag: 'wx' });
  fs.writeFileSync(path.join(runPath, 'package-lock-snapshot.json'), `${JSON.stringify(packageSnapshotData, null, 2)}\n`, { flag: 'wx' });
  fs.writeFileSync(path.join(runPath, 'run.json'), `${JSON.stringify({ ...result, status: 'PREPARED_NOT_FETCHED' }, null, 2)}\n`, { flag: 'wx' });
  return { ...result, status: 'PREPARED_NOT_FETCHED', runPath };
}

try {
  const result = prepare(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
