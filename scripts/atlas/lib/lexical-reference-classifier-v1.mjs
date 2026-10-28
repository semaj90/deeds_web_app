/**
 * Lexical classification of a call/reference occurrence (pure, text-only). This is a HEURISTIC over source text, not a compiler scope
 * analysis: it separates member access, imported bindings, top-level local declarations, possible shadowing, and JS/test globals,
 * so unresolved names are not all treated as the same thing. Nothing here is canonical or creates identity.
 *
 * classify({ source, line (1-based), column (0-based), name, importBindings: Map(local -> {specifier, imported, kind}), enclosing: {startLine,endLine} })
 */
export const KNOWN_GLOBALS = Object.freeze(new Set([
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Date', 'RegExp', 'Error', 'TypeError', 'JSON', 'Math', 'Buffer', 'URL', 'Intl',
  'console', 'process', 'globalThis', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'structuredClone', 'fetch', 'parseInt', 'parseFloat', 'isNaN', 'BigInt',
  'describe', 'it', 'test', 'expect', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll', 'vi', 'require', 'import', 'super', 'this',
]));

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function topLevelDeclarations(source) {
  const names = new Set();
  const re = /^(?:export\s+)?(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
  for (let m = re.exec(source); m; m = re.exec(source)) names.add(m[1]);
  return names;
}

export function classifyOccurrence({ source, line, column, name, importBindings, enclosing }) {
  const lines = source.split('\n');
  const text = lines[line - 1] ?? '';
  const before = text.slice(0, column);
  if (/(\.|\?\.)\s*$/.test(before)) return { kind: 'MEMBER_ACCESS', resolvable: false };
  const bodyText = enclosing ? lines.slice(enclosing.startLine - 1, enclosing.endLine).join('\n') : text;
  const nameRe = escapeRe(name);
  // Possible shadowing inside the enclosing chunk: a local declaration, destructuring or parameter of the same name.
  const shadow = new RegExp(`\\b(?:const|let|var)\\s+${nameRe}\\b|\\b(?:const|let|var)\\s*[\\[{][^=;]*\\b${nameRe}\\b[^=;]*[\\]}]\\s*=|\\bfunction\\s+${nameRe}\\b|\\(([^()]*,\\s*)?${nameRe}\\s*(?::[^,)]+)?(?:,[^()]*)?\\)\\s*(?:=>|\\{)`).test(bodyText);
  if (importBindings?.has(name)) return shadow ? { kind: 'IMPORTED_POSSIBLY_SHADOWED', binding: importBindings.get(name), resolvable: false } : { kind: 'IMPORTED', binding: importBindings.get(name), resolvable: true };
  if (shadow) return { kind: 'LOCAL_BINDING_IN_ENCLOSING_SCOPE', resolvable: false };
  if (topLevelDeclarations(source).has(name)) return { kind: 'LOCAL_TOP_LEVEL_DECLARATION', resolvable: true };
  if (KNOWN_GLOBALS.has(name)) return { kind: 'KNOWN_GLOBAL_OR_BUILTIN', resolvable: false };
  return { kind: 'FREE_NAME_UNRESOLVED', resolvable: false };
}
