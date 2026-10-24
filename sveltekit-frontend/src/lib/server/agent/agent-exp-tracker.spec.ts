import { describe, it, expect } from 'vitest';
import {
  calculateLevel,
  expForLevel,
  getAgentRankInfo,
  recordAgentBattleAction,
  getInitialAgentExpState,
  EXP_TABLE,
} from './agent-exp-tracker.js';

describe('AgentGamification EXP & Leveling Engine', () => {
  it('calculates level accurately using quadratic curve', () => {
    expect(calculateLevel(0)).toBe(1);
    expect(calculateLevel(49)).toBe(1);
    expect(calculateLevel(50)).toBe(2);
    expect(calculateLevel(200)).toBe(3);
    expect(calculateLevel(450)).toBe(4);
    expect(calculateLevel(5000)).toBe(11);
  });

  it('determines rank titles and boundary colors correctly', () => {
    const rankNovice = getAgentRankInfo(0);
    expect(rankNovice.level).toBe(1);
    expect(rankNovice.rankTitle).toBe('Apprentice Scout');

    const rankSleuth = getAgentRankInfo(500);
    expect(rankSleuth.level).toBe(4);
    expect(rankSleuth.rankTitle).toBe('Apprentice Scout');

    const rankInvestigator = getAgentRankInfo(4500);
    expect(rankInvestigator.level).toBe(10);
    expect(rankInvestigator.rankTitle).toBe('Mastra Investigator');

    const rankGrandmaster = getAgentRankInfo(125000);
    expect(rankGrandmaster.level).toBe(51);
    expect(rankGrandmaster.rankTitle).toBe('Chief Atlas Grandmaster');
  });

  it('awards base EXP and handles superEffective multipliers', () => {
    const initial = getInitialAgentExpState();
    const prevExp = initial.rankInfo.totalExp;

    const updated = recordAgentBattleAction(initial, {
      agentName: 'Mastra Triage',
      actionType: 'grounding',
      toolName: 'oak_resolve_concept',
      description: 'Resolved CURIE legal ontology',
      superEffective: true,
    });

    const expectedGain = Math.round(EXP_TABLE.grounding * 1.5); // 40 * 1.5 = 60
    expect(updated.rankInfo.totalExp).toBe(prevExp + expectedGain);
    expect(updated.recentActions[0].superEffective).toBe(true);
    expect(updated.streak).toBe(initial.streak + 1);
  });

  it('increments totalBugsSlain on verify action', () => {
    const initial = getInitialAgentExpState();
    const prevSlain = initial.totalBugsSlain;

    const updated = recordAgentBattleAction(initial, {
      agentName: 'Regression Guard',
      actionType: 'verify',
      toolName: 'vitest_run',
      description: 'Passed 46/46 unit tests',
    });

    expect(updated.totalBugsSlain).toBe(prevSlain + 1);
    expect(updated.recentActions[0].expGained).toBe(EXP_TABLE.verify);
  });
});
