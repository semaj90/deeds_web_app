/**
 * ROUTER-01: frozen numeric registry over the EXISTING lane / intent / domain vocabularies.
 *
 * This is a registry, not a router and not a fifth vocabulary. The repo already has several string vocabularies that
 * mean different things (see the audit in parent-atlas-gpu-compute-lanes-consolidation/tasks.md section 19); this module
 * gives each one a stable numeric code so a later deterministic routing LUT can key on small integers, without choosing
 * a winner between them or inventing new members.
 *
 * Rules (frozen):
 *   - A code is a ROUTING KEY ONLY. The canonical meaning is the name in the owning vocabulary; a code never becomes
 *     identity, never replaces `packet_key`/`source_ref`, and is never persisted without its vocabularyId + revision.
 *   - Codes are scoped PER VOCABULARY. `search_contract.lane` code 2 and `cognitive_router.lane` code 2 are unrelated;
 *     there is deliberately no cross-vocabulary mapping here (that is a separate, reviewed decision).
 *   - Code 0 is reserved (UNSPECIFIED) and is never a valid route. Valid codes are integers 1..255 (uint8-safe).
 *   - APPEND-ONLY: a code is never reused or renumbered. A removed or renamed source member keeps its code with
 *     `deprecated: true`; a new source member gets the next unused code. The drift-guard spec enforces both directions
 *     against the real source enums, so any source change fails loudly instead of silently shifting routing.
 * Pure data and lookups: reads nothing, writes nothing, owns no identity.
 */
export const ROUTING_REGISTRY_SCHEMA_V1 = 'atlas.routing-registry.v1' as const;
export const ROUTING_REGISTRY_REVISION_V1 = 'routing-registry-v1.0' as const;

export type RegistryAxisV1 = 'LANE' | 'INTENT' | 'DOMAIN';

export interface RegistryEntryV1 {
  readonly code: number;
  readonly name: string;
  readonly deprecated?: true;
}

export interface RegistryVocabularyV1 {
  readonly vocabularyId: string;
  readonly axis: RegistryAxisV1;
  /** Owning source, as `path::export`; the canonical meaning lives there, not here. */
  readonly source: string;
  /** Revision of the source vocabulary when it carries one; null when the source has none. */
  readonly sourceRevision: string | null;
  readonly entries: readonly RegistryEntryV1[];
}

export interface RoutingRegistryV1 {
  readonly schema: typeof ROUTING_REGISTRY_SCHEMA_V1;
  readonly revision: typeof ROUTING_REGISTRY_REVISION_V1;
  readonly vocabularies: readonly RegistryVocabularyV1[];
}

const entries = (names: readonly string[]): RegistryEntryV1[] => names.map((name, i) => ({ code: i + 1, name }));

export const ROUTING_REGISTRY_V1: RoutingRegistryV1 = Object.freeze({
  schema: ROUTING_REGISTRY_SCHEMA_V1,
  revision: ROUTING_REGISTRY_REVISION_V1,
  vocabularies: Object.freeze([
    {
      vocabularyId: 'search_contract.lane',
      axis: 'LANE',
      source: 'sveltekit-frontend/src/lib/server/retrieval/search-contract.ts::SearchLaneSchema',
      sourceRevision: null,
      entries: entries(['lexical', 'dense', 'sparse', 'topology', 'authority', 'routing', 'documentation', 'temporal', 'memory']),
    },
    {
      vocabularyId: 'cognitive_router.lane',
      axis: 'LANE',
      source: 'sveltekit-frontend/src/lib/server/retrieval/cognitive-router.ts::retrievalLaneSchema',
      sourceRevision: null,
      entries: entries(['bm25', 'ann', 'som', 'graph', 'inverse', 'all']),
    },
    {
      vocabularyId: 'cognitive_router.intent',
      axis: 'INTENT',
      source: 'sveltekit-frontend/src/lib/server/retrieval/cognitive-router.ts::routerIntentSchema',
      sourceRevision: null,
      entries: entries(['debug', 'locate', 'graph', 'topology', 'semantic']),
    },
    {
      vocabularyId: 'canonical_domains',
      axis: 'DOMAIN',
      source: 'sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts::CANONICAL_DOMAINS',
      sourceRevision: 'parent-atlas-domain-taxonomy-v1',
      entries: entries(['auth', 'ui', 'retrieval', 'network', 'database', 'cache', 'agent', 'graph', 'ml']),
    },
  ] as RegistryVocabularyV1[]),
});

export type RegistryViolationV1 =
  | 'DUPLICATE_VOCABULARY_ID'
  | 'DUPLICATE_CODE'
  | 'DUPLICATE_NAME'
  | 'CODE_OUT_OF_RANGE'
  | 'EMPTY_VOCABULARY';

/** Structural validation of a registry value (not of its agreement with the source enums: the spec does that). */
export function validateRoutingRegistryV1(registry: RoutingRegistryV1): { vocabularyId: string; violation: RegistryViolationV1; detail: string }[] {
  const out: { vocabularyId: string; violation: RegistryViolationV1; detail: string }[] = [];
  const seenVocab = new Set<string>();
  for (const v of registry.vocabularies) {
    if (seenVocab.has(v.vocabularyId)) out.push({ vocabularyId: v.vocabularyId, violation: 'DUPLICATE_VOCABULARY_ID', detail: v.vocabularyId });
    seenVocab.add(v.vocabularyId);
    if (v.entries.length === 0) out.push({ vocabularyId: v.vocabularyId, violation: 'EMPTY_VOCABULARY', detail: '' });
    const codes = new Set<number>();
    const names = new Set<string>();
    for (const e of v.entries) {
      if (!Number.isInteger(e.code) || e.code < 1 || e.code > 255) out.push({ vocabularyId: v.vocabularyId, violation: 'CODE_OUT_OF_RANGE', detail: `${e.name}=${e.code}` });
      if (codes.has(e.code)) out.push({ vocabularyId: v.vocabularyId, violation: 'DUPLICATE_CODE', detail: String(e.code) });
      if (names.has(e.name)) out.push({ vocabularyId: v.vocabularyId, violation: 'DUPLICATE_NAME', detail: e.name });
      codes.add(e.code);
      names.add(e.name);
    }
  }
  return out;
}

export function registryVocabularyV1(vocabularyId: string, registry: RoutingRegistryV1 = ROUTING_REGISTRY_V1): RegistryVocabularyV1 | null {
  return registry.vocabularies.find((v) => v.vocabularyId === vocabularyId) ?? null;
}

/** Name -> code within one vocabulary; null when unknown (callers must treat null as "not routable", never as 0). */
export function registryCodeOfV1(vocabularyId: string, name: string, registry: RoutingRegistryV1 = ROUTING_REGISTRY_V1): number | null {
  return registryVocabularyV1(vocabularyId, registry)?.entries.find((e) => e.name === name)?.code ?? null;
}

/** Code -> name within one vocabulary; null when unknown or reserved (0). */
export function registryNameOfV1(vocabularyId: string, code: number, registry: RoutingRegistryV1 = ROUTING_REGISTRY_V1): string | null {
  return registryVocabularyV1(vocabularyId, registry)?.entries.find((e) => e.code === code)?.name ?? null;
}
