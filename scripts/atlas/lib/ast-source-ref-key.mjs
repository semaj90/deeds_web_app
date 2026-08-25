/** Shared structural source-reference key for AST identity joins. */
const KIND_ALIASES = new Map([
  ['interface', 'type'],
  ['interface_declaration', 'type'],
  ['method', 'function'],
  ['method_definition', 'function'],
  ['function_declaration', 'function'],
]);

export function normalizeAstSourceRef(value) {
  return String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '').trim();
}

export function normalizeAstNodeKind(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  return KIND_ALIASES.get(raw) ?? raw;
}

export function normalizeAstQualifiedName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function buildAstSourceRefKey(sourceRef, nodeKind, qualifiedName) {
  const ref = normalizeAstSourceRef(sourceRef);
  const kind = normalizeAstNodeKind(nodeKind);
  const name = normalizeAstQualifiedName(qualifiedName);
  if (!ref || !kind || !name) return null;
  return `${ref}#${kind}:${name}`;
}
