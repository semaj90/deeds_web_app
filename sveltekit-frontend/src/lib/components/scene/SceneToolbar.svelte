<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		/** Title shown beside the toolbar, e.g. "3D scene". */
		title?: string;
		/** Reset the camera orbit to its default view. */
		onResetView?: () => void;
		/** Enter or leave marker placement mode. */
		onTogglePlaceMarker?: () => void;
		/** Whether marker placement mode is currently active. */
		markerActive?: boolean;
		/** Disables every action, for example while a save is in flight. */
		disabled?: boolean;
		/** Disables placement only, with the reason shown to the user. */
		placementDisabledReason?: string;
	}

	let {
		title = '3D scene',
		onResetView,
		onTogglePlaceMarker,
		markerActive = false,
		disabled = false,
		placementDisabledReason = ''
	}: Props = $props();

	const placementBlocked = $derived(disabled || placementDisabledReason.length > 0);
</script>

<div class="scene-toolbar" role="toolbar" aria-label="Scene controls" aria-orientation="horizontal">
	<span class="scene-toolbar-title">{title}</span>

	<div class="scene-toolbar-group" role="group" aria-label="View">
		<button
			type="button"
			class="scene-tool"
			onclick={() => onResetView?.()}
			disabled={disabled || !onResetView}
			title="Reset the camera to its default view"
			aria-label="Reset view"
		>
			<Icon name="rotate-ccw" size={14} />
			<span>Reset view</span>
		</button>
	</div>

	<div class="scene-toolbar-group" role="group" aria-label="Edit">
		<button
			type="button"
			class="scene-tool"
			class:active={markerActive}
			aria-pressed={markerActive}
			onclick={() => onTogglePlaceMarker?.()}
			disabled={placementBlocked || !onTogglePlaceMarker}
			title={placementDisabledReason || (markerActive ? 'Stop placing markers' : 'Place a marker on the scene')}
			aria-label={markerActive ? 'Stop placing markers' : 'Place marker'}
		>
			<Icon name="map-pin" size={14} />
			<span>{markerActive ? 'Stop placing' : 'Place marker'}</span>
		</button>
	</div>

	{#if placementDisabledReason}
		<p class="scene-toolbar-note" role="status">{placementDisabledReason}</p>
	{/if}
</div>

<style>
	.scene-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
		padding: 0.5rem 0.75rem;
		background: var(--dossier-bg-card, #FAF6F0);
		border: 1px solid var(--dossier-hairline, #E2D7C9);
		border-radius: var(--dossier-radius-inner, 6px);
		color: var(--dossier-text-main, #141312);
		font-size: 0.8125rem;
	}

	.scene-toolbar-title {
		font-weight: 600;
		letter-spacing: 0.02em;
		margin-right: 0.25rem;
	}

	.scene-toolbar-group {
		display: inline-flex;
		gap: 0.375rem;
		padding-left: 0.5rem;
		border-left: 1px solid var(--dossier-hairline, #E2D7C9);
	}

	.scene-tool {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		min-height: 2rem;
		padding: 0.25rem 0.625rem;
		background: var(--dossier-bg-workspace, #ECE7DC);
		border: 1px solid var(--dossier-border-sand, #D5C6AC);
		border-radius: var(--dossier-radius-inner, 6px);
		color: var(--dossier-text-main, #141312);
		cursor: pointer;
	}

	.scene-tool:hover:not(:disabled) {
		border-color: var(--dossier-gold, #C9A86A);
	}

	.scene-tool.active,
	.scene-tool[aria-pressed='true'] {
		background: var(--dossier-gold-light, #FFE59A);
		border-color: var(--dossier-gold, #C9A86A);
		font-weight: 600;
	}

	.scene-tool:focus-visible {
		outline: 2px solid var(--dossier-crimson, #67140F);
		outline-offset: 2px;
	}

	.scene-tool:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.scene-toolbar-note {
		flex-basis: 100%;
		margin: 0;
		color: var(--dossier-text-muted-aa, #6B6150);
		font-size: 0.75rem;
	}

	@media (prefers-reduced-motion: reduce) {
		.scene-tool {
			transition: none;
		}
	}

	@media (max-width: 480px) {
		.scene-toolbar-group {
			padding-left: 0;
			border-left: none;
		}
	}
</style>
