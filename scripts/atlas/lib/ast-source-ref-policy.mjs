/**
 * Revisioned AST source-path policy candidates.
 *
 * This is deliberately separate from ast-source-ref-key.mjs. Callers must
 * opt into a policy before using the normalized path for an identity join.
 */
export const AST_SOURCE_REF_POLICY_V1 = 'ACTIVE_APP_RELATIVE_V1';

export function normalizeAstSourceRefForPolicy(value, policy = AST_SOURCE_REF_POLICY_V1) {
  if (policy !== AST_SOURCE_REF_POLICY_V1) throw new Error(`UNSUPPORTED_AST_SOURCE_REF_POLICY:${policy}`);
  let ref = String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+/g, '/').trim();
  if (!ref) return '';
  if (ref.startsWith('$lib/')) return `src/lib/${ref.slice('$lib/'.length)}`;
  if (ref.startsWith('sveltekit-frontend/src/')) return `src/${ref.slice('sveltekit-frontend/src/'.length)}`;
  if (ref.startsWith('sveltekit-frontend/')) return ref.slice('sveltekit-frontend/'.length);
  return ref;
}

export function buildPolicySourceRefKey(sourceRef, nodeKind, qualifiedName, buildKey) {
  const normalized = normalizeAstSourceRefForPolicy(sourceRef);
  return buildKey(normalized, nodeKind, qualifiedName);
}
