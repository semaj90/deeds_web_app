// Gamification types and computation logic
// Plain .ts — no runes, SSR-safe, zero framework imports

export interface DetectiveRank {
	id: string;
	title: string;
	minXP: number;
	maxXP: number;
	icon: string;
	color: string;
	description: string;
}

export interface Achievement {
	id: string;
	title: string;
	description: string;
	icon: string;
	color: string;
	condition: (stats: GamificationInput) => boolean;
}

export interface GamificationInput {
	activeCases: number;
	totalCases: number;
	totalEvidence: number;
	personsOfInterest: number;
	totalCitations: number;
	knowledgeBaseTotal: number;
	closedCases: number;
	lastActivityDate: string | null;
}

export interface AchievementStatus {
	achievement: Achievement;
	unlocked: boolean;
}

export interface GamificationState {
	xp: number;
	rank: DetectiveRank;
	nextRank: DetectiveRank | null;
	xpProgress: number;
	xpToNextRank: number;
	achievements: AchievementStatus[];
	streak: number;
	allUnlocked: number;
	totalAchievements: number;
}

// ── Rank Definitions ──

export const DETECTIVE_RANKS: DetectiveRank[] = [
	{ id: 'recruit', title: 'Recruit', minXP: 0, maxXP: 99, icon: 'shield', color: '#7c7c7c', description: 'Beginning your investigation career' },
	{ id: 'junior', title: 'Junior Detective', minXP: 100, maxXP: 499, icon: 'shield-check', color: '#60a5fa', description: 'Learning the fundamentals of case work' },
	{ id: 'detective', title: 'Detective', minXP: 500, maxXP: 1499, icon: 'badge', color: '#34d399', description: 'Proven investigator with solid case record' },
	{ id: 'senior', title: 'Senior Detective', minXP: 1500, maxXP: 4999, icon: 'badge-check', color: '#c8a84b', description: 'Veteran investigator, master of evidence' },
	{ id: 'inspector', title: 'Inspector', minXP: 5000, maxXP: 14999, icon: 'star', color: '#f59e0b', description: 'Elite rank — commanding complex investigations' },
	{ id: 'chief', title: 'Chief Inspector', minXP: 15000, maxXP: Infinity, icon: 'crown', color: '#a78bfa', description: 'Highest authority — complete mastery' },
];

// ── Achievement Definitions ──

export const ACHIEVEMENTS: Achievement[] = [
	{ id: 'first_case', title: 'First Case', description: 'Create your first case', icon: 'briefcase', color: '#c8a84b', condition: (s) => s.totalCases >= 1 },
	{ id: 'evidence_collector', title: 'Evidence Collector', description: 'Upload 10+ pieces of evidence', icon: 'file-search', color: '#60a5fa', condition: (s) => s.totalEvidence >= 10 },
	{ id: 'citation_scholar', title: 'Citation Scholar', description: 'Gather 25+ citations', icon: 'bookmark', color: '#a78bfa', condition: (s) => s.totalCitations >= 25 },
	{ id: 'person_tracker', title: 'Person Tracker', description: 'Track 5+ persons of interest', icon: 'users', color: '#f87171', condition: (s) => s.personsOfInterest >= 5 },
	{ id: 'knowledge_seeker', title: 'Knowledge Seeker', description: 'Knowledge base exceeds 100 entries', icon: 'database', color: '#34d399', condition: (s) => s.knowledgeBaseTotal > 100 },
	{ id: 'case_closer', title: 'Case Closer', description: 'Close at least 1 case', icon: 'check-circle', color: '#22d3ee', condition: (s) => s.closedCases >= 1 },
	{ id: 'power_user', title: 'Power User', description: 'Unlock all other achievements', icon: 'zap', color: '#f59e0b', condition: () => false },
];

// ── Computation Functions ──

export function computeXP(stats: GamificationInput): number {
	return (stats.totalCases * 100) + (stats.totalEvidence * 50) + (stats.totalCitations * 25) + (stats.personsOfInterest * 75);
}

export function getRankForXP(xp: number): DetectiveRank {
	for (let i = DETECTIVE_RANKS.length - 1; i >= 0; i--) {
		if (xp >= DETECTIVE_RANKS[i].minXP) return DETECTIVE_RANKS[i];
	}
	return DETECTIVE_RANKS[0];
}

export function getNextRank(currentRank: DetectiveRank): DetectiveRank | null {
	const idx = DETECTIVE_RANKS.findIndex((r) => r.id === currentRank.id);
	return idx < DETECTIVE_RANKS.length - 1 ? DETECTIVE_RANKS[idx + 1] : null;
}

export function computeXPProgress(xp: number, rank: DetectiveRank, nextRank: DetectiveRank | null): number {
	if (!nextRank) return 100;
	const rangeSize = nextRank.minXP - rank.minXP;
	const progress = xp - rank.minXP;
	return Math.min(Math.round((progress / rangeSize) * 100), 100);
}

export function computeStreak(lastActivityDate: string | null): number {
	if (!lastActivityDate) return 0;
	const last = new Date(lastActivityDate);
	const now = new Date();
	const diffMs = now.getTime() - last.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
	return diffDays <= 1 ? 1 : 0;
}

export function computeGamification(input: GamificationInput): GamificationState {
	const xp = computeXP(input);
	const rank = getRankForXP(xp);
	const nextRank = getNextRank(rank);
	const xpProgress = computeXPProgress(xp, rank, nextRank);
	const xpToNextRank = nextRank ? nextRank.minXP - xp : 0;

	const regularAchievements = ACHIEVEMENTS.filter((a) => a.id !== 'power_user');
	const regularStatuses: AchievementStatus[] = regularAchievements.map((a) => ({
		achievement: a,
		unlocked: a.condition(input),
	}));

	const allRegularUnlocked = regularStatuses.every((s) => s.unlocked);
	const powerUser = ACHIEVEMENTS.find((a) => a.id === 'power_user')!;
	const powerUserStatus: AchievementStatus = {
		achievement: powerUser,
		unlocked: allRegularUnlocked,
	};

	const achievements = [...regularStatuses, powerUserStatus];
	const allUnlocked = achievements.filter((a) => a.unlocked).length;
	const streak = computeStreak(input.lastActivityDate);

	return { xp, rank, nextRank, xpProgress, xpToNextRank, achievements, streak, allUnlocked, totalAchievements: achievements.length };
}
