<script lang="ts">
	import { onMount } from 'svelte';

	type InferenceStatus = {
		status: 'checking' | 'online' | 'offline';
		model: string | null;
		ctxUsed: number;
		ctxMax: number;
		slotsIdle: boolean | null;
		slotCount: number;
		activeSlots: number;
	};

	let inference = $state<InferenceStatus>({
		status: 'checking', model: null, ctxUsed: 0, ctxMax: 0, slotsIdle: null, slotCount: 0, activeSlots: 0,
	});
	let refreshing = $state(false);

	async function refreshStatus() {
		if (refreshing || document.visibilityState !== 'visible') return;
		refreshing = true;
		try {
			const response = await fetch('/api/admin/inference-lane', {
				headers: { accept: 'application/json' },
				cache: 'no-store',
				signal: AbortSignal.timeout(4000),
			});
			const data = await response.json();
			if (!response.ok || (data.status !== 'online' && data.status !== 'offline')) {
				throw new Error('Inference status unavailable');
			}
			inference = {
				status: data.status,
				model: typeof data.model === 'string' ? data.model : null,
				ctxUsed: Number.isFinite(data.ctxUsed) ? data.ctxUsed : 0,
				ctxMax: Number.isFinite(data.ctxMax) ? data.ctxMax : 0,
				slotsIdle: typeof data.slotsIdle === 'boolean' ? data.slotsIdle : null,
				slotCount: Number.isFinite(data.slotCount) ? data.slotCount : 0,
				activeSlots: Number.isFinite(data.activeSlots) ? data.activeSlots : 0,
			};
		} catch {
			inference = { ...inference, status: 'offline', model: null, slotsIdle: null, slotCount: 0, activeSlots: 0 };
		} finally {
			refreshing = false;
		}
	}

	onMount(() => {
		void refreshStatus();
		const timer = window.setInterval(() => void refreshStatus(), 15_000);
		return () => window.clearInterval(timer);
	});

	const statusLabel = $derived(
		inference.status === 'checking' ? 'Checking' : inference.status === 'online' ? 'Online' : 'Unavailable',
	);
</script>

<section class="gpu-runtime" aria-labelledby="gpu-runtime-title" aria-busy={refreshing}>
	<header class="gpu-runtime__header">
		<div>
			<p class="gpu-runtime__eyebrow">INFERENCE RUNTIME</p>
			<h3 id="gpu-runtime-title">Model service</h3>
		</div>
		<span class="gpu-runtime__status" data-status={inference.status}>
			<span aria-hidden="true"></span>{statusLabel}
		</span>
	</header>

	<dl class="gpu-runtime__details">
		<div>
			<dt>Model</dt>
			<dd>{inference.model ?? 'Not confirmed'}</dd>
		</div>
		<div>
			<dt>Inference slots</dt>
			<dd>
				{#if inference.slotsIdle === true}
					Idle · {inference.slotCount} available
				{:else if inference.slotsIdle === false}
					Busy · {inference.activeSlots} active
				{:else}
					Unknown
				{/if}
			</dd>
		</div>
		<div>
			<dt>Context</dt>
			<dd>{inference.ctxMax > 0 ? `${inference.ctxUsed.toLocaleString()} / ${inference.ctxMax.toLocaleString()}` : 'Not reported'}</dd>
		</div>
		<div>
			<dt>VRAM</dt>
			<dd>Not reported by model service</dd>
		</div>
	</dl>

	<p class="gpu-runtime__note">
		Read-only status. This panel does not load or unload models; use the managed launcher for model changes.
	</p>
</section>

<style>
	.gpu-runtime {
		--runtime-border: color-mix(in srgb, currentColor 14%, transparent);
		padding: 1rem;
		border: 1px solid var(--runtime-border);
		border-radius: 0.75rem;
		background: color-mix(in srgb, #0b1220 92%, transparent);
		color: #e2e8f0;
	}

	.gpu-runtime__header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--runtime-border);
	}

	.gpu-runtime__eyebrow {
		margin: 0 0 0.25rem;
		color: #94a3b8;
		font-size: 0.65rem;
		letter-spacing: 0.12em;
	}

	h3 { margin: 0; font-size: 0.95rem; font-weight: 650; }

	.gpu-runtime__status {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.75rem;
		color: #cbd5e1;
	}

	.gpu-runtime__status span {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: #94a3b8;
	}

	.gpu-runtime__status[data-status='online'] span { background: #34d399; }
	.gpu-runtime__status[data-status='offline'] span { background: #f87171; }

	.gpu-runtime__details {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.8rem 1rem;
		margin: 0;
		padding: 0.9rem 0;
	}

	.gpu-runtime__details div { min-width: 0; }
	.gpu-runtime__details dt { color: #94a3b8; font-size: 0.7rem; }
	.gpu-runtime__details dd { margin: 0.2rem 0 0; overflow-wrap: anywhere; font-size: 0.8rem; }
	.gpu-runtime__note { margin: 0; color: #94a3b8; font-size: 0.7rem; line-height: 1.45; }

	@media (prefers-reduced-motion: no-preference) {
		.gpu-runtime__status[data-status='checking'] span { animation: status-pulse 1.4s ease-in-out infinite; }
	}

	@keyframes status-pulse { 50% { opacity: 0.35; } }
</style>
