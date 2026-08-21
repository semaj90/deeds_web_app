import { execFileSync } from 'node:child_process';
import path from 'node:path';

export type RepositorySourceRevisionStatus =
  | 'SOURCE_REVISION_RESOLVED'
  | 'DIRTY_WORKTREE_UNVERSIONED'
  | 'SOURCE_REVISION_MISSING'
  | 'SOURCE_REVISION_ERROR';

export interface RepositorySourceRevisionReceiptV1 {
  schema: 'atlas.repository-source-revision.v1';
  sourceRef: string;
  normalizedSourceRef: string;
  status: RepositorySourceRevisionStatus;
  sourceRevision: string | null;
  contentHashMaySubstituteForSourceRevision: false;
  canonicalWritesAllowed: false;
  detail: string | null;
}

export type GitRunner = (args: readonly string[]) => string;

function normalizeSourceRef(sourceRef: string): string {
  return sourceRef.trim().replaceAll('\\', '/').replace(/^\.\//, '');
}

export function createGitRunner(repoRoot: string): GitRunner {
  return (args) => execFileSync('git', [...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function resolveRepositorySourceRevision(
  input: { repoRoot: string; sourceRef: string },
  git: GitRunner = createGitRunner(input.repoRoot),
): RepositorySourceRevisionReceiptV1 {
  const normalizedSourceRef = normalizeSourceRef(input.sourceRef);
  const base = {
    schema: 'atlas.repository-source-revision.v1' as const,
    sourceRef: input.sourceRef,
    normalizedSourceRef,
    contentHashMaySubstituteForSourceRevision: false as const,
    canonicalWritesAllowed: false as const,
  };

  if (!normalizedSourceRef || path.isAbsolute(normalizedSourceRef) || normalizedSourceRef.startsWith('../')) {
    return { ...base, status: 'SOURCE_REVISION_ERROR', sourceRevision: null, detail: 'SOURCE_REF_OUTSIDE_REPOSITORY' };
  }

  try {
    // A dirty/untracked file does not correspond to the immutable Git snapshot.
    // Do not launder its bytes into source_revision via a content digest.
    const status = git(['status', '--porcelain=v1', '--untracked-files=all', '--', normalizedSourceRef]);
    if (status.trim()) {
      return { ...base, status: 'DIRTY_WORKTREE_UNVERSIONED', sourceRevision: null, detail: status.trim() };
    }

    try {
      git(['ls-files', '--error-unmatch', '--', normalizedSourceRef]);
    } catch {
      return { ...base, status: 'SOURCE_REVISION_MISSING', sourceRevision: null, detail: 'SOURCE_NOT_TRACKED_AT_HEAD' };
    }

    const head = git(['rev-parse', 'HEAD']).trim();
    if (!/^[a-f0-9]{40,64}$/i.test(head)) {
      return { ...base, status: 'SOURCE_REVISION_ERROR', sourceRevision: null, detail: `INVALID_HEAD:${head}` };
    }

    // Require the path to exist in the same immutable commit we are naming.
    git(['cat-file', '-e', `HEAD:${normalizedSourceRef}`]);
    return { ...base, status: 'SOURCE_REVISION_RESOLVED', sourceRevision: head, detail: null };
  } catch (error) {
    return {
      ...base,
      status: 'SOURCE_REVISION_ERROR',
      sourceRevision: null,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
