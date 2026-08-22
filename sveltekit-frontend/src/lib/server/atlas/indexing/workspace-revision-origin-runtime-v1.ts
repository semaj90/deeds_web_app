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

export const WORKSPACE_REVISION_ORIGIN_RUNTIME_REVISION = 'atlas.workspace-revision-origin-runtime.2026-08-22.v1' as const;
const DEFAULT_EXTENSIONS = new Set([
  '.ts','.tsx','.js','.jsx','.mjs','.cjs','.svelte','.py','.go','.rs','.java','.kt','.kts','.cs',
  '.c','.cc','.cpp','.cxx','.h','.hh','.hpp','.sql','.proto','.graphql','.gql','.json','.jsonl',
  '.yaml','.yml','.toml','.md','.mdx','.sh','.bash','.zsh','.ps1','.psm1',
]);

export type WorkspaceRevisionOriginRuntimeV1 = {
  record: WorkspaceRevisionRecordV1;
  bindings: WorkspaceSourceBindingV1[];
  skipped: Array<{ sourceRef: string; reason: string }>;
  runtimeRevision: typeof WORKSPACE_REVISION_ORIGIN_RUNTIME_REVISION;
};

function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','ignore'], maxBuffer: 128 * 1024 * 1024 }).trim();
}
function maybeGit(root: string, args: string[]): string | null { try { return git(root, args) || null; } catch { return null; } }
function normalize(value: string): string { return value.replaceAll('\\','/').replace(/^\.\//,''); }

/**
 * Sole runtime adapter from repository bytes to WorkspaceRevisionRecordV1.
 * Git OIDs are provenance; workspaceRevision is derived by the merged identity
 * owner from the sorted exact-byte source manifest.
 */
export function materializeWorkspaceRevisionOriginV1(input: {
  workspaceRoot: string;
  repositoryId: string;
  producerRevision: string;
  generatedAt?: string;
  sourceExtensions?: ReadonlySet<string>;
  maxSourceBytes?: number;
}): WorkspaceRevisionOriginRuntimeV1 {
  const root = path.resolve(input.workspaceRoot);
  const extensions = input.sourceExtensions ?? DEFAULT_EXTENSIONS;
  const maxBytes = input.maxSourceBytes ?? 5 * 1024 * 1024;
  const format = git(root, ['rev-parse','--show-object-format']);
  if (format !== 'sha1' && format !== 'sha256') throw new Error(`WORKSPACE_REVISION_UNSUPPORTED_GIT_OBJECT_FORMAT:${format}`);
  const baseCommitOid = git(root, ['rev-parse','HEAD']);
  const baseTreeOid = git(root, ['rev-parse','HEAD^{tree}']);
  const gitHeadRef = maybeGit(root, ['symbolic-ref','-q','HEAD']);
  const dirty = git(root, ['status','--porcelain=v1','--untracked-files=all']).length > 0;
  const tracked = new Set(git(root, ['ls-tree','-r','--name-only','-z','HEAD']).split('\0').filter(Boolean).map(normalize));
  const refs = [...new Set(git(root, ['ls-files','--cached','--others','--exclude-standard','-z'])
    .split('\0').filter(Boolean).map(normalize)
    .filter((ref) => extensions.has(path.extname(ref).toLowerCase())))]
    .sort();

  const entries: WorkspaceSourceManifestEntryV1[] = [];
  const trackedAtBaseCommit = new Map<string, boolean>();
  const dirtyRelativeToBaseCommit = new Map<string, boolean>();
  const skipped: Array<{ sourceRef: string; reason: string }> = [];

  for (const sourceRef of refs) {
    const absolute = path.resolve(root, sourceRef);
    if (!absolute.startsWith(`${root}${path.sep}`)) { skipped.push({ sourceRef, reason: 'PATH_OUTSIDE_REPOSITORY' }); continue; }
    try {
      const info = statSync(absolute);
      if (!info.isFile()) { skipped.push({ sourceRef, reason: 'NOT_REGULAR_FILE' }); continue; }
      if (info.size > maxBytes) { skipped.push({ sourceRef, reason: 'SOURCE_TOO_LARGE' }); continue; }
      const bytes = readFileSync(absolute);
      const sourceText = bytes.toString('utf8');
      if (!Buffer.from(sourceText, 'utf8').equals(bytes)) { skipped.push({ sourceRef, reason: 'NOT_VALID_UTF8_SOURCE' }); continue; }
      const revision = deriveCodeSourceRevisionV1(sourceText);
      const isTracked = tracked.has(sourceRef);
      const gitBlobOid = isTracked ? maybeGit(root, ['rev-parse', `HEAD:${sourceRef}`]) : null;
      entries.push({ sourceRef, sourceRevision: revision.sourceRevision, contentDigest: revision.contentDigest, byteLength: revision.byteLength, gitBlobOid });
      trackedAtBaseCommit.set(sourceRef, isTracked);
      const currentBlob = isTracked ? maybeGit(root, ['hash-object','--path',sourceRef,sourceRef]) : null;
      dirtyRelativeToBaseCommit.set(sourceRef, !isTracked || currentBlob !== gitBlobOid);
    } catch (error) {
      skipped.push({ sourceRef, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  if (entries.length === 0) throw new Error('WORKSPACE_REVISION_NO_INDEXABLE_SOURCE_FILES');

  const built = buildWorkspaceRevisionRecordV1({
    repositoryId: input.repositoryId,
    gitObjectFormat: format,
    baseCommitOid,
    baseTreeOid,
    gitHeadRef,
    dirty,
    entries,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    producerRevision: input.producerRevision,
  });
  return {
    record: built.record,
    bindings: buildWorkspaceSourceBindingsV1({
      record: built.record,
      entries: built.entries,
      trackedAtBaseCommit,
      dirtyRelativeToBaseCommit,
      producerRevision: input.producerRevision,
    }),
    skipped,
    runtimeRevision: WORKSPACE_REVISION_ORIGIN_RUNTIME_REVISION,
  };
}
