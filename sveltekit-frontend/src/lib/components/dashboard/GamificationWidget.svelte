<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import ProgressBar from '$lib/components/ui/gaming/n64/ProgressBar.svelte';
	import DetectiveRankBadge from './DetectiveRankBadge.svelte';
	import AchievementBadge from './AchievementBadge.svelte';
	import { computeGamification, type GamificationInput } from './gamification-types.js';

	interface DashboardStats {
		activeCases: number;
		totalEvidence: number;
		personsOfInterest: number;
		totalCitations: number;
		recentActivity: number;
		knowledgeBase: { total: number; glossary: number; statutes: number; precedents: number };
	}

	interface RecentCase {
		id: string;
		title: string;
		caseNumber: string;
		status: string;
		priority: string;
		updatedAt: string;
	}

	interface Props {
		stats: DashboardStats;
		recentCases: RecentCase[];
	}

	let { stats, recentCases }: Props = $props();

	let gamification = $derived.by(() => {
		const closedCases = recentCases.filter((c) => c.status === 'closed').length;
		const lastActivityDate = recentCases.length > 0 ? recentCases[0].updatedAt : null;

		const input: GamificationInput = {
			activeCases: stats.activeCases,
			totalCases: stats.recentActivity,
			totalEvidence: stats.totalEvidence,
			personsOfInterest: stats.personsOfInterest,
			totalCitations: stats.totalCitations,
			knowledgeBaseTotal: stats.knowledgeBase?.total ?? 0,
			closedCases,
			lastActivityDate,
		};

		return computeGamification(input);
	});
</script>

<div class="gamification-section">
	<div class="section-header-row">
		<Icon name="trophy" size={14} />
		<span class="section-label">Investigation Progress</span>
	</div>

	<div class="gamification-grid">
		<!-- Column 1: Rank Badge -->
		<div class="rank-col">
			<DetectiveRankBadge rank={gamification.rank} xp={gamification.xp} />
			<p class="rank-desc">{gamification.rank.description}</p>
		</div>

		<!-- Column 2: XP Progress + Streak -->
		<div class="xp-col">
			<div class="gamification-xp">
				<ProgressBar
					value={gamification.xpProgress}
					max={100}
					label={gamification.nextRank ? `${gamification.rank.title} → ${gamification.nextRank.title}` : 'MAX RANK'}
					showPercentage
					barHeight={20}
					enableProgressGlow
					enableTextureStreaming
					enableLighting
				/>
			</div>
			<div class="xp-stats-row">
				<span class="xp-text">
					{gamification.xp.toLocaleString()}
					{#if gamification.nextRank}
						/ {gamification.nextRank.minXP.toLocaleString()} XP
					{:else}
						XP
					{/if}
				</span>
				{#if gamification.xpToNextRank > 0}
					<span class="xp-remaining">{gamification.xpToNextRank.toLocaleString()} to next rank</span>
				{/if}
			</div>
			<div class="streak-row">
				<Icon name="flame" size={14} />
				<span class="streak-text">
					{gamification.streak > 0 ? `${gamification.streak}-day streak` : 'No active streak'}
				</span>
			</div>
		</div>

		<!-- Column 3: Achievements -->
		<div class="ach-col">
			<div class="ach-counter">{gamification.allUnlocked}/{gamification.totalAchievements}</div>
			<div class="ach-grid">
				{#each gamification.achievements as { achievement, unlocked }}
					<AchievementBadge {achievement} {unlocked} />
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	.gamification-section {
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(212, 199, 163, 0.12);
		border-radius: 10px;
		padding: 1.25rem;
	}

	.section-header-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1rem;
		color: rgba(212, 199, 163, 0.6);
	}

	.section-label {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}

	.gamification-grid {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 1.5rem;
		align-items: center;
	}

	/* Column 1: Rank */
	.rank-col {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.rank-desc {
		font-size: 0.6rem;
		color: rgba(212, 199, 163, 0.35);
		text-align: center;
		max-width: 100px;
		line-height: 1.3;
		margin: 0;
	}

	/* Column 2: XP */
	.xp-col {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
	}

	.gamification-xp :global(.n64-progress) {
		background: rgba(212, 199, 163, 0.08) !important;
	}

	.gamification-xp :global(.progress-bar) {
		background: linear-gradient(90deg, #c8a84b, #d4c7a3) !important;
		box-shadow: 0 0 12px rgba(200, 168, 75, 0.4) !important;
	}

	.gamification-xp :global(.n64-progress.complete .progress-bar) {
		background: linear-gradient(90deg, #a78bfa, #c4b5fd) !important;
		box-shadow: 0 0 15px rgba(167, 139, 250, 0.5) !important;
	}

	.gamification-xp :global(.progress-label),
	.gamification-xp :global(.progress-value) {
		color: rgba(212, 199, 163, 0.7) !important;
		font-size: 0.7rem !important;
	}

	.xp-stats-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.xp-text {
		font-size: 0.75rem;
		font-family: 'Rajdhani', 'Courier New', monospace;
		color: #c8a84b;
		font-weight: 600;
	}

	.xp-remaining {
		font-size: 0.6rem;
		color: rgba(212, 199, 163, 0.35);
	}

	.streak-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: rgba(212, 199, 163, 0.5);
	}

	.streak-text {
		font-size: 0.65rem;
		letter-spacing: 0.03em;
	}

	/* Column 3: Achievements */
	.ach-col {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.ach-counter {
		font-size: 0.65rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.5);
		letter-spacing: 0.05em;
	}

	.ach-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: center;
		max-width: 200px;
	}

	/* Responsive: stack on mobile */
	@media (max-width: 768px) {
		.gamification-grid {
			grid-template-columns: 1fr;
			text-align: center;
		}

		.rank-col {
			order: 1;
		}

		.xp-col {
			order: 2;
		}

		.ach-col {
			order: 3;
		}

		.ach-grid {
			max-width: none;
		}
	}
</style>
