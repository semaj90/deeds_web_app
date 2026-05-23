import { describe, expect, it } from 'vitest';
import { RoutingExplanationBuilder } from './routing-explanation.js';

describe('RoutingExplanationBuilder', () => {
  it('tracks cluster ids, aliases, redis cards, and task playbooks', () => {
    const explanation = new RoutingExplanationBuilder()
      .setProfile('ace_cache')
      .setProfileClusters([72, 94])
      .setProfileClusterAliases([72, 94])
      .setLexicalClusters([73])
      .setTopologyClusters([72])
      .setHotClusters([15, 18])
      .setTaskClusters([82])
      .setFinalClusters([72, 73, 94, 82])
      .addRedisCard(72)
      .addTaskDistillate('debug_hyperrag_routing')
      .build();

    expect(explanation.profile).toBe('ace_cache');
    expect(explanation.finalClusters).toEqual(['72', '73', '94', '82']);
    expect(explanation.clusterAliases).toEqual(expect.arrayContaining(['ace_context', 'retrieval_graph', 'redis_cache', 'grpc_mcp_tools']));
    expect(explanation.profileClusterAliases).toEqual(expect.arrayContaining(['ace_context', 'redis_cache']));
    expect(explanation.hotClusters).toEqual(['15', '18']);
    expect(explanation.redisCards).toEqual(['ace:cluster:72']);
    expect(explanation.taskDistillate).toBe('debug_hyperrag_routing');
  });
});
