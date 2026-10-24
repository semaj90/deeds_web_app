/**
 * Agent Gamification & EXP Progress Tracker
 *
 * Implements a Pokémon-style RPG progression system for autonomous agent actions:
 * - Level curve: Level = floor(sqrt(XP / 50)) + 1
 * - Action XP awards: triage, discovery, ontology grounding, mutation proposal, verification
 * - Safe read-only memory tracking with optional Redis/Valkey cache backing
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

// EXP thresholds for action types
export const EXP_TABLE: Record<AgentBattleAction['actionType'], number> = {
  scout: 25,       // ripgrep, find_files, web_search
  grounding: 40,   // oak_resolve_concept, glossary
  ast: 60,         // ast_query, analyze_imports
  proposal: 100,   // proposed mutation generated under LangGraph boundary
  verify: 250,     // smoke test / vitest passed
  failure: 10,     // failure / error triage (consolation XP for learning)
};

/** Compute level from total XP using a quadratic RPG curve */
export function calculateLevel(totalExp: number): number {
  if (totalExp <= 0) return 1;
  return Math.floor(Math.sqrt(totalExp / 50)) + 1;
}

/** Get total XP required to reach a specific level */
export function expForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.pow(level - 1, 2) * 50;
}

/** Get comprehensive rank info from total XP */
export function getAgentRankInfo(totalExp: number): AgentRankInfo {
  const level = calculateLevel(totalExp);
  const currentLevelBaseExp = expForLevel(level);
  const nextLevelRequiredExp = expForLevel(level + 1);
  const expInCurrentLevel = Math.max(0, totalExp - currentLevelBaseExp);
  const span = Math.max(1, nextLevelRequiredExp - currentLevelBaseExp);
  const progressPercent = Math.min(100, Math.round((expInCurrentLevel / span) * 100));

  let rankTitle = 'Apprentice Scout';
  let badgeIcon = 'shield';
  let badgeColor = '#60a5fa'; // Blue

  if (level >= 50) {
    rankTitle = 'Chief Atlas Grandmaster';
    badgeIcon = 'crown';
    badgeColor = '#c084fc'; // Purple/Legendary
  } else if (level >= 30) {
    rankTitle = 'Senior Codebase Detective';
    badgeIcon = 'badge-check';
    badgeColor = '#fbbf24'; // Gold
  } else if (level >= 20) {
    rankTitle = 'Kernel Specialist';
    badgeIcon = 'star';
    badgeColor = '#34d399'; // Emerald
  } else if (level >= 10) {
    rankTitle = 'Mastra Investigator';
    badgeIcon = 'shield-check';
    badgeColor = '#38bdf8'; // Sky
  } else if (level >= 5) {
    rankTitle = 'Codebase Sleuth';
    badgeIcon = 'search';
    badgeColor = '#94a3b8'; // Slate
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

/** Compute updated state after an agent action occurs */
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
  const rankInfo = getAgentRankInfo(newTotalExp);
  const isBugSlain = action.actionType === 'verify';

  return {
    rankInfo,
    recentActions: [newAction, ...currentState.recentActions.slice(0, 19)],
    streak: currentState.streak + 1,
    totalBugsSlain: currentState.totalBugsSlain + (isBugSlain ? 1 : 0),
  };
}

/** Default initial state */
export function getInitialAgentExpState(): AgentExpState {
  return {
    rankInfo: getAgentRankInfo(450), // Default starting as Level 4 Sleuth
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
