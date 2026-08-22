#!/usr/bin/env tsx

import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { deriveCodeSourceRevisionV1 } from '$lib/server/atlas/identity/code-source-revision-v1.js';
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

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.svelte',
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

async function trackedFilesAtHead(): Promise<Set<string>> {
  const output = await git(['ls-tree', '-r', '--name-only', '-z', 'HEAD']);
  return new Set(output.split('\0').filter(Boolean).map((item) => item.replace(/\\/g, '/')));
}

async function currentSourceFiles(): Promise<string[]> {
  const output = await git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
  return [...new Set(output.split('\0').filter(Boolean).map((item) => item.replace(/\\/g, '/')).filter(isSourceFile))].sort();
}

async function baseBlobOid(relativePath: string): Promise<string | null> {
  // `HEAD:path` resolves to the blob object for that path in the base snapshot.
  return gitMaybe(['rev-parse', `HEAD:${relativePath}`]);
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
  const statusPorcelain = await git(['status', '--porcelain=v1', '--untracked-files=all']);
  const dirty = statusPorcelain.length > 0;
  const trackedAtHead = await trackedFilesAtHead();
  const files = await currentSourceFiles();

  const entries: WorkspaceSourceManifestEntryV1[] = [];
  const tracked = new Map<string, boolean>();
  const dirtyByPath = new Map<string, boolean>();
  const skipped: Array<{ sourceRef: string; reason: string }> = [];

  for (const sourceRef of files) {
    const absolute = path.resolve(REPO_ROOT, sourceRef);
    if (absolute !== REPO_ROOT && !absolute.startsWith(`${REPO_ROOT}${path.sep}`)) {
      skipped.push({ sourceRef, reason: 'PATH_OUTSIDE_REPOSITORY' });
      continue;
    }
    try {
      const info = await stat(absolute);
      if (!info.isFile()) {
        skipped.push({ sourceRef, reason: 'NOT_REGULAR_FILE' });
        continue;
      }
      if (info.size > MAX_SOURCE_BYTES) {
        skipped.push({ sourceRef, reason: 'SOURCE_TOO_LARGE' });
        continue;
      }
      const bytes = await readFile(absolute);
      // The existing source-revision contract is defined over UTF-8 source.
      const source = bytes.toString('utf8');
      if (!Buffer.from(source, 'utf8').equals(bytes)) {
        skipped.push({ sourceRef, reason: 'NOT_VALID_UTF8_SOURCE' });
        continue;
      }
      const revision = deriveCodeSourceRevisionV1(source);
      const isTracked = trackedAtHead.has(sourceRef);
      const blobOid = isTracked ? await baseBlobOid(sourceRef) : null;
      entries.push({
        sourceRef,
        sourceRevision: revision.sourceRevision,
        contentDigest: revision.contentDigest,
        byteLength: revision.byteLength,
        gitBlobOid: blobOid,
      });
      tracked.set(sourceRef, isTracked);
      if (!isTracked || !blobOid) {
        dirtyByPath.set(sourceRef, true);
      } else {
        // Compare actual working-tree bytes to the base blob by asking Git to
        // hash the current file as it would be stored for this path. This keeps
        // Git attributes/clean filters on the provenance side only.
        const workingBlob = await gitMaybe(['hash-object', '--path', sourceRef, sourceRef]);
        dirtyByPath.set(sourceRef, workingBlob !== blobOid);
      }
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

  const report = {
    schema: 'atlas.workspace-source-binding-observation.v1',
    status: 'ORIGIN_CANDIDATE_OBSERVED',
    readOnly: true,
    canonicalWriteAttempted: false,
    canonicalAuthority: false,
    repositoryRoot: REPO_ROOT,
    record: built.record,
    bindings,
    skipped,
    counts: {
      enumeratedSourceFiles: files.length,
      boundSources: bindings.length,
      skippedSources: skipped.length,
      trackedAtBaseCommit: bindings.filter((item) => item.trackedAtBaseCommit).length,
      dirtyRelativeToBaseCommit: bindings.filter((item) => item.dirtyRelativeToBaseCommit).length,
    },
    nextGate: 'PERSISTENCE_OWNER_AND_WRITE_READBACK_CANARY_REQUIRED',
  };

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    workspaceRevision: built.record.workspaceRevision,
    sourceCount: built.record.sourceCount,
    dirty: built.record.dirty,
    skipped: skipped.length,
    canonicalWriteAttempted: false,
    output: path.relative(REPO_ROOT, OUT),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
