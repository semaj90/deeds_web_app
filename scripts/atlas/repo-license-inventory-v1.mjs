#!/usr/bin/env node
/**
 * Read-only repository license inventory. This reports declared metadata and
 * source-document hashes; it is not a legal determination or allow-list.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '../..');
const LICENSE_DOCUMENT = /^(?:licen[cs]e(?:\..*)?|notice(?:\..*)?|copying(?:\..*)?|copyright(?:\..*)?|third[-_ ]party[-_ ]notices?(?:\.(?:txt|md|html))?)$/i;
const PACKAGE_LOCK = /(^|\/)package-lock\.json$/i;
const AUXILIARY_MANIFEST = /(^|\/)(?:pnpm-lock\.yaml|yarn\.lock|cargo\.lock|go\.mod|requirements[^/]*\.txt|pyproject\.toml)$/i;
const REVIEW_LICENSE = /(?:AGPL|GPL|LGPL|SSPL|BUSL|BUSINESS SOURCE|COMMONS CLAUSE|CC-BY-(?:NC|ND))/i;

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizePath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function licenseText(value) {
  if (typeof value === 'string') return value.trim() || null;
  if (Array.isArray(value)) return value.map((item) => licenseText(item)).filter(Boolean).join(' OR ') || null;
  if (value && typeof value === 'object') {
    if (typeof value.type === 'string') return value.type.trim() || null;
    if (typeof value.url === 'string') return `URL:${value.url}`;
  }
  return null;
}

function metadataReviewStatus(expression) {
  if (!expression) return 'REVIEW_REQUIRED_MISSING_LICENSE_METADATA';
  if (/^(?:SEE LICENSE|URL:|BSD\s*$|Apache2\s*$)/i.test(expression)) return 'REVIEW_REQUIRED_NON_SPDX_OR_EXTERNAL_REFERENCE';
  if (REVIEW_LICENSE.test(expression)) return 'REVIEW_REQUIRED_POLICY_SENSITIVE_LICENSE';
  return 'DECLARED_METADATA_ONLY';
}

function npmPackageName(lockPath, packagePath, record) {
  if (typeof record?.name === 'string' && record.name) return record.name;
  const matches = [...packagePath.matchAll(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/g)];
  return matches.at(-1)?.[1] ?? packagePath ?? lockPath;
}

function gitTrackedPaths(repoRoot) {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'buffer', maxBuffer: 128 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`GIT_LS_FILES_FAILED:${String(result.stderr ?? '').slice(0, 300)}`);
  }
  return result.stdout.toString('utf8').split('\0').filter(Boolean).map(normalizePath).sort();
}

async function readTracked(repoRoot, relativePath) {
  const resolvedRoot = path.resolve(repoRoot);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  if (!resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error(`PATH_OUTSIDE_REPOSITORY:${relativePath}`);
  return new Uint8Array(await readFile(resolvedPath));
}

/** Build a deterministic, source-qualified report from tracked repository files only. */
export async function buildRepoLicenseInventoryV1({ repoRoot = DEFAULT_ROOT, trackedPaths = gitTrackedPaths(repoRoot), workspaceRevision = null } = {}) {
  const root = path.resolve(repoRoot);
  const files = [...new Set(trackedPaths.map(normalizePath))].sort();
  const docPaths = files.filter((entry) => LICENSE_DOCUMENT.test(path.posix.basename(entry)));
  const lockPaths = files.filter((entry) => PACKAGE_LOCK.test(entry));
  const packageManifests = files.filter((entry) => /(^|\/)package\.json$/i.test(entry));
  const auxiliaryManifests = files.filter((entry) => AUXILIARY_MANIFEST.test(entry));
  const sourceDocuments = [];
  const dependencyManifests = [];
  const components = [];
  const warnings = [];

  for (const relativePath of docPaths) {
    const bytes = await readTracked(root, relativePath);
    sourceDocuments.push({
      sourceRef: `repo://${workspaceRevision ?? 'WORKTREE'}/${relativePath}#sha256=${sha256(bytes)}`,
      path: relativePath,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      kind: path.posix.basename(relativePath).toLowerCase().startsWith('notice') ? 'NOTICE' : 'LICENSE_DOCUMENT'
    });
  }

  for (const relativePath of packageManifests) {
    let manifest;
    try { manifest = JSON.parse(Buffer.from(await readTracked(root, relativePath)).toString('utf8')); }
    catch (error) { warnings.push({ path: relativePath, code: 'PACKAGE_JSON_PARSE_FAILED', detail: error.message }); continue; }
    const expression = licenseText(manifest.license);
    components.push({
      sourceRef: `repo://${workspaceRevision ?? 'WORKTREE'}/${relativePath}`,
      ecosystem: 'npm-workspace',
      name: manifest.name ?? path.posix.dirname(relativePath),
      version: manifest.version ?? null,
      licenseExpression: expression,
      status: metadataReviewStatus(expression),
      sourcePath: relativePath
    });
  }

  for (const relativePath of lockPaths) {
    const lockBytes = await readTracked(root, relativePath);
    let lock;
    try { lock = JSON.parse(Buffer.from(lockBytes).toString('utf8')); }
    catch (error) { warnings.push({ path: relativePath, code: 'PACKAGE_LOCK_PARSE_FAILED', detail: error.message }); continue; }
    const packages = lock?.packages && typeof lock.packages === 'object' ? lock.packages : {};
    for (const [packagePath, record] of Object.entries(packages)) {
      if (!packagePath.includes('node_modules/') || record?.link === true) continue;
      const expression = licenseText(record?.license);
      const name = npmPackageName(relativePath, packagePath, record);
      components.push({
        sourceRef: `repo://${workspaceRevision ?? 'WORKTREE'}/${relativePath}#packages/${packagePath}`,
        ecosystem: 'npm',
        name,
        version: record?.version ?? null,
        licenseExpression: expression,
        status: metadataReviewStatus(expression),
        sourcePath: relativePath,
        packagePath
      });
    }
  }

  for (const relativePath of auxiliaryManifests) {
    dependencyManifests.push({
      sourceRef: `repo://${workspaceRevision ?? 'WORKTREE'}/${relativePath}`,
      path: relativePath,
      sha256: sha256(await readTracked(root, relativePath)),
      kind: 'DEPENDENCY_MANIFEST_NOT_LICENSE_AUTHORITY'
    });
  }

  const packageComponents = components.filter((row) => row.ecosystem === 'npm');
  const reviewRequired = components.filter((row) => row.status.startsWith('REVIEW_REQUIRED'));
  const noRootLicense = !files.some((entry) => entry.toLowerCase() === 'license' || entry.toLowerCase() === 'license.md');
  if (noRootLicense) warnings.push({ path: 'LICENSE', code: 'ROOT_PROJECT_LICENSE_NOT_FOUND', detail: 'No tracked root LICENSE document was found; package-level licenses do not license the repository as a whole.' });
  if (reviewRequired.length) warnings.push({ code: 'DEPENDENCY_LICENSE_REVIEW_REQUIRED', count: reviewRequired.length, detail: 'Missing, non-standard, external-reference, or policy-sensitive license metadata needs human review.' });

  const statusCounts = {};
  for (const row of components) statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
  let gitHead = workspaceRevision;
  if (!gitHead) {
    const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
    gitHead = result.status === 0 ? result.stdout.trim() : null;
  }

  return {
    schema: 'atlas.repo-license-inventory.v1',
    createdAt: new Date().toISOString(),
    workspaceRevision: gitHead,
    authority: 'TRACKED_REPOSITORY_METADATA_ONLY_HUMAN_REVIEW_REQUIRED',
    summary: {
      trackedFileCount: files.length,
      sourceDocumentCount: sourceDocuments.length,
      dependencyManifestCount: dependencyManifests.length,
      packageManifestCount: packageManifests.length,
      npmLockfileCount: lockPaths.length,
      npmDependencyCount: packageComponents.length,
      npmDeclaredLicenseCount: packageComponents.filter((row) => row.licenseExpression).length,
      npmMissingOrReviewCount: packageComponents.filter((row) => row.status.startsWith('REVIEW_REQUIRED')).length,
      componentMissingOrReviewCount: reviewRequired.length,
      auxiliaryManifestCount: auxiliaryManifests.length,
      statusCounts
    },
    sourceDocuments,
    dependencyManifests,
    components,
    warnings,
    limitations: [
      'This inventory reads tracked files only; ignored models, local assets, virtual environments and downloaded packages are not scanned.',
      'Lockfile license fields are publisher-supplied metadata, not verified license texts or legal conclusions.',
      'Python, Go, Rust and pnpm/yarn manifests are listed as sources but are not fully resolved to transitive package license texts in v1.',
      'A missing repository LICENSE means project-level terms are unresolved; it does not mean the project is public domain.',
      'No external license policy or legal opinion is inferred. Human review is required before distribution, training, or customer delivery.'
    ],
    productionHardeningRecommendations: [
      'Choose and publish the repository-level license before shipping the application; keep third-party notices separate.',
      'Generate an SPDX or CycloneDX SBOM per release from all runtime/build environments, including Python, Go, Rust, containers and model assets.',
      'Fail CI on new missing or policy-sensitive license metadata; require a reviewed exception with package version, source, rationale and expiry.',
      'Keep license source documents immutable by workspace revision and SHA-256; retain per-dependency package URL, version, source lockfile and reviewer decision.',
      'Use PostgreSQL/Drizzle as the revisioned registry; use pgvector only as a cited document-retrieval projection, never as the license decision authority.',
      'The contextual assistant should cite exact sourceRef/path/hash spans, abstain on missing evidence, and route ambiguous or restrictive terms to human counsel.',
      'Keep license-review tasks and objections in a human-owned Kanban workflow with reviewer, rationale, scope, evidence references, and expiry; assistant suggestions cannot close or approve them.',
      'Use temporal validity (effective-from/to and supersedes) for license terms and decisions; preserve the source revision and decision history instead of overwriting the latest status.',
      'Reuse the existing Atlas document/chunk retrieval owners for source text and citations; keep a distinct license decision record so case evidence, embeddings, and task state do not become legal authority.'
    ]
  };
}

async function main() {
  const args = process.argv.slice(2);
  let outputPath = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--out') outputPath = args[++i];
    else if (args[i] === '--help') {
      console.log('Usage: node scripts/atlas/repo-license-inventory-v1.mjs [--out <path>]');
      return;
    } else throw new Error(`UNKNOWN_ARGUMENT:${args[i]}`);
  }
  const report = await buildRepoLicenseInventoryV1();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) {
    const resolved = path.resolve(outputPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, serialized, { encoding: 'utf8', flag: 'w' });
    console.log(JSON.stringify({ reportPath: resolved, summary: report.summary, warningCount: report.warnings.length }));
  } else process.stdout.write(serialized);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
