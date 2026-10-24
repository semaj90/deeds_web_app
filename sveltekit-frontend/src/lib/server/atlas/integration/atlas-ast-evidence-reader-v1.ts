import { z } from 'zod';
import { pool } from '$lib/server/db/client.js';

const MAX_TREE_NODE_IDS = 100;

const AstEvidenceRowSchema = z.object({
  treeNodeId: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().nullable(),
  sourceContentHash: z.string().nullable(),
  nodeKind: z.string().min(1),
  qualifiedSymbol: z.string(),
  parserLanguage: z.string().min(1),
  startByte: z.union([z.number(), z.string()]).nullable(),
  endByte: z.union([z.number(), z.string()]).nullable(),
});

export type AtlasAstEvidenceRowV1 = z.infer<typeof AstEvidenceRowSchema>;

const CanonicalAstEvidenceRowSchema = z.object({
  treeNodeId: z.string().min(1),
  symbolVersionId: z.string().min(1),
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  sourceContentHash: z.string().min(1),
  startByte: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/).transform(Number)]),
  endByte: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/).transform(Number)]),
}).strict().superRefine((row, ctx) => {
  if (row.endByte < row.startByte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endByte'], message: 'AST_EVIDENCE_SPAN_INVALID' });
  }
});

export type AtlasCanonicalAstEvidenceV1 = z.infer<typeof CanonicalAstEvidenceRowSchema>;

export interface AtlasCanonicalAstEvidenceRequestV1 {
  treeNodeId: string;
  symbolVersionId?: string | null;
  canonicalId: string;
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
}

export interface AtlasAstEvidenceRequestV1 {
  treeNodeIds: readonly string[];
  sourceRevision: string;
}

export interface AtlasAstEvidenceReceiptV1 {
  requestedTreeNodeIds: number;
  matchedTreeNodeIds: number;
  rows: readonly AtlasAstEvidenceRowV1[];
  readOnly: true;
  canonicalAuthority: false;
  writesPerformed: false;
}

export class AtlasAstEvidenceReadErrorV1 extends Error {
  constructor(readonly code:
    | 'AST_EVIDENCE_INPUT_INVALID'
    | 'AST_EVIDENCE_REVISION_MISSING'
    | 'AST_EVIDENCE_SCHEMA_REJECTED'
    | 'AST_EVIDENCE_CANONICAL_BINDING_MISSING'
    | 'AST_EVIDENCE_CANONICAL_BINDING_AMBIGUOUS') {
    super(code);
    this.name = 'AtlasAstEvidenceReadErrorV1';
  }
}

/**
 * Strict read-side owner for OaK GET_AST_EVIDENCE.
 * Tree-sitter/AST-grep remain producers; this function only reads persisted,
 * revision-qualified observations and never creates or promotes identity.
 */
export async function readAtlasAstEvidenceV1(
  request: AtlasAstEvidenceRequestV1,
): Promise<AtlasAstEvidenceReceiptV1> {
  if (!request.sourceRevision?.trim()) {
    throw new AtlasAstEvidenceReadErrorV1('AST_EVIDENCE_REVISION_MISSING');
  }

  const treeNodeIds = [...new Set(request.treeNodeIds.filter((id) => typeof id === 'string' && id.length > 0))]
    .slice(0, MAX_TREE_NODE_IDS);
  if (treeNodeIds.length === 0) {
    throw new AtlasAstEvidenceReadErrorV1('AST_EVIDENCE_INPUT_INVALID');
  }

  const result = await pool.query<Record<string, unknown>>(
    `
      SELECT a.tree_node_id AS "treeNodeId",
             COALESCE(sr.relative_path, a.relative_path, a.source_ref_key) AS "sourceRef",
             a.source_revision AS "sourceRevision",
             a.source_content_hash AS "sourceContentHash",
             a.node_kind AS "nodeKind",
             a.qualified_symbol AS "qualifiedSymbol",
             a.parser_language AS "parserLanguage",
             a.start_byte AS "startByte",
             a.end_byte AS "endByte"
      FROM atlas_ast_nodes a
      LEFT JOIN atlas_source_refs sr
        ON sr.source_ref_key = a.source_ref_key
       AND sr.repo_id = a.repo_id
      WHERE a.tree_node_id = ANY($1::text[])
      ORDER BY a.tree_node_id ASC
    `,
    [treeNodeIds],
  );

  const rows: AtlasAstEvidenceRowV1[] = [];
  for (const raw of result.rows) {
    const parsed = AstEvidenceRowSchema.safeParse(raw);
    if (!parsed.success || parsed.data.sourceRevision !== request.sourceRevision) {
      throw new AtlasAstEvidenceReadErrorV1(
        parsed.success ? 'AST_EVIDENCE_REVISION_MISSING' : 'AST_EVIDENCE_SCHEMA_REJECTED',
      );
    }
    rows.push(parsed.data);
  }

  return {
    requestedTreeNodeIds: treeNodeIds.length,
    matchedTreeNodeIds: rows.length,
    rows,
    readOnly: true,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

export async function readAtlasCanonicalAstEvidenceV1(
  request: AtlasCanonicalAstEvidenceRequestV1,
): Promise<AtlasCanonicalAstEvidenceV1> {
  if (!request.treeNodeId?.trim() || !request.canonicalId?.trim() || !request.packetKey?.trim()
    || !request.sourceRef?.trim() || !request.sourceRevision?.trim() || !request.workspaceRevision?.trim()) {
    throw new AtlasAstEvidenceReadErrorV1('AST_EVIDENCE_INPUT_INVALID');
  }

  const result = await pool.query<Record<string, unknown>>(
    `
      SELECT a.tree_node_id AS "treeNodeId",
             sv.symbol_version_id AS "symbolVersionId",
             sv.stable_symbol_id AS "canonicalId",
             sv.packet_key AS "packetKey",
             sv.source_ref AS "sourceRef",
             sv.source_revision AS "sourceRevision",
             sv.workspace_revision AS "workspaceRevision",
             a.source_content_hash AS "sourceContentHash",
             sv.byte_start AS "startByte",
             sv.byte_end AS "endByte"
      FROM atlas_ast_nodes a
      JOIN atlas_symbol_versions sv
        ON sv.upstream_node_id = a.tree_node_id
       AND sv.source_revision = a.source_revision
       AND sv.source_ref = $4
      WHERE a.tree_node_id = $1
        AND sv.stable_symbol_id = $2
        AND sv.packet_key = $3
        AND sv.source_revision = $5
        AND sv.workspace_revision = $6
      ORDER BY sv.symbol_version_id ASC
      LIMIT 2
    `,
    [request.treeNodeId, request.canonicalId, request.packetKey, request.sourceRef, request.sourceRevision, request.workspaceRevision],
  );

  if (result.rows.length === 0) {
    throw new AtlasAstEvidenceReadErrorV1('AST_EVIDENCE_CANONICAL_BINDING_MISSING');
  }
  if (result.rows.length !== 1) {
    throw new AtlasAstEvidenceReadErrorV1('AST_EVIDENCE_CANONICAL_BINDING_AMBIGUOUS');
  }
  const parsed = CanonicalAstEvidenceRowSchema.safeParse(result.rows[0]);
  if (!parsed.success) throw new AtlasAstEvidenceReadErrorV1('AST_EVIDENCE_SCHEMA_REJECTED');
  if (request.symbolVersionId && parsed.data.symbolVersionId !== request.symbolVersionId) {
    throw new AtlasAstEvidenceReadErrorV1('AST_EVIDENCE_CANONICAL_BINDING_MISSING');
  }
  return parsed.data;
}
