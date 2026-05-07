<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	let {
		tags = $bindable<string[]>([]),
		placeholder = 'Add tag…',
		maxTags = 20,
		maxLength = 50,
		onchange,
	}: {
		tags?: string[];
		placeholder?: string;
		maxTags?: number;
		maxLength?: number;
		onchange?: (tags: string[]) => void;
	} = $props();

	let inputValue = $state('');
	let inputEl: HTMLInputElement | undefined = $state();

	function addTag(value: string) {
		const tag = value.trim().toLowerCase().replace(/[^a-z0-9\-_\s]/g, '').replace(/\s+/g, '-');
		if (!tag || tag.length > maxLength) return;
		if (tags.includes(tag)) return;
		if (tags.length >= maxTags) return;
		tags = [...tags, tag];
		inputValue = '';
		onchange?.(tags);
	}

	function removeTag(tag: string) {
		tags = tags.filter(t => t !== tag);
		onchange?.(tags);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			addTag(inputValue);
		}
		if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
			removeTag(tags[tags.length - 1]);
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="tag-input-container" onclick={() => inputEl?.focus()}>
	<div class="tag-list">
		{#each tags as tag}
			<span class="tag-chip">
				<span class="tag-text">#{tag}</span>
				<button
					class="tag-remove"
					onclick={(e) => { e.stopPropagation(); removeTag(tag); }}
					title="Remove tag"
					type="button"
				>
					<Icon name="x" size={12} />
				</button>
			</span>
		{/each}
		{#if tags.length < maxTags}
			<input
				bind:this={inputEl}
				bind:value={inputValue}
				class="tag-input"
				{placeholder}
				onkeydown={handleKeydown}
				maxlength={maxLength}
			/>
		{/if}
	</div>
</div>

<style>
	.tag-input-container {
		display: flex;
		flex-wrap: wrap;
		border: 1px solid rgba(96, 165, 250, 0.2);
		border-radius: 8px;
		padding: 0.375rem;
		background: rgba(15, 15, 15, 0.5);
		cursor: text;
		min-height: 36px;
		transition: border-color 0.15s;
	}
	.tag-input-container:focus-within {
		border-color: rgba(96, 165, 250, 0.5);
	}
	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		align-items: center;
		width: 100%;
	}
	.tag-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		font-size: 0.7rem;
		padding: 0.15rem 0.5rem;
		border-radius: 6px;
		background: rgba(96, 165, 250, 0.1);
		border: 1px solid rgba(96, 165, 250, 0.2);
		color: #93c5fd;
		font-weight: 500;
	}
	.tag-text {
		max-width: 140px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tag-remove {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		color: rgba(147, 197, 253, 0.6);
		cursor: pointer;
		padding: 0;
		line-height: 1;
		transition: color 0.15s;
	}
	.tag-remove:hover {
		color: #ef4444;
	}
	.tag-input {
		flex: 1;
		min-width: 80px;
		border: none;
		background: transparent;
		color: #d4c7a3;
		font-size: 0.75rem;
		padding: 0.15rem 0.25rem;
		outline: none;
	}
	.tag-input::placeholder {
		color: rgba(212, 199, 163, 0.35);
	}
</style>
