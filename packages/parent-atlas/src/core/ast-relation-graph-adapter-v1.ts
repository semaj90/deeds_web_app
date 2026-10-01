import { createHash } from 'node:crypto';
import { z } from 'zod';
import { buildAstMiniRecordV1, type AstMiniRecordV1 } from './ast-mini-record-v1.js';
import { buildAstRelationGraphV1, type AstRelationGraphV1 } from './ast-relation-graph-v1.js';
import type { StructuralExtractionFabricResultV1 } from './structural-extraction-fabric.js';

const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export type AstRelationGraphAdapterResultV1 =
  | { status: 'COMPILED'; nodes: AstMiniRecordV1[]; graph: AstRelationGraphV1; reason: null }
  | { status: 'DEFERRED'; nodes: []; graph: null; reason:
      | 'SOURCE_REVISION_NOT_BYTE_DIGEST'
      | 'SOURCE_REVISION_AUTHORITY_UNPROVEN'
      | 'NO_STRUCTURAL_EVIDENCE'
      | 'SOURCE_REVISION_BYTES_MISMATCH'
      | 'WORKSPACE_REVISION_NOT_CHECKSUM'
      | 'NON_NATIVE_NODE_LOCATOR'
      | 'CHUNK_SPAN_OR_DIGEST_MISMATCH' };

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function revisionDigest(bytes: Uint8Array): string {
  return `sha256:${digest(bytes)}`;
}

/**
 * Bounded adapter from the existing Graphify structural compiler output into the
 * noncanonical mini-record/relation-graph projection. It refuses legacy revision
 * tokens, compatibility node IDs, and any chunk whose span digest disagrees.
 */
export function compileAstRelationGraphAdapterV1(input: {
  fabric: StructuralExtractionFabricResultV1;
  sourceText: string;
  sourceRevision: string | null;
  workspaceRevision: string;
  graphProducerRevision: string;
}): AstRelationGraphAdapterResultV1 {
  if (!input.sourceRevision) {
    return { status: 'DEFERRED', nodes: [], graph: null, reason: 'SOURCE_REVISION_AUTHORITY_UNPROVEN' };
  }
  if (!sha256.safeParse(input.sourceRevision).success) {
    return { status: 'DEFERRED', nodes: [], graph: null, reason: 'SOURCE_REVISION_NOT_BYTE_DIGEST' };
  }
  if (!sha256.safeParse(input.workspaceRevision).success) {
    return { status: 'DEFERRED', nodes: [], graph: null, reason: 'WORKSPACE_REVISION_NOT_CHECKSUM' };
  }

  const sourceBytes = Buffer.from(input.sourceText, 'utf8');
  const sourceContentDigest = revisionDigest(sourceBytes);
  if (sourceContentDigest !== input.sourceRevision) {
    return { status: 'DEFERRED', nodes: [], graph: null, reason: 'SOURCE_REVISION_BYTES_MISMATCH' };
  }

  const nodes: AstMiniRecordV1[] = [];
  for (const chunk of input.fabric.chunks) {
    if (chunk.upstream_node_id.startsWith('compat:')) {
      return { status: 'DEFERRED', nodes: [], graph: null, reason: 'NON_NATIVE_NODE_LOCATOR' };
    }
    if (chunk.byte_end <= chunk.byte_start || digest(sourceBytes.subarray(chunk.byte_start, chunk.byte_end)) !== chunk.content_hash) {
      return { status: 'DEFERRED', nodes: [], graph: null, reason: 'CHUNK_SPAN_OR_DIGEST_MISMATCH' };
    }
    const qualifiedSymbol = [...chunk.parent_route, chunk.symbol_name ?? chunk.node_type].filter(Boolean).join('::');
    nodes.push(buildAstMiniRecordV1({
      sourceRef: chunk.source_ref,
      sourceRevision: input.sourceRevision,
      workspaceRevision: input.workspaceRevision,
      sourceContentDigest,
      treeNodeId: chunk.upstream_node_id,
      upstreamNodeId: chunk.upstream_node_id,
      nodeKind: chunk.kind || chunk.node_type,
      qualifiedSymbol,
      startByte: chunk.byte_start,
      endByte: chunk.byte_end,
      // The existing 8095 evidence contract reports zero-based source lines.
      startLine: chunk.start_line + 1,
      endLine: chunk.end_line + 1,
      producerName: 'treesitter_chunker',
      producerVersion: input.fabric.receipt.chunker_revision,
    }));
  }

  const graph = buildAstRelationGraphV1({
    workspaceRevision: input.workspaceRevision,
    graphProducerRevision: input.graphProducerRevision,
    nodes,
    references: input.fabric.reference_facts,
  });
  return { status: 'COMPILED', nodes, graph, reason: null };
}
