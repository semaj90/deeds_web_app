#!/usr/bin/env node
/**
 * One-source AST node apply gate (review scaffold).
 *
 * This gate validates the authorization receipt and the write plan, then refuses.
 * It never opens a database connection and never writes. Enabling a real write is a
 * separate reviewed change that replaces the final refusal below.
 *
 * Usage:
 *   node scripts/atlas/one-source-ast-apply-gate-v1.mjs --plan=<write-plan.json> --authorization=<receipt.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function evaluateOneSourceApplyGate({ plan, authorization, planSha256, env }) {
  const reasons = [];
  if (plan?.schema !== 'atlas.one-source-ast-node-write-plan.v1') reasons.push('PLAN_SCHEMA_INVALID');
  if (plan?.writesPerformed !== false) reasons.push('PLAN_NOT_PLAN_ONLY');
  if (authorization?.schema !== 'atlas.one-source-ast-write-authorization.v1') reasons.push('AUTHORIZATION_SCHEMA_INVALID');
  if (authorization?.planSha256 !== planSha256) reasons.push('AUTHORIZATION_PLAN_CHECKSUM_MISMATCH');
  if (authorization?.sourceRef !== plan?.source?.sourceRef) reasons.push('AUTHORIZATION_SOURCE_MISMATCH');
  if (authorization?.workspaceRevision !== plan?.source?.workspaceRevision) reasons.push('AUTHORIZATION_WORKSPACE_MISMATCH');
  if (typeof authorization?.operator !== 'string' || authorization.operator.trim() === '') reasons.push('OPERATOR_REQUIRED');
  if (env?.ATLAS_AUTHORIZE_ONE_SOURCE_AST_WRITE !== '1') reasons.push('ENV_GATE_NOT_SET');
  const nodes = Array.isArray(authorization?.nodes) ? authorization.nodes : [];
  if (nodes.length === 0) reasons.push('AUTHORIZATION_NODES_REQUIRED');
  if (typeof env?.ATLAS_ONE_SOURCE_DATABASE_URL !== 'string' || env.ATLAS_ONE_SOURCE_DATABASE_URL.trim() === '') reasons.push('DATABASE_URL_REQUIRED');
  return { allowed: reasons.length === 0, reasons, nodes };
}

const SELECT_READBACK = `SELECT tree_node_id, start_byte, end_byte, source_revision, workspace_id
  FROM atlas_ast_nodes WHERE tree_node_id = ANY($1::text[])`;

/**
 * Transactional one-source apply. Runs inside one BEGIN/COMMIT; any mismatch rolls back.
 * `writeAtlasAstNodes` is injected so the transaction can be tested against a mock client.
 */
export async function applyOneSourceNodes({ client, writeNodes, plan, authorization, sourceBytes }) {
  const expectedRevision = plan.source.sourceRevision;
  const expectedWorkspace = plan.source.workspaceRevision;
  const nodes = authorization.nodes;
  for (const node of nodes) {
    const slice = Buffer.from(sourceBytes).subarray(node.startByte, node.endByte).toString('utf8');
    if (!slice.includes(node.qualifiedSymbol)) throw new Error(`NODE_SPAN_DOES_NOT_CONTAIN_SYMBOL:${node.qualifiedSymbol}`);
    if (`sha256:${sha256(sourceBytes)}` !== expectedRevision) throw new Error('SOURCE_BYTES_DIGEST_MISMATCH');
  }
  await client.query('BEGIN');
  try {
    const written = await writeNodes(client, {
      nodes: nodes.map((n) => ({ kind: n.kind, qualifiedSymbol: n.qualifiedSymbol, startByte: n.startByte, endByte: n.endByte,
        startLine: n.startLine, endLine: n.endLine, sourceContentDigest: sha256(sourceBytes), parentIndex: null })),
      parserLanguage: 'typescript', parserName: 'tree-sitter', parserVersion: authorization.parserVersion,
      workspaceId: authorization.workspaceId, sourceRevision: expectedRevision, sourceRef: plan.source.sourceRef,
    });
    if (written.inserted > nodes.length) throw new Error('INSERTED_MORE_THAN_EXPECTED');
    const readback = await client.query(SELECT_READBACK, [written.treeNodeIds.filter(Boolean)]);
    if (readback.rows.length !== nodes.length) throw new Error('READBACK_ROW_COUNT_MISMATCH');
    for (const row of readback.rows) {
      if (row.source_revision !== expectedRevision || row.workspace_id !== authorization.workspaceId) throw new Error('READBACK_REVISION_MISMATCH');
    }
    void expectedWorkspace;
    await client.query('COMMIT');
    return { committed: true, inserted: written.inserted, treeNodeIds: written.treeNodeIds };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const planPath = path.resolve(root, arg('--plan') ?? '');
  const authPath = path.resolve(root, arg('--authorization') ?? '');
  const sourcePath = path.resolve(root, arg('--source-bytes') ?? '');
  const planBytes = fs.readFileSync(planPath);
  const plan = JSON.parse(planBytes.toString('utf8'));
  const authorization = fs.existsSync(authPath) ? JSON.parse(fs.readFileSync(authPath, 'utf8')) : null;
  const gate = evaluateOneSourceApplyGate({ plan, authorization, planSha256: sha256(planBytes), env: process.env });
  // Reverted to refusal-only pending review: the guarded write path is not enabled from the CLI.
  const reasons = [...gate.reasons, 'WRITER_NOT_ENABLED_IN_THIS_RELEASE'];
  console.log(JSON.stringify({ status: 'APPLY_REFUSED', writesPerformed: false, sourcePath, reasons }, null, 2));
  process.exit(1);
}
