import { describe, it, expect } from 'vitest';
import { RoutingExplanationBuilder } from '../../src/lib/server/retrieval/routing-explanation.js';

describe('RoutingExplanationBuilder', () => {
  it('should build a complete routing explanation', () => {
    const builder = new RoutingExplanationBuilder();
    const explanation = builder
      .setProfile('ace_cache')
      .setLexicalClusters([94])
      .setTopologyClusters([72, 73])
      .setProfileClusters([72, 94, 25])
      .setTaskClusters([72, 73, 94])
      .setFinalClusters([72, 73, 94, 25])
      .addTaskDistillate('debug_hyperrag_routing')
      .addRedisCard(72)
      .addRedisCard(94)
      .addFallback('No exact path match found, expanding to cluster neighbors')
      .build();

    expect(explanation.profile).toBe('ace_cache');
    expect(explanation.lexicalClusters).toEqual(['94']);
    expect(explanation.topologyClusters).toEqual(['72', '73']);
    expect(explanation.taskDistillate).toBe('debug_hyperrag_routing');
    expect(explanation.redisCards).toContain('ace:cluster:72');
    expect(explanation.fallbacks).toHaveLength(1);
  });
});
