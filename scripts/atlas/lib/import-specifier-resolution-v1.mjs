import path from 'node:path';

/**
 * Pure import analysis helpers. Module-path resolution only: a resolved path is NOT a verified symbol.
 * `manifest` is a Map(repoRelativePath -> admittedRevision). `aliases` is [{prefix, target}] with prefix ending in '/'
 * (wildcard) or exact keys (no trailing slash), both repo-relative targets. No I/O.
 */
const EXTENSIONS = ['', '.ts', '.mts', '.cts', '.tsx', '.js', '.mjs', '.cjs', '.svelte', '.json', '/index.ts', '/index.mts', '/index.js', '/index.mjs', '/index.svelte'];

export function parseImportStatement(text) {
  const t = String(text).trim();
  const from = /\bfrom\s+(['"])([^'"\n]+)\1/.exec(t);
  const bare = /^import\s+(['"])([^'"\n]+)\1/.exec(t);
  if (bare) return { form: 'side-effect', specifier: bare[2], typeOnly: false, bindings: [] };
  if (!from) return null;
  const clauseText = t.replace(/^import\s+/, '').slice(0, t.replace(/^import\s+/, '').lastIndexOf('from')).trim();
  let clause = clauseText; let typeOnly = false;
  if (/^type\s+/.test(clause) && !/^type\s*,/.test(clause)) { typeOnly = true; clause = clause.replace(/^type\s+/, ''); }
  const bindings = [];
  const ns = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause);
  if (ns) bindings.push({ kind: 'namespace', imported: '*', local: ns[1] });
  const named = /\{([^}]*)\}/.exec(clause);
  if (named) {
    for (const part of named[1].split(',').map((p) => p.trim()).filter(Boolean)) {
      const m = /^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(part);
      if (m) bindings.push({ kind: 'named', imported: m[1], local: m[2] ?? m[1], typeOnly: /^type\s/.test(part) });
    }
  }
  const head = clause.replace(/\{[^}]*\}/, '').replace(/\*\s+as\s+[A-Za-z_$][\w$]*/, '').replace(/,/g, ' ').trim();
  if (head && /^[A-Za-z_$][\w$]*$/.test(head)) bindings.unshift({ kind: 'default', imported: 'default', local: head });
  const form = bindings.length === 0 ? 'side-effect' : bindings.some((b) => b.kind === 'namespace') ? 'namespace' : bindings.some((b) => b.kind === 'default') && !named ? 'default' : 'named';
  return { form, specifier: from[2], typeOnly, bindings };
}

export function resolveSpecifier({ fromRel, specifier, manifest, aliases = [] }) {
  let base = null;
  if (specifier.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), specifier));
  else {
    const exact = aliases.find((a) => !a.prefix.endsWith('/') && a.prefix === specifier);
    const wild = aliases.filter((a) => a.prefix.endsWith('/') && specifier.startsWith(a.prefix)).sort((x, y) => y.prefix.length - x.prefix.length)[0];
    if (exact) base = exact.target;
    else if (wild) base = wild.target + specifier.slice(wild.prefix.length);
  }
  if (base === null) return { status: /^(node:|[@a-z])/.test(specifier) ? 'EXTERNAL_MODULE' : 'IMPORT_SPECIFIER_UNRESOLVED' };
  if (base.startsWith('..') || path.posix.isAbsolute(base)) return { status: 'IMPORT_SPECIFIER_UNRESOLVED', reason: 'ESCAPES_REPOSITORY' };
  const stem = base.replace(/\.(js|mjs|cjs)$/, '');
  const hits = [...new Set([...EXTENSIONS.map((e) => base + e), ...EXTENSIONS.map((e) => stem + e)])].filter((c) => manifest.has(c));
  if (hits.length === 1) return { status: 'MODULE_RESOLVED', target: hits[0] };
  return hits.length === 0 ? { status: 'IMPORT_SPECIFIER_UNRESOLVED', reason: 'TARGET_NOT_IN_ADMITTED_MANIFEST' } : { status: 'MODULE_AMBIGUOUS', candidates: hits.sort() };
}

/** Lexical export inventory of a source text. Declaration-level evidence only; re-exports are reported, not followed. */
export function listExports(source) {
  const names = new Set(); let hasDefault = false; const reExports = []; const localAliases = []; const starFrom = []; let starReExport = false;
  const decl = /^\s*export\s+(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
  for (let m = decl.exec(source); m; m = decl.exec(source)) names.add(m[2]);
  if (/^\s*export\s+default\b/m.test(source)) hasDefault = true;
  const list = /^\s*export\s+(?:type\s+)?\{([^}]*)\}(?:\s+from\s+(['"])([^'"\n]+)\2)?/gm;
  for (let m = list.exec(source); m; m = list.exec(source)) {
    for (const part of m[1].split(',').map((p) => p.trim()).filter(Boolean)) {
      const mm = /^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(part);
      if (!mm) continue;
      const exported = mm[2] ?? mm[1];
      if (exported === 'default') hasDefault = true; else names.add(exported);
      if (m[3]) reExports.push({ exported, original: mm[1], from: m[3] });
      else localAliases.push({ exported, local: mm[1] });
    }
  }
  const star = /^\s*export\s+\*\s+from\s+(['"])([^'"\n]+)\1/gm;
  for (let m = star.exec(source); m; m = star.exec(source)) { starReExport = true; starFrom.push(m[2]); }
  return { names: [...names].sort(), hasDefault, reExports, localAliases, starFrom: starFrom.sort(), starReExport };
}
