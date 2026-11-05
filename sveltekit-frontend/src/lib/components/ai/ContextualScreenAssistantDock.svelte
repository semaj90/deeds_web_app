<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { Tooltip } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		caseId?: string;
		currentRoute?: string;
	}

	let { caseId = '', currentRoute = '/' }: Props = $props();

	interface ScreenReconPayload {
		pathname: string;
		pageTitle: string;
		headings: string[];
		cards: string[];
		activeControls: string[];
		metrics: string[];
		selectedText: string;
		viewport: { width: number; height: number };
	}

	interface AssistantTurn {
		id: string;
		role: 'user' | 'assistant';
		content: string;
		timestamp: string;
		mode?: 'screen' | 'chat';
		previewUrl?: string | null;
		model?: string;
		modality?: string;
		latencyMs?: number;
		confidence?: number;
		keywords?: string[];
		suggestions?: string[];
		sourceRefs?: Array<{ sourceRef: string; label: string }>;
	}

	let isOpen = $state(false);
	let activeTab = $state<'chat' | 'screen'>('chat');
	let isBusy = $state(false);
	let inputText = $state('');
	let errorMessage = $state<string | null>(null);
	let turns = $state<AssistantTurn[]>([]);
	let attachedImageDataUri = $state<string | null>(null);
	let attachedImageLabel = $state<string>('');
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let scrollBodyEl = $state<HTMLDivElement | null>(null);

	let statusState = $state<{
		ok: boolean;
		model: string;
		visionProjectorLoaded: boolean;
		mode: string;
	}>({
		ok: true,
		model: 'ornith-1.5-9b',
		visionProjectorLoaded: false,
		mode: 'ornith-dom-recon'
	});

	async function refreshRuntimeStatus() {
		try {
			const res = await fetch('/api/ai/screen-analysis', { signal: AbortSignal.timeout(4000) });
			if (res.ok) {
				const data = await res.json();
				statusState = {
					ok: Boolean(data.ok),
					model: String(data.model || 'ornith-1.5-9b'),
					visionProjectorLoaded: Boolean(data.visionProjectorLoaded),
					mode: String(data.mode || 'ornith-dom-recon')
				};
			}
		} catch {
			// non-fatal probe
		}
	}

	function captureLiveScreenRecon(): ScreenReconPayload {
		if (!browser) {
			return {
				pathname: currentRoute,
				pageTitle: '',
				headings: [],
				cards: [],
				activeControls: [],
				metrics: [],
				selectedText: '',
				viewport: { width: 1920, height: 1080 }
			};
		}

		const isInsideDock = (el: Element) => Boolean(el.closest('[data-yorha-assistant-dock]'));

		const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
			.filter((el) => !isInsideDock(el) && (el as HTMLElement).offsetParent !== null)
			.map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
			.filter(Boolean)
			.slice(0, 12);

		const cards = Array.from(
			document.querySelectorAll('.dossier-card, .panel, .card, [role="region"], section')
		)
			.filter((el) => !isInsideDock(el) && (el as HTMLElement).offsetParent !== null)
			.map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160))
			.filter((t) => t.length > 8)
			.slice(0, 10);

		const activeControls = Array.from(
			document.querySelectorAll('button, [role="tab"][aria-selected="true"]')
		)
			.filter((el) => !isInsideDock(el) && (el as HTMLElement).offsetParent !== null)
			.map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 48))
			.filter(Boolean)
			.slice(0, 16);

		const metrics = Array.from(
			document.querySelectorAll(
				'.hud-ribbon-item, .crystarium-stat-row, .hud-meta-pill, [data-metric]'
			)
		)
			.filter((el) => !isInsideDock(el) && (el as HTMLElement).offsetParent !== null)
			.map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80))
			.filter(Boolean)
			.slice(0, 12);

		const selectedText = (window.getSelection()?.toString() ?? '').trim().slice(0, 1200);

		return {
			pathname: window.location.pathname + window.location.search,
			pageTitle: document.title || '',
			headings,
			cards,
			activeControls,
			metrics,
			selectedText,
			viewport: {
				width: Math.round(window.innerWidth || 1280),
				height: Math.round(window.innerHeight || 720)
			}
		};
	}

	/**
	 * Synthesizes a clean orthographic HUD preview canvas of the current viewport layout
	 * when browser pixel capture is not invoked, so every screen scan has a visual receipt.
	 */
	function synthesizeViewportHudThumbnail(recon: ScreenReconPayload): string | null {
		if (!browser) return null;
		try {
			const W = 480;
			const H = 270;
			const canvas = document.createElement('canvas');
			canvas.width = W;
			canvas.height = H;
			const ctx = canvas.getContext('2d');
			if (!ctx) return null;

			ctx.fillStyle = '#EAE3DA';
			ctx.fillRect(0, 0, W, H);

			// Left rail
			ctx.fillStyle = '#EFE9E0';
			ctx.fillRect(0, 0, 26, H);
			ctx.strokeStyle = '#B9A699';
			ctx.strokeRect(0, 0, 26, H);

			// Top navbar
			ctx.fillStyle = '#F6F3EF';
			ctx.fillRect(26, 0, W - 26, 22);
			ctx.fillStyle = '#67140F';
			ctx.fillRect(26, 0, W - 26, 2);

			// Command bar
			ctx.fillStyle = '#0B0D13';
			ctx.fillRect(26, 22, W - 26, 42);
			ctx.fillStyle = '#E5C77B';
			ctx.font = 'bold 10px monospace';
			ctx.fillText((recon.headings[0] || recon.pathname).slice(0, 46), 36, 46);

			// Sample visible DOM card bounding boxes
			const scaleX = W / Math.max(recon.viewport.width, 1);
			const scaleY = H / Math.max(recon.viewport.height, 1);
			const boxes = document.querySelectorAll('.dossier-card, .panel, .card, main section');
			let drawn = 0;
			boxes.forEach((el) => {
				if (drawn >= 10 || el.closest('[data-yorha-assistant-dock]')) return;
				const r = el.getBoundingClientRect();
				if (r.width < 40 || r.height < 24 || r.bottom < 0 || r.top > recon.viewport.height) return;
				const bx = Math.max(28, r.left * scaleX);
				const by = Math.max(66, r.top * scaleY);
				const bw = Math.min(W - bx - 6, r.width * scaleX);
				const bh = Math.min(H - by - 6, r.height * scaleY);
				if (bw > 12 && bh > 10) {
					ctx.fillStyle = '#F8F5F0';
					ctx.fillRect(bx, by, bw, bh);
					ctx.strokeStyle = '#C8A24A';
					ctx.lineWidth = 1;
					ctx.strokeRect(bx, by, bw, bh);
					drawn++;
				}
			});

			// Telemetry stamp
			ctx.fillStyle = 'rgba(11, 13, 19, 0.88)';
			ctx.fillRect(32, H - 24, W - 40, 18);
			ctx.fillStyle = '#E5C77B';
			ctx.font = '9px monospace';
			ctx.fillText(
				`ORNITH :8090 RECON · ${recon.viewport.width}x${recon.viewport.height} · ${recon.pathname.slice(0, 32)}`,
				38,
				H - 12
			);

			return canvas.toDataURL('image/jpeg', 0.84);
		} catch {
			return null;
		}
	}

	async function captureBrowserPixelFrame(): Promise<string | null> {
		if (!browser || !navigator.mediaDevices?.getDisplayMedia) {
			errorMessage = 'Screen pixel capture is unavailable in this browser context.';
			return null;
		}
		try {
			const stream = await navigator.mediaDevices.getDisplayMedia({
				video: { frameRate: 1 },
				audio: false
			});
			const track = stream.getVideoTracks()[0];
			const video = document.createElement('video');
			video.srcObject = stream;
			video.muted = true;
			await video.play();

			const maxEdge = 1280;
			const vw = video.videoWidth || 1280;
			const vh = video.videoHeight || 720;
			const ratio = Math.min(1, maxEdge / Math.max(vw, vh));
			const cw = Math.max(1, Math.round(vw * ratio));
			const ch = Math.max(1, Math.round(vh * ratio));

			const canvas = document.createElement('canvas');
			canvas.width = cw;
			canvas.height = ch;
			const ctx = canvas.getContext('2d');
			ctx?.drawImage(video, 0, 0, cw, ch);

			track?.stop();
			stream.getTracks().forEach((t) => t.stop());

			const dataUri = canvas.toDataURL('image/jpeg', 0.82);
			attachedImageDataUri = dataUri;
			attachedImageLabel = `Screen Frame (${cw}×${ch})`;
			return dataUri;
		} catch {
			// User cancelled picker — non-fatal
			return null;
		}
	}

	function handleFileSelected(e: Event) {
		const file = (e.currentTarget as HTMLInputElement)?.files?.[0];
		if (!file || !file.type.startsWith('image/')) return;
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === 'string') {
				attachedImageDataUri = reader.result;
				attachedImageLabel = file.name;
			}
		};
		reader.readAsDataURL(file);
	}

	function scrollToBottom() {
		if (!browser) return;
		requestAnimationFrame(() => {
			if (scrollBodyEl) {
				scrollBodyEl.scrollTop = scrollBodyEl.scrollHeight;
			}
		});
	}

	async function dispatchAssistantTurn(opts: {
		mode: 'screen' | 'chat';
		promptText: string;
		explicitImage?: string | null;
	}) {
		if (isBusy) return;
		errorMessage = null;
		isBusy = true;

		const recon = captureLiveScreenRecon();
		const previewImage =
			opts.explicitImage ??
			attachedImageDataUri ??
			(opts.mode === 'screen' ? synthesizeViewportHudThumbnail(recon) : null);

		const userTurn: AssistantTurn = {
			id: `u_${Date.now()}`,
			role: 'user',
			content: opts.promptText,
			timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
			mode: opts.mode,
			previewUrl: previewImage
		};

		const historyPayload = turns.slice(-8).map((t) => ({
			role: t.role,
			content: t.content
		}));

		turns = [...turns, userTurn];
		attachedImageDataUri = null;
		attachedImageLabel = '';
		scrollToBottom();

		try {
			const res = await fetch('/api/ai/screen-analysis', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					mode: opts.mode,
					message: opts.promptText,
					caseId: caseId || null,
					currentRoute: currentRoute || recon.pathname,
					imageBase64: previewImage,
					uiSnapshot: recon,
					history: historyPayload
				}),
				signal: AbortSignal.timeout(48_000)
			});

			const data = await res.json().catch(() => ({}));
			if (!res.ok || !data.ok) {
				errorMessage = data.error || `Ornith (:8090) request failed (${res.status})`;
				return;
			}

			statusState = {
				ok: true,
				model: String(data.model || statusState.model),
				visionProjectorLoaded: Boolean(data.visionProjectorLoaded),
				mode: String(data.modality || statusState.mode)
			};

			const assistantTurn: AssistantTurn = {
				id: `a_${Date.now()}`,
				role: 'assistant',
				content: String(data.answer || ''),
				timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
				mode: opts.mode,
				model: String(data.model || 'ornith-1.5-9b'),
				modality: String(data.modality || 'ornith-screen-recon'),
				latencyMs: Number(data.latencyMs || 0),
				confidence:
					typeof data.acePacket?.ConfidenceScore === 'number' &&
					Number.isFinite(data.acePacket.ConfidenceScore)
						? data.acePacket.ConfidenceScore
					: undefined,
				keywords: Array.isArray(data.keywords) ? data.keywords : [],
				suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
				sourceRefs: Array.isArray(data.sourceRefs)
					? data.sourceRefs.filter((ref: unknown): ref is { sourceRef: string; label: string } =>
						typeof ref === 'object' && ref !== null &&
						typeof (ref as { sourceRef?: unknown }).sourceRef === 'string' &&
						typeof (ref as { label?: unknown }).label === 'string'
					)
					: []
			};

			turns = [...turns, assistantTurn];
			scrollToBottom();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Network timeout contacting :8090';
		} finally {
			isBusy = false;
		}
	}

	async function triggerScreenScanNow() {
		isOpen = true;
		activeTab = 'screen';
		await dispatchAssistantTurn({
			mode: 'screen',
			promptText:
				'Analyze my current legal workspace screen: summarize active posture, visible telemetry/gaps, and top 3 recommended next actions.'
		});
	}

	function openContextualChat() {
		if (isOpen && activeTab === 'chat') {
			isOpen = false;
			return;
		}
		isOpen = true;
		activeTab = 'chat';
		void refreshRuntimeStatus();
	}

	async function handleSendSubmit(e?: Event) {
		e?.preventDefault();
		const trimmed = inputText.trim();
		if (!trimmed && !attachedImageDataUri) return;
		const prompt =
			trimmed || 'Analyze the attached screen frame and summarize legal findings and next actions.';
		inputText = '';
		await dispatchAssistantTurn({
			mode: activeTab,
			promptText: prompt,
			explicitImage: attachedImageDataUri
		});
	}

	function handleInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void handleSendSubmit();
		}
	}

	async function handlePixelCaptureAndAnalyze() {
		const frame = await captureBrowserPixelFrame();
		if (frame) {
			activeTab = 'screen';
			await dispatchAssistantTurn({
				mode: 'screen',
				promptText:
					'Analyze this captured live window frame and current legal dossier context via Ornith (:8090).',
				explicitImage: frame
			});
		}
	}

	let isSavingEvidence = $state(false);
	let saveFeedbackMessage = $state<string | null>(null);

	async function saveImageToCaseEvidence(dataUri: string, label?: string) {
		if (!caseId) {
			errorMessage = 'No active case linked to this session.';
			return;
		}
		isSavingEvidence = true;
		try {
			const res = await fetch(dataUri);
			const blob = await res.blob();
			const filename = label ? label.replace(/\s+/g, '_') : `chat-recon-${Date.now()}.png`;

			const form = new FormData();
			form.append('file', blob, filename);
			form.append('caseId', caseId);
			form.append('title', `Chat Ingest: ${label || 'Screen Recon'}`);
			form.append('description', 'Evidentiary artifact captured/uploaded in Contextual AI Counsel session.');
			form.append('evidenceType', 'photo');

			const uploadRes = await fetch('/api/evidence/upload', {
				method: 'POST',
				body: form
			});

			if (uploadRes.ok) {
				const payload = await uploadRes.json();
				saveFeedbackMessage = `Exhibit #${payload.evidence?.id?.slice(0, 8) ?? 'SAVED'} committed to PostgreSQL 18!`;
				window.dispatchEvent(new CustomEvent('evidence-updated', { detail: { caseId, evidence: payload.evidence } }));
				setTimeout(() => { saveFeedbackMessage = null; }, 4000);
			} else {
				errorMessage = 'Failed to commit exhibit to PostgreSQL 18';
			}
		} catch (err) {
			errorMessage = 'Error saving exhibit to case';
		} finally {
			isSavingEvidence = false;
		}
	}

	function clearConversation() {
		turns = [];
		errorMessage = null;
		attachedImageDataUri = null;
		attachedImageLabel = '';
	}

	onMount(() => {
		void refreshRuntimeStatus();

		const onOpenChat = () => {
			isOpen = true;
			activeTab = 'chat';
		};
		const onAnalyzeScreen = () => {
			void triggerScreenScanNow();
		};

		window.addEventListener('yorha:open-chat', onOpenChat);
		window.addEventListener('yorha:analyze-screen', onAnalyzeScreen);
		return () => {
			window.removeEventListener('yorha:open-chat', onOpenChat);
			window.removeEventListener('yorha:analyze-screen', onAnalyzeScreen);
		};
	});
</script>

<Tooltip.Provider delayDuration={120}>
	<div class="assistant-dock-root" data-yorha-assistant-dock data-testid="yorha-assistant-dock">
		<input
			bind:this={fileInputEl}
			type="file"
			accept="image/*"
			onchange={handleFileSelected}
			class="hidden"
			aria-hidden="true"
		/>

		{#if isOpen}
			<div
				class="dock-window"
				role="dialog"
				aria-label="Contextual Legal AI and Ornith Screen VLM Assistant"
				data-testid="yorha-assistant-panel"
			>
				<div class="dock-arcana-inner" aria-hidden="true"></div>

				<!-- Pinned Obsidian + Gilded Header -->
				<header class="dock-header">
					<div class="dock-header-gold" aria-hidden="true"></div>
					<div class="flex items-center gap-2 min-w-0">
						<div class="dock-header-emblem">
							<Icon name="yorha-ai-assistant" size={15} />
						</div>
						<div class="min-w-0">
							<div class="flex items-center gap-1.5">
								<span class="dock-header-title">CONTEXTUAL COUNSEL</span>
								<span class="dock-port-chip">:8090</span>
							</div>
							<div class="dock-header-sub truncate">
								<span>{statusState.model}</span>
								<span>·</span>
								<span>{statusState.visionProjectorLoaded ? 'VLM MMPROJ' : 'SCREEN RECON + ACE'}</span>
								{#if caseId}
									<span>· #{caseId.slice(0, 8).toUpperCase()}</span>
								{/if}
							</div>
						</div>
					</div>

					<div class="flex items-center gap-1 shrink-0">
						{#if caseId}
							<a
								href={`/cases/${caseId}/chat`}
								class="dock-icon-btn"
								title="Open Dedicated Full-Page Workspace"
								aria-label="Open Dedicated Workspace"
							>
								<svg viewBox="0 0 16 16" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.6">
									<path d="M6 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3M10 2h4v4M9 7l5-5" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
							</a>
						{/if}
						{#if turns.length > 0}
							<button
								type="button"
								data-unstyled
								onclick={clearConversation}
								class="dock-icon-btn"
								title="Clear conversation"
								aria-label="Clear conversation"
							>
								<svg viewBox="0 0 16 16" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.6">
									<path d="M2.5 8a5.5 5.5 0 1 0 1.4-3.7M2.5 2.5v2.6h2.6" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
							</button>
						{/if}
						<button
							type="button"
							data-unstyled
							onclick={() => (isOpen = false)}
							class="dock-icon-btn"
							title="Minimize assistant"
							aria-label="Close assistant"
						>
							<svg viewBox="0 0 16 16" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.8">
								<path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
							</svg>
						</button>
					</div>
				</header>

				<!-- Mode Segmented Strip + Screen VLM Actions -->
				<div class="dock-action-strip">
					<div class="flex items-center gap-1">
						<button
							type="button"
							data-unstyled
							onclick={() => (activeTab = 'chat')}
							class={['dock-mode-pill', activeTab === 'chat' && 'dock-mode-pill-active']}
						>
							<Icon name="yorha-ai-assistant" size={12} />
							<span>Context Chat</span>
						</button>
						<button
							type="button"
							data-unstyled
							onclick={() => (activeTab = 'screen')}
							class={['dock-mode-pill', activeTab === 'screen' && 'dock-mode-pill-active']}
						>
							<Icon name="yorha-network" size={12} />
							<span>Screen VLM</span>
						</button>
					</div>

					<div class="flex items-center gap-1">
						<button
							type="button"
							data-unstyled
							disabled={isBusy}
							onclick={() => void triggerScreenScanNow()}
							class="dock-vlm-trigger"
							title="Capture current screen state and analyze via Ornith (:8090)"
						>
							<svg viewBox="0 0 16 16" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="1.6">
								<path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3" stroke-linecap="round" />
								<circle cx="8" cy="8" r="2.2" />
							</svg>
							<span>Scan Screen</span>
						</button>
						<button
							type="button"
							data-unstyled
							disabled={isBusy}
							onclick={() => void handlePixelCaptureAndAnalyze()}
							class="dock-sub-btn"
							title="Capture live window/screen pixel frame (getDisplayMedia)"
							aria-label="Capture live screen pixels"
						>
							<svg viewBox="0 0 16 16" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="1.5">
								<rect x="2" y="3" width="12" height="8.5" rx="1.2" />
								<path d="M5.5 14h5M8 11.5V14" stroke-linecap="round" />
							</svg>
						</button>
						<button
							type="button"
							data-unstyled
							disabled={isBusy}
							onclick={() => fileInputEl?.click()}
							class="dock-sub-btn"
							title="Attach screenshot or exhibit image"
							aria-label="Attach screenshot or exhibit image"
						>
							<Icon name="yorha-evidence" size={12} />
						</button>
					</div>
				</div>

				<!-- Scrollable Parchment Body -->
				<div class="dock-body" bind:this={scrollBodyEl}>
					{#if turns.length === 0 && !isBusy}
						<div class="dock-empty-state">
							<div class="dock-empty-medallion">
								<Icon name={activeTab === 'screen' ? 'yorha-network' : 'yorha-ai-assistant'} size={22} />
							</div>
							<p class="dock-empty-title">
								{activeTab === 'screen'
									? 'ORNITH :8090 SCREEN VLM & DOM RECON'
									: 'CONTEXTUAL LEGAL AI COUNSEL'}
							</p>
							<p class="dock-empty-desc">
								{statusState.ok ? `Connected to ${statusState.model} (:8090).` : 'Assistant connection status is not verified.'}
								 Case records or screen context are not evidence-grounded unless a response includes retrieved source references.
							</p>

							<div class="dock-quick-grid">
								<button
									type="button"
									data-unstyled
									onclick={() => void triggerScreenScanNow()}
									class="dock-quick-card"
								>
									<span class="dock-quick-kicker">✦ VLM :8090</span>
									<span class="dock-quick-label">Analyze what is on my screen right now</span>
								</button>
								<button
									type="button"
									data-unstyled
									onclick={() =>
										void dispatchAssistantTurn({
											mode: 'chat',
											promptText:
												'Audit this case posture: what exhibits, statutory citations, or brief sections are missing right now?'
										})}
									class="dock-quick-card"
								>
									<span class="dock-quick-kicker">✦ DOSSIER AUDIT</span>
									<span class="dock-quick-label">Identify missing exhibits &amp; statutory links</span>
								</button>
								<button
									type="button"
									data-unstyled
									onclick={() =>
										void dispatchAssistantTurn({
											mode: 'chat',
											promptText:
												'Draft a concise 3-point prosecutorial intake & evidentiary review checklist for this route.'
										})}
									class="dock-quick-card"
								>
									<span class="dock-quick-kicker">✦ BRIEFING</span>
									<span class="dock-quick-label">Generate a 3-point evidentiary intake checklist</span>
								</button>
							</div>
						</div>
					{/if}

					{#each turns as turn (turn.id)}
						<article class={['dock-turn', turn.role === 'user' ? 'dock-turn-user' : 'dock-turn-assistant']}>
							<div class="dock-turn-meta">
								<span>{turn.role === 'user' ? 'COUNSEL' : `ORNITH · ${turn.modality?.toUpperCase() ?? ':8090'}`}</span>
								<span>{turn.timestamp}</span>
							</div>

							{#if turn.previewUrl}
								<div class="dock-preview-frame">
									<img src={turn.previewUrl} alt="Captured workspace screen preview" class="dock-preview-img" />
									<div class="p-1.5 flex items-center justify-between gap-1 bg-[#1A1612] border-t border-[#362E25]">
										<span class="text-[9.5px] font-mono text-[#A39688]">Screen Artifact</span>
										<button
											type="button"
											onclick={() => void saveImageToCaseEvidence(turn.previewUrl!, 'Captured Screen Frame')}
											disabled={isSavingEvidence}
											class="text-[9.5px] font-mono px-2 py-0.5 rounded bg-[#2C241B] border border-[#FFE59A]/30 text-[#FFE59A] hover:bg-[#FFE59A] hover:text-[#141210] transition-colors"
										>
											{isSavingEvidence ? 'Saving…' : '✦ Save to Case Evidence'}
										</button>
									</div>
								</div>
							{/if}

							<div class="dock-turn-text">{turn.content}</div>

							{#if turn.role === 'assistant'}
								<div class="dock-turn-footer">
									<span>{turn.model ?? 'ornith-1.5-9b'}</span>
					<span>{turn.sourceRefs?.length
						? `Source references returned (${turn.sourceRefs.length})`
						: caseId && turn.mode === 'chat'
							? 'Case context supplied · no source citations returned'
							: 'General guidance · no case sources cited'}</span>
					{#each turn.sourceRefs ?? [] as source (source.sourceRef)}
						<span title={source.sourceRef}>{source.label}</span>
					{/each}
									{#if turn.confidence}
										<span>ACE {(turn.confidence * 100).toFixed(0)}%</span>
									{/if}
									{#if turn.latencyMs}
										<span>{turn.latencyMs}ms</span>
									{/if}
								</div>

								{#if turn.suggestions && turn.suggestions.length > 0}
									<div class="flex flex-wrap gap-1 mt-2">
										{#each turn.suggestions as suggestion (suggestion)}
											<button
												type="button"
												data-unstyled
												disabled={isBusy}
												onclick={() =>
													void dispatchAssistantTurn({
														mode: activeTab,
														promptText: suggestion
													})}
												class="dock-suggest-chip"
											>
												{suggestion}
											</button>
										{/each}
									</div>
								{/if}
							{/if}
						</article>
					{/each}

					{#if isBusy}
						<div class="dock-thinking-row" role="status">
							<span class="dock-pulse-dot"></span>
							<span>Synthesizing via {statusState.model} on :8090…</span>
						</div>
					{/if}

					{#if errorMessage}
						<div class="dock-error-banner" role="alert">
							<Icon name="yorha-warning" size={13} />
							<span>{errorMessage}</span>
						</div>
					{/if}
				</div>

				{#if saveFeedbackMessage}
					<div class="px-3 py-1.5 bg-[#184A3C] border-t border-[#20604E] text-[#A7F3D0] text-[10.5px] font-mono flex items-center justify-between">
						<span>✓ {saveFeedbackMessage}</span>
					</div>
				{/if}
				{#if attachedImageDataUri}
					<div class="dock-attachment-bar">
						<span class="truncate">✦ Attached: {attachedImageLabel || 'Screen Frame'}</span>
						<button
							type="button"
							data-unstyled
							onclick={() => {
								attachedImageDataUri = null;
								attachedImageLabel = '';
							}}
							class="text-[#67140F] font-bold text-[10px]"
						>
							Remove ✕
						</button>
					</div>
				{/if}

				<!-- Pinned Input Footer -->
				<form onsubmit={handleSendSubmit} class="dock-footer">
					<textarea
						rows={1}
						data-unstyled
						value={inputText}
						oninput={(e) => (inputText = (e.currentTarget as HTMLTextAreaElement).value)}
						onkeydown={handleInputKeydown}
						placeholder={activeTab === 'screen'
							? 'Ask Ornith about what is visible on screen…'
							: 'Ask contextual legal counsel (Enter to send)…'}
						class="dock-input"
					></textarea>
					<button
						type="submit"
						data-unstyled
						disabled={isBusy || (!inputText.trim() && !attachedImageDataUri)}
						class="dock-send-btn"
						aria-label="Send message to Ornith (:8090)"
					>
						<span>Send</span>
					</button>
				</form>
			</div>
		{/if}

		<!-- Two Cohesive Gilded HUD Medallion Buttons (Screen VLM + Contextual Chat) -->
		<div class="dock-orb-stack">
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							data-unstyled
							onclick={() => void triggerScreenScanNow()}
							class={['dock-orb-vlm', isOpen && activeTab === 'screen' && 'dock-orb-active']}
							data-testid="yorha-screen-vlm-btn"
							aria-label="Analyze current screen with Ornith VLM (:8090)"
						>
							<span class="dock-orb-star" aria-hidden="true">✦</span>
							<svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
								<path d="M3 6.5V3h3.5M13.5 3H17v3.5M17 13.5V17h-3.5M6.5 17H3v-3.5" stroke-linecap="round" stroke-linejoin="round" />
								<circle cx="10" cy="10" r="2.7" />
							</svg>
						</button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Portal>
					<Tooltip.Content side="left" sideOffset={10} class="dock-tooltip">
						Analyze Screen · Ornith VLM (:8090)
					</Tooltip.Content>
				</Tooltip.Portal>
			</Tooltip.Root>

			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							data-unstyled
							onclick={openContextualChat}
							class={['dock-orb-chat', isOpen && activeTab === 'chat' && 'dock-orb-chat-open']}
							data-testid="yorha-contextual-chat-btn"
							aria-label="Open Contextual Legal AI Counsel (:8090)"
						>
							<Icon name="yorha-ai-assistant" size={20} />
							<span
								class={['dock-status-pip', statusState.ok ? 'dock-status-online' : 'dock-status-standby']}
								aria-hidden="true"
							></span>
						</button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Portal>
					<Tooltip.Content side="left" sideOffset={10} class="dock-tooltip">
						Contextual AI Counsel · {statusState.model} (:8090)
					</Tooltip.Content>
				</Tooltip.Portal>
			</Tooltip.Root>
		</div>
	</div>
</Tooltip.Provider>

<style>
	.assistant-dock-root {
		position: fixed;
		right: 1.15rem;
		bottom: 1.15rem;
		z-index: 9100;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.65rem;
		pointer-events: none;
	}

	.dock-orb-stack {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.55rem;
		pointer-events: auto;
	}

	/* Button 1 (Upper): Screen VLM & DOM Recon Medallion */
	.dock-orb-vlm {
		position: relative;
		width: 40px;
		height: 40px;
		border-radius: 10px;
		background: linear-gradient(160deg, #161A26 0%, #0B0D13 100%);
		border: 1px solid #C8A24A;
		color: #E5C77B;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		box-shadow:
			0 8px 20px -4px rgba(11, 13, 19, 0.55),
			inset 0 0 0 1px rgba(229, 199, 123, 0.2);
		transition: all 0.16s ease;
	}
	.dock-orb-vlm:hover,
	.dock-orb-active {
		background: linear-gradient(160deg, #67140F 0%, #3E0B08 100%);
		border-color: #F0D78C;
		color: #FFF3C4;
		transform: translateY(-1px);
	}

	.dock-orb-star {
		position: absolute;
		top: 2px;
		right: 3px;
		font-size: 7px;
		line-height: 1;
		color: #E5C77B;
	}

	/* Button 2 (Lower Primary): Contextual Legal AI Counsel Medallion */
	.dock-orb-chat {
		position: relative;
		width: 48px;
		height: 48px;
		border-radius: 9999px;
		background: linear-gradient(160deg, #7B1913 0%, #520E0A 100%);
		border: 1.5px solid #E5C77B;
		color: #F6F3EF;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		box-shadow:
			0 10px 26px -4px rgba(20, 14, 12, 0.6),
			0 0 0 2px rgba(11, 13, 19, 0.88),
			inset 0 1px 0 rgba(255, 240, 190, 0.35);
		transition: all 0.16s ease;
	}
	.dock-orb-chat:hover,
	.dock-orb-chat-open {
		background: linear-gradient(160deg, #8E1E17 0%, #67140F 100%);
		border-color: #FFF0BE;
		transform: translateY(-1px) scale(1.03);
	}

	.dock-status-pip {
		position: absolute;
		bottom: 1px;
		right: 1px;
		width: 10px;
		height: 10px;
		border-radius: 9999px;
		border: 2px solid #0B0D13;
	}
	.dock-status-online {
		background: #22C55E;
	}
	.dock-status-standby {
		background: #EAB308;
	}

	/* Slide-Up Custom Modal Light (Parchment Legal Dossier) Window */
	.dock-window {
		pointer-events: auto;
		position: relative;
		width: min(27rem, calc(100vw - 2rem));
		height: min(35rem, calc(100vh - 8.2rem));
		display: flex;
		flex-direction: column;
		background: #FAF8F5;
		border: 1px solid #B9A699;
		border-radius: 10px;
		overflow: hidden;
		box-shadow:
			0 24px 54px -12px rgba(11, 13, 19, 0.52),
			0 0 0 1px rgba(200, 162, 74, 0.32);
		color: #141312;
	}

	.dock-arcana-inner {
		position: absolute;
		inset: 3px;
		border: 1px solid rgba(200, 162, 74, 0.22);
		border-radius: 7px;
		pointer-events: none;
		z-index: 2;
	}

	.dock-header {
		position: relative;
		flex-shrink: 0;
		padding: 0.65rem 0.85rem;
		background: linear-gradient(180deg, #131621 0%, #0B0D13 100%);
		border-bottom: 1px solid #C8A24A;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		z-index: 3;
	}

	.dock-header-gold {
		position: absolute;
		inset: 0 0 auto 0;
		height: 2px;
		background: linear-gradient(90deg, #67140F, #E5C77B, #67140F);
	}

	.dock-header-emblem {
		width: 28px;
		height: 28px;
		border-radius: 6px;
		background: #67140F;
		border: 1px solid #E5C77B;
		color: #E5C77B;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.dock-header-title {
		font-family: ui-sans-serif, system-ui, 'Inter', sans-serif;
		font-size: 0.74rem;
		font-weight: 700;
		letter-spacing: 0.09em;
		color: #F6F3EF;
	}

	.dock-port-chip {
		padding: 1px 5px;
		border-radius: 3px;
		background: rgba(200, 162, 74, 0.18);
		border: 1px solid rgba(229, 199, 123, 0.45);
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.56rem;
		font-weight: 700;
		color: #E5C77B;
	}

	.dock-header-sub {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.58rem;
		letter-spacing: 0.05em;
		color: #B9A699;
		margin-top: 1px;
	}

	.dock-icon-btn {
		width: 25px;
		height: 25px;
		border-radius: 5px;
		border: 1px solid rgba(219, 207, 197, 0.18);
		background: rgba(255, 255, 255, 0.04);
		color: #DBCFC5;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.dock-icon-btn:hover {
		border-color: #E5C77B;
		color: #FFF0BE;
	}

	/* Action Strip */
	.dock-action-strip {
		flex-shrink: 0;
		padding: 0.42rem 0.7rem;
		background: #ECE5DC;
		border-bottom: 1px solid #D3C6B8;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
		z-index: 3;
	}

	.dock-mode-pill {
		height: 25px;
		padding: 0 0.55rem;
		border-radius: 5px;
		border: 1px solid transparent;
		background: transparent;
		color: #5A5248;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		cursor: pointer;
	}
	.dock-mode-pill-active {
		background: #0B0D13;
		border-color: #C8A24A;
		color: #E5C77B;
	}

	.dock-vlm-trigger {
		height: 25px;
		padding: 0 0.55rem;
		border-radius: 5px;
		background: #67140F;
		border: 1px solid #C8A24A;
		color: #F6F3EF;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.58rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		display: inline-flex;
		align-items: center;
		gap: 0.28rem;
		cursor: pointer;
	}
	.dock-vlm-trigger:hover:not(:disabled) {
		background: #7F1912;
	}

	.dock-sub-btn {
		width: 25px;
		height: 25px;
		border-radius: 5px;
		background: #FAF8F5;
		border: 1px solid #B9A699;
		color: #4A4239;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.dock-sub-btn:hover:not(:disabled) {
		border-color: #67140F;
		color: #67140F;
	}

	/* Scrollable Body */
	.dock-body {
		flex: 1 1 auto;
		overflow-y: auto;
		padding: 0.75rem 0.8rem;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		z-index: 3;
	}

	.dock-empty-state {
		margin: auto 0;
		text-align: center;
		padding: 0.35rem 0.25rem;
	}

	.dock-empty-medallion {
		width: 42px;
		height: 42px;
		margin: 0 auto 0.5rem;
		border-radius: 9999px;
		background: #0B0D13;
		border: 1.5px solid #C8A24A;
		color: #E5C77B;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.dock-empty-title {
		margin: 0;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: #67140F;
	}

	.dock-empty-desc {
		margin: 0.3rem auto 0.75rem;
		font-size: 0.74rem;
		line-height: 1.45;
		color: #4A4239;
		max-width: 21rem;
	}

	.dock-quick-grid {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		text-align: left;
	}

	.dock-quick-card {
		width: 100%;
		padding: 0.5rem 0.65rem;
		border-radius: 6px;
		background: #F3EEE7;
		border: 1px solid #D3C6B8;
		display: flex;
		flex-direction: column;
		gap: 0.12rem;
		cursor: pointer;
		transition: all 0.14s ease;
	}
	.dock-quick-card:hover {
		background: #FFFFFF;
		border-color: #C8A24A;
	}

	.dock-quick-kicker {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.55rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: #8C6A23;
	}

	.dock-quick-label {
		font-size: 0.74rem;
		font-weight: 600;
		color: #1E293B;
	}

	/* Message Turns */
	.dock-turn {
		padding: 0.55rem 0.7rem;
		border-radius: 7px;
		border: 1px solid #D8CDB8;
		font-size: 0.8rem;
		line-height: 1.5;
	}

	.dock-turn-user {
		margin-left: 1.5rem;
		background: #EFE9DF;
		border-color: #C5B6A8;
		color: #141312;
	}

	.dock-turn-assistant {
		margin-right: 0.5rem;
		background: #FFFFFF;
		border-color: #C8A24A;
		color: #1E293B;
		box-shadow: 0 2px 8px rgba(20, 17, 14, 0.05);
	}

	.dock-turn-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.55rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: #7F7565;
		margin-bottom: 0.3rem;
	}

	.dock-preview-frame {
		margin-bottom: 0.45rem;
		border-radius: 5px;
		overflow: hidden;
		border: 1px solid #C8A24A;
	}

	.dock-preview-img {
		display: block;
		width: 100%;
		max-height: 128px;
		object-fit: cover;
	}

	.dock-turn-text {
		white-space: pre-wrap;
		word-break: break-word;
	}

	.dock-turn-footer {
		margin-top: 0.45rem;
		padding-top: 0.32rem;
		border-top: 1px dashed #E2D9CC;
		display: flex;
		align-items: center;
		gap: 0.55rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.55rem;
		color: #8C6A23;
	}

	.dock-suggest-chip {
		padding: 2px 7px;
		border-radius: 9999px;
		background: #F6F3EF;
		border: 1px solid #C5B6A8;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.58rem;
		color: #67140F;
		cursor: pointer;
	}
	.dock-suggest-chip:hover:not(:disabled) {
		border-color: #C8A24A;
		background: #FFFDF9;
	}

	.dock-thinking-row {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.45rem 0.65rem;
		border-radius: 6px;
		background: #0B0D13;
		border: 1px solid #C8A24A;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.64rem;
		color: #E5C77B;
	}

	.dock-pulse-dot {
		width: 7px;
		height: 7px;
		border-radius: 9999px;
		background: #E5C77B;
		animation: dockPulse 1.1s ease-in-out infinite;
	}

	@keyframes dockPulse {
		0%, 100% { opacity: 0.35; }
		50% { opacity: 1; }
	}

	.dock-error-banner {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.65rem;
		border-radius: 6px;
		background: #FDF4F2;
		border: 1px solid rgba(103, 20, 15, 0.45);
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.64rem;
		color: #67140F;
	}

	.dock-attachment-bar {
		flex-shrink: 0;
		padding: 0.3rem 0.75rem;
		background: #F3EEE7;
		border-top: 1px solid #D3C6B8;
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.6rem;
		color: #4A4239;
		z-index: 3;
	}

	/* Pinned Footer */
	.dock-footer {
		flex-shrink: 0;
		padding: 0.55rem 0.7rem;
		background: #ECE5DC;
		border-top: 1px solid #B9A699;
		display: flex;
		align-items: center;
		gap: 0.45rem;
		z-index: 3;
	}

	.dock-input {
		flex: 1;
		min-width: 0;
		height: 34px;
		max-height: 76px;
		padding: 0.42rem 0.65rem;
		border-radius: 6px;
		border: 1px solid #B9A699;
		background: #FFFFFF;
		box-shadow: none;
		backdrop-filter: none;
		font-family: ui-sans-serif, system-ui, 'Inter', sans-serif;
		font-size: 0.76rem;
		color: #141312;
		resize: none;
		outline: none;
	}
	.dock-input:focus {
		border-color: #C8A24A;
		box-shadow: 0 0 0 2px rgba(200, 162, 74, 0.2);
	}

	.dock-send-btn {
		height: 34px;
		padding: 0 0.85rem;
		border-radius: 6px;
		background: linear-gradient(180deg, #7B1913 0%, #58100C 100%);
		border: 1px solid #C8A24A;
		color: #F6F3EF;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
		flex-shrink: 0;
	}
	.dock-send-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	:global(.dock-tooltip) {
		z-index: 9999;
		padding: 0.3rem 0.55rem;
		border-radius: 4px;
		background: #0B0D13;
		border: 1px solid #C8A24A;
		color: #F6F3EF;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.62rem;
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
	}
</style>
