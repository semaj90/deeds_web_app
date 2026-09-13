import { createHash } from 'node:crypto';

export const SOURCE_INVENTORY_HYGIENE_POLICY_REVISION =
  'atlas.canonical-source-inventory-hygiene-policy.2026-09-13.v1' as const;

export type SourceInventoryClassification =
  | 'CANONICAL_SOURCE'
  | 'GENERATED_DERIVED_ARTIFACT'
  | 'BUILD_OUTPUT'
  | 'VENDORED_RUNTIME'
  | 'BACKUP_OR_ARCHIVE'
  | 'WORKTREE_DUPLICATE'
  | 'EXTERNAL_DEPENDENCY'
  | 'UNKNOWN';

export type SnapshotSourceLike = {
  repositoryId?: unknown;
  repositoryRelativePath?: unknown;
  sourceRef?: unknown;
  sourceIdentityKey?: unknown;
  sourceRevision?: unknown;
  contentDigest?: unknown;
  byteLength?: unknown;
};

export type ClassifiedSnapshotSource = {
  source: SnapshotSourceLike;
  sourceIdentityKey: string;
  repositoryRelativePath: string;
  classification: SourceInventoryClassification;
};

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

export function normalizeInventoryPath(value: unknown): string {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .trim();
}

function segments(path: string): string[] {
  return normalizeInventoryPath(path).toLowerCase().split('/').filter(Boolean);
}

function basename(path: string): string {
  const parts = segments(path);
  return parts[parts.length - 1] ?? '';
}

function hasSegment(path: string, names: readonly string[]): boolean {
  const set = new Set(names.map((name) => name.toLowerCase()));
  return segments(path).some((segment) => set.has(segment));
}

function looksLikeBackup(path: string): boolean {
  const parts = segments(path);
  return parts.some((segment) =>
    segment === 'backup'
    || segment === 'backups'
    || segment === 'archive-copy'
    || segment === 'archive-copy-old'
    || /(?:^|[-_.])backup(?:[-_.]|$)/.test(segment)
    || /(?:^|[-_.])bak(?:[-_.]|$)/.test(segment))
    || /(?:^|[-_.])old(?:[-_.]|$)/.test(segment))
    || /(?:^|[-_.])copy(?:[-_.]|$)/.test(segment) && segment.includes('archive'));
}

function looksLikeWorktreeDuplicate(path: string): boolean {
  const parts = segments(path);
  return parts.some((segment) =>
    segment === '.git'
    || segment === '.worktrees'
    || segment === 'worktrees'
    || segment === 'workspace-source-snapshots'
    || /^worktree[-_.]/.test(segment));
}

function looksLikePythonRuntime(path: string): boolean {
  return hasSegment(path, [
    '.python311',
    'python311',
    '.venv',
    'venv',
    '__pycache__',
    '.pytest_cache',
  ]);
}

function looksLikeBuildOutput(path: string): boolean {
  return hasSegment(path, [
    'target',
    'dist',
    'build',
    'coverage',
    '.svelte-kit',
    '.vite',
    '.next',
    '.cache',
    'out',
  ]);
}

function looksLikeExternalDependency(path: string): boolean {
  return hasSegment(path, [
    'node_modules',
  ]);
}

function looksLikeGeneratedArtifact(path: string): boolean {
  const name = basename(path);
  return /\.(?:gguf|safetensors|pt|pth|onnx|dll|exe|so|dylib|pyc|pyo)$/i.test(name)
    || hasSegment(path, ['generated', '.generated']);
}

export function classifyInventoryPath(path: string): SourceInventoryClassification {
  const normalized = normalizeInventoryPath(path);
  if (!normalized) return 'UNKNOWN';
  if (looksLikeWorktreeDuplicate(normalized)) return 'WORKTREE_DUPLICATE';
  if (looksLikePythonRuntime(normalized)) return 'VENDORED_RUNTIME';
  if (looksLikeBuildOutput(normalized)) return 'BUILD_OUTPUT';
  if (looksLikeExternalDependency(normalized)) return 'EXTERNAL_DEPENDENCY';
  if (looksLikeBackup(normalized)) return 'BACKUP_OR_ARCHIVE';
  if (looksLikeGeneratedArtifact(normalized)) return 'GENERATED_DERIVED_ARTIFACT';
  return 'CANONICAL_SOURCE';
}

export function sourceIdentityKey(source: SnapshotSourceLike): string {
  const repositoryId = normalizeInventoryPath(source.repositoryId || 'repo:root');
  const relative = normalizeInventoryPath(source.repositoryRelativePath ?? source.sourceRef);
  return normalizeInventoryPath(source.sourceIdentityKey) || `${repositoryId}:${relative}`;
}

export function classifySnapshotSources(sources: SnapshotSourceLike[]): ClassifiedSnapshotSource[] {
  return sources.map((source) => {
    const repositoryRelativePath = normalizeInventoryPath(source.repositoryRelativePath ?? source.sourceRef);
    return {
      source,
      sourceIdentityKey: sourceIdentityKey(source),
      repositoryRelativePath,
      classification: classifyInventoryPath(repositoryRelativePath),
    };
  });
}

export function canonicalInventoryRecords(classified: ClassifiedSnapshotSource[]) {
  return classified
    .filter((entry) => entry.classification === 'CANONICAL_SOURCE')
    .map((entry) => ({
      sourceIdentityKey: entry.sourceIdentityKey,
      sourceRevision: String(entry.source.sourceRevision ?? ''),
      contentDigest: String(entry.source.contentDigest ?? ''),
      byteLength: Number(entry.source.byteLength ?? 0),
    }))
    .sort((a, b) => a.sourceIdentityKey.localeCompare(b.sourceIdentityKey));
}

export function sourceInventoryChecksum(classified: ClassifiedSnapshotSource[]): string {
  return sha256(JSON.stringify(canonicalInventoryRecords(classified)));
}

export function sourceSelectionChecksum(classified: ClassifiedSnapshotSource[]): string {
  const keys = classified
    .filter((entry) => entry.classification === 'CANONICAL_SOURCE')
    .map((entry) => entry.sourceIdentityKey)
    .sort();
  return sha256(JSON.stringify(keys));
}

export function excludedCountsByReason(classified: ClassifiedSnapshotSource[]) {
  const counts: Record<Exclude<SourceInventoryClassification, 'CANONICAL_SOURCE'>, number> = {
    GENERATED_DERIVED_ARTIFACT: 0,
    BUILD_OUTPUT: 0,
    VENDORED_RUNTIME: 0,
    BACKUP_OR_ARCHIVE: 0,
    WORKTREE_DUPLICATE: 0,
    EXTERNAL_DEPENDENCY: 0,
    UNKNOWN: 0,
  };
  for (const entry of classified) {
    if (entry.classification !== 'CANONICAL_SOURCE') counts[entry.classification] += 1;
  }
  return counts;
}

export function knownJunkMatches(classified: ClassifiedSnapshotSource[]) {
  const canonicalPaths = classified
    .filter((entry) => entry.classification === 'CANONICAL_SOURCE')
    .map((entry) => entry.repositoryRelativePath);
  const count = (predicate: (path: string) => boolean) => canonicalPaths.filter(predicate).length;
  return {
    target: count((path) => hasSegment(path, ['target'])),
    pythonRuntime: count(looksLikePythonRuntime),
    backup: count(looksLikeBackup),
    generatedBuild: count((path) => looksLikeBuildOutput(path) || looksLikeGeneratedArtifact(path)),
    worktreeDuplicate: count(looksLikeWorktreeDuplicate),
  };
}
