/**
 * Agent Gamification & EXP Progress Tracker
 *
 * Implements a Pokémon-style RPG progression system for autonomous agent actions:
 * - Level curve: Level = floor(sqrt(XP / 50)) + 1
 * - Action XP awards: triage, discovery, ontology grounding, mutation proposal, verification
 */

export interface AgentBattleAction {
  id: string;
  timestamp: number;
  agentName: string;
  actionType: 'scout' | 'grounding' | 'ast' | 'proposal' | 'verify' | 'failure';
  toolName: string;
  description: string;
  expGained: number;
  superEffective?: boolean;
}

export interface AgentRankInfo {
  level: number;
  totalExp: number;
  currentLevelBaseExp: number;
  nextLevelRequiredExp: number;
  progressPercent: number;
  rankTitle: string;
  badgeIcon: string;
  badgeColor: string;
}

export interface AgentExpState {
  rankInfo: AgentRankInfo;
  recentActions: AgentBattleAction[];
  streak: number;
  totalBugsSlain: number;
}

export const EXP_TABLE: Record<AgentBattleAction['actionType'], number> = {
  scout: 25,
  grounding: 40,
  ast: 60,
  proposal: 100,
  verify: 250,
  failure: 10,
};

export function calculateLevel(totalExp: number): number {
  if (totalExp <= 0) return 1;
  return Math.floor(Math.sqrt(totalExp / 50)) + 1;
}

export function expForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.pow(level - 1, 2) * 50;
}

export function getAgentRankInfo(totalExp: number): AgentRankInfo {
  const level = calculateLevel(totalExp);
  const currentLevelBaseExp = expForLevel(level);
  const nextLevelRequiredExp = expForLevel(level + 1);
  const expInCurrentLevel = Math.max(0, totalExp - currentLevelBaseExp);
  const span = Math.max(1, nextLevelRequiredExp - currentLevelBaseExp);
  const progressPercent = Math.min(100, Math.round((expInCurrentLevel / span) * 100));

  let rankTitle = 'Apprentice Scout';
  let badgeIcon = 'shield';
  let badgeColor = '#60a5fa';

  if (level >= 50) {
    rankTitle = 'Chief Atlas Grandmaster';
    badgeIcon = 'crown';
    badgeColor = '#c084fc';
  } else if (level >= 30) {
    rankTitle = 'Senior Codebase Detective';
    badgeIcon = 'badge-check';
    badgeColor = '#fbbf24';
  } else if (level >= 20) {
    rankTitle = 'Kernel Specialist';
    badgeIcon = 'star';
    badgeColor = '#34d399';
  } else if (level >= 10) {
    rankTitle = 'Mastra Investigator';
    badgeIcon = 'shield-check';
    badgeColor = '#38bdf8';
  } else if (level >= 5) {
    rankTitle = 'Codebase Sleuth';
    badgeIcon = 'search';
    badgeColor = '#94a3b8';
  }

  return {
    level,
    totalExp,
    currentLevelBaseExp,
    nextLevelRequiredExp,
    progressPercent,
    rankTitle,
    badgeIcon,
    badgeColor,
  };
}

export function recordAgentBattleAction(
  currentState: AgentExpState,
  action: Omit<AgentBattleAction, 'id' | 'timestamp' | 'expGained'> & { customExp?: number }
): AgentExpState {
  const baseExp = action.customExp ?? EXP_TABLE[action.actionType] ?? 20;
  const expGained = action.superEffective ? Math.round(baseExp * 1.5) : baseExp;

  const newAction: AgentBattleAction = {
    id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    agentName: action.agentName,
    actionType: action.actionType,
    toolName: action.toolName,
    description: action.description,
    expGained,
    superEffective: action.superEffective,
  };

  const newTotalExp = currentState.rankInfo.totalExp + expGained;
  return {
    rankInfo: getAgentRankInfo(newTotalExp),
    recentActions: [newAction, ...currentState.recentActions.slice(0, 19)],
    streak: currentState.streak + 1,
    totalBugsSlain: currentState.totalBugsSlain + (action.actionType === 'verify' ? 1 : 0),
  };
}

export function getInitialAgentExpState(): AgentExpState {
  return {
    rankInfo: getAgentRankInfo(450),
    recentActions: [
      {
        id: 'seed_1',
        timestamp: Date.now() - 60000,
        agentName: 'Mastra Agent',
        actionType: 'grounding',
        toolName: 'oak_resolve_concept',
        description: 'Grounded legal evidence ontology on :8095 kernel',
        expGained: 60,
        superEffective: true,
      },
      {
        id: 'seed_2',
        timestamp: Date.now() - 120000,
        agentName: 'Autonomous Agent',
        actionType: 'proposal',
        toolName: 'cases_create',
        description: 'Shielded direct write: created PROPOSED_MUTATION receipt',
        expGained: 100,
        superEffective: false,
      },
      {
        id: 'seed_3',
        timestamp: Date.now() - 180000,
        agentName: 'Autonomous Agent',
        actionType: 'scout',
        toolName: 'ripgrep_search',
        description: 'Scouted codebase for ast-chunk routing patterns',
        expGained: 25,
        superEffective: false,
      },
    ],
    streak: 3,
    totalBugsSlain: 1,
  };
}
