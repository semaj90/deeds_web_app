<script lang="ts">
	import type { PageData } from './$types';
	import EvidenceUploadProgress from '$lib/components/evidence/EvidenceUploadProgress.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { analytics } from '$lib/stores/analytics.svelte';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();
	let user = $derived(data.user);
	let availableCases = $derived(data.cases ?? []);

	let dragActive = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();
	let currentJobId = $state<string | null>(null);
	let currentFileName = $state<string | null>(null);
	let uploadComplete = $state(false);
	let completedEvidenceId = $state<string | null>(null);
	let completedCaseId = $state<string | null>(null);
	let error = $state<string | null>(null);
	let selectedCaseId = $state<string>('');

	let selectedDestinationLabel = $derived.by(() => {
		if (!selectedCaseId) return 'General Evidence Uploads';

		const selectedCase = availableCases.find((entry) => entry.id === selectedCaseId);
		if (!selectedCase) return 'Selected case';

		return selectedCase.case_number
			? `${selectedCase.title} (${selectedCase.case_number})`
			: selectedCase.title;
	});

	async function uploadFile(file: File) {
		if (!file) return;

		currentFileName = file.name;
		uploadComplete = false;
		completedEvidenceId = null;

		if (!user) {
			await saveToLocalStorage(file);
			return;
		}

		try {
			const formData = new FormData();
			formData.append('file', file);
			if (selectedCaseId) {
				formData.append('case_id', selectedCaseId);
				formData.append('caseId', selectedCaseId);
			}
			formData.append('enableAiAnalysis', 'true');
			formData.append('enableOcr', 'true');
			formData.append('enableEmbeddings', 'true');
			formData.append('enableSummarization', 'true');

			const response = await fetch('/api/evidence/upload', {
				method: 'POST',
				body: formData,
				signal: AbortSignal.timeout(120_000)
			});

			if (!response.ok) {
				const err = await response.json().catch(() => ({}));
				throw new Error(err.error || `Upload failed: ${response.statusText}`);
			}

			const result = await response.json();

			// Start SSE progress tracking via component
			currentJobId = result.jobId;
			completedCaseId = result.caseId ?? null;
			error = null;
			analytics.track('evidence_uploaded', {
				fileName: file.name,
				fileSize: file.size,
				jobId: result.jobId,
				caseId: result.caseId ?? (selectedCaseId || null),
				destination: selectedDestinationLabel,
			});
		} catch (err) {
			console.error('[Upload] Error:', err);
			currentJobId = null;
			error = err instanceof Error ? err.message : 'An unexpected error occurred';
		}
	}

	function handleUploadComplete(evidenceId: string) {
		uploadComplete = true;
		completedEvidenceId = evidenceId;
	}

	function handleUploadError(error: string) {
		console.error('[Upload] Error:', error);
	}

	async function saveToLocalStorage(file: File) {
		try {
			const pendingUpload = {
				id: crypto.randomUUID(),
				fileName: file.name,
				fileSize: file.size,
				fileType: file.type,
				timestamp: Date.now(),
				status: 'pending',
			};

			const uploads = JSON.parse(localStorage.getItem('pending_uploads') || '[]');
			uploads.push(pendingUpload);
			localStorage.setItem('pending_uploads', JSON.stringify(uploads));

			await new Promise((resolve) => setTimeout(resolve, 1000));

			// Offline mode: mark upload as complete
			uploadComplete = true;
		} catch (e) {
			// Offline mode: show error
			console.error('[Upload] Local save failed:', e instanceof Error ? e.message : 'Unknown error');
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragActive = true;
	}

	function handleDragLeave() {
		dragActive = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragActive = false;

		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			uploadFile(files[0]);
		}
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			uploadFile(input.files[0]);
		}
	}

	function handleClick() {
		fileInput?.click();
	}

	function resetUpload() {
		currentJobId = null;
		currentFileName = null;
		uploadComplete = false;
		completedEvidenceId = null;
		completedCaseId = null;
		error = null;
		if (fileInput) {
			fileInput.value = '';
		}
	}
</script>


<div class="upload-container">
	<div class="upload-shell">
	<header class="upload-header">
		<div class="upload-eyebrow"><Icon name="yorha-law-book" size={18} /><span>Evidence Desk</span><span class="eyebrow-divider">✦</span><Icon name="sparkles" size={15} /></div>
		<h1>Evidence Intake</h1>
		<p>Bring the record into focus. Your document is stored first; processing status follows below.</p>
		<div class="header-rule" aria-hidden="true"><span></span><Icon name="star" size={14} /><span></span></div>
	</header>

	{#if user}
		<div class="destination-panel">
			<div class="destination-heading"><span class="destination-icon"><Icon name="yorha-precedent" size={20} /></span><div><label class="destination-label" for="case-destination">Place in the case record</label><p class="destination-caption">Choose the matter that should own this evidence.</p></div></div>
			<select id="case-destination" bind:value={selectedCaseId} class="destination-select">
				<option value="">General Evidence Uploads</option>
				{#each availableCases as entry (entry.id)}
					<option value={entry.id}>
						{entry.title}{entry.case_number ? ` (${entry.case_number})` : ''}
					</option>
				{/each}
			</select>
			<p class="destination-help">
				{#if selectedCaseId}
					This upload will be attached to {selectedDestinationLabel}.
				{:else}
					This upload will be saved to the fallback case <strong>General Evidence Uploads</strong>.
				{/if}
			</p>
		</div>
	{/if}

	<div
		class="upload-zone"
		class:drag-active={dragActive}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
		onclick={handleClick}
		onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
		role="button"
		tabindex="0"
		aria-label="Choose a legal evidence document to upload"
	>
		<div class="upload-icon-wrap"><Icon name="yorha-evidence" size={34} /><span class="upload-star" aria-hidden="true"><Icon name="sparkles" size={17} /></span></div>
		<p class="upload-kicker">Secure evidence intake</p>
		<h2>Drop a document to begin</h2>
		<p>or <span class="browse-hint">choose a file</span> from your device</p>
		<div class="file-type-list"><span>PDF</span><span>DOCX</span><span>PNG</span><span>JPG</span><span>Up to 100 MB</span></div>
	</div>

	<input
		bind:this={fileInput}
		type="file"
		accept=".pdf,.docx,.png,.jpg,.jpeg"
		onchange={handleFileSelect}
		style="display: none"
	/>

	{#if error}
		<div class="error-alert">
			<div class="error-icon"><Icon name="yorha-warning" size={22} /></div>
			<div class="error-content">
				<strong>Upload Failed</strong>
				<p>{error}</p>
			</div>
			<button class="close-error" onclick={() => { error = null; }}>×</button>
		</div>
	{/if}

	{#if currentJobId}
		<div class="progress-container">
			<EvidenceUploadProgress
				jobId={currentJobId}
				filename={currentFileName ?? undefined}
				onComplete={handleUploadComplete}
				onError={handleUploadError}
				showStages={true}
			/>

			{#if uploadComplete && completedEvidenceId}
				<div class="completion-actions">
					{#if completedCaseId}
						<p class="completion-note">Saved under {selectedDestinationLabel}.</p>
					{/if}
					<a href="/evidence/{completedEvidenceId}" class="view-button">
						<Icon name="yorha-evidence" size={17} />
						View Evidence
					</a>
					<button class="reset-button" onclick={resetUpload}><Icon name="file-plus-2" size={17} />Upload Another File</button>
				</div>
			{/if}
		</div>
	{/if}
	<div class="privacy-note"><Icon name="yorha-integrity" size={17} /><span>Case placement and processing status are tied to your signed-in workspace.</span><Icon name="sparkles" size={14} /></div>
	</div>
</div>

<style>
	.upload-container {
		min-height: 100vh;
		background: #0e0d0b;
		color: #d4c7a3;
		margin: -2.5rem;
		padding: 2rem max(1.5rem, calc(50% - 300px));
	}
	.upload-container :global(h1), .upload-container :global(h2), .upload-container :global(h3), .upload-container :global(h4), .upload-container :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.upload-container :global(a) { color: inherit; border-bottom: none; }
	.upload-container :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.upload-container :global(input), .upload-container :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.upload-container :global(.panel), .upload-container :global(.card), .upload-container :global([class*="panel"]) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

	.upload-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.upload-header h1 {
		font-size: 2rem;
		margin: 0 0 0.5rem 0;
		color: #2d2d2d;
	}

	.upload-header p {
		color: #666;
		margin: 0;
	}

	.destination-panel {
		background: #f6f1e6;
		border: 1px solid #e2d5b8;
		border-radius: 8px;
		padding: 1rem;
		margin-bottom: 1.5rem;
	}

	.destination-label {
		display: block;
		font-size: 0.95rem;
		font-weight: 600;
		color: #2d2d2d;
		margin-bottom: 0.5rem;
	}

	.destination-select {
		width: 100%;
		padding: 0.75rem 0.9rem;
		border: 1px solid #c8b88f;
		border-radius: 6px;
		background: #fffdfa;
		color: #2d2d2d;
		font-size: 0.95rem;
	}

	.destination-help {
		margin-top: 0.65rem;
		font-size: 0.9rem;
		color: #5f5746;
	}

	.upload-zone {
		border: 2px dashed #ccc;
		border-radius: 8px;
		padding: 3rem 2rem;
		text-align: center;
		cursor: pointer;
		transition: all 0.3s ease;
		background-color: #f9f9f9;
	}

	.upload-zone:hover {
		border-color: #8b3a3a;
		background-color: #fafaf8;
	}

	.upload-zone.drag-active {
		border-color: #8b3a3a;
		background-color: #f5f0e8;
		transform: scale(1.02);
	}

	.upload-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.upload-zone h2 {
		margin: 0 0 0.5rem 0;
		color: #2d2d2d;
		font-size: 1.3rem;
	}

	.upload-zone p {
		margin: 0.25rem 0;
		color: #666;
	}

	.file-types {
		font-size: 0.9rem;
		color: #999;
		margin-top: 1rem;
	}

	.progress-container {
		margin-top: 2rem;
	}

	.completion-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin-top: 1.5rem;
		justify-content: center;
	}

	.completion-note {
		width: 100%;
		text-align: center;
		color: #2d2d2d;
		margin: 0;
	}

	.view-button {
		padding: 0.75rem 1.5rem;
		background-color: #10b981;
		color: white;
		text-decoration: none;
		border-radius: 4px;
		font-size: 1rem;
		transition: background-color 0.3s ease;
		display: inline-block;
	}

	.view-button:hover {
		background-color: #059669;
	}

	.reset-button {
		margin-top: 1rem;
		padding: 0.75rem 1.5rem;
		background-color: #8b3a3a;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 1rem;
		transition: background-color 0.3s ease;
	}

	.reset-button:hover {
		background-color: #6b2a2a;
	}

	.error-alert {
		margin-top: 1.5rem;
		padding: 1rem;
		background-color: #fcecea;
		border: 1px solid #f5c2bc;
		border-radius: 6px;
		display: flex;
		align-items: center;
		gap: 1rem;
		position: relative;
	}

	.error-icon {
		font-size: 1.5rem;
	}

	.error-content {
		flex: 1;
	}

	.error-content strong {
		display: block;
		color: #b91c1c;
		margin-bottom: 0.25rem;
	}

	.error-content p {
		margin: 0;
		font-size: 0.9rem;
		color: #7f1d1d;
	}

	.close-error {
		background: none;
		border: none;
		font-size: 1.5rem;
		color: #991b1b;
		cursor: pointer;
		padding: 0 0.5rem;
	}

	.upload-container {
		--paper: #f4efe4;
		--paper-light: #fffdf8;
		--ink: #24344c;
		--muted: #697387;
		--burgundy: #7b2735;
		--gold: #ae8745;
		--line: #ded2bb;
		position: relative;
		isolation: isolate;
		min-height: calc(100vh - 4rem);
		margin: -2.5rem;
		padding: clamp(2rem, 6vw, 4.5rem) 1.25rem;
		background:
			radial-gradient(ellipse at 15% 10%, rgba(198, 165, 103, 0.18), transparent 33%),
			radial-gradient(ellipse at 93% 28%, rgba(152, 169, 194, 0.18), transparent 35%),
			linear-gradient(135deg, #f7f2e8 0%, #eee7d8 52%, #f8f4eb 100%);
		color: var(--ink);
		overflow: hidden;
	}
	.upload-container::before,
	.upload-container::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		pointer-events: none;
	}
	.upload-container::before {
		background-image: radial-gradient(rgba(126, 97, 54, 0.17) 0.8px, transparent 0.8px);
		background-size: 26px 26px;
		mask-image: linear-gradient(110deg, #000, transparent 46%, transparent 75%, #000);
		opacity: 0.32;
	}
	.upload-container::after {
		inset: auto -10rem -18rem auto;
		width: 34rem;
		height: 34rem;
		border: 1px solid rgba(174, 135, 69, 0.22);
		border-radius: 50%;
		box-shadow: 0 0 0 28px rgba(174, 135, 69, 0.035), 0 0 0 64px rgba(174, 135, 69, 0.025);
	}
	.upload-shell { position: relative; width: min(100%, 54rem); margin-inline: auto; }
	.upload-container :global(h1),
	.upload-container :global(h2),
	.upload-container :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.upload-container :global(a) { border-bottom: 0; }
	.upload-container :global(button) { text-transform: none; letter-spacing: normal; }
	.upload-header { max-width: 44rem; margin: 0 auto 2.25rem; text-align: center; }
	.upload-eyebrow { display: flex; align-items: center; justify-content: center; gap: 0.55rem; margin-bottom: 0.85rem; color: #7b2735; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.19em; text-transform: uppercase; }
	.eyebrow-divider { color: #ae8745; }
	.upload-header h1 { color: #1e2d44; font-family: Georgia, 'Times New Roman', serif; font-size: clamp(2.25rem, 5vw, 3.25rem); font-weight: 500; letter-spacing: -0.045em; line-height: 1.08; }
	.upload-header p { max-width: 37rem; margin: 0.8rem auto 0; color: #657086; font-size: 0.98rem; line-height: 1.65; }
	.header-rule { display: flex; align-items: center; justify-content: center; gap: 0.75rem; margin: 1.2rem auto 0; color: #ae8745; }
	.header-rule span { width: min(18vw, 7rem); height: 1px; background: linear-gradient(90deg, transparent, #ae8745); }
	.header-rule span:last-child { transform: rotate(180deg); }
	.upload-container .destination-panel { margin-bottom: 1rem; padding: 1.2rem 1.35rem; border: 1px solid rgba(196, 169, 117, 0.52); border-radius: 18px; background: rgba(255, 253, 248, 0.72); backdrop-filter: blur(18px) saturate(1.12); box-shadow: 0 14px 34px rgba(48, 53, 66, 0.07), inset 0 1px rgba(255,255,255,0.92); }
	.destination-heading { display: flex; align-items: center; gap: 0.8rem; margin-bottom: 0.9rem; }
	.destination-icon { display: grid; width: 2.55rem; height: 2.55rem; flex: 0 0 auto; place-items: center; border: 1px solid rgba(174,135,69,0.42); border-radius: 12px; background: linear-gradient(145deg, rgba(255,255,255,0.86), rgba(245,232,205,0.78)); color: #7b2735; box-shadow: 0 5px 14px rgba(92,69,40,0.1), inset 0 1px rgba(255,255,255,0.9); }
	.destination-label { display: block; color: #24344c; font-size: 0.94rem; font-weight: 750; }
	.destination-caption { margin-top: 0.18rem !important; color: #697387; font-size: 0.78rem; }
	.upload-container .destination-select { width: 100%; min-height: 2.9rem; padding: 0.65rem 0.8rem; border: 1px solid #d8cbb2 !important; border-radius: 10px; background-color: #fffdf8 !important; color: #24344c !important; font-size: 0.9rem; }
	.destination-select:focus-visible { outline: 3px solid rgba(174,135,69,0.28); outline-offset: 2px; }
	.destination-help { margin-top: 0.65rem !important; color: #697387; font-size: 0.79rem; }
	.destination-help strong { color: #7b2735; }
	.upload-zone { position: relative; display: flex; min-height: 19rem; flex-direction: column; align-items: center; justify-content: center; padding: 2.4rem 1.5rem; border: 1px dashed rgba(170, 139, 82, 0.7); border-radius: 22px; background: radial-gradient(circle at 50% 0%, rgba(202,174,119,0.2), transparent 52%), linear-gradient(145deg, rgba(255,254,250,0.78), rgba(246,240,228,0.72)); backdrop-filter: blur(20px) saturate(1.14); box-shadow: 0 20px 44px rgba(47,50,61,0.09), inset 0 1px rgba(255,255,255,0.95); text-align: center; cursor: pointer; transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, background 180ms ease; }
	.upload-zone::before { position: absolute; inset: 0.45rem; border: 1px solid rgba(174,135,69,0.18); border-radius: 17px; content: ''; pointer-events: none; }
	.upload-zone:hover, .upload-zone.drag-active { transform: translateY(-2px); border-color: #7b2735; box-shadow: 0 24px 48px rgba(47,50,61,0.12), 0 0 0 4px rgba(174,135,69,0.1); }
	.upload-zone:focus-visible { outline: 3px solid rgba(123,39,53,0.42); outline-offset: 4px; }
	.upload-icon-wrap { position: relative; display: grid; width: 5rem; height: 5rem; place-items: center; margin-bottom: 1.1rem; border: 1px solid rgba(174,135,69,0.5); border-radius: 50%; background: radial-gradient(circle at 35% 25%, #fff 0, rgba(255,255,255,0.86) 24%, rgba(242,231,208,0.78) 72%); box-shadow: 0 0 0 6px rgba(255,255,255,0.34), 0 0 0 7px rgba(174,135,69,0.12), 0 8px 22px rgba(92,69,40,0.14), inset 0 0 0 5px rgba(255,255,255,0.56); color: #7b2735; }
	.upload-star { position: absolute; top: -0.15rem; right: -0.35rem; display: grid; place-items: center; width: 1.65rem; height: 1.65rem; border: 1px solid rgba(174,135,69,0.26); border-radius: 50%; background: rgba(255,253,248,0.78); backdrop-filter: blur(8px); color: #ae8745; box-shadow: 0 2px 8px rgba(48,53,66,0.14); }
	.upload-kicker { color: #7b2735 !important; font-size: 0.67rem; font-weight: 800; letter-spacing: 0.15em; text-transform: uppercase !important; }
	.upload-zone h2 { margin-top: 0.4rem !important; color: #24344c !important; font-family: Georgia, 'Times New Roman', serif; font-size: clamp(1.35rem,3vw,1.7rem); font-weight: 500; }
	.upload-zone > p:not(.upload-kicker) { margin-top: 0.45rem !important; color: #697387 !important; font-size: 0.9rem; }
	.browse-hint { color: #7b2735; font-weight: 700; text-decoration: underline; text-decoration-color: rgba(123,39,53,0.35); text-underline-offset: 3px; }
	.file-type-list { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.45rem; margin-top: 1.25rem; }
	.file-type-list span { padding: 0.32rem 0.6rem; border: 1px solid #e1d6c1; border-radius: 999px; background: rgba(255,255,255,0.58); color: #657086; font-size: 0.67rem; font-weight: 700; letter-spacing: 0.04em; }
	.file-type-list span:last-child { color: #7b2735; border-color: rgba(123,39,53,0.18); }
	.progress-container { margin-top: 1.25rem; }
	.completion-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.65rem; margin-top: 1rem; }
	.completion-note { width: 100%; text-align: center; color: #526078; font-size: 0.85rem; }
	.upload-container .view-button, .upload-container .reset-button { display: inline-flex; min-height: 2.75rem; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.7rem 1.05rem; border: 1px solid transparent; border-radius: 10px; font-size: 0.84rem; font-weight: 750; text-decoration: none; cursor: pointer; transition: transform 160ms ease, box-shadow 160ms ease; }
	.upload-container .view-button { background: #7b2735 !important; color: #fffaf2 !important; box-shadow: 0 8px 18px rgba(123,39,53,0.16); }
	.upload-container .reset-button { border-color: #d7c8ad !important; background: rgba(255,253,248,0.86) !important; color: #24344c !important; }
	.upload-container .view-button:hover, .upload-container .reset-button:hover { transform: translateY(-1px); box-shadow: 0 10px 22px rgba(48,53,66,0.12); }
	.error-alert { display: flex; align-items: center; gap: 0.8rem; margin-top: 1rem; padding: 1rem; border: 1px solid #e5b9b8; border-radius: 14px; background: #fff4f1; color: #722f37; }
	.error-icon { display: grid; place-items: center; color: #7b2735; }
	.error-content { flex: 1; }
	.error-content strong { display: block; margin-bottom: 0.2rem; color: #722f37; }
	.error-content p { color: #724d50; font-size: 0.88rem; overflow-wrap: anywhere; }
	.upload-container .close-error { display: grid; width: 2rem; height: 2rem; place-items: center; border-radius: 50%; color: #722f37 !important; cursor: pointer; }
	.upload-container .close-error:hover { background: rgba(123,39,53,0.08) !important; }
	.privacy-note { display: flex; align-items: center; justify-content: center; gap: 0.55rem; margin-top: 1.5rem; color: #747c88; font-size: 0.72rem; text-align: center; }
	.privacy-note :global(svg), .privacy-note :global(span) { flex: 0 0 auto; color: #ae8745; }
	@media (max-width: 640px) {
		.upload-container { margin: -1rem; padding-inline: 1rem; }
		.upload-header { margin-bottom: 1.5rem; }
		.upload-container .destination-panel { padding: 1rem; }
		.upload-zone { min-height: 17rem; padding: 1.8rem 1rem; }
		.privacy-note { align-items: flex-start; }
	}
</style>
