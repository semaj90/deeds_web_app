import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { analyzeSvelteScripts, extractScriptBlocks } from './svelte-script-scope-v1.mjs';
import { utf8Prefix } from './svelte-template-chunks-v1.mjs';

/**
 * Producers of byte-addressed structural facts for Svelte components (read-only). Each returns observations for
 * structural-evidence-fusion-v1: { source, nativeKind|kind, name, startByte, endByte?, sourceRef, sourceDigest }.
 *   svelte-compiler  official svelte/compiler estree (independence group: svelte-compiler)
 *   ast-grep-napi    tree-sitter via @ast-grep/napi on each extracted <script> block (group: tree-sitter)
 *   ast-grep-cli     tree-sitter via the ast-grep binary with built-in HTML script injection (group: tree-sitter)
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const frontendRequire = createRequire(path.join(root, 'sveltekit-frontend/package.json'));
const { parse: parseSvelte } = frontendRequire('svelte/compiler');
const { parse: parseTs, Lang } = frontendRequire('@ast-grep/napi');
export const AST_GREP_BINARY = path.join(root, 'sveltekit-frontend/node_modules/@ast-grep/cli-win32-x64-msvc/ast-grep.exe');
export const GROUP = Object.freeze({ 'ast-grep-cli': 'tree-sitter', 'ast-grep-napi': 'tree-sitter', 'svelte-compiler': 'svelte-compiler' });
export const RUNE_ROOTS = new Set(['$state', '$derived', '$effect', '$props', '$bindable', '$inspect', '$host']);
export const RUNE_PATTERNS = ['$state($$$A)', '$state.raw($$$A)', '$state.snapshot($$$A)', '$derived($$$A)', '$derived.by($$$A)', '$effect($$$A)', '$effect.pre($$$A)', '$effect.root($$$A)', '$props($$$A)', '$bindable($$$A)', '$inspect($$$A)', '$host($$$A)'];
const LANG = { typescript: 'TypeScript', javascript: 'JavaScript' };
const unquote = (s) => String(s ?? '').replace(/^['"`]|['"`]$/g, '');

export function compilerFacts(source, sourceRef, sourceDigest) {
  const prefix = utf8Prefix(source);
  const ast = parseSvelte(source, { modern: true });
  const obs = [];
  const base = { source: 'svelte-compiler', sourceRef, sourceDigest };
  const visit = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (n.type === 'CallExpression') {
      const c = n.callee;
      const name = c?.type === 'Identifier' ? c.name : c?.type === 'MemberExpression' && c.object?.type === 'Identifier' ? c.object.name : null;
      if (name && RUNE_ROOTS.has(name)) obs.push({ ...base, nativeKind: 'RUNE_CALL', name, startByte: prefix[c.type === 'Identifier' ? c.start : c.object.start], endByte: prefix[n.end] });
    } else if (n.type === 'ImportDeclaration') obs.push({ ...base, nativeKind: 'ImportDeclaration', name: String(n.source?.value), startByte: prefix[n.start], endByte: prefix[n.end] });
    else if (n.type === 'FunctionDeclaration' && n.id) obs.push({ ...base, nativeKind: 'FunctionDeclaration', name: n.id.name, startByte: prefix[n.start], endByte: prefix[n.end] });
    for (const k of Object.keys(n)) if (k !== 'parent' && k !== 'metadata') visit(n[k]);
  };
  for (const script of [ast.instance, ast.module]) if (script?.content) visit(script.content);
  return obs;
}

export function napiFacts(source, sourceRef, sourceDigest) {
  const obs = [];
  const base = { source: 'ast-grep-napi', sourceRef, sourceDigest };
  for (const block of extractScriptBlocks(source)) {
    const rootNode = parseTs(Lang[LANG[block.language]], block.text).root();
    if (rootNode.find({ rule: { kind: 'ERROR' } })) return { observations: [], scriptParseError: true };
    const prefix = utf8Prefix(block.text);
    const abs = (index) => prefix[index] + block.utf8Start;
    for (const node of rootNode.findAll({ rule: { kind: 'import_statement' } })) {
      const r = node.range();
      obs.push({ ...base, nativeKind: 'import_statement', name: unquote(node.field('source')?.text()), startByte: abs(r.start.index), endByte: abs(r.end.index) });
    }
    for (const kind of ['function_declaration', 'generator_function_declaration']) {
      for (const node of rootNode.findAll({ rule: { kind } })) {
        const r = node.range();
        obs.push({ ...base, nativeKind: kind, name: node.field('name')?.text() ?? '', startByte: abs(r.start.index), endByte: abs(r.end.index) });
      }
    }
  }
  for (const o of analyzeSvelteScripts(source).occurrences) if (o.note === 'svelte-rune') obs.push({ ...base, nativeKind: 'RUNE_CALL', name: o.name, startByte: o.startByte });
  return { observations: obs, scriptParseError: false };
}

/** One pass per rune pattern over all .svelte files. ast-grep exits 1 for "no match"; that is an empty result only when stderr is empty. */
export function cliRuneFacts(fileSet, digestOf) {
  const byFile = new Map();
  for (const pattern of RUNE_PATTERNS) {
    const res = spawnSync(AST_GREP_BINARY, ['run', '-p', pattern, '--globs', '**/*.svelte', '--json=compact', 'sveltekit-frontend/src'], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024, timeout: 240000 });
    if (res.error || (res.status !== 0 && res.status !== 1) || (res.status === 1 && res.stderr.trim())) throw new Error(`ast-grep failed for ${pattern}: ${res.error ?? res.stderr.slice(0, 200)}`);
    let matches;
    try { matches = JSON.parse(res.stdout || '[]'); } catch { throw new Error(`ast-grep produced invalid JSON for ${pattern}`); }
    for (const m of matches) {
      const rel = m.file.replaceAll('\\', '/');
      if (!fileSet.has(rel)) continue;
      if (!byFile.has(rel)) byFile.set(rel, []);
      byFile.get(rel).push({ source: 'ast-grep-cli', sourceRef: rel, sourceDigest: digestOf(rel), nativeKind: 'RUNE_CALL', name: pattern.slice(0, pattern.search(/[.(]/)), startByte: m.range.byteOffset.start, endByte: m.range.byteOffset.end });
    }
  }
  return byFile;
}
