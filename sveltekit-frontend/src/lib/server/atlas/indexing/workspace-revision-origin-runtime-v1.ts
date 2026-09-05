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
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.svelte',
  '.py', '.go', '.rs', '.java', '.kt', '.kts', '.cs',
  '.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp',
  '.sql', '.proto', '.graphql', '.gql',
  '.json', '.jsonl', '.yaml', '.yml', '.toml', '.md', '.mdx',
  '.sh', '.bash', '.zsh', '.ps1', '.psm1',
]);

// Generated receipts are evidence about a workspace, not workspace source.
// Including them would make every audit/report write change workspaceRevision
// and prevent a stable current-source cohort from converging.
const DEFAULT_GENERATED_SOURCE_PREFIXES = ['docs/reports/'] as const;

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

function isGeneratedSourceArtifact(relativePath: string): boolean {
  const normalized = normalizeSourceRef(relativePath).toLowerCase();
  return DEFAULT_GENERATED_SOURCE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function materializeWorkspaceRevisionOriginV1(input: {
  workspaceRoot: string;
  repositoryId: string;
  producerRevision: string;
  generatedAt?: string;
  maxSourceBytes?: number;
  sourceExtensions?: ReadonlySet<string>;
  onProgress?: (progress: { completed: number; total: number; sourceRef: string }) => void;
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

  const trackedOutput = git(workspaceRoot, ['ls-tree', '-r', '-z', 'HEAD']);
  const trackedBlobByPath = new Map<string, string>();
  for (const record of trackedOutput.split('\0').filter(Boolean)) {
    const separator = record.indexOf('\t');
    if (separator < 0) continue;
    const metadata = record.slice(0, separator).split(/\s+/);
    const sourceRef = normalizeSourceRef(record.slice(separator + 1));
    const blobOid = metadata[2];
    if (sourceRef && blobOid) trackedBlobByPath.set(sourceRef, blobOid);
  }
  const trackedAtHead = new Set(trackedBlobByPath.keys());
  const dirtyOutput = git(workspaceRoot, ['diff', '--name-only', '-z', 'HEAD']);
  const dirtyPaths = new Set(dirtyOutput.split('\0').filter(Boolean).map(normalizeSourceRef));
  const currentOutput = git(workspaceRoot, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
  const files = [...new Set(currentOutput
    .split('\0')
    .filter(Boolean)
    .map(normalizeSourceRef)
    .filter((sourceRef) => !isGeneratedSourceArtifact(sourceRef))
    .filter((sourceRef) => isSourceFile(sourceRef, extensions)))]
    .sort();

  const entries: WorkspaceSourceManifestEntryV1[] = [];
  const tracked = new Map<string, boolean>();
  const dirtyByPath = new Map<string, boolean>();
  const skipped: Array<{ sourceRef: string; reason: string }> = [];

  for (const [index, sourceRef] of files.entries()) {
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
      const gitBlobOid = trackedBlobByPath.get(sourceRef) ?? null;
      entries.push({
        sourceRef,
        sourceRevision: revision.sourceRevision,
        contentDigest: revision.contentDigest,
        byteLength: revision.byteLength,
        gitBlobOid,
      });
      tracked.set(sourceRef, isTracked);
      dirtyByPath.set(sourceRef, !isTracked || dirtyPaths.has(sourceRef));
    } catch (error) {
      skipped.push({ sourceRef, reason: error instanceof Error ? error.message : String(error) });
    }
    input.onProgress?.({ completed: index + 1, total: files.length, sourceRef });
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
