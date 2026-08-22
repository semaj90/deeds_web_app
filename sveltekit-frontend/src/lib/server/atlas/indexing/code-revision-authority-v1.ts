import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { z } from 'zod';

import { deriveCodeSourceRevisionV1 } from '../identity/code-source-revision-v1.js';

export const CODE_REVISION_AUTHORITY_SCHEMA = 'atlas.code-revision-authority.v1' as const;
export const CODE_REVISION_AUTHORITY_REVISION = 'atlas.code-revision-authority.git-head-plus-source-sha256.v1' as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.string().min(1);

export const codeRevisionAuthorityV1Schema = z.object({
  schema: z.literal(CODE_REVISION_AUTHORITY_SCHEMA),
  authorityRevision: z.literal(CODE_REVISION_AUTHORITY_REVISION),
  workspaceRoot: z.string().min(1),
  workspaceRevision: revision,
  workspaceRevisionKind: z.literal('GIT_COMMIT_SHA'),
  sourceRef: z.string().min(1),
  sourceRevision: revision,
  sourceRevisionKind: z.literal('SHA256_EXACT_UTF8_SOURCE_BYTES'),
  sourceContentDigest: sha256,
  sourceByteLength: z.number().int().nonnegative(),
  workspaceRevisionCreatedByWriter: z.literal(true),
  sourceRevisionCreatedByWriter: z.literal(true),
  callerSuppliedWorkspaceRevisionAccepted: z.literal(false),
  callerSuppliedSourceRevisionAccepted: z.literal(false),
  canonicalWritesAllowed: z.boolean(),
  producerRevision: revision,
  authorityChecksum: sha256,
}).strict();
export type CodeRevisionAuthorityV1 = z.infer<typeof codeRevisionAuthorityV1Schema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function digest(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function normalizeSourceRef(workspaceRoot: string, absolutePath: string): string {
  const relative = path.relative(workspaceRoot, absolutePath).replaceAll('\\', '/').replace(/^\.\//, '');
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error(`CODE_REVISION_SOURCE_OUTSIDE_WORKSPACE:${absolutePath}`);
  }
  return relative;
}

export function resolveGitWorkspaceRevision(input: {
  workspaceRoot: string;
  gitBinary?: string;
}): string {
  const gitBinary = input.gitBinary ?? 'git';
  let value: string;
  try {
    value = execFileSync(gitBinary, ['rev-parse', 'HEAD'], {
      cwd: input.workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (error) {
    throw new Error(`CODE_REVISION_WORKSPACE_GIT_HEAD_UNAVAILABLE:${error instanceof Error ? error.message : String(error)}`);
  }
  if (!/^[a-f0-9]{40,64}$/i.test(value)) {
    throw new Error(`CODE_REVISION_WORKSPACE_GIT_HEAD_INVALID:${value}`);
  }
  return value.toLowerCase();
}

/**
 * Canonical code revision origin candidate.
 *
 * Neither revision coordinate is accepted from the caller. Workspace revision
 * is resolved from Git HEAD inside the writer boundary; source revision is
 * derived from the exact UTF-8 source bytes using CodeSourceRevisionV1.
 */
export function deriveCodeRevisionAuthorityV1(input: {
  workspaceRoot: string;
  absoluteSourcePath: string;
  sourceText: string;
  producerRevision: string;
  canonicalWritesAllowed?: boolean;
  workspaceRevisionResolver?: (workspaceRoot: string) => string;
}): CodeRevisionAuthorityV1 {
  if (!input.sourceText) throw new Error('CODE_REVISION_SOURCE_TEXT_REQUIRED');
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const absoluteSourcePath = path.resolve(input.absoluteSourcePath);
  const sourceRef = normalizeSourceRef(workspaceRoot, absoluteSourcePath);
  const workspaceRevision = (input.workspaceRevisionResolver
    ? input.workspaceRevisionResolver(workspaceRoot)
    : resolveGitWorkspaceRevision({ workspaceRoot })).trim().toLowerCase();
  if (!/^[a-f0-9]{40,64}$/i.test(workspaceRevision)) {
    throw new Error(`CODE_REVISION_WORKSPACE_REVISION_INVALID:${workspaceRevision}`);
  }
  const source = deriveCodeSourceRevisionV1(input.sourceText);

  const payload = {
    schema: CODE_REVISION_AUTHORITY_SCHEMA,
    authorityRevision: CODE_REVISION_AUTHORITY_REVISION,
    workspaceRoot,
    workspaceRevision,
    workspaceRevisionKind: 'GIT_COMMIT_SHA' as const,
    sourceRef,
    sourceRevision: source.sourceRevision,
    sourceRevisionKind: 'SHA256_EXACT_UTF8_SOURCE_BYTES' as const,
    sourceContentDigest: source.contentDigest,
    sourceByteLength: source.byteLength,
    workspaceRevisionCreatedByWriter: true as const,
    sourceRevisionCreatedByWriter: true as const,
    callerSuppliedWorkspaceRevisionAccepted: false as const,
    callerSuppliedSourceRevisionAccepted: false as const,
    canonicalWritesAllowed: input.canonicalWritesAllowed ?? false,
    producerRevision: input.producerRevision,
  };
  return codeRevisionAuthorityV1Schema.parse({
    ...payload,
    authorityChecksum: digest(payload),
  });
}
