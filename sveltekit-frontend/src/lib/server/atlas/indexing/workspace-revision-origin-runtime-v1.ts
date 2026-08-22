import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { deriveCodeSourceRevisionV1 } from '../identity/code-source-revision-v1.js';
import {
  buildWorkspaceRevisionRecordV1,
  buildWorkspaceSourceBindingsV1,
  type WorkspaceRevisionRecordV1,
  type WorkspaceSourceBindingV1,
  type WorkspaceSourceManifestEntryV1,
} from '../identity/workspace-source-binding-v1.js';

export const WORKSPACE_REVISION_ORIGIN_RUNTIME_REVISION = 'atlas.workspace-revision-origin-runtime.2026-08-21.v1' as const;

const DEFAULT_SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.svelte',
  '.py', '.go', '.rs', '.java', '.kt', '.kts', '.cs',
  '.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp',
  '.sql', '.proto', '.graphql', '.gql',
  '.json', '.jsonl', '.yaml', '.yml', '.toml', '.md', '.mdx',
  '.sh', '.bash', '.zsh', '.ps1', '.psm1',
]);

export type WorkspaceRevisionOriginRuntimeV1 = {
  record: WorkspaceRevisionRecordV1;
  bindings: WorkspaceSourceBindingV1[];
  skipped: Array<{ sourceRef: string; reason: string }>;
  runtimeRevision: typeof WORKSPACE_REVISION_ORIGIN_RUNTIME_REVISION;
};

function git(workspaceRoot: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function gitMaybe(workspaceRoot: string, args: string[]): string | null {
  try {
    const value = git(workspaceRoot, args);
    return value || null;
  } catch {
    return null;
  }
}

function normalizeSourceRef(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function isSourceFile(relativePath: string, extensions: ReadonlySet<string>): boolean {
  const normalized = normalizeSourceRef(relativePath);
  if (!normalized || normalized.startsWith('.git/')) return false;
  return extensions.has(path.extname(normalized).toLowerCase());
}

/**
 * Computes the repository world-state revision from the actual indexed source
 * byte set. Git commit/tree/blob IDs remain provenance anchors only.
 *
 * This is intentionally the same semantic owner as WorkspaceRevisionRecordV1:
 * workspaceRevision = sha256(sorted source manifest). Dirty and untracked
 * source bytes therefore change workspaceRevision even when Git HEAD does not.
 */
export function materializeWorkspaceRevisionOriginV1(input: {
  workspaceRoot: string;
  repositoryId: string;
  producerRevision: string;
  generatedAt?: string;
  maxSourceBytes?: number;
  sourceExtensions?: ReadonlySet<string>;
}): WorkspaceRevisionOriginRuntimeV1 {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const maxSourceBytes = input.maxSourceBytes ?? 5 * 1024 * 1024;
  const extensions = input.sourceExtensions ?? DEFAULT_SOURCE_EXTENSIONS;
  const gitObjectFormatRaw = git(workspaceRoot, ['rev-parse', '--show-object-format']);
  if (gitObjectFormatRaw !== 'sha1' && gitObjectFormatRaw !== 'sha256') {
    throw new Error(`WORKSPACE_REVISION_UNSUPPORTED_GIT_OBJECT_FORMAT:${gitObjectFormatRaw}`);
  }
  const gitObjectFormat = gitObjectFormatRaw;
  const baseCommitOid = git(workspaceRoot, ['rev-parse', 'HEAD']);
  const baseTreeOid = git(workspaceRoot, ['rev-parse', 'HEAD^{tree}']);
  const gitHeadRef = gitMaybe(workspaceRoot, ['symbolic-ref', '-q', 'HEAD']);
  const statusPorcelain = git(workspaceRoot, ['status', '--porcelain=v1', '--untracked-files=all']);
  const dirty = statusPorcelain.length > 0;

  const trackedOutput = git(workspaceRoot, ['ls-tree', '-r', '--name-only', '-z', 'HEAD']);
  const trackedAtHead = new Set(trackedOutput.split('\0').filter(Boolean).map(normalizeSourceRef));
  const currentOutput = git(workspaceRoot, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
  const files = [...new Set(currentOutput
    .split('\0')
    .filter(Boolean)
    .map(normalizeSourceRef)
    .filter((sourceRef) => isSourceFile(sourceRef, extensions)))]
    .sort();

  const entries: WorkspaceSourceManifestEntryV1[] = [];
  const tracked = new Map<string, boolean>();
  const dirtyByPath = new Map<string, boolean>();
  const skipped: Array<{ sourceRef: string; reason: string }> = [];

  for (const sourceRef of files) {
    const absolute = path.resolve(workspaceRoot, sourceRef);
    if (absolute !== workspaceRoot && !absolute.startsWith(`${workspaceRoot}${path.sep}`)) {
      skipped.push({ sourceRef, reason: 'PATH_OUTSIDE_REPOSITORY' });
      continue;
    }
    try {
      const info = statSync(absolute);
      if (!info.isFile()) {
        skipped.push({ sourceRef, reason: 'NOT_REGULAR_FILE' });
        continue;
      }
      if (info.size > maxSourceBytes) {
        skipped.push({ sourceRef, reason: 'SOURCE_TOO_LARGE' });
        continue;
      }
      const bytes = readFileSync(absolute);
      const sourceText = bytes.toString('utf8');
      if (!Buffer.from(sourceText, 'utf8').equals(bytes)) {
        skipped.push({ sourceRef, reason: 'NOT_VALID_UTF8_SOURCE' });
        continue;
      }
      const revision = deriveCodeSourceRevisionV1(sourceText);
      const isTracked = trackedAtHead.has(sourceRef);
      const gitBlobOid = isTracked ? gitMaybe(workspaceRoot, ['rev-parse', `HEAD:${sourceRef}`]) : null;
      entries.push({
        sourceRef,
        sourceRevision: revision.sourceRevision,
        contentDigest: revision.contentDigest,
        byteLength: revision.byteLength,
        gitBlobOid,
      });
      tracked.set(sourceRef, isTracked);
      if (!isTracked || !gitBlobOid) {
        dirtyByPath.set(sourceRef, true);
      } else {
        const workingBlob = gitMaybe(workspaceRoot, ['hash-object', '--path', sourceRef, sourceRef]);
        dirtyByPath.set(sourceRef, workingBlob !== gitBlobOid);
      }
    } catch (error) {
      skipped.push({ sourceRef, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  if (entries.length === 0) throw new Error('WORKSPACE_REVISION_NO_INDEXABLE_SOURCE_FILES');

  const built = buildWorkspaceRevisionRecordV1({
    repositoryId: input.repositoryId,
    gitObjectFormat,
    baseCommitOid,
    baseTreeOid,
    gitHeadRef,
    dirty,
    entries,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    producerRevision: input.producerRevision,
  });
  const bindings = buildWorkspaceSourceBindingsV1({
    record: built.record,
    entries: built.entries,
    trackedAtBaseCommit: tracked,
    dirtyRelativeToBaseCommit: dirtyByPath,
    producerRevision: input.producerRevision,
  });

  return {
    record: built.record,
    bindings,
    skipped,
    runtimeRevision: WORKSPACE_REVISION_ORIGIN_RUNTIME_REVISION,
  };
}
