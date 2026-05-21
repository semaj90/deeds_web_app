// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildGraphRagStagePlan } from './graphrag-stage-plan.js';

describe('GraphRag stage plan', () => {
  it('splits the workflow into four explicit stages', () => {
    const plan = buildGraphRagStagePlan({
      startKey: 'src/lib/server/ace/context-assembler.ts',
      endKey: 'src/routes/api/clusters/cards/+server.ts',
      maxHops: 6,
      somRadius: 1,
      clusterCardLimit: 3,
    });

    expect(plan.stages).toHaveLength(4);
    expect(plan.stages.map((s) => s.name)).toEqual([
      'structural_path_search',
      'semantic_vector_search',
      'som_topology_expansion',
      'pathway_card_materialization',
    ]);
    expect(plan.stages[0]?.tool).toBe('graph.semantic_path_synthesis');
    expect(plan.stages[2]?.tool).toBe('topology.search_som_neighborhood');
    expect(plan.stages[3]?.tool).toBe('graph.materialize_pathway');
    expect(plan.notes[0]).toContain('Do not collapse structural, semantic, topology, and persistence work into one algorithm.');
  });
});
