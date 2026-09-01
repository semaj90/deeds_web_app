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
  constructor(readonly code: 'AST_EVIDENCE_INPUT_INVALID' | 'AST_EVIDENCE_REVISION_MISSING' | 'AST_EVIDENCE_SCHEMA_REJECTED') {
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
