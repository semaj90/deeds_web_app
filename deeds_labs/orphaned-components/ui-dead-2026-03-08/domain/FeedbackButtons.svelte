<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { browser } from '$app/environment';

	interface Props {
		messageId: string;
		class?: string;
	}

	let { messageId, class: className = '' }: Props = $props();

	let rating = $state<'up' | 'down' | null>(null);
	let showComment = $state(false);
	let comment = $state('');
	let submitting = $state(false);
	let submitted = $state(false);

	async function submitFeedback(value: 'up' | 'down') {
		if (!browser || submitting) return;
		rating = value;
		submitting = true;

		try {
			const res = await fetch('/api/ai/feedback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messageId,
					rating: value === 'up' ? 1 : -1,
					comment: comment.trim() || undefined,
				}),
			});

			if (res.ok) {
				submitted = true;
				showComment = false;
			}
		} catch {
			/* network error — keep UI responsive */
		} finally {
			submitting = false;
		}
	}

	async function submitComment() {
		if (!rating || !comment.trim()) return;
		await submitFeedback(rating);
	}
</script>

<div class="inline-flex items-center gap-1.5 {className}">
	{#if submitted}
		<span class="text-[10px] text-emerald-500 flex items-center gap-1">
			<Icon name="check" size={12} />
			Thanks
		</span>
	{:else}
		<button
			class="p-1 rounded bg-transparent border-none cursor-pointer transition-colors"
			class:text-emerald-400={rating === 'up'}
			class:text-stone-600={rating !== 'up'}
			class:hover:text-emerald-400={rating !== 'up'}
			onclick={() => submitFeedback('up')}
			disabled={submitting}
			title="Helpful"
		>
			<Icon name="thumbs-up" size={14} />
		</button>
		<button
			class="p-1 rounded bg-transparent border-none cursor-pointer transition-colors"
			class:text-red-400={rating === 'down'}
			class:text-stone-600={rating !== 'down'}
			class:hover:text-red-400={rating !== 'down'}
			onclick={() => {
				rating = 'down';
				showComment = true;
			}}
			disabled={submitting}
			title="Not helpful"
		>
			<Icon name="thumbs-down" size={14} />
		</button>

		{#if showComment}
			<div class="flex items-center gap-1.5 ml-1">
				<input
					type="text"
					bind:value={comment}
					placeholder="What went wrong?"
					class="bg-transparent border border-stone-700 text-stone-300 text-[11px] px-2 py-1 rounded w-40 outline-none focus:border-accent"
					onkeydown={(e) => { if (e.key === 'Enter') submitComment(); }}
				/>
				<button
					class="text-[10px] px-2 py-1 rounded bg-stone-800 border border-stone-700 text-stone-400 hover:text-white cursor-pointer"
					onclick={submitComment}
				>Send</button>
			</div>
		{/if}
	{/if}
</div>
