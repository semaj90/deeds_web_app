import { astGrepObservationSchema, type AstGrepObservationV1 } from './structural-symbol.js';

/**
 * ACE3-STRUCT-01 (pure): composes the optional `structural` section of AcePacketV3 from EXISTING ast-grep
 * observations (AstGrepObservationV1). No I/O, no new parser, no identity minted. Fail closed: an observation whose
 * source_ref/source_revision differs from the packet identity throws (never silently dropped into a CURRENT section).
 * No observations -> PENDING with an empty payload (never a fabricated CURRENT). Deterministic ordering + dedupe.
 */
export interface AceStructuralSectionV1 {
  status: 'CURRENT' | 'PENDING';
  revision: string | null;
  evidence_refs: string[];
  data: {
    provider: string | null;
    provider_revision: string | null;
    symbols: { name: string; kind: string; byte_start: number; byte_end: number }[];
    imports: string[];
    calls: string[];
    exports: string[];
    ast_grep_rule_ids: string[];
    structural_fact_refs: string[];
  };
}

const SYMBOL_KINDS = new Set(['function', 'class', 'method', 'interface', 'type', 'enum', 'const', 'variable']);
const first = (c: Record<string, string>, keys: string[]): string | null => {
  for (const k of keys) if (c[k] && c[k].trim()) return c[k].trim();
  return null;
};
const uniqSorted = (xs: string[]) => [...new Set(xs)].sort();

export function composeAceStructuralSectionV1(input: {
  source_ref: string;
  source_revision: string;
  observations: readonly unknown[];
  provider?: string;
}): AceStructuralSectionV1 {
  const obs: AstGrepObservationV1[] = input.observations.map((o) => astGrepObservationSchema.parse(o));
  for (const o of obs) {
    if (o.source_ref !== input.source_ref) throw new Error(`ACE_STRUCTURAL_SOURCE_REF_MISMATCH:${o.observation_id}`);
    if (o.source_revision !== input.source_revision) throw new Error(`ACE_STRUCTURAL_SOURCE_REVISION_MISMATCH:${o.observation_id}`);
  }
  if (obs.length === 0) {
    return { status: 'PENDING', revision: null, evidence_refs: [], data: { provider: null, provider_revision: null, symbols: [], imports: [], calls: [], exports: [], ast_grep_rule_ids: [], structural_fact_refs: [] } };
  }
  const revisions = uniqSorted(obs.map((o) => o.extractor_revision));
  if (revisions.length !== 1) throw new Error(`ACE_STRUCTURAL_MIXED_EXTRACTOR_REVISION:${revisions.join(',')}`);
  const symbols = new Map<string, { name: string; kind: string; byte_start: number; byte_end: number }>();
  const imports: string[] = [];
  const calls: string[] = [];
  const exports: string[] = [];
  const refs: string[] = [];
  const ordered = [...obs].sort((a, b) => a.byte_start - b.byte_start || a.observation_id.localeCompare(b.observation_id));
  for (const o of ordered) {
    const kind = o.observation_kind.toLowerCase();
    const name = first(o.captures, ['name', 'NAME', 'symbol', 'id']);
    if (SYMBOL_KINDS.has(kind) && name) {
      symbols.set(`${kind}:${name}:${o.byte_start}`, { name, kind, byte_start: o.byte_start, byte_end: o.byte_end });
    } else if (kind === 'import') {
      const m = first(o.captures, ['source', 'module', 'from', 'name']);
      if (m) imports.push(m);
    } else if (kind === 'call') {
      const c = first(o.captures, ['callee', 'name', 'fn']);
      if (c) calls.push(c);
    } else if (kind === 'export') {
      const e = first(o.captures, ['name', 'symbol']);
      if (e) exports.push(e);
    }
    refs.push(`${kind}:${o.observation_id}`);
  }
  return {
    status: 'CURRENT',
    revision: revisions[0],
    evidence_refs: uniqSorted(obs.map((o) => `ast-grep:${o.observation_id}`)),
    data: {
      provider: input.provider ?? 'ast-grep',
      provider_revision: revisions[0],
      symbols: [...symbols.values()],
      imports: uniqSorted(imports),
      calls: uniqSorted(calls),
      exports: uniqSorted(exports),
      ast_grep_rule_ids: uniqSorted(obs.map((o) => o.rule_id)),
      structural_fact_refs: uniqSorted(refs),
    },
  };
}
