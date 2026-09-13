import crypto from 'node:crypto';

export const WHOLE_CODEBASE_SOURCE_EXCLUSION_POLICY_REVISION =
  'atlas.whole-codebase-source-exclusions.2026-09-13.v1';

// Explicit negative globs remain authoritative even when the caller uses -uuu.
// Keep these path-shaped so nested copies are pruned rather than relying on
// .gitignore/.rgignore semantics that -u deliberately disables.
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
]);

export const REQUIRED_RECURRENCE_EXCLUSION_CLASSES = Object.freeze({
  target: ['**/target/**'],
  pythonRuntime: ['**/.python311/**', '**/python311/**', '**/.venv/**', '**/venv/**', '**/__pycache__/**'],
  backup: ['**/backups/**', '**/backup/**', '**/*-backup/**', '**/*_backup/**', '**/archive-copy/**', '**/archive-copy-old/**'],
  generatedBuild: ['**/dist/**', '**/build/**', '**/coverage/**', '**/.svelte-kit/**', '**/.vite/**', '**/.next/**', '**/generated/**', '**/.generated/**'],
  worktreeDuplicate: ['**/.worktrees/**', '**/worktrees/**', '**/workspace-source-snapshots/**'],
  externalDependency: ['**/node_modules/**'],
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
