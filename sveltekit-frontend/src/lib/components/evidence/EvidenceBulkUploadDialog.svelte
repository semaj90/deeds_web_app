<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Dialog from '$lib/components/ui/Dialog.svelte';
	import Svelte5Tabs from '$lib/components/ui/tabs/Svelte5Tabs.svelte';
	import Svelte5TabPanel from '$lib/components/ui/tabs/Svelte5TabPanel.svelte';
	import EvidenceUpload from '$lib/components/evidence/EvidenceUpload.svelte';
	import SmartDocumentForm from '$lib/components/forms/SmartDocumentForm.svelte';
	import EnhancedDocumentUploader from '$lib/components/ai/EnhancedDocumentUploader.svelte';
	import EnhancedFileUpload from '$lib/components/forms/EnhancedFileUpload.svelte';
	import FileUploadSection from '$lib/components/FileUploadSection.svelte';
	import DocumentUploadMachineIntegration from '$lib/components/DocumentUploadMachineIntegration.svelte';
	import EnhancedLegalProcessor from '$lib/components/legal/EnhancedLegalProcessor.svelte';

	let {
		open = $bindable(false),
		activeCaseId = '',
		userId = '',
		onClose,
		onUploadComplete
	}: {
		open?: boolean;
		activeCaseId?: string;
		userId?: string;
		onClose?: () => void;
		onUploadComplete?: () => void;
	} = $props();

	let activeTab = $state('multi');

	const tabs = [
		{ id: 'multi', label: 'Multi-File' },
		{ id: 'ocr', label: 'OCR Upload' },
		{ id: 'ai', label: 'AI Extract' },
		{ id: 'enhanced', label: 'Enhanced' },
		{ id: 'quick', label: 'Quick' },
		{ id: 'xstate', label: 'Pipeline' },
		{ id: 'legal', label: 'Legal Proc.' }
	];

	function handleComplete() {
		onUploadComplete?.();
		invalidateAll();
	}

	function handleClose() {
		open = false;
		onClose?.();
	}
</script>

<Dialog bind:open title="Upload Evidence" description="Choose an upload method for your evidence files." class="bulk-dialog">
	<Svelte5Tabs {tabs} bind:value={activeTab} variant="underline">
		<Svelte5TabPanel value="multi">
			<EvidenceUpload
				caseId={activeCaseId}
				onUploadComplete={() => handleComplete()}
			/>
		</Svelte5TabPanel>

		<Svelte5TabPanel value="ocr">
			<SmartDocumentForm
				title="OCR Upload"
				description="Upload with OCR extraction and entity detection"
				caseId={activeCaseId}
				onsubmit={() => handleComplete()}
			/>
		</Svelte5TabPanel>

		<Svelte5TabPanel value="ai">
			<EnhancedDocumentUploader
				caseId={activeCaseId}
				{userId}
				autoProcess={true}
				showMetadataForm={true}
				onFileProcessed={(result) => { console.log('Processed:', result); }}
			/>
		</Svelte5TabPanel>

		<Svelte5TabPanel value="enhanced">
			<EnhancedFileUpload
				caseId={activeCaseId || undefined}
				multiple={true}
				maxFiles={10}
				maxSizeMB={100}
				onupload={() => handleComplete()}
			/>
		</Svelte5TabPanel>

		<Svelte5TabPanel value="quick">
			<FileUploadSection
				accept=".pdf,.doc,.docx,.txt,.jpg,.png,.tiff,.bmp"
				multiple={true}
				maxSizeMB={100}
				label="Drop evidence files here"
				onfiles={async (files) => {
					if (!files.length) return;
					const formData = new FormData();
					for (const f of files) formData.append('file', f);
					if (activeCaseId) {
						formData.append('case_id', activeCaseId);
						formData.append('caseId', activeCaseId);
					}
					if (activeCaseId) {
						formData.append('case_id', activeCaseId);
						formData.append('caseId', activeCaseId);
					}
					formData.append('enableAiAnalysis', 'true');
					formData.append('enableOcr', 'true');
					formData.append('enableEmbeddings', 'true');
					formData.append('enableSummarization', 'true');
					try {
						const res = await fetch('?/upload', { method: 'POST', body: formData });
						if (res.ok) handleComplete();
					} catch { /* handled */ }
				}}
			/>
		</Svelte5TabPanel>

		<Svelte5TabPanel value="xstate">
			<DocumentUploadMachineIntegration />
		</Svelte5TabPanel>

		<Svelte5TabPanel value="legal">
			<EnhancedLegalProcessor />
		</Svelte5TabPanel>
	</Svelte5Tabs>

	{#snippet footer()}
		<button type="button" class="dialog-close-btn" onclick={handleClose}>Close</button>
	{/snippet}
</Dialog>

<style>
	:global(.bulk-dialog) {
		max-width: 700px !important;
	}
	.dialog-close-btn {
		padding: 0.5rem 1rem;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(212, 199, 163, 0.7);
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.dialog-close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}
</style>
