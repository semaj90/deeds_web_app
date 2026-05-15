<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { Achievement } from './gamification-types.js';

	interface Props {
		achievement: Achievement;
		unlocked: boolean;
	}

	let { achievement, unlocked }: Props = $props();
</script>

<div class="ach-wrap" title={unlocked ? `${achievement.title}: ${achievement.description}` : `Locked — ${achievement.description}`}>
	<div
		class="ach-badge"
		class:unlocked
		class:locked={!unlocked}
		style="--ach-color: {achievement.color};"
	>
		<Icon name={unlocked ? achievement.icon : 'lock'} size={18} />
	</div>
	<span class="ach-label" class:unlocked>{achievement.title}</span>
</div>

<style>
	.ach-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		cursor: default;
	}

	.ach-badge {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.3s ease;
	}

	.ach-badge.unlocked {
		background: color-mix(in srgb, var(--ach-color) 12%, transparent);
		border: 1.5px solid color-mix(in srgb, var(--ach-color) 45%, transparent);
		box-shadow: 0 0 10px color-mix(in srgb, var(--ach-color) 25%, transparent);
		color: var(--ach-color);
	}

	.ach-badge.locked {
		background: rgba(212, 199, 163, 0.04);
		border: 1.5px solid rgba(212, 199, 163, 0.08);
		opacity: 0.35;
		filter: grayscale(100%);
		color: rgba(212, 199, 163, 0.5);
	}

	.ach-badge.unlocked:hover {
		transform: scale(1.1);
		box-shadow: 0 0 16px color-mix(in srgb, var(--ach-color) 40%, transparent);
	}

	.ach-label {
		font-size: 0.55rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: rgba(212, 199, 163, 0.35);
		text-align: center;
		max-width: 56px;
		line-height: 1.2;
	}

	.ach-label.unlocked {
		color: rgba(212, 199, 163, 0.7);
	}
</style>
