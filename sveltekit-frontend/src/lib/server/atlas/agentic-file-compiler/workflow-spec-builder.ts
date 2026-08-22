import { ATLAS_WORKFLOW_SCHEMA, AtlasWorkflowSpecSchema, sha256Stable, type AtlasWorkflowSpecV1, type DagNodePlanV1, type DagEdgeV1 } from './contracts.js';

function reachable(start: string, target: Set<string>, edges: DagEdgeV1[]): boolean {
  const q = [start]; const seen = new Set<string>();
  while (q.length) { const node = q.shift()!; if (target.has(node)) return true; if (seen.has(node)) continue; seen.add(node); for (const edge of edges) if (edge.from === node) q.push(edge.to); }
  return false;
}

export function buildAtlasWorkflowSpec(input: Omit<AtlasWorkflowSpecV1, 'schema' | 'checksum'>): AtlasWorkflowSpecV1 {
  const nodeIds = new Set(input.nodes.map((n) => n.nodeId));
  if (nodeIds.size !== input.nodes.length) throw new Error('duplicate dag node id');
  for (const id of [...input.entryNodeIds, ...input.terminalNodeIds]) if (!nodeIds.has(id)) throw new Error(`unknown workflow node: ${id}`);
  for (const edge of input.edges) if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) throw new Error(`edge references unknown node: ${edge.from}->${edge.to}`);
  const validators = new Set(input.nodes.filter((n) => n.kind === 'VALIDATE').map((n) => n.nodeId));
  for (const mutation of input.nodes.filter((n) => n.kind === 'MUTATE')) if (!reachable(mutation.nodeId, validators, input.edges)) throw new Error(`mutation node ${mutation.nodeId} has no reachable validator`);
  const body = { schema: ATLAS_WORKFLOW_SCHEMA, ...input, nodes: [...input.nodes].sort((a,b)=>a.nodeId.localeCompare(b.nodeId)), edges: [...input.edges].sort((a,b)=>`${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`)) };
  return AtlasWorkflowSpecSchema.parse({ ...body, checksum: sha256Stable(body) });
}
export function buildDagNode(input: Omit<DagNodePlanV1, 'checksum'>): DagNodePlanV1 { return { ...input, checksum: sha256Stable(input) }; }
