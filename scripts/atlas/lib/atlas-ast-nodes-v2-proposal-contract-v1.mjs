import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

const SHA256_REVISION = /^sha256:[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NODE_KINDS = new Set([
  'file', 'module', 'class', 'interface', 'type', 'function', 'method', 'constructor', 'parameter',
  'route', 'schema', 'auth_guard', 'test', 'call_site', 'import', 'export', 'heading', 'field',
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function requireString(value, code) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(code);
  return value;
}

function utf8BoundaryToCoordinates(source, byteOffset) {
  const prefix = source.subarray(0, byteOffset);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(prefix);
  } catch {
    throw new Error('AST_V2_SPAN_SPLITS_UTF8_CODE_POINT');
  }
  const line = 1 + (text.match(/\n/g) ?? []).length;
  return { utf16: text.length, line };
}

function validatePath(namespace, relativePath) {
  if (!['REPO_ROOT', 'FRONTEND_ROOT'].includes(namespace)) throw new Error('AST_V2_PATH_NAMESPACE_INVALID');
  requireString(relativePath, 'AST_V2_RELATIVE_PATH_REQUIRED');
  if (relativePath.includes('\\') || relativePath.startsWith('/') || relativePath.includes('\0') ||
      relativePath.split('/').some(segment => segment === '' || segment === '.' || segment === '..') ||
      /^[a-z]:/i.test(relativePath)) {
    throw new Error('AST_V2_RELATIVE_PATH_INVALID');
  }
}

function canonicalNodeId(identity) {
  return sha256(Buffer.from(JSON.stringify([
    'atlas.ast-node.v2.identity.v2',
    identity.repoId,
    identity.workspaceId,
    identity.workspaceRevision,
    identity.pathNamespace,
    identity.relativePath,
    identity.sourceRevision,
    identity.parserName,
    identity.parserVersion,
    identity.parserLanguage,
    identity.grammarVersion,
    identity.extractionContractRevision,
    identity.nodeKind,
    identity.qualifiedSymbol,
    identity.parentTreeNodeId,
    identity.occurrence,
    identity.startByte,
    identity.endByte,
  ]), 'utf8'));
}

export function buildAtlasAstNodesV2ProposalV1(input) {
  const sourceBytes = input?.sourceBytes;
  if (!(sourceBytes instanceof Uint8Array)) throw new Error('AST_V2_SOURCE_BYTES_REQUIRED');
  const source = Buffer.from(sourceBytes);
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(source);
  } catch {
    throw new Error('AST_V2_SOURCE_UTF8_INVALID');
  }

  if (!UUID.test(input.repoId ?? '') || /^0{8}-0{4}-0{4}-0{4}-0{12}$/i.test(input.repoId)) throw new Error('AST_V2_REPOSITORY_ID_INVALID');
  requireString(input.workspaceId, 'AST_V2_WORKSPACE_ID_REQUIRED');
  if (!SHA256_REVISION.test(input.workspaceRevision ?? '')) throw new Error('AST_V2_WORKSPACE_REVISION_INVALID');
  const exactSourceRevision = `sha256:${sha256(source)}`;
  if (input.sourceRevision !== exactSourceRevision) throw new Error('AST_V2_SOURCE_REVISION_MISMATCH');
  validatePath(input.pathNamespace, input.relativePath);
  requireString(input.parserName, 'AST_V2_PARSER_NAME_REQUIRED');
  requireString(input.parserVersion, 'AST_V2_PARSER_VERSION_REQUIRED');
  requireString(input.parserLanguage, 'AST_V2_PARSER_LANGUAGE_REQUIRED');
  requireString(input.grammarVersion, 'AST_V2_GRAMMAR_VERSION_REQUIRED');
  if (!SHA256_REVISION.test(input.extractionContractRevision ?? '')) throw new Error('AST_V2_EXTRACTION_REVISION_INVALID');
  if (!Array.isArray(input.nodes) || input.nodes.length === 0) throw new Error('AST_V2_NODES_REQUIRED');

  const normalizedNodes = input.nodes.map((node, index) => {
    if (!node || !NODE_KINDS.has(node.nodeKind)) throw new Error(`AST_V2_NODE_KIND_INVALID:${index}`);
    if (typeof node.qualifiedSymbol !== 'string') throw new Error(`AST_V2_SYMBOL_INVALID:${index}`);
    if (!Number.isSafeInteger(node.occurrence) || node.occurrence < 0) throw new Error(`AST_V2_OCCURRENCE_INVALID:${index}`);
    if (!Number.isSafeInteger(node.startByte) || !Number.isSafeInteger(node.endByte) ||
        node.startByte < 0 || node.endByte < node.startByte || node.endByte > source.length) {
      throw new Error(`AST_V2_BYTE_SPAN_INVALID:${index}`);
    }
    if (node.parentIndex !== null && (!Number.isSafeInteger(node.parentIndex) || node.parentIndex < 0 || node.parentIndex >= input.nodes.length || node.parentIndex === index)) {
      throw new Error(`AST_V2_PARENT_INDEX_INVALID:${index}`);
    }
    const start = utf8BoundaryToCoordinates(source, node.startByte);
    const end = utf8BoundaryToCoordinates(source, node.endByte);
    if (node.startUtf16 !== start.utf16 || node.endUtf16 !== end.utf16) throw new Error(`AST_V2_UTF16_SPAN_MISMATCH:${index}`);
    if (node.lineStart !== start.line || node.lineEnd !== end.line) throw new Error(`AST_V2_LINE_SPAN_MISMATCH:${index}`);
    return { ...node };
  });

  const siblingKeys = new Set();
  for (let index = 0; index < normalizedNodes.length; index += 1) {
    const node = normalizedNodes[index];
    const key = JSON.stringify([node.parentIndex, node.nodeKind, node.qualifiedSymbol, node.occurrence]);
    if (siblingKeys.has(key)) throw new Error(`AST_V2_DUPLICATE_SIBLING_OCCURRENCE:${index}`);
    siblingKeys.add(key);
  }

  const ids = new Array(normalizedNodes.length);
  const visiting = new Set();
  const resolveId = index => {
    if (ids[index]) return ids[index];
    if (visiting.has(index)) throw new Error(`AST_V2_PARENT_CYCLE:${index}`);
    visiting.add(index);
    const node = normalizedNodes[index];
    let parentTreeNodeId = null;
    if (node.parentIndex !== null) {
      const parent = normalizedNodes[node.parentIndex];
      if (parent.startByte > node.startByte || parent.endByte < node.endByte) throw new Error(`AST_V2_PARENT_SPAN_NOT_CONTAINING:${index}`);
      parentTreeNodeId = resolveId(node.parentIndex);
    }
    ids[index] = canonicalNodeId({
      repoId: input.repoId.toLowerCase(),
      workspaceId: input.workspaceId,
      workspaceRevision: input.workspaceRevision,
      pathNamespace: input.pathNamespace,
      relativePath: input.relativePath,
      sourceRevision: exactSourceRevision,
      parserName: input.parserName,
      parserVersion: input.parserVersion,
      parserLanguage: input.parserLanguage,
      grammarVersion: input.grammarVersion,
      extractionContractRevision: input.extractionContractRevision,
      nodeKind: node.nodeKind,
      qualifiedSymbol: node.qualifiedSymbol,
      parentTreeNodeId,
      occurrence: node.occurrence,
      startByte: node.startByte,
      endByte: node.endByte,
    });
    visiting.delete(index);
    return ids[index];
  };

  const nodes = normalizedNodes.map((node, index) => {
    const parentTreeNodeId = node.parentIndex === null ? null : resolveId(node.parentIndex);
    return {
      treeNodeId: resolveId(index),
      parentTreeNodeId,
      nodeKind: node.nodeKind,
      qualifiedSymbol: node.qualifiedSymbol,
      occurrence: node.occurrence,
      startByte: node.startByte,
      endByte: node.endByte,
      sourceSpanSha256: `sha256:${sha256(source.subarray(node.startByte, node.endByte))}`,
      startUtf16: node.startUtf16,
      endUtf16: node.endUtf16,
      lineStart: node.lineStart,
      lineEnd: node.lineEnd,
    };
  });
  if (new Set(nodes.map(node => node.treeNodeId)).size !== nodes.length) throw new Error('AST_V2_NODE_ID_COLLISION');
  const roots = normalizedNodes.filter(node => node.parentIndex === null);
  if (roots.length !== 1 || roots[0].nodeKind !== 'file' || roots[0].startByte !== 0 || roots[0].endByte !== source.length) {
    throw new Error('AST_V2_FILE_ROOT_REQUIRED');
  }
  nodes.sort((left, right) => left.startByte - right.startByte || right.endByte - left.endByte ||
    (left.nodeKind < right.nodeKind ? -1 : left.nodeKind > right.nodeKind ? 1 : 0) ||
    (left.qualifiedSymbol < right.qualifiedSymbol ? -1 : left.qualifiedSymbol > right.qualifiedSymbol ? 1 : 0) || left.occurrence - right.occurrence);

  const proposal = {
    schema: 'atlas.ast-nodes-v2-proposal.v1',
    status: 'DRY_RUN_VALIDATED_NOT_INDEXED',
    canonicalAuthority: false,
    writesPerformed: false,
    identity: {
      repoId: input.repoId.toLowerCase(),
      workspaceId: input.workspaceId,
      identityRevision: 'atlas.ast-node.v2.identity.v2',
      workspaceRevision: input.workspaceRevision,
      pathNamespace: input.pathNamespace,
      relativePath: input.relativePath,
      sourceRevision: exactSourceRevision,
      sourceByteLength: source.length,
      sourceContentDigest: exactSourceRevision,
      parserName: input.parserName,
      parserVersion: input.parserVersion,
      parserLanguage: input.parserLanguage,
      grammarVersion: input.grammarVersion,
      extractionContractRevision: input.extractionContractRevision,
    },
    nodes,
    unresolved: { packetKey: true },
  };
  proposal.proposalChecksum = `sha256:${sha256(Buffer.from(JSON.stringify([
    proposal.schema,
    proposal.identity,
    proposal.nodes,
    proposal.unresolved,
  ]), 'utf8'))}`;
  return proposal;
}
