<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		open?: boolean;
		title: string;
		description?: string;
		children: Snippet;
	}

	let { open = $bindable(false), title, description, children }: Props = $props();
	let dialogEl = $state<HTMLDialogElement>();

	$effect(() => {
		const dialog = dialogEl;
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});

	function close() {
		open = false;
	}

	function closeOnBackdrop(event: MouseEvent) {
		if (event.target === dialogEl) close();
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialogEl}
	class="dossier-mini-modal"
	aria-label={title}
	onclick={closeOnBackdrop}
	oncancel={(event) => { event.preventDefault(); close(); }}
	onclose={() => { if (open) open = false; }}
>
	<section class="dossier-mini-modal__surface">
		<header class="flex items-start justify-between gap-4 border-b-2 border-[#161412] px-4 py-3 sm:px-5">
			<div class="min-w-0">
				<p class="dossier-mini-modal__eyebrow">LEGAL-AI · CASEWORK TOOLS</p>
				<h2 class="m-0 text-lg font-bold leading-tight">{title}</h2>
				{#if description}<p class="mt-1 text-sm leading-5 text-[#51483d]">{description}</p>{/if}
			</div>
			<button class="dossier-mini-modal__close" type="button" aria-label="Close dialog" onclick={close}>×</button>
		</header>
		<div class="max-h-[min(65dvh,34rem)] overflow-y-auto p-4 sm:p-5">
			{@render children()}
		</div>
	</section>
</dialog>

<style>
	dialog.dossier-mini-modal {
		width: min(38rem, calc(100vw - 2rem));
		max-width: none;
		max-height: min(78dvh, 42rem);
		margin: auto;
		padding: 0;
		overflow: visible;
		border: 3px solid var(--dossier-bg-dark, #161412);
		border-radius: 8px;
		background: var(--dossier-bg-card, #FAF6F0);
		color: var(--dossier-text-main, #141312);
		box-shadow: 8px 8px 0 var(--dossier-bg-dark, #161412);
	}

	dialog.dossier-mini-modal::backdrop {
		background: rgb(22 20 18 / 58%);
		backdrop-filter: blur(2px);
	}

	.dossier-mini-modal__surface {
		max-height: min(78dvh, 42rem);
		overflow: hidden;
		background: var(--dossier-bg-card, #FAF6F0);
	}

	.dossier-mini-modal__eyebrow {
		margin: 0 0 .3rem;
		color: #6B6150;
		font-size: .65rem;
		font-weight: 800;
		letter-spacing: .12em;
	}

	.dossier-mini-modal__close {
		flex: none;
		width: 2rem;
		height: 2rem;
		border: 2px solid #161412;
		border-radius: 4px;
		background: #FAF6F0;
		color: #161412;
		font-size: 1.35rem;
		font-weight: 800;
		line-height: 1;
		box-shadow: 2px 2px 0 #161412;
		cursor: pointer;
	}

	.dossier-mini-modal__close:hover { transform: translate(-1px, -1px); box-shadow: 3px 3px 0 #161412; }
	.dossier-mini-modal__close:active { transform: translate(1px, 1px); box-shadow: 1px 1px 0 #161412; }
	.dossier-mini-modal__close:focus-visible { outline: 3px solid #8D251E; outline-offset: 3px; }

	@media (prefers-reduced-motion: reduce) {
		.dossier-mini-modal__close { transition: none; }
	}
</style>
