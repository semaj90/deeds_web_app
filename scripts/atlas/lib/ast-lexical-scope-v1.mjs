import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * AST lexical scope analysis over tree-sitter (via @ast-grep/napi, the same tree-sitter grammars the repo already ships).
 * Level of proof: LEXICAL BINDING only. It says which declaration an identifier lexically refers to inside one file. It does NOT prove
 * which external declaration an import denotes, resolve member access, or replace compiler/LSP symbol resolution. Nothing here creates identity.
 *
 * Output spans are UTF-8 byte offsets into the exact source bytes (napi ranges are UTF-16 code-unit indexes and are converted here).
 */
const requireFromFrontend = createRequire(path.resolve(process.cwd(), 'sveltekit-frontend/package.json'));
let napi = null;
const loadNapi = () => (napi ??= requireFromFrontend('@ast-grep/napi'));

export const OUTCOMES = Object.freeze(['LOCAL_BINDING_VERIFIED', 'IMPORT_BINDING_VERIFIED', 'SHADOWED_BINDING', 'GLOBAL_OR_BUILTIN_CANDIDATE', 'MEMBER_ACCESS_UNRESOLVED', 'TYPE_NAMESPACE_UNRESOLVED', 'FREE_IDENTIFIER', 'PARSE_UNSUPPORTED']);
export const GLOBALS = new Set(['Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Date', 'RegExp', 'Error', 'TypeError', 'RangeError', 'JSON', 'Math', 'Buffer', 'URL', 'URLSearchParams', 'Intl', 'console', 'process', 'globalThis', 'window', 'document', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'structuredClone', 'fetch', 'parseInt', 'parseFloat', 'isNaN', 'BigInt', 'undefined', 'NaN', 'Infinity', 'require', 'module', 'exports', 'describe', 'it', 'test', 'expect', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll', 'vi', 'Record', 'Partial', 'Required', 'Readonly', 'Pick', 'Omit', 'Exclude', 'Extract', 'ReturnType', 'Parameters', 'Awaited', 'NonNullable', 'unknown', 'any', 'never']);

function utf16ToByteTable(source) {
  const table = new Uint32Array(source.length + 1);
  for (let i = 0; i < source.length; i++) {
    const cu = source.charCodeAt(i);
    const width = cu < 0x80 ? 1 : cu < 0x800 ? 2 : cu >= 0xd800 && cu <= 0xdbff ? 4 : cu >= 0xdc00 && cu <= 0xdfff ? 0 : 3;
    table[i + 1] = table[i] + width;
  }
  return table;
}

const FUNCTION_KINDS = new Set(['function_declaration', 'generator_function_declaration', 'function_expression', 'function', 'generator_function', 'arrow_function', 'method_definition']);
const PATTERN_PASSTHROUGH = new Set(['object_pattern', 'array_pattern', 'rest_pattern', 'required_parameter', 'optional_parameter', 'formal_parameters', 'pair_pattern', 'assignment_pattern', 'object_assignment_pattern']);

class Scope {
  constructor(kind, parent, node) { this.kind = kind; this.parent = parent; this.node = node; this.values = new Map(); this.types = new Map(); }
  functionScope() { let s = this; while (s.parent && !['function', 'module'].includes(s.kind)) s = s.parent; return s; }
}

export function analyzeLexicalScopes({ source, language = 'typescript' }) {
  const lang = { typescript: 'TypeScript', javascript: 'JavaScript', tsx: 'Tsx' }[language];
  if (!lang) return { supported: false, outcome: 'PARSE_UNSUPPORTED', occurrences: [], bindings: [] };
  const { parse, Lang } = loadNapi();
  const root = parse(Lang[lang], source).root();
  if (root.find({ rule: { kind: 'ERROR' } })) return { supported: true, parseErrors: true, occurrences: [], bindings: [], outcome: 'PARSE_UNSUPPORTED' };
  const bytes = utf16ToByteTable(source);
  const span = (node) => { const r = node.range(); return { startByte: bytes[r.start.index], endByte: bytes[r.end.index], line: r.start.line + 1, column: r.start.column }; };
  const key = (node) => { const r = node.range(); return `${r.start.index}:${r.end.index}`; };

  const bindings = []; const declared = new Set(); const pending = []; const scopes = [];
  const declare = (scope, node, kind, namespace = 'values') => {
    const name = node.text();
    declared.add(key(node));
    const b = { name, kind, ...span(node), scopeKind: scope.kind, scopeStart: bytes[scope.node.range().start.index] };
    bindings.push(b);
    (namespace === 'values' ? scope.values : scope.types).set(name, b);
    if (namespace === 'both') { scope.values.set(name, b); scope.types.set(name, b); }
    return b;
  };
  const patternNames = (node, out = []) => {
    const k = node.kind();
    if (k === 'identifier' || k === 'shorthand_property_identifier_pattern') out.push(node);
    else if (k === 'assignment_pattern' || k === 'object_assignment_pattern') { const left = node.field('left'); if (left) patternNames(left, out); }
    else if (k === 'pair_pattern') { const value = node.field('value'); if (value) patternNames(value, out); }
    else if (k === 'required_parameter' || k === 'optional_parameter') { const p = node.field('pattern') ?? node.children().find((c) => !['type_annotation', 'accessibility_modifier'].includes(c.kind())); if (p) patternNames(p, out); }
    else if (PATTERN_PASSTHROUGH.has(k)) for (const c of node.children()) patternNames(c, out);
    return out;
  };

  const walk = (node, scope) => {
    const k = node.kind();
    switch (k) {
      case 'import_statement': {
        for (const id of node.findAll({ rule: { any: [{ kind: 'identifier', inside: { kind: 'import_clause', stopBy: { kind: 'named_imports' } } }, { kind: 'identifier', inside: { kind: 'namespace_import' } }] } })) if (!declared.has(key(id))) declare(scope, id, 'import');
        for (const spec of node.findAll({ rule: { kind: 'import_specifier' } })) {
          const alias = spec.field('alias'); const name = spec.field('name');
          const target = alias ?? name; if (target && !declared.has(key(target))) declare(scope, target, 'import');
          if (alias && name) declared.add(key(name)); // the imported name is a module export name, not a local reference
        }
        return;
      }
      case 'function_declaration': case 'generator_function_declaration': {
        const name = node.field('name'); if (name) declare(scope, name, 'function');
        break;
      }
      case 'class_declaration': case 'abstract_class_declaration': {
        const name = node.field('name'); if (name) declare(scope, name, 'class', 'both');
        break;
      }
      case 'interface_declaration': case 'type_alias_declaration': { const name = node.field('name'); if (name) declare(scope, name, 'type', 'types'); break; }
      case 'enum_declaration': { const name = node.field('name'); if (name) declare(scope, name, 'enum', 'both'); break; }
      case 'lexical_declaration': case 'variable_declaration': {
        const isVar = k === 'variable_declaration' || node.children()[0]?.text() === 'var';
        const target = isVar ? scope.functionScope() : scope;
        for (const decl of node.children().filter((c) => c.kind() === 'variable_declarator')) {
          const name = decl.field('name'); if (name) for (const id of patternNames(name)) declare(target, id, isVar ? 'var' : node.children()[0]?.text() ?? 'const');
        }
        break;
      }
      default: break;
    }
    if (FUNCTION_KINDS.has(k) || k === 'catch_clause' || k === 'statement_block' || k === 'for_statement' || k === 'for_in_statement' || k === 'class_body') {
      const kind = FUNCTION_KINDS.has(k) ? 'function' : k === 'class_body' ? 'class' : 'block';
      const inner = new Scope(kind, scope, node); scopes.push(inner);
      if (FUNCTION_KINDS.has(k)) {
        const own = node.field('name'); if (own && (k === 'function_expression' || k === 'function' || k === 'generator_function')) declare(inner, own, 'function');
        const params = node.field('parameters'); const single = node.field('parameter');
        for (const p of params ? patternNames(params) : single ? patternNames(single) : []) declare(inner, p, 'parameter');
      }
      if (k === 'for_in_statement') { const left = node.field('left'); const declKind = node.field('kind')?.text(); if (left && declKind) for (const id of patternNames(left)) declare(declKind === 'var' ? inner.functionScope() : inner, id, declKind); }
      if (k === 'catch_clause') { const p = node.field('parameter'); if (p) for (const id of patternNames(p)) declare(inner, id, 'catch'); }
      for (const c of node.children()) walk(c, inner);
      return;
    }
    if (k === 'identifier' || k === 'type_identifier' || k === 'shorthand_property_identifier' || k === 'property_identifier') pending.push({ node, scope, kind: k });
    for (const c of node.children()) walk(c, scope);
  };

  const moduleScope = new Scope('module', null, root); scopes.push(moduleScope);
  for (const c of root.children()) walk(c, moduleScope);

  const occurrences = [];
  for (const { node, scope, kind } of pending) {
    if (declared.has(key(node))) continue;
    const parent = node.parent();
    const name = node.text();
    const base = { name, ...span(node), nodeKind: kind, parentKind: parent?.kind() ?? null };
    if (kind === 'property_identifier') {
      if (parent?.kind() === 'member_expression') occurrences.push({ ...base, outcome: 'MEMBER_ACCESS_UNRESOLVED' });
      continue; // object keys, method names, class members are not references
    }
    if (parent && ['import_specifier', 'export_specifier', 'labeled_statement', 'break_statement', 'continue_statement'].includes(parent.kind()) && kind === 'identifier' && parent.kind() !== 'export_specifier') continue;
    const table = kind === 'type_identifier' ? 'types' : 'values';
    let hit = null; const chain = [];
    for (let s = scope; s; s = s.parent) { const b = s[table].get(name) ?? (kind === 'type_identifier' ? s.values.get(name) : null); if (b) { chain.push({ binding: b, scopeKind: s.kind }); hit ??= b; } }
    if (hit) {
      const outer = chain.slice(1);
      const outcome = hit.kind === 'import' ? 'IMPORT_BINDING_VERIFIED' : outer.length > 0 ? 'SHADOWED_BINDING' : 'LOCAL_BINDING_VERIFIED';
      occurrences.push({ ...base, outcome, bindingKind: hit.kind, bindingStartByte: hit.startByte, shadows: outer.length ? outer.map((o) => o.binding.kind) : undefined });
    } else if (GLOBALS.has(name)) occurrences.push({ ...base, outcome: 'GLOBAL_OR_BUILTIN_CANDIDATE' });
    else occurrences.push({ ...base, outcome: kind === 'type_identifier' ? 'TYPE_NAMESPACE_UNRESOLVED' : 'FREE_IDENTIFIER' });
  }
  occurrences.sort((a, b) => a.startByte - b.startByte || a.endByte - b.endByte);
  return { supported: true, parseErrors: false, scopeCount: scopes.length, bindings, occurrences };
}

/** Independent span readback against the exact source bytes. */
export function verifySpans(sourceBytes, items) {
  let ok = 0; const bad = [];
  for (const it of items) { if (sourceBytes.subarray(it.startByte, it.endByte).toString('utf8') === it.name) ok++; else bad.push({ name: it.name, startByte: it.startByte }); }
  return { checked: items.length, ok, bad };
}
