<script lang="ts">
	import { onMount } from 'svelte';
	import { Dialog } from 'bits-ui';
	import CaseOverview from './CaseOverview.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	let { id, onClose = () => {} } = $props<{ id: string; onClose?: () => void }>();

	let data = $state<any>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		try {
			const res = await fetch(`/api/cases/${id}/overview`);
			if (!res.ok) {
				const err = await res.json().catch(() => ({ error: 'Failed to fetch case data' }));
				error = err.error || 'Failed to fetch case data';
				return;
			}
			data = await res.json();
		} catch {
			error = 'Network error';
		} finally {
			loading = false;
		}
	});
</script>

<Dialog.Root open={true} onOpenChange={(v) => { if (!v) onClose(); }}>
	<Dialog.Portal>
		<Dialog.Overlay class="case-overview-backdrop" />
		<Dialog.Content class="case-overview-panel">
			<!-- Tactical HUD Corner Notches -->
			<div class="hud-notch-tl" aria-hidden="true"></div>
			<div class="hud-notch-tr" aria-hidden="true"></div>
			<div class="hud-notch-bl" aria-hidden="true"></div>
			<div class="hud-notch-br" aria-hidden="true"></div>

			<!-- Hidden accessible title -->
			<div class="sr-only">
				<Dialog.Title>Case Overview {id}</Dialog.Title>
				<Dialog.Description>Comprehensive view of case details, evidence, and proceedings.</Dialog.Description>
			</div>

			<!-- Close Button -->
			<Dialog.Close
				onclick={() => onClose()}
				class="case-overview-close"
				aria-label="Close modal"
			>
				<Icon name="x" size={18} />
			</Dialog.Close>

			{#if loading}
				<div class="flex-1 flex flex-col items-center justify-center gap-4 text-neutral-400 p-12">
					<div class="animate-spin rounded-full h-8 w-8 border-2 border-[#f3d471]/20 border-t-[#f3d471]"></div>
					<p class="text-xs uppercase tracking-widest text-[#f3d471] font-mono animate-pulse">Hydrating legal data...</p>
				</div>
			{:else if error}
				<div class="flex-1 flex flex-col items-center justify-center gap-4 text-[#ff4d6d] p-8 text-center">
					<Icon name="circle-alert" size={44} />
					<div>
						<h3 class="font-bold text-lg uppercase tracking-wide">Failed to load case</h3>
						<p class="text-xs text-sand/70 font-mono mt-1">{error}</p>
					</div>
					<button 
						onclick={() => onClose()}
						type="button"
						class="mt-4 px-6 py-2 rounded bg-black/40 hover:bg-black/60 border border-sand/30 hover:border-sand/60 transition-colors text-white text-xs font-mono uppercase"
					>
						Close
					</button>
				</div>
			{:else if data}
				<CaseOverview {data} isModal={true} {onClose} />
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.case-overview-backdrop) {
		position: fixed;
		inset: 0;
		z-index: 10000;
		background: rgba(4, 7, 14, 0.85);
		backdrop-filter: blur(14px) saturate(1.15);
		display: flex;
		align-items: center;
		justify-content: center;
		animation: caseFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
	}

	:global(.case-overview-panel) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 10001;
		width: min(68rem, calc(100vw - 2rem));
		height: 90vh;
		background: linear-gradient(180deg, rgba(18, 24, 36, 0.98) 0%, rgba(9, 13, 20, 0.99) 100%);
		border: 1px solid rgba(243, 212, 113, 0.32);
		border-radius: 12px;
		box-shadow:
			0 0 0 1px rgba(243, 212, 113, 0.08),
			0 28px 70px -15px rgba(0, 0, 0, 0.9),
			0 0 45px rgba(243, 212, 113, 0.1);
		backdrop-filter: blur(20px);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		animation: caseScale 0.22s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.hud-notch-tl, .hud-notch-tr, .hud-notch-bl, .hud-notch-br {
		position: absolute;
		width: 8px;
		height: 8px;
		pointer-events: none;
		z-index: 3;
	}
	.hud-notch-tl { top: -1px; left: -1px; border-top: 2px solid #f3d471; border-left: 2px solid #f3d471; }
	.hud-notch-tr { top: -1px; right: -1px; border-top: 2px solid #f3d471; border-right: 2px solid #f3d471; }
	.hud-notch-bl { bottom: -1px; left: -1px; border-bottom: 2px solid #f3d471; border-left: 2px solid #f3d471; }
	.hud-notch-br { bottom: -1px; right: -1px; border-bottom: 2px solid #f3d471; border-right: 2px solid #f3d471; }

	:global(.case-overview-close) {
		position: absolute;
		top: 1rem;
		right: 1.25rem;
		width: 2rem;
		height: 2rem;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(243, 212, 113, 0.25);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(212, 199, 163, 0.7);
		transition: all 0.15s ease;
		z-index: 10;
	}

	:global(.case-overview-close:hover) {
		color: #f3d471;
		background: rgba(243, 212, 113, 0.15);
		border-color: rgba(243, 212, 113, 0.5);
	}

	@keyframes caseFade {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes caseScale {
		from { opacity: 0; transform: translate(-50%, -48%) scale(0.97); }
		to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
	}
</style>
