export function isSvelteKitSourcePathV1(relativePath) {
  return relativePath.startsWith('src/') || relativePath.startsWith('sveltekit-frontend/src/');
}

export function canonicalPublishBlockerV1({ requested, canonicalScope, workspaceRevision }) {
  if (!requested) return null;
  if (!canonicalScope) return 'CANONICAL_SCOPE_REQUIRED';
  if (typeof workspaceRevision !== 'string' || workspaceRevision.trim().length === 0) {
    return 'WORKSPACE_REVISION_REQUIRED';
  }
  return null;
}
