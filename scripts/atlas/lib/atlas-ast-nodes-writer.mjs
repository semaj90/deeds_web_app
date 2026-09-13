/**
 * Minimal, additive writer into atlas_ast_nodes for NON-CODE document structure (JSON key paths,
 * Markdown headings) discovered by graphify-symbol-extractor-v1.mts. Reuses the exact tree_node_id
 * hash convention already established by sveltekit-frontend/scripts/atlas/populate-atlas-ast-nodes.mjs
 * (sha256 of repo_id/normalized_path/parser_language/node_kind/qualified_symbol/parent_key/
 * normalized_signature) rather than inventing a second identity scheme for the same table -- that
 * script is not reused directly because it sources from codebase_chunk_index with a code-only
 * KIND_MAP/VALID_KINDS allowlist, not from a live per-file structural walk.
 */
import { createHash } from 'node:crypto';

const REPO_ID = 'deeds-web-app';
const REPO_UUID = '00000000-0000-0000-0000-000000000000';

function normalizePath(p) {
  return (p || '').replace(/\\/g, '/').replace(/^\//, '').toLowerCase();
}

function treeNodeId(normalizedPath, parserLanguage, nodeKind, qualifiedSymbol, parentKey, normalizedSig) {
  const input = [REPO_ID, normalizedPath, parserLanguage, nodeKind, qualifiedSymbol, parentKey, normalizedSig].join('\x00');
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function structuralKey(normalizedPath, nodeKind, qualifiedSymbol) {
  return `${REPO_ID}/${normalizedPath}#${nodeKind}:${qualifiedSymbol}`;
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} client
 * @param {{ sourceRef: string, parserLanguage: string, parserName: string, sourceRevision?: string,
 *   workspaceId?: string, nodes: Array<{ kind: string, qualifiedSymbol: string, startByte: number,
 *   endByte: number, startLine: number, endLine: number, contentHash: string, parentIndex: number|null }> }} input
 * @returns {Promise<{ inserted: number, treeNodeIds: string[] }>}
 */
export async function writeAtlasAstNodes(client, input) {
  const np = normalizePath(input.sourceRef);
  const treeNodeIds = new Array(input.nodes.length).fill(null);
  let inserted = 0;

  for (let i = 0; i < input.nodes.length; i += 1) {
    const node = input.nodes[i];
    const parentTreeNodeId = node.parentIndex !== null && node.parentIndex !== undefined
      ? treeNodeIds[node.parentIndex]
      : null;
    const tid = treeNodeId(np, input.parserLanguage, node.kind, node.qualifiedSymbol, parentTreeNodeId ?? 'ROOT', '');
    treeNodeIds[i] = tid;
    const sk = structuralKey(np, node.kind, node.qualifiedSymbol);

    const result = await client.query(
      `INSERT INTO atlas_ast_nodes (
         tree_node_id, structural_key, repo_id, relative_path,
         node_kind, qualified_symbol, parser_language, normalized_signature,
         parent_tree_node_id, start_byte, end_byte, line_start, line_end,
         normalized_node_hash, source_content_hash, parser_name, parser_version,
         source_ref_key, workspace_id, source_revision
       ) VALUES (
         $1,$2,$3::uuid,$4,$5,$6,$7,'',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
       )
       ON CONFLICT DO NOTHING
       RETURNING tree_node_id`,
      [
        tid, sk, REPO_UUID, np,
        node.kind, node.qualifiedSymbol, input.parserLanguage,
        parentTreeNodeId, node.startByte, node.endByte, node.startLine, node.endLine,
        createHash('sha256').update(sk).digest('hex'), node.contentHash,
        input.parserName, 'source-text-encoding-01',
        `${np}#${node.kind}:${node.qualifiedSymbol}`,
        input.workspaceId ?? null, input.sourceRevision ?? null,
      ],
    );
    if ((result.rowCount ?? 0) > 0) inserted += 1;
  }

  return { inserted, treeNodeIds };
}
