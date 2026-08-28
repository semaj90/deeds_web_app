import { createHash } from 'node:crypto';

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stable(value), 'utf8').digest('hex');
}

function sorted(values, key) {
  return [...values].sort((a, b) => String(key(a)).localeCompare(String(key(b))));
}

export function buildAstStructuralRevisionV1(input) {
  if (!input?.workspaceRevision) throw new Error('AST_WORKSPACE_REVISION_REQUIRED');
  if (!input?.parserName || !input?.parserVersion) throw new Error('AST_PARSER_REVISION_REQUIRED');
  if (!input?.materializerRevision || !input?.edgeExtractorRevision) throw new Error('AST_MATERIALIZER_REVISION_REQUIRED');
  const sources = sorted(input.sources ?? [], (source) => `${source.sourceRef}:${source.sourceRevision}:${source.contentDigest ?? ''}`);
  if (sources.some((source) => !source.sourceRef || !source.sourceRevision || !source.contentDigest)) throw new Error('AST_SOURCE_BINDING_REQUIRED');
  const nodes = sorted(input.nodes ?? [], (node) => `${node.treeNodeId}:${node.structuralKey ?? ''}`);
  const edges = sorted(input.edges ?? [], (edge) => `${edge.from}:${edge.type}:${edge.to}`);
  const nodeTableChecksum = sha256(nodes);
  const edgeTableChecksum = sha256(edges);
  const payload = {
    schema: 'atlas.ast-structural-revision.v1',
    workspaceRevision: input.workspaceRevision,
    sources,
    parser: { name: input.parserName, version: input.parserVersion },
    materializerRevision: input.materializerRevision,
    edgeExtractorRevision: input.edgeExtractorRevision,
    nodeTableChecksum,
    edgeTableChecksum,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };
  return { ...payload, astGraphRevision: `sha256:${sha256(payload)}` };
}

