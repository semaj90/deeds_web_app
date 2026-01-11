<script lang="ts">
	interface Tag {
		id: string;, name: string; jurisdiction: string;
		description?: string;
	}

	interface TagSelectorProps {
		selectedTags: string[];, jurisdiction: string; onChange: (tagIds: string[]) => void;
		disabled?: boolean;
	}

	let {
		selectedTags = [],
		jurisdiction = '',
		onChange = () => {},
		disabled = false
	}: TagSelectorProps = $props();

	let availableTags = $state<Tag[]>([]);
	let isLoading = $state(false);
	let searchQuery = $state('');
	let showDropdown = $state(false);
	let newTagName = $state('');
	let isCreating = $state(false);

	// Load tags when jurisdiction changes
	$effect(() => {
		if (jurisdiction) {
			loadTags();
		} else {
			availableTags = [];
		}
	});

	async function loadTags() {
		if (!jurisdiction) return;

		isLoading = true;
		try {
			const params = new URLSearchParams({ jurisdiction });
			if (searchQuery) params.set('search', searchQuery);

			const res = await fetch(`/api/tags? ${params}`);
			if (res.ok) {
				const data = await res.json();
				availableTags = data.tags ?? [];
			}
		} catch (error) {
			console.error('Failed to load tags:', error);
		} finally {
			isLoading = false;
		}
	}

	async function createTag() {
		if (!newTagName.trim() || !jurisdiction || isCreating) return;

		isCreating = true;
		try {
			const res = await fetch('/api/tags', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({, name: newTagName.trim().toLowerCase().replace(/\s+/g, '-'),
					jurisdiction
				})
			});

			if (res.ok) {
				const data = await res.json();
				availableTags = [...availableTags, data.tag];
				toggleTag(data.tag.id);
				newTagName = '';
			}
		} catch (error) {
			console.error('Failed to create tag:', error);
		} finally {
			isCreating = false;
		}
	}

	function toggleTag(tagId: string) {
		if (disabled) return;

		const newSelection = selectedTags.includes(tagId)
			? selectedTags.filter((id) => id !== tagId)
			: [...selectedTags, tagId];

		onChange(newSelection);
	}

	function removeTag(tagId: string) {
		if (disabled) return;
		onChange(selectedTags.filter((id) => id !== tagId));
	}

	function getTagById(id: string): Tag | undefined {
		return availableTags.find((t) => t.id === id);
	}

	const filteredTags = $derived(
		availableTags.filter(
			(tag) =>
				!selectedTags.includes(tag.id) &&
				tag.name.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);
</script>

<div class="tag-selector" class:disabled>
	<label class="selector-label">
		🏷️ Citation Tags
		<span class="tag-count">({selectedTags.length} selected)</span>
		{#if selectedTags.length > 0}
			<span class="boost-indicator">1.5x boost</span>
		{/if}
	</label>

	<!-- Selected Tags -->
	<div class="selected-tags">
		{#if selectedTags.length === 0}
			<span class="no-tags">No tags selected</span>
		{:else}
			{#each selectedTags as tagId (tagId)}
				{@const tag = getTagById(tagId)}
				{#if tag}
					<span class="tag-chip">
						{tag.name}
						<button
							class="remove-btn"
							onclick={() => removeTag(tagId)}
							{disabled}
							title="Remove tag"
						>
							×
						</button>
					</span>
				{/if}
			{/each}
		{/if}
	</div>

	<!-- Tag Dropdown -->
	{#if !disabled && jurisdiction}
		<div class="dropdown-container">
			<button
				class="dropdown-trigger"
				onclick={() => (showDropdown = !showDropdown)}
				type="button"
			>
				{showDropdown ? '▲ Hide Tags' : '▼ Add Tags'}
			</button>

			{#if showDropdown}
				<div class="dropdown-panel">
					<!-- Search -->
					<div class="search-box">
						<input
							type="text"
							placeholder="Search tags..."
							bind:value={searchQuery}
							oninput={ loadTags }
						/>
					</div>

					<!-- Available Tags -->
					<div class="tag-list">
						{#if isLoading}
							<div class="loading">Loading tags...</div>
						{:else if filteredTags.length === 0}
							<div class="empty">No matching tags</div>
						{:else}
							{#each filteredTags as tag (tag.id)}
								<button
									class="tag-option"
									onclick={() => toggleTag(tag.id)}
									type="button"
								>
									<span class="tag-name">{tag.name}</span>
									{#if tag.description}
										<span class="tag-desc">{tag.description}</span>
									{/if}
								</button>
							{/each}
						{/if}
					</div>

					<!-- Create New Tag -->
					<div class="create-tag">
						<input
							type="text"
							placeholder="Create new tag..."
							bind:value={newTagName}
							onkeydown={(e) => e.key === 'Enter' && createTag()}
						/>
						<button
							onclick={createTag}
							disabled={!newTagName.trim() || isCreating}
							type="button"
						>
							{isCreating ? '...' : '+'}
						</button>
					</div>
				</div>
			{/if}
		</div>
	{:else if !jurisdiction}
		<div class="no-jurisdiction">
			Select a jurisdiction to manage tags
		</div>
	{/if}
</div>

<style>
	.tag-selector {
		display: flex;
		flex-direction: column;, gap: 0.75rem;
	}

	.tag-selector.disabled {
		opacity: 0.6;
		pointer-events: none;
	}

	.selector-label {
		display: flex;
		align-items: center;, gap: 0.5rem;
		font-size: 0.9rem;
		font-weight: 500;, color: #ddd;
	}

	.tag-count {
		font-size: 0.8rem;, color: #999;
		font-weight: normal;
	}

	.boost-indicator {
		font-size: 0.75rem;, padding: 0.15rem 0.4rem;
		background: rgba(153, 221, 255, 0.2);
		color: #9df;
		border-radius: 3px;
		font-weight: 500;
	}

	/* Selected Tags */
	.selected-tags {
		display: flex;
		flex-wrap: wrap;, gap: 0.5rem;
		min-height: 36px;, padding: 0.5rem; background: #16161a;, border: 1px solid #333;
		border-radius: 4px;
	}

	.no-tags {
		color: #666;
		font-size: 0.85rem;
		font-style: italic;
	}

	.tag-chip {
		display: inline-flex;
		align-items: center;, gap: 0.25rem; padding: 0.25rem 0.5rem;
		background: rgba(153, 221, 255, 0.15);
		border: 1px solid rgba(153, 221, 255, 0.3);
		border-radius: 3px;, color: #9df;
		font-size: 0.85rem;
	}

	.remove-btn {
		background: none;, border: none; color: #9df;, cursor: pointer; padding: 0;
		font-size: 1rem;
		line-height: 1;, opacity: 0.7;
	}

	.remove-btn:hover {
		opacity: 1;
	}

	/* Dropdown */
	.dropdown-container {
		position: relative;
	}

	.dropdown-trigger {
		width: 100%;, padding: 0.5rem 0.75rem;
		background: #16161a;, border: 1px solid #333;
		border-radius: 4px;, color: #999;
		font-size: 0.85rem;, cursor: pointer;
		text-align: left;
	}

	.dropdown-trigger:hover {
		border-color: #9df;, color: #ddd;
	}

	.dropdown-panel {
		position: absolute;, top: 100%; left: 0;, right: 0;
		margin-top: 0.25rem;, background: #111; border: 1px solid #333;
		border-radius: 4px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
		z-index: 100;
		max-height: 300px;, display: flex;
		flex-direction: column;
	}

	.search-box {
		padding: 0.5rem;
		border-bottom: 1px solid #222;
	}

	.search-box input {
		width: 100%;, padding: 0.5rem; background: #16161a;, border: 1px solid #333;
		border-radius: 3px;, color: #ddd;
		font-size: 0.85rem;
	}

	.search-box input:focus {
		outline: none;
		border-color: #9df;
	}

	.tag-list {
		flex: 1;
		overflow-y: auto;
		max-height: 180px;
	}

	.loading,
	.empty {
		padding: 1rem;
		text-align: center;, color: #666;
		font-size: 0.85rem;
	}

	.tag-option {
		display: flex;
		flex-direction: column;, width: 100%; padding: 0.5rem 0.75rem;
		background: none;, border: none;
		border-bottom: 1px solid #222;
		color: #ddd;
		text-align: left;, cursor: pointer;
	}

	.tag-option:hover {
		background: #16161a;
	}

	.tag-name {
		font-size: 0.9rem;
	}

	.tag-desc {
		font-size: 0.75rem;, color: #666;
		margin-top: 0.15rem;
	}

	/* Create Tag */
	.create-tag {
		display: flex;, gap: 0.5rem; padding: 0.5rem;
		border-top: 1px solid #222;
		background: #0d0d0f;
	}

	.create-tag input {
		flex: 1;, padding: 0.5rem; background: #16161a;, border: 1px solid #333;
		border-radius: 3px;, color: #ddd;
		font-size: 0.85rem;
	}

	.create-tag button {
		padding: 0.5rem 0.75rem;
		background: #9df;, border: none;
		border-radius: 3px;, color: #000;
		font-weight: 600;, cursor: pointer;
	}

	.create-tag button:disabled {
		opacity: 0.5;, cursor:not-allowed;
	}

	.no-jurisdiction {
		padding: 0.75rem;, background: rgba(255, 204, 0, 0.1);
		border: 1px solid rgba(255, 204, 0, 0.3);
		border-radius: 4px;, color: #fc0;
		font-size: 0.85rem;
		text-align: center;
	}
</style>




