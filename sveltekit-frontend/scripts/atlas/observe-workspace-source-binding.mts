#!/usr/bin/env tsx

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { deriveCodeSourceRevisionV1 } from '$lib/server/atlas/identity/code-source-revision-v1.js';
import {
  createDigestCacheContext,
  loadDigestCache,
  saveDigestCache,
} from '../../../scripts/atlas/lib/workspace-snapshot-capture-v1.mts';
import { WORKSPACE_DIGEST_CACHE_RACY_MTIME_GUARD_MS } from '../../src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';
import {
  buildWorkspaceRevisionRecordV1,
  buildWorkspaceSourceBindingsV1,
  type WorkspaceSourceManifestEntryV1,
} from '$lib/server/atlas/identity/workspace-source-binding-v1.js';

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const OUT = process.env.ATLAS_WORKSPACE_SOURCE_BINDING_OUT
  ? path.resolve(REPO_ROOT, process.env.ATLAS_WORKSPACE_SOURCE_BINDING_OUT)
  : path.resolve(REPO_ROOT, 'docs/reports/workspace-source-binding-observation.json');
const MAX_SOURCE_BYTES = Number(process.env.ATLAS_WORKSPACE_SOURCE_MAX_BYTES ?? 5 * 1024 * 1024);
const PRODUCER_REVISION = 'atlas.workspace-source-binding-observer.v1';
const DIGEST_CACHE_PATH = path.resolve(REPO_ROOT, '.tmp/atlas/workspace-digest-cache-v1.json');
const DIGEST_CACHE_ENABLED = !['0', 'false', 'off'].includes(
  String(process.env.ATLAS_WORKSPACE_SOURCE_BINDING_DIGEST_CACHE ?? 'on').toLowerCase(),
);
const SOURCE_REFS_FILE = process.env.ATLAS_WORKSPACE_SOURCE_REFS_FILE?.trim() || null;
const MAX_SCOPED_SOURCE_REFS = 64;

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.svelte',
  '.py', '.go', '.rs', '.java', '.kt', '.kts', '.cs',
  '.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp',
  '.sql', '.proto', '.graphql', '.gql',
  '.json', '.jsonl', '.yaml', '.yml', '.toml', '.md', '.mdx',
  '.sh', '.bash', '.zsh', '.ps1', '.psm1',
]);

async function git(args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return result.stdout.trim();
}

async function gitMaybe(args: string[]): Promise<string | null> {
  try {
    const value = await git(args);
    return value || null;
  } catch {
    return null;
  }
}

function isSourceFile(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('.git/')) return false;
  return SOURCE_EXTENSIONS.has(path.extname(normalized).toLowerCase());
}

function sourcePathspecs(sourceRefs: readonly string[] | null): string[] {
  return sourceRefs?.map((sourceRef) => `:(literal)${sourceRef}`) ?? [];
}

function loadRequestedSourceRefs(): string[] | null {
  if (!SOURCE_REFS_FILE) return null;
  const manifestPath = path.resolve(REPO_ROOT, SOURCE_REFS_FILE);
  if (manifestPath !== REPO_ROOT && !manifestPath.startsWith(`${REPO_ROOT}${path.sep}`)) {
    throw new Error('SOURCE_REFS_MANIFEST_OUTSIDE_REPOSITORY');
  }
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const refs = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { sourceRefs?: unknown }).sourceRefs)
      ? (parsed as { sourceRefs: unknown[] }).sourceRefs
      : null;
  if (!refs || refs.length < 1 || refs.length > MAX_SCOPED_SOURCE_REFS) {
    throw new Error(`SOURCE_REFS_MANIFEST_REQUIRES_1_TO_${MAX_SCOPED_SOURCE_REFS}_PATHS`);
  }
  const normalized = refs.map((value) => {
    if (typeof value !== 'string' || !value.trim()) throw new Error('SOURCE_REF_MUST_BE_NONEMPTY_STRING');
    const sourceRef = value.replaceAll('\\', '/');
    if (sourceRef !== value.trim() || sourceRef.startsWith('/') || /^[A-Za-z]:/.test(sourceRef)
      || sourceRef.split('/').some((part) => !part || part === '.' || part === '..')
      || !isSourceFile(sourceRef)) {
      throw new Error(`SOURCE_REF_INVALID_OR_UNSUPPORTED:${value}`);
    }
    return sourceRef;
  });
  if (new Set(normalized).size !== normalized.length) throw new Error('SOURCE_REFS_MANIFEST_DUPLICATE_PATH');
  return normalized.sort();
}

async function trackedBlobOidsAtHead(sourceRefs: readonly string[] | null): Promise<Map<string, string>> {
  const output = await git(['ls-tree', '-r', '-z', 'HEAD', ...(sourceRefs ? ['--', ...sourcePathspecs(sourceRefs)] : [])]);
  const tracked = new Map<string, string>();
  for (const record of output.split('\0').filter(Boolean)) {
    const separator = record.indexOf('\t');
    if (separator < 0) continue;
    const metadata = record.slice(0, separator).split(/\s+/);
    const sourceRef = record.slice(separator + 1).replace(/\\/g, '/');
    const blobOid = metadata[2];
    if (sourceRef && blobOid) tracked.set(sourceRef, blobOid);
  }
  return tracked;
}

async function currentSourceFiles(sourceRefs: readonly string[] | null): Promise<string[]> {
  const output = await git([
    'ls-files', '--cached', '--others', '--exclude-standard', '-z',
    ...(sourceRefs ? ['--', ...sourcePathspecs(sourceRefs)] : []),
  ]);
  const files = [...new Set(output.split('\0').filter(Boolean).map((item) => item.replace(/\\/g, '/')).filter(isSourceFile))].sort();
  if (sourceRefs) {
    const found = new Set(files);
    const missing = sourceRefs.filter((sourceRef) => !found.has(sourceRef));
    if (missing.length) throw new Error(`SOURCE_REFS_NOT_GIT_VISIBLE:${missing.join(',')}`);
  }
  return files;
}

async function main() {
  const gitObjectFormatRaw = await git(['rev-parse', '--show-object-format']);
  if (gitObjectFormatRaw !== 'sha1' && gitObjectFormatRaw !== 'sha256') {
    throw new Error(`UNSUPPORTED_GIT_OBJECT_FORMAT:${gitObjectFormatRaw}`);
  }
  const gitObjectFormat = gitObjectFormatRaw;
  const baseCommitOid = await git(['rev-parse', 'HEAD']);
  const baseTreeOid = await git(['rev-parse', 'HEAD^{tree}']);
  const gitHeadRef = await gitMaybe(['symbolic-ref', '-q', 'HEAD']);
  const requestedSourceRefs = loadRequestedSourceRefs();
  const literalPathspecs = sourcePathspecs(requestedSourceRefs);
  const statusPorcelain = await git([
    'status', '--porcelain=v1', '--untracked-files=all',
    ...(requestedSourceRefs ? ['--', ...literalPathspecs] : []),
  ]);
  const dirty = statusPorcelain.length > 0;
  const trackedBlobByPath = await trackedBlobOidsAtHead(requestedSourceRefs);
  const trackedAtHead = new Set(trackedBlobByPath.keys());
  const dirtyOutput = await git(['diff', '--name-only', '-z', 'HEAD', ...(requestedSourceRefs ? ['--', ...literalPathspecs] : [])]);
  const dirtyPaths = new Set(dirtyOutput.split('\0').filter(Boolean).map((item) => item.replace(/\\/g, '/')));
  const files = await currentSourceFiles(requestedSourceRefs);
  const outputSourceRef = path.relative(REPO_ROOT, OUT).replace(/\\/g, '/');
  const cacheContext = DIGEST_CACHE_ENABLED && !requestedSourceRefs
    ? createDigestCacheContext(REPO_ROOT, 'semaj90/deeds_web_app')
    : null;
  const digestCache = cacheContext ? loadDigestCache(DIGEST_CACHE_PATH, cacheContext) : null;
  const digestCacheStats = { reused: 0, rehashed: 0 };

  const entries: WorkspaceSourceManifestEntryV1[] = [];
  const tracked = new Map<string, boolean>();
  const dirtyByPath = new Map<string, boolean>();
  const skipped: Array<{ sourceRef: string; reason: string }> = [];

  for (const sourceRef of files) {
    // The receipt is derived evidence, not source input. Including it would
    // make each write change the next workspace revision digest.
    if (sourceRef === outputSourceRef) {
      skipped.push({ sourceRef, reason: 'OBSERVATION_OUTPUT_EXCLUDED' });
      continue;
    }
    const absolute = path.resolve(REPO_ROOT, sourceRef);
    if (absolute !== REPO_ROOT && !absolute.startsWith(`${REPO_ROOT}${path.sep}`)) {
      skipped.push({ sourceRef, reason: 'PATH_OUTSIDE_REPOSITORY' });
      continue;
    }
    try {
      const info = await stat(absolute, { bigint: true });
      if (!info.isFile()) {
        skipped.push({ sourceRef, reason: 'NOT_REGULAR_FILE' });
        continue;
      }
      if (info.size > BigInt(MAX_SOURCE_BYTES)) {
        skipped.push({ sourceRef, reason: 'SOURCE_TOO_LARGE' });
        continue;
      }
      const isTracked = trackedAtHead.has(sourceRef);
      const blobOid = trackedBlobByPath.get(sourceRef) ?? null;
      const cached = digestCache?.get(absolute);
      const canReuseCachedDigest = isTracked
        && !dirtyPaths.has(sourceRef)
        && cached !== undefined
        && cached.size === Number(info.size)
        && cached.mtimeNs === String(info.mtimeNs);
      let revision: ReturnType<typeof deriveCodeSourceRevisionV1>;
      if (canReuseCachedDigest && cached) {
        revision = {
          schema: 'atlas.code.source-revision.v1',
          algorithm: 'sha256',
          sourceRevision: cached.sourceRevision,
          contentDigest: cached.contentDigest,
          byteLength: cached.byteLength,
        };
        digestCacheStats.reused += 1;
      } else {
        const bytes = await readFile(absolute);
        // The existing source-revision contract is defined over UTF-8 source.
        const source = bytes.toString('utf8');
        if (!Buffer.from(source, 'utf8').equals(bytes)) {
          skipped.push({ sourceRef, reason: 'NOT_VALID_UTF8_SOURCE' });
          continue;
        }
        revision = deriveCodeSourceRevisionV1(source);
        digestCacheStats.rehashed += 1;
        if (digestCache && Date.now() - Number(info.mtimeMs) > WORKSPACE_DIGEST_CACHE_RACY_MTIME_GUARD_MS) {
          digestCache.set(absolute, {
            size: Number(info.size),
            mtimeNs: String(info.mtimeNs),
            sourceRevision: revision.sourceRevision,
            contentDigest: revision.contentDigest,
            byteLength: revision.byteLength,
          });
        }
      }
      entries.push({
        sourceRef,
        sourceRevision: revision.sourceRevision,
        contentDigest: revision.contentDigest,
        byteLength: revision.byteLength,
        gitBlobOid: blobOid,
      });
      tracked.set(sourceRef, isTracked);
      dirtyByPath.set(sourceRef, !isTracked || dirtyPaths.has(sourceRef));
    } catch (error) {
      skipped.push({ sourceRef, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  const built = buildWorkspaceRevisionRecordV1({
    repositoryId: 'semaj90/deeds_web_app',
    gitObjectFormat,
    baseCommitOid,
    baseTreeOid,
    gitHeadRef,
    dirty,
    entries,
    generatedAt: new Date().toISOString(),
    producerRevision: PRODUCER_REVISION,
  });
  const bindings = buildWorkspaceSourceBindingsV1({
    record: built.record,
    entries: built.entries,
    trackedAtBaseCommit: tracked,
    dirtyRelativeToBaseCommit: dirtyByPath,
    producerRevision: PRODUCER_REVISION,
  });

  const fullWorkspaceObservation = requestedSourceRefs === null;
  const scopeRevision = `sha256:${createHash('sha256').update(JSON.stringify(built.entries.map((entry) => ({
    sourceRef: entry.sourceRef,
    sourceRevision: entry.sourceRevision,
    contentDigest: entry.contentDigest,
    byteLength: entry.byteLength,
    gitBlobOid: entry.gitBlobOid,
  })))).digest('hex')}`;
  const report = {
    schema: fullWorkspaceObservation
      ? 'atlas.workspace-source-binding-observation.v1'
      : 'atlas.workspace-source-scope-observation.v1',
    status: fullWorkspaceObservation ? 'ORIGIN_CANDIDATE_OBSERVED' : 'SOURCE_SCOPE_CANDIDATE_OBSERVED',
    readOnly: true,
    canonicalWriteAttempted: false,
    canonicalAuthority: false,
    repositoryRoot: REPO_ROOT,
    ...(fullWorkspaceObservation
      ? { record: built.record, bindings }
      : {
          scope: {
            kind: 'EXPLICIT_SOURCE_REFS',
            completeWorkspaceInventory: false,
            requestedSourceRefs: requestedSourceRefs,
            sourceScopeRevision: scopeRevision,
            dirty: built.record.dirty,
          },
          baseCommitOid,
          baseTreeOid,
          sourceScopeRevision: scopeRevision,
          sources: bindings.map(({ sourceRef, sourceRevision, contentDigest, byteLength, gitBlobOid, trackedAtBaseCommit, dirtyRelativeToBaseCommit }) => ({
            sourceRef, sourceRevision, contentDigest, byteLength, gitBlobOid, trackedAtBaseCommit, dirtyRelativeToBaseCommit,
          })),
        }),
    skipped,
    counts: {
      enumeratedSourceFiles: files.length,
      boundSources: bindings.length,
      skippedSources: skipped.length,
      trackedAtBaseCommit: bindings.filter((item) => item.trackedAtBaseCommit).length,
      dirtyRelativeToBaseCommit: bindings.filter((item) => item.dirtyRelativeToBaseCommit).length,
    },
    digestCache: {
      enabled: DIGEST_CACHE_ENABLED && fullWorkspaceObservation,
      path: DIGEST_CACHE_ENABLED && fullWorkspaceObservation ? path.relative(REPO_ROOT, DIGEST_CACHE_PATH).replace(/\\/g, '/') : null,
      reusedDigestCount: digestCacheStats.reused,
      rehashedDigestCount: digestCacheStats.rehashed,
      reusedOnlyForCleanTrackedFiles: true,
      canonicalAuthority: false,
    },
    nextGate: fullWorkspaceObservation
      ? 'PERSISTENCE_OWNER_AND_WRITE_READBACK_CANARY_REQUIRED'
      : 'EXACT_SOURCE_INDEX_ADMISSION_AND_READBACK_REQUIRED',
  };

  if (digestCache && cacheContext) saveDigestCache(DIGEST_CACHE_PATH, digestCache, cacheContext);
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    workspaceRevision: fullWorkspaceObservation ? built.record.workspaceRevision : null,
    sourceScopeRevision: fullWorkspaceObservation ? null : scopeRevision,
    sourceCount: built.record.sourceCount,
    dirty: built.record.dirty,
    skipped: skipped.length,
    digestCache: report.digestCache,
    canonicalWriteAttempted: false,
    output: path.relative(REPO_ROOT, OUT),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
