/**
 * Static-vs-dynamic code classification — derivation only, no new AST parser.
 *
 * Consumes the existing AST-grep storage-kind vocabulary (the `VALID_STORAGE_KINDS` set defined
 * in scripts/atlas/atlas-ast-backfill-receipt-v1.mjs: file, module, class, interface, type,
 * function, method, constructor, parameter, route, schema, test, call_site, import, export) and,
 * where available, a short source-text snippet for the symbol. Never fabricates a classification:
 * ambiguous or evidence-free symbols return `undefined`, consistent with `blendScores()`'s
 * existing behaviour of skipping undefined signals rather than treating them as neutral 0.5.
 *
 * Feeds the `domainScore` composite in candidate-scorer.ts (see
 * openspec/changes/parent-atlas-unified-symbol-ranking/design.md Decision 1/2).
 */

export type StorageNodeKind =
  | 'file' | 'module' | 'class' | 'interface' | 'type'
  | 'function' | 'method' | 'constructor' | 'parameter'
  | 'route' | 'schema' | 'test' | 'call_site' | 'import' | 'export';

export type StaticDynamicLabel = 'static' | 'dynamic';

/** Node kinds that are declarative/type-level by definition — never execute at runtime. */
const ALWAYS_STATIC_KINDS: ReadonlySet<StorageNodeKind> = new Set([
  'type', 'interface', 'schema', 'import', 'export',
]);

/** Node kinds that are runtime-executed by definition. */
const ALWAYS_DYNAMIC_KINDS: ReadonlySet<StorageNodeKind> = new Set([
  'route', 'test', 'call_site',
]);

/**
 * Side-effect / runtime-dependency markers scanned in a symbol's source-text snippet.
 * Deliberately conservative (substring match, not full data-flow analysis) — this is a coarse
 * signal for reranking, not a soundness guarantee. A miss leaves the symbol `dynamic` (safer
 * default per marker below) rather than silently misclassifying a side-effecting symbol static.
 */
const DYNAMIC_MARKERS: readonly string[] = [
  'await ', 'async ', 'fetch(', 'Date.now', 'Math.random', 'process.env',
  'fs.', 'console.', 'setTimeout', 'setInterval', 'localStorage', 'sessionStorage',
  'document.', 'window.', 'crypto.', '.query(', '.exec(', 'redis.', 'db.',
];

export interface StaticDynamicInput {
  nodeKind: StorageNodeKind;
  /** Optional short snippet of the symbol's source text (signature/body), if available. */
  sourceText?: string;
}

/**
 * Classify a code symbol as `static`, `dynamic`, or `undefined` (insufficient evidence).
 *
 * - `type`/`interface`/`schema`/`import`/`export` → always `static` (declarative by definition).
 * - `route`/`test`/`call_site` → always `dynamic` (runtime-executed by definition).
 * - `function`/`method`/`constructor` → classified from `sourceText` if provided (any dynamic
 *   marker present → `dynamic`; none found → `static`); `undefined` if no `sourceText` given,
 *   rather than guessing from the kind alone.
 * - `class`/`module`/`file`/`parameter` → always `undefined` — too coarse a unit to classify
 *   without aggregating over its members, which this pure function does not attempt.
 */
export function classifyStaticDynamic(input: StaticDynamicInput): StaticDynamicLabel | undefined {
  const { nodeKind, sourceText } = input;

  if (ALWAYS_STATIC_KINDS.has(nodeKind)) return 'static';
  if (ALWAYS_DYNAMIC_KINDS.has(nodeKind)) return 'dynamic';

  if (nodeKind === 'function' || nodeKind === 'method' || nodeKind === 'constructor') {
    if (!sourceText) return undefined;
    const hasDynamicMarker = DYNAMIC_MARKERS.some((marker) => sourceText.includes(marker));
    return hasDynamicMarker ? 'dynamic' : 'static';
  }

  // class, module, file, parameter — deliberately unclassified at this granularity.
  return undefined;
}

/**
 * Convert a static/dynamic label into a [0,1] score for the rerank blend, biasing toward
 * whichever label a given retrieval intent should favor. Callers decide the bias; this function
 * only encodes the binary-to-scalar mapping so it isn't duplicated at every call site.
 */
export function staticDynamicScore(
  label: StaticDynamicLabel | undefined,
  favor: StaticDynamicLabel = 'static',
): number | undefined {
  if (label === undefined) return undefined;
  return label === favor ? 1 : 0;
}
