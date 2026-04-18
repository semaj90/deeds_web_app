<script lang="ts">
	import { Tooltip } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		queryHash:   string;
		pipeline?:   string;
		chunkIds?:   string[];
		compact?:    boolean;
		showCounts?: boolean;
	}

	let {
		queryHash,
		pipeline,
		chunkIds = [],
		compact    = false,
		showCounts = false,
	}: Props = $props();

	// ── State ─────────────────────────────────────────────────────────────

	let rating  = $state<'up' | 'down' | null>(null);
	let pending = $state(false);
	let up      = $state(0);
	let down    = $state(0);
	let loaded  = $state(false);

	// ── Load initial state ────────────────────────────────────────────────

	$effect(() => {
		void queryHash; // track
		if (!queryHash) return;
		fetch(`/api/analytics/feedback?hash=${encodeURIComponent(queryHash)}`)
			.then((r) => r.json())
			.then((d: { up: number; down: number; userRating: 'up' | 'down' | null }) => {
				up     = d.up   ?? 0;
				down   = d.down ?? 0;
				rating = d.userRating ?? null;
				loaded = true;
			})
			.catch(() => { loaded = true; });
	});

	// ── Vote ──────────────────────────────────────────────────────────────

	async function vote(next: 'up' | 'down') {
		if (pending) return;
		const newRating = rating === next ? null : next; // toggle off

		// Optimistic update
		const prevRating = rating;
		const prevUp     = up;
		const prevDown   = down;

		if (prevRating === 'up') up = Math.max(0, up - 1);
		if (prevRating === 'down') down = Math.max(0, down - 1);
		if (newRating === 'up') up += 1;
		if (newRating === 'down') down += 1;
		rating = newRating;

		pending = true;
		try {
			const res = await fetch('/api/analytics/feedback', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify({ queryHash, rating: newRating, pipeline, chunkIds }),
			});
			if (!res.ok) throw new Error('Failed');
			const d = await res.json() as { counts: { up: number; down: number }; rating: 'up' | 'down' | null };
			up     = d.counts.up;
			down   = d.counts.down;
			rating = d.rating;
		} catch {
			// Revert on failure
			rating = prevRating;
			up     = prevUp;
			down   = prevDown;
		} finally {
			pending = false;
		}
	}
</script>

<div class="fb-root" class:compact class:loaded>
	<!-- Thumbs up -->
	<Tooltip.Root delayDuration={300}>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					class="fb-btn up"
					class:active={rating === 'up'}
					class:pending
					disabled={pending}
					onclick={() => vote('up')}
					aria-label="Good answer"
				>
					<Icon name="thumbs-up" class="fb-icon" />
					{#if showCounts && up > 0}
						<span class="fb-count">{up}</span>
					{/if}
				</button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>
			<div class="tip">
				{rating === 'up' ? 'Remove vote' : 'Good answer — promotes in QLoRA training'}
				{#if up > 0}<span class="tip-count">↑ {up}</span>{/if}
			</div>
		</Tooltip.Content>
	</Tooltip.Root>

	<!-- Thumbs down -->
	<Tooltip.Root delayDuration={300}>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					class="fb-btn down"
					class:active={rating === 'down'}
					class:pending
					disabled={pending}
					onclick={() => vote('down')}
					aria-label="Poor answer"
				>
					<Icon name="thumbs-down" class="fb-icon" />
					{#if showCounts && down > 0}
						<span class="fb-count">{down}</span>
					{/if}
				</button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>
			<div class="tip">
				{rating === 'down' ? 'Remove vote' : 'Poor answer — marks for review, skips distillation'}
				{#if down > 0}<span class="tip-count">↓ {down}</span>{/if}
			</div>
		</Tooltip.Content>
	</Tooltip.Root>
</div>

<style>
.fb-root {
	display: flex;
	align-items: center;
	gap: 0.15rem;
	opacity: 0;
	transition: opacity 0.15s;
}
.fb-root.loaded { opacity: 1; }

.fb-btn {
	display: flex;
	align-items: center;
	gap: 0.2rem;
	padding: 0.18rem 0.32rem;
	border-radius: 4px;
	border: 1px solid transparent;
	background: transparent;
	cursor: pointer;
	color: #4b5563;
	font-family: inherit;
	font-size: 0.65rem;
	transition: color 0.1s, background 0.1s, border-color 0.1s;
}
.fb-btn:hover:not(:disabled) { color: #9ca3af; background: #1a1914; }
.fb-btn:disabled { cursor: default; opacity: 0.5; }

.fb-btn.up.active  { color: #4ade80; border-color: #4ade8040; background: #4ade8012; }
.fb-btn.down.active{ color: #f87171; border-color: #f8717140; background: #f8717112; }

/* Compact mode — smaller, tighter */
.compact .fb-btn { padding: 0.1rem 0.2rem; }

/* Pending — pulse */
.fb-btn.pending { animation: fb-pulse 0.8s ease-in-out infinite; }
@keyframes fb-pulse {
	0%, 100% { opacity: 1; }
	50%       { opacity: 0.4; }
}

/* Icon sizing — matches Icon.svelte w-3 h-3 pattern */
:global(.fb-icon) { width: 0.8rem !important; height: 0.8rem !important; }
.compact :global(.fb-icon) { width: 0.7rem !important; height: 0.7rem !important; }

.fb-count { font-size: 0.6rem; line-height: 1; }

/* Tooltip */
.tip {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	font-size: 0.65rem;
	color: #d4c7a3;
	background: #1a1914;
	border: 1px solid #2d2b24;
	border-radius: 5px;
	padding: 0.35rem 0.6rem;
	white-space: nowrap;
	font-family: 'JetBrains Mono', ui-monospace, monospace;
	max-width: 280px;
}
.tip-count {
	color: #6b7280;
	font-size: 0.6rem;
}
</style>