/**
 * Deterministic import-binding target resolver for structural reference facts (GSP-5 producer path).
 *
 * The treesitter-chunker lane emits chunk-level sources but leaves every target as raw syntax text (a whole import
 * statement, `packetKeys.map`, `new Set`). This module resolves ONLY what syntax proves, with no name-guessing:
 *   1. parse an import statement into bindings (`import { A as B } from './x.js'`);
 *   2. resolve its specifier to ONE known source_ref (relative path or `$lib/` alias; `.js` -> `.ts`);
 *   3. resolve a reference whose root identifier equals an imported local binding to the exported top-level symbol of
 *      that file with the same imported name.
 * Anything else (builtins, members of locals, packages, ambiguous or missing files, namespace/default imports without
 * a proven target) stays unresolved with a named reason. Pure: reads nothing, writes nothing, owns no identity.
 * Known limitation (recorded, not hidden): a local variable that shadows an imported name is not detected here.
 */
export type ImportBindingV1 = {
  localName: string;
  /** The exported name in the target module; `default` / `*` are kept verbatim and are never auto-resolved. */
  importedName: string;
  specifier: string;
  typeOnly: boolean;
};

export type ParsedImportV1 = { specifier: string; bindings: ImportBindingV1[] };

const IMPORT_RE = /^\s*import\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/;

/** Parse one TypeScript import statement. Side-effect-only imports and non-import text return null. */
export function parseImportStatementV1(statement: string): ParsedImportV1 | null {
  const m = IMPORT_RE.exec(statement.trim());
  if (!m) return null;
  const statementTypeOnly = Boolean(m[1]);
  const clause = m[2].trim();
  const specifier = m[3];
  const bindings: ImportBindingV1[] = [];
  const push = (localName: string, importedName: string, typeOnly: boolean) => {
    if (/^[A-Za-z_$][\w$]*$/.test(localName)) bindings.push({ localName, importedName, specifier, typeOnly: statementTypeOnly || typeOnly });
  };
  let rest = clause;
  const named = /\{([\s\S]*)\}/.exec(rest);
  if (named) {
    for (const part of named[1].split(',')) {
      const p = part.trim();
      if (!p) continue;
      const typeOnly = /^type\s+/.test(p);
      const body = p.replace(/^type\s+/, '');
      const as = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(body);
      if (as) push(as[2], as[1], typeOnly);
      else push(body, body, typeOnly);
    }
    rest = rest.replace(named[0], '').replace(/,\s*$/, '').trim();
  }
  const ns = /^\*\s+as\s+([A-Za-z_$][\w$]*)$/.exec(rest.replace(/^,\s*/, '').trim());
  if (ns) push(ns[1], '*', false);
  else {
    const def = rest.replace(/,\s*$/, '').replace(/^,\s*/, '').trim();
    if (def && /^[A-Za-z_$][\w$]*$/.test(def)) push(def, 'default', false);
  }
  return { specifier, bindings };
}

export type SpecifierResolutionStatusV1 = 'RESOLVED' | 'EXTERNAL_PACKAGE' | 'NOT_FOUND' | 'AMBIGUOUS';
export type SpecifierResolutionV1 = { status: SpecifierResolutionStatusV1; sourceRef: string | null; candidates: string[] };

export type SpecifierAliasesV1 = Readonly<Record<string, string>>;
/** `$lib/` is the SvelteKit alias for `src/lib/` relative to the SvelteKit app root used for source_ref. */
export const DEFAULT_SPECIFIER_ALIASES_V1: SpecifierAliasesV1 = Object.freeze({ '$lib/': 'src/lib/' });

function normalizePosix(path: string): string | null {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(part);
  }
  return out.join('/');
}

function candidatePaths(base: string): string[] {
  const list: string[] = [];
  if (/\.(js|mjs|cjs|jsx)$/.test(base)) {
    const stem = base.replace(/\.(js|mjs|cjs|jsx)$/, '');
    list.push(`${stem}.ts`, `${stem}.tsx`, `${stem}.svelte.ts`, base);
  } else if (/\.(ts|tsx|svelte|json)$/.test(base)) {
    list.push(base);
  } else {
    list.push(`${base}.ts`, `${base}.tsx`, `${base}.svelte.ts`, `${base}/index.ts`, `${base}/index.js`);
  }
  return [...new Set(list)];
}

/** Resolve an import specifier to exactly one known source_ref, or a named non-resolution. */
export function resolveImportSpecifierV1(
  fromSourceRef: string,
  specifier: string,
  knownSourceRefs: ReadonlySet<string>,
  aliases: SpecifierAliasesV1 = DEFAULT_SPECIFIER_ALIASES_V1,
): SpecifierResolutionV1 {
  let base: string | null = null;
  const alias = Object.keys(aliases).find((a) => specifier.startsWith(a));
  if (alias) base = normalizePosix(aliases[alias] + specifier.slice(alias.length));
  else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const dir = fromSourceRef.includes('/') ? fromSourceRef.slice(0, fromSourceRef.lastIndexOf('/')) : '';
    base = normalizePosix(`${dir}/${specifier}`);
  } else {
    return { status: 'EXTERNAL_PACKAGE', sourceRef: null, candidates: [] };
  }
  if (base === null) return { status: 'NOT_FOUND', sourceRef: null, candidates: [] };
  const hits = candidatePaths(base).filter((c) => knownSourceRefs.has(c));
  if (hits.length === 1) return { status: 'RESOLVED', sourceRef: hits[0], candidates: hits };
  if (hits.length > 1) return { status: 'AMBIGUOUS', sourceRef: null, candidates: hits };
  return { status: 'NOT_FOUND', sourceRef: null, candidates: [] };
}

export type ReferenceTargetStatusV1 =
  | 'RESOLVED_SYMBOL'
  | 'NOT_AN_IMPORT_BINDING'
  | 'NAMESPACE_OR_DEFAULT_UNPROVEN'
  | 'SPECIFIER_UNRESOLVED'
  | 'EXPORT_NOT_FOUND'
  | 'EXPORT_AMBIGUOUS';

export type ReferenceTargetResolutionV1 = {
  status: ReferenceTargetStatusV1;
  targetSourceRef: string | null;
  targetSymbolKey: string | null;
  binding: ImportBindingV1 | null;
};

/** Root identifier of a reference target text: `new Foo`, `await foo.bar`, `foo?.bar()` -> `Foo` / `foo` / `foo`. */
export function rootIdentifierOfV1(targetText: string): string | null {
  const m = /^\s*(?:new\s+|await\s+)*([A-Za-z_$][\w$]*)/.exec(targetText);
  return m ? m[1] : null;
}

/** exportsBySourceRef: sourceRef -> exported top-level name -> the symbol keys nominated under that exact name. */
export function resolveReferenceTargetV1(input: {
  targetText: string;
  fromSourceRef: string;
  bindingsByLocalName: ReadonlyMap<string, ImportBindingV1>;
  knownSourceRefs: ReadonlySet<string>;
  exportsBySourceRef: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
  aliases?: SpecifierAliasesV1;
}): ReferenceTargetResolutionV1 {
  const none = (status: ReferenceTargetStatusV1, binding: ImportBindingV1 | null = null, targetSourceRef: string | null = null): ReferenceTargetResolutionV1 => ({
    status, targetSourceRef, targetSymbolKey: null, binding,
  });
  const root = rootIdentifierOfV1(input.targetText);
  const binding = root ? input.bindingsByLocalName.get(root) ?? null : null;
  if (!binding) return none('NOT_AN_IMPORT_BINDING');
  if (binding.importedName === 'default' || binding.importedName === '*') return none('NAMESPACE_OR_DEFAULT_UNPROVEN', binding);
  const spec = resolveImportSpecifierV1(input.fromSourceRef, binding.specifier, input.knownSourceRefs, input.aliases);
  if (spec.status !== 'RESOLVED' || !spec.sourceRef) return none('SPECIFIER_UNRESOLVED', binding);
  const keys = input.exportsBySourceRef.get(spec.sourceRef)?.get(binding.importedName) ?? [];
  if (keys.length === 0) return none('EXPORT_NOT_FOUND', binding, spec.sourceRef);
  if (keys.length > 1) return none('EXPORT_AMBIGUOUS', binding, spec.sourceRef);
  return { status: 'RESOLVED_SYMBOL', targetSourceRef: spec.sourceRef, targetSymbolKey: keys[0], binding };
}
