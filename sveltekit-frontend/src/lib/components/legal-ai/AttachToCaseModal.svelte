<script lang="ts">
	import { Dialog } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Case {
		id: string;
		title: string;
		number: string;
		status: string;
	}

	interface Props {
		isOpen?: boolean;
		statuteCode?: string | null;
		citationId?: string | null;
		onattached?: (data: { caseId: string; linkType: string; notes: string }) => void;
	}

	let { isOpen = $bindable(false), statuteCode = null, citationId = null, onattached }: Props = $props();

	let cases: Case[] = $state([]);
	let selectedCaseId = $state('');
	let linkType = $state('CHARGED_UNDER');
	let notes = $state('');
	let isLoading = $state(true);
	let error: string | null = $state(null);
	let isSaving = $state(false);
	let searchQuery = $state('');

	const linkTypes = ['CHARGED_UNDER', 'CITED_IN', 'RELATED_TO', 'OVERRULED_BY', 'AFFIRMED_BY'];

	// Filter cases based on search query
	let filteredCases = $derived.by(() => {
		if (!searchQuery.trim()) return cases;
		const query = searchQuery.toLowerCase();
		return cases.filter(
			(c) =>
				c.title.toLowerCase().includes(query) ||
				c.number.toLowerCase().includes(query) ||
				c.status.toLowerCase().includes(query)
		);
	});

	$effect(() => {
		if (isOpen) {
			loadCases();
		}
	});

	async function loadCases() {
		isLoading = true;
		error = null;

		try {
			const response = await fetch('/api/cases?status=active&limit=50');
			if (response.ok) {
				const data = await response.json();
				if (data.success) {
					cases = data.data;
				} else {
					error = data.error ?? 'Failed to load cases';
				}
			} else {
				error = 'Failed to load cases';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'An error occurred';
		} finally {
			isLoading = false;
		}
	}

	function closeModal() {
		isOpen = false;
		selectedCaseId = '';
		linkType = 'CHARGED_UNDER';
		notes = '';
		error = null;
		searchQuery = '';
	}

	function handleOpenChange(open: boolean) {
		isOpen = open;
		if (!open) closeModal();
	}

	async function handleSubmit(e?: Event) {
		e?.preventDefault();
		error = null;

		if (!selectedCaseId) {
			error = 'Please select a case';
			return;
		}

		isSaving = true;

		try {
			const endpoint = statuteCode
				? `/api/cases/${selectedCaseId}/laws`
				: `/api/cases/${selectedCaseId}/citations`;

			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					statute_code: statuteCode,
					citation_id: citationId,
					link_type: linkType,
					notes: notes || undefined,
				}),
			});

			if (response.ok) {
				const data = await response.json();
				if (data.success) {
					onattached?.({ caseId: selectedCaseId, linkType, notes });
					closeModal();
				} else {
					error = data.error || 'Failed to attach';
				}
			} else {
				error = 'Failed to attach';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'An error occurred';
		} finally {
			isSaving = false;
		}
	}

	// Keyboard navigation for case list
	function handleListKeydown(e: KeyboardEvent) {
		const items = filteredCases;
		const currentIndex = items.findIndex((c) => c.id === selectedCaseId);

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				if (currentIndex < items.length - 1) {
					selectedCaseId = items[currentIndex + 1].id;
				} else if (currentIndex === -1 && items.length > 0) {
					selectedCaseId = items[0].id;
				}
				break;
			case 'ArrowUp':
				e.preventDefault();
				if (currentIndex > 0) {
					selectedCaseId = items[currentIndex - 1].id;
				}
				break;
			case 'Enter':
				e.preventDefault();
				if (selectedCaseId) {
					handleSubmit();
				}
				break;
		}
	}
</script>

<Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-[9990] bg-black/80 backdrop-blur-md transition-opacity" />
		<Dialog.Content
			class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9991] w-[92vw] max-w-[540px] max-h-[90vh] overflow-y-auto bg-[#0d0e12]/95 border border-[#2a2e3d] rounded-2xl shadow-2xl p-6 text-neutral-100 font-sans focus:outline-none"
		>
			<!-- Tactical Corner Notches -->
			<span class="hud-notch-tl" aria-hidden="true"></span>
			<span class="hud-notch-tr" aria-hidden="true"></span>
			<span class="hud-notch-bl" aria-hidden="true"></span>
			<span class="hud-notch-br" aria-hidden="true"></span>

			<!-- Gold Top Highlight -->
			<div class="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#f3d471] to-transparent opacity-80" aria-hidden="true"></div>

			<!-- Dialog Header -->
			<div class="flex items-center justify-between pb-4 mb-4 border-b border-[#2a2e3d]">
				<div class="flex items-center gap-3">
					<div class="w-8 h-8 rounded-lg bg-[#f3d471]/10 border border-[#f3d471]/30 flex items-center justify-center text-[#f3d471] font-mono text-xs select-none">
						⚲
					</div>
					<div>
						<Dialog.Title class="text-base font-bold text-neutral-100 uppercase tracking-wider">
							Attach to Case
						</Dialog.Title>
						<p class="text-[11px] text-neutral-400 font-mono">
							{#if statuteCode}
								LINK STATUTE: <span class="text-[#f3d471]">{statuteCode}</span>
							{:else if citationId}
								LINK CITATION: <span class="text-[#f3d471]">{citationId.slice(0, 8)}...</span>
							{:else}
								CASE EVIDENCE BINDING
							{/if}
						</p>
					</div>
				</div>
				<Dialog.Close
					class="h-8 w-8 rounded-lg bg-neutral-800/60 border border-neutral-700/50 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-700/60 hover:border-[#f3d471]/50 transition-all select-none focus:outline-none cursor-pointer"
					aria-label="Close attach-to-case dialog"
				>
					<Icon name="x" class="w-4 h-4" />
				</Dialog.Close>
			</div>

			<form onsubmit={handleSubmit} class="space-y-4">
				{#if error}
					<div class="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs font-mono">
						{error}
					</div>
				{/if}

				{#if isLoading}
					<div class="py-12 flex flex-col items-center justify-center gap-3">
						<div class="w-8 h-8 border-2 border-[#f3d471]/30 border-t-[#f3d471] rounded-full animate-spin"></div>
						<p class="text-xs text-neutral-400 font-mono">LOADING ACTIVE CASES...</p>
					</div>
				{:else}
					<!-- Search Input -->
					<div class="space-y-1.5">
						<label for="case-search" class="text-xs font-semibold text-neutral-300">Select Case <span class="text-[#f3d471]">*</span></label>
						<input
							type="text"
							id="case-search"
							bind:value={searchQuery}
							placeholder="Search by case number or title..."
							disabled={isSaving}
							onkeydown={handleListKeydown}
							class="w-full px-3 py-2 bg-[#12141c] border border-[#2a2e3d] rounded-lg text-neutral-100 placeholder-neutral-500 text-sm focus:outline-none focus:border-[#f3d471] focus:ring-1 focus:ring-[#f3d471]/50 transition-all disabled:opacity-50"
						/>
					</div>

					<!-- Searchable Case List -->
					<div class="space-y-1">
						<div class="max-h-[220px] overflow-y-auto border border-[#2a2e3d] rounded-lg bg-[#12141c]/60 divide-y divide-[#2a2e3d]/60" role="listbox" tabindex="0" onkeydown={handleListKeydown}>
							{#if filteredCases.length === 0}
								<div class="p-6 text-center text-xs text-neutral-400 font-mono">
									No cases found matching "{searchQuery}"
								</div>
							{:else}
								{#each filteredCases as caseItem (caseItem.id)}
									<button
										type="button"
										class="w-full text-left p-3 flex flex-col gap-1 transition-all cursor-pointer {selectedCaseId === caseItem.id ? 'bg-[#f3d471]/15 border-l-4 border-l-[#f3d471]' : 'hover:bg-[#1a1d28]'}"
										onclick={() => (selectedCaseId = caseItem.id)}
										disabled={isSaving}
										role="option"
										aria-selected={selectedCaseId === caseItem.id}
									>
										<div class="flex items-center justify-between text-xs">
											<span class="font-mono font-bold {selectedCaseId === caseItem.id ? 'text-[#f3d471]' : 'text-neutral-300'}">{caseItem.number}</span>
											<span class="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700/50">{caseItem.status}</span>
										</div>
										<div class="text-sm text-neutral-200 line-clamp-1">{caseItem.title}</div>
									</button>
								{/each}
							{/if}
						</div>
						<div class="text-right text-[10px] text-neutral-400 font-mono">
							{filteredCases.length} of {cases.length} active {cases.length === 1 ? 'case' : 'cases'}
						</div>
					</div>

					<!-- Link Type -->
					<div class="space-y-1.5">
						<label for="link_type" class="text-xs font-semibold text-neutral-300">Link Type</label>
						<select
							id="link_type"
							bind:value={linkType}
							disabled={isSaving}
							class="w-full px-3 py-2 bg-[#12141c] border border-[#2a2e3d] rounded-lg text-neutral-100 text-sm focus:outline-none focus:border-[#f3d471] focus:ring-1 focus:ring-[#f3d471]/50 transition-all disabled:opacity-50"
						>
							{#each linkTypes as type (type)}
								<option value={type}>{type.replace(/_/g, ' ')}</option>
							{/each}
						</select>
					</div>

					<!-- Notes -->
					<div class="space-y-1.5">
						<label for="notes" class="text-xs font-semibold text-neutral-300">Notes (Optional)</label>
						<textarea
							id="notes"
							bind:value={notes}
							placeholder="Add context or notes about this link..."
							rows="3"
							disabled={isSaving}
							class="w-full px-3 py-2 bg-[#12141c] border border-[#2a2e3d] rounded-lg text-neutral-100 placeholder-neutral-500 text-sm focus:outline-none focus:border-[#f3d471] focus:ring-1 focus:ring-[#f3d471]/50 transition-all disabled:opacity-50 resize-y"
						></textarea>
					</div>

					<!-- Actions -->
					<div class="flex items-center justify-end gap-3 pt-4 border-t border-[#2a2e3d]">
						<button
							type="button"
							onclick={closeModal}
							disabled={isSaving}
							class="px-4 py-2 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 border border-neutral-700/60 text-neutral-300 hover:text-white text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={isSaving || !selectedCaseId}
							class="px-5 py-2 rounded-lg bg-gradient-to-r from-[#d4af37] to-[#f3d471] hover:from-[#c59e2b] hover:to-[#e5c560] text-black font-bold text-xs uppercase tracking-wider shadow-lg shadow-[#f3d471]/10 transition-all disabled:opacity-50 cursor-pointer"
						>
							{isSaving ? 'Attaching...' : 'Attach to Case'}
						</button>
					</div>
				{/if}
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	.hud-notch-tl,
	.hud-notch-tr,
	.hud-notch-bl,
	.hud-notch-br {
		position: absolute;
		width: 10px;
		height: 10px;
		pointer-events: none;
		z-index: 10;
	}
	.hud-notch-tl {
		top: 3px;
		left: 3px;
		border-top: 2px solid #f3d471;
		border-left: 2px solid #f3d471;
	}
	.hud-notch-tr {
		top: 3px;
		right: 3px;
		border-top: 2px solid #f3d471;
		border-right: 2px solid #f3d471;
	}
	.hud-notch-bl {
		bottom: 3px;
		left: 3px;
		border-bottom: 2px solid #f3d471;
		border-left: 2px solid #f3d471;
	}
	.hud-notch-br {
		bottom: 3px;
		right: 3px;
		border-bottom: 2px solid #f3d471;
		border-right: 2px solid #f3d471;
	}
</style>
