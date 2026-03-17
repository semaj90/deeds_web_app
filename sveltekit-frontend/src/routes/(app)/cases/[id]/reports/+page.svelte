<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { fade } from 'svelte/transition';
	import { goto, invalidateAll } from '$app/navigation';
	import TiptapWithAIAssistant from '$lib/components/editor/TiptapWithAIAssistant.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	const { data } = $props();
	const caseData = $derived(data?.caseData);
	const reports = $derived(data?.reports ?? []);

	let showResumeModal = $state(false);
	let selectedReport = $state<any>(null);
	let showEditor = $state(false);
	let editorContent = $state('');
	let editorTitle = $state('');
	let isSaving = $state(false);
	let isGenerating = $state(false);
	let isExporting = $state(false);
	let isPublishing = $state(false);

	function openResume(report: any) {
		selectedReport = report;
		showResumeModal = true;
	}

	function openEditor(report?: any) {
		if (report) {
			selectedReport = report;
			editorContent = report.content || '';
			editorTitle = report.title || 'Untitled Report';
		} else {
			selectedReport = null;
			editorContent = '';
			editorTitle = 'Untitled Report';
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
				editorContent = responseData.report.content || '';
				editorTitle = responseData.report.title || 'Charging Memo';
				showEditor = true;
			}
		} catch (error) {
			console.error('Failed to generate charging memo:', error);
		} finally {
			isGenerating = false;
		}
	}

	async function saveReport() {
		isSaving = true;
		try {
			if (selectedReport?.id) {
				// Update existing report
				const res = await fetch('/api/reports/save', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						reportId: selectedReport.id,
						title: editorTitle,
						contentHtml: editorContent
					})
				});
				const responseData = await res.json();
				if (responseData.success) {
					selectedReport = responseData.report;
				}
			} else {
				// Create new report via POST /api/reports
				const res = await fetch('/api/reports', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						caseId: caseData?.id,
						title: editorTitle,
						contentHtml: editorContent,
						status: 'draft'
					})
				});
				const responseData = await res.json();
				if (responseData.success && responseData.data) {
					selectedReport = responseData.data;
				}
			}
			await invalidateAll();
		} catch (error) {
			console.error('Failed to save report:', error);
		} finally {
			isSaving = false;
		}
	}

	async function exportReport(format: 'html' | 'pdf' = 'html') {
		if (!selectedReport?.id) return;
		isExporting = true;
		try {
			const res = await fetch(`/api/reports/${selectedReport.id}/export?format=${format}`);
			if (res.ok) {
				const blob = await res.blob();
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `${selectedReport.title || 'report'}.${format}`;
				a.click();
				URL.revokeObjectURL(url);
			}
		} catch (error) {
			console.error('Failed to export report:', error);
		} finally {
			isExporting = false;
		}
	}

	async function publishReport() {
		if (!selectedReport?.id) return;
		isPublishing = true;
		try {
			const res = await fetch(`/api/reports/${selectedReport.id}/publish`, {
				method: 'POST'
			});
			const responseData = await res.json();
			if (responseData.success) {
				selectedReport = { ...selectedReport, status: 'published' };
				await invalidateAll();
			}
		} catch (error) {
			console.error('Failed to publish report:', error);
		} finally {
			isPublishing = false;
		}
	}

	async function deleteReport(reportId: string) {
		if (!confirm('Are you sure you want to delete this report?')) return;
		try {
			const res = await fetch('/api/reports', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids: [reportId] })
			});
			if (res.ok) {
				showResumeModal = false;
				await invalidateAll();
			}
		} catch (error) {
			console.error('Failed to delete report:', error);
		}
	}

	function closeEditor() {
		showEditor = false;
		selectedReport = null;
		editorContent = '';
		editorTitle = '';
	}

	function formatDate(dateStr: string | null | undefined): string {
		if (!dateStr) return '—';
		try {
			return new Date(dateStr).toLocaleDateString('en-US', {
				month: 'short', day: 'numeric', year: 'numeric'
			});
		} catch { return '—'; }
	}
</script>

<section class="p-4 space-y-4">
	<div class="flex items-center justify-between gap-2">
		<h2 class="text-sm uppercase tracking-[0.25em] text-neutral-400">Reports</h2>
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

	<div class="border border-neutral-800 rounded-2xl bg-neutral-900/60 p-4 space-y-2">
		{#if reports?.length}
			{#each reports as report (report.id)}
				<button
					type="button"
					class="w-full text-left px-3 py-2 rounded-xl border border-neutral-800/60
                 hover:border-amber-400/60 hover:bg-neutral-800/60 transition-colors
                 flex items-center justify-between gap-3 text-sm"
					onclick={() => openResume(report)}
				>
					<div class="flex flex-col gap-0.5">
						<span class="font-semibold text-neutral-100">
							{report.title ?? 'Untitled report'}
						</span>
						<span class="text-xs text-neutral-400">
							{(report.type ?? (report.metadata as any)?.reportType ?? report.status ?? 'Draft').replace('_', ' ')} &bull; Updated {formatDate(String(report.updatedAt ?? report.createdAt ?? ''))}
						</span>
					</div>
					<span class="text-[10px] tracking-[0.25em] uppercase text-amber-300">
						Resume
					</span>
				</button>
			{/each}
		{:else}
			<div class="text-xs text-neutral-500">
				No reports created for this case yet.
			</div>
		{/if}
	</div>

	<!-- Resume Modal (bits-ui Dialog) -->
	<Dialog.Root bind:open={showResumeModal}>
		<Dialog.Portal>
			<Dialog.Overlay
				class="fixed inset-0 bg-black/60 z-50"
			/>
			<Dialog.Content
				class="fixed inset-0 z-50 flex items-center justify-center p-4"
			>
				<div
					class="w-full max-w-xl border border-amber-400/40 rounded-3xl
						bg-neutral-950/95 shadow-2xl shadow-amber-500/20 p-4 space-y-4"
				>
					<header class="flex items-center justify-between gap-2">
						<div>
							<Dialog.Title class="text-[10px] uppercase tracking-[0.35em] text-amber-300">
								Resume Draft
							</Dialog.Title>
							<Dialog.Description class="text-sm font-semibold text-neutral-100">
								{selectedReport?.title ?? 'Untitled report'}
							</Dialog.Description>
						</div>
						<Dialog.Close
							class="text-xs px-2 py-1 rounded-full border border-neutral-700
                   hover:bg-neutral-800/80"
						>
							Close
						</Dialog.Close>
					</header>

					<div class="text-xs text-neutral-300 max-h-64 overflow-auto border border-neutral-800 rounded-2xl p-3 bg-neutral-900/60">
						{@html selectedReport?.content
							? selectedReport.content.slice(0, 500) + (selectedReport.content.length > 500 ? '...' : '')
							: '<p class="text-neutral-500">No content yet.</p>'}
					</div>

					<footer class="flex justify-between gap-2">
						<button
							class="text-xs px-3 py-1 rounded-full border border-red-600/60
                   hover:bg-red-600/10 text-red-400"
							onclick={() => selectedReport?.id && deleteReport(selectedReport.id)}
						>
							Delete
						</button>
						<div class="flex gap-2">
							<Dialog.Close
								class="text-xs px-3 py-1 rounded-full border border-neutral-600
                   hover:bg-neutral-800/80"
							>
								Cancel
							</Dialog.Close>
							<button
								class="text-xs px-3 py-1 rounded-full border border-amber-400/80
                   bg-amber-400/10 hover:bg-amber-400/20"
								onclick={() => openEditor(selectedReport)}
							>
								Open in Editor
							</button>
						</div>
					</footer>
				</div>
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>

	<!-- Editor Modal (bits-ui Dialog) -->
	<Dialog.Root bind:open={showEditor}>
		<Dialog.Portal>
			<Dialog.Overlay
				class="fixed inset-0 bg-black/60 z-50"
			/>
			<Dialog.Content
				class="fixed inset-0 z-50 flex items-center justify-center p-4"
			>
				<div
					class="w-full max-w-6xl h-[90vh] border border-amber-400/40 rounded-3xl
						bg-neutral-950/95 shadow-2xl shadow-amber-500/20 p-6 space-y-4 flex flex-col"
				>
					<header class="flex items-center justify-between gap-4">
						<div class="flex-1">
							<Dialog.Title class="text-[10px] uppercase tracking-[0.35em] text-amber-300">
								{selectedReport ? 'Edit Report' : 'New Report'}
							</Dialog.Title>
							<input
								type="text"
								class="text-lg font-semibold text-neutral-100 bg-transparent border-0 border-b border-neutral-700
                         focus:border-amber-400/60 outline-none w-full"
								bind:value={editorTitle}
								placeholder="Report Title"
							/>
						</div>
						<div class="flex gap-2">
							{#if selectedReport?.id}
								<button
									class="text-xs px-3 py-1 rounded-full border border-neutral-600
                         hover:bg-neutral-800/80 flex items-center gap-1"
									onclick={() => exportReport('html')}
									disabled={isExporting}
								>
									<span class="i-lucide-download w-3 h-3"></span>
									{isExporting ? 'Exporting...' : 'Export'}
								</button>
								<button
									class="text-xs px-3 py-1 rounded-full border border-green-600/60
                         hover:bg-green-600/10 text-green-400 flex items-center gap-1"
									onclick={publishReport}
									disabled={isPublishing || selectedReport?.status === 'published'}
								>
									<span class="i-lucide-send w-3 h-3"></span>
									{isPublishing ? 'Publishing...' : selectedReport?.status === 'published' ? 'Published' : 'Publish'}
								</button>
							{/if}
							<Dialog.Close
								class="text-xs px-3 py-1 rounded-full border border-neutral-600
                         hover:bg-neutral-800/80"
							>
								Cancel
							</Dialog.Close>
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

					<Dialog.Description class="sr-only">
						Edit the report content using the rich text editor below.
					</Dialog.Description>

					<div class="flex-1 overflow-auto">
						<TiptapWithAIAssistant
							initialContent={editorContent}
							placeholder="Start writing your report..."
							onUpdate={(html) => {
								editorContent = html;
							}}
						/>
					</div>
				</div>
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
</section>