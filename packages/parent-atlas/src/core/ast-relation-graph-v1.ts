import { createHash } from 'node:crypto';
import { z } from 'zod';
import { astMiniRecordV1Schema, type AstMiniRecordV1 } from './ast-mini-record-v1.js';
import { structuralReferenceFactSchema, type StructuralReferenceFactV1 } from './structural-symbol.js';

const revision = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const relationKinds = ['CALLS', 'IMPORTS', 'EXPORTS', 'REFERENCES', 'IMPLEMENTS', 'EXTENDS', 'TESTS', 'DEPENDS_ON'] as const;

export const astRelationGraphV1Schema = z.object({
  schema: z.literal('atlas.ast-relation-graph.v1'),
  workspaceRevision: revision,
  graphProducerRevision: z.string().min(1),
  nodes: z.array(z.object({
    treeNodeId: z.string().min(1),
    upstreamNodeId: z.string().min(1),
    sourceRef: z.string().min(1),
    sourceRevision: revision,
    sourceContentDigest: revision,
  }).strict()),
  edges: z.array(z.object({
    sourceTreeNodeId: z.string().min(1),
    targetTreeNodeId: z.string().min(1),
    relation: z.enum(relationKinds),
    sourceRevision: revision,
    workspaceRevision: revision,
    evidenceRefs: z.array(z.string().min(1)).min(1),
  }).strict()),
  unresolved: z.array(z.object({ referenceId: z.string().min(1), reason: z.enum([
    'SOURCE_NODE_MISSING', 'SOURCE_NODE_AMBIGUOUS', 'SOURCE_REVISION_MISMATCH',
    'WORKSPACE_REVISION_MISMATCH', 'TARGET_NODE_MISSING', 'TARGET_NODE_AMBIGUOUS',
    'UNSUPPORTED_RELATION',
  ]) }).strict()),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  canonicalAuthority: z.literal(false),
}).strict();

export type AstRelationGraphV1 = z.infer<typeof astRelationGraphV1Schema>;

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function relationKind(value: StructuralReferenceFactV1['reference_kind']): AstRelationGraphV1['edges'][number]['relation'] | null {
  switch (value) {
    case 'call': return 'CALLS';
    case 'import': return 'IMPORTS';
    case 'export': return 'EXPORTS';
    case 'type_ref':
    case 'class_ref': return 'REFERENCES';
    case 'implements':
    case 'implementation': return 'IMPLEMENTS';
    case 'extends': return 'EXTENDS';
    case 'test_target': return 'TESTS';
    case 'read':
    case 'write':
    case 'route_handler': return 'DEPENDS_ON';
    default: return null;
  }
}

/**
 * Build a derived relation graph only from existing revision-qualified AST minis and reference
 * facts. Upstream node IDs are join locators, never promoted identity. Cycles are permitted.
 */
export function buildAstRelationGraphV1(input: {
  workspaceRevision: string;
  graphProducerRevision: string;
  nodes: readonly AstMiniRecordV1[];
  references: readonly StructuralReferenceFactV1[];
}): AstRelationGraphV1 {
  const workspaceRevision = revision.parse(input.workspaceRevision);
  const minis = input.nodes.map((node) => astMiniRecordV1Schema.parse(node));
  const references = input.references.map((fact) => structuralReferenceFactSchema.parse(fact));
  if (minis.some((node) => node.identity.workspaceRevision !== workspaceRevision)) {
    throw new Error('AST_RELATION_GRAPH_MIXED_WORKSPACE');
  }
  const treeNodeIds = minis.map((node) => node.node.treeNodeId);
  if (new Set(treeNodeIds).size !== treeNodeIds.length) {
    throw new Error('AST_RELATION_GRAPH_DUPLICATE_TREE_NODE_LOCATOR');
  }

  const byUpstream = new Map<string, AstMiniRecordV1[]>();
  for (const node of minis) {
    const key = node.node.upstreamNodeId;
    if (!key) continue;
    const rows = byUpstream.get(key) ?? [];
    rows.push(node);
    byUpstream.set(key, rows);
  }

  const edges = new Map<string, AstRelationGraphV1['edges'][number]>();
  const unresolved: AstRelationGraphV1['unresolved'] = [];
  for (const fact of references) {
    const relation = relationKind(fact.reference_kind);
    if (!relation) {
      unresolved.push({ referenceId: fact.reference_id, reason: 'UNSUPPORTED_RELATION' });
      continue;
    }
    if (fact.workspace_revision !== workspaceRevision) {
      unresolved.push({ referenceId: fact.reference_id, reason: 'WORKSPACE_REVISION_MISMATCH' });
      continue;
    }
    const sourceRows = byUpstream.get(fact.upstream_source_node_id) ?? [];
    if (sourceRows.length === 0) {
      unresolved.push({ referenceId: fact.reference_id, reason: 'SOURCE_NODE_MISSING' });
      continue;
    }
    if (sourceRows.length > 1) {
      unresolved.push({ referenceId: fact.reference_id, reason: 'SOURCE_NODE_AMBIGUOUS' });
      continue;
    }
    const source = sourceRows[0]!;
    if (source.identity.sourceRef !== fact.source_ref || source.identity.sourceRevision !== fact.source_revision) {
      unresolved.push({ referenceId: fact.reference_id, reason: 'SOURCE_REVISION_MISMATCH' });
      continue;
    }
    if (!fact.upstream_target_node_id) {
      unresolved.push({ referenceId: fact.reference_id, reason: 'TARGET_NODE_MISSING' });
      continue;
    }
    const targetRows = byUpstream.get(fact.upstream_target_node_id) ?? [];
    if (targetRows.length === 0) {
      unresolved.push({ referenceId: fact.reference_id, reason: 'TARGET_NODE_MISSING' });
      continue;
    }
    if (targetRows.length > 1) {
      unresolved.push({ referenceId: fact.reference_id, reason: 'TARGET_NODE_AMBIGUOUS' });
      continue;
    }
    const target = targetRows[0]!;
    const key = JSON.stringify([source.node.treeNodeId, target.node.treeNodeId, relation, fact.source_revision, workspaceRevision]);
    const prior = edges.get(key);
    const evidenceRefs = [...new Set([...(prior?.evidenceRefs ?? []), fact.reference_id, ...fact.evidence_refs])].sort();
    edges.set(key, {
      sourceTreeNodeId: source.node.treeNodeId,
      targetTreeNodeId: target.node.treeNodeId,
      relation,
      sourceRevision: fact.source_revision,
      workspaceRevision,
      evidenceRefs,
    });
  }

  const nodes = minis.filter((node) => node.node.upstreamNodeId).map((node) => ({
    treeNodeId: node.node.treeNodeId,
    upstreamNodeId: node.node.upstreamNodeId!,
      sourceRef: node.identity.sourceRef,
      sourceRevision: node.identity.sourceRevision,
      sourceContentDigest: node.identity.sourceContentDigest,
  })).sort((a, b) => a.treeNodeId.localeCompare(b.treeNodeId));
  const orderedEdges = [...edges.values()].sort((a, b) =>
    a.sourceTreeNodeId.localeCompare(b.sourceTreeNodeId)
    || a.targetTreeNodeId.localeCompare(b.targetTreeNodeId)
    || a.relation.localeCompare(b.relation));
  const orderedUnresolved = unresolved.sort((a, b) => a.referenceId.localeCompare(b.referenceId) || a.reason.localeCompare(b.reason));
  const graph = {
    schema: 'atlas.ast-relation-graph.v1' as const,
    workspaceRevision,
    graphProducerRevision: input.graphProducerRevision,
    nodes,
    edges: orderedEdges,
    unresolved: orderedUnresolved,
    checksum: sha256({ workspaceRevision, graphProducerRevision: input.graphProducerRevision, nodes, edges: orderedEdges, unresolved: orderedUnresolved }),
    canonicalAuthority: false as const,
  };
  return astRelationGraphV1Schema.parse(graph);
}
