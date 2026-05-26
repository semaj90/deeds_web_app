export type GraphRagStageName =
  | 'structural_path_search'
  | 'semantic_vector_search'
  | 'som_topology_expansion'
  | 'pathway_card_materialization';

export interface GraphRagStage {
  stage: number;
  name: GraphRagStageName;
  tool: string;
  status: 'implemented' | 'observation-only' | 'deferred';
  intent: string;
  outputs: string[];
  recommendation: string;
}

export interface GraphRagStagePlanInput {
  startKey: string;
  endKey: string;
  maxHops: number;
  somRadius?: number;
  clusterCardLimit?: number;
}

export interface GraphRagStagePlan {
  query: {
    startKey: string;
    endKey: string;
    maxHops: number;
  };
  stages: GraphRagStage[];
  notes: string[];
}

export function buildGraphRagStagePlan(input: GraphRagStagePlanInput): GraphRagStagePlan {
  const somRadius = input.somRadius ?? 1;
  const clusterCardLimit = input.clusterCardLimit ?? 3;

  return {
    query: {
      startKey: input.startKey,
      endKey: input.endKey,
      maxHops: input.maxHops,
    },
    stages: [
      {
        stage: 1,
        name: 'structural_path_search',
        tool: 'graph.semantic_path_synthesis',
        status: 'implemented',
        intent: 'Find the shortest structural path between anchors before any GPU or vector expansion.',
        outputs: ['path nodes', 'edge types', 'graph narrative seed'],
        recommendation: 'Use Neo4j as the structural truth source; keep path scoring separate from materialization.',
      },
      {
        stage: 2,
        name: 'semantic_vector_search',
        tool: 'graph.semantic_path_synthesis',
        status: 'implemented',
        intent: 'Hydrate the structural path with semantic summaries, authority, and risk context from Postgres/Qdrant.',
        outputs: ['node summaries', 'authority scores', 'cross-cluster signals'],
        recommendation: 'Use Qdrant/pgvector as the semantic neighborhood layer; do not replace graph truth with vectors.',
      },
      {
        stage: 3,
        name: 'som_topology_expansion',
        tool: 'topology.search_som_neighborhood',
        status: 'implemented',
        intent: 'Expand around the BMU and SOM radius to catch topological neighbors that the shortest path misses.',
        outputs: ['BMU anchor', 'radius neighborhood', 'som cells'],
        recommendation: `Use SOM radius expansion as a bounded topology layer; keep radius at ${somRadius} until eval logs justify widening.`,
      },
      {
        stage: 4,
        name: 'pathway_card_materialization',
        tool: 'graph.materialize_pathway',
        status: 'implemented',
        intent: 'Persist the synthesized pathway as a durable card after the path has been scored and reviewed.',
        outputs: ['pathway card', 'Redis hot copy', 'Qdrant payload'],
        recommendation: `Materialize only after stage 1-3 agree; default hot-card cap remains ${clusterCardLimit}.`,
      },
    ],
    notes: [
      'Do not collapse structural, semantic, topology, and persistence work into one algorithm.',
      'GPU accelerators are optional implementation details behind the stage contract, not the contract itself.',
      'Treat the stage plan as observation-first unless a caller explicitly opts into routing changes.',
    ],
  };
}
