import crypto from 'node:crypto';

export const WHOLE_CODEBASE_SOURCE_EXCLUSION_POLICY_REVISION =
  'atlas.whole-codebase-source-exclusions.2026-09-16.v4';

// Explicit negative globs remain authoritative even when the caller uses -uuu.
// Keep these path-shaped so nested copies are pruned rather than relying on
// .gitignore/.rgignore semantics that -u deliberately disables.
//
// 2026-09-16 (v2): merged in 2 entries found live only in
// scripts/atlas/upsert-whole-codebase-atlas-packets.mjs's own hand-rolled
// EXCLUDE_PATTERNS, which independently diverged from this module on the
// same day (2026-09-13) it was first written. Adopting this module verbatim
// without the merge would have silently reintroduced that script's own
// 2026-09-13 qdrant-windows incident (190 atlas_packets rows were a live
// Qdrant RocksDB/WAL storage dir's LOCK/CURRENT/MANIFEST/WAL files, not
// source). See openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/
// tasks.md's "Root-caused the two hygienePass blockers" entry for the full
// two-list comparison. The packet inventory writer now consumes this module;
// its apply path remains quarantined until canonical packet admission is ready.
//
// 2026-09-16 (v4): the pre-merge file-count parity check (old writer list:
// 251,572 files; this module: 119,264) surfaced a real, live, previously
// undiscovered incident of the same shape as qdrant-windows/.python311 above,
// just two orders of magnitude bigger: `.tmp/workspace-source-snapshots/`
// holds 10+ full materialized repo-tree snapshots (139,385 real files) that
// neither list excluded by name -- this module's smaller total was an
// ACCIDENT of `**/workspace-source-snapshots/**` incidentally matching a
// `.tmp/workspace-source-snapshots` path too, not a deliberate safeguard.
// Live `atlas_packets` already has 1,063 junk rows from `.tmp/%` /
// `%workspace-source-snapshots%` source_refs (read-only count, not cleaned
// up here -- operator-gated per this file's own established pattern). Added
// an explicit `.tmp` exclusion so this protection no longer depends on an
// unrelated glob happening to also match.
export const WHOLE_CODEBASE_EXCLUDE_GLOBS = Object.freeze([
  '**/.git/**',
  '**/node_modules/**',
  '**/.svelte-kit/**',
  '**/.vite/**',
  '**/.next/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.cache/**',
  '**/.pytest_cache/**',
  '**/__pycache__/**',
  '**/target/**',
  '**/.python311/**',
  '**/python311/**',
  '**/.venv/**',
  '**/venv/**',
  '**/models/**',
  '**/.opencode/**',
  '**/.claude/**',
  '**/.tmp/**',
  '**/.worktrees/**',
  '**/worktrees/**',
  '**/workspace-source-snapshots/**',
  '**/backups/**',
  '**/backup/**',
  '**/*-backup/**',
  '**/*_backup/**',
  '**/archive-copy/**',
  '**/archive-copy-old/**',
  '**/generated/**',
  '**/.generated/**',
  '**/deeds_labs/**',
  '**/qdrant-windows/**',
  '**/.svelte-error-fixes-backup/**',
]);

export const REQUIRED_RECURRENCE_EXCLUSION_CLASSES = Object.freeze({
  target: ['**/target/**'],
  pythonRuntime: ['**/.python311/**', '**/python311/**', '**/.venv/**', '**/venv/**', '**/__pycache__/**'],
  backup: ['**/backups/**', '**/backup/**', '**/*-backup/**', '**/*_backup/**', '**/archive-copy/**', '**/archive-copy-old/**', '**/.svelte-error-fixes-backup/**'],
  generatedBuild: ['**/dist/**', '**/build/**', '**/coverage/**', '**/.svelte-kit/**', '**/.vite/**', '**/.next/**', '**/generated/**', '**/.generated/**'],
  worktreeDuplicate: ['**/.worktrees/**', '**/worktrees/**', '**/workspace-source-snapshots/**', '**/.tmp/**'],
  externalDependency: ['**/node_modules/**'],
  liveServiceStorage: ['**/qdrant-windows/**'],
});

export function buildRipgrepExcludeArgs() {
  return WHOLE_CODEBASE_EXCLUDE_GLOBS.map((glob) => `--glob=!${glob}`).join(' ');
}

export function exclusionPolicyChecksum() {
  return `sha256:${crypto.createHash('sha256')
    .update(JSON.stringify({
      revision: WHOLE_CODEBASE_SOURCE_EXCLUSION_POLICY_REVISION,
      globs: [...WHOLE_CODEBASE_EXCLUDE_GLOBS],
    }), 'utf8')
    .digest('hex')}`;
}

export function proveRequiredRecurrenceExclusions() {
  const present = new Set(WHOLE_CODEBASE_EXCLUDE_GLOBS);
  const classChecks = Object.fromEntries(
    Object.entries(REQUIRED_RECURRENCE_EXCLUSION_CLASSES)
      .map(([name, globs]) => [name, globs.every((glob) => present.has(glob))]),
  );
  return {
    pass: Object.values(classChecks).every(Boolean),
    classChecks,
  };
}
