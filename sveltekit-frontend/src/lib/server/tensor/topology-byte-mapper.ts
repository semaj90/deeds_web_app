/**
 * topology-byte-mapper.ts
 *
 * Packs per-file topology classification into a single byte for fast ACE routing.
 *
 * Layout (8 bits):
 *   bits 0-3 : TopoClass  (1-7, 0 = unclassified)
 *   bits 4-5 : risk       (0-3)
 *   bits 6-7 : trust      (0-3)
 *
 * ACE uses the byte as a fast prefilter before the 768-dim ANN sweep:
 *   Qdrant filter: { key: 'topo_byte', range: { gte: 0x05, lte: 0x06 } }
 */

export type TopoClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type RiskLevel  = 0 | 1 | 2 | 3;
export type TrustLevel = 0 | 1 | 2 | 3;

export const TOPO_CLASS = {
  UNCLASSIFIED:        0,
  LEGAL_EVIDENCE:      1,
  API_ROUTE:           2,
  UI_COMPONENT:        3,
  DATABASE_SCHEMA:     4,
  TRACE_RETRIEVAL:     5,
  GRAPH_GPU_TOPOLOGY:  6,
  TEST_AUDIT_DEVTOOL:  7,
} as const satisfies Record<string, TopoClass>;

export const TOPO_CLASS_LABEL: Record<TopoClass, string> = {
  0: 'unclassified',
  1: 'legal-evidence',
  2: 'api-route',
  3: 'ui-component',
  4: 'database-schema',
  5: 'trace-retrieval',
  6: 'graph-gpu-topology',
  7: 'test-audit-devtool',
};

/** Pack class + risk + trust into one byte. */
export function packTopoByte(input: {
  topoClass: TopoClass;
  risk:  RiskLevel;
  trust: TrustLevel;
}): number {
  return (
    (input.topoClass & 0x0f) |
    ((input.risk  & 0x03) << 4) |
    ((input.trust & 0x03) << 6)
  );
}

/** Unpack byte back into its components. */
export function unpackTopoByte(byte: number): {
  topoClass: TopoClass;
  risk:  RiskLevel;
  trust: TrustLevel;
  hex:   string;
  label: string;
} {
  const topoClass = (byte & 0x0f)        as TopoClass;
  const risk      = ((byte >> 4) & 0x03) as RiskLevel;
  const trust     = ((byte >> 6) & 0x03) as TrustLevel;
  return {
    topoClass,
    risk,
    trust,
    hex:   `0x${byte.toString(16).padStart(2, '0')}`,
    label: TOPO_CLASS_LABEL[topoClass] ?? 'unclassified',
  };
}

// ── Heuristic classifier ──────────────────────────────────────────────────────

/**
 * Infer TopoClass from file path alone.
 * Fast, deterministic, no I/O — suitable for batch classification.
 */
export function classifyPath(filePath: string): TopoClass {
  const p = filePath.toLowerCase();

  // Test / audit / devtool
  if (/\/(tests?|spec|__tests?__|e2e|playwright|vitest|scripts\/)/.test(p)) return TOPO_CLASS.TEST_AUDIT_DEVTOOL;
  if (/\/(scripts?|tools?|devtools?|audit)\//.test(p)) return TOPO_CLASS.TEST_AUDIT_DEVTOOL;

  // Database schema
  if (/\/(db|schema|drizzle|migrations?)\//.test(p)) return TOPO_CLASS.DATABASE_SCHEMA;
  if (/schema[-_]postgres|schema[-_]sqlite/.test(p)) return TOPO_CLASS.DATABASE_SCHEMA;

  // Graph / GPU / topology
  if (/\/(graph|hypergraph|tensor|topology|som|neo4j|gds)\//.test(p)) return TOPO_CLASS.GRAPH_GPU_TOPOLOGY;
  if (/gpu|libtorch|tensorrt|cuda|simd/.test(p)) return TOPO_CLASS.GRAPH_GPU_TOPOLOGY;

  // Trace / retrieval
  if (/\/(ace|rag|kag|retrieval|indexer|vector|qdrant|embeddings?)\//.test(p)) return TOPO_CLASS.TRACE_RETRIEVAL;

  // API routes
  if (/\/routes\/api\//.test(p) || /\+server\.ts$/.test(p)) return TOPO_CLASS.API_ROUTE;

  // Legal evidence
  if (/\/(evidence|legal|citations?|statutes?|documents?|cases?)\//.test(p)) return TOPO_CLASS.LEGAL_EVIDENCE;

  // UI components
  if (/\/(components?|routes\/\(app\)|svelte)/.test(p) && /\.svelte$/.test(p)) return TOPO_CLASS.UI_COMPONENT;
  if (/\/routes\/\(app\)\//.test(p)) return TOPO_CLASS.UI_COMPONENT;

  return TOPO_CLASS.UNCLASSIFIED;
}

/**
 * Estimate risk level from file path tags.
 *   0 = no known risk
 *   1 = auth / credentials / PII adjacent
 *   2 = destructive ops (migrations, deletes)
 *   3 = security-critical (auth providers, RLS)
 */
export function estimateRisk(filePath: string): RiskLevel {
  const p = filePath.toLowerCase();
  if (/auth|session|token|credential|password|secret/.test(p)) return 3;
  if (/migration|delete|drop|truncate/.test(p)) return 2;
  if (/admin|rbac|permission|role/.test(p)) return 1;
  return 0;
}

/** Estimate trust level (0-3) based on path conventions. */
export function estimateTrust(filePath: string): TrustLevel {
  const p = filePath.toLowerCase();
  // Core server modules and schema are high-trust
  if (/src\/lib\/server\/(db|graph|tensor|vector)\//.test(p)) return 3;
  if (/src\/lib\/server\//.test(p)) return 2;
  if (/src\/routes\/api\//.test(p)) return 2;
  if (/src\/lib\//.test(p)) return 1;
  return 0;
}

/** Classify + pack a file path into a single topo byte. */
export function topoByteFromPath(filePath: string): number {
  return packTopoByte({
    topoClass: classifyPath(filePath),
    risk:      estimateRisk(filePath),
    trust:     estimateTrust(filePath),
  });
}

/**
 * Infer TopoClass from a query string for ACE fast-routing.
 * Returns the most likely class to prefilter Qdrant before ANN.
 */
export function classifyQuery(query: string): TopoClass {
  const q = query.toLowerCase();
  // Test/audit checked before api-route so "route test coverage" → TEST_AUDIT_DEVTOOL
  if (/\btest\b|coverage|\bspec\b|audit|vitest|playwright/.test(q)) return TOPO_CLASS.TEST_AUDIT_DEVTOOL;
  if (/cuda|rtx|\bgpu\b|tensor|topology|\bsom\b|pagerank|louvain/.test(q)) return TOPO_CLASS.GRAPH_GPU_TOPOLOGY;
  if (/\bapi\b|endpoint|handler|server\.ts/.test(q)) return TOPO_CLASS.API_ROUTE;
  if (/schema|table|drizzle|postgres|migration/.test(q)) return TOPO_CLASS.DATABASE_SCHEMA;
  if (/evidence|legal|statute|citation|document/.test(q)) return TOPO_CLASS.LEGAL_EVIDENCE;
  if (/rag|qdrant|embed|retrieval|\bace\b|\bkag\b/.test(q)) return TOPO_CLASS.TRACE_RETRIEVAL;
  if (/component|svelte|\bui\b|button|dialog/.test(q)) return TOPO_CLASS.UI_COMPONENT;
  // "route" alone (without test/api context) → API_ROUTE
  if (/route/.test(q)) return TOPO_CLASS.API_ROUTE;
  return TOPO_CLASS.UNCLASSIFIED;
}
