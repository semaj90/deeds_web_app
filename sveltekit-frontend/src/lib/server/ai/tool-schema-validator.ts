/**
 * Phase 10 §5b: validateToolSchema — schema-aware compatibility check between a query and a
 * tool_registry row.
 *
 * Works uniformly across all 3 tool_registry categories (api:*, mcp:*, named canonical tools)
 * because the category-specific complexity lives in the one-time normalization migration
 * (scripts/atlas/phase10-normalize-tool-capabilities.mjs), not in this validator — see
 * openspec/changes/add-packet-ontology-registry/tasks.md §5a/§5b for the full design record.
 *
 * Rule: an empty supportedPacketTypes/supportedLanguages/supportedExtensions array means "no
 * restriction" (wildcard) — this matches this repo's existing "optional filter, missing metadata
 * = permissive default" convention (see design.md's own filter-behavior language for this
 * section), not "supports nothing."
 */

export interface ToolSchemaQuery {
  packetType?: string;
  language?: string;
  extension?: string;
  domain?: string;
  includeDeprecated?: boolean;
}

/** Matches the normalized shape written by phase10-normalize-tool-capabilities.mjs. */
export interface NormalizedToolCapabilities {
  supportedPacketTypes: string[];
  supportedLanguages: string[];
  supportedExtensions: string[];
  domainTags: string[];
  deprecated: boolean;
  [key: string]: unknown; // httpMethods / legacyTag / legacyValue — category-specific extras
}

function matchesOrWildcard(supported: readonly string[] | undefined, value: string | undefined): boolean {
  if (!supported || supported.length === 0) return true; // wildcard — no restriction
  if (!value) return true; // query didn't specify this dimension — don't filter on it
  return supported.includes(value);
}

/**
 * Returns true if the tool is a viable candidate for the query, false if the query specifies a
 * dimension the tool explicitly doesn't support. Never throws on malformed/missing capability
 * data — treats it as permissive (same "missing metadata = permissive" rule as the wildcard case),
 * since a tool_registry row with no ontology data yet (e.g. a brand-new tool never run through
 * the normalization migration) shouldn't be silently excluded from every search.
 */
export function validateToolSchema(
  query: ToolSchemaQuery,
  toolCapabilities: unknown
): boolean {
  const caps = toolCapabilities as Partial<NormalizedToolCapabilities> | null | undefined;
  if (!caps || typeof caps !== 'object') return true; // no ontology data — permissive default

  if (caps.deprecated === true && !query.includeDeprecated) return false;

  return (
    matchesOrWildcard(caps.supportedPacketTypes, query.packetType) &&
    matchesOrWildcard(caps.supportedLanguages, query.language) &&
    matchesOrWildcard(caps.supportedExtensions, query.extension) &&
    matchesOrWildcard(caps.domainTags, query.domain)
  );
}
