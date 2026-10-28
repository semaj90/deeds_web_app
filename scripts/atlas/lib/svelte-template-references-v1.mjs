import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeSvelteScripts, extractScriptBlocks } from './svelte-script-scope-v1.mjs';
import { utf8Prefix } from './svelte-template-chunks-v1.mjs';

/**
 * Proposal-only template-to-script reference resolver for Svelte 5 (pure, read-only, lexical only).
 * Every identifier reference inside a template expression is resolved by scope, never by bare-name guessing:
 *   template-local scopes (each context/index, snippet parameters, {@const}, await value/error, let: directives, expression-local functions)
 *   -> top-level script bindings (import / declaration)  -> store auto-subscription ($name over a script binding)
 *   -> Svelte globals ($$props, $$restProps, $$slots) -> JS/browser builtin candidates -> FREE_IDENTIFIER.
 * Spans are UTF-8 byte offsets in the .svelte file, read back from the exact bytes. It is not compiler or LSP confirmation.
 */
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'sveltekit-frontend');
const compilerRequire = createRequire(path.join(frontendRoot, 'package.json'));
let compiler = null;
const loadCompiler = () => (compiler ??= compilerRequire('svelte/compiler'));

const SVELTE_GLOBALS = new Set(['$$props', '$$restProps', '$$slots']);
const BUILTINS = new Set(['undefined', 'NaN', 'Infinity', 'Math', 'JSON', 'Date', 'Number', 'String', 'Boolean', 'Array', 'Object', 'Promise', 'Map', 'Set', 'Symbol', 'Error', 'RegExp', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'console', 'window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'fetch', 'URL', 'URLSearchParams', 'Intl', 'globalThis', 'structuredClone', 'crypto', 'performance', 'BigInt', 'Uint8Array', 'Float32Array', 'FormData', 'File', 'Blob']);

function patternNames(pattern, out = []) {
  if (!pattern) return out;
  switch (pattern.type) {
    case 'Identifier': out.push(pattern.name); break;
    case 'ObjectPattern': for (const p of pattern.properties) patternNames(p.type === 'RestElement' ? p.argument : p.value, out); break;
    case 'ArrayPattern': for (const e of pattern.elements) patternNames(e, out); break;
    case 'RestElement': patternNames(pattern.argument, out); break;
    case 'AssignmentPattern': patternNames(pattern.left, out); break;
    default: break;
  }
  return out;
}

function declaredInStatements(statements, out) {
  for (const s of statements ?? []) {
    if (s.type === 'VariableDeclaration') for (const d of s.declarations) patternNames(d.id, out);
    else if ((s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') && s.id) out.push(s.id.name);
  }
  return out;
}

export function analyzeSvelteTemplateReferences(source) {
  const sourceBuffer = Buffer.from(source, 'utf8');
  const base = { schema: 'atlas.svelte-template-references.v1', sourceSha256: `sha256:${crypto.createHash('sha256').update(sourceBuffer).digest('hex')}`, utf8ByteLength: sourceBuffer.length, proposalOnly: true, canonicalAuthority: false, lexicalOnly: true };
  let ast;
  try { ast = loadCompiler().parse(source, { modern: true }); } catch (error) { return { ...base, outcome: 'PARSE_ERROR', error: String(error?.code ?? error?.message ?? error).slice(0, 160), references: [] }; }

  const script = analyzeSvelteScripts(source);
  const blocks = extractScriptBlocks(source);
  const scriptTop = new Map(); // name -> binding (component-level)
  for (const b of script.bindings) if (b.scopeKind === 'module' && !scriptTop.has(b.name)) scriptTop.set(b.name, { ...b, scriptBlockIsModule: blocks[b.block]?.module ?? false });

  const prefix = utf8Prefix(source);
  const references = [];
  const scopes = [new Set()];
  const lookupLocal = (name) => scopes.some((s) => s.has(name));
  const withScope = (names, fn) => { scopes.push(new Set(names)); try { fn(); } finally { scopes.pop(); } };

  const record = (name, start, end, context) => {
    const startByte = prefix[start]; const endByte = prefix[end];
    const spanVerified = sourceBuffer.subarray(startByte, endByte).toString('utf8') === name;
    let outcome; let binding = null;
    if (lookupLocal(name)) outcome = 'TEMPLATE_LOCAL_BINDING';
    else if (scriptTop.has(name)) { binding = scriptTop.get(name); outcome = binding.kind === 'import' ? 'SCRIPT_IMPORT_BINDING' : 'SCRIPT_DECLARATION_BINDING'; }
    else if (name.startsWith('$') && !name.startsWith('$$') && scriptTop.has(name.slice(1))) { binding = scriptTop.get(name.slice(1)); outcome = 'STORE_SUBSCRIPTION_CANDIDATE'; }
    else if (SVELTE_GLOBALS.has(name)) outcome = 'SVELTE_GLOBAL';
    else if (BUILTINS.has(name)) outcome = 'GLOBAL_OR_BUILTIN_CANDIDATE';
    else outcome = 'FREE_IDENTIFIER';
    references.push({ name, startByte, endByte, context, outcome, spanVerified, bindingStartByte: binding?.startByte ?? null, bindingKind: binding?.kind ?? null, bindingBlock: binding?.block ?? null });
  };

  const expr = (node, context) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const n of node) expr(n, context); return; }
    switch (node.type) {
      case 'Identifier': record(node.name, node.start, node.end, context); return;
      case 'MemberExpression': expr(node.object, context); if (node.computed) expr(node.property, context); return;
      case 'Property': if (node.computed) expr(node.key, context); expr(node.value, context); return;
      case 'MethodDefinition': case 'PropertyDefinition': if (node.computed) expr(node.key, context); expr(node.value, context); return;
      case 'ArrowFunctionExpression': case 'FunctionExpression': {
        const names = []; for (const p of node.params) patternNames(p, names);
        if (node.type === 'FunctionExpression' && node.id) names.push(node.id.name);
        if (node.body?.type === 'BlockStatement') declaredInStatements(node.body.body, names);
        withScope(names, () => { for (const p of node.params) patternDefaults(p, context); expr(node.body, context); });
        return;
      }
      case 'BlockStatement': { const names = declaredInStatements(node.body, []); withScope(names, () => expr(node.body, context)); return; }
      case 'CatchClause': { const names = patternNames(node.param, []); withScope(names, () => expr(node.body, context)); return; }
      case 'VariableDeclarator': patternDefaults(node.id, context); expr(node.init, context); return;
      case 'FunctionDeclaration': {
        const names = []; for (const p of node.params) patternNames(p, names);
        if (node.body?.type === 'BlockStatement') declaredInStatements(node.body.body, names);
        withScope(names, () => { for (const p of node.params) patternDefaults(p, context); expr(node.body, context); });
        return;
      }
      case 'ClassDeclaration': expr(node.superClass, context); expr(node.body, context); return;
      case 'ForOfStatement': case 'ForInStatement': {
        const names = node.left?.type === 'VariableDeclaration' ? node.left.declarations.flatMap((d) => patternNames(d.id, [])) : [];
        if (node.left?.type !== 'VariableDeclaration') expr(node.left, context);
        expr(node.right, context);
        withScope(names, () => expr(node.body, context)); return;
      }
      case 'ForStatement': {
        const names = node.init?.type === 'VariableDeclaration' ? node.init.declarations.flatMap((d) => patternNames(d.id, [])) : [];
        withScope(names, () => { if (node.init?.type === 'VariableDeclaration') for (const d of node.init.declarations) expr(d.init, context); else expr(node.init, context); expr(node.test, context); expr(node.update, context); expr(node.body, context); }); return;
      }
      case 'LabeledStatement': expr(node.body, context); return;
      case 'BreakStatement': case 'ContinueStatement': return;
      default: break;
    }
    if (typeof node.type === 'string' && node.type.startsWith('TS')) { if (node.expression) expr(node.expression, context); return; }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'metadata' || key === 'leadingComments' || key === 'trailingComments') continue;
      const v = node[key]; if (v && typeof v === 'object') expr(v, context);
    }
  };
  function patternDefaults(pattern, context) {
    if (!pattern) return;
    if (pattern.type === 'AssignmentPattern') { expr(pattern.right, context); patternDefaults(pattern.left, context); }
    else if (pattern.type === 'ObjectPattern') for (const p of pattern.properties) { if (p.type === 'RestElement') patternDefaults(p.argument, context); else { if (p.computed) expr(p.key, context); patternDefaults(p.value, context); } }
    else if (pattern.type === 'ArrayPattern') for (const e of pattern.elements) patternDefaults(e, context);
  }

  const attrValue = (value, context) => { if (value === true || value == null) return; if (Array.isArray(value)) { for (const part of value) if (part.type === 'ExpressionTag') expr(part.expression, context); } else if (value.type === 'ExpressionTag') expr(value.expression, context); };

  const fragment = (frag) => {
    if (!frag) return;
    const nodes = frag.nodes ?? [];
    const names = [];
    for (const n of nodes) {
      if (n.type === 'ConstTag') for (const d of n.declaration.declarations) patternNames(d.id, names);
      else if (n.type === 'SnippetBlock' && n.expression) names.push(n.expression.name);
    }
    withScope(names, () => { for (const n of nodes) node(n); });
  };

  const attributes = (el) => {
    const letNames = [];
    for (const a of el.attributes ?? []) {
      switch (a.type) {
        case 'Attribute': attrValue(a.value, 'attribute'); break;
        case 'SpreadAttribute': expr(a.expression, 'spread'); break;
        case 'AttachTag': expr(a.expression, 'attach'); break;
        case 'BindDirective': case 'OnDirective': case 'ClassDirective': expr(a.expression, `directive:${a.type}`); break;
        case 'StyleDirective': attrValue(a.value, 'style-directive'); break;
        case 'UseDirective': case 'TransitionDirective': case 'AnimateDirective': {
          const prefixLength = a.type === 'UseDirective' ? 4 : a.type === 'AnimateDirective' ? 8 : a.intro && a.outro ? 11 : a.intro ? 3 : 4;
          const rootName = a.name.split('.')[0];
          const start = a.start + prefixLength; // verified by readback inside record(); an unverifiable position is reported, not guessed
          record(rootName, start, start + rootName.length, `directive:${a.type}`);
          if (a.expression) expr(a.expression, `directive:${a.type}`);
          break;
        }
        case 'LetDirective': letNames.push(a.expression ? patternNames(a.expression, []) : [a.name]); break;
        default: break;
      }
    }
    return letNames.flat();
  };

  const node = (n) => {
    if (!n) return;
    switch (n.type) {
      case 'Text': case 'Comment': return;
      case 'ExpressionTag': case 'HtmlTag': expr(n.expression, 'tag'); return;
      case 'RenderTag': expr(n.expression, 'render'); return;
      case 'ConstTag': for (const d of n.declaration.declarations) expr(d.init, 'const'); return;
      case 'DebugTag': for (const i of n.identifiers ?? []) expr(i, 'debug'); return;
      case 'IfBlock': expr(n.test, 'if'); fragment(n.consequent); fragment(n.alternate); return;
      case 'EachBlock': {
        expr(n.expression, 'each');
        const names = n.context ? patternNames(n.context, []) : []; if (n.index) names.push(n.index);
        withScope(names, () => { if (n.key) expr(n.key, 'each-key'); fragment(n.body); });
        fragment(n.fallback); return;
      }
      case 'AwaitBlock':
        expr(n.expression, 'await'); fragment(n.pending);
        withScope(n.value ? patternNames(n.value, []) : [], () => fragment(n.then));
        withScope(n.error ? patternNames(n.error, []) : [], () => fragment(n.catch)); return;
      case 'KeyBlock': expr(n.expression, 'key'); fragment(n.fragment); return;
      case 'SnippetBlock': {
        const names = []; for (const p of n.parameters ?? []) patternNames(p, names);
        withScope(names, () => { for (const p of n.parameters ?? []) patternDefaults(p, 'snippet-param'); fragment(n.body); }); return;
      }
      default: break;
    }
    if (n.attributes || n.fragment) {
      const letNames = attributes(n);
      if (n.type === 'Component') { const root = n.name.split('.')[0]; record(root, n.start + 1, n.start + 1 + root.length, 'component-tag'); }
      if (n.type === 'SvelteComponent' && n.expression) expr(n.expression, 'svelte:component');
      if (n.type === 'SvelteElement' && n.tag) expr(n.tag, 'svelte:element');
      withScope(letNames, () => fragment(n.fragment));
    }
  };

  fragment(ast.fragment);
  references.sort((a, b) => a.startByte - b.startByte);
  const tally = {}; for (const r of references) tally[r.outcome] = (tally[r.outcome] ?? 0) + 1;
  return { ...base, outcome: 'ANALYZED', scriptBlocks: blocks.length, scriptBindingsConsidered: scriptTop.size, references, byOutcome: tally, spanMismatches: references.filter((r) => !r.spanVerified).length, unsupportedScripts: script.unsupported };
}
