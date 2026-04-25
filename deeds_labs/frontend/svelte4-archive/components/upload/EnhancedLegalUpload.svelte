<!-- Enhanced Legal Upload Component - Superforms v2 + MinIO + Legal AI -->
<script lang="ts">
	import superForm from 'sveltekit-superforms';
	import { fileProxy } from 'sveltekit-superforms';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';
	import { Dialog } from "bits-ui";
import Button from '$lib/components/ui/Button.svelte';
	import Upload from '@lucide/svelte/icons/upload';
	import FileText from '@lucide/svelte/icons/file-text';
	import Brain from '@lucide/svelte/icons/brain';
	import Scan from '@lucide/svelte/icons/scan';
	import Target from '@lucide/svelte/icons/target';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import X from '@lucide/svelte/icons/x';
	import CheckCircle from '@lucide/svelte/icons/check-circle';

	// Props
	interface Props {
		data: any;
		caseId?: string;
		open?: boolean;
	}

	let {
		data,
		caseId = '',
		open = $bindable(false)
	}: Props = $props();

	// File upload schema (Zod v3)
	const uploadSchema = z.object({
		file: z
			.instanceof(File, { message: 'Please select a file to upload.' })
			.refine((f) => f.size < 100_000_000, 'Maximum file size is 100MB.')
			.refine(
				(f) =>
					[
						'application/pdf',
						'application/msword',
						'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
						'text/plain',
						'image/jpeg',
						'image/png',
						'image/tiff'
					].includes(f.type),
				'Supported formats: PDF, Word, Text, JPEG, PNG, TIFF'
			),
		caseId: z.string().min(1, 'Case ID is required'),
		title: z.string().optional(),
		description: z.string().optional(),
		evidenceType: z.string().default('documents'),
		tags: z.string().optional(),
		enableAiAnalysis: z.boolean().default(true),
		enableOcr: z.boolean().default(true),
		enableEmbeddings: z.boolean().default(true),
		isAdmissible: z.boolean().default(false)
	});

	// Superforms v2 setup
	const { form, errors, enhance, delayed, message } = superForm(data.form, {
		validators: zodClient(uploadSchema),
		dataType: 'form',
		multipleSubmits: 'prevent',
		resetForm: false,
		invalidateAll: true,
		onSubmit: () => {
			processingStage = 'Uploading to MinIO...';
		},
		onResult: ({ result }) => {
			if (result.type === 'success') {
				processingStage = 'Upload complete!';
				setTimeout(() => {
					open = false;
					processingStage = '';
				}, 2000);
			} else if (result.type === 'failure' || result.type === 'error') {
				processingStage = 'Upload failed';
			}
		}
	});

	// File proxy for reactive file binding
	const file = fileProxy(form, 'file');

	// State
	let dragOver = $state(false);
	let filePreview = $state<string | null>(null);
	let processingStage = $state('');
	let ocrResults = $state<any>(null);
	let legalAnalysis = $state<any>(null);
	let semanticEmbeddings = $state<any>(null);

	// Auto-populate caseId from prop
	$effect(() => {
		if (caseId && !$form.caseId) {
			$form.caseId = caseId;
		}
	});

	// File change handler
	function handleFileSelect(selectedFile: File) {
		$file = selectedFile;

		// Generate preview for images
		if (selectedFile.type.startsWith('image/')) {
			filePreview = URL.createObjectURL(selectedFile);
		} else {
			filePreview = null;
		}

		// Run preliminary analysis
		if ($form.enableAiAnalysis) {
			runPreliminaryAnalysis(selectedFile);
		}
	}

	// Preliminary analysis (OCR + LegalBERT + Embeddings)
	async function runPreliminaryAnalysis(selectedFile: File) {
		processingStage = 'Starting AI analysis...';

		try {
			// Step 1: OCR Processing
			if (selectedFile.type === 'application/pdf' && $form.enableOcr) {
				processingStage = 'Extracting text with OCR...';
				const formData = new FormData();
				formData.append('file', selectedFile);

				const ocrResponse = await fetch('/api/ocr/extract', {
					method: 'POST',
					body: formData
				});

				if (ocrResponse.ok) {
					ocrResults = await ocrResponse.json();
					processingStage = `OCR: ${ocrResults.pages} pages, ${ocrResults.averageConfidence}% confidence`;
				}
			}

			// Step 2: Legal Analysis (LegalBERT)
			if ($form.enableAiAnalysis) {
				processingStage = 'Running LegalBERT analysis...';
				const textContent = ocrResults?.text || (await selectedFile.text());

				const legalResponse = await fetch('/api/ai/legal-analysis', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						text: textContent,
						includeEmbeddings: true,
						includeConcepts: true,
						includeClassification: true
					})
				});

				if (legalResponse.ok) {
					legalAnalysis = await legalResponse.json();
					processingStage = `Analysis: ${legalAnalysis.concepts?.length || 0} legal concepts`;
				}
			}

			// Step 3: Semantic Embeddings
			if ($form.enableEmbeddings && legalAnalysis) {
				processingStage = 'Generating semantic embeddings...';

				const embeddingResponse = await fetch('/api/semantic-analysis', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						text: ocrResults?.text || (await selectedFile.text()),
						metadata: {
							caseId: $form.caseId,
							title: $form.title,
							type: $form.evidenceType
						}
					})
				});

				if (embeddingResponse.ok) {
					semanticEmbeddings = await embeddingResponse.json();
					processingStage = 'Analysis complete!';
				}
			}
		} catch (error) {
			console.error('Preliminary analysis failed:', error);
			processingStage = 'Analysis failed - will proceed with basic upload';
		}
	}

	// Drag and drop handlers
	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragOver = false;
		const droppedFile = event.dataTransfer?.files?.[0];
		if (droppedFile) {
			handleFileSelect(droppedFile);
		}
	}

	function onDragOver(event: DragEvent) {
		event.preventDefault();
		dragOver = true;
	}

	function onDragLeave() {
		dragOver = false;
	}

	function removeFile() {
		$file = undefined as any;
		filePreview = null;
		ocrResults = null;
		legalAnalysis = null;
		semanticEmbeddings = null;
		processingStage = '';
	}

	function formatFileSize(bytes: number): string {
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	// Evidence types
	const evidenceTypes = [
		{ value: 'documents', label: '📄 Document' },
		{ value: 'physical_evidence', label: '🔍 Physical Evidence' },
		{ value: 'digital_evidence', label: '💾 Digital Evidence' },
		{ value: 'photographs', label: '📸 Photograph' },
		{ value: 'video_recording', label: '🎥 Video Recording' },
		{ value: 'audio_recording', label: '🎵 Audio Recording' },
		{ value: 'witness_testimony', label: '👥 Witness Testimony' },
		{ value: 'expert_opinion', label: '🎓 Expert Opinion' },
		{ value: 'forensic_analysis', label: '🔬 Forensic Analysis' }
	];
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		<Button variant="default" class="gap-2">
			<Upload class="h-4 w-4" />
			Upload Legal Document
		</Button>
	</Dialog.Trigger>

	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 bg-black/50 z-40" />
		<Dialog.Content
			class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl max-h-[90vh] overflow-y-auto z-50 bg-white dark:bg-panel rounded-lg shadow-xl"
		>
			<div class="sticky top-0 bg-white dark:bg-panel border-b dark:border-sand/20 p-4 flex items-center justify-between">
				<div class="flex items-center gap-3">
					<FileText class="h-5 w-5 text-info dark:text-info/80" />
					<Dialog.Title class="text-lg font-semibold dark:text-white">
						Legal Document Upload
					</Dialog.Title>
				</div>

				<div class="flex items-center gap-2">
					<div class="flex gap-1">
						<span class="px-2 py-1 bg-info/10 dark:bg-info/20 text-info dark:text-info/60 rounded text-xs font-medium flex items-center gap-1">
							<Brain class="h-3 w-3" />
							LegalBERT
						</span>
						<span class="px-2 py-1 bg-accent/10 dark:bg-accent/20 text-accent dark:text-accent/80 rounded text-xs font-medium flex items-center gap-1">
							<Scan class="h-3 w-3" />
							OCR
						</span>
						<span class="px-2 py-1 bg-info/10 dark:bg-info/20 text-info dark:text-info/60 rounded text-xs font-medium flex items-center gap-1">
							<Target class="h-3 w-3" />
							RAG
						</span>
					</div>

					<Dialog.Close>
						<Button variant="ghost" size="sm">
							<X class="h-4 w-4" />
						</Button>
					</Dialog.Close>
				</div>
			</div>

			<form method="POST" action="?/upload" use:enhance enctype="multipart/form-data" class="p-6 space-y-6">
				<!-- Case ID -->
				<div class="space-y-2">
					<label for="caseId" class="block text-sm font-medium dark:text-sand/40">
						Case ID <span class="text-danger">*</span>
					</label>
					<input
						id="caseId"
						name="caseId"
						type="text"
						bind:value={$form.caseId}
						placeholder="Enter case ID"
						required
						class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-info outline-none dark:bg-panelSoft dark:border-sand/30 dark:text-white"
						class:border-danger={$errors.caseId}
					/>
					{#if $errors.caseId}
						<p class="text-sm text-danger">{$errors.caseId}</p>
					{/if}
				</div>

				<!-- File Upload Area -->
				<div class="space-y-2">
					<label class="block text-sm font-medium dark:text-sand/40">
						Document Upload <span class="text-danger">*</span>
					</label>

					<div
						role="button"
						tabindex="0"
						class="relative border-2 border-dashed rounded-lg p-8 transition-all cursor-pointer {dragOver ? 'bg-info/5 dark:bg-info/10' : ''} {!dragOver && !$file ? 'border-sand/20' : ''} {$file ? 'bg-accent/5 dark:bg-accent/10' : ''}"
						class:border-info={dragOver}
						class:border-accent={$file}
						ondrop={onDrop}
						ondragover={onDragOver}
						ondragleave={onDragLeave}
						onclick={() => document.getElementById('file-input')?.click()}
						onkeydown={(e) => e.key === 'Enter' && document.getElementById('file-input')?.click()}
					>
						<input
							id="file-input"
							type="file"
							name="file"
							accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.tiff"
							onchange={(e) => {
								const target = e.target as HTMLInputElement;
								const selectedFile = target.files?.[0];
								if (selectedFile) handleFileSelect(selectedFile);
							}}
							class="hidden"
						/>

						{#if $file}
							<div class="space-y-4">
								<div class="flex items-start gap-4">
									{#if filePreview}
										<img src={filePreview} alt="Preview" class="w-24 h-24 object-cover rounded border" />
									{:else}
										<div class="w-24 h-24 bg-sand/10 dark:bg-panelSoft rounded border flex items-center justify-center">
											<FileText class="h-12 w-12 text-sand/40" />
										</div>
									{/if}

									<div class="flex-1 min-w-0">
										<p class="font-medium text-sm dark:text-white truncate">{$file.name}</p>
										<p class="text-xs text-sand/60 dark:text-sand/40">{formatFileSize($file.size)}</p>

										{#if processingStage}
											<div class="flex items-center gap-2 mt-2 text-xs text-info dark:text-info/80">
												<Loader2 class="h-3 w-3 animate-spin" />
												{processingStage}
											</div>
										{/if}
									</div>

									<button
										type="button"
										onclick={removeFile}
										class="text-danger hover:text-danger transition-colors"
									>
										<X class="h-5 w-5" />
									</button>
								</div>

								<!-- Analysis Preview -->
								{#if ocrResults || legalAnalysis || semanticEmbeddings}
									<div class="bg-sand/5 dark:bg-panelSoft rounded-lg p-4 space-y-2 border border-sand/20 dark:border-sand/20">
										<h4 class="text-sm font-semibold dark:text-white flex items-center gap-2">
											<CheckCircle class="h-4 w-4 text-accent" />
											Preliminary Analysis
										</h4>

										<div class="grid gap-2 text-xs">
											{#if ocrResults}
												<div class="flex justify-between">
													<span class="text-sand/60 dark:text-sand/40">OCR Results:</span>
													<span class="font-medium dark:text-white">
														{ocrResults.pages} pages • {ocrResults.averageConfidence}% confidence
													</span>
												</div>
											{/if}

											{#if legalAnalysis}
												<div class="flex justify-between">
													<span class="text-sand/60 dark:text-sand/40">Legal Analysis:</span>
													<span class="font-medium dark:text-white">
														{legalAnalysis.concepts?.length || 0} concepts identified
													</span>
												</div>
											{/if}

											{#if semanticEmbeddings}
												<div class="flex justify-between">
													<span class="text-sand/60 dark:text-sand/40">Embeddings:</span>
													<span class="font-medium dark:text-white text-accent">Generated ✓</span>
												</div>
											{/if}
										</div>
									</div>
								{/if}
							</div>
						{:else}
							<div class="text-center space-y-3">
								<Upload class="h-12 w-12 mx-auto text-sand/40" />
								<div>
									<p class="text-sm font-medium dark:text-white">Drop your legal document here or click to browse</p>
									<p class="text-xs text-sand/60 dark:text-sand/40 mt-1">
										PDF, Word, Text, or Image files up to 100MB
									</p>
									<p class="text-xs text-info dark:text-info/80 mt-1">
										⚡ Enhanced with OCR, LegalBERT, and Semantic Analysis
									</p>
								</div>
							</div>
						{/if}
					</div>

					{#if $errors.file}
						<p class="text-sm text-danger">{$errors.file}</p>
					{/if}
				</div>

				<!-- Metadata Grid -->
				<div class="grid md:grid-cols-2 gap-4">
					<div class="space-y-2">
						<label for="title" class="block text-sm font-medium dark:text-sand/40">Title</label>
						<input
							id="title"
							name="title"
							type="text"
							bind:value={$form.title}
							placeholder="Document title"
							class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-info outline-none dark:bg-panelSoft dark:border-sand/30 dark:text-white"
						/>
					</div>

					<div class="space-y-2">
						<label for="evidenceType" class="block text-sm font-medium dark:text-sand/40">Evidence Type</label>
						<select
							id="evidenceType"
							name="evidenceType"
							bind:value={$form.evidenceType}
							class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-info outline-none dark:bg-panelSoft dark:border-sand/30 dark:text-white"
						>
							{#each evidenceTypes as type}
								<option value={type.value}>{type.label}</option>
							{/each}
						</select>
					</div>
				</div>

				<!-- Description -->
				<div class="space-y-2">
					<label for="description" class="block text-sm font-medium dark:text-sand/40">Description</label>
					<textarea
						id="description"
						name="description"
						bind:value={$form.description}
						placeholder="Optional description"
						rows="3"
						class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-info outline-none resize-none dark:bg-panelSoft dark:border-sand/30 dark:text-white"
					></textarea>
				</div>

				<!-- Tags -->
				<div class="space-y-2">
					<label for="tags" class="block text-sm font-medium dark:text-sand/40">Tags (comma-separated)</label>
					<input
						id="tags"
						name="tags"
						type="text"
						bind:value={$form.tags}
						placeholder="e.g., contract, evidence, confidential"
						class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-info outline-none dark:bg-panelSoft dark:border-sand/30 dark:text-white"
					/>
				</div>

				<!-- AI Processing Options -->
				<div class="space-y-3 p-4 bg-sand/5 dark:bg-panelSoft rounded-lg border border-sand/20 dark:border-sand/20">
					<h3 class="text-sm font-semibold dark:text-white">🤖 AI Processing Options</h3>

					<div class="grid md:grid-cols-2 gap-3">
						<label class="flex items-center gap-2 cursor-pointer">
							<input type="checkbox" name="enableAiAnalysis" bind:checked={$form.enableAiAnalysis} class="rounded" />
							<span class="text-sm dark:text-sand/40">🧠 Enable AI Analysis</span>
						</label>

						<label class="flex items-center gap-2 cursor-pointer">
							<input type="checkbox" name="enableOcr" bind:checked={$form.enableOcr} class="rounded" />
							<span class="text-sm dark:text-sand/40">📄 Enable OCR</span>
						</label>

						<label class="flex items-center gap-2 cursor-pointer">
							<input type="checkbox" name="enableEmbeddings" bind:checked={$form.enableEmbeddings} class="rounded" />
							<span class="text-sm dark:text-sand/40">🎯 Generate Embeddings</span>
						</label>

						<label class="flex items-center gap-2 cursor-pointer">
							<input type="checkbox" name="isAdmissible" bind:checked={$form.isAdmissible} class="rounded" />
							<span class="text-sm dark:text-sand/40">⚖️ Mark as Admissible</span>
						</label>
					</div>
				</div>

				<!-- Submit Button -->
				<div class="flex items-center justify-between pt-4 border-t dark:border-sand/20">
					<div class="text-xs text-sand/60 dark:text-sand/40">
						{#if $message}
							<span class="text-accent dark:text-accent">✓ {$message}</span>
						{/if}
					</div>

					<Button
						type="submit"
						disabled={$delayed || !$file || !$form.caseId}
						class="gap-2 min-w-[200px]"
					>
						{#if $delayed}
							<Loader2 class="h-4 w-4 animate-spin" />
							Uploading to MinIO...
						{:else if processingStage}
							<Loader2 class="h-4 w-4 animate-spin" />
							Analyzing...
						{:else}
							<Upload class="h-4 w-4" />
							Upload & Analyze
						{/if}
					</Button>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* Prevent layout shift during file upload */
	input[type='file'] {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}
</style>
