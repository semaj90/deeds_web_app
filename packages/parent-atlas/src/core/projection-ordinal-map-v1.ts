import { createHash } from 'node:crypto';
import { z } from 'zod';
import { graphNodeKeyV1Schema } from './graph-node-key-v1.js';

const revision = z.string().min(1);

/**
 * OAK-PROJECTION-01 — the operator's exact correction: OaK query graphs
 * (relation/tool/evidence nodes) do NOT extend the durable
 * `GraphNodeKeyV1`/`GraphOrdinal` coordinate space. They get their own,
 * separate, non-canonical coordinate space instead:
 *
 *   DURABLE GRAPH:              GraphNodeKeyV1  -> GraphOrdinal
 *     (symbol | packet | chunk | occurrence — see graph-node-key-v1.ts)
 *   QUERY / OaK OPERATIONAL GRAPH: ProjectionNodeKeyV1 -> ProjectionOrdinal
 *     (ENTITY | TUPLE | HYPEREDGE | TOOL | EVIDENCE — this file)
 *
 * This is exactly the gap `graph_projection.py`/`onto-py-04` surfaced
 * from the Python side (no `relation:` prefix exists in
 * `GraphNodeKeyV1`) — resolved here on the TS/contract side, not by
 * extending the durable regex. A `ProjectionNodeKeyV1` MAY cross-
 * reference a real `GraphNodeKeyV1`/`GraphOrdinal` (for `ENTITY` rows
 * that really do have durable graph identity) via the row's optional
 * `graphOrdinal`/`graphNodeKey` fields, but the reverse is never true —
 * a `TUPLE`/`HYPEREDGE`/`TOOL`/`EVIDENCE` projection node has no durable
 * graph identity and never gets one implicitly.
 */
export const PROJECTION_NODE_CLASS_VALUES = ['ENTITY', 'TUPLE', 'HYPEREDGE', 'TOOL', 'EVIDENCE'] as const;
export const projectionNodeClassSchema = z.enum(PROJECTION_NODE_CLASS_VALUES);
export type ProjectionNodeClass = z.infer<typeof projectionNodeClassSchema>;

const PROJECTION_NODE_KEY_PREFIX_BY_CLASS: Record<ProjectionNodeClass, string> = {
  ENTITY: 'entity',
  TUPLE: 'tuple',
  HYPEREDGE: 'hyperedge',
  TOOL: 'tool',
  EVIDENCE: 'evidence',
};

export const projectionNodeKeyV1Schema = z.string().regex(/^(entity|tuple|hyperedge|tool|evidence):.+$/);
export type ProjectionNodeKeyV1 = z.infer<typeof projectionNodeKeyV1Schema>;

export const projectionOrdinalRowSchema = z.object({
  projectionOrdinal: z.number().int().nonnegative(),
  projectionNodeKey: projectionNodeKeyV1Schema,
  nodeClass: projectionNodeClassSchema,
  graphOrdinal: z.number().int().nonnegative().optional(),
  graphNodeKey: graphNodeKeyV1Schema.optional(),
  tupleId: z.string().min(1).optional(),
  hyperedgeId: z.string().min(1).optional(),
}).strict().superRefine((row, ctx) => {
  const expectedPrefix = PROJECTION_NODE_KEY_PREFIX_BY_CLASS[row.nodeClass];
  if (!row.projectionNodeKey.startsWith(`${expectedPrefix}:`)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['projectionNodeKey'], message: `nodeClass ${row.nodeClass} requires a '${expectedPrefix}:' prefixed projectionNodeKey` });
  }
  if (row.nodeClass === 'TUPLE' && !row.tupleId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tupleId'], message: 'nodeClass TUPLE requires tupleId' });
  }
  if (row.nodeClass === 'HYPEREDGE' && !row.hyperedgeId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hyperedgeId'], message: 'nodeClass HYPEREDGE requires hyperedgeId' });
  }
  if ((row.graphOrdinal !== undefined) !== (row.graphNodeKey !== undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['graphOrdinal'], message: 'graphOrdinal and graphNodeKey must be supplied together or not at all' });
  }
  if (row.nodeClass !== 'ENTITY' && row.graphNodeKey !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['graphNodeKey'], message: `nodeClass ${row.nodeClass} has no durable graph identity — only ENTITY rows may cross-reference GraphNodeKeyV1` });
  }
});

export type ProjectionOrdinalRowV1 = z.infer<typeof projectionOrdinalRowSchema>;

export const projectionOrdinalMapV1Schema = z.object({
  schema: z.literal('atlas.projection-ordinal-map.v1').default('atlas.projection-ordinal-map.v1'),
  graphRevision: revision,
  ontologyRevision: revision,
  projectionRevision: revision,
  rows: z.array(projectionOrdinalRowSchema),
  projectionOrdinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  canonicalAuthority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  const keys = new Set<string>();
  for (const row of value.rows) {
    if (keys.has(row.projectionNodeKey)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows'], message: `Duplicate projectionNodeKey ${row.projectionNodeKey}` });
    }
    keys.add(row.projectionNodeKey);
  }
  const sortedKeys = [...value.rows].map((r) => r.projectionNodeKey).sort();
  value.rows.forEach((row, index) => {
    if (row.projectionOrdinal !== index) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows', index, 'projectionOrdinal'], message: `projectionOrdinal must be dense and index-aligned (expected ${index}, got ${row.projectionOrdinal})` });
    }
  });
  if (value.rows.map((r) => r.projectionNodeKey).join('\0') !== sortedKeys.join('\0')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows'], message: 'rows must be sorted by projectionNodeKey (same determinism convention as GraphOrdinalMapV1)' });
  }
});

export type ProjectionOrdinalMapV1 = z.infer<typeof projectionOrdinalMapV1Schema>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => {
        out[key] = (item as Record<string, unknown>)[key];
        return out;
      }, {});
    }
    return item;
  });
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export interface ProjectionNodeInputV1 {
  projectionNodeKey: string;
  nodeClass: ProjectionNodeClass;
  graphOrdinal?: number;
  graphNodeKey?: string;
  tupleId?: string;
  hyperedgeId?: string;
}

/** Sorts by projectionNodeKey and assigns dense ordinals — same
 * determinism convention `buildGraphOrdinalMapV1` uses for the durable
 * graph, kept consistent on purpose across the two coordinate spaces. */
export function buildProjectionOrdinalMapV1(input: {
  graphRevision: string;
  ontologyRevision: string;
  projectionRevision: string;
  nodes: ProjectionNodeInputV1[];
}): ProjectionOrdinalMapV1 {
  if (!input.graphRevision || !input.ontologyRevision || !input.projectionRevision) {
    throw new Error('PROJECTION_ORDINAL_REVISION_BINDING_REQUIRED');
  }
  const keys = new Set<string>();
  for (const node of input.nodes) {
    if (keys.has(node.projectionNodeKey)) throw new Error(`PROJECTION_ORDINAL_DUPLICATE_NODE_KEY:${node.projectionNodeKey}`);
    keys.add(node.projectionNodeKey);
  }
  // Plain default-comparator sort (not .localeCompare()) — must match the
  // schema's own re-validation sort exactly (see projectionOrdinalMapV1Schema
  // above) and the convention buildGraphOrdinalMapV1 already uses.
  // localeCompare() can diverge from default sort on real-world keys (found
  // live 2026-09-02 in the sibling buildTaxonomyOrdinalMapV1, which had this
  // same bug — see taxonomy-ordinal-map-v1.ts).
  const rows = [...input.nodes]
    .sort((a, b) => (a.projectionNodeKey < b.projectionNodeKey ? -1 : a.projectionNodeKey > b.projectionNodeKey ? 1 : 0))
    .map((node, projectionOrdinal) => ({
      projectionOrdinal,
      projectionNodeKey: node.projectionNodeKey,
      nodeClass: node.nodeClass,
      ...(node.graphOrdinal !== undefined ? { graphOrdinal: node.graphOrdinal } : {}),
      ...(node.graphNodeKey !== undefined ? { graphNodeKey: node.graphNodeKey } : {}),
      ...(node.tupleId !== undefined ? { tupleId: node.tupleId } : {}),
      ...(node.hyperedgeId !== undefined ? { hyperedgeId: node.hyperedgeId } : {}),
    }));
  const body = {
    schema: 'atlas.projection-ordinal-map.v1' as const,
    graphRevision: input.graphRevision,
    ontologyRevision: input.ontologyRevision,
    projectionRevision: input.projectionRevision,
    rows,
    canonicalAuthority: false as const,
  };
  return projectionOrdinalMapV1Schema.parse({ ...body, projectionOrdinalMapChecksum: sha256(body) });
}

export function projectionNodeKeyForOrdinalV1(map: ProjectionOrdinalMapV1, projectionOrdinal: number): ProjectionNodeKeyV1 | null {
  return map.rows.find((row) => row.projectionOrdinal === projectionOrdinal)?.projectionNodeKey ?? null;
}
