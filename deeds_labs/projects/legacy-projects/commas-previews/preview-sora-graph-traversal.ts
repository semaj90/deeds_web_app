// Preview-only, minimal skeleton for sora-graph-traversal to satisfy typechecker
export type NodeId = string;
export interface SoraTraversalOptions { depth?: number }

export class SoraGraphTraversal {
  constructor(public options: SoraTraversalOptions = {}) {}

  traverseGraph(start: NodeId, depth = 3): Promise<NodeId[]> {
    // preview stub: real implementation is in source
    return Promise.resolve([start]);
  }

  async runReinforcementEpisode(seedNodes: NodeId[]): Promise<void> {
    // no-op preview
  }
}

export default SoraGraphTraversal;
