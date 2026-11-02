<script lang="ts">
	import { Dialog } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface SaveCitationData {
		statute_code: string;
		statute_title?: string;
		jurisdiction?: string;
		severity?: string;
		year?: number;
		highlighted_text?: string;
		notes?: string;
		case_id?: string;
	}

	interface Props {
		isOpen?: boolean;
		caseId?: string | null;
		highlightedText?: string | null;
		onsaved?: (citation: unknown) => void;
	}

	let { isOpen = $bindable(false), caseId = null, highlightedText = null, onsaved }: Props = $props();

	let formData: SaveCitationData = $state({
		statute_code: '',
		statute_title: '',
		jurisdiction: '',
		severity: '',
		year: new Date().getFullYear(),
		highlighted_text: '',
		notes: '',
		case_id: '',
	});

	$effect(() => {
		formData.highlighted_text = highlightedText || '';
		formData.case_id = caseId || '';
	});

	let isSaving = $state(false);
	let error: string | null = $state(null);

	const jurisdictions = ['Federal', 'State', 'Local', 'International'];
	const severities = ['Felony', 'Misdemeanor', 'Infraction', 'Civil'];

	function resetForm() {
		formData = {
			statute_code: '',
			statute_title: '',
			jurisdiction: '',
			severity: '',
			year: new Date().getFullYear(),
			highlighted_text: highlightedText || '',
			notes: '',
			case_id: caseId || '',
		};
		error = null;
	}

	function closeModal() {
		isOpen = false;
		resetForm();
	}

	function handleOpenChange(open: boolean) {
		isOpen = open;
		if (!open) resetForm();
	}

	async function handleSubmit(e?: Event) {
		e?.preventDefault();
		error = null;

		if (!formData.statute_code.trim()) {
			error = 'Statute code is required';
			return;
		}

		isSaving = true;

		try {
			const response = await fetch('/api/citations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					statute_code: formData.statute_code.trim(),
					statute_title: formData.statute_title || undefined,
					jurisdiction: formData.jurisdiction || undefined,
					severity: formData.severity || undefined,
					year: formData.year || undefined,
					highlighted_text: formData.highlighted_text || undefined,
					notes: formData.notes || undefined,
					case_id: formData.case_id || undefined,
					source_type: 'manual',
				}),
			});

			if (response.ok) {
				const data = await response.json();
				if (data.success) {
					onsaved?.(data.citation);
					closeModal();
				} else {
					error = data.error || 'Failed to save citation';
				}
			} else {
				error = 'Failed to save citation';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'An error occurred';
		} finally {
			isSaving = false;
		}
	}
</script>

<Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-[9990] bg-black/80 backdrop-blur-md transition-opacity" />
		<Dialog.Content
			class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9991] w-[92vw] max-w-[600px] max-h-[90vh] overflow-y-auto bg-[#0d0e12]/95 border border-[#2a2e3d] rounded-2xl shadow-2xl p-6 text-neutral-100 font-sans focus:outline-none"
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
					<div class="w-8 h-8 rounded-lg bg-[#f3d471]/10 border border-[#f3d471]/30 flex items-center justify-center text-[#f3d471] font-serif text-base select-none">
						§
					</div>
					<div>
						<Dialog.Title class="text-base font-bold text-neutral-100 uppercase tracking-wider">
							Save Citation
						</Dialog.Title>
						<p class="text-[11px] text-neutral-400 font-mono">COURT RECORD // CITATION METADATA</p>
					</div>
				</div>
				<Dialog.Close
					class="h-8 w-8 rounded-lg bg-neutral-800/60 border border-neutral-700/50 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-700/60 hover:border-[#f3d471]/50 transition-all select-none focus:outline-none cursor-pointer"
					aria-label="Close citation dialog"
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

				<div class="space-y-1.5">
					<label for="statute_code" class="text-xs font-semibold text-neutral-300">Statute Code <span class="text-[#f3d471]">*</span></label>
					<input
						id="statute_code"
						type="text"
						bind:value={formData.statute_code}
						placeholder="e.g., 18 U.S.C. § 1001"
						disabled={isSaving}
						required
						class="w-full px-3 py-2 bg-[#12141c] border border-[#2a2e3d] rounded-lg text-neutral-100 placeholder-neutral-500 text-sm focus:outline-none focus:border-[#f3d471] focus:ring-1 focus:ring-[#f3d471]/50 transition-all disabled:opacity-50"
					/>
				</div>

				<div class="space-y-1.5">
					<label for="statute_title" class="text-xs font-semibold text-neutral-300">Statute Title</label>
					<input
						id="statute_title"
						type="text"
						bind:value={formData.statute_title}
						placeholder="e.g., Fraud and false statements"
						disabled={isSaving}
						class="w-full px-3 py-2 bg-[#12141c] border border-[#2a2e3d] rounded-lg text-neutral-100 placeholder-neutral-500 text-sm focus:outline-none focus:border-[#f3d471] focus:ring-1 focus:ring-[#f3d471]/50 transition-all disabled:opacity-50"
					/>
				</div>

				<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
					<div class="space-y-1.5">
						<label for="jurisdiction" class="text-xs font-semibold text-neutral-300">Jurisdiction</label>
						<select
							id="jurisdiction"
							bind:value={formData.jurisdiction}
							disabled={isSaving}
							class="w-full px-3 py-2 bg-[#12141c] border border-[#2a2e3d] rounded-lg text-neutral-100 text-sm focus:outline-none focus:border-[#f3d471] focus:ring-1 focus:ring-[#f3d471]/50 transition-all disabled:opacity-50"
						>
							<option value="">Select jurisdiction</option>
							{#each jurisdictions as jurisdiction (jurisdiction)}
								<option value={jurisdiction}>{jurisdiction}</option>
							{/each}
						</select>
					</div>

					<div class="space-y-1.5">
						<label for="severity" class="text-xs font-semibold text-neutral-300">Severity</label>
						<select
							id="severity"
							bind:value={formData.severity}
							disabled={isSaving}
							class="w-full px-3 py-2 bg-[#12141c] border border-[#2a2e3d] rounded-lg text-neutral-100 text-sm focus:outline-none focus:border-[#f3d471] focus:ring-1 focus:ring-[#f3d471]/50 transition-all disabled:opacity-50"
						>
							<option value="">Select severity</option>
							{#each severities as severity (severity)}
								<option value={severity}>{severity}</option>
							{/each}
						</select>
					</div>

					<div class="space-y-1.5">
						<label for="year" class="text-xs font-semibold text-neutral-300">Year</label>
						<input
							id="year"
							type="number"
							bind:value={formData.year}
							min="1900"
							max={new Date().getFullYear()}
							disabled={isSaving}
							class="w-full px-3 py-2 bg-[#12141c] border border-[#2a2e3d] rounded-lg text-neutral-100 text-sm focus:outline-none focus:border-[#f3d471] focus:ring-1 focus:ring-[#f3d471]/50 transition-all disabled:opacity-50"
						/>
					</div>
				</div>

				{#if highlightedText}
					<div class="space-y-1.5">
						<label for="highlighted_text" class="text-xs font-semibold text-neutral-300">Highlighted Text</label>
						<textarea
							id="highlighted_text"
							bind:value={formData.highlighted_text}
							rows="3"
							disabled={isSaving}
							readonly
							class="w-full px-3 py-2 bg-[#161822] border border-[#2a2e3d] rounded-lg text-neutral-300 text-xs font-mono focus:outline-none resize-y"
						></textarea>
					</div>
				{/if}

				<div class="space-y-1.5">
					<label for="notes" class="text-xs font-semibold text-neutral-300">Notes</label>
					<textarea
						id="notes"
						bind:value={formData.notes}
						placeholder="Add any notes about this citation..."
						rows="3"
						disabled={isSaving}
						class="w-full px-3 py-2 bg-[#12141c] border border-[#2a2e3d] rounded-lg text-neutral-100 placeholder-neutral-500 text-sm focus:outline-none focus:border-[#f3d471] focus:ring-1 focus:ring-[#f3d471]/50 transition-all disabled:opacity-50 resize-y"
					></textarea>
				</div>

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
						disabled={isSaving}
						class="px-5 py-2 rounded-lg bg-gradient-to-r from-[#d4af37] to-[#f3d471] hover:from-[#c59e2b] hover:to-[#e5c560] text-black font-bold text-xs uppercase tracking-wider shadow-lg shadow-[#f3d471]/10 transition-all disabled:opacity-50 cursor-pointer"
					>
						{isSaving ? 'Saving...' : 'Save Citation'}
					</button>
				</div>
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
