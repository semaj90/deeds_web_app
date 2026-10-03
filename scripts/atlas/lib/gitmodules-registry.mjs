// Shared helper: classify a graphify_execution_file_membership_v2.repository_id value as
// FIRST_PARTY (this project's own authored source) or SUBMODULE (vendored third-party code,
// tracked via git submodule, deliberately out of canonical packet-admission scope per the
// 2026-09-28 operator decision -- see
// openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md,
// "Should git-submodule content ... be packet-admitted" thread).
//
// Used by seal-graph-snapshot-shards-v1.mts, merge-graph-snapshot-shards-v1.mts, and
// audit-canonical-projection-fabric.mjs -- written once here rather than duplicated three times,
// per this repo's own Duplication Prevention rule.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * @param {string} repoRoot absolute path to the repository root (the directory containing .gitmodules)
 * @returns {Set<string>} the exact `path = ...` values declared in .gitmodules
 */
export function readSubmodulePaths(repoRoot) {
  const gitmodulesPath = resolve(repoRoot, '.gitmodules');
  if (!existsSync(gitmodulesPath)) return new Set();
  const content = readFileSync(gitmodulesPath, 'utf8');
  const paths = new Set();
  for (const match of content.matchAll(/^\s*path\s*=\s*(.+?)\s*$/gm)) {
    paths.add(match[1]);
  }
  return paths;
}

/**
 * repository_id values are "repo:<path>", where <path> is either the literal "root" (the main
 * repo itself -- never a submodule path) or the exact .gitmodules `path` value for a submodule.
 * "UNKNOWN" is a deliberate fail-closed default for any repository_id that is neither -- treated
 * the same as FIRST_PARTY by callers (i.e. it counts toward "must be sealed"), so a future
 * repository this classifier doesn't recognize is never silently exempted from the admission bar.
 *
 * @param {string} repositoryId e.g. "repo:root", "repo:claude-mem", "repo:sites/parent-atlas-gateboard"
 * @param {Set<string>} submodulePaths from readSubmodulePaths()
 * @returns {'FIRST_PARTY'|'SUBMODULE'|'UNKNOWN'}
 */
export function classifyRepositoryId(repositoryId, submodulePaths) {
  const strippedPath = repositoryId.replace(/^repo:/, '');
  if (strippedPath === 'root') return 'FIRST_PARTY';
  if (submodulePaths.has(strippedPath)) return 'SUBMODULE';
  return 'UNKNOWN';
}
