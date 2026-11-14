<script lang="ts">
	import { Dialog } from 'bits-ui';
	import '$lib/styles/evidence-document-modal.css';
	import Icon from '$lib/components/ui/Icon.svelte';
	import TagInput from '$lib/components/ui/TagInput.svelte';
	import DoclingExtractionViewer from './DoclingExtractionViewer.svelte';
	import Evidence3DModal from './Evidence3DModal.svelte';
	import EvidenceSpzViewer from './EvidenceSpzViewer.svelte';
	import EvidenceTranscriptPanel from './EvidenceTranscriptPanel.svelte';
	import { formatFileSize, formatDate, getIcon, getTypeLabel } from './evidence-utils.js';
	import {
		audioFormatTip,
		buildEvidenceMarkupDocumentV1,
		buildEvidenceMarkupNoteV1,
		type EvidenceMarkupItemV1,
		type EvidenceMarkupPointV1,
		type EvidenceMarkupShapeKindV1
	} from './evidence-markup-v1';
import {
	analyzeStoredEvidenceImage,
	loadCanonicalStoredEvidenceImageAnalysis,
	requestEvidenceUpscale,
	type StoredEvidenceImageAnalysis
} from './evidence-image-tools';

	let {
		evidenceId,
		caseId = null,
		chatMessages = [],
		chatStatus = 'idle',
		onAskAssistant,
		assistantInitiallyExpanded = false,
		open = $bindable(false),
		initialView = 'original',
		initialTimestampMs = undefined,
		onClose = () => {},
		onEdit,
		onAnalyze
	}: {
		evidenceId: string | null;
		caseId?: string | null;
		chatMessages?: import('$lib/models/ChatSession.svelte.js').ChatMessage[];
		chatStatus?: string;
		onAskAssistant?: (prompt: string) => void | Promise<void>;
		assistantInitiallyExpanded?: boolean;
		open?: boolean;
		initialView?: 'original' | 'relief';
		initialTimestampMs?: number;
		onClose?: () => void;
		onEdit?: (id: string) => void;
		onAnalyze?: (doc: any) => void;
	} = $props();

	let doc = $state<any>(null);
	let showRelief = $state(false);
	let isLoading = $state(false);
	let loadError = $state<string | null>(null);
	let showTranscript = $state(false);
	let revisionHistory = $state<Array<{ id: string; version: number; createdAt: string | Date; changeReason: string | null; metadata: unknown }>>([]);

	$effect(() => {
		if (open && evidenceId) {
			showRelief = initialView === 'relief';
			loadDoc(evidenceId);
		} else if (!open) {
			showRelief = false;
			// reset after close animation
			setTimeout(() => {
				doc = null;
				loadError = null;
				if (enhancedPreviewUrl) URL.revokeObjectURL(enhancedPreviewUrl);
				enhancedPreviewUrl = null;
				if (capturedFrameUrl) URL.revokeObjectURL(capturedFrameUrl);
				capturedFrameUrl = null;
			}, 200);
		}
	});

	$effect(() => {
		if (open && videoElement && mediaState === 'ready' && typeof initialTimestampMs === 'number' && Number.isFinite(initialTimestampMs)) {
			const targetSec = initialTimestampMs / 1000;
			if (Math.abs(videoElement.currentTime - targetSec) > 0.25) {
				videoElement.currentTime = targetSec;
				reviewMediaTimestampMs = initialTimestampMs;
			}
		}
	});

	$effect(() => {
		if (open && videoFrameAnalysis.length > 0 && typeof initialTimestampMs === 'number') {
			const targetSec = initialTimestampMs / 1000;
			const matchingFrame = videoFrameAnalysis.find((f) => Math.abs(f.timestamp - targetSec) < 0.6);
			if (matchingFrame && selectedAnalysisFrame?.id !== matchingFrame.id) {
				selectedAnalysisFrame = matchingFrame;
			}
		}
	});

	function applyRemoteCanvasCommand(cmd: {
		command: string;
		x?: number;
		y?: number;
		width?: number;
		height?: number;
		x1?: number;
		y1?: number;
		x2?: number;
		y2?: number;
		label?: string;
		text?: string;
		timestampMs?: number;
		dhashHex?: string;
	}) {
		const index = markupItems.length + 1;
		if (cmd.command === 'evidence.clear_markup') {
			clearAllMarkup();
			return;
		}
		if (cmd.command === 'video.seek_keyframe' && typeof cmd.timestampMs === 'number') {
			reviewMediaTimestampMs = cmd.timestampMs;
			if (videoElement && Number.isFinite(cmd.timestampMs)) {
				videoElement.currentTime = cmd.timestampMs / 1000;
			}
			markupMessage = cmd.dhashHex
				? `Seeked to keyframe ${formatVideoTime(cmd.timestampMs / 1000)} (dHash ${cmd.dhashHex}).`
				: `Seeked to keyframe ${formatVideoTime(cmd.timestampMs / 1000)}.`;
			return;
		}
		if (cmd.command === 'evidence.add_pin' && typeof cmd.x === 'number' && typeof cmd.y === 'number') {
			markupMode = true;
			const nextItems: EvidenceMarkupItemV1[] = [
				...markupItems,
				{
					id: `pin-${index}`,
					kind: 'pin',
					x: cmd.x,
					y: cmd.y,
					label: cmd.label?.trim() || `Point ${markupPoints.length + 1}`
				}
			];
			markupItems = nextItems;
			syncMarkupPins(nextItems);
			return;
		}
		if (
			cmd.command === 'evidence.add_rect' &&
			typeof cmd.x === 'number' &&
			typeof cmd.y === 'number' &&
			typeof cmd.width === 'number' &&
			typeof cmd.height === 'number'
		) {
			markupMode = true;
			markupItems = [
				...markupItems,
				{
					id: `rect-${index}`,
					kind: 'rectangle',
					x: cmd.x,
					y: cmd.y,
					width: cmd.width,
					height: cmd.height,
					...(cmd.label?.trim() ? { label: cmd.label.trim() } : {}),
					color: '#f4d36c'
				}
			];
			return;
		}
		if (
			cmd.command === 'evidence.add_arrow' &&
			typeof cmd.x1 === 'number' &&
			typeof cmd.y1 === 'number' &&
			typeof cmd.x2 === 'number' &&
			typeof cmd.y2 === 'number'
		) {
			markupMode = true;
			markupItems = [
				...markupItems,
				{
					id: `arrow-${index}`,
					kind: 'arrow',
					x1: cmd.x1,
					y1: cmd.y1,
					x2: cmd.x2,
					y2: cmd.y2,
					...(cmd.label?.trim() ? { label: cmd.label.trim() } : {}),
					color: '#f4d36c'
				}
			];
			return;
		}
		if (cmd.command === 'evidence.add_text' && typeof cmd.x === 'number' && typeof cmd.y === 'number' && cmd.text) {
			markupMode = true;
			markupItems = [
				...markupItems,
				{
					id: `text-${index}`,
					kind: 'text',
					x: cmd.x,
					y: cmd.y,
					text: cmd.text,
					color: '#f4d36c'
				}
			];
		}
	}

	$effect(() => {
		if (!open || !evidenceId || typeof EventSource === 'undefined') return;
		const source = new EventSource(`/api/evidence/${encodeURIComponent(evidenceId)}/canvas-stream?stream=1`);
		const handleCommand = (event: MessageEvent<string>) => {
			try {
				const envelope = JSON.parse(event.data) as { command?: Parameters<typeof applyRemoteCanvasCommand>[0] };
				if (envelope?.command) {
					applyRemoteCanvasCommand(envelope.command);
				}
			} catch {
				// Ignore malformed SSE command payloads.
			}
		};
		source.addEventListener('canvas-command', handleCommand as EventListener);
		return () => {
			source.removeEventListener('canvas-command', handleCommand as EventListener);
			source.close();
		};
	});

	async function loadDoc(id: string) {
		isLoading = true;
		showTranscript = false;
		loadError = null;
		markupPoints = [];
		markupItems = [];
		pendingShapeStart = null;
		markupTool = 'pin';
		markupMessage = null;
		mediaState = 'idle';
		reviewerNote = '';
		imageAnalysis = null;
		imageAnalysisError = null;
		imageAnalysisLoading = false;
		imageNaturalSize = { width: 0, height: 0 };
		if (enhancedPreviewUrl) URL.revokeObjectURL(enhancedPreviewUrl);
		enhancedPreviewUrl = null;
		enhancedDimensions = null;
		showEnhancedPreview = false;
		if (capturedFrameUrl) URL.revokeObjectURL(capturedFrameUrl);
		capturedFrameUrl = null;
		videoFrameTimestampMs = null;
		reviewMediaTimestampMs = null;
		try {
			const res = await fetch(`/api/evidence/${id}`);
			if (!res.ok) throw new Error(`${res.status}`);
			doc = await res.json();
			await loadRevisionHistory(id);
			const mime = doc?.fileType ?? doc?.file_type ?? '';
			const name = doc?.fileName ?? doc?.file_name ?? '';
			if (mime.startsWith('image/')) {
				await loadSavedImageAnalysis(id, doc?.hash);
			} else if (mime.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.webm')) {
				await loadVideoFrames(id);
			}
		} catch (e) {
			loadError = 'Failed to load evidence.';
		} finally {
			isLoading = false;
		}
	}

	async function loadSavedImageAnalysis(id: string, sourceHash: unknown) {
		try {
			const result = await loadCanonicalStoredEvidenceImageAnalysis(id);
			if (evidenceId !== id) return;
			if (result.status === 'CURRENT' && result.analysis) {
				const expected = String(sourceHash ?? '').replace(/^sha256:/i, '').toLowerCase();
				const actual = result.analysis.sourceRevision.replace(/^sha256:/i, '').toLowerCase();
				if (expected && actual && expected !== actual) {
					imageAnalysisError = 'Saved analysis belongs to a different evidence revision.';
					return;
				}
				imageAnalysis = result.analysis;
				return;
			}
			imageAnalysisError = result.message;
		} catch (error) {
			imageAnalysisError = error instanceof Error ? error.message : 'Could not load saved image analysis.';
		}
	}

	async function loadVideoFrames(id: string) {
		try {
			const res = await fetch(`/api/evidence/${encodeURIComponent(id)}/frames`);
			if (!res.ok) return;
			const data = await res.json();
			if (evidenceId !== id || !Array.isArray(data?.frames) || data.frames.length === 0) return;
			if (!doc?.frameAnalysis || doc.frameAnalysis.length === 0) {
				doc = { ...doc, frameAnalysis: data.frames };
			}
		} catch {
			// Frames are progressive enhancement; keep viewer responsive
		}
	}

	async function loadRevisionHistory(id: string) {
		revisionHistory = [];
		try {
			const response = await fetch(`/api/evidence/${encodeURIComponent(id)}/versions?limit=20`, { cache: 'no-store' });
			if (!response.ok) return;
			const payload = await response.json();
			if (evidenceId !== id || !Array.isArray(payload?.versions)) return;
			revisionHistory = payload.versions;
		} catch {
			// Revision history is supplementary; keep the source viewer available if it fails.
		}
	}

	function close() {
		showTranscript = false;
		open = false;
		onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && showTranscript) {
			showTranscript = false;
			return;
		}
		if (e.key === 'Escape') close();
	}

	// Derived helpers
	let fileType = $derived(doc?.fileType ?? doc?.file_type ?? doc?.mimeType ?? doc?.mime_type ?? '');
	let fileName = $derived(doc?.fileName ?? doc?.file_name ?? '');
	let isImage = $derived(fileType.startsWith('image/'));
	let isSpzEvidence = $derived.by(() => {
		const mime = fileType.split(';', 1)[0].trim().toLowerCase();
		return fileName.toLowerCase().endsWith('.spz') && (!mime || ['model/x-spz', 'application/vnd.spz', 'application/octet-stream'].includes(mime));
	});
	let isPdf = $derived(fileType.includes('pdf'));
	let isAudio = $derived(fileType.startsWith('audio/'));
	let isVideo = $derived(fileType.startsWith('video/'));
	let isScene = $derived(isSpzEvidence || fileType.includes('scene') || fileName.endsWith('.spz') || fileName.endsWith('.ply'));
	let isText = $derived(fileType === 'text/plain' || fileType === 'text/csv' || fileName.endsWith('.txt') || fileName.endsWith('.csv'));
	let isMarkdown = $derived(fileType === 'text/markdown' || fileName.endsWith('.md'));
	let videoFrameAnalysis = $derived<Array<{
		timestamp: number;
		framePath?: string | null;
		description?: string;
		objects?: string[];
		tags?: string[];
		confidence?: number;
		detections?: Array<{ label: string; confidence?: number; bbox: [number, number, number, number] }>;
		width?: number;
		height?: number;
		modelRevision?: string | null;
		analysisRevision?: string;
		sourceRevision?: string;
	}>>(
		Array.isArray(doc?.frameAnalysis)
			? doc.frameAnalysis
			: Array.isArray(doc?.metadataJson?.frameAnalysis)
				? doc.metadataJson.frameAnalysis
				: Array.isArray(doc?.frames)
					? doc.frames
					: []
	);
	let selectedAnalysisFrame = $state<{
		timestamp: number;
		framePath?: string | null;
		description?: string;
		objects?: string[];
		tags?: string[];
		confidence?: number;
		detections?: Array<{ label: string; confidence?: number; bbox: [number, number, number, number] }>;
		width?: number;
		height?: number;
		modelRevision?: string | null;
		analysisRevision?: string;
		sourceRevision?: string;
	} | null>(null);
	let previewUrl = $derived.by(() => {
		const previewCaseId = doc?.caseId ?? doc?.case_id ?? caseId;
		if (!evidenceId || !previewCaseId) return null;
		const query = new URLSearchParams({ inline: '1', caseId: previewCaseId });
		return `/api/evidence/${encodeURIComponent(evidenceId)}/download?${query}`;
	});
	let depthMapUrl = $derived.by(() => {
		const hash = doc?.hash;
		const analysis = doc?.aiAnalysis ?? doc?.ai_analysis;
		const depth = analysis?.depthAnalysis ?? analysis?.depth_analysis;
		const revision = depth?.sourceRevision ?? depth?.source_revision;
		if (typeof hash !== 'string' || typeof revision !== 'string') return null;
		const sourceRevision = hash.startsWith('sha256:') ? hash : `sha256:${hash}`;
		return sourceRevision === revision && evidenceId
			? `/api/evidence/${encodeURIComponent(evidenceId)}/depth-map`
			: null;
	});
	let metadata = $derived.by(() => {
		const value = doc?.metadata;
		if (!value) return {};
		if (typeof value === 'string') {
			try {
				return JSON.parse(value);
			} catch {
				return {};
			}
		}
		return value;
	});
	let summary = $derived(doc?.summary ?? doc?.aiSummary ?? doc?.ai_summary ?? null);
	let entities = $derived(metadata?.entities ?? doc?.extractedEntities ?? null);
	let tags = $state<string[]>([]);
	let tagsSaving = $state(false);

	// Direct AI analysis trigger
	let analyzeLoading = $state(false);
	let analyzeQueued  = $state(false);
	let markupPoints = $state<EvidenceMarkupPointV1[]>([]);
	let markupItems = $state<EvidenceMarkupItemV1[]>([]);
	let markupTool = $state<EvidenceMarkupShapeKindV1>('pin');
	let pendingShapeStart = $state<{ x: number; y: number } | null>(null);
	let markupMode = $state(false);
	let markupLabel = $state('Review point');
	let reviewerNote = $state('');
	let markupSaving = $state(false);
	let revisionSaving = $state(false);
	let annotationRevisionSaving = $state(false);
	let annotationRevisionMessage = $state<string | null>(null);
	let annotationPageNumber = $state(1);
	let markupMessage = $state<string | null>(null);
	let mediaState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let imageAnalysis = $state<StoredEvidenceImageAnalysis | null>(null);
	let imageAnalysisLoading = $state(false);
	let imageAnalysisError = $state<string | null>(null);
	let imageNaturalSize = $state({ width: 0, height: 0 });
	let enhanceLoading = $state(false);
	let enhancedPreviewUrl = $state<string | null>(null);
	let enhancedDimensions = $state<string | null>(null);
	let showEnhancedPreview = $state(false);
	let videoElement = $state<HTMLVideoElement | null>(null);
	let audioElement = $state<HTMLAudioElement | null>(null);
	let capturedFrameUrl = $state<string | null>(null);
	let videoFrameTimestampMs = $state<number | null>(null);
	let videoFrameDhash = $state<string | null>(null);
	let videoFrameTicks = $state<string | null>(null);
	let videoFrameAnalysisLoading = $state(false);
	let reviewMediaTimestampMs = $state<number | null>(null);
	let currentPlaybackTimeMs = $state(0);

	// Sync tags when doc loads
	$effect(() => {
		if (doc) tags = (doc.tags ?? (metadata as Record<string, unknown>)?.suggestedTags ?? []) as string[];
	});

	async function saveTags(newTags: string[]) {
		if (!evidenceId || tagsSaving) return;
		tagsSaving = true;
		try {
			const res = await fetch(`/api/evidence/${evidenceId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tags: newTags }),
			});
			if (!res.ok) console.error('[EvidenceViewModal] Tag save failed:', res.status);
		} catch (e) {
			console.error('[EvidenceViewModal] Tag save error:', e);
		} finally {
			tagsSaving = false;
		}
	}
	let status = $derived(doc?.status ?? doc?.processingStatus ?? doc?.documentStatus ?? '');
	let processingDiagnostics = $derived(
		((metadata as Record<string, unknown>)?.processingDiagnostics as { stages?: Record<string, { status: string; detail?: string }>; warnings?: Array<{ stage: string; detail: string; at: string }>; startedAt?: string; completedAt?: string } | undefined) ?? null
	);
	let diagnosticStages = $derived.by(() => Object.entries(processingDiagnostics?.stages ?? {}) as [string, { status: string; detail?: string }][]);
	let diagnosticWarnings = $derived<Array<{ stage: string; detail: string; at: string }>>(processingDiagnostics?.warnings ?? []);

	function statusTone(status: string): 'success' | 'warning' | 'failed' | 'pending' | 'skipped' {
		if (status === 'success') return 'success';
		if (status === 'warning') return 'warning';
		if (status === 'failed') return 'failed';
		if (status === 'pending') return 'pending';
		return 'skipped';
	}

	// Docling extraction viewer
	let showDoclingViewer = $state(false);
	let doclingFileBase64 = $state<string | undefined>(undefined);
	let doclingLoading = $state(false);

	let canRunDocling = $derived(
		(isPdf || isImage) && !!previewUrl
	);

	async function openDoclingViewer() {
		if (!previewUrl) return;
		doclingLoading = true;
		try {
			const res = await fetch(previewUrl);
			if (!res.ok) throw new Error('Failed to fetch file');
			const blob = await res.blob();
			const reader = new FileReader();
			const base64 = await new Promise<string>((resolve) => {
				reader.onload = () => {
					const dataUrl = reader.result as string;
					resolve(dataUrl.split(',')[1]);
				};
				reader.readAsDataURL(blob);
			});
			doclingFileBase64 = base64;
			showDoclingViewer = true;
		} catch (e) {
			console.error('[EvidenceViewModal] Docling fetch error:', e);
		} finally {
			doclingLoading = false;
		}
	}

	async function runAnalysis() {
		if (!evidenceId || analyzeLoading || analyzeQueued) return;
		analyzeLoading = true;
		try {
			const res = await fetch('/api/evidence/analysis', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					evidenceId,
					stages: ['entity_extraction', 'forensics', 'summarization'],
				}),
			});
			if (res.ok) {
				analyzeQueued = true;
				onAnalyze?.(doc);
				// Reload after a short delay to reflect any immediate enrichment
				setTimeout(() => { if (evidenceId) loadDoc(evidenceId); }, 3000);
			}
		} catch { /* non-fatal */ }
		analyzeLoading = false;
	}

	// Image lightbox
	let lightboxOpen = $state(false);
	let lightboxScale = $state(1);

	function openLightbox() { lightboxOpen = true; lightboxScale = 1; }
	function closeLightbox() { lightboxOpen = false; }
	function zoomIn() { lightboxScale = Math.min(lightboxScale + 0.25, 4); }
	function zoomOut() { lightboxScale = Math.max(lightboxScale - 0.25, 0.25); }
	function resetZoom() { lightboxScale = 1; }

	let audioTip = $derived(audioFormatTip(fileType, fileName));
	let canSaveReview = $derived(Boolean((doc?.caseId ?? doc?.case_id ?? caseId) && /^(?:sha256:)?[a-f0-9]{64}$/i.test(String(doc?.hash ?? ''))));
	let imageDisplayUrl = $derived(showEnhancedPreview && enhancedPreviewUrl ? enhancedPreviewUrl : previewUrl);
	let canRunImageTools = $derived(Boolean(isImage && evidenceId && previewUrl));
	let canSaveReviewContent = $derived(
		Boolean(reviewerNote.trim() || markupPoints.length > 0 || markupItems.length > 0 || reviewMediaTimestampMs !== null)
	);

	async function runImageAnalysis() {
		if (!evidenceId || imageAnalysisLoading) return;
		imageAnalysisLoading = true;
		imageAnalysisError = null;
		try {
			imageAnalysis = await analyzeStoredEvidenceImage(evidenceId);
			const storedHash = String(doc?.hash ?? '').replace(/^sha256:/i, '').toLowerCase();
			const resultHash = imageAnalysis.sourceRevision.replace(/^sha256:/i, '').toLowerCase();
			if (storedHash && resultHash && storedHash !== resultHash) throw new Error('Analysis result belongs to a different source revision.');
		} catch (error) {
			imageAnalysisError = error instanceof Error ? error.message : 'Image analysis failed.';
		} finally {
			imageAnalysisLoading = false;
		}
	}

	async function enhanceImagePreview() {
		if (!evidenceId || enhanceLoading) return;
		enhanceLoading = true;
		markupMessage = null;
		try {
			const result = await requestEvidenceUpscale(evidenceId, 2);
			if (enhancedPreviewUrl) URL.revokeObjectURL(enhancedPreviewUrl);
			enhancedPreviewUrl = URL.createObjectURL(result.blob);
			enhancedDimensions = result.dimensions;
			showEnhancedPreview = true;
		} catch (error) {
			markupMessage = error instanceof Error ? error.message : 'Could not create an enhanced preview.';
		} finally {
			enhanceLoading = false;
		}
	}

	function downloadEnhancedCopy() {
		if (!enhancedPreviewUrl) return;
		const link = document.createElement('a');
		link.href = enhancedPreviewUrl;
		link.download = `${fileName || 'evidence'}-2x-preview.png`;
		link.click();
	}

	function captureVideoFrame() {
		const video = videoElement;
		if (!video || !video.videoWidth || !video.videoHeight) {
			markupMessage = 'Wait for video playback to load before capturing a frame.';
			return;
		}
		const canvas = document.createElement('canvas');
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		const context = canvas.getContext('2d');
		if (!context) {
			markupMessage = 'Frame capture is unavailable in this browser.';
			return;
		}
		context.drawImage(video, 0, 0, canvas.width, canvas.height);
		canvas.toBlob((blob) => {
			if (!blob) {
				markupMessage = 'Could not capture this video frame.';
				return;
			}
			if (capturedFrameUrl) URL.revokeObjectURL(capturedFrameUrl);
			capturedFrameUrl = URL.createObjectURL(blob);
			videoFrameTimestampMs = Math.round(video.currentTime * 1000);
			reviewMediaTimestampMs = videoFrameTimestampMs;
			markupMessage = `Frame captured at ${formatVideoTime(video.currentTime)}. It is a separate still; the original video is unchanged.`;
		}, 'image/png');
	}

	async function analyzeVideoFrameInWasm() {
		const video = videoElement;
		if (!video || videoFrameAnalysisLoading) return;
		videoFrameAnalysisLoading = true;
		markupMessage = null;
		try {
			const { analyzeCurrentVideoFrameWasmV1 } = await import('$lib/client/atlas-video-wasm-v1.js');
			const analysis = await analyzeCurrentVideoFrameWasmV1(video);
			videoFrameDhash = analysis.dhashHex;
			videoFrameTicks = analysis.filmcraftTicks;
			videoFrameTimestampMs = analysis.timestampMs;
			reviewMediaTimestampMs = analysis.timestampMs;
			markupMessage = `Local preview hash at ${formatVideoTime(analysis.timestampMs / 1000)}; this result is not saved as evidence.`;
		} catch (error) {
			markupMessage = error instanceof Error ? error.message : 'WASM frame preview failed.';
		} finally {
			videoFrameAnalysisLoading = false;
		}
	}

	function formatVideoTime(seconds: number): string {
		const safe = Math.max(0, Math.floor(seconds));
		return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
	}

	function downloadCapturedFrame() {
		if (!capturedFrameUrl) return;
		const link = document.createElement('a');
		link.href = capturedFrameUrl;
		link.download = `${fileName || 'video'}-${videoFrameTimestampMs ?? 0}ms-frame.png`;
		link.click();
	}

	function seekToAnalysisFrame(frame: { timestamp: number; [key: string]: unknown }) {
		if (!videoElement || typeof frame.timestamp !== 'number') return;
		videoElement.currentTime = frame.timestamp;
		videoFrameTimestampMs = Math.round(frame.timestamp * 1000);
		reviewMediaTimestampMs = videoFrameTimestampMs;
		selectedAnalysisFrame = frame as typeof selectedAnalysisFrame;
		markupMessage = `Seeked to frame at ${formatVideoTime(frame.timestamp)}.`;
	}

	function syncMarkupPins(items: readonly EvidenceMarkupItemV1[]) {
		markupPoints = items
			.filter((item): item is Extract<EvidenceMarkupItemV1, { kind: 'pin' }> => item.kind === 'pin')
			.map(({ x, y, label }) => ({ x, y, label }));
	}

	function selectMarkupTool(tool: EvidenceMarkupShapeKindV1) {
		markupMode = true;
		markupTool = tool;
		pendingShapeStart = null;
		markupMessage = null;
	}

	function undoLastMarkup() {
		if (pendingShapeStart) {
			pendingShapeStart = null;
			markupMessage = null;
			return;
		}
		if (markupItems.length > 0) {
			const next = markupItems.slice(0, -1);
			markupItems = next;
			syncMarkupPins(next);
		} else if (markupPoints.length > 0) {
			markupPoints = markupPoints.slice(0, -1);
		}
		markupMessage = null;
	}

	function clearAllMarkup() {
		markupItems = [];
		markupPoints = [];
		pendingShapeStart = null;
		markupMessage = null;
	}

	function handleImageClick(event: MouseEvent) {
		if (!markupMode || event.detail === 0) {
			openLightbox();
			return;
		}
		const image = event.currentTarget instanceof HTMLElement ? event.currentTarget.querySelector('img') : null;
		if (!image || !image.naturalWidth || !image.naturalHeight) return;
		const bounds = image.getBoundingClientRect();
		const fitScale = Math.min(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight);
		const renderedWidth = image.naturalWidth * fitScale;
		const renderedHeight = image.naturalHeight * fitScale;
		const offsetX = (bounds.width - renderedWidth) / 2;
		const offsetY = (bounds.height - renderedHeight) / 2;
		const x = (event.clientX - bounds.left - offsetX) / renderedWidth;
		const y = (event.clientY - bounds.top - offsetY) / renderedHeight;
		if (x < 0 || x > 1 || y < 0 || y > 1) return;

		const index = markupItems.length + 1;
		const labelText = markupLabel.trim();

		if (markupTool === 'pin') {
			const pinLabel = labelText || `Point ${markupPoints.length + 1}`;
			const nextItems: EvidenceMarkupItemV1[] = [
				...markupItems,
				{ id: `pin-${index}`, kind: 'pin', x, y, label: pinLabel }
			];
			markupItems = nextItems;
			syncMarkupPins(nextItems);
			pendingShapeStart = null;
			markupMessage = null;
			return;
		}

		if (markupTool === 'text') {
			const textValue = labelText || `Annotation ${index}`;
			markupItems = [
				...markupItems,
				{ id: `text-${index}`, kind: 'text', x, y, text: textValue, color: '#f4d36c' }
			];
			pendingShapeStart = null;
			markupMessage = null;
			return;
		}

		if (!pendingShapeStart) {
			pendingShapeStart = { x, y };
			markupMessage = markupTool === 'rectangle'
				? 'Click second corner to finish rectangle.'
				: 'Click destination point to finish arrow.';
			return;
		}

		if (markupTool === 'rectangle') {
			const rx = Math.min(pendingShapeStart.x, x);
			const ry = Math.min(pendingShapeStart.y, y);
			const rw = Math.min(Math.max(Math.abs(x - pendingShapeStart.x), 0.01), Math.max(0.001, 1 - rx));
			const rh = Math.min(Math.max(Math.abs(y - pendingShapeStart.y), 0.01), Math.max(0.001, 1 - ry));
			const clampedX = Math.min(rx, 1 - rw);
			const clampedY = Math.min(ry, 1 - rh);
			markupItems = [
				...markupItems,
				{
					id: `rect-${index}`,
					kind: 'rectangle',
					x: clampedX,
					y: clampedY,
					width: rw,
					height: rh,
					...(labelText ? { label: labelText } : {}),
					color: '#f4d36c'
				}
			];
		} else {
			markupItems = [
				...markupItems,
				{
					id: `arrow-${index}`,
					kind: 'arrow',
					x1: pendingShapeStart.x,
					y1: pendingShapeStart.y,
					x2: x,
					y2: y,
					...(labelText ? { label: labelText } : {}),
					color: '#f4d36c'
				}
			];
		}
		pendingShapeStart = null;
		markupMessage = null;
	}

	async function saveMarkupNote() {
		const sourceCaseId = doc?.caseId ?? doc?.case_id ?? caseId;
		if (!evidenceId || !sourceCaseId || markupSaving) return;
		markupSaving = true;
		markupMessage = null;
		try {
			const note = buildEvidenceMarkupNoteV1({
				evidenceId,
				sourceSha256: String(doc?.hash ?? ''),
				points: markupPoints,
				items: markupItems.length > 0 ? markupItems : undefined,
				noteText: reviewerNote,
				mediaTimestampMs: reviewMediaTimestampMs ?? undefined
			});
			const response = await fetch(`/api/cases/${encodeURIComponent(sourceCaseId)}/notes`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(note)
			});
			if (!response.ok) throw new Error(response.status === 404 ? 'This case does not allow saving notes for this account.' : `Save failed (${response.status}).`);
			markupMessage = 'Markup saved as a case note linked to this evidence revision.';
			reviewerNote = '';
			reviewMediaTimestampMs = null;
		} catch (error) {
			markupMessage = error instanceof Error ? error.message : 'Could not save markup.';
		} finally {
			markupSaving = false;
		}
	}

	function markCurrentMediaTime() {
		const current = isVideo ? videoElement?.currentTime : isAudio ? audioElement?.currentTime : undefined;
		if (current === undefined || !Number.isFinite(current) || current < 0) return;
		reviewMediaTimestampMs = Math.round(current * 1000);
		annotationRevisionMessage = `Annotation location set to ${formatVideoTime(current)}.`;
	}

	async function saveAnnotationRevision() {
		const sourceCaseId = doc?.caseId ?? doc?.case_id ?? caseId;
		if (!evidenceId || !sourceCaseId || !canSaveReview || annotationRevisionSaving) return;
		annotationRevisionSaving = true;
		annotationRevisionMessage = null;
		try {
			const rawHash = String(doc?.hash ?? '').trim();
			const parentSha256 = rawHash.startsWith('sha256:') ? rawHash : `sha256:${rawHash}`;
			const modality = isPdf ? 'pdf' : isVideo ? 'video' : isAudio ? 'audio' : isImage ? 'image' : isScene ? 'scene' : 'document';
			const location = isPdf
				? { kind: 'pdf-page', page: Math.max(1, Math.floor(annotationPageNumber)) }
				: isVideo && reviewMediaTimestampMs !== null
					? { kind: 'video-time', timeMs: reviewMediaTimestampMs }
					: isAudio && reviewMediaTimestampMs !== null
						? { kind: 'audio-range', startMs: reviewMediaTimestampMs, endMs: reviewMediaTimestampMs + 1 }
						: { kind: 'document' };
			const annotation = {
				schema: 'atlas.evidence-annotation.v1',
				modality,
				notes: '',
				annotations: [{ id: crypto.randomUUID(), kind: 'note', text: reviewerNote.trim() || 'Review marker', location }]
			};
			const response = await fetch(`/api/evidence/${encodeURIComponent(evidenceId)}/versions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					schema: 'atlas.evidence-annotation-revision-request.v1',
					caseId: sourceCaseId,
					parentSha256,
					revisionNotes: reviewerNote.trim() || `Source annotation for ${modality}`,
					annotation
				})
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Annotation revision save failed (${response.status}).`);
			annotationRevisionMessage = `Annotation saved as revision #${payload.version}. Indexing was not requested.`;
			await loadRevisionHistory(evidenceId);
			reviewerNote = '';
			reviewMediaTimestampMs = null;
		} catch (error) {
			annotationRevisionMessage = error instanceof Error ? error.message : 'Could not save annotation revision.';
		} finally {
			annotationRevisionSaving = false;
		}
	}

	async function renderMarkedImageBlob(): Promise<Blob> {
		if (!previewUrl) throw new Error('No preview image is available.');
		const image = new Image();
		image.src = previewUrl;
		await image.decode();
		const canvas = document.createElement('canvas');
		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('Canvas export is unavailable.');
		context.drawImage(image, 0, 0);
		const scale = Math.max(1, image.naturalWidth / 1200);
		const itemsToDraw: EvidenceMarkupItemV1[] =
			markupItems.length > 0
				? markupItems
				: markupPoints.map((point, index) => ({
					id: `pin-${index + 1}`,
					kind: 'pin' as const,
					x: point.x,
					y: point.y,
					label: point.label
				}));
		let pinNumber = 0;
		for (const item of itemsToDraw) {
			if (item.kind === 'pin') {
				pinNumber += 1;
				const x = item.x * canvas.width;
				const y = item.y * canvas.height;
				context.beginPath();
				context.arc(x, y, 12 * scale, 0, Math.PI * 2);
				context.fillStyle = '#f4d36c';
				context.fill();
				context.lineWidth = 2 * scale;
				context.strokeStyle = '#171b22';
				context.stroke();
				context.fillStyle = '#171b22';
				context.font = `bold ${12 * scale}px sans-serif`;
				context.textAlign = 'center';
				context.textBaseline = 'middle';
				context.fillText(String(pinNumber), x, y);
			} else if (item.kind === 'rectangle') {
				const rx = item.x * canvas.width;
				const ry = item.y * canvas.height;
				const rw = item.width * canvas.width;
				const rh = item.height * canvas.height;
				context.strokeStyle = item.color || '#f4d36c';
				context.lineWidth = 3 * scale;
				context.strokeRect(rx, ry, rw, rh);
				if (item.label) {
					context.fillStyle = '#171b22';
					context.font = `bold ${13 * scale}px sans-serif`;
					const metrics = context.measureText(item.label);
					context.fillRect(rx, Math.max(0, ry - 20 * scale), metrics.width + 10 * scale, 18 * scale);
					context.fillStyle = item.color || '#f4d36c';
					context.textAlign = 'left';
					context.textBaseline = 'top';
					context.fillText(item.label, rx + 5 * scale, Math.max(2 * scale, ry - 18 * scale));
				}
			} else if (item.kind === 'arrow') {
				const x1 = item.x1 * canvas.width;
				const y1 = item.y1 * canvas.height;
				const x2 = item.x2 * canvas.width;
				const y2 = item.y2 * canvas.height;
				const color = item.color || '#f4d36c';
				context.strokeStyle = color;
				context.fillStyle = color;
				context.lineWidth = 3 * scale;
				context.beginPath();
				context.moveTo(x1, y1);
				context.lineTo(x2, y2);
				context.stroke();
				const angle = Math.atan2(y2 - y1, x2 - x1);
				const headLen = 14 * scale;
				context.beginPath();
				context.moveTo(x2, y2);
				context.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
				context.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
				context.closePath();
				context.fill();
				if (item.label) {
					context.font = `bold ${13 * scale}px sans-serif`;
					context.textAlign = 'left';
					context.textBaseline = 'bottom';
					context.fillText(item.label, (x1 + x2) / 2, (y1 + y2) / 2 - 4 * scale);
				}
			} else if (item.kind === 'text') {
				const tx = item.x * canvas.width;
				const ty = item.y * canvas.height;
				context.font = `bold ${15 * scale}px sans-serif`;
				context.textAlign = 'left';
				context.textBaseline = 'middle';
				context.lineWidth = 4 * scale;
				context.strokeStyle = '#171b22';
				context.strokeText(item.text, tx, ty);
				context.fillStyle = item.color || '#f4d36c';
				context.fillText(item.text, tx, ty);
			}
		}
		return await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Could not export marked image.'))), 'image/png')
		);
	}

	async function exportMarkedImage() {
		if (!previewUrl) return;
		try {
			const blob = await renderMarkedImageBlob();
			const objectUrl = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = objectUrl;
			link.download = `${fileName || 'evidence'}-marked.png`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
		} catch (error) {
			markupMessage = error instanceof Error ? error.message : 'Could not export marked image.';
		}
	}

	async function saveMarkupRevisionV2() {
		const sourceCaseId = doc?.caseId ?? doc?.case_id ?? caseId;
		if (!evidenceId || !sourceCaseId || !canSaveReview || revisionSaving) return;
		revisionSaving = true;
		markupMessage = null;
		try {
			const rawHash = String(doc?.hash ?? '').trim();
			const parentSha256 = rawHash.startsWith('sha256:') ? rawHash : `sha256:${rawHash}`;
			const markupDoc = buildEvidenceMarkupDocumentV1({
				notes: reviewerNote,
				items: markupItems.length > 0 ? markupItems : undefined,
				points: markupItems.length > 0 ? undefined : markupPoints
			});
			const blob = await renderMarkedImageBlob();
			const flattenedImage = new File([blob], `${fileName || 'evidence'}-marked.png`, { type: 'image/png' });
			const formData = new FormData();
			formData.set('caseId', String(sourceCaseId));
			formData.set('parentSha256', parentSha256);
			if (reviewerNote.trim()) formData.set('revisionNotes', reviewerNote.trim());
			formData.set('markupJson', JSON.stringify(markupDoc));
			formData.set('flattenedImage', flattenedImage);

			const response = await fetch(`/api/evidence/${encodeURIComponent(evidenceId)}/versions`, {
				method: 'POST',
				body: formData
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok || !payload?.ok) {
				throw new Error(payload?.error || `Revision save failed (${response.status}).`);
			}
			markupMessage = `V2 revision #${payload.version} saved to ${payload.bucket} (indexing not requested).`;
			await loadRevisionHistory(evidenceId);
		} catch (error) {
			markupMessage = error instanceof Error ? error.message : 'Could not save V2 revision.';
		} finally {
			revisionSaving = false;
		}
	}

	// File-type color accent
	let accentColor = $derived.by(() => {
		const ft = fileType.toLowerCase();
		if (ft.includes('pdf')) return { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)', text: '#f87171', strip: '#ef4444' };
		if (ft.startsWith('image/')) return { bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.3)', text: '#c4b5fd', strip: '#a855f7' };
		if (ft.startsWith('audio/')) return { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', text: '#fbbf24', strip: '#f59e0b' };
		if (ft.startsWith('video/')) return { bg: 'rgba(236, 72, 153, 0.12)', border: 'rgba(236, 72, 153, 0.3)', text: '#f472b6', strip: '#ec4899' };
		if (ft.includes('markdown') || fileName.endsWith('.md')) return { bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)', text: '#7dd3fc', strip: '#38bdf8' };
		if (ft.includes('word') || ft.includes('text') || ft.includes('document')) return { bg: 'rgba(96, 165, 250, 0.12)', border: 'rgba(96, 165, 250, 0.3)', text: '#93c5fd', strip: '#60a5fa' };
		if (ft.includes('sheet') || ft.includes('csv') || ft.includes('excel')) return { bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.3)', text: '#4ade80', strip: '#22c55e' };
		return { bg: 'rgba(212, 199, 163, 0.08)', border: 'rgba(212, 199, 163, 0.15)', text: 'rgba(212, 199, 163, 0.7)', strip: 'rgba(212, 199, 163, 0.3)' };
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<Dialog.Root bind:open onOpenChange={(next) => { if (!next) close(); }} onOpenChangeComplete={() => {}}>
	<Dialog.Portal>
		<Dialog.Overlay class="evidence-document-modal-backdrop" />
		<Dialog.Content class="evidence-document-modal">
			<!-- Corner Notches and Top Highlight -->
			<span class="hud-notch-tl" aria-hidden="true"></span>
			<span class="hud-notch-tr" aria-hidden="true"></span>
			<span class="hud-notch-bl" aria-hidden="true"></span>
			<span class="hud-notch-br" aria-hidden="true"></span>
			<div class="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#f3d471] to-transparent opacity-80" aria-hidden="true"></div>
			<!-- Type accent strip -->
			<div class="modal-accent-strip" style="background: {accentColor.strip};"></div>

			<!-- Header -->
			<div class="modal-header">
				<div class="modal-title-row">
					<div class="modal-file-icon-wrap" style="background: {accentColor.bg}; border-color: {accentColor.border};">
						<span class="modal-file-icon">{doc ? getIcon(fileType) : '📄'}</span>
					</div>
					<div class="modal-title-text">
						<Dialog.Title class="modal-title">
							{#if isLoading}Loading…{:else if doc}{doc.title || doc.fileName || doc.file_name || 'Untitled'}{:else}Evidence Detail{/if}
						</Dialog.Title>
						{#if doc}
							<div class="modal-subtitle-row">
								<span class="modal-type-badge" style="background: {accentColor.bg}; border-color: {accentColor.border}; color: {accentColor.text};">
									{getTypeLabel(fileType)}
								</span>
								<span class="modal-subtitle">
									{formatFileSize(doc.fileSize ?? doc.file_size ?? 0)}
								</span>
								{#if doc.caseId ?? doc.case_id}
									<span class="modal-case-badge">
										<Icon name="link" class="w-3 h-3" />
										Linked
									</span>
								{/if}
								{#if status}
									<span class="modal-status-badge">{status}</span>
								{/if}
							</div>
						{/if}
					</div>
				</div>
				<button type="button" class="modal-close" onclick={close} aria-label="Close">
					<Icon name="x" class="w-4 h-4" />
				</button>
			</div>

			<!-- Body -->
			<div class="modal-body" class:relief-open={showRelief}>
				{#if isLoading}
					<div class="modal-skeleton">
						<div class="skel-line skel-w-60"></div>
						<div class="skel-row">
							<div class="skel-box"></div>
							<div class="skel-box"></div>
						</div>
						<div class="skel-line skel-w-80"></div>
						<div class="skel-line skel-w-40"></div>
						<div class="skel-block"></div>
					</div>
				{:else if loadError}
					<div class="modal-error">
						<Icon name="circle-alert" class="w-5 h-5" />
						<span>{loadError}</span>
					</div>
				{:else if doc}
					<!-- File preview (images with lightbox) -->
					{#if isSpzEvidence}
						{#if caseId && evidenceId}
							<EvidenceSpzViewer {caseId} {evidenceId} />
						{:else}
							<p role="status">Open this SPZ exhibit from its case to verify its source and authorization before viewing.</p>
						{/if}
					{:else if isImage && previewUrl}
						<div class="preview-wrap">
							<div class="evidence-preview-modes" role="group" aria-label="Evidence view mode">
								<button type="button" aria-pressed={!showRelief} onclick={() => (showRelief = false)}>Original</button>
								<button type="button" aria-pressed={showRelief} onclick={() => (showRelief = true)}>3D relief</button>
							</div>
							{#if showRelief}
								<div class="evidence-relief-embed">
									<Evidence3DModal
										open={true}
										embedded
										title={doc.title ?? fileName ?? 'Evidence relief'}
										{evidenceId}
										caseId={caseId}
										{chatMessages}
										{chatStatus}
										{onAskAssistant}
									{assistantInitiallyExpanded}
										imageUrl={previewUrl}
										depthUrl={depthMapUrl}
									/>
								</div>
							{:else}
								<div class="image-review-tools" role="toolbar" aria-label="Image review tools">
									<button type="button" onclick={() => (showEnhancedPreview = false)} aria-pressed={!showEnhancedPreview}>Original</button>
									<button type="button" onclick={enhanceImagePreview} disabled={enhanceLoading || !canRunImageTools} title="Separate Lanczos enlargement preview; no new detail is inferred">
										{enhanceLoading ? 'Enhancing…' : enhancedPreviewUrl ? 'Refresh 2×' : 'Enhance 2×'}
									</button>
									{#if enhancedPreviewUrl}
										<button type="button" onclick={() => (showEnhancedPreview = true)} aria-pressed={showEnhancedPreview}>2× preview{enhancedDimensions ? ` · ${enhancedDimensions}` : ''}</button>
										<button type="button" onclick={downloadEnhancedCopy}>Export preview</button>
									{/if}
									<button type="button" onclick={runImageAnalysis} disabled={imageAnalysisLoading || !canRunImageTools}>
										{imageAnalysisLoading ? 'Analyzing…' : 'Detect & analyze'}
									</button>
									<button type="button" aria-pressed={markupMode} class:active={markupMode} onclick={() => { markupMode = !markupMode; pendingShapeStart = null; }}>
										<Icon name="map-pin" class="w-3.5 h-3.5" /> {markupMode ? 'Done markup' : 'Add markup'}
									</button>
									<button type="button" aria-pressed={markupMode && markupTool === 'pin'} class:active={markupMode && markupTool === 'pin'} onclick={() => selectMarkupTool('pin')}>Pin</button>
									<button type="button" aria-pressed={markupMode && markupTool === 'rectangle'} class:active={markupMode && markupTool === 'rectangle'} onclick={() => selectMarkupTool('rectangle')}>Rect</button>
									<button type="button" aria-pressed={markupMode && markupTool === 'arrow'} class:active={markupMode && markupTool === 'arrow'} onclick={() => selectMarkupTool('arrow')}>Arrow</button>
									<button type="button" aria-pressed={markupMode && markupTool === 'text'} class:active={markupMode && markupTool === 'text'} onclick={() => selectMarkupTool('text')}>Text</button>
									{#if markupItems.length > 0 || markupPoints.length > 0 || pendingShapeStart}
										<button type="button" onclick={undoLastMarkup}>Undo</button>
										<button type="button" onclick={clearAllMarkup}>Clear</button>
									{/if}
									<input aria-label="Markup label" bind:value={markupLabel} maxlength="120" />
									<button type="button" onclick={exportMarkedImage} disabled={markupItems.length === 0 && markupPoints.length === 0}>Export marked copy</button>
									<button type="button" onclick={saveMarkupRevisionV2} disabled={revisionSaving || !canSaveReview || (markupItems.length === 0 && markupPoints.length === 0)}>
										{revisionSaving ? 'Saving V2…' : 'Save V2 revision'}
									</button>
								</div>
								<p class="image-markup-help">Enhance is Lanczos resampling, not AI detail recovery. The original stays unchanged; detected objects are suggestions, not identity findings.</p>
								{#if markupMessage}<p class="media-status" role="status">{markupMessage}</p>{/if}
								{#if imageAnalysisError}<p class="media-status error" role="alert">{imageAnalysisError}</p>{/if}
								{#if imageAnalysis}
									<div class="image-analysis-result" role="status">
										<strong>Image analysis · {imageAnalysis.boxes.length} detected regions</strong>
										{#if imageAnalysis.reviewState}<p>Model output: {imageAnalysis.reviewState.replaceAll('_', ' ').toLowerCase()}</p>{/if}
										{#if imageAnalysis.analysisRevision}<p>Analysis revision: {imageAnalysis.analysisRevision}</p>{/if}
										{#if imageAnalysis.embeddingModel}<p>Embedding model: {imageAnalysis.embeddingModel}</p>{/if}
										{#if imageAnalysis.preprocessingRevision}<p>Preprocessing: {imageAnalysis.preprocessingRevision}</p>{/if}
										{#if imageAnalysis.analysis.summary}<p>{imageAnalysis.analysis.summary}</p>{/if}
										{#if imageAnalysis.boxes.length > 0}<ul>{#each imageAnalysis.boxes as box, index (`${box.label}-${index}`)}<li>{box.label} · {Math.round(box.conf * 100)}% confidence</li>{/each}</ul>{/if}
										{#each imageAnalysis.warnings as warning}<p class="media-status">{warning}</p>{/each}
									</div>
								{/if}
								<button type="button" class="preview-img-btn" onclick={handleImageClick} title={markupMode ? `Place ${markupTool}` : 'Click to zoom'}>
									<img src={imageDisplayUrl ?? previewUrl} alt={doc.title ?? 'Evidence'} class="preview-img" onload={(event) => { mediaState = 'ready'; const image = event.currentTarget as HTMLImageElement; if (!showEnhancedPreview) imageNaturalSize = { width: image.naturalWidth, height: image.naturalHeight }; }} onerror={() => (mediaState = 'error')} />
									{#if imageAnalysis?.boxes.length && imageNaturalSize.width > 0}
										<svg class="image-detection-overlay" viewBox={`0 0 ${imageNaturalSize.width} ${imageNaturalSize.height}`} aria-label="Detected regions; labels are not identity claims">
											{#each imageAnalysis.boxes as box, index (`${box.label}-${index}`)}<rect x={box.x} y={box.y} width={box.w} height={box.h} />{/each}
										</svg>
									{/if}
									{#if markupItems.length > 0 || pendingShapeStart}
										<svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2" aria-label="Evidence markup overlay">
											<defs>
												<marker id="markup-arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
													<path d="M0,0 L0,6 L9,3 z" fill="#f4d36c" />
												</marker>
											</defs>
											{#each markupItems as item (item.id)}
												{#if item.kind === 'rectangle'}
													<rect
														x={item.x * 1000}
														y={item.y * 1000}
														width={item.width * 1000}
														height={item.height * 1000}
														fill="rgba(244, 211, 108, 0.1)"
														stroke={item.color ?? '#f4d36c'}
														stroke-width="3"
														vector-effect="non-scaling-stroke"
													/>
												{:else if item.kind === 'arrow'}
													<line
														x1={item.x1 * 1000}
														y1={item.y1 * 1000}
														x2={item.x2 * 1000}
														y2={item.y2 * 1000}
														stroke={item.color ?? '#f4d36c'}
														stroke-width="3"
														vector-effect="non-scaling-stroke"
														marker-end="url(#markup-arrowhead)"
													/>
												{:else if item.kind === 'text'}
													<text
														x={item.x * 1000}
														y={item.y * 1000}
														fill={item.color ?? '#f4d36c'}
														stroke="#171b22"
														stroke-width="4"
														paint-order="stroke"
														font-size="24"
														font-weight="700"
													>{item.text}</text>
												{/if}
											{/each}
											{#if pendingShapeStart}
												<circle cx={pendingShapeStart.x * 1000} cy={pendingShapeStart.y * 1000} r="8" fill="#f4d36c" stroke="#171b22" stroke-width="2" />
											{/if}
										</svg>
									{/if}
									{#each markupPoints as point, index (index)}
										<span class="image-markup-pin" style={`left:${point.x * 100}%;top:${point.y * 100}%`} title={point.label}>{index + 1}</span>
									{/each}
									<span class="preview-zoom-hint"><Icon name={markupMode ? 'map-pin' : 'zoom-in'} class="w-4 h-4" /></span>
								</button>
								{#if mediaState === 'error'}<p class="media-status error" role="alert">This image could not be loaded. The original file is still available from Download.</p>{/if}
							{/if}
						</div>
					{:else if isPdf && previewUrl}
						<div class="preview-wrap pdf-embed-wrap">
							<iframe
								src={previewUrl}
								title="PDF Document: {doc.title ?? 'Evidence'}"
								class="pdf-iframe"
							></iframe>
							<div class="pdf-fallback">
								<a href={previewUrl} target="_blank" rel="noopener noreferrer" class="pdf-link">
									<Icon name="external-link" class="w-4 h-4" />
									Open in new tab
								</a>
							</div>
						</div>
					{:else if isVideo && previewUrl}
						<div class="preview-wrap media-wrap">
							<!-- svelte-ignore a11y_media_has_caption -->
							<video
								bind:this={videoElement}
								controls
								preload="metadata"
								class="video-player"
								src={previewUrl}
								onloadstart={() => (mediaState = 'loading')}
								onloadedmetadata={() => {
									mediaState = 'ready';
									if (typeof initialTimestampMs === 'number' && Number.isFinite(initialTimestampMs) && videoElement) {
										videoElement.currentTime = initialTimestampMs / 1000;
										reviewMediaTimestampMs = initialTimestampMs;
									}
								}}
								onerror={() => (mediaState = 'error')}
								ontimeupdate={() => {
									if (videoElement) {
										currentPlaybackTimeMs = Math.round(videoElement.currentTime * 1000);
									}
								}}
							>
								<track kind="captions" />
								Your browser does not support video playback.
							</video>
							{#if mediaState === 'loading'}<progress class="media-loading-bar" aria-label="Loading video metadata"></progress>{/if}
							{#if mediaState === 'error'}<p class="media-status error" role="alert">The browser could not play this video format. Download the original file to open it with a compatible player.</p>{/if}
							<div class="video-frame-tools" role="toolbar" aria-label="Video frame review tools">
				{#if evidenceId}
					<button type="button" data-testid="open-video-transcript" aria-expanded={showTranscript} onclick={() => (showTranscript = true)}>Transcript</button>
				{/if}
								<button type="button" onclick={captureVideoFrame} disabled={mediaState !== 'ready'}>Capture current frame</button>
								<button type="button" onclick={analyzeVideoFrameInWasm} disabled={mediaState !== 'ready' || videoFrameAnalysisLoading}>
									{videoFrameAnalysisLoading ? 'Analyzing frame…' : 'Analyze frame (WASM)'}
								</button>
								{#if videoFrameTimestampMs !== null}<span>Frame at {formatVideoTime(videoFrameTimestampMs / 1000)}</span><button type="button" onclick={downloadCapturedFrame} disabled={!capturedFrameUrl}>Export still</button>{/if}
							</div>
							{#if videoFrameAnalysis.length > 0}
								<div class="video-filmstrip-section" role="region" aria-label="Extracted Video Keyframes">
									<div class="filmstrip-header">
										<span class="filmstrip-title">Extracted Keyframes ({videoFrameAnalysis.length})</span>
										<span class="filmstrip-legend">Unreviewed proposal · Click frame to seek</span>
									</div>
									<!-- svelte-ignore a11y_no_noninteractive_tabindex: keyboard scrolling is intentional for the frame strip -->
									<div class="video-filmstrip-scroll" tabindex="0" aria-label="Keyframe timeline strip">
										{#each videoFrameAnalysis as frame, idx}
											<button
												type="button"
												class="filmstrip-frame-card"
												class:selected={selectedAnalysisFrame === frame || Math.abs((videoFrameTimestampMs ?? -99999) - Math.round(frame.timestamp * 1000)) < 500}
												onclick={() => seekToAnalysisFrame(frame)}
												title={`Seek to ${formatVideoTime(frame.timestamp)}`}
											>
												<div class="frame-thumb-box">
													{#if frame.framePath && (frame.framePath.startsWith('http') || frame.framePath.startsWith('/'))}
														<img src={frame.framePath} alt={`Frame ${idx + 1}`} class="filmstrip-img" loading="lazy" />
													{:else}
														<div class="frame-placeholder-thumb">
															<span class="time-label">{formatVideoTime(frame.timestamp)}</span>
														</div>
													{/if}
												</div>
												<div class="frame-info">
													<span class="frame-time-badge">{formatVideoTime(frame.timestamp)}</span>
													{#if frame.tags && frame.tags.length > 0}
														<span class="frame-tag-badge">{frame.tags[0]}</span>
													{/if}
												</div>
											</button>
										{/each}
									</div>
									{#if selectedAnalysisFrame}
										<div class="selected-frame-detail" aria-live="polite">
											<div class="detail-badge-row">
												<span class="time-badge">{formatVideoTime(selectedAnalysisFrame.timestamp)}</span>
												<span class="proposal-badge">Unreviewed Model Proposal</span>
												{#if selectedAnalysisFrame.confidence}
													<span class="confidence-badge">{Math.round(selectedAnalysisFrame.confidence * 100)}% conf</span>
												{/if}
											</div>
											{#if selectedAnalysisFrame.description}
												<p class="frame-description">{selectedAnalysisFrame.description}</p>
											{/if}
											{#if selectedAnalysisFrame.objects && selectedAnalysisFrame.objects.length > 0}
												<div class="frame-objects-row">
									<strong>Model labels (not identity findings):</strong> {selectedAnalysisFrame.objects.join(', ')}
												</div>
											{/if}
							{#if selectedAnalysisFrame.detections?.length}
								<div class="frame-objects-row">
									<strong>Source-space boxes (px):</strong>
									{#each selectedAnalysisFrame.detections as detection}
										<span>{detection.label} [{detection.bbox.map((coordinate) => Math.round(coordinate)).join(', ')}]</span>
									{/each}
								</div>
							{/if}
							{#if selectedAnalysisFrame.modelRevision}
								<p class="frame-description">Model revision {selectedAnalysisFrame.modelRevision}</p>
							{/if}
										</div>
									{/if}
								</div>
							{/if}
							{#if videoFrameDhash && videoFrameTicks}
								<p class="media-status" aria-live="polite">Local dHash <code>{videoFrameDhash}</code> · FilmCraft ticks {videoFrameTicks} · preview only, not persisted</p>
							{/if}
							{#if capturedFrameUrl}<img class="captured-video-frame" src={capturedFrameUrl} alt={`Captured video frame at ${formatVideoTime((videoFrameTimestampMs ?? 0) / 1000)}`} />{/if}
			{#if evidenceId && showTranscript}
				<div class="transcript-drawer-scrim" aria-hidden="true"></div>
				<div class="transcript-drawer" role="dialog" aria-modal="false" tabindex="-1" aria-label={`Transcript for ${doc?.title ?? fileName}`} data-testid="video-transcript-drawer">
					<header class="transcript-drawer-header">
						<div><strong>Transcript</strong><span>{doc?.title ?? fileName}</span></div>
						<button type="button" aria-label="Close transcript" data-testid="close-video-transcript" onclick={() => (showTranscript = false)}>×</button>
					</header>
					<EvidenceTranscriptPanel
						evidenceId={evidenceId}
						caseId={caseId ?? undefined}
						videoTitle={doc?.title ?? fileName}
						currentTimeMs={currentPlaybackTimeMs}
						initialOpen={true}
						onSeek={(timestampMs) => {
							if (videoElement) {
								videoElement.currentTime = timestampMs / 1000;
								reviewMediaTimestampMs = timestampMs;
								currentPlaybackTimeMs = timestampMs;
							}
						}}
					/>
				</div>
			{/if}
						</div>
					{:else if isAudio && previewUrl}
						<div class="preview-wrap media-wrap audio-wrap">
							<div class="audio-visual">
								<span class="audio-icon">
									<Icon name="music" class="w-8 h-8" />
								</span>
								<span class="audio-filename">{fileName || 'Audio file'}</span>
							</div>
							<audio controls preload="metadata" class="audio-player" src={previewUrl}
				bind:this={audioElement}
								onloadstart={() => (mediaState = 'loading')}
								onloadedmetadata={() => {
									mediaState = 'ready';
									if (typeof initialTimestampMs === 'number' && Number.isFinite(initialTimestampMs) && videoElement) {
										videoElement.currentTime = initialTimestampMs / 1000;
										reviewMediaTimestampMs = initialTimestampMs;
									}
								}}
								onerror={() => (mediaState = 'error')}>
								Your browser does not support audio playback.
							</audio>
							<p class="audio-format-tip">{audioTip}</p>
							{#if mediaState === 'loading'}<progress class="media-loading-bar" aria-label="Loading audio metadata"></progress>{/if}
							{#if mediaState === 'error'}<p class="media-status error" role="alert">The browser could not play this audio format. Download the original file to open it with a compatible player.</p>{/if}
						</div>
					{:else if isMarkdown}
						{@const rawText = doc.extractedText ?? doc.extracted_text ?? doc.content ?? ''}
						{#if rawText}
							<div class="preview-wrap markdown-wrap">
								<div class="markdown-header">
									<Icon name="file-text" class="w-3.5 h-3.5" />
									<span>Markdown</span>
								</div>
								<pre class="markdown-body">{rawText.slice(0, 5000)}{rawText.length > 5000 ? '\n… (truncated)' : ''}</pre>
							</div>
						{/if}
					{:else if isText}
						{@const rawText = doc.extractedText ?? doc.extracted_text ?? doc.content ?? ''}
						{#if rawText}
							<div class="preview-wrap text-file-wrap">
								<div class="text-file-header">
									<Icon name="file-text" class="w-3.5 h-3.5" />
									<span>{fileName || 'Text file'}</span>
									<span class="text-file-lines">{rawText.split('\n').length} lines</span>
								</div>
								<pre class="text-file-content">{rawText.slice(0, 5000)}{rawText.length > 5000 ? '\n… (truncated)' : ''}</pre>
							</div>
						{/if}
					{:else}
						<div class="preview-wrap unsupported-media" role="status">
							<Icon name="file" class="w-6 h-6" />
							<strong>Preview unavailable</strong>
							<span>{fileType || doc.type || 'The file format could not be identified.'}</span>
							{#if Number(doc.fileSize ?? doc.file_size ?? 0) > 0 && Number(doc.fileSize ?? doc.file_size ?? 0) <= 8}
								<span>This stored object is empty or unusually small. Check the upload record before running analysis.</span>
							{/if}
						</div>
					{/if}

					<!-- Core fields -->
					<div class="fields-card">
						{#if doc.description}
							<div class="field full-width">
								<span class="field-label">
									<Icon name="align-left" class="w-3 h-3" />
									Description
								</span>
								<p class="field-value">{doc.description}</p>
							</div>
						{/if}

						<div class="field">
							<span class="field-label">
								<Icon name="file" class="w-3 h-3" />
								Type
							</span>
							<span class="field-value">{fileType || doc.type || 'Unknown'}</span>
						</div>

						<div class="field">
							<span class="field-label">
								<Icon name="calendar" class="w-3 h-3" />
								Uploaded
							</span>
							<span class="field-value">{formatDate(doc.createdAt ?? doc.created_at)}</span>
						</div>

						{#if doc.source}
							<div class="field">
								<span class="field-label">
									<Icon name="database" class="w-3 h-3" />
									Source
								</span>
								<span class="field-value">{doc.source}</span>
							</div>
						{/if}

						{#if status}
							<div class="field">
								<span class="field-label">
									<Icon name="activity" class="w-3 h-3" />
									Status
								</span>
								<span class="field-badge">{status}</span>
							</div>
						{/if}

						{#if doc.evidenceNumber ?? doc.evidence_number}
							<div class="field">
								<span class="field-label">
									<Icon name="shield" class="w-3 h-3" />
									Evidence #
								</span>
								<span class="field-value mono">{doc.evidenceNumber ?? doc.evidence_number}</span>
							</div>
						{/if}
					</div>

					<div class="section review-note-section">
						<h3 class="section-title"><Icon name="message-square" class="w-3.5 h-3.5" /> Review note</h3>
						<textarea bind:value={reviewerNote} maxlength="10000" rows="3" placeholder="Add a source-grounded note. This is saved separately from the original evidence."></textarea>
						{#if isPdf}<label class="annotation-page-field">Page <input type="number" min="1" max="1000000" bind:value={annotationPageNumber} /></label>{/if}
						{#if isVideo || isAudio}<button type="button" class="media-time-mark" onclick={markCurrentMediaTime}>Mark current playback time{reviewMediaTimestampMs !== null ? ` · ${formatVideoTime(reviewMediaTimestampMs / 1000)}` : ''}</button>{/if}
						<div class="review-note-actions">
							<span>Source hash required. Original evidence stays unchanged.</span>
							<button type="button" onclick={saveMarkupNote} disabled={!canSaveReviewContent || !canSaveReview || markupSaving}>
								{markupSaving ? 'Saving…' : 'Save review'}
							</button>
						</div>
						<button type="button" class="annotation-revision-save" onclick={saveAnnotationRevision} disabled={!canSaveReview || annotationRevisionSaving || (!reviewerNote.trim() && reviewMediaTimestampMs === null && !isPdf)}>
							{annotationRevisionSaving ? 'Saving revision…' : 'Save annotation revision'}
						</button>
						{#if annotationRevisionMessage}<p class="media-status" role="status">{annotationRevisionMessage}</p>{/if}
						<details class="evidence-revision-history">
							<summary>Revision history <span>{revisionHistory.length}</span></summary>
							{#if revisionHistory.length}
								<ol>
									{#each revisionHistory as revision (revision.id)}
										<li>
											<strong>Revision {revision.version}</strong>
											<span>{revision.changeReason || 'Saved evidence revision'}</span>
											<time datetime={new Date(revision.createdAt).toISOString()}>{new Date(revision.createdAt).toLocaleString()}</time>
										</li>
									{/each}
								</ol>
							{:else}
								<p>No saved revisions are available.</p>
							{/if}
						</details>
						{#if !canSaveReview}<p class="media-status">Saving requires a linked case and a valid SHA-256 source hash. You can still export a marked image copy.</p>{/if}
						{#if markupMessage}<p class="media-status" role="status">{markupMessage}</p>{/if}
					</div>

					<!-- Summary / AI analysis -->
					{#if summary}
						<div class="section ai-section">
							<h3 class="section-title">
								<span class="ai-icon-wrap">
									<Icon name="sparkles" class="w-3.5 h-3.5" />
								</span>
								AI Summary
							</h3>
							<p class="section-body">{summary}</p>
						</div>
					{/if}

					{#if processingDiagnostics && diagnosticStages.length > 0}
						<div class="section diagnostics-section">
							<h3 class="section-title">
								<Icon name="activity" class="w-3.5 h-3.5" />
								Processing Diagnostics
							</h3>
							<div class="diagnostics-meta">
								<span>Started {formatDate(processingDiagnostics?.startedAt ?? "")}</span>
								{#if processingDiagnostics?.completedAt}
									<span>Completed {formatDate(processingDiagnostics?.completedAt)}</span>
								{/if}
								<span>{diagnosticWarnings.length} warning{diagnosticWarnings.length !== 1 ? 's' : ''}</span>
							</div>
							<div class="diagnostics-grid">
								{#each diagnosticStages as [stage, record]}
									<div class="diagnostic-card">
										<div class="diagnostic-card-head">
											<span class="diagnostic-stage">{stage.replace(/_/g, ' ')}</span>
											<span class={`diagnostic-badge ${statusTone(record.status)}`}>{record.status}</span>
										</div>
										{#if record.detail}
											<p class="diagnostic-detail">{record.detail}</p>
										{/if}
									</div>
								{/each}
							</div>
							{#if diagnosticWarnings.length > 0}
								<div class="diagnostic-warning-list">
									{#each diagnosticWarnings as warning}
										<div class="diagnostic-warning-item">
											<strong>{warning.stage.replace(/_/g, ' ')}</strong>
											<span>{warning.detail}</span>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}

					<!-- Extracted entities -->
					{#if entities && Array.isArray(entities) && entities.length > 0}
						<div class="section">
							<h3 class="section-title">
								<Icon name="tag" class="w-3.5 h-3.5" />
								Entities
							</h3>
							<div class="entity-list">
								{#each entities.slice(0, 20) as ent}
									<span class="entity-chip">{ent.value ?? ent.text ?? ent}</span>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Tags (editable) -->
						<div class="section">
							<h3 class="section-title">
								<Icon name="hash" class="w-3.5 h-3.5" />
								Tags
								{#if tagsSaving}<span class="saving-indicator">saving…</span>{/if}
							</h3>
							<TagInput bind:tags={tags} onchange={saveTags} placeholder="Add tag (Enter to save)…" />
						</div>

					<!-- Extracted text preview -->
					{#if doc.extractedText ?? doc.extracted_text ?? doc.content}
						<div class="section">
							<h3 class="section-title">
								<Icon name="file-text" class="w-3.5 h-3.5" />
								Extracted Text
							</h3>
							<pre class="text-preview">{(doc.extractedText ?? doc.extracted_text ?? doc.content ?? '').slice(0, 800)}{(doc.extractedText ?? doc.extracted_text ?? doc.content ?? '').length > 800 ? '\n…' : ''}</pre>
						</div>
					{/if}
				{/if}
			</div>

			<!-- Footer -->
			{#if doc && !isLoading}
				<div class="modal-footer">
					<button type="button" class="footer-btn ghost" onclick={close}>
						<Icon name="x" class="w-3.5 h-3.5" />
						Close
					</button>
					<div class="footer-actions">
						{#if previewUrl}
							<a
								href={previewUrl}
								download={doc.fileName ?? doc.file_name ?? true}
								class="footer-btn secondary download"
								onclick={close}
							>
								<Icon name="download" class="w-3.5 h-3.5" />
								Download
							</a>
						{/if}
						{#if canRunDocling}
							<button
								type="button"
								class="footer-btn secondary"
								onclick={openDoclingViewer}
								disabled={doclingLoading}
							>
								<Icon name="file-search" class="w-3.5 h-3.5" />
								{doclingLoading ? 'Loading…' : 'Docling Extract'}
							</button>
						{/if}
						<button
							type="button"
							class="footer-btn secondary"
							class:analysis-queued={analyzeQueued}
							onclick={runAnalysis}
							disabled={analyzeLoading || analyzeQueued}
							title={analyzeQueued ? 'Analysis jobs enqueued — results will appear shortly' : 'Run AI analysis (entity extraction, forensics, summarization)'}
						>
							<Icon name={analyzeQueued ? 'check' : 'sparkles'} class="w-3.5 h-3.5" />
							{analyzeLoading ? 'Queuing…' : analyzeQueued ? 'Analysis Queued' : 'Run Analysis'}
						</button>
						{#if onEdit}
							<button type="button" class="footer-btn primary" onclick={() => { onEdit?.(doc.id); close(); }}>
								<Icon name="pencil" class="w-3.5 h-3.5" />
								Edit
							</button>
						{/if}
					</div>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Image Lightbox -->
{#if lightboxOpen && isImage && previewUrl}
	<div
		class="lightbox-backdrop"
		role="dialog"
		aria-modal="true"
		aria-label="Image viewer"
		onclick={(e) => { if (e.target === e.currentTarget) closeLightbox(); }}
		onkeydown={(e) => { if (e.key === 'Escape') closeLightbox(); if (e.key === '+' || e.key === '=') zoomIn(); if (e.key === '-') zoomOut(); if (e.key === '0') resetZoom(); }}
		tabindex="-1"
	>
		<div class="lightbox-toolbar">
			<button type="button" class="lb-btn" onclick={zoomOut} title="Zoom out (-)">
				<Icon name="zoom-out" class="w-4 h-4" />
			</button>
			<span class="lb-zoom-label">{Math.round(lightboxScale * 100)}%</span>
			<button type="button" class="lb-btn" onclick={zoomIn} title="Zoom in (+)">
				<Icon name="zoom-in" class="w-4 h-4" />
			</button>
			<button type="button" class="lb-btn" onclick={resetZoom} title="Reset (0)">
				<Icon name="maximize-2" class="w-4 h-4" />
			</button>
			<button type="button" class="lb-btn lb-close" onclick={closeLightbox} title="Close (Esc)">
				<Icon name="x" class="w-4 h-4" />
			</button>
		</div>
		<div class="lightbox-img-wrap">
			<img
					src={previewUrl}
				alt={doc?.title ?? 'Evidence'}
				class="lightbox-img"
				style="transform: scale({lightboxScale});"
			/>
		</div>
	</div>
{/if}

<!-- Docling Extraction Viewer -->
<DoclingExtractionViewer
	bind:open={showDoclingViewer}
	evidenceId={evidenceId ?? undefined}
	fileName={fileName}
	fileBase64={doclingFileBase64}
/>
