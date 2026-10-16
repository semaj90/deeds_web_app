export const AST_NODE_STORAGE_PATH_POLICY_V1 = 'ATLAS_AST_NODES_REPO_RELATIVE_LOWERCASE_V1' as const;

export function astNodeStoragePathV1(canonicalSourceRef: string): string | null {
  const relativePath = canonicalSourceRef.replaceAll('\\', '/');
  if (!relativePath || relativePath.includes('\0') || relativePath.includes(':')
    || relativePath.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  return relativePath.toLowerCase();
}

export type AstNodeStoragePathBindingV1 = {
  policy: typeof AST_NODE_STORAGE_PATH_POLICY_V1;
  canonicalSourceRef: string;
  storedRelativePath: string;
};

export function matchesAstNodeStoragePathV1(input: {
  canonicalSourceRef: string;
  storedRelativePath: string;
  pathBinding?: AstNodeStoragePathBindingV1;
}): boolean {
  const expected = astNodeStoragePathV1(input.canonicalSourceRef);
  if (!expected) return false;
  if (!input.pathBinding) return input.storedRelativePath.replaceAll('\\', '/') === input.canonicalSourceRef.replaceAll('\\', '/');
  return input.pathBinding.policy === AST_NODE_STORAGE_PATH_POLICY_V1
    && input.pathBinding.canonicalSourceRef === input.canonicalSourceRef
    && input.pathBinding.storedRelativePath === input.storedRelativePath
    && input.storedRelativePath === expected;
}
