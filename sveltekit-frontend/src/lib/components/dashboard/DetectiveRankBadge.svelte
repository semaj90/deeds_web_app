<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { DetectiveRank } from './gamification-types.js';

	interface Props {
		rank: DetectiveRank;
		xp: number;
		size?: 'sm' | 'md' | 'lg';
	}

	let { rank, xp, size = 'md' }: Props = $props();

	const sizeMap = { sm: 48, md: 72, lg: 96 };
	const iconSizeMap = { sm: 18, md: 26, lg: 34 };
	let dim = $derived(sizeMap[size]);
	let iconSize = $derived(iconSizeMap[size]);
</script>

<div class="rank-container">
	<div
		class="rank-badge rank-{size}"
		style="
			--rank-color: {rank.color};
			--dim: {dim}px;
		"
	>
		<Icon name={rank.icon} size={iconSize} />
	</div>
	<span class="rank-title" style="color: {rank.color};">{rank.title}</span>
	<span class="rank-xp">{xp.toLocaleString()} XP</span>
</div>

<style>
	.rank-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
	}

	.rank-badge {
		width: var(--dim);
		height: var(--dim);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px solid var(--rank-color);
		background: radial-gradient(circle at 40% 35%, rgba(255, 255, 255, 0.06), transparent 60%),
			rgba(0, 0, 0, 0.4);
		color: var(--rank-color);
		animation: rank-pulse 3s ease-in-out infinite;
		position: relative;
	}

	@keyframes rank-pulse {
		0%, 100% { box-shadow: 0 0 12px color-mix(in srgb, var(--rank-color) 20%, transparent); }
		50% { box-shadow: 0 0 28px color-mix(in srgb, var(--rank-color) 45%, transparent); }
	}

	.rank-title {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		white-space: nowrap;
	}

	.rank-xp {
		font-size: 0.65rem;
		font-family: 'Rajdhani', 'Courier New', monospace;
		color: #c8a84b;
		letter-spacing: 0.05em;
	}
</style>