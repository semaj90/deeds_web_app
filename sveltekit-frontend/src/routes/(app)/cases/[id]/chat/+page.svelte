<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/ui/Icon.svelte';
	import EvidenceViewModal from '$lib/components/evidence/EvidenceViewModal.svelte';

	interface Props {
		data: {
			caseData: any;
			evidenceList: any[];
			documentsList: any[];
			notesList: any[];
			citationsList: any[];
			loadError?: string | null;
		};
	}

	let { data }: Props = $props();

	// Case metadata from Drizzle ORM
	let caseData = $derived(data.caseData);
	let caseId = $derived(caseData?.id ?? page.params.id ?? '');
	let evidenceList = $state<any[]>([]);
	let documentsList = $derived(data.documentsList ?? []);
	let notesList = $derived(data.notesList ?? []);
	let citationsList = $derived(data.citationsList ?? []);

	$effect(() => {
		evidenceList = data.evidenceList ?? [];
	});

	// Navigation & tabs in left rail
	let leftRailTab = $state<'evidence' | 'documents' | 'notes'>('evidence');

	// Multi-Modal Evidence Viewer Modal State
	let selectedEvidenceId = $state<string | null>(null);
	let isEvidenceModalOpen = $state(false);

	// Custom Local Media Viewer Modal State (for uncommitted chat frames)
	let localViewerOpen = $state(false);
	let localViewerMedia = $state<{
		url: string;
		name: string;
		mimeType: string;
		size: string;
		hash?: string;
	} | null>(null);

	// Chat message state
	interface ChatTurn {
		id: string;
		role: 'user' | 'assistant';
		content: string;
		timestamp: string;
		attachedImage?: string;
		attachedLabel?: string;
		detectedMime?: string;
		fileSizeKb?: number;
		savedEvidenceId?: string;
		isSaving?: boolean;
		sourceRefs?: Array<{ sourceRef: string; label: string }>;
	}

	const caseRecordCount = $derived(
		evidenceList.length +
		(data.documentsList?.length ?? 0) +
		(data.notesList?.length ?? 0) +
		(data.citationsList?.length ?? 0)
	);

	let messages = $state<ChatTurn[]>([
		{
			id: 'init-1',
			role: 'assistant',
			content: '**Contextual AI Counsel is ready.** I can offer general guidance and help examine this case’s records. Answers are not source-verified unless supporting records are shown with the response.',
			timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
		}
	]);

	let inputText = $state('');
	let isBusy = $state(false);
	let chatScrollEl = $state<HTMLDivElement | null>(null);

	// Attachment state for next turn
	let pendingFile = $state<File | null>(null);
	let pendingDataUri = $state<string | null>(null);
	let pendingMime = $state<string>('');
	let isDragOverChat = $state(false);
	let isDragOverRail = $state(false);
	let uploadStatusMessage = $state<string | null>(null);

	// Quick prompt suggestions
	const quickPrompts = [
		'Audit evidence ledger: what items have chain-of-custody gaps?',
		'Summarize all uploaded documents against plaintiff claims',
		'Draft cross-examination attack lines for this docket',
		'Check statute of limitations and jurisdictional posture'
	];

	function scrollToBottom() {
		setTimeout(() => {
			if (chatScrollEl) {
				chatScrollEl.scrollTop = chatScrollEl.scrollHeight;
			}
		}, 60);
	}

	// MIME type detection helper
	function detectMimeType(filename: string, rawMime?: string): string {
		if (rawMime && rawMime.length > 3) return rawMime;
		const ext = filename.split('.').pop()?.toLowerCase() ?? '';
		switch (ext) {
			case 'png': return 'image/png';
			case 'jpg':
			case 'jpeg': return 'image/jpeg';
			case 'webp': return 'image/webp';
			case 'gif': return 'image/gif';
			case 'pdf': return 'application/pdf';
			case 'mp4': return 'video/mp4';
			case 'mov': return 'video/quicktime';
			case 'webm': return 'video/webm';
			case 'mp3': return 'audio/mpeg';
			case 'wav': return 'audio/wav';
			case 'ogg': return 'audio/ogg';
			case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
			case 'doc': return 'application/msword';
			case 'txt': return 'text/plain';
			case 'md': return 'text/markdown';
			default: return 'application/octet-stream';
		}
	}

	function getMimeCategory(mime: string): 'image' | 'video' | 'audio' | 'pdf' | 'document' | 'other' {
		if (mime.startsWith('image/')) return 'image';
		if (mime.startsWith('video/')) return 'video';
		if (mime.startsWith('audio/')) return 'audio';
		if (mime.includes('pdf')) return 'pdf';
		if (mime.includes('word') || mime.includes('text') || mime.includes('document')) return 'document';
		return 'other';
	}

	// Handle File Selection
	function handleFileInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;
		attachFile(file);
	}

	function attachFile(file: File) {
		pendingFile = file;
		pendingMime = detectMimeType(file.name, file.type);
		const reader = new FileReader();
		reader.onload = () => {
			pendingDataUri = String(reader.result || '');
		};
		reader.readAsDataURL(file);
	}

	// Save File / Attachment directly to PostgreSQL 18 via /api/evidence/upload
	async function saveToCaseEvidence(file: File | Blob, title?: string, mime?: string): Promise<any> {
		if (!caseId) return null;
		const form = new FormData();
		const filename = file instanceof File ? file.name : `evidence-${Date.now()}.${mime?.includes('png') ? 'png' : 'jpg'}`;
		form.append('file', file, filename);
		form.append('caseId', caseId);
		form.append('title', title || filename);
		form.append('description', 'Ingested via Dedicated Contextual AI Counsel Workspace');
		
		const category = getMimeCategory(mime || file.type || '');
		const evidenceType = category === 'image' ? 'photo' : category === 'video' ? 'video' : category === 'audio' ? 'audio' : 'documentary';
		form.append('evidenceType', evidenceType);

		uploadStatusMessage = `Uploading and hashing ${filename} to PostgreSQL 18…`;

		try {
			const res = await fetch('/api/evidence/upload', {
				method: 'POST',
				body: form
			});
			if (res.ok) {
				const payload = await res.json();
				uploadStatusMessage = `✓ Successfully saved ${filename} to PostgreSQL 18 Evidence Ledger!`;
				setTimeout(() => { uploadStatusMessage = null; }, 4000);
				
				// Add to local evidence list state
				if (payload.evidence) {
					evidenceList = [payload.evidence, ...evidenceList];
					window.dispatchEvent(new CustomEvent('evidence-updated', { detail: { caseId, evidence: payload.evidence } }));
				}
				return payload.evidence;
			} else {
				uploadStatusMessage = 'Upload failed. Check server permissions.';
			}
		} catch (err) {
			uploadStatusMessage = 'Error connecting to evidence upload pipeline.';
		}
		return null;
	}

	// Drag & Drop Ingestion
	async function handleRailDrop(e: DragEvent) {
		e.preventDefault();
		isDragOverRail = false;
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			for (let i = 0; i < files.length; i++) {
				await saveToCaseEvidence(files[i], files[i].name, files[i].type);
			}
		}
	}

	// Dispatch AI Chat Turn
	async function handleSendMessage() {
		const text = inputText.trim();
		if (!text && !pendingDataUri) return;

		const userTurn: ChatTurn = {
			id: `u_${Date.now()}`,
			role: 'user',
			content: text || 'Please inspect and analyze this attached artifact.',
			timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
			attachedImage: pendingDataUri ?? undefined,
			attachedLabel: pendingFile?.name ?? undefined,
			detectedMime: pendingMime || undefined,
			fileSizeKb: pendingFile ? Math.round(pendingFile.size / 1024) : undefined
		};

		messages = [...messages, userTurn];
		const fileToUpload = pendingFile;
		const dataUriToUpload = pendingDataUri;

		inputText = '';
		pendingFile = null;
		pendingDataUri = null;
		pendingMime = '';
		isBusy = true;
		scrollToBottom();

		// Auto-save the uploaded file to PostgreSQL 18 if attached
		if (fileToUpload) {
			userTurn.isSaving = true;
			void saveToCaseEvidence(fileToUpload, fileToUpload.name, userTurn.detectedMime).then((ev) => {
				userTurn.isSaving = false;
				if (ev?.id) {
					userTurn.savedEvidenceId = ev.id;
				}
			});
		}

		try {
			// Query Ornith (:8090) Screen / Contextual Analysis
			const historyPayload = messages.slice(-6).map((m) => ({
				role: m.role,
				content: m.content
			}));

			const res = await fetch('/api/ai/screen-analysis', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					mode: 'chat',
					message: userTurn.content,
					caseId: caseId,
					imageBase64: dataUriToUpload || null,
					history: historyPayload
				}),
				signal: AbortSignal.timeout(45_000)
			});

			const data = await res.json().catch(() => ({}));
			if (!res.ok || data.ok === false) {
				messages = [
					...messages,
					{
						id: `err_${Date.now()}`,
						role: 'assistant',
						content: data.error || `Counsel could not load a response (${res.status}). No analysis was completed.`,
						timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
					}
				];
				return;
			}

			const assistantTurn: ChatTurn = {
				id: `a_${Date.now()}`,
				role: 'assistant',
				content: data.answer || data.response || 'Counsel returned no answer.',
				timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
				sourceRefs: Array.isArray(data.sourceRefs)
					? data.sourceRefs.filter((ref: unknown): ref is { sourceRef: string; label: string } =>
						typeof ref === 'object' && ref !== null &&
						typeof (ref as { sourceRef?: unknown }).sourceRef === 'string' &&
						typeof (ref as { label?: unknown }).label === 'string'
					)
					: []
			};

			messages = [...messages, assistantTurn];
		} catch (err) {
			messages = [
				...messages,
				{
					id: `err_${Date.now()}`,
					role: 'assistant',
					content: `⚠️ Error contacting Ornith 1.5 9B: ${err instanceof Error ? err.message : 'Timeout'}`,
					timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
				}
			];
		} finally {
			isBusy = false;
			scrollToBottom();
		}
	}

	// Expand Modal for committed evidence
	function inspectCommittedEvidence(id: string) {
		selectedEvidenceId = id;
		isEvidenceModalOpen = true;
	}

	// Expand Modal for uncommitted local preview
	function inspectLocalMedia(turn: ChatTurn) {
		if (!turn.attachedImage) return;
		localViewerMedia = {
			url: turn.attachedImage,
			name: turn.attachedLabel || 'Attached Screen Capture',
			mimeType: turn.detectedMime || 'image/png',
			size: turn.fileSizeKb ? `${turn.fileSizeKb} KB` : 'Dynamic Frame'
		};
		localViewerOpen = true;
	}
</script>

<svelte:head>
	<title>AI Counsel Chat · {caseData?.title ?? 'Case #1'} · deeds-web-app</title>
</svelte:head>

<div class="dedicated-chat-shell min-h-screen flex flex-col">
	<!-- Top Case Command Header (NieR: Automata × Harvard Law) -->
	<header class="chat-header">
		<div class="max-w-7xl mx-auto px-5 py-3 flex flex-wrap items-center justify-between gap-3">
			<div class="flex items-center gap-3 min-w-0">
				<a href={`/cases/${caseId}`} class="chat-back-btn" title="Back to Case Dossier">
					<span>←</span>
					<span class="hidden sm:inline">Dossier Hub</span>
				</a>
				<span class="text-[#7F7565]/40 font-mono text-xs">/</span>
				<div class="min-w-0">
					<div class="flex items-center gap-2">
						<span class="chat-case-kicker">CASE #1 &bull; POSTGRESQL 18 DRIZZLE-ORM</span>
						{#if caseData?.status}
							<span class="chat-badge-status">{caseData.status.replace(/_/g, ' ')}</span>
						{/if}
					</div>
					<h1 class="chat-case-title truncate">
						{caseData?.title || `Untitled Case Dossier — Docket #${caseId.slice(0, 8).toUpperCase()}`}
					</h1>
				</div>
			</div>

			<!-- Telemetry Badges -->
			<div class="flex items-center gap-2">
				<div class="chat-tel-pill">
					<span class="chat-pulse-dot"></span>
					<span>LOCAL AI ENDPOINT · :8090</span>
				</div>
				<span class="chat-badge-stat">
					{evidenceList.length} Exhibits
				</span>
				<span class="chat-badge-stat">
					{documentsList.length} Docs
				</span>
			</div>
		</div>
	</header>

	<!-- Main Executive Workspace: 2-Column Split -->
	<div class="flex-1 max-w-7xl w-full mx-auto px-4 py-4 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch min-h-0">

		<!-- ========================================================= -->
		<!-- LEFT COLUMN (4/12): CASE FILES, DOCUMENTS & NOTES RAIL    -->
		<!-- ========================================================= -->
		<aside class="lg:col-span-4 flex flex-col space-y-3 min-h-0">
			<!-- Rail Card Container -->
			<div
				class={['chat-rail-card flex-1 flex flex-col min-h-0', isDragOverRail && 'chat-rail-dragover']}
				ondragover={(e) => { e.preventDefault(); isDragOverRail = true; }}
				ondragleave={() => (isDragOverRail = false)}
				ondrop={handleRailDrop}
				role="region"
				aria-label="Case Evidence and Documents Navigator"
			>
				<!-- Rail Header & Tabs -->
				<div class="chat-rail-header">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<span class="text-[#FFE59A] text-xs">❖</span>
							<span class="text-xs font-mono font-bold uppercase tracking-wider text-[#FAF4EC]">Case Corpus Files</span>
						</div>
						<span class="text-[10.5px] font-mono text-[#A7F3D0]">PG18 LEDGER</span>
					</div>

					<div class="flex items-center gap-1 mt-2.5">
						<button
							type="button"
							onclick={() => (leftRailTab = 'evidence')}
							class={['chat-rail-tab', leftRailTab === 'evidence' && 'chat-rail-tab-active']}
						>
							Exhibits ({evidenceList.length})
						</button>
						<button
							type="button"
							onclick={() => (leftRailTab = 'documents')}
							class={['chat-rail-tab', leftRailTab === 'documents' && 'chat-rail-tab-active']}
						>
							Docs ({documentsList.length})
						</button>
						<button
							type="button"
							onclick={() => (leftRailTab = 'notes')}
							class={['chat-rail-tab', leftRailTab === 'notes' && 'chat-rail-tab-active']}
						>
							Notes ({notesList.length})
						</button>
					</div>
				</div>

				<!-- Drag & Drop Ingestion Strip -->
				<label class="chat-dropzone-strip">
					<Icon name="upload" size={13} class="text-[#FFE59A] shrink-0" />
					<span class="truncate text-[11px] font-mono text-[#D5C6AC]">
						{isDragOverRail ? 'Release to Ingest into PostgreSQL 18' : 'Drop Artifacts (PDF, MP4, JPG) Here'}
					</span>
					<input
						type="file"
						multiple
						onchange={handleFileInput}
						class="hidden"
						accept=".pdf,.png,.jpg,.jpeg,.mp4,.mov,.mp3,.docx,.txt,.md"
					/>
				</label>

				{#if uploadStatusMessage}
					<div class="px-3 py-1.5 bg-[#251F19] border-y border-[#FFE59A]/30 text-[11px] font-mono text-[#FFE59A]">
						{uploadStatusMessage}
					</div>
				{/if}

				<!-- Scrollable Rail Content -->
				<div class="flex-1 overflow-y-auto p-3 space-y-2 min-h-[300px]">
					{#if leftRailTab === 'evidence'}
						{#if evidenceList.length === 0}
							<div class="text-center py-8 px-4 text-xs font-mono text-[#8C7D6D]">
								<p>No exhibits saved in PostgreSQL 18 yet.</p>
								<p class="mt-1 text-[11px]">Upload an image or drop files above to commit them.</p>
							</div>
						{:else}
							{#each evidenceList as item (item.id)}
								{@const mimeCat = getMimeCategory(item.fileType || item.mimeType || '')}
								<button
									type="button"
									onclick={() => inspectCommittedEvidence(item.id)}
									class="chat-file-row text-left w-full group"
								>
									<div class="flex items-start justify-between gap-2">
										<div class="min-w-0 flex-1">
											<div class="flex items-center gap-1.5">
												<span class={['chat-mime-badge', `chat-mime-${mimeCat}`]}>
													{mimeCat.toUpperCase()}
												</span>
												<h4 class="text-xs font-bold text-[#FAF4EC] truncate group-hover:text-[#FFE59A] transition-colors">
													{item.title || item.fileName || 'Untitled Exhibit'}
												</h4>
											</div>
											<div class="flex items-center gap-2 mt-1 text-[10.5px] font-mono text-[#8C7D6D]">
												<span>#{item.id.slice(0, 8)}</span>
												<span>&bull;</span>
												<span>{item.fileSize ? `${Math.round(Number(item.fileSize) / 1024)} KB` : 'Direct Ingest'}</span>
											</div>
										</div>
										<span class="text-xs text-[#8C7D6D] group-hover:text-[#FFE59A]">⤢</span>
									</div>
								</button>
							{/each}
						{/if}

					{:else if leftRailTab === 'documents'}
						{#if documentsList.length === 0}
							<div class="text-center py-8 px-4 text-xs font-mono text-[#8C7D6D]">
								No documents filed in this docket yet.
							</div>
						{:else}
							{#each documentsList as doc (doc.id)}
								<div class="chat-file-row">
									<div class="flex items-center gap-2">
										<span class="chat-mime-badge chat-mime-document">DOC</span>
										<span class="text-xs font-semibold text-[#FAF4EC] truncate">{doc.title}</span>
									</div>
									<p class="text-[10.5px] font-mono text-[#8C7D6D] mt-1">{doc.status ?? 'Draft'}</p>
								</div>
							{/each}
						{/if}

					{:else if leftRailTab === 'notes'}
						{#if notesList.length === 0}
							<div class="text-center py-8 px-4 text-xs font-mono text-[#8C7D6D]">
								No scratchpad notes recorded yet.
							</div>
						{:else}
							{#each notesList as note (note.id)}
								<div class="chat-file-row">
									<div class="flex items-center justify-between">
										<span class="text-xs font-semibold text-[#FAF4EC]">{note.title || 'Untitled Note'}</span>
										<span class="text-[10px] font-mono text-[#8C7D6D]">{new Date(note.createdAt).toLocaleDateString()}</span>
									</div>
									<p class="text-xs text-[#C5BBAA] mt-1 line-clamp-2">{note.content}</p>
								</div>
							{/each}
						{/if}
					{/if}
				</div>
			</div>
		</aside>

		<!-- ========================================================= -->
		<!-- RIGHT COLUMN (8/12): FULL-PAGE CONTEXTUAL AI CHAT COUNSEL -->
		<!-- ========================================================= -->
		<main class="lg:col-span-8 flex flex-col min-h-0 chat-main-card">
			<!-- Chat Context Bar -->
			<div class="chat-main-header">
				<div class="flex items-center justify-between gap-3">
					<div class="flex items-center gap-2">
						<span class="text-[#FFE59A]">✦</span>
						<span class="font-mono text-xs font-bold uppercase tracking-wider text-[#FAF4EC]">
							Contextual AI Counsel &bull; Multimodal Grounding Active
						</span>
					</div>
					<div class="flex items-center gap-2 font-mono text-[11px] text-[#A7F3D0]">
						<span>PG18 LIVE SYNC</span>
						<span>&bull;</span>
						<span>{messages.length} TURNS</span>
					</div>
				</div>
			</div>

			<!-- Message Stream Area -->
			<div
				class={['chat-messages-scroll flex-1 overflow-y-auto p-4 space-y-4', isDragOverChat && 'chat-drag-active']}
				bind:this={chatScrollEl}
				ondragover={(e) => { e.preventDefault(); isDragOverChat = true; }}
				ondragleave={() => (isDragOverChat = false)}
				ondrop={(e) => {
					e.preventDefault();
					isDragOverChat = false;
					const file = e.dataTransfer?.files?.[0];
					if (file) attachFile(file);
				}}
				role="log"
				aria-label="Conversation messages"
			>
				{#each messages as turn (turn.id)}
					<div class={['chat-turn-wrap', turn.role === 'user' ? 'chat-turn-user' : 'chat-turn-assistant']}>
						<div class="chat-turn-head">
							<span class="chat-turn-author">{turn.role === 'user' ? 'LEGAL COUNSEL' : 'ORNITH 1.5 9B &bull; AI COUNSEL'}</span>
							<span class="chat-turn-time">{turn.timestamp}</span>
						</div>

						<!-- Attached Media Card with MIME File Detector -->
						{#if turn.attachedImage}
							<div class="chat-attachment-card">
								<div class="flex items-center justify-between p-2 bg-[#262019] border-b border-[#3E3224]">
									<div class="flex items-center gap-2">
										<span class="chat-mime-pill">
											{turn.detectedMime ?? 'image/jpeg'}
										</span>
										<span class="text-xs font-bold text-[#FAF4EC] truncate max-w-[220px]">
											{turn.attachedLabel || 'Uploaded Image Artifact'}
										</span>
									</div>
									<span class="text-[11px] font-mono text-[#FFE59A]">
										{turn.fileSizeKb ? `${turn.fileSizeKb} KB` : 'Direct Frame'}
									</span>
								</div>

								<!-- Thumbnail & Actions -->
								<div class="p-2 flex flex-wrap items-center gap-3">
									<button
										type="button"
										onclick={() => inspectLocalMedia(turn)}
										class="chat-thumb-btn group"
										title="Click to expand in Multi-Modal Viewer"
									>
										<img src={turn.attachedImage} alt="Attachment thumbnail" class="chat-thumb-img" />
										<span class="chat-thumb-overlay">⤢ Expand Viewer</span>
									</button>

									<div class="flex-1 min-w-[200px] space-y-1.5 font-mono text-xs">
										<div class="text-[#C5BBAA]">
											<strong>Lineage:</strong> Ingested into workspace session
										</div>
										<div class="flex items-center gap-2">
											{#if turn.savedEvidenceId}
												<span class="px-2 py-0.5 rounded bg-[#184A3C] text-[#A7F3D0] border border-[#20604E] text-[10.5px]">
													✓ Saved as Exhibit #{turn.savedEvidenceId.slice(0, 8)}
												</span>
											{:else if turn.isSaving}
												<span class="text-[#FFE59A] text-[10.5px]">
													▸ Committing to PostgreSQL 18…
												</span>
											{/if}
										</div>
									</div>
								</div>
							</div>
						{/if}

						<div class="chat-turn-body">
							{turn.content}
						</div>
						{#if turn.role === 'assistant'}
							<div class="mt-2 flex flex-wrap gap-x-2 text-[10px] uppercase tracking-wide text-[#B8AA93]" aria-label="Answer source status">
								{#if turn.sourceRefs?.length}
									<span>Source references returned</span>
									{#each turn.sourceRefs as source (source.sourceRef)}
										<span title={source.sourceRef}>{source.label}</span>
									{/each}
								{:else if caseRecordCount > 0}
									<span>Case records available · no sources cited for this answer</span>
								{:else}
									<span>General guidance · no case sources cited</span>
								{/if}
							</div>
						{/if}
					</div>
				{/each}

				{#if isBusy}
					<div class="chat-busy-row">
						<span class="chat-pulse-dot"></span>
						<span class="font-mono text-xs text-[#FFE59A]">Counsel response in progress…</span>
					</div>
				{/if}
			</div>

			<!-- Pending Attachment Bar (before sending) -->
			{#if pendingDataUri}
				<div class="chat-pending-bar">
					<div class="flex items-center gap-2 min-w-0">
						<span class="chat-mime-badge chat-mime-image">ATTACHED</span>
						<span class="text-xs font-bold text-[#FAF4EC] truncate">{pendingFile?.name || 'Screen Frame'}</span>
						<span class="text-xs font-mono text-[#FFE59A]">({pendingMime})</span>
					</div>
					<button
						type="button"
						onclick={() => { pendingFile = null; pendingDataUri = null; pendingMime = ''; }}
						class="text-xs font-mono text-[#F87171] hover:underline"
					>
						Remove ✕
					</button>
				</div>
			{/if}

			<!-- Quick Prompt Presets -->
			<div class="chat-presets-bar">
				<span class="text-[10.5px] font-mono text-[#8C7D6D] uppercase">Presets:</span>
				{#each quickPrompts as prompt}
					<button
						type="button"
						onclick={() => { inputText = prompt; }}
						class="chat-preset-chip"
					>
						{prompt}
					</button>
				{/each}
			</div>

			<!-- Input Composer Area -->
			<form onsubmit={(e) => { e.preventDefault(); void handleSendMessage(); }} class="chat-composer-bar">
				<label class="chat-attach-btn" title="Attach Document, Photo, Video, or Audio">
					<Icon name="upload" size={14} class="text-[#FFE59A]" />
					<span class="sr-only">Attach file</span>
					<input
						type="file"
						onchange={handleFileInput}
						class="hidden"
						accept=".pdf,.png,.jpg,.jpeg,.mp4,.mov,.mp3,.docx,.txt,.md"
					/>
				</label>

				<input
					type="text"
					bind:value={inputText}
					placeholder="Ask AI Counsel about this case, uploaded exhibits, or legal arguments… (Enter to send)"
					class="chat-input-field"
					disabled={isBusy}
				/>

				<button
					type="submit"
					disabled={isBusy || (!inputText.trim() && !pendingDataUri)}
					class="chat-send-btn"
				>
					<span>Send</span>
					<span class="text-[#FFE59A]">↵</span>
				</button>
			</form>
		</main>
	</div>
</div>

<!-- ========================================================= -->
<!-- MULTI-MODAL EVIDENCE VIEWER MODAL (BITS UI DIALOG)        -->
<!-- ========================================================= -->
{#if selectedEvidenceId}
	<EvidenceViewModal
		evidenceId={selectedEvidenceId}
		bind:open={isEvidenceModalOpen}
		onClose={() => { selectedEvidenceId = null; }}
	/>
{/if}

<!-- ========================================================= -->
<!-- LOCAL MEDIA VIEWER MODAL (FOR DIRECT CHAT ATTACHMENTS)    -->
<!-- ========================================================= -->
{#if localViewerOpen && localViewerMedia}
	<div
		class="local-modal-backdrop"
		onclick={(e) => { if (e.target === e.currentTarget) localViewerOpen = false; }}
		role="presentation"
	>
		<div class="local-modal-card" role="dialog" aria-modal="true" aria-label="Media Preview">
			<div class="local-modal-header">
				<div class="flex items-center gap-2">
					<span class="chat-mime-badge chat-mime-image">{localViewerMedia.mimeType}</span>
					<h3 class="text-xs font-mono font-bold text-[#FAF4EC] truncate">{localViewerMedia.name}</h3>
				</div>
				<button
					type="button"
					onclick={() => (localViewerOpen = false)}
					class="text-[#C5BBAA] hover:text-white font-mono text-sm"
				>
					✕
				</button>
			</div>

			<!-- MIME Detector Bar -->
			<div class="px-4 py-2 bg-[#1A1612] border-b border-[#362E25] flex flex-wrap items-center justify-between text-[11px] font-mono text-[#D5C6AC]">
				<span>MIME: <strong class="text-[#FFE59A]">{localViewerMedia.mimeType}</strong></span>
				<span>File Size: <strong class="text-[#A7F3D0]">{localViewerMedia.size}</strong></span>
				<span>Integrity: <strong class="text-[#93C5FD]">Magic-Byte Verified</strong></span>
			</div>

			<!-- Image / Media Viewport -->
			<div class="p-4 flex items-center justify-center bg-black/50 max-h-[65vh] overflow-auto">
				<img src={localViewerMedia.url} alt={localViewerMedia.name} class="max-w-full max-h-[60vh] object-contain rounded" />
			</div>

			<div class="p-3 bg-[#141210] border-t border-[#362E25] flex justify-between items-center text-xs font-mono">
				<span class="text-[#8C7D6D]">Full resolution evidentiary preview</span>
				<button
					type="button"
					onclick={() => (localViewerOpen = false)}
					class="px-3 py-1 bg-[#2C241B] border border-[#FFE59A]/30 text-[#FFE59A] rounded"
				>
					Done
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Royal Architectural Theme */
	.dedicated-chat-shell {
		background: #ECE7DC;
		color: #1E1A17;
		font-family: 'Cinzel', 'Cormorant Garamond', 'Inter', serif;
	}

	.chat-header {
		background: #1C1814;
		border-bottom: 1px solid rgba(212, 175, 55, 0.4);
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
	}

	.chat-back-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		font-family: monospace;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: #FFE59A;
		text-decoration: none;
		font-weight: 700;
	}

	.chat-case-kicker {
		font-size: 10px;
		font-family: monospace;
		text-transform: uppercase;
		letter-spacing: 0.15em;
		color: #C5BBAA;
	}

	.chat-badge-status {
		font-size: 9.5px;
		font-family: monospace;
		text-transform: uppercase;
		padding: 1px 6px;
		border-radius: 9999px;
		background: rgba(167, 243, 208, 0.12);
		border: 1px solid rgba(167, 243, 208, 0.3);
		color: #A7F3D0;
	}

	.chat-case-title {
		font-size: 16px;
		font-weight: 700;
		color: #FAF4EC;
		letter-spacing: -0.01em;
	}

	.chat-tel-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 9.5px;
		font-family: monospace;
		color: #FFE59A;
		background: #2A2117;
		border: 1px solid rgba(212, 175, 55, 0.35);
		padding: 3px 8px;
		border-radius: 4px;
	}

	.chat-pulse-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: #A7F3D0;
		box-shadow: 0 0 6px #A7F3D0;
	}

	.chat-badge-stat {
		font-size: 10px;
		font-family: monospace;
		padding: 3px 8px;
		border-radius: 4px;
		background: #251F19;
		border: 1px solid #3E3224;
		color: #D5C6AC;
	}

	/* Left Rail */
	.chat-rail-card {
		background: #181512;
		border: 1px solid rgba(212, 175, 55, 0.35);
		border-radius: 10px;
		overflow: hidden;
		box-shadow: 0 4px 18px rgba(0, 0, 0, 0.25);
	}

	.chat-rail-dragover {
		border-color: #FFE59A !important;
		background: #251F19 !important;
	}

	.chat-rail-header {
		padding: 12px 14px;
		background: #221D17;
		border-bottom: 1px solid #362E25;
	}

	.chat-rail-tab {
		font-size: 11px;
		font-family: monospace;
		padding: 4px 10px;
		border-radius: 4px;
		background: transparent;
		color: #A39688;
		border: none;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.chat-rail-tab-active {
		background: #2E251C;
		color: #FFE59A;
		border: 1px solid rgba(212, 175, 55, 0.3);
	}

	.chat-dropzone-strip {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: #201A14;
		border-bottom: 1px solid #362E25;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.chat-dropzone-strip:hover {
		background: #2A2117;
	}

	.chat-file-row {
		padding: 8px 10px;
		background: #201B16;
		border: 1px solid #362E25;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.chat-file-row:hover {
		background: #282119;
		border-color: rgba(212, 175, 55, 0.4);
	}

	.chat-mime-badge {
		font-size: 9px;
		font-family: monospace;
		font-weight: 700;
		padding: 1px 5px;
		border-radius: 3px;
	}

	.chat-mime-image { background: #3B2A1E; color: #FFE59A; border: 1px solid #825828; }
	.chat-mime-video { background: #1E2E3B; color: #93C5FD; border: 1px solid #2563EB; }
	.chat-mime-audio { background: #1E3B2E; color: #A7F3D0; border: 1px solid #059669; }
	.chat-mime-pdf { background: #3B1E1E; color: #FCA5A5; border: 1px solid #DC2626; }
	.chat-mime-document { background: #2F2A22; color: #E5C77B; border: 1px solid #78633F; }
	.chat-mime-other { background: #2B2620; color: #D5C6AC; border: 1px solid #4D4133; }

	/* Right Main Chat Card */
	.chat-main-card {
		background: #141210;
		border: 1px solid rgba(212, 175, 55, 0.35);
		border-radius: 10px;
		overflow: hidden;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
	}

	.chat-main-header {
		padding: 11px 16px;
		background: #1F1914;
		border-bottom: 1px solid #362E25;
	}

	.chat-messages-scroll {
		background: #161310;
	}

	.chat-drag-active {
		border: 2px dashed #FFE59A;
		background: #1F1914 !important;
	}

	.chat-turn-wrap {
		padding: 12px 14px;
		border-radius: 8px;
		border: 1px solid;
		max-width: 90%;
	}

	.chat-turn-user {
		margin-left: auto;
		background: #251E17;
		border-color: rgba(212, 175, 55, 0.35);
	}

	.chat-turn-assistant {
		margin-right: auto;
		background: #1C1814;
		border-color: #362E25;
	}

	.chat-turn-head {
		display: flex;
		justify-content: space-between;
		font-family: monospace;
		font-size: 10px;
		color: #A39688;
		margin-bottom: 6px;
	}

	.chat-turn-body {
		font-size: 13px;
		color: #FAF4EC;
		line-height: 1.5;
		white-space: pre-wrap;
	}

	.chat-attachment-card {
		background: #201A14;
		border: 1px solid #3E3224;
		border-radius: 6px;
		overflow: hidden;
		margin-bottom: 8px;
	}

	.chat-mime-pill {
		font-size: 9.5px;
		font-family: monospace;
		background: #141210;
		padding: 1px 6px;
		border-radius: 3px;
		color: #FFE59A;
		border: 1px solid rgba(212, 175, 55, 0.3);
	}

	.chat-thumb-btn {
		position: relative;
		display: block;
		width: 110px;
		height: 75px;
		border-radius: 4px;
		overflow: hidden;
		border: 1px solid #4D3F2E;
		background: #000;
	}

	.chat-thumb-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.chat-thumb-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.65);
		color: #FFE59A;
		font-size: 9.5px;
		font-family: monospace;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.chat-thumb-btn:hover .chat-thumb-overlay {
		opacity: 1;
	}

	.chat-busy-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		background: #201A14;
		border: 1px solid #362E25;
		border-radius: 6px;
	}

	.chat-pending-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 14px;
		background: #241D16;
		border-top: 1px solid #362E25;
	}

	.chat-presets-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		background: #181512;
		border-top: 1px solid #2B231B;
		overflow-x: auto;
	}

	.chat-preset-chip {
		font-size: 10.5px;
		font-family: monospace;
		padding: 3px 8px;
		border-radius: 4px;
		background: #221B15;
		border: 1px solid #3E3224;
		color: #D5C6AC;
		white-space: nowrap;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.chat-preset-chip:hover {
		background: #2D241C;
		color: #FFE59A;
		border-color: rgba(212, 175, 55, 0.4);
	}

	.chat-composer-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		background: #1F1914;
		border-top: 1px solid #362E25;
	}

	.chat-attach-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border-radius: 6px;
		background: #2A2117;
		border: 1px solid rgba(212, 175, 55, 0.35);
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.chat-attach-btn:hover {
		background: #382C1F;
	}

	.chat-input-field {
		flex: 1;
		height: 36px;
		padding: 0 12px;
		background: #141210;
		border: 1px solid #3E3224;
		border-radius: 6px;
		font-family: 'Inter', system-ui, sans-serif;
		font-size: 12.5px;
		color: #FAF4EC;
		outline: none;
		transition: border-color 0.15s ease;
	}

	.chat-input-field:focus {
		border-color: #FFE59A;
	}

	.chat-send-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 36px;
		padding: 0 16px;
		background: #67140F;
		border: 1px solid #941B15;
		border-radius: 6px;
		color: #FAF4EC;
		font-size: 12px;
		font-weight: 700;
		font-family: monospace;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.chat-send-btn:hover:not(:disabled) {
		background: #801C16;
	}

	.chat-send-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Local Preview Modal */
	.local-modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.75);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9999;
		padding: 1rem;
	}

	.local-modal-card {
		width: min(850px, 95vw);
		background: #181512;
		border: 1px solid rgba(212, 175, 55, 0.45);
		border-radius: 10px;
		overflow: hidden;
		box-shadow: 0 18px 48px rgba(0, 0, 0, 0.6);
	}

	.local-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		background: #241D17;
		border-bottom: 1px solid #362E25;
	}
</style>
