<script lang="ts">

	import TiptapWithAIAssistant from '$lib/components/editor/TiptapWithAIAssistant.svelte';

	const { data } = $props();
	const caseData = $derived(data?.caseData);
	const reports = $derived(data?.reports);

	let showResumeModal = $state(false);
	let selectedReport = $state<any>(null);
	let showEditor = $state(false);
	let editorContent = $state('');
	let editorRef = $state<any>(null);
	let isSaving = $state(false);
	let isGenerating = $state(false);

	function openResume(report: any) {
		selectedReport = report;
		showResumeModal = true;
	}

	function openEditor(report?: any) {
		if (report) {
			selectedReport = report;
			editorContent = report.contentHtml || '';
		} else {
			selectedReport = null;
			editorContent = '';
		}
		showResumeModal = false;
		showEditor = true;
	}

	async function generateChargingMemo() {
		if (!caseData?.id) return;

		isGenerating = true;
		try {
			const res = await fetch('/api/reports/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ caseId: caseData.id, type: 'charging_memo' })
			});
			const responseData = await res.json();

			if (responseData.success && responseData.report) {
				selectedReport = responseData.report;
				editorContent = responseData.report.contentHtml || '';
				showEditor = true;
			}
		} catch (error) {
			console.error('Failed to generate charging memo:', error);
		} finally {
			isGenerating = false;
		}
	}

	async function saveReport() {
		if (!selectedReport?.id) return;

		isSaving = true;
		try {
			const res = await fetch('/api/reports/save', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
				reportId: selectedReport.id,
					title: selectedReport.title || 'Untitled Report',
					contentHtml: editorRef?.getHTML?.(),
					contentJson: editorRef?.getJSON?.()
				})
			});
			const responseData = await res.json();

			if (responseData.success) {
				selectedReport = responseData.report;
			}
		} catch (error) {
			console.error('Failed to save report:', error);
		} finally {
			isSaving = false;
		}
	}

	function closeEditor() {
		showEditor = false;
		selectedReport = null;
		editorContent = '';
	}
</script>

<section class="p-4 space-y-4">
	<div class="flex items-center justify-between gap-2">
		<h2 class="text-sm uppercase tracking-[0.25em] text-slate-400">Reports</h2>
		<div class="flex gap-2">
			<button
				class="text-xs px-3 py-1 rounded-full border border-amber-400/60
             hover:bg-amber-400/10 transition-colors"
				onclick={generateChargingMemo}
				disabled={isGenerating}
			>
				{isGenerating ? 'Generating...' : 'Generate Charging Memo'}
			</button>
			<button
				class="text-xs px-3 py-1 rounded-full border border-amber-400/60
             hover:bg-amber-400/10 transition-colors"
				onclick={() => openEditor()}
			>
				New Draft
			</button>
		</div>
	</div>

	<div class="border border-slate-800 rounded-2xl bg-slate-900/60 p-4 space-y-2">
		{#if reports?.length}
			{#each reports as report (report.id)}
				<button
					type="button"
					class="w-full text-left px-3 py-2 rounded-xl border border-slate-800/60
                 hover:border-amber-400/60, hover:bg-slate-800/60 transition-colors
                 flex items-center justify-between gap-3 text-sm"
					onclick={() => openResume(report)}
				>
					<div class="flex flex-col gap-0.5">
						<span class="font-semibold">
							{report.title ?? 'Untitled report'}
						</span>
						<span class="text-xs text-slate-400">
							{report.type ?? 'Draft'} • Last updated {report.updated_at ?? '—'}
						</span>
					</div>
					<span class="text-[10px] tracking-[0.25em] uppercase text-amber-300">
						Resume
					</span>
				</button>
			{/each}
		{:else}
			<div class="text-xs text-slate-400">
				No reports created for this case yet.
			</div>
		{/if}
	</div>

	{#if showResumeModal}
		<!-- Backdrop -->
		<div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
			<!-- Modal -->
			<div
				class="w-full max-w-xl border border-amber-400/40 rounded-3xl
                  bg-slate-950/95 shadow-2xl shadow-amber-500/20 p-4 space-y-4"
			>
				<header class="flex items-center justify-between gap-2">
					<div>
						<div class="text-[10px] uppercase tracking-[0.35em] text-amber-300">
							Resume Draft
						</div>
						<div class="text-sm font-semibold text-slate-50">
							{selectedReport?.title ?? 'Untitled report'}
						</div>
					</div>
					<button
						class="text-xs px-2 py-1 rounded-full border border-slate-700
                   hover:bg-slate-800/80"
						onclick={() => (showResumeModal = false)}
					>
						Close
					</button>
				</header>

				<div class="text-xs text-slate-300 max-h-64 overflow-auto border border-slate-800 rounded-2xl p-3 bg-slate-900/60">
					{selectedReport?.preview ?? 'Report body preview will appear here once wired to the reports API.'}
				</div>

				<footer class="flex justify-end gap-2">
					<button
						class="text-xs px-3 py-1 rounded-full border border-slate-600
                   hover:bg-slate-800/80"
						onclick={() => (showResumeModal = false)}
					>
						Cancel
					</button>
					<button
						class="text-xs px-3 py-1 rounded-full border border-amber-400/80
                   bg-amber-400/10 hover:bg-amber-400/20"
						onclick={() => openEditor(selectedReport)}
					>
						Open in Editor
					</button>
				</footer>
			</div>
		</div>
	{/if}



	{#if showEditor}
		<!-- Editor Modal -->
		<div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
			<div
				class="w-full max-w-6xl h-[90vh] border border-amber-400/40 rounded-3xl
                  bg-slate-950/95 shadow-2xl shadow-amber-500/20 p-6 space-y-4 flex flex-col"
			>
				<header class="flex items-center justify-between gap-4">
					<div class="flex-1">
						<div class="text-[10px] uppercase tracking-[0.35em] text-amber-300">
							{selectedReport ? 'Edit Report' : 'New Report'}
						</div>
						<input
							type="text"
							class="text-lg font-semibold text-slate-50 bg-transparent border-0 border-b border-slate-700
                         focus:border-amber-400/60 outline-none w-full"
							value={selectedReport?.title || 'Untitled Report'}
							oninput={(e) => {
								if (selectedReport) {
									selectedReport.title = (e.currentTarget as HTMLInputElement).value;
								}
							}}
							placeholder="Report Title"
						/>
					</div>
					<div class="flex gap-2">
						<button
							class="text-xs px-3 py-1 rounded-full border border-slate-600
                         hover:bg-slate-800/80"
							onclick={closeEditor}
						>
							Cancel
						</button>
						<button
							class="text-xs px-3 py-1 rounded-full border border-amber-400/80
                         bg-amber-400/10 hover:bg-amber-400/20"
							onclick={saveReport}
							disabled={isSaving}
						>
							{isSaving ? 'Saving...' : 'Save'}
						</button>
					</div>
				</header>

				<div class="flex-1 overflow-auto">
					<TiptapWithAIAssistant
						bind:this={editorRef}
						initialContent={editorContent}
						placeholder="Start writing your report..."
						onUpdate={(html) => {
							editorContent = html;
						}}
					/>
				</div>
			</div>
		</div>
	{/if}
</section>
