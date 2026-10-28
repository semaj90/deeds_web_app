import { listExports, resolveSpecifier } from './import-specifier-resolution-v1.mjs';

/**
 * Follows a named (or default) export through re-exports to the file that actually declares it. Pure: `readSource(rel)` is injected.
 * Lexical evidence only. Never guesses: a star re-export that could supply the name from more than one module is AMBIGUOUS.
 * Statuses: DECLARED, REEXPORT_RESOLVED, LOCAL_ALIAS_RESOLVED, NOT_EXPORTED, STAR_AMBIGUOUS, EXTERNAL_REEXPORT, CYCLE, DEPTH_EXCEEDED, MODULE_UNRESOLVED, SOURCE_UNAVAILABLE.
 */
export function followExport({ file, name, manifest, aliases = [], readSource, maxDepth = 8 }) {
  const trail = [];
  const seen = new Set();
  const walk = (rel, wanted, depth) => {
    const key = `${rel}\u0000${wanted}`;
    if (seen.has(key)) return { status: 'CYCLE', trail };
    seen.add(key);
    if (depth > maxDepth) return { status: 'DEPTH_EXCEEDED', trail };
    const source = readSource(rel);
    if (source == null) return { status: 'SOURCE_UNAVAILABLE', trail, at: rel };
    const info = listExports(source);
    trail.push({ file: rel, wanted });

    const reexport = info.reExports.find((r) => r.exported === wanted);
    if (reexport) {
      const mod = resolveSpecifier({ fromRel: rel, specifier: reexport.from, manifest, aliases });
      if (mod.status === 'EXTERNAL_MODULE') return { status: 'EXTERNAL_REEXPORT', specifier: reexport.from, trail };
      if (mod.status !== 'MODULE_RESOLVED') return { status: 'MODULE_UNRESOLVED', specifier: reexport.from, moduleStatus: mod.status, trail };
      const next = walk(mod.target, reexport.original, depth + 1);
      return next.status === 'DECLARED' ? { ...next, status: 'REEXPORT_RESOLVED' } : next;
    }
    const alias = info.localAliases.find((a) => a.exported === wanted);
    if (alias) return { status: 'LOCAL_ALIAS_RESOLVED', definingFile: rel, definingName: alias.local, trail };
    const declared = wanted === 'default' ? info.hasDefault : info.names.includes(wanted);
    if (declared) return { status: 'DECLARED', definingFile: rel, definingName: wanted, trail };

    // Star re-exports cannot supply a default export.
    if (wanted !== 'default' && info.starFrom.length > 0) {
      const outcomes = [];
      for (const specifier of info.starFrom) {
        const mod = resolveSpecifier({ fromRel: rel, specifier, manifest, aliases });
        if (mod.status !== 'MODULE_RESOLVED') { outcomes.push({ specifier, status: mod.status }); continue; }
        const snapshot = trail.length;
        const result = walk(mod.target, wanted, depth + 1);
        trail.length = snapshot;
        outcomes.push({ specifier, result });
      }
      const found = outcomes.filter((o) => o.result && ['DECLARED', 'REEXPORT_RESOLVED', 'LOCAL_ALIAS_RESOLVED'].includes(o.result.status));
      if (found.length === 1) return { ...found[0].result, status: found[0].result.status === 'DECLARED' ? 'REEXPORT_RESOLVED' : found[0].result.status, viaStar: found[0].specifier, trail };
      if (found.length > 1) return { status: 'STAR_AMBIGUOUS', candidates: found.map((f) => f.result.definingFile).sort(), trail };
      if (outcomes.some((o) => o.status === 'EXTERNAL_MODULE')) return { status: 'EXTERNAL_REEXPORT', trail };
    }
    return { status: 'NOT_EXPORTED', trail };
  };
  return walk(file, name, 0);
}
