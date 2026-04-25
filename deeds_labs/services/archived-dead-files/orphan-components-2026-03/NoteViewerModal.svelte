<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { fade, fly } from 'svelte/transition';
	import RichTextEditor from './RichTextEditor.svelte';

	interface Props {
		noteId?: string;
		title?: string;
		content?: string;
		markdown?: string;
		html?: string;
		contentJson?: any;
		noteType?: string;
		tags?: string[];
		userId?: string;
		caseId?: string | undefined;
		createdAt?: Date;
		isOpen?: boolean;
		mode?: 'view' | 'edit';
		canEdit?: boolean;
		onSave?: (data: any) => void;
		onClose?: () => void;
	}

	let {
		noteId = '',
		title = '',
		content = '',
		markdown = '',
		html = '',
		contentJson = null,
		noteType = 'general',
		tags = [],
		userId = '',
		caseId = undefined,
		createdAt = new Date(),
		isOpen = false,
		mode = 'view',
		canEdit = true,
		onSave = undefined,
		onClose = undefined,
	}: Props = $props();

	let localMode = $state(mode);
	let localTitle = $state(title);
	let localContent = $state(content);
	let localMarkdown = $state(markdown);
	let localHtml = $state(html);
	let localTags = $state<string[]>([...tags]);
	let localContentJson = $state(contentJson);
	let localIsOpen = $state(isOpen);
	let isSaved = $state(false);

	let editedContent = $state(content);
	let editedTitle = $state(title);
	let editedTags = $state<string[]>([...tags]);
	let newTag = $state('');

	let displayHtml = $derived(localHtml || localContent);

	$effect(() => {
		localIsOpen = isOpen;
	});

	function handleSaveForLater() {
		isSaved = true;
		setTimeout(() => (isSaved = false), 2000);
	}

	function handleRemoveFromSaved() {
		isSaved = false;
	}

	function addTag() {
		const trimmed = newTag.trim();
		if (trimmed && !editedTags.includes(trimmed)) {
			editedTags = [...editedTags, trimmed];
			newTag = '';
		}
	}

	function removeTag(tag: string) {
		editedTags = editedTags.filter((t) => t !== tag);
	}

	function handleEditorChange(data: { html: string; markdown: string; json: any }) {
		editedContent = data.markdown || data.html;
		localHtml = data.html;
		localMarkdown = data.markdown;
		localContentJson = data.json;
	}

	function handleSave() {
		const updatedNote = {
			id: noteId,
			title: editedTitle,
			content: editedContent,
			markdown: localMarkdown,
			html: localHtml,
			contentJson: localContentJson,
			noteType,
			tags: editedTags,
			userId,
			caseId,
		};
		onSave?.(updatedNote);
		localMode = 'view';
		localTitle = editedTitle;
		localContent = editedContent;
		localTags = [...editedTags];
	}

	function startEdit() {
		localMode = 'edit';
		editedContent = localContent;
		editedTitle = localTitle;
		editedTags = [...localTags];
	}

	function cancelEdit() {
		localMode = 'view';
		editedContent = localContent;
		editedTitle = localTitle;
		editedTags = [...localTags];
	}

	function closeModal() {
		localIsOpen = false;
		onClose?.();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeModal();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if localIsOpen}
	<!-- Backdrop -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
		transition:fade={{ duration: 150 }}
		onclick={closeModal}
		role="presentation"
	>
		<!-- Modal -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative mx-4 max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded border-2 border-sand/30 bg-panel p-6"
			transition:fly={{ y: -20, duration: 200 }}
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="note-modal-title"
		>
			<!-- Header -->
			<div class="mb-4 flex items-start justify-between gap-4">
				<div class="min-w-0 flex-1">
					{#if localMode === 'edit'}
						<input
							bind:value={editedTitle}
							class="w-full rounded border border-sand/20 bg-panelSoft px-3 py-2 text-lg font-semibold text-sand"
							placeholder="Note title..."
						/>
					{:else}
						<h2 id="note-modal-title" class="text-lg font-semibold text-sand">
							{localTitle || 'Untitled Note'}
						</h2>
					{/if}

					<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-sand/60">
						<Icon name="calendar" class="h-3 w-3" />
						<span>
							{createdAt instanceof Date
								? createdAt.toLocaleDateString()
								: new Date(createdAt).toLocaleDateString()}
						</span>
						{#if userId}
							<Icon name="user" class="h-3 w-3" />
							<span>{userId}</span>
						{/if}
						<span class="rounded bg-sand/10 px-1.5 py-0.5">{noteType}</span>
					</div>
				</div>

				<div class="flex items-center gap-1">
					{#if canEdit}
						{#if localMode === 'view'}
							<button
								type="button"
								class="rounded p-1.5 text-sand/60 hover:bg-sand/10 hover:text-sand"
								onclick={startEdit}
								title="Edit Note"
							>
								<Icon name="edit-3" class="h-4 w-4" />
							</button>
						{:else}
							<button
								type="button"
								class="rounded px-2 py-1 text-xs text-sand/60 hover:bg-sand/10 hover:text-sand"
								onclick={handleSave}
							>
								Save
							</button>
							<button
								type="button"
								class="rounded px-2 py-1 text-xs text-sand/60 hover:bg-sand/10 hover:text-sand"
								onclick={cancelEdit}
							>
								Cancel
							</button>
						{/if}
					{/if}

					<button
						type="button"
						class="rounded p-1.5 text-sand/60 hover:bg-sand/10 hover:text-sand"
						onclick={() => (isSaved ? handleRemoveFromSaved() : handleSaveForLater())}
						title={isSaved ? 'Remove from saved' : 'Save for later'}
					>
						{#if isSaved}
							<Icon name="bookmark-check" class="h-4 w-4 text-accent" />
						{:else}
							<Icon name="bookmark" class="h-4 w-4" />
						{/if}
					</button>

					<button
						type="button"
						class="rounded p-1.5 text-sand/60 hover:bg-sand/10 hover:text-sand"
						onclick={closeModal}
						title="Close"
					>
						<Icon name="x" class="h-4 w-4" />
					</button>
				</div>
			</div>

			<!-- Tags -->
			<div class="mb-4 flex flex-wrap items-center gap-2">
				<Icon name="tag" class="h-3.5 w-3.5 text-sand/50" />
				{#if localMode === 'edit'}
					{#each editedTags as tag}
						<span class="inline-flex items-center gap-1 rounded bg-accent/20 px-2 py-0.5 text-xs text-accent">
							{tag}
							<button
								type="button"
								onclick={() => removeTag(tag)}
								class="hover:text-danger"
							>
								<Icon name="x" class="h-3 w-3" />
							</button>
						</span>
					{/each}
					<input
						bind:value={newTag}
						onkeydown={(e) => e.key === 'Enter' && addTag()}
						class="rounded border border-sand/20 bg-panelSoft px-2 py-0.5 text-xs text-sand"
						placeholder="Add tag..."
					/>
				{:else}
					{#each localTags as tag}
						<span class="rounded bg-sand/10 px-2 py-0.5 text-xs text-sand/70">{tag}</span>
					{/each}
					{#if localTags.length === 0}
						<span class="text-xs text-sand/40">No tags</span>
					{/if}
				{/if}
			</div>

			<!-- Content -->
			<div class="min-h-[200px] rounded border border-sand/10 bg-panelSoft p-4">
				{#if localMode === 'edit'}
					<RichTextEditor
						content={editedContent}
						placeholder="Edit your note..."
						onChange={handleEditorChange}
					/>
				{:else if displayHtml}
					<div class="prose prose-invert max-w-none text-sm text-sand/80">
						{@html displayHtml}
					</div>
				{:else if localContent}
					<div class="whitespace-pre-wrap text-sm text-sand/80">{localContent}</div>
				{:else}
					<div class="text-sm text-sand/40">No content available</div>
				{/if}
			</div>

			<!-- Footer -->
			{#if localMode === 'view'}
				<div class="mt-4 flex items-center justify-between text-xs text-sand/40">
					<div>
						{#if caseId}
							<span>Case: {caseId}</span>
						{:else}
							<span>General note</span>
						{/if}
					</div>
					<div class="flex items-center gap-1">
						<Icon name="eye" class="h-3 w-3" />
						<span>Read-only</span>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
