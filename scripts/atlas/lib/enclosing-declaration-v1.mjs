import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractScriptBlocks } from './svelte-script-scope-v1.mjs';
import { utf8Prefix } from './svelte-template-chunks-v1.mjs';

/**
 * Proposal-only enclosing-declaration finder over tree-sitter (via @ast-grep/napi). Pure and read-only.
 * For a use at a byte span it returns the innermost NAMED function, method or class that lexically contains it, as structure only:
 * { kind, name, qualifiedName, startByte, endByte }. This is NOT symbol identity. Names are never used to join to symbol-version rows;
 * a canonical caller endpoint still needs an exact byte-span match against an admitted symbol-version row (containing-symbol-attribution-v1).
 * Uses with no named enclosing declaration are file/component level. Spans are UTF-8 byte offsets (napi ranges are UTF-16 indexes).
 */
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'sveltekit-frontend');
const requireFromFrontend = createRequire(path.join(frontendRoot, 'package.json'));
let napi = null;
const loadNapi = () => (napi ??= requireFromFrontend('@ast-grep/napi'));

const FUNCTION_VALUE_KINDS = new Set(['arrow_function', 'function_expression', 'function', 'generator_function']);
const NAMED_DECL_KINDS = ['function_declaration', 'generator_function_declaration', 'class_declaration', 'abstract_class_declaration', 'method_definition'];
const LANGUAGES = { typescript: 'TypeScript', javascript: 'JavaScript', tsx: 'Tsx' };

const kindCache = new Map();
// Grammars differ (e.g. TypeScript has no 'function' kind), so keep only kinds the loaded grammar accepts.
function validKindsFor(lang, root) {
  if (!kindCache.has(lang)) {
    const ok = [];
    for (const kind of [...NAMED_DECL_KINDS, ...FUNCTION_VALUE_KINDS]) { try { root.find({ rule: { kind } }); ok.push(kind); } catch { /* kind not in this grammar */ } }
    kindCache.set(lang, ok);
  }
  return kindCache.get(lang);
}

function declarationName(node) {
  const kind = String(node.kind());
  if (NAMED_DECL_KINDS.includes(kind)) return node.field('name')?.text() ?? null;
  if (FUNCTION_VALUE_KINDS.has(kind)) {
    const parent = node.parent();
    const pk = parent ? String(parent.kind()) : '';
    if (pk === 'variable_declarator') return parent.field('name')?.text() ?? null;
    if (pk === 'pair') return parent.field('key')?.text() ?? null;
    if (pk === 'assignment_expression') return parent.field('left')?.text() ?? null;
  }
  return null;
}

export function findDeclarations(source, language = 'typescript') {
  const lang = LANGUAGES[language];
  if (!lang) return { outcome: 'UNSUPPORTED_LANGUAGE', declarations: [] };
  const { parse, Lang } = loadNapi();
  const root = parse(Lang[lang], source).root();
  if (root.find({ rule: { kind: 'ERROR' } })) return { outcome: 'PARSE_ERROR', declarations: [] };
  const prefix = utf8Prefix(source);
  const found = [];
  const validKinds = validKindsFor(lang, root);
  for (const node of root.findAll({ rule: { any: validKinds.map((kind) => ({ kind })) } })) {
    const name = declarationName(node);
    if (!name) continue; // anonymous callbacks are not declarations
    const r = node.range();
    found.push({ kind: String(node.kind()), name, startByte: prefix[r.start.index], endByte: prefix[r.end.index] });
  }
  found.sort((a, b) => a.startByte - b.startByte || b.endByte - a.endByte);
  // qualified names from lexical nesting of the named declarations
  const stack = [];
  for (const d of found) {
    while (stack.length && !(stack[stack.length - 1].startByte <= d.startByte && stack[stack.length - 1].endByte >= d.endByte)) stack.pop();
    d.qualifiedName = [...stack.map((s) => s.name), d.name].join('.');
    stack.push(d);
  }
  return { outcome: 'FOUND', declarations: found };
}

export function findSvelteDeclarations(source) {
  const all = [];
  for (const block of extractScriptBlocks(source)) {
    const r = findDeclarations(block.text, block.language);
    if (r.outcome !== 'FOUND') return { outcome: r.outcome, declarations: [] };
    for (const d of r.declarations) all.push({ ...d, startByte: d.startByte + block.utf8Start, endByte: d.endByte + block.utf8Start });
  }
  all.sort((a, b) => a.startByte - b.startByte || b.endByte - a.endByte);
  return { outcome: 'FOUND', declarations: all };
}

export function enclosingDeclaration(declarations, startByte, endByte) {
  let best = null;
  for (const d of declarations) {
    if (d.startByte <= startByte && d.endByte >= endByte && (best === null || d.endByte - d.startByte < best.endByte - best.startByte)) best = d;
  }
  return best
    ? { status: 'ENCLOSED_PROPOSAL_ONLY', kind: best.kind, name: best.name, qualifiedName: best.qualifiedName, startByte: best.startByte, endByte: best.endByte, canonical: false }
    : { status: 'FILE_OR_COMPONENT_LEVEL', canonical: false };
}
