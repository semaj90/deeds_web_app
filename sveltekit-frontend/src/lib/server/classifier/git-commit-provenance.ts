/**
 * Git-based commit provenance evidence adapter for `code-symbol-provenance.ts`.
 *
 * Genuinely new evidence source — NOT a reuse of an existing one. `atlas_source_refs.commit_sha`
 * (drizzle: `sveltekit-frontend/src/lib/server/db/schema-postgres.ts`) already exists in schema
 * but is 0% populated (0/22,487 live rows, confirmed 2026-08-25) — unusable today. Git itself is
 * the one real, live, already-available evidence source for per-file commit authorship in this
 * repository, so this adapter reads it directly via `execFileSync('git', ...)`, matching the
 * existing pattern in `atlas/repository-provenance-workflow.ts`.
 *
 * Read-only: never writes to git or the database.
 */

import { execFileSync } from 'node:child_process';
import type { CommitProvenanceEvidence } from './code-symbol-provenance.js';

export interface GitCommitProvenanceOptions {
  /** Repo root to run git from. Defaults to the current working directory. */
  cwd?: string;
}

/**
 * Read the most recent commit that touched `filePath` and return its message/author as
 * `CommitProvenanceEvidence`. Returns `{}` (no evidence) on any git failure — an unreadable file,
 * a path outside the repo, or a repo with no commit history for that path — rather than throwing,
 * so callers can treat a lookup failure the same as "no evidence available" and get `unknown`
 * from `classifyCodeSymbolProvenance()`, never a crash.
 */
export function readGitCommitProvenance(
  filePath: string,
  options: GitCommitProvenanceOptions = {},
): CommitProvenanceEvidence {
  try {
    // %an = author name, %ae = author email, %B = raw commit message body (includes trailers)
    const raw = execFileSync(
      'git',
      ['log', '-1', '--format=%an%x1f%ae%x1f%B', '--', filePath],
      { cwd: options.cwd, encoding: 'utf8', timeout: 5000 },
    ).trim();
    if (!raw) return {};

    const [authorName, authorEmail, ...messageParts] = raw.split('\x1f');
    const commitMessage = messageParts.join('\x1f').trim();
    if (!authorName && !authorEmail && !commitMessage) return {};

    return {
      authorName: authorName || undefined,
      authorEmail: authorEmail || undefined,
      commitMessage: commitMessage || undefined,
    };
  } catch {
    return {};
  }
}
