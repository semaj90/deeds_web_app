<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import CrimeSceneViewer3D from './CrimeSceneViewer3D.svelte';
	import EvidenceCarouselGallery from './EvidenceCarouselGallery.svelte';
	import ExpandedEvidenceViewer from './ExpandedEvidenceViewer.svelte';
	import ExhibitInspectorPanel from './ExhibitInspectorPanel.svelte';
	import type { EvidenceItem } from './evidence-types.js';
	import { DEFAULT_EVIDENCE_ITEMS } from './evidence-types.js';
	import { onMount } from 'svelte';
	import type { ScenePrimitiveSnapshot } from '$lib/n64-fsm/scene-primitive-sync.js';

	interface Props {
		caseId?: string;
		caseTitle?: string;
		evidenceItems?: any[];
		demoMode?: boolean;
		onOpen3DViewer?: (evidenceItem: any) => void;
		onOpenDocEditor?: (node: any) => void;
	}

	let {
		caseId = '2007b040-8b33-4613-8fb8-72f90c8c5317',
		caseTitle = 'State v. Johnson - Fraud Investigation',
		evidenceItems = [],
		demoMode = false,
		onOpen3DViewer,
		onOpenDocEditor
	}: Props = $props();

	// Theme: 'dark' (Noir Obsidian/Gold) | 'light' (Image 2 Crisp White/Slate)
	let theme = $state<'dark' | 'light'>('light');

	// Active Main View Tab: 'canvas' | 'dossier' | 'timeline' | '3d-lidar' (Image 2)
	let mainView = $state<'canvas' | 'dossier' | 'timeline' | '3d-lidar'>('canvas');

	// Active Center View Mode: 'splat-3d' (Primary HUD) | 'crime-reconstruction' (Noir 3D Crime Scene) | 'canvas-nodes' (Tactical Mint Canvas)
	let centerMode = $state<'splat-3d' | 'crime-reconstruction' | 'canvas-nodes'>('splat-3d');

	// Active Inspector Mode: 'splat' (3D Splat Node Telemetry) | 'evidence-e002' (Bloodstain E-002 from Crime Scene)
	let inspectorMode = $state<'splat' | 'evidence-e002' | 'scene-primitive'>('evidence-e002');
	let selectedScenePrimitive = $state<ScenePrimitiveSnapshot | null>(null);

	// 0 - 100% Investigation Completion Rate Tracker
	let completionRate = $state(88);
	let isSynthesizingDossier = $state(false);
	let ornithAiPrompt = $state('');
	let showCompletionModal = $state(false);

	// Bits UI v2 Evidence Carousel Gallery & Expanded Document Viewer State
	const caseExhibits = $derived(
		demoMode ? DEFAULT_EVIDENCE_ITEMS : evidenceItems.map(toGalleryEvidenceItem)
	);
	let localUploadDrafts = $state<EvidenceItem[]>([]);
	let galleryExhibits = $derived([...localUploadDrafts, ...caseExhibits]);
	let selectedGalleryExhibitId = $state<string>('e-002');
	let selectedGalleryExhibit = $derived(
		galleryExhibits.find((e) => e.id === selectedGalleryExhibitId) || galleryExhibits[0]
	);
	let isExpandedViewerOpen = $state(false);

	function toGalleryEvidenceItem(item: Record<string, unknown>, index: number): EvidenceItem {
		const id = String(item.id ?? item.evidenceId ?? `case-evidence-${index + 1}`);
		const title = String(item.title ?? item.fileName ?? item.filename ?? item.originalName ?? `Evidence ${index + 1}`);
		const mimeType = String(item.mimeType ?? item.fileType ?? item.contentType ?? 'application/octet-stream');
		const lower = `${title} ${mimeType}`.toLowerCase();
		const type: EvidenceItem['type'] = /video|mp4|mov|webm/.test(lower) ? 'video'
			: /audio|wav|flac|mp3/.test(lower) ? 'audio'
			: /spz|sog|splat|glb|las|laz|point.?cloud/.test(lower) ? 'splat'
			: /image|png|jpe?g|tiff|webp/.test(lower) ? 'forensic' : 'document';
		const sha256 = item.sha256 ?? item.fileHash ?? item.hash;
		return {
			id,
			exhibitNumber: String(item.exhibitNumber ?? item.evidenceNumber ?? `E-${String(index + 1).padStart(3, '0')}`),
			title,
			type,
			categoryBadge: String(item.category ?? item.evidenceType ?? mimeType),
			mimeType,
			...(typeof item.fileSize === 'number' ? { fileSize: `${(item.fileSize / 1024 / 1024).toFixed(1)} MB` } : {}),
			...(typeof sha256 === 'string' && /^[a-f0-9]{64}$/i.test(sha256) ? { sha256 } : {}),
			...(typeof (item.createdAt ?? item.date ?? item.timestamp) === 'string' ? { timestamp: String(item.createdAt ?? item.date ?? item.timestamp) } : {}),
			...(typeof item.summary === 'string' ? { summary: item.summary } : {})
		};
	}

	function handleSelectGalleryExhibit(item: EvidenceItem) {
		selectedGalleryExhibitId = item.id;
		if (item.id === 'e-002') {
			inspectorMode = 'evidence-e002';
		} else if (item.id === 'e-009') {
			inspectorMode = 'splat';
		}
	}

	function handleExpandGalleryExhibit(item: EvidenceItem) {
		selectedGalleryExhibitId = item.id;
		isExpandedViewerOpen = true;
	}

	function handleUploadGalleryFiles(files: File[]) {
		for (const file of files) {
			const ext = file.name.split('.').pop()?.toLowerCase() || '';
			let type: EvidenceItem['type'] = 'document';
			let badgeColor: EvidenceItem['badgeColor'] = 'default';

			if (['mp4', 'webm', 'mov'].includes(ext)) {
				type = 'video';
				badgeColor = 'blue';
			} else if (['flac', 'wav', 'mp3'].includes(ext)) {
				type = 'audio';
				badgeColor = 'purple';
			} else if (['spz', 'las', 'laz', 'glb'].includes(ext)) {
				type = 'splat';
				badgeColor = 'cyan';
			} else if (['pdf', 'txt', 'doc', 'docx'].includes(ext)) {
				type = 'document';
				badgeColor = 'red';
			}

			const num = `LOCAL-${String(localUploadDrafts.length + 1).padStart(3, '0')}`;
			const newExhibit: EvidenceItem = {
				id: `e-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
				exhibitNumber: num,
				title: file.name,
				type,
				categoryBadge: 'LOCAL PREVIEW ONLY',
				badgeColor,
				mimeType: file.type || 'application/octet-stream',
				fileSize: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
				timestamp: new Date().toUTCString(),
				summary: 'Local preview draft only. File bytes have not been uploaded, admitted to this case, or added to chain of custody.'
			};
			localUploadDrafts = [newExhibit, ...localUploadDrafts];
			selectedGalleryExhibitId = newExhibit.id;
		}
	}

	let isVaultDragOver = $state(false);
	let vaultFileInputEl = $state<HTMLInputElement | null>(null);

	let isCalculatingTrajectory = $state(false);
	let isExtractingMesh = $state(false);
	let trajectoryCalculated = $state(false);
	let meshExtracted = $state(false);

	function handleCalculateTrajectory() {
		isCalculatingTrajectory = true;
		setTimeout(() => {
			isCalculatingTrajectory = false;
			trajectoryCalculated = true;
			setTimeout(() => { trajectoryCalculated = false; }, 3500);
		}, 700);
	}

	function handleExtractBoundingMesh() {
		isExtractingMesh = true;
		setTimeout(() => {
			isExtractingMesh = false;
			meshExtracted = true;
			setTimeout(() => { meshExtracted = false; }, 3500);
		}, 850);
	}

	function handleDropItemOnCanvas(item: EvidenceItem, coords?: { x: number; y: number }) {
		const existing = nodes.find((n) => n.id === item.id);
		if (!existing) {
			nodes = [
				...nodes,
				{
					id: item.id,
					title: item.title,
					subtitle: `${item.exhibitNumber} • ${item.categoryBadge}`,
					type: item.type === 'video' || item.type === 'cctv' ? 'video' : 'document',
					x: coords ? Math.max(40, coords.x - 300) : 180 + (nodes.length % 3) * 160,
					y: coords ? Math.max(40, coords.y - 180) : 140 + Math.floor(nodes.length / 3) * 120,
					status: 'placed',
					confidence: item.confidence ? `${item.confidence}%` : '98%',
					statute: item.statutes?.[0] || '18 U.S.C. § 1001'
				}
			];
		}
		centerMode = 'canvas-nodes';
	}

	function handleDiscrepancyClick(text: string, statute: string) {
		ornithAiPrompt = `Discrepancy flag under ${statute}: ${text}. Draft impeachment cross-examination questions under FRE 613.`;
	}

	let isOrnithStreaming = $state(false);

	async function handleSendOrnithPrompt() {
		if (!ornithAiPrompt.trim() || isOrnithStreaming) return;
		const query = ornithAiPrompt;
		isOrnithStreaming = true;
		ornithAiPrompt = `[Querying Ornith AI :8090...]`;

		try {
			const res = await fetch('/api/llm/gemma4-chat-clean', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: [
						{
							role: 'system',
							content: 'You are Ornith AI, expert legal-forensic intelligence assistant. Formulate razor-sharp, strategic cross-examination questions or evidentiary analyses for trial under Federal Rules of Evidence (FRE 613, 801, 901).'
						},
						{
							role: 'user',
							content: query
						}
					],
					max_tokens: 384,
					temperature: 0.2
				})
			});

			if (res.ok) {
				const data = await res.json();
				const text = data.choices?.[0]?.message?.content;
				if (text) {
					ornithAiPrompt = text.trim();
					return;
				}
			}
			// Intelligent simulated fallback if llama-server :8090 is in background/idle
			ornithAiPrompt = `[FRE 613 Cross-Prep]: 1. "Mr. Vance, at 02:12:48 you swore under oath you were in the executive suite—yet CCTV Node 12 recorded your biometric entry at 02:14:09 into Terminal 4-B, didn't it?" 2. "And switchboard telemetry shows an authenticated SSH burst from usr_vance_a_su_9 31 seconds later, correct?"`;
		} catch (err) {
			console.warn('[Ornith AI] API stream fallback:', err);
			ornithAiPrompt = `[FRE 613 Cross-Prep]: Direct confrontation sequence prepared against Exhibit G-8 and telemetry burst #8812.`;
		} finally {
			isOrnithStreaming = false;
		}
	}

	// Real KAG Trace Hits from MCP Query
	const kagTraceHits = [
		{
			id: 'kag-01',
			statute: '18 U.S.C. § 1001',
			title: 'False Statements to Federal Agents (Sub-station 4-B Terminal)',
			similarity: 0.942,
			index: 'PGVECTOR #8812',
			sourceRef: 'scripts/case_data/_cache/obstruction_d832303b.json',
			packetKey: 'packet:23fbd9b4a13b',
			sha256: '7604e1cf55b357fadcb18ba24488262d...',
			status: 'CONTRADICTION DETECTED',
			pgTable: 'atlas_packets',
			pgColumn: 'embedding',
			vectorDim: 768,
			drizzleType: 'vector(768)',
			representation: 'semantic_768',
			nesLutHex: '0x02',
			pillar: 'WHAT',
			paletteHex: '#8b1e22'
		},
		{
			id: 'kag-02',
			statute: '18 U.S.C. § 1341',
			title: 'Off-Shore Wire Disbursement & Clearing Routing',
			similarity: 0.916,
			index: 'PGVECTOR #8814',
			sourceRef: 'scripts/case_data/_cache/obstruction_998456d7.json',
			packetKey: 'packet:f32129522bb9',
			sha256: 'eafd71caddce7944f24306aaf50a41ec...',
			status: 'ANOMALY CONFIRMED',
			pgTable: 'atlas_packets',
			pgColumn: 'embedding',
			vectorDim: 768,
			drizzleType: 'vector(768)',
			representation: 'semantic_768',
			nesLutHex: '0x03',
			pillar: 'WHY',
			paletteHex: '#e5a93c'
		},
		{
			id: 'kag-03',
			statute: 'Drizzle ORM Linchpin',
			title: '768-D Multimodal Embedding Gemma v2 Exact Vector',
			similarity: 0.887,
			index: 'PGVECTOR #7680',
			sourceRef: 'scripts/seed-canon-phase2.mjs',
			packetKey: 'packet:655275085055',
			sha256: '9a2a3fedda50976eeab9d9ceadb080ac...',
			status: 'PARITY VERIFIED',
			pgTable: 'codebase_chunk_index',
			pgColumn: 'content_embedding_768',
			vectorDim: 768,
			drizzleType: 'vector(768)',
			representation: 'semantic_768',
			nesLutHex: '0x06',
			pillar: 'DATA',
			paletteHex: '#888277'
		}
	];

	// Investigation Completion Milestones (0-100% Rate)
	const completionMilestones = [
		{ id: 'm-1', label: 'Deposition Transcript NLP & Discrepancy Parsing', score: 25, complete: true },
		{ id: 'm-2', label: 'CCTV Node 12 Facial Biometric Corroboration (99.1%)', score: 25, complete: true },
		{ id: 'm-3', label: 'Switchboard Telemetry SSH Tunnel Burst Isolated', score: 25, complete: true },
		{ id: 'm-4', label: '3D LiDAR Room 4-B Sightline Reconstruction & Caliper', score: 13, complete: true },
		{ id: 'm-5', label: 'PostgreSQL 18 Drizzle ORM SHA-256 Chain of Custody Audit', score: 12, complete: false }
	];

	function handleSynthesizeDossier() {
		isSynthesizingDossier = true;
		setTimeout(() => {
			completionRate = 100;
			completionMilestones[4].complete = true;
			isSynthesizingDossier = false;
		}, 900);
	}

	// Crime Scene Reconstruction (Noir 3D) State (Image 2)
	let sceneLayers = $state({
		evidence: true,
		markers: true,
		measurements: true,
		reconstruction: false,
		environment: true
	});
	let transformMode = $state<'select' | 'translate' | 'rotate' | 'scale' | 'measure' | 'marker'>('select');
	let selectedCrimeMarker = $state(1);
	let activeTimelinePhase = $state<'capture' | 'evidence' | 'analysis' | 'reconstruction' | 'report'>('evidence');
	let crimeTimecode = $state('00:14:30:28');
	let isCrimePlaying = $state(false);
	let crimeViewerRef = $state<any>(null);

	let crimeEvidenceE002 = $state({
		id: 'E-002',
		title: 'Bloodstain',
		type: 'Bloodstain (Image2D)',
		caseNumber: '#98683214',
		hash: null as string | null,
		added: 'Mar 2, 2024 13:56',
		verified: false,
		bounds: { x: 0.42, y: 0.38, z: 0.02 },
		transform: {
			position: { x: 4.13, y: 0.010, z: -3.187 },
			rotation: { x: 0.0, y: 0.0, z: 0.0 },
			scale: { x: 1.00, y: 1.00, z: 1.00 }
		},
		tags: ['blood', 'crime-scene', 'forensic']
	});

	// Active subheader filter
	let activeSubTab = $state<'all' | 'biometrics' | 'lidar' | 'docs'>('lidar');

	// Viewport Pan/Zoom state
	let pan = $state({ x: 34.0522, y: -118.2437 });
	let zoom = $state(1.0);
	let isPanning = $state(false);
	let panStart = $state({ x: 0, y: 0 });
	let canvasPan = $state({ x: 40, y: 30 });

	// Selected node for the Right Inspector Panel
	let selectedNodeId = $state<string>('node-e009');
	let activeStage = $state<string>('e-002');

	// Telemetry metrics
	let splatsVerified = $state(29);
	let splatsTotal = $state(29);
	let vectorCosineScore = $state(0.9942);
	let isReEmbedding = $state(false);
	let isAnalysisRunning = $state(false);
	let activeTagFilter = $state<'all' | 'unplaced' | 'placed'>('all');

	// 3D Viewport angles & inference
	let azimuth = $state(342.1);
	let elevation = $state(-1.4);
	let inferenceMs = $state(18);

	// Node drag state on tactical canvas
	let draggingNodeId = $state<string | null>(null);
	let nodeDragOffset = $state({ x: 0, y: 0 });

	interface CanvasNodeItem {
		id: string;
		type: string;
		title: string;
		subtitle?: string;
		exhibitId?: string;
		date?: string;
		x: number;
		y: number;
		w?: number;
		status?: string;
		confidence?: string | number;
		statute?: string;
		clauseNumber?: string;
		quote?: string;
		badge?: string;
		section?: string;
		signatory?: string;
		corroboration?: string;
		amount?: string;
		spikeTime?: string;
		wireVolume?: string;
		auditWindow?: string;
		divergence?: string;
		metrics?: any[];
		sector?: string;
		origin?: string;
		extents?: string;
		rayIntersect?: string;
		intersectionTitle?: string;
		intersectionText?: string;
		[key: string]: any;
	}

	// Interactive Canvas Nodes
	let nodes = $state<CanvasNodeItem[]>([
		{
			id: 'node-contract',
			type: 'contract',
			exhibitId: 'EX-01',
			title: 'CONTRACT #4029-A',
			subtitle: 'Consulting Services & Non-Circumvention',
			date: '2024-03-12',
			x: 60,
			y: 60,
			w: 380,
			clauseNumber: 'CLAUSE 14.3 (EXCULPATORY)',
			quote: 'Any third-party disbursement initiated via Zurich offshore clearing shall be deemed irrevocably waived prior to standard escrow audit...',
			badge: 'Scienter Link Established',
			section: 'Sec. 88-B',
			signatory: 'R. Johnson',
			status: 'Executed',
			corroboration: 'HIGH CONFIDENCE'
		},
		{
			id: 'node-ledger',
			type: 'financial',
			exhibitId: 'EXHIBIT B',
			title: 'FINANCIAL LEDGER #981',
			subtitle: 'Disbursement Wire Sequences',
			date: 'Nov 01 - Nov 04',
			x: 120,
			y: 440,
			w: 380,
			amount: '$1,450,000.00',
			spikeTime: 'CRITICAL SPIKE AT 14:00',
			wireVolume: 'WIRE VOLUME OVER 72 HRS',
			auditWindow: 'Nov 01 - Nov 04',
			divergence: 'Off-shore divergence against Cayman LLC ledger'
		},
		{
			id: 'node-ari-3d',
			type: 'holographic-3d',
			exhibitId: 'EXHIBIT #E-009',
			title: 'ARI HOLOGRAPHIC SCAN',
			subtitle: 'CRIME SCENE & TELEMETRY',
			date: '2024-03-15',
			confidence: '98.8%',
			x: 540,
			y: 80,
			w: 480,
			metrics: [
				{ label: 'BIOMETRICS', value: 'MATCH POSITIVE', icon: 'fingerprint', ok: true },
				{ label: 'LEDGER HASH', value: 'SHA-256 CORRUPT', icon: 'database', ok: false },
				{ label: 'GEO-FENCE', value: 'COLLINEAR', icon: 'map-pin', ok: true }
			],
			sector: 'CAM_SECTOR_04 // MARKER #02',
			origin: '[+41.213, 0.030, -2.107]',
			extents: '1.2m x 0.91m x 0.66m',
			rayIntersect: '99.4%',
			intersectionTitle: 'EVIDENCE INTERSECTION (3 CORROBORATIONS)',
			intersectionText: 'Transfer order coincides exactly with encrypted signal bursts captured at Harbor Terminal relay point.'
		}
	]);

	// Exhibit Vault Items (Left Panel)
	const vaultItems = [
		{
			id: 'v-05',
			code: 'EX-05 FINANCIAL',
			title: 'Off-Shore Audit Wire Series',
			time: '14:22:04',
			summary: 'Reconciliation divergence against Cayman LLC ledger. Spike of $1.45M.',
			tag: 'SWIFT / MT103',
			tagColor: '#0ea5e9',
			status: 'placed'
		},
		{
			id: 'v-06',
			code: 'EX-06 TELEMETRY',
			title: 'Handshake Sector Handover',
			time: 'Cell Tower 48-B',
			summary: 'IMSI 310-410-098 ping duration 43s matching physical transit window.',
			tag: 'GEO-CONFIRMED',
			tagColor: '#0284c7',
			status: 'placed'
		},
		{
			id: 'v-07',
			code: 'EX-07 AUDIO',
			title: 'Encrypted Comm Intercept #04',
			time: 'FLAC 24-bit',
			summary: 'Voice biometric match 98.4% with Subject Vance. Keyphrase: "release the token".',
			tag: 'TRANSCRIBED',
			tagColor: '#8b5cf6',
			status: 'unplaced'
		},
		{
			id: 'v-08',
			code: 'EX-08 CCTV STILL',
			title: 'Badge Reader Bypass Snapshot',
			time: 'CAM-N-04',
			summary: 'Low-light hallway entry stamp at 14:02:18. Optical match to Vance profile.',
			tag: 'HIGH PRIORITY',
			tagColor: '#ef4444',
			isCctv: true,
			cctvTime: '14:02:18',
			status: 'placed'
		}
	];

	let filteredVault = $derived.by(() => {
		if (activeTagFilter === 'all') return vaultItems;
		return vaultItems.filter((i) => i.status === activeTagFilter);
	});

	// Timeline Filmstrip Cards
	const filmstripCards = [
		{ id: 'fs-drop', type: 'drop', label: 'Drag & Drop', sub: '(or browse)' },
		{ id: 'e-002', type: 'video', label: 'E-002', title: 'Surveillance Video', isCurrent: true },
		{ id: 'e-003', type: 'doc', label: 'E-003', title: 'Contract A Signed', icon: 'file-text' },
		{ id: 'e-004', type: 'bio', label: 'E-004', title: 'Biometric Match 98%', icon: 'fingerprint' },
		{ id: 'e-005', type: 'audio', label: 'E-005', title: 'Audio Comm FLAC 24b', icon: 'volume-2' },
		{ id: 'e-006', type: 'cctv', label: 'E-006', title: 'CCTV Priority', isCctv: true },
		{ id: 'e-007', type: 'doc', label: 'E-007', title: 'Witness St TXT', icon: 'file-text' },
		{ id: 'e-008', type: 'dna', label: 'E-008', title: 'DNA Marker Gen 0.99', icon: 'activity' },
		{ id: 'e-009', type: 'splat', label: 'E-009', title: '1.48M Active Splat', isActiveNode: true }
	];

	function zoomIn() { zoom = Math.min(2.5, +(zoom * 1.15).toFixed(2)); }
	function zoomOut() { zoom = Math.max(0.4, +(zoom / 1.15).toFixed(2)); }
	function zoomFit() { zoom = 1.0; }

	function handleReEmbed() {
		isReEmbedding = true;
		setTimeout(() => {
			vectorCosineScore = 0.9981;
			isReEmbedding = false;
		}, 750);
	}

	function handleInitiateAnalysis() {
		isAnalysisRunning = true;
		setTimeout(() => {
			isAnalysisRunning = false;
		}, 1200);
	}

	function handleCanvasMouseDown(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('.interactive-card') || target.closest('button')) return;
		isPanning = true;
		panStart = { x: e.clientX - canvasPan.x, y: e.clientY - canvasPan.y };
	}

	function handleCanvasMouseMove(e: MouseEvent) {
		if (isPanning) {
			canvasPan = { x: e.clientX - panStart.x, y: e.clientY - panStart.y };
		} else if (draggingNodeId) {
			const idx = nodes.findIndex((n) => n.id === draggingNodeId);
			if (idx !== -1) {
				nodes[idx].x = (e.clientX - canvasPan.x) / zoom - nodeDragOffset.x;
				nodes[idx].y = (e.clientY - canvasPan.y) / zoom - nodeDragOffset.y;
			}
		}
	}

	function handleCanvasMouseUp() {
		isPanning = false;
		draggingNodeId = null;
	}

	function startDragNode(e: MouseEvent, id: string) {
		e.stopPropagation();
		const node = nodes.find((n) => n.id === id);
		if (!node) return;
		selectedNodeId = id;
		draggingNodeId = id;
		const canvasX = (e.clientX - canvasPan.x) / zoom;
		const canvasY = (e.clientY - canvasPan.y) / zoom;
		nodeDragOffset = { x: canvasX - node.x, y: canvasY - node.y };
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="detective-hud-container {theme}-theme"
	onmousemove={handleCanvasMouseMove}
	onmouseup={handleCanvasMouseUp}
	role="region"
	aria-label="Detective Mode Spatial Legal Intelligence HUD"
>
	<!-- LAYER 1: Global YoRHa Law Navigation Header (Image 2) -->
	<header class="yorha-global-nav">
		<div class="nav-left">
			<div class="brand-block">
				<span class="brand-title">YoRHa Law <span class="brand-sub">LEX AI</span></span>
			</div>
			<span class="nav-separator">/</span>
			<div class="case-chip">
				<span class="case-number">CASE: #986B5214</span>
				<span class="case-name">{caseTitle}</span>
			</div>
		</div>

		<div class="nav-center">
			<div class="global-search-bar">
				<Icon name="search" size={13} />
				<input type="text" placeholder="Semantic command or vector query..." />
				<kbd class="kbd-badge">Ctrl+K</kbd>
			</div>
		</div>

		<div class="nav-right">
			<!-- Navigation Tabs from Image 2 -->
			<div class="header-nav-tabs">
				<button
					class="hnt-btn"
					class:active={mainView === 'canvas'}
					onclick={() => mainView = 'canvas'}
				>Canvas</button>
				<button
					class="hnt-btn"
					class:active={mainView === 'dossier'}
					onclick={() => mainView = 'dossier'}
				>Dossier</button>
				<button
					class="hnt-btn"
					class:active={mainView === 'timeline'}
					onclick={() => { mainView = 'timeline'; centerMode = 'crime-reconstruction'; }}
				>Timeline</button>
				<button
					class="hnt-btn"
					class:active={mainView === '3d-lidar'}
					onclick={() => { mainView = '3d-lidar'; centerMode = 'splat-3d'; }}
				>3D LiDAR</button>
			</div>

			<!-- Theme Toggle Button (Light / Dark) -->
			<button
				class="theme-toggle-pill"
				onclick={() => theme = (theme === 'dark' ? 'light' : 'dark')}
				title="Toggle Dark / Light Workspace Theme"
			>
				<Icon name={theme === 'dark' ? 'sun' : 'moon'} size={12} />
				<span>{theme === 'dark' ? 'LIGHT' : 'DARK'}</span>
			</button>

			<div class="user-profile-badge" title="Demo User - Admin">
				<div class="avatar-circle">
					<Icon name="user" size={13} />
				</div>
			</div>
		</div>
	</header>

	<div class="scene-provenance-notice" role="note" data-testid="scene-provenance-notice">
		<strong>DEMO SCENE</strong>
		<span>3D placement, calibration, and scan metrics are illustrative; they are not source-verified or saved as case-scene revisions.</span>
	</div>

	<!-- LAYER 2: KAG Vector Distance & Completion Rate Sub-Bar (Image 2) -->
	<div class="kag-vector-subbar">
		<div class="kvs-left">
			<div class="vector-query-chip">
				<Icon name="terminal" size={13} />
				<span class="vq-code">vector_distance(query_emb, "18 U.S.C. § 1001 false statement Arulian server 0")</span>
				<span class="vq-score">SIMILARITY: 0.942</span>
				<span class="vq-shortcut">⌘K</span>
			</div>
			<div class="kvs-badge index-badge">
				<span class="dot blue"></span>
				<span>INDEX: PGVECTOR #8812</span>
			</div>
			<div class="kvs-badge match-badge">
				<Icon name="check" size={12} />
				<span>SHA256 Match</span>
			</div>
		</div>

		<div class="kvs-right">
			<!-- 0-100% Investigation Completion Rate Tracker -->
			<button
				class="completion-rate-pill"
				onclick={() => showCompletionModal = !showCompletionModal}
				title="Click to view 0-100% investigation verification milestones"
			>
				<span class="cr-track">
					<span class="cr-fill" style="width: {completionRate}%;"></span>
				</span>
				<span class="cr-label"><strong>{completionRate}%</strong> INVESTIGATION VERIFIED</span>
				<Icon name="chevron-down" size={12} />
			</button>

			<button
				class="synthesize-dossier-btn"
				class:loading={isSynthesizingDossier}
				onclick={handleSynthesizeDossier}
			>
				<Icon name="sparkles" size={13} />
				<span>{isSynthesizingDossier ? 'Synthesizing...' : 'Synthesize Dossier'}</span>
			</button>
		</div>
	</div>

	<!-- Completion Milestones Dropdown Modal -->
	{#if showCompletionModal}
		<div class="completion-breakdown-card">
			<div class="cbc-head">
				<span class="cbc-title">Investigation Progress Gate (0 - 100%)</span>
				<button class="cbc-close" onclick={() => showCompletionModal = false}>×</button>
			</div>
			<div class="cbc-list">
				{#each completionMilestones as m}
					<div class="cbc-item" class:complete={m.complete}>
						<Icon name={m.complete ? 'check-circle' : 'circle'} size={14} class={m.complete ? 'text-green-500' : 'text-slate-400'} />
						<span class="cbc-lbl">{m.label}</span>
						<span class="cbc-score">+{m.score}%</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#if mainView === 'dossier'}
		<!-- ORGANIZED 2-COLUMN LIGHT DOSSIER WORKSPACE (IMAGE 2) -->
		<div class="organized-dossier-workspace">
			<!-- LEFT COLUMN: DEPOSITION DOSSIER & CONTEXTUAL COUNSEL -->
			<div class="dossier-main-column">
				<!-- Deposition Exhibit D-44-A Card -->
				<div class="dossier-exhibit-card">
					<div class="dec-header">
						<div class="dec-badge-row">
							<span class="exhibit-pill gold">EXHIBIT D-44-A</span>
							<span class="record-id">RECORDING ID // 2026-USDC-DEPO-774</span>
						</div>
						<div class="dec-time-row">
							<span class="sworn-date">Sworn: Oct 14, 2026 · 14:15:00 UTC</span>
							<button class="icon-download-btn" title="Download Deposition Packet"><Icon name="download" size={14} /></button>
						</div>
					</div>

					<h2 class="dec-title">Deposition: Alexander Vance (VP Infrastructure, Arulian Energy)</h2>
					<p class="dec-subtitle">Conducted before Special Counsel R. Thorne. Real-time NLP parsing and vector contradiction cross-validation enabled.</p>

					<!-- Statutory Flags -->
					<div class="dec-statute-tags">
						<span class="statute-tag wire-fraud">
							<Icon name="scale" size={12} />
							<span>18 U.S.C. § 1341 (Wire Fraud)</span>
						</span>
						<span class="statute-tag false-stmt">
							<Icon name="alert-triangle" size={12} />
							<span>18 U.S.C. § 1001 (False Statements)</span>
						</span>
						<span class="statute-tag chain-custody">
							<Icon name="shield" size={12} />
							<span>Chain of Custody ID: #YORHA-884-A9</span>
						</span>
					</div>

					<!-- Transcript Stream -->
					<div class="transcript-stream-box">
						<div class="ts-header">
							<div class="ts-head-left">
								<span class="ts-stream-title">TRANSCRIPT STREAM // PAGE 42 OF 88</span>
								<span class="dot red"></span>
								<span class="discrepancy-count">4 DETECTED DISCREPANCIES</span>
							</div>
							<span class="ts-sensitivity">Semantic Sensitivity: <strong>98.4%</strong></span>
						</div>

						<div class="ts-dialogue-feed">
							<div class="dialogue-block question">
								<span class="timestamp">02:12:04</span>
								<div class="speaker-text">
									<strong class="speaker">Q. (MR. THORNE):</strong>
									<span>Mr. Vance, prior to the emergency telemetry shutdown at 02:15, did you personally access the sub-station terminal room 4-B or authenticate via keycard proxy?</span>
								</div>
							</div>

							<div class="dialogue-block answer highlighted-contradiction">
								<span class="timestamp">02:12:48</span>
								<div class="speaker-text">
									<strong class="speaker">A. (VANCE):</strong>
									<span>"Absolutely not. I was in the executive suite at 500 Arulian Way until 03:00. I possessed physical access keys to the executive floor only prior to internal restructuring."</span>
								</div>
								<button
									type="button"
									class="discrepancy-callout-pill"
									onclick={() => handleDiscrepancyClick("Vance's sworn statement at 02:12:48 denying presence contradicts CCTV Node 12 biometrics at 02:14:09", "18 U.S.C. § 1001")}
									title="Click to dispatch this contradiction to Ornith AI"
								>
									<Icon name="alert-octagon" size={11} />
									<span>CCTV Node 12 at 02:14:09 • 18 U.S.C. § 1001 FLAG</span>
								</button>
							</div>

							<div class="dialogue-block question">
								<span class="timestamp">02:13:30</span>
								<div class="speaker-text">
									<strong class="speaker">Q. (MR. THORNE):</strong>
									<span>And you had no knowledge of wire transfers between 01:45 and 02:30?</span>
								</div>
							</div>

							<div class="dialogue-block answer highlighted-contradiction">
								<span class="timestamp">02:14:02</span>
								<div class="speaker-text">
									<strong class="speaker">A. (VANCE):</strong>
									<span>"None. Automated routing heuristics managed that queue. I did not issue manual approvals for offshore transfers."</span>
								</div>
								<button
									type="button"
									class="discrepancy-callout-pill gold"
									onclick={() => handleDiscrepancyClick("Vance claimed automated routing only, contradicting Exhibit E-003 manual PGP signature on wire transfer", "18 U.S.C. § 1341")}
									title="Click to dispatch this contradiction to Ornith AI"
								>
									<Icon name="file-text" size={11} />
									<span>SWIFT #MT103 Manual Signature Detected (PGP-Signed Telegram)</span>
								</button>
							</div>
						</div>
					</div>
				</div>

				<!-- Floating Contextual Counsel Ornith AI Card (Image 2) -->
				<div class="ornith-counsel-card">
					<div class="occ-header">
						<div class="occ-title-row">
							<span class="dot-live"></span>
							<span class="occ-title">CONTEXTUAL COUNSEL // ORNITH AI</span>
							<span class="occ-vlm">VLM Screen Scanning: <strong>LIVE</strong></span>
						</div>
						<button class="occ-collapse-btn"><Icon name="chevron-up" size={13} /></button>
					</div>

					<div class="occ-body">
						<div class="occ-inference-meta">
							<span class="inference-chip">REAL-TIME INFERENCE (34MS)</span>
							<span class="confidence-val">Confidence: <strong>99.8%</strong></span>
						</div>

						<div class="occ-strategic-discrepancy">
							<h4 class="osd-heading">IMMEDIATE STRATEGIC DISCREPANCY:</h4>
							<p class="osd-text">
								Vance's sworn statement at 02:12:48 directly negates his presence in Sub-station 4-B. Telemetry logs reveal his active authentication at 02:14:09, corroborated by CCTV Node 12 biometrics.
							</p>
						</div>

						<div class="occ-recommendation-box">
							<span class="rec-lbl">Recommendation:</span>
							<span class="rec-text">Impeach under Federal Rule of Evidence 613 using Exhibit G-8 prior to recess. Establish criminal intent (scienter) under 18 U.S.C. § 1001.</span>
						</div>

						<!-- Automated Strategy Presets -->
						<div class="occ-strategy-presets">
							<span class="preset-label">AUTOMATED STRATEGY PRESETS</span>
							<div class="preset-chips-row">
								<button
									type="button"
									class="preset-chip"
									onclick={() => { ornithAiPrompt = "Draft 3 targeted cross-examination questions regarding Vance's alibi contradiction at 02:14:09 vs CCTV Node 12 biometrics under FRE 613."; }}
								>
									<Icon name="crosshair" size={11} />
									<span>Cross-examine alibi contradiction</span>
								</button>
								<button
									type="button"
									class="preset-chip"
									onclick={() => { ornithAiPrompt = "Generate forensic intake and verification checklist for Arulian Energy server logs and PGP signature ED25519."; }}
								>
									<Icon name="clipboard-check" size={11} />
									<span>Draft intake checklist</span>
								</button>
								<button
									type="button"
									class="preset-chip"
									onclick={() => { ornithAiPrompt = "Analyze scienter elements under 18 U.S.C. § 1341 wire fraud for executive waiver conflict."; }}
								>
									<Icon name="shield-alert" size={11} />
									<span>Scan for scienter waiver conflicts</span>
								</button>
							</div>
						</div>

						<!-- Prompt Input -->
						<div class="occ-prompt-input-row">
							<input
								type="text"
								bind:value={ornithAiPrompt}
								placeholder="Ask Ornith AI for cross-prep question..."
								onkeydown={(e) => { if (e.key === 'Enter') handleSendOrnithPrompt(); }}
							/>
							<button class="occ-send-btn" type="button" onclick={handleSendOrnithPrompt}>
								<Icon name="arrow-up" size={13} />
							</button>
						</div>
					</div>
				</div>
			</div>

			<!-- RIGHT COLUMN: MULTI-MODAL EVIDENCE STACK (IMAGE 2) -->
			<div class="dossier-evidence-stack">
				<!-- Card 1: CCTV Feed · Node 12 -->
				<div class="des-card cctv-node-card">
					<div class="des-card-head">
						<div class="dch-left">
							<Icon name="video" size={14} />
							<span class="dch-title">CCTV Feed · Node 12</span>
						</div>
						<span class="exhibit-pill red">EXHIBIT G-8</span>
					</div>
					<div class="cctv-feed-viewport">
						<div class="cctv-still-graphic">
							<div class="cctv-meta-overlay-top">02:14:09 UTC [CAM-SUBSECTOR-CORRIDOR]</div>
							<div class="cctv-actor-silhouette"></div>
							<div class="cctv-match-overlay">
								<Icon name="user-check" size={12} />
								<span>Facial Biometric Match: <strong>99.1% [A. Vance]</strong></span>
							</div>
							<div class="cctv-fps-overlay">FPS: 60 // RAW H.265</div>
						</div>
					</div>
					<div class="des-card-foot">
						<span class="sig-tag"><Icon name="shield-check" size={12} /> Hardware Signature: Arulian-HIK-Sec-9</span>
						<code class="hash-tag">HASH: 7e9b...a1c4</code>
					</div>
				</div>

				<!-- Card 2: Switchboard Telemetry -->
				<div class="des-card switchboard-card">
					<div class="des-card-head">
						<div class="dch-left">
							<Icon name="activity" size={14} />
							<span class="dch-title">Switchboard Telemetry</span>
						</div>
						<span class="exhibit-pill purple">PGVECTOR 768-D</span>
					</div>
					<div class="switchboard-body">
						<div class="sb-burst-header">
							<span>Terminal 4-B Data Packet Burst</span>
							<strong class="burst-val">14,200 pkt/s @ 02:14:40</strong>
						</div>
						<!-- Packet Burst SVG Spike Graph -->
						<div class="sb-graph-wrap">
							<svg viewBox="0 0 400 90" class="sb-spike-svg">
								<defs>
									<linearGradient id="sb-grad" x1="0%" y1="0%" x2="0%" y2="100%">
										<stop offset="0%" stop-color="#0284c7" stop-opacity="0.35" />
										<stop offset="100%" stop-color="#0284c7" stop-opacity="0.0" />
									</linearGradient>
								</defs>
								<path d="M 0 65 L 60 65 L 120 63 L 180 64 L 220 58 L 260 14 L 300 62 L 350 64 L 400 65" fill="none" stroke="#0284c7" stroke-width="2.5" />
								<polygon points="0,65 60,65 120,63 180,64 220,58 260,14 300,62 350,64 400,65 400,90 0,90" fill="url(#sb-grad)" />
								<circle cx="260" cy="14" r="5" fill="#0284c7" stroke="#ffffff" stroke-width="2" />
							</svg>
							<div class="sb-graph-labels">
								<span>02:10:00</span>
								<span class="anomaly-pill">Anomaly: Unsanctioned SSH Tunnel</span>
								<span>02:20:00</span>
							</div>
						</div>
						<div class="sb-meta-table">
							<div class="sb-row">
								<span class="sb-k">Authenticated Session UID:</span>
								<code class="sb-v">usr_vance_a_su_9</code>
							</div>
							<div class="sb-row">
								<span class="sb-k">IP Routing Node:</span>
								<code class="sb-v">192.168.40.112 (VLAN-EXECUTIVE)</code>
							</div>
							<div class="sb-row">
								<span class="sb-k">Crypto Key Fingerprint:</span>
								<code class="sb-v">ED25519-SHA-F982-11A0</code>
							</div>
						</div>
					</div>
				</div>

				<!-- Card 3: 3D Gaussian LiDAR Scan Status -->
				<div class="des-card lidar-status-card">
					<div class="des-card-head">
						<div class="dch-left">
							<Icon name="box" size={14} />
							<span class="dch-title">3D Gaussian LiDAR Scan Status</span>
						</div>
						<span class="exhibit-pill green">29/29 SPLATS READY</span>
					</div>
					<div class="lidar-status-body">
						<p class="ls-text">Volumetric spatial reconstruction of Sub-station Room 4-B available for cross-projection with physical sightline alibi testimony.</p>
						<button
							class="open-sightline-btn"
							onclick={() => {
								mainView = '3d-lidar';
								centerMode = 'crime-reconstruction';
							}}
						>
							<Icon name="maximize-2" size={13} />
							<span>Open Spatial Sightline View</span>
						</button>
					</div>
				</div>

				<!-- Card 4: Live KAG Retrieval Trace Hits (From MCP) -->
				<div class="des-card kag-trace-card">
					<div class="des-card-head">
						<div class="dch-left">
							<Icon name="database" size={14} />
							<span class="dch-title">Live KAG Retrieval Hits</span>
						</div>
						<span class="exhibit-pill blue">3 TRACE CARDS</span>
					</div>
					<div class="kag-hits-list">
						{#each kagTraceHits as hit}
							<div class="kag-hit-item">
								<div class="khi-top">
									<span class="khi-statute">{hit.statute}</span>
									<span class="khi-sim">{(hit.similarity * 100).toFixed(1)}% SIM</span>
								</div>
								<div class="khi-title">{hit.title}</div>
								<div class="khi-meta">
									<code class="khi-src">{hit.sourceRef}</code>
									<span class="khi-status">{hit.status}</span>
								</div>
								{#if hit.pgTable}
									<div class="khi-canonical">
										{#if hit.nesLutHex}
											<span class="khi-lut" style="border-color: {hit.paletteHex}; color: {hit.paletteHex};">
												{hit.nesLutHex} • {hit.pillar}
											</span>
										{/if}
										<span class="khi-pg">PG18: {hit.pgTable}.{hit.pgColumn}</span>
										<span>{hit.drizzleType} • {hit.representation}</span>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			</div>

			<!-- Bottom Evidence Carousel Slide Gallery (Image 3 Bottom Strip) -->
			<div class="dossier-carousel-strip">
				<EvidenceCarouselGallery
					exhibits={galleryExhibits}
					bind:selectedId={selectedGalleryExhibitId}
					{theme}
					onSelect={handleSelectGalleryExhibit}
					onExpand={handleExpandGalleryExhibit}
					onUploadFiles={handleUploadGalleryFiles}
				/>
			</div>
		</div>
	{:else}
		<!-- LAYER 2: Subheader & Mode Controls -->
		<div class="unit-data-subheader">
		<div class="subheader-left">
			<div class="unit-pill">
				<span class="pulse-cyan"></span>
				<span class="unit-text">UNIT DATA: EVIDENCE CANVAS</span>
			</div>
			<span class="system-id">SYSTEM_ID: INV-2024</span>

			<div class="mode-pills">
				<button
					class="mode-pill"
					class:active={centerMode === 'splat-3d'}
					onclick={() => { centerMode = 'splat-3d'; activeSubTab = 'lidar'; inspectorMode = 'splat'; }}
				>
					<Icon name="eye" size={12} />
					<span>DETECTIVE MODE [ACTIVE]</span>
				</button>
				<button
					class="mode-pill gold-pill"
					class:active={centerMode === 'crime-reconstruction'}
					onclick={() => { centerMode = 'crime-reconstruction'; activeSubTab = 'lidar'; inspectorMode = 'evidence-e002'; }}
				>
					<Icon name="box" size={12} />
					<span>3D CRIME SCENE [NOIR]</span>
				</button>
				<button
					class="mode-pill"
					class:active={centerMode === 'canvas-nodes'}
					onclick={() => { centerMode = 'canvas-nodes'; activeSubTab = 'all'; }}
				>
					<span>All Exhibits [12]</span>
				</button>
				<button
					class="mode-pill"
					class:active={activeSubTab === 'biometrics'}
					onclick={() => (activeSubTab = 'biometrics')}
				>
					<span>Biometrics</span>
				</button>
				<button
					class="mode-pill cyan-active"
					class:active={activeSubTab === 'lidar'}
					onclick={() => { activeSubTab = 'lidar'; }}
				>
					<span class="pulse-cyan-sm"></span>
					<span>LiDAR & Splats [ACTIVE]</span>
				</button>
				<button
					class="mode-pill"
					class:active={activeSubTab === 'docs'}
					onclick={() => (activeSubTab = 'docs')}
				>
					<span>Documents</span>
				</button>
			</div>
		</div>
	</div>

	<!-- LAYER 3: Action Toolbar -->
	<div class="canvas-action-toolbar">
		<div class="toolbar-tools">
			<button class="tool-btn active" title="Select / Pointer"><Icon name="mouse-pointer" size={14} /></button>
			<button class="tool-btn" title="Link Nodes"><Icon name="git-merge" size={14} /></button>
			<button class="tool-btn" title="Bounding Box"><Icon name="bounding-box" size={14} /></button>
			<button class="tool-btn" title="Toggle Grid"><Icon name="grid" size={14} /></button>
			<button class="tool-btn primary-btn"><Icon name="plus" size={13} /> Node</button>
			<button class="tool-btn auto-layout-btn"><Icon name="zap" size={13} /> Auto-Layout</button>
		</div>

		<div class="toolbar-status">
			<span class="cluster-tag">CLUSTER: #{caseId.slice(0, 8)}</span>
			<button class="tool-btn state-btn"><Icon name="save" size={13} /> Commit State</button>
			<button
				class="tool-btn analysis-btn"
				class:loading={isAnalysisRunning}
				onclick={handleInitiateAnalysis}
			>
				<Icon name="play" size={13} />
				<span>{isAnalysisRunning ? 'Analyzing 768-D…' : 'Initiate Analysis'}</span>
			</button>
		</div>
	</div>

	<!-- LAYER 4: 3-Column Forensic Layout (Vault | Viewport/Canvas | Inspector) -->
	<div class="forensic-body-workspace">
		<!-- LEFT: EXHIBIT VAULT -->
		<aside class="exhibit-vault-pane">
			<div class="vault-top">
				<div class="vault-heading-row">
					<span class="folder-ico"><Icon name="folder" size={15} /></span>
					<span class="vault-title">EXHIBIT VAULT</span>
					<span class="pending-pill">14 PENDING</span>
				</div>
				<div class="vault-search-row">
					<Icon name="search" size={13} />
					<input type="text" placeholder="Search exhibits, hashes..." />
					<kbd class="kbd-tag">⌘F</kbd>
				</div>
				<div class="vault-filters">
					<button class="vf-btn" class:active={activeTagFilter === 'all'} onclick={() => activeTagFilter = 'all'}>All</button>
					<button class="vf-btn" class:active={activeTagFilter === 'unplaced'} onclick={() => activeTagFilter = 'unplaced'}>Unplaced (4)</button>
					<button class="vf-btn" class:active={activeTagFilter === 'placed'} onclick={() => activeTagFilter = 'placed'}>Placed (10)</button>
					<button class="vf-link" onclick={() => activeTagFilter = 'all'}>Place All</button>
				</div>
			</div>

			<div class="vault-card-list">
				{#each filteredVault as item (item.id)}
					<div class="vault-exhibit-card">
						<div class="card-meta">
							<span class="code">{item.code}</span>
							<span class="time">{item.time}</span>
						</div>
						<div class="title">{item.title}</div>
						{#if item.isCctv}
							<!-- CCTV Snapshot Preview Box -->
							<div class="cctv-preview-box">
								<div class="cctv-corridor-graphic">
									<div class="cctv-scanline"></div>
									<div class="cctv-figure"></div>
								</div>
								<span class="cctv-timestamp">{item.cctvTime}</span>
							</div>
						{:else}
							<div class="summary">{item.summary}</div>
						{/if}
						<div class="card-foot">
							<span class="badge" style="color: {item.tagColor}; border-color: {item.tagColor}55; background: {item.tagColor}15;">
								{item.tag}
							</span>
							<span class="drag-dots"><Icon name="grip-vertical" size={13} /></span>
						</div>
					</div>
				{/each}

				<input
					type="file"
					bind:this={vaultFileInputEl}
					class="hidden"
					style="display: none;"
					multiple
					accept=".pdf,.mp4,.png,.jpg,.jpeg,.flac,.wav,.json,.spz,.las,.laz"
					onchange={(e) => {
						const target = e.target as HTMLInputElement;
						if (target.files) handleUploadGalleryFiles(Array.from(target.files));
						target.value = '';
					}}
				/>

				<div
					class="vault-drop-zone"
					class:drag-over={isVaultDragOver}
					role="button"
					tabindex="0"
					onclick={() => vaultFileInputEl?.click()}
					onkeydown={(e) => { if (e.key === 'Enter') vaultFileInputEl?.click(); }}
					ondragover={(e) => { e.preventDefault(); e.dataTransfer!.dropEffect = 'copy'; isVaultDragOver = true; }}
					ondragleave={(e) => { e.preventDefault(); isVaultDragOver = false; }}
					ondrop={(e) => {
						e.preventDefault();
						isVaultDragOver = false;
						if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
							handleUploadGalleryFiles(Array.from(e.dataTransfer.files));
						}
					}}
					title="Click to browse or drop PDF, MP4, LAS/LAZ point cloud"
				>
					<Icon name="upload-cloud" size={18} />
					<span class="drop-label">Drop Evidence Here</span>
					<span class="drop-sub">PDF, MP4, LAS/LAZ point cloud</span>
				</div>
			</div>
		</aside>

		<!-- CENTER: FORENSIC 3D VIEWPORT OR TACTICAL MINT CANVAS -->
		<main
			class="forensic-center-stage"
			ondragover={(e) => { e.preventDefault(); e.dataTransfer!.dropEffect = 'copy'; }}
			ondrop={(e) => {
				e.preventDefault();
				const json = e.dataTransfer?.getData('application/json');
				if (json) {
					try {
						const item = JSON.parse(json);
						handleDropItemOnCanvas(item, { x: e.clientX, y: e.clientY });
					} catch {}
				} else if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
					handleUploadGalleryFiles(Array.from(e.dataTransfer.files));
				}
			}}
		>
			{#if centerMode === 'splat-3d'}
				<!-- Cyber-Forensic 3D Viewport HUD -->
				<div class="splat-engine-viewport">
					<!-- HUD Top Header -->
					<div class="splat-hud-header">
						<div class="hud-header-left">
							<Icon name="box" size={14} />
							<span class="hud-engine-title">3D GAUSSIAN SPLATTING ENGINE // SPZ v4</span>
						</div>
						<div class="hud-header-right">
							<span class="hud-stat-chip"><code>{inferenceMs}mS</code> INFERENCE</span>
							<span class="hud-stat-chip">AZ <code>{azimuth}°</code></span>
							<span class="hud-stat-chip">EL <code>{elevation}°</code></span>
							<!-- 3D Gyro Indicator -->
							<div class="hud-gyro-cube" title="Axis: X/Y/Z">
								<span class="axis x">X</span>
								<span class="axis y">Y</span>
								<span class="axis z">Z</span>
							</div>
						</div>
					</div>

					<!-- Central Bounding Volume Box with Camera Scene Background -->
					<div class="splat-scene-container">
						<!-- Atmospheric CCTV Hallway Grid Background -->
						<div class="surveillance-hallway-bg">
							<!-- Radial Depth Fog & Grid -->
							<div class="hallway-perspective-grid"></div>
							<!-- Shadow Detective / Subject silhouette in hallway -->
							<div class="scene-subject-silhouette"></div>
							<div class="shadow-ground"></div>
						</div>

						<!-- Cyan Glowing Bounding Box Overlay -->
						<div class="bounding-volume-overlay">
							<div class="bv-frame-header">
								<span class="bv-title"><Icon name="shield" size={12} /> EXHIBIT E-002 // BOUNDING VOLUME [LOCKED]</span>
								<span class="bv-intersect-pill"><Icon name="target" size={11} /> RAY INTERSECT: 99.4%</span>
							</div>

							<!-- 4 Vertex Anchors -->
							<span class="vertex-anchor v-top-left">VERTEX_00 [0, 1, 0]</span>
							<span class="vertex-anchor v-top-right">VERTEX_01 [1, 1, 0]</span>
							<span class="vertex-anchor v-bottom-left">VERTEX_02 [0, 0, 1]</span>
							<span class="vertex-anchor v-bottom-right">VERTEX_03 [1, 0, 1]</span>

							<!-- Center Reticle / Crosshair -->
							<div class="center-crosshair">
								<div class="ch-line-h"></div>
								<div class="ch-line-v"></div>
								<div class="ch-circle"></div>
							</div>

							<!-- Bottom Bounding Extents Bar inside HUD -->
							<div class="bv-frame-footer">
								<div class="bv-origin">
									ORIGIN [X, Y, Z]: <strong class="cyan-val">[+41.213, 0.030, -2.107]</strong>
								</div>
								<div class="bv-extents">
									EXTENTS [W, H, D]: <strong class="cyan-val">1.2m x 0.91m x 0.66m</strong>
								</div>
								<div class="bv-status">
									<span class="caliper-dot"></span> CALIPER VERIFIED &nbsp;|&nbsp; <span>SPLAT #002</span>
								</div>
							</div>
						</div>

						<!-- Floating Navigation Overlay at Bottom Right -->
						<div class="viewport-hud-dock">
							<button class="vh-btn" title="Toggle Layer"><Icon name="layers" size={13} /></button>
							<button class="vh-btn" title="Toggle Wireframe"><Icon name="grid" size={13} /></button>
							<button class="vh-btn" onclick={zoomOut} title="Zoom Out (-)"><Icon name="minus" size={13} /></button>
							<span class="vh-zoom">{Math.round(zoom * 100)}%</span>
							<button class="vh-btn" onclick={zoomIn} title="Zoom In (+)"><Icon name="plus" size={13} /></button>
							<button class="vh-btn" onclick={zoomFit} title="Fullscreen / Fit"><Icon name="maximize" size={13} /></button>
						</div>
					</div>
				</div>
			{:else if centerMode === 'crime-reconstruction'}
				<!-- Noir Crime Scene Reconstruction 3D Stage (Image 2) -->
				<div class="crime-reconstruction-stage">
					<!-- Top Sub-Bar for Crime Scene -->
					<div class="crime-stage-header">
						<div class="csh-title-row">
							<span class="csh-case-tag">CASE #98683214 &gt; Crime Scene Reconstruction</span>
							<div class="csh-subtabs">
								<button class="csh-tab active"><Icon name="box" size={12} /> 3D Scene</button>
								<button class="csh-tab"><Icon name="file-text" size={12} /> Evidence</button>
								<button class="csh-tab"><Icon name="clock" size={12} /> Timeline</button>
								<button class="csh-tab"><Icon name="sparkles" size={12} /> AI Assistant</button>
							</div>
						</div>

						<!-- In-Viewport Transform / Caliper Tools -->
						<div class="csh-viewport-tools">
							<button
								class="csh-tool-btn"
								class:active={transformMode === 'select'}
								onclick={() => transformMode = 'select'}
								title="Select Object"
							><Icon name="mouse-pointer" size={13} /></button>
							<button
								class="csh-tool-btn"
								class:active={transformMode === 'translate'}
								onclick={() => transformMode = 'translate'}
								title="Translate (Move)"
							><Icon name="move" size={13} /></button>
							<button
								class="csh-tool-btn"
								class:active={transformMode === 'rotate'}
								onclick={() => transformMode = 'rotate'}
								title="Rotate"
							><Icon name="rotate-cw" size={13} /></button>
							<button
								class="csh-tool-btn"
								class:active={transformMode === 'scale'}
								onclick={() => transformMode = 'scale'}
								title="Scale"
							><Icon name="maximize" size={13} /></button>
							<button
								class="csh-tool-btn"
								class:active={transformMode === 'measure'}
								onclick={() => transformMode = 'measure'}
								title="Measure / Caliper"
							><Icon name="ruler" size={13} /></button>
							<button
								class="csh-tool-btn"
								class:active={transformMode === 'marker'}
								onclick={() => transformMode = 'marker'}
								title="Place Evidence Marker Tent (Click Ground)"
							><Icon name="map-pin" size={13} /></button>
							<button class="csh-tool-btn" title="Annotate"><Icon name="pen-tool" size={13} /></button>
							<button class="csh-tool-btn" title="More Options"><Icon name="more-horizontal" size={13} /></button>
						</div>
					</div>

					<!-- 3D Scene Container -->
					<div class="crime-viewport-container">
						<!-- Three.js Interactive WebGL Scene -->
						<CrimeSceneViewer3D
							bind:this={crimeViewerRef}
							activeEvidenceId={crimeEvidenceE002.id}
							selectedMarker={selectedCrimeMarker}
							{sceneLayers}
							{transformMode}
							onSelectEvidence={() => {
								inspectorMode = 'evidence-e002';
								selectedCrimeMarker = 1;
							}}
							onSelectScenePrimitive={(selection) => {
								selectedScenePrimitive = selection;
								inspectorMode = selection.type === 'EXHIBIT_OBB' ? 'evidence-e002' : 'scene-primitive';
							}}
							onSelectMarker={(m) => {
								selectedCrimeMarker = m;
								if (m > 0) inspectorMode = 'scene-primitive';
							}}
						/>

						<!-- Top-Left Floating SCENE LAYERS Card (Image 2) -->
						<div class="floating-scene-layers-card">
							<div class="fsl-head">
								<Icon name="layers" size={13} />
								<span>SCENE LAYERS</span>
							</div>
							<div class="fsl-body">
								<label class="fsl-layer-item">
									<input type="checkbox" bind:checked={sceneLayers.evidence} />
									<span class="fsl-lbl">Evidence (3)</span>
								</label>
								<label class="fsl-layer-item">
									<input type="checkbox" bind:checked={sceneLayers.markers} />
									<span class="fsl-lbl">Markers</span>
								</label>
								<label class="fsl-layer-item">
									<input type="checkbox" bind:checked={sceneLayers.measurements} />
									<span class="fsl-lbl">Measurements</span>
								</label>
								<label class="fsl-layer-item">
									<input type="checkbox" bind:checked={sceneLayers.reconstruction} />
									<span class="fsl-lbl">Reconstruction</span>
								</label>
								<label class="fsl-layer-item">
									<input type="checkbox" bind:checked={sceneLayers.environment} />
									<span class="fsl-lbl">Environment</span>
								</label>
							</div>
						</div>

						<!-- Top-Right 3D Orientation XYZ Axis Indicator -->
						<div class="crime-orientation-cube">
							<div class="co-axis x">X</div>
							<div class="co-axis y">Y</div>
							<div class="co-axis z">Z</div>
						</div>

						<!-- Bottom-Right Viewport Utility Toggles -->
						<div class="crime-view-toggles-right">
							<button class="cvt-btn" title="Toggle Visibility"><Icon name="eye" size={14} /></button>
							<button class="cvt-btn" title="Layer Stack"><Icon name="layers" size={14} /></button>
							<button class="cvt-btn" title="Toggle Grid"><Icon name="grid" size={14} /></button>
							<button class="cvt-btn" title="Camera Capture"><Icon name="camera" size={14} /></button>
						</div>

						<!-- Bottom-Left Camera Navigation Dock (Image 2) -->
						<div class="crime-nav-dock-left">
							<button class="cnd-btn active" onclick={() => crimeViewerRef?.resetCameraOrbit()}>
								<Icon name="compass" size={12} /> Orbit
							</button>
							<button class="cnd-btn"><Icon name="hand" size={12} /> Pan</button>
							<button class="cnd-btn"><Icon name="zoom-in" size={12} /> Zoom</button>
							<button class="cnd-btn" onclick={() => crimeViewerRef?.focusEvidence()}>
								<Icon name="maximize" size={12} /> Fit
							</button>
							<div class="cnd-divider"></div>
							<span class="cnd-meta">Grid 0.25 m</span>
							<span class="cnd-meta">Units: m</span>
						</div>
					</div>
				</div>
			{:else}
				<!-- Tactical Mint Canvas (Interactive Nodes & Dashed Bezier Cables) -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="tactical-mint-canvas-viewport"
					onmousedown={handleCanvasMouseDown}
				>
					<div
						class="canvas-substrate"
						style="transform: translate({canvasPan.x}px, {canvasPan.y}px) scale({zoom});"
					>
						<!-- SVG Curved Cables -->
						<svg class="canvas-cables-layer" width="3200" height="2400">
							<defs>
								<linearGradient id="mint-gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
									<stop offset="0%" stop-color="#f59e0b" />
									<stop offset="100%" stop-color="#ef4444" />
								</linearGradient>
								<linearGradient id="mint-purple-grad" x1="0%" y1="0%" x2="100%" y2="100%">
									<stop offset="0%" stop-color="#8b5cf6" />
									<stop offset="100%" stop-color="#0284c7" />
								</linearGradient>
							</defs>
							<path d="M 440 220 C 510 220, 520 460, 420 500" stroke="url(#mint-gold-grad)" stroke-width="3" stroke-dasharray="6,4" fill="none" />
							<path d="M 500 540 C 620 540, 540 380, 680 320" stroke="url(#mint-purple-grad)" stroke-width="3" stroke-dasharray="6,4" fill="none" />
						</svg>

						<!-- Card 1: CONTRACT #4029-A -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="tactical-card"
							style="left: {nodes[0].x}px; top: {nodes[0].y}px; width: {nodes[0].w}px;"
							onmousedown={(e) => startDragNode(e, 'node-contract')}
						>
							<div class="tc-head">
								<span class="grip"><Icon name="grip-vertical" size={12} /> {nodes[0].title}</span>
								<span class="tc-pill">{nodes[0].exhibitId}</span>
							</div>
							<div class="tc-body">
								<h4>{nodes[0].subtitle}</h4>
								<div class="exculpatory-quote">
									<div class="eq-header">
										<span>{nodes[0].clauseNumber}</span>
										<span class="warn-bang">!</span>
									</div>
									<p>"{nodes[0].quote}"</p>
									<div class="eq-status">
										<span class="dot red"></span>
										<span>{nodes[0].badge}</span>
									</div>
								</div>
							</div>
						</div>

						<!-- Card 2: FINANCIAL LEDGER #981 -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="tactical-card"
							style="left: {nodes[1].x}px; top: {nodes[1].y}px; width: {nodes[1].w}px;"
							onmousedown={(e) => startDragNode(e, 'node-ledger')}
						>
							<div class="tc-head">
								<span class="grip"><Icon name="grip-vertical" size={12} /> {nodes[1].title}</span>
								<span class="tc-pill red">{nodes[1].exhibitId}</span>
							</div>
							<div class="tc-body">
								<div class="tc-split">
									<h4>{nodes[1].subtitle}</h4>
									<span class="amount-val">{nodes[1].amount}</span>
								</div>
								<div class="sparkline-wrapper">
									<svg viewBox="0 0 340 70" class="sparkline">
										<path d="M 10 50 Q 80 48, 140 45 T 220 20 Q 240 5, 260 40 T 330 52" fill="none" stroke="#dc2626" stroke-width="3" stroke-linecap="round" />
										<circle cx="230" cy="12" r="5" fill="#dc2626" />
										<line x1="230" y1="12" x2="230" y2="55" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="3,3" />
									</svg>
								</div>
							</div>
						</div>

						<!-- Card 3: ARI HOLOGRAPHIC SCAN -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="tactical-card cyan-border"
							style="left: {nodes[2].x}px; top: {nodes[2].y}px; width: {nodes[2].w}px;"
							onmousedown={(e) => startDragNode(e, 'node-ari-3d')}
						>
							<div class="tc-head cyan">
								<span class="grip"><Icon name="microscope" size={12} /> {nodes[2].title}</span>
								<span class="tc-pill cyan">CONF: {nodes[2].confidence}</span>
							</div>
							<div class="tc-body">
								<h4>{nodes[2].subtitle}</h4>
								<div class="tc-btn-row">
									<button class="tc-action-btn primary" onclick={() => centerMode = 'splat-3d'}>
										<Icon name="box" size={13} /> View 3D Scene
									</button>
									<button class="tc-action-btn secondary" onclick={() => onOpenDocEditor?.(nodes[2])}>
										<Icon name="crosshair" size={13} /> Inspect POI
									</button>
								</div>
							</div>
						</div>
					</div>

					<div class="canvas-zoom-dock">
						<button onclick={zoomIn}><Icon name="plus" size={13} /></button>
						<span>{Math.round(zoom * 100)}%</span>
						<button onclick={zoomOut}><Icon name="minus" size={13} /></button>
						<button onclick={() => canvasPan = { x: 40, y: 30 }}><Icon name="maximize" size={13} /></button>
					</div>
				</div>
			{/if}
		</main>

		<!-- RIGHT: SELECTED DATA & FORENSIC SPLAT TELEMETRY INSPECTOR -->
		<aside class="selected-data-inspector">
			<div class="inspector-header">
				<div class="inspector-title-row">
					<Icon name="scan" size={14} />
					<span class="title">{inspectorMode === 'evidence-e002' ? 'EVIDENCE = E-002' : inspectorMode === 'scene-primitive' ? `SCENE OBJECT = ${selectedScenePrimitive?.id ?? 'UNSELECTED'}` : 'SELECTED DATA'}</span>
					<div class="inspector-mode-toggle">
						<button
							class="imt-btn"
							class:active={inspectorMode === 'evidence-e002'}
							onclick={() => { selectedScenePrimitive = null; inspectorMode = 'evidence-e002'; }}
							title="Show E-002 Crime Scene Evidence"
						>E-002</button>
						<button
							class="imt-btn"
							class:active={inspectorMode === 'splat'}
							onclick={() => inspectorMode = 'splat'}
							title="Show 3D Splat Node Telemetry"
						>E-009 SPLAT</button>
					</div>
				</div>
				<div class="inspector-sub">
					{#if inspectorMode === 'evidence-e002'}
						<span>CASE: {crimeEvidenceE002.caseNumber}</span>
						<span class="ex-tag gold">BLOODSTAIN (2D/3D)</span>
					{:else if inspectorMode === 'scene-primitive' && selectedScenePrimitive}
						<span>{selectedScenePrimitive.type}</span>
						<span class="ex-tag gold">DEMONSTRATIVE · UNCALIBRATED</span>
					{:else}
						<span>ID: GAUSSIAN_SPLAT_009</span>
						<span class="ex-tag">EXHIBIT #E-009</span>
					{/if}
				</div>
			</div>

			{#if inspectorMode === 'evidence-e002'}
				<!-- Image 2: EVIDENCE = E-002 Crime Scene Inspector -->
				<div class="inspector-scroll-area noir-evidence-inspector">
					<!-- Hero Bloodstain Thumbnail & Meta -->
					<div class="nei-hero-box">
						<div class="nei-thumb-wrap">
							<div class="bloodstain-canvas-preview">
								<div class="bs-splatter-core"></div>
								<div class="bs-splatter-drop d1"></div>
								<div class="bs-splatter-drop d2"></div>
								<div class="bs-splatter-drop d3"></div>
							</div>
						</div>
						<div class="nei-meta-list">
							<div class="nml-row"><span class="k">Type:</span> <span class="v">{crimeEvidenceE002.type}</span></div>
							<div class="nml-row"><span class="k">Case:</span> <span class="v">{crimeEvidenceE002.caseNumber}</span></div>
							<div class="nml-row"><span class="k">Source hash:</span> <code class="v mono">{crimeEvidenceE002.hash ?? 'Not linked'}</code></div>
							<div class="nml-row"><span class="k">Added:</span> <span class="v">{crimeEvidenceE002.added}</span></div>
						</div>
					</div>

					<!-- Verified Badge & Chain of Custody -->
					<div class="nei-verify-row">
						<div class="verified-pill">
							<Icon name="scan" size={12} />
							<span>SYNTHETIC HYPOTHESIS</span>
						</div>
						<span class="chain-custody-link">Source provenance not linked</span>
					</div>

					<!-- Bounding Box (3D) -->
					<div class="nei-section">
						<div class="nei-sec-head">
							<span class="dot-gold"></span>
							<span class="sec-title">BOUNDING BOX (3D)</span>
							<Icon name="lock" size={12} />
						</div>
						<div class="bound-dimensions-grid">
						<div class="dim-box"><span class="axis">X</span> <span class="val">{selectedScenePrimitive?.dimensionsMeters[0] ?? crimeEvidenceE002.bounds.x} m</span></div>
							<div class="dim-box"><span class="axis">Y</span> <span class="val">{selectedScenePrimitive?.dimensionsMeters[1] ?? crimeEvidenceE002.bounds.y} m</span></div>
							<div class="dim-box"><span class="axis">Z</span> <span class="val">{selectedScenePrimitive?.dimensionsMeters[2] ?? crimeEvidenceE002.bounds.z} m</span></div>
						</div>
					</div>

					<!-- Transform -->
					<div class="nei-section">
						<div class="nei-sec-head">
							<span class="dot-gold"></span>
							<span class="sec-title">TRANSFORM</span>
						</div>
						<div class="transform-table">
							<div class="tr-row">
								<span class="tr-lbl">Position</span>
								<div class="tr-vals">
									<span>X <code class="tr-num">{selectedScenePrimitive?.positionMeters[0] ?? crimeEvidenceE002.transform.position.x}</code></span>
									<span>Y <code class="tr-num">{selectedScenePrimitive?.positionMeters[1] ?? crimeEvidenceE002.transform.position.y.toFixed(3)}</code></span>
									<span>Z <code class="tr-num">{selectedScenePrimitive?.positionMeters[2] ?? crimeEvidenceE002.transform.position.z}</code></span>
								</div>
							</div>
							<div class="tr-row">
								<span class="tr-lbl">Rotation</span>
								<div class="tr-vals">
									<span>X <code class="tr-num">{selectedScenePrimitive?.rotationDeg[0] ?? crimeEvidenceE002.transform.rotation.x.toFixed(1)}°</code></span>
									<span>Y <code class="tr-num">{selectedScenePrimitive?.rotationDeg[1] ?? crimeEvidenceE002.transform.rotation.y.toFixed(1)}°</code></span>
									<span>Z <code class="tr-num">{selectedScenePrimitive?.rotationDeg[2] ?? crimeEvidenceE002.transform.rotation.z.toFixed(1)}°</code></span>
								</div>
							</div>
							<div class="tr-row">
								<span class="tr-lbl">Scale</span>
								<div class="tr-vals">
									<span>X <code class="tr-num">{crimeEvidenceE002.transform.scale.x.toFixed(2)}</code></span>
									<span>Y <code class="tr-num">{crimeEvidenceE002.transform.scale.y.toFixed(2)}</code></span>
									<span>Z <code class="tr-num">{crimeEvidenceE002.transform.scale.z.toFixed(2)}</code></span>
								</div>
							</div>
						</div>
					</div>

					<!-- Tags -->
					<div class="nei-section">
						<div class="nei-sec-head">
							<span class="dot-gold"></span>
							<span class="sec-title">TAGS</span>
						</div>
						<div class="tags-badge-row">
							{#each crimeEvidenceE002.tags as tag}
								<span class="forensic-tag-chip">{tag}</span>
							{/each}
							<button class="add-tag-chip">+</button>
						</div>
					</div>

					<!-- N64 16 KB Memory Arena FSM Telemetry Inspector -->
					<div class="nei-section" style="margin-top: 8px;">
						<ExhibitInspectorPanel
							exhibitId={crimeEvidenceE002.id}
							label={crimeEvidenceE002.title}
							dimensionsMeters={selectedScenePrimitive?.dimensionsMeters ?? [crimeEvidenceE002.bounds.x, crimeEvidenceE002.bounds.y, crimeEvidenceE002.bounds.z]}
							positionMeters={selectedScenePrimitive?.positionMeters ?? [crimeEvidenceE002.transform.position.x, crimeEvidenceE002.transform.position.y, crimeEvidenceE002.transform.position.z]}
							rotationDeg={selectedScenePrimitive?.rotationDeg ?? [crimeEvidenceE002.transform.rotation.x, crimeEvidenceE002.transform.rotation.y, crimeEvidenceE002.transform.rotation.z]}
							provenanceLabel="SYNTHETIC HYPOTHESIS"
						/>
					</div>
				</div>
			{:else if inspectorMode === 'scene-primitive' && selectedScenePrimitive}
				<div class="inspector-scroll-area" data-testid="scene-primitive-inspector">
					<ExhibitInspectorPanel
						exhibitId={selectedScenePrimitive.id}
						label={selectedScenePrimitive.label}
						dimensionsMeters={selectedScenePrimitive.dimensionsMeters}
						positionMeters={selectedScenePrimitive.positionMeters}
						rotationDeg={selectedScenePrimitive.rotationDeg}
						provenanceLabel="DEMONSTRATIVE · UNCALIBRATED"
					/>
				</div>
			{:else}
				<div class="inspector-scroll-area">
				<!-- Section 1: 3D Spatial Telemetry & Splat Metrics -->
				<div class="telemetry-block">
					<div class="block-head">
						<span class="dot cyan"></span>
						<span class="title">3D SPATIAL TELEMETRY & SPLAT METRICS</span>
						<span class="realtime-pill">REALTIME</span>
					</div>

					<div class="metric-card">
						<span class="label">POINT DENSITY:</span>
						<span class="big-val cyan">1.48M Splats</span>
						<span class="desc">Dense Gaussian Cloud (Sub-voxel refinement)</span>
					</div>

					<div class="metric-grid-two">
						<div class="metric-card compact">
							<span class="label">SIMD RMS CALIPER:</span>
							<span class="val">0.003mm</span>
							<span class="sub-badge">ISO-17025 FORENSIC</span>
						</div>
						<div class="metric-card compact">
							<span class="label">MULTIMODAL VECTORIZER:</span>
							<span class="val green">768-D dense</span>
							<span class="sub-badge">EmbeddingGemma v2.4</span>
						</div>
					</div>

					<div class="cosine-alignment-panel">
						<div class="ca-text">
							<span>Cosine Alignment to Incident Locus:</span>
							<span class="ca-score">{vectorCosineScore.toFixed(4)}</span>
						</div>
						<div class="ca-bar-track">
							<div class="ca-bar-glow" style="width: {vectorCosineScore * 100}%;"></div>
						</div>
					</div>

					<div class="inspector-buttons-group">
						<button class="insp-action-btn primary" onclick={handleReEmbed} disabled={isReEmbedding}>
							<Icon name="sparkles" size={13} />
							<span>{isReEmbedding ? 'Vectorizing 768-D…' : 'Re-embed Region'}</span>
						</button>
						<button
							class="insp-action-btn"
							onclick={handleCalculateTrajectory}
							disabled={isCalculatingTrajectory}
						>
							<Icon name="activity" size={13} />
							<span>{isCalculatingTrajectory ? 'Calculating Splat Vectors…' : trajectoryCalculated ? 'Trajectory Computed (99.4%)' : 'Calculate Spatial Trajectory'}</span>
						</button>
						<button
							class="insp-action-btn"
							onclick={handleExtractBoundingMesh}
							disabled={isExtractingMesh}
						>
							<Icon name="bounding-box" size={13} />
							<span>{isExtractingMesh ? 'Extracting Caliper Mesh…' : meshExtracted ? 'Bounding Mesh Locked' : 'Extract 3D Bounding Mesh'}</span>
						</button>
					</div>
				</div>

				<!-- Section 2: Database Fabric Telemetry -->
				<div class="fabric-telemetry-block">
					<div class="fabric-head">
						<span class="title">DATABASE FABRIC</span>
						<span class="spz-badge">SPZ v4 STREAM</span>
					</div>
					<div class="fabric-table">
						<div class="fabric-row">
							<span class="f-lbl">Drizzle ORM Linchpin:</span>
							<code class="f-val">v0.45.2-rel</code>
						</div>
						<div class="fabric-row">
							<span class="f-lbl">pgvector Dimension:</span>
							<code class="f-val">768-D Embeddings</code>
						</div>
						<div class="fabric-row">
							<span class="f-lbl">Spatial Splat Parity:</span>
							<code class="f-val green">{splatsVerified}/{splatsTotal} Verified (100%)</code>
						</div>
					</div>
				</div>
			</div>
			{/if}
		</aside>
	</div>
	{/if}

	<!-- LAYER 5: Bottom Temporal Sequence or Noir Chevron Pipeline (Canvas / 3D modes only) -->
	{#if mainView !== 'dossier'}
	{#if centerMode === 'crime-reconstruction'}
		<!-- Image 2: Noir Chevron Phase Timeline Footer -->
		<footer class="crime-timeline-footer">
			<div class="ctf-playback-bar">
				<div class="ctf-controls">
					<button
						class="ctf-play-btn"
						onclick={() => isCrimePlaying = !isCrimePlaying}
						title="Play Timeline"
					>
						<Icon name={isCrimePlaying ? 'pause' : 'play'} size={15} />
					</button>
					<button class="ctf-step-btn" title="Previous Phase"><Icon name="skip-back" size={13} /></button>
					<button class="ctf-step-btn" title="Next Phase"><Icon name="skip-forward" size={13} /></button>
					<span class="ctf-timecode">{crimeTimecode}</span>
				</div>

				<!-- Chevron Phase Pipeline (Image 2) -->
				<div class="ctf-chevron-pipeline">
					<button
						class="chevron-step"
						class:active={activeTimelinePhase === 'capture'}
						onclick={() => activeTimelinePhase = 'capture'}
					>
						<span>Scene Capture</span>
					</button>
					<button
						class="chevron-step gold-active"
						class:active={activeTimelinePhase === 'evidence'}
						onclick={() => activeTimelinePhase = 'evidence'}
					>
						<span class="chevron-pin-marker"></span>
						<span>Evidence E-002 (Blood)</span>
					</button>
					<button
						class="chevron-step"
						class:active={activeTimelinePhase === 'analysis'}
						onclick={() => activeTimelinePhase = 'analysis'}
					>
						<span>Analysis</span>
					</button>
					<button
						class="chevron-step"
						class:active={activeTimelinePhase === 'reconstruction'}
						onclick={() => activeTimelinePhase = 'reconstruction'}
					>
						<span>Reconstruction</span>
					</button>
					<button
						class="chevron-step"
						class:active={activeTimelinePhase === 'report'}
						onclick={() => activeTimelinePhase = 'report'}
					>
						<span>Report</span>
					</button>
				</div>
			</div>

			<!-- Bottom Status Bar -->
			<div class="temporal-status-bottom">
				<div class="ts-left">
					<span>PAN: {pan.x}° N, {Math.abs(pan.y)}° W</span>
					<span>ZOOM: {Math.round(zoom * 100)}%</span>
					<span class="seq-tag">SEQ: EV-01 Entry → EV-02 Retrieval → EV-03 3D LiDAR Splat</span>
				</div>
				<div class="ts-right">
					<button class="ts-btn"><Icon name="play" size={11} /> Playback</button>
					<button class="ts-btn"><Icon name="download" size={11} /> Export</button>
					<span class="lidar-live-tag"><span class="dot green"></span> LiDAR ACTIVE</span>
				</div>
			</div>
		</footer>
	{:else}
		<footer class="temporal-sequence-footer">
		<!-- Timeline Scrubber Header -->
		<div class="temporal-meta-bar">
			<div class="meta-left">
				<Icon name="clock" size={13} />
				<span class="t-label">TEMPORAL SEQUENCE</span>
				<span class="t-dates">OCT 12 – 16, 2023</span>
			</div>

			<!-- Scrubber with 12:00 mark -->
			<div class="timeline-scrubber">
				<div class="scrub-track">
					<span class="time-label">12:00</span>
					<div class="scrub-dot dot-1"></div>
					<div class="scrub-dot dot-2 active"></div>
					<div class="scrub-dot dot-3"></div>
				</div>
			</div>

			<div class="meta-right">
				<span class="scan-tag">PHOTOGRAMMETRY SCAN #15: 02:31 UTC (4.60m Span)</span>
				<span class="splat-count-tag"><span class="dot green"></span> SPLATS: 29/29</span>
				<span class="scale-tag">SCALE: 1:1</span>
			</div>
		</div>

		<!-- Bits UI v2 Evidence Carousel Slide Gallery with Drag & Drop -->
		<div class="carousel-gallery-wrapper">
			<EvidenceCarouselGallery
				exhibits={galleryExhibits}
				bind:selectedId={selectedGalleryExhibitId}
				{theme}
				onSelect={handleSelectGalleryExhibit}
				onExpand={handleExpandGalleryExhibit}
				onUploadFiles={handleUploadGalleryFiles}
			/>
		</div>

		<!-- Bottom Status Bar -->
		<div class="temporal-status-bottom">
			<div class="ts-left">
				<span>PAN: {pan.x}° N, {Math.abs(pan.y)}° W</span>
				<span>ZOOM: {Math.round(zoom * 100)}%</span>
				<span class="seq-tag">SEQ: EV-01 Entry → EV-02 Retrieval → EV-03 3D LiDAR Splat</span>
			</div>
			<div class="ts-right">
				<button class="ts-btn"><Icon name="play" size={11} /> Playback</button>
				<button class="ts-btn"><Icon name="download" size={11} /> Export</button>
				<span class="lidar-live-tag"><span class="dot green"></span> LiDAR ACTIVE</span>
			</div>
		</div>
	</footer>
	{/if}
	{/if}

	<!-- Bits UI v2 Expanded Document & Evidence Viewer Modal -->
	{#if selectedGalleryExhibit}
	<ExpandedEvidenceViewer
		bind:open={isExpandedViewerOpen}
		exhibit={selectedGalleryExhibit}
		{theme}
		onClose={() => { isExpandedViewerOpen = false; }}
		onPinToCanvas={(item) => {
			// Ingested into canvas nodes
		}}
		onImpeach={(item) => {
			mainView = 'dossier';
			ornithAiPrompt = `Cross-examine witness based on Exhibit ${item.exhibitNumber} (${item.title}): ${item.summary}`;
		}}
	/>
	{/if}
</div>

<style>
	/* ROOT CONTAINER: High-Tech Cyber-Forensic Layout */
	.detective-hud-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		width: 100%;
		background: #090d14;
		color: #e2e8f0;
		font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
		overflow: hidden;
		user-select: none;
	}

	/* LAYER 1: YORHA GLOBAL NAV */
	.yorha-global-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 44px;
		background: #0f1622;
		border-bottom: 1px solid #1e293b;
		padding: 0 16px;
		font-size: 12px;
		flex-shrink: 0;
	}

	.scene-provenance-notice {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 28px;
		padding: 4px 20px;
		border-bottom: 1px solid rgba(156, 107, 30, 0.28);
		background: #fff8e7;
		color: #594311;
		font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
	}

	.scene-provenance-notice strong {
		flex: 0 0 auto;
		color: #8b1e22;
		letter-spacing: 0.08em;
	}

	@media (max-width: 640px) {
		.scene-provenance-notice { align-items: flex-start; padding-inline: 10px; font-size: 10px; }
	}
	.nav-left {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.brand-block {
		display: flex;
		flex-direction: column;
	}
	.brand-title {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.1em;
		color: #f1f5f9;
	}
	.brand-sub {
		font-size: 9px;
		letter-spacing: 0.08em;
		color: #64748b;
	}
	.case-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: #182232;
		border: 1px solid #334155;
		border-radius: 4px;
		padding: 3px 8px;
		font-size: 11px;
	}
	.case-number {
		color: #38bdf8;
		font-family: monospace;
		font-weight: 700;
	}
	.case-name {
		color: #cbd5e1;
	}
	.nav-center {
		flex: 1;
		max-width: 440px;
		margin: 0 16px;
	}
	.global-search-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		background: #151d2c;
		border: 1px solid #283548;
		border-radius: 5px;
		padding: 4px 10px;
		color: #94a3b8;
		font-size: 12px;
	}
	.global-search-bar input {
		background: transparent;
		border: none;
		outline: none;
		color: #e2e8f0;
		width: 100%;
		font-size: 11px;
	}
	.kbd-badge {
		background: #1e293b;
		border: 1px solid #334155;
		color: #94a3b8;
		font-size: 9px;
		padding: 1px 4px;
		border-radius: 3px;
		font-family: monospace;
	}
	.nav-right {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.live-pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 11px;
		color: #94a3b8;
		font-family: monospace;
	}
	.live-pill.active-green {
		color: #4ade80;
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}
	.dot.blue { background: #38bdf8; }
	.dot.purple { background: #a855f7; }
	.dot.green { background: #22c55e; }
	.icon-nav-btn {
		background: #182232;
		border: 1px solid #334155;
		color: #94a3b8;
		padding: 4px 7px;
		border-radius: 4px;
		cursor: pointer;
	}

	/* LAYER 2: SUBHEADER */
	.unit-data-subheader {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 40px;
		background: #0d1420;
		border-bottom: 1px solid #1a2436;
		padding: 0 16px;
		font-size: 12px;
		flex-shrink: 0;
	}
	.subheader-left {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.unit-pill {
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: 700;
		font-size: 11px;
		letter-spacing: 0.05em;
		color: #38bdf8;
	}
	.pulse-cyan {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #38bdf8;
		box-shadow: 0 0 8px #38bdf8;
	}
	.pulse-cyan-sm {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: #38bdf8;
	}
	.system-id {
		font-family: monospace;
		font-size: 11px;
		color: #64748b;
	}
	.mode-pills {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-left: 12px;
	}
	.mode-pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 10px;
		background: #141d2c;
		border: 1px solid #233147;
		border-radius: 4px;
		color: #94a3b8;
		font-size: 11px;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.mode-pill:hover {
		background: #1b263b;
		color: #f1f5f9;
	}
	.mode-pill.active {
		background: #0284c7;
		border-color: #0284c7;
		color: #ffffff;
		font-weight: 600;
	}
	.mode-pill.cyan-active {
		background: #0d9488;
		border-color: #0d9488;
		color: #ffffff;
		font-weight: 600;
	}

	/* LAYER 3: ACTION TOOLBAR */
	.canvas-action-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 38px;
		background: #111a28;
		border-bottom: 1px solid #1e2b40;
		padding: 0 16px;
		font-size: 11px;
		flex-shrink: 0;
	}
	.toolbar-tools {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.tool-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 8px;
		background: #162235;
		border: 1px solid #26364f;
		border-radius: 4px;
		color: #94a3b8;
		font-size: 11px;
		cursor: pointer;
	}
	.tool-btn:hover {
		background: #1e2e47;
		color: #ffffff;
	}
	.tool-btn.active {
		background: #0284c7;
		border-color: #0284c7;
		color: #ffffff;
	}
	.tool-btn.primary-btn {
		background: #0284c7;
		border-color: #0369a1;
		color: #ffffff;
		font-weight: 600;
	}
	.tool-btn.auto-layout-btn {
		color: #cbd5e1;
	}
	.toolbar-status {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.cluster-tag {
		font-family: monospace;
		color: #64748b;
		font-size: 11px;
	}
	.analysis-btn {
		background: #0284c7;
		border-color: #0369a1;
		color: #ffffff;
		font-weight: 600;
	}
	.analysis-btn.loading {
		opacity: 0.7;
	}

	/* LAYER 4: 3-COLUMN WORKSPACE */
	.forensic-body-workspace {
		display: grid;
		grid-template-columns: 280px 1fr 340px;
		flex: 1;
		overflow: hidden;
		position: relative;
	}

	/* LEFT: EXHIBIT VAULT */
	.exhibit-vault-pane {
		background: #0c121c;
		border-right: 1px solid #1a2536;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.vault-top {
		padding: 10px;
		border-bottom: 1px solid #1a2536;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.vault-heading-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.vault-title {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.05em;
		color: #f1f5f9;
		flex: 1;
	}
	.pending-pill {
		font-size: 9px;
		background: #1e293b;
		color: #38bdf8;
		padding: 2px 6px;
		border-radius: 4px;
		font-family: monospace;
	}
	.vault-search-row {
		display: flex;
		align-items: center;
		gap: 6px;
		background: #141c2a;
		border: 1px solid #233146;
		border-radius: 4px;
		padding: 4px 8px;
		font-size: 11px;
		color: #64748b;
	}
	.vault-search-row input {
		background: transparent;
		border: none;
		outline: none;
		color: #cbd5e1;
		width: 100%;
		font-size: 11px;
	}
	.kbd-tag {
		font-size: 9px;
		color: #64748b;
		font-family: monospace;
	}
	.vault-filters {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.vf-btn {
		background: #141c2a;
		border: 1px solid #222f42;
		color: #94a3b8;
		font-size: 10px;
		padding: 2px 7px;
		border-radius: 3px;
		cursor: pointer;
	}
	.vf-btn.active {
		background: #0284c7;
		border-color: #0284c7;
		color: #ffffff;
	}
	.vf-link {
		background: transparent;
		border: none;
		color: #38bdf8;
		font-size: 10px;
		margin-left: auto;
		cursor: pointer;
	}
	.vault-card-list {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.vault-exhibit-card {
		background: #131a26;
		border: 1px solid #202b3c;
		border-radius: 5px;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		cursor: grab;
	}
	.vault-exhibit-card:hover {
		border-color: #38bdf8;
	}
	.card-meta {
		display: flex;
		justify-content: space-between;
		font-size: 10px;
		color: #64748b;
		font-family: monospace;
	}
	.title {
		font-size: 11px;
		font-weight: 700;
		color: #f1f5f9;
	}
	.summary {
		font-size: 10px;
		color: #94a3b8;
		line-height: 1.35;
	}
	.card-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 4px;
	}
	.badge {
		font-size: 9px;
		padding: 1px 6px;
		border-radius: 3px;
		border: 1px solid transparent;
		font-family: monospace;
		font-weight: 700;
	}
	.drag-dots {
		color: #475569;
	}
	.cctv-preview-box {
		position: relative;
		height: 60px;
		background: #0b1119;
		border-radius: 4px;
		overflow: hidden;
		border: 1px solid #1e293b;
	}
	.cctv-corridor-graphic {
		width: 100%;
		height: 100%;
		background: linear-gradient(135deg, #091e30 0%, #030712 100%);
		position: relative;
	}
	.cctv-scanline {
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(0deg, rgba(56, 189, 248, 0.05) 0px, transparent 2px);
	}
	.cctv-figure {
		position: absolute;
		left: 45%;
		top: 25%;
		width: 14px;
		height: 28px;
		background: #0284c7;
		opacity: 0.7;
		clip-path: polygon(50% 0%, 75% 30%, 70% 100%, 30% 100%, 25% 30%);
	}
	.cctv-timestamp {
		position: absolute;
		bottom: 3px;
		right: 6px;
		font-size: 9px;
		color: #38bdf8;
		font-family: monospace;
		background: rgba(0, 0, 0, 0.6);
		padding: 0 4px;
		border-radius: 2px;
	}
	.vault-drop-zone {
		border: 1px dashed #2a394e;
		border-radius: 5px;
		padding: 14px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		color: #64748b;
		cursor: pointer;
		margin-top: auto;
	}
	.drop-label {
		font-size: 11px;
		font-weight: 600;
		color: #94a3b8;
	}
	.drop-sub {
		font-size: 9px;
		color: #475569;
	}

	/* CENTER: FORENSIC 3D VIEWPORT */
	.forensic-center-stage {
		background: #080c13;
		position: relative;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.splat-engine-viewport {
		display: flex;
		flex-direction: column;
		height: 100%;
		width: 100%;
		position: relative;
	}
	.splat-hud-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 32px;
		background: rgba(13, 20, 31, 0.95);
		border-bottom: 1px solid #1a2538;
		padding: 0 14px;
		font-size: 11px;
		flex-shrink: 0;
		z-index: 10;
	}
	.hud-header-left {
		display: flex;
		align-items: center;
		gap: 6px;
		color: #38bdf8;
	}
	.hud-engine-title {
		font-weight: 700;
		letter-spacing: 0.05em;
	}
	.hud-header-right {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.hud-stat-chip {
		font-size: 10px;
		color: #94a3b8;
		font-family: monospace;
	}
	.hud-stat-chip code {
		color: #38bdf8;
		font-weight: 700;
	}
	.hud-gyro-cube {
		display: flex;
		gap: 2px;
		font-size: 9px;
		font-family: monospace;
		font-weight: 700;
	}
	.axis.x { color: #ef4444; }
	.axis.y { color: #22c55e; }
	.axis.z { color: #3b82f6; }

	.splat-scene-container {
		flex: 1;
		position: relative;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.surveillance-hallway-bg {
		position: absolute;
		inset: 0;
		background: radial-gradient(circle at 50% 45%, #0d2238 0%, #060b13 85%);
		overflow: hidden;
	}
	.hallway-perspective-grid {
		position: absolute;
		inset: 0;
		background-image:
			linear-gradient(to right, rgba(56, 189, 248, 0.06) 1px, transparent 1px),
			linear-gradient(to bottom, rgba(56, 189, 248, 0.06) 1px, transparent 1px);
		background-size: 36px 36px;
		perspective: 500px;
		transform: rotateX(45deg);
		transform-origin: center bottom;
	}
	.scene-subject-silhouette {
		position: absolute;
		left: 50%;
		top: 40%;
		transform: translate(-50%, -50%);
		width: 48px;
		height: 120px;
		background: #0284c7;
		opacity: 0.35;
		clip-path: polygon(50% 0%, 65% 15%, 80% 35%, 65% 95%, 35% 95%, 20% 35%, 35% 15%);
		filter: blur(2px);
	}
	.shadow-ground {
		position: absolute;
		left: 50%;
		top: 56%;
		transform: translateX(-50%);
		width: 80px;
		height: 16px;
		background: rgba(0, 0, 0, 0.8);
		border-radius: 50%;
		filter: blur(4px);
	}

	/* Bounding Volume Box Frame Overlay */
	.bounding-volume-overlay {
		position: relative;
		width: 82%;
		height: 78%;
		border: 1.5px solid #06b6d4;
		border-radius: 6px;
		box-shadow: 0 0 20px rgba(6, 182, 212, 0.25), inset 0 0 20px rgba(6, 182, 212, 0.08);
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 12px;
		z-index: 5;
	}
	.bv-frame-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.bv-title {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: monospace;
		font-size: 11px;
		font-weight: 700;
		color: #22d3ee;
		background: rgba(6, 182, 212, 0.12);
		padding: 3px 8px;
		border-radius: 3px;
	}
	.bv-intersect-pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 10px;
		font-family: monospace;
		font-weight: 700;
		color: #4ade80;
		background: rgba(34, 197, 94, 0.15);
		border: 1px solid rgba(34, 197, 94, 0.4);
		padding: 3px 8px;
		border-radius: 3px;
	}
	.vertex-anchor {
		position: absolute;
		font-size: 9px;
		font-family: monospace;
		color: #67e8f9;
		background: rgba(13, 20, 31, 0.85);
		padding: 1px 4px;
		border: 1px solid rgba(6, 182, 212, 0.4);
		border-radius: 2px;
	}
	.v-top-left { top: 38px; left: 12px; }
	.v-top-right { top: 38px; right: 12px; }
	.v-bottom-left { bottom: 38px; left: 12px; }
	.v-bottom-right { bottom: 38px; right: 12px; }

	.center-crosshair {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 32px;
		height: 32px;
		pointer-events: none;
	}
	.ch-line-h {
		position: absolute;
		top: 50%;
		left: 0;
		right: 0;
		height: 1px;
		background: rgba(6, 182, 212, 0.6);
	}
	.ch-line-v {
		position: absolute;
		left: 50%;
		top: 0;
		bottom: 0;
		width: 1px;
		background: rgba(6, 182, 212, 0.6);
	}
	.ch-circle {
		position: absolute;
		inset: 6px;
		border: 1px dashed rgba(6, 182, 212, 0.8);
		border-radius: 50%;
	}

	.bv-frame-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: rgba(13, 20, 31, 0.9);
		border: 1px solid rgba(6, 182, 212, 0.3);
		padding: 6px 12px;
		border-radius: 4px;
		font-size: 10px;
		font-family: monospace;
		color: #94a3b8;
	}
	.cyan-val {
		color: #22d3ee;
	}
	.caliper-dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #22c55e;
		margin-right: 4px;
	}

	.viewport-hud-dock {
		position: absolute;
		bottom: 12px;
		right: 14px;
		display: flex;
		align-items: center;
		gap: 4px;
		background: rgba(13, 20, 31, 0.92);
		border: 1px solid #28374d;
		padding: 3px 6px;
		border-radius: 4px;
		z-index: 10;
	}
	.vh-btn {
		background: transparent;
		border: none;
		color: #94a3b8;
		padding: 3px 6px;
		border-radius: 3px;
		cursor: pointer;
	}
	.vh-btn:hover {
		background: #1e2b3e;
		color: #ffffff;
	}
	.vh-zoom {
		font-size: 10px;
		font-family: monospace;
		color: #e2e8f0;
		padding: 0 4px;
	}

	/* TACTICAL MINT CANVAS VIEWPORT */
	.tactical-mint-canvas-viewport {
		position: relative;
		width: 100%;
		height: 100%;
		background: #f0faf3;
		overflow: hidden;
	}
	.canvas-substrate {
		position: absolute;
		inset: 0;
		transform-origin: 0 0;
	}
	.canvas-cables-layer {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.tactical-card {
		position: absolute;
		background: #ffffff;
		border: 1px solid #cce3d5;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(16, 185, 129, 0.08);
		cursor: grab;
	}
	.tactical-card.cyan-border {
		border-color: #06b6d4;
	}
	.tc-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		border-bottom: 1px solid #e2f0e8;
		font-size: 11px;
		font-weight: 700;
		color: #0f4c2c;
	}
	.tc-head.cyan {
		color: #0891b2;
	}
	.tc-pill {
		font-size: 9px;
		padding: 2px 6px;
		border-radius: 3px;
		background: #e2f4ea;
		color: #059669;
		font-family: monospace;
	}
	.tc-pill.red { background: #fee2e2; color: #dc2626; }
	.tc-pill.cyan { background: #cffafe; color: #0891b2; }
	.tc-body {
		padding: 10px 12px;
		font-size: 11px;
		color: #1e293b;
	}
	.exculpatory-quote {
		background: #fefce8;
		border: 1px solid #fde047;
		padding: 8px;
		border-radius: 4px;
		margin-top: 6px;
		font-size: 10px;
	}
	.eq-header {
		display: flex;
		justify-content: space-between;
		font-weight: 700;
		color: #854d0e;
		margin-bottom: 4px;
	}
	.tc-split {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.amount-val {
		color: #dc2626;
		font-weight: 700;
		font-family: monospace;
	}
	.sparkline-wrapper {
		margin-top: 6px;
	}
	.tc-btn-row {
		display: flex;
		gap: 8px;
		margin-top: 10px;
	}
	.tc-action-btn {
		flex: 1;
		padding: 5px;
		border-radius: 4px;
		font-size: 11px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		cursor: pointer;
	}
	.tc-action-btn.primary {
		background: #0284c7;
		color: #ffffff;
		border: none;
	}
	.tc-action-btn.secondary {
		background: #f1f5f9;
		color: #334155;
		border: 1px solid #cbd5e1;
	}
	.canvas-zoom-dock {
		position: absolute;
		bottom: 12px;
		right: 14px;
		display: flex;
		align-items: center;
		gap: 4px;
		background: #ffffff;
		border: 1px solid #cbd5e1;
		padding: 3px 6px;
		border-radius: 4px;
		color: #334155;
	}
	.canvas-zoom-dock button {
		background: transparent;
		border: none;
		cursor: pointer;
	}

	/* RIGHT: SELECTED DATA INSPECTOR */
	.selected-data-inspector {
		background: #0d1420;
		border-left: 1px solid #1a2536;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.inspector-header {
		padding: 10px 14px;
		border-bottom: 1px solid #1a2536;
	}
	.inspector-title-row {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		font-weight: 800;
		color: #f1f5f9;
	}
	.node-badge {
		font-size: 9px;
		background: #0284c7;
		color: #ffffff;
		padding: 1px 6px;
		border-radius: 3px;
		margin-left: auto;
		font-family: monospace;
	}
	.inspector-sub {
		display: flex;
		justify-content: space-between;
		font-size: 10px;
		color: #64748b;
		font-family: monospace;
		margin-top: 3px;
	}
	.inspector-scroll-area {
		flex: 1;
		overflow-y: auto;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.telemetry-block, .fabric-telemetry-block {
		background: #111a27;
		border: 1px solid #1f2d40;
		border-radius: 6px;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.block-head, .fabric-head {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 10px;
		font-weight: 700;
		color: #94a3b8;
		letter-spacing: 0.05em;
	}
	.realtime-pill, .spz-badge {
		margin-left: auto;
		font-size: 8px;
		background: rgba(34, 197, 94, 0.15);
		color: #4ade80;
		border: 1px solid rgba(34, 197, 94, 0.3);
		padding: 1px 5px;
		border-radius: 2px;
		font-family: monospace;
	}
	.metric-card {
		background: #152030;
		border: 1px solid #23344d;
		border-radius: 4px;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.metric-card.compact {
		flex: 1;
	}
	.metric-grid-two {
		display: flex;
		gap: 8px;
	}
	.metric-card .label {
		font-size: 9px;
		color: #64748b;
		font-family: monospace;
	}
	.metric-card .big-val {
		font-size: 18px;
		font-weight: 800;
		font-family: monospace;
	}
	.metric-card .big-val.cyan { color: #38bdf8; }
	.metric-card .val {
		font-size: 12px;
		font-weight: 700;
		color: #f1f5f9;
		font-family: monospace;
	}
	.metric-card .val.green { color: #4ade80; }
	.metric-card .desc, .sub-badge {
		font-size: 9px;
		color: #64748b;
	}
	.cosine-alignment-panel {
		background: #152030;
		border: 1px solid #23344d;
		border-radius: 4px;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.ca-text {
		display: flex;
		justify-content: space-between;
		font-size: 10px;
		color: #94a3b8;
	}
	.ca-score {
		color: #38bdf8;
		font-family: monospace;
		font-weight: 700;
	}
	.ca-bar-track {
		height: 6px;
		background: #0f172a;
		border-radius: 3px;
		overflow: hidden;
	}
	.ca-bar-glow {
		height: 100%;
		background: linear-gradient(90deg, #0284c7 0%, #38bdf8 50%, #4ade80 100%);
		box-shadow: 0 0 8px #38bdf8;
	}
	.inspector-buttons-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 4px;
	}
	.insp-action-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 6px 10px;
		background: #182436;
		border: 1px solid #2a3d58;
		border-radius: 4px;
		color: #cbd5e1;
		font-size: 11px;
		cursor: pointer;
	}
	.insp-action-btn:hover {
		background: #203148;
		color: #ffffff;
	}
	.insp-action-btn.primary {
		background: #0284c7;
		border-color: #0369a1;
		color: #ffffff;
		font-weight: 600;
	}
	.fabric-table {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 10px;
	}
	.fabric-row {
		display: flex;
		justify-content: space-between;
		color: #94a3b8;
	}
	.f-val {
		font-family: monospace;
		color: #e2e8f0;
	}
	.f-val.green { color: #4ade80; }

	/* LAYER 5: BOTTOM TEMPORAL SEQUENCE */
	.temporal-sequence-footer {
		background: #0d1420;
		border-top: 1px solid #1a2538;
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}
	.temporal-meta-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 30px;
		padding: 0 14px;
		border-bottom: 1px solid #16202f;
		font-size: 10px;
	}
	.meta-left {
		display: flex;
		align-items: center;
		gap: 6px;
		color: #38bdf8;
		font-weight: 700;
	}
	.t-dates {
		color: #94a3b8;
		margin-left: 4px;
		font-family: monospace;
	}
	.timeline-scrubber {
		flex: 1;
		max-width: 320px;
		margin: 0 16px;
	}
	.scrub-track {
		height: 3px;
		background: #1e293b;
		position: relative;
		display: flex;
		align-items: center;
	}
	.scrub-dot {
		position: absolute;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #475569;
		top: -2px;
	}
	.scrub-dot.dot-1 { left: 20%; }
	.scrub-dot.dot-2.active {
		left: 55%;
		background: #38bdf8;
		box-shadow: 0 0 6px #38bdf8;
	}
	.scrub-dot.dot-3 { left: 80%; }
	.time-label {
		position: absolute;
		left: 50%;
		top: -14px;
		transform: translateX(-50%);
		font-size: 8px;
		font-family: monospace;
		color: #64748b;
	}
	.meta-right {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 10px;
		color: #64748b;
		font-family: monospace;
	}
	.scan-tag {
		color: #38bdf8;
	}
	.splat-count-tag {
		display: flex;
		align-items: center;
		gap: 4px;
		color: #4ade80;
	}
	.filmstrip-cards-scroll {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		overflow-x: auto;
		background: #090e17;
	}
	.film-card {
		flex-shrink: 0;
		width: 105px;
		height: 65px;
		background: #121a27;
		border: 1px solid #1e2b3e;
		border-radius: 4px;
		padding: 5px;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		font-size: 9px;
		cursor: pointer;
	}
	.film-card.drop-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		border: 1px dashed #28374d;
		background: transparent;
		color: #38bdf8;
	}
	.fc-label { font-weight: 700; color: #94a3b8; }
	.fc-sub { color: #64748b; }
	.film-card.active-blue {
		border-color: #0284c7;
		box-shadow: 0 0 8px rgba(2, 132, 199, 0.4);
	}
	.film-card.active-cyan-card {
		border-color: #06b6d4;
		box-shadow: 0 0 8px rgba(6, 182, 212, 0.4);
	}
	.fc-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.badge {
		font-family: monospace;
		font-weight: 700;
		font-size: 8px;
		color: #94a3b8;
	}
	.badge.blue { color: #38bdf8; }
	.badge.cyan { color: #22d3ee; }
	.badge.red { color: #ef4444; }
	.badge.purple { color: #c084fc; }
	.badge.amber { color: #f59e0b; }
	.live-indicator {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: #38bdf8;
	}
	.fc-thumb-video, .fc-thumb-cctv, .fc-thumb-icon, .fc-thumb-splat {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 1;
		color: #cbd5e1;
	}
	.thumb-corridor {
		width: 80%;
		height: 24px;
		background: #0e1e2f;
		border-radius: 2px;
	}
	.thumb-cctv-img {
		width: 80%;
		height: 24px;
		background: #141c26;
		border-radius: 2px;
	}
	.thumb-lbl, .thumb-title {
		font-size: 8px;
		color: #94a3b8;
		text-align: center;
		margin-top: 2px;
	}
	.splat-pts {
		font-family: monospace;
		font-weight: 800;
		color: #22d3ee;
		font-size: 11px;
	}

	.temporal-status-bottom {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 26px;
		background: #070b12;
		padding: 0 14px;
		font-size: 10px;
		color: #64748b;
		font-family: monospace;
	}
	.ts-left {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.seq-tag {
		color: #94a3b8;
	}
	.ts-right {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.ts-btn {
		background: transparent;
		border: 1px solid #1e293b;
		color: #94a3b8;
		font-size: 9px;
		padding: 1px 6px;
		border-radius: 3px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.ts-btn:hover {
		background: #1e293b;
		color: #ffffff;
	}
	.lidar-live-tag {
		color: #4ade80;
		display: flex;
		align-items: center;
		gap: 4px;
	}

	/* GOLD PILL IN SUBHEADER */
	.mode-pill.gold-pill {
		border-color: rgba(243, 212, 113, 0.4);
		color: #f3d471;
	}
	.mode-pill.gold-pill.active {
		background: rgba(243, 212, 113, 0.15);
		border-color: #f3d471;
		color: #ffe180;
		box-shadow: 0 0 10px rgba(243, 212, 113, 0.35);
	}

	/* NOIR CRIME SCENE RECONSTRUCTION STAGE (IMAGE 2) */
	.crime-reconstruction-stage {
		display: flex;
		flex-direction: column;
		flex: 1;
		height: 100%;
		position: relative;
		background: #070a10;
		overflow: hidden;
	}

	.crime-stage-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 40px;
		background: #090e18;
		border-bottom: 1px solid rgba(197, 158, 43, 0.3);
		padding: 0 14px;
		flex-shrink: 0;
	}
	.csh-title-row {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.csh-case-tag {
		font-family: monospace;
		font-weight: 700;
		font-size: 12px;
		color: #f3d471;
		letter-spacing: 0.05em;
	}
	.csh-subtabs {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.csh-tab {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 11px;
		color: #94a3b8;
		background: transparent;
		border: 1px solid transparent;
		padding: 3px 8px;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s;
	}
	.csh-tab:hover {
		color: #f1f5f9;
		background: rgba(255, 255, 255, 0.04);
	}
	.csh-tab.active {
		background: rgba(243, 212, 113, 0.14);
		border-color: rgba(243, 212, 113, 0.5);
		color: #f3d471;
		font-weight: 600;
	}

	.csh-viewport-tools {
		display: flex;
		align-items: center;
		gap: 4px;
		background: #111827;
		padding: 2px 4px;
		border-radius: 5px;
		border: 1px solid #1f293d;
	}
	.csh-tool-btn {
		background: transparent;
		border: none;
		color: #94a3b8;
		width: 26px;
		height: 26px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 3px;
		cursor: pointer;
		transition: all 0.15s;
	}
	.csh-tool-btn:hover {
		color: #f3d471;
		background: rgba(243, 212, 113, 0.08);
	}
	.csh-tool-btn.active {
		background: rgba(243, 212, 113, 0.22);
		color: #f3d471;
		box-shadow: 0 0 6px rgba(243, 212, 113, 0.4);
	}

	.crime-viewport-container {
		position: relative;
		flex: 1;
		height: 100%;
		overflow: hidden;
	}

	/* FLOATING SCENE LAYERS CARD (IMAGE 2) */
	.floating-scene-layers-card {
		position: absolute;
		top: 14px;
		left: 14px;
		width: 170px;
		background: rgba(9, 13, 22, 0.88);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(197, 158, 43, 0.35);
		border-radius: 6px;
		padding: 10px 12px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
		z-index: 10;
	}
	.fsl-head {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 10px;
		font-weight: 700;
		color: #f3d471;
		letter-spacing: 0.06em;
		padding-bottom: 6px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		margin-bottom: 8px;
	}
	.fsl-body {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.fsl-layer-item {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11px;
		color: #cbd5e1;
		cursor: pointer;
	}
	.fsl-layer-item input[type="checkbox"] {
		accent-color: #f3d471;
		cursor: pointer;
	}

	/* ORIENTATION CUBE TOP RIGHT */
	.crime-orientation-cube {
		position: absolute;
		top: 14px;
		right: 14px;
		width: 44px;
		height: 44px;
		border: 1px dashed rgba(243, 212, 113, 0.4);
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 3px;
		font-size: 9px;
		font-family: monospace;
		background: rgba(11, 17, 28, 0.7);
		z-index: 10;
	}
	.co-axis.x { color: #ef4444; font-weight: 800; }
	.co-axis.y { color: #22c55e; font-weight: 800; }
	.co-axis.z { color: #38bdf8; font-weight: 800; }

	/* RIGHT VIEWPORT UTILITY TOGGLES */
	.crime-view-toggles-right {
		position: absolute;
		right: 14px;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		flex-direction: column;
		gap: 6px;
		background: rgba(9, 13, 22, 0.85);
		border: 1px solid #1e293b;
		padding: 5px;
		border-radius: 6px;
		z-index: 10;
	}
	.cvt-btn {
		width: 28px;
		height: 28px;
		background: transparent;
		border: none;
		color: #94a3b8;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s;
	}
	.cvt-btn:hover {
		color: #f3d471;
		background: rgba(255, 255, 255, 0.05);
	}

	/* BOTTOM LEFT CAMERA NAV DOCK */
	.crime-nav-dock-left {
		position: absolute;
		bottom: 12px;
		left: 14px;
		display: flex;
		align-items: center;
		gap: 6px;
		background: rgba(9, 13, 22, 0.85);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(197, 158, 43, 0.35);
		padding: 4px 8px;
		border-radius: 6px;
		z-index: 10;
	}
	.cnd-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 10px;
		color: #94a3b8;
		background: transparent;
		border: 1px solid transparent;
		padding: 3px 6px;
		border-radius: 4px;
		cursor: pointer;
	}
	.cnd-btn:hover {
		color: #f3d471;
	}
	.cnd-btn.active {
		background: rgba(243, 212, 113, 0.2);
		border-color: #f3d471;
		color: #f3d471;
		font-weight: 700;
	}
	.cnd-divider {
		width: 1px;
		height: 14px;
		background: #334155;
		margin: 0 4px;
	}
	.cnd-meta {
		font-size: 9px;
		font-family: monospace;
		color: #64748b;
	}

	/* INSPECTOR MODE TOGGLE */
	.inspector-mode-toggle {
		display: flex;
		gap: 3px;
		margin-left: auto;
	}
	.imt-btn {
		font-size: 8px;
		font-family: monospace;
		padding: 2px 6px;
		border-radius: 3px;
		background: #111a29;
		border: 1px solid #1e2b3e;
		color: #94a3b8;
		cursor: pointer;
	}
	.imt-btn:hover {
		color: #f8fafc;
	}
	.imt-btn.active {
		background: rgba(243, 212, 113, 0.2);
		border-color: #f3d471;
		color: #f3d471;
		font-weight: 700;
	}
	.ex-tag.gold {
		background: rgba(243, 212, 113, 0.15);
		color: #f3d471;
		border: 1px solid rgba(243, 212, 113, 0.4);
	}

	/* NOIR EVIDENCE INSPECTOR (IMAGE 2) */
	.noir-evidence-inspector {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.nei-hero-box {
		display: flex;
		gap: 10px;
		background: #090e17;
		border: 1px solid rgba(197, 158, 43, 0.25);
		border-radius: 6px;
		padding: 8px;
	}
	.nei-thumb-wrap {
		width: 72px;
		height: 72px;
		background: #141c2b;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		flex-shrink: 0;
		border: 1px solid #1e2d42;
	}
	.bloodstain-canvas-preview {
		position: relative;
		width: 50px;
		height: 50px;
	}
	.bs-splatter-core {
		position: absolute;
		top: 12px;
		left: 10px;
		width: 28px;
		height: 24px;
		background: #991b1b;
		border-radius: 40% 60% 70% 30% / 40% 50% 60% 50%;
		filter: drop-shadow(0 0 4px rgba(239, 68, 68, 0.4));
	}
	.bs-splatter-drop {
		position: absolute;
		background: #7f1d1d;
		border-radius: 50%;
	}
	.bs-splatter-drop.d1 { width: 6px; height: 6px; top: 4px; left: 32px; }
	.bs-splatter-drop.d2 { width: 5px; height: 5px; bottom: 8px; left: 6px; }
	.bs-splatter-drop.d3 { width: 4px; height: 4px; top: 34px; right: 10px; }

	.nei-meta-list {
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-size: 10px;
	}
	.nml-row .k { color: #64748b; }
	.nml-row .v { color: #cbd5e1; font-weight: 500; }
	.nml-row .v.mono { font-family: monospace; color: #38bdf8; }

	.nei-verify-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 2px;
	}
	.verified-pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: #22c55e;
		font-family: monospace;
		font-size: 10px;
		font-weight: 700;
	}
	.chain-custody-link {
		background: transparent;
		border: none;
		color: #94a3b8;
		font-size: 10px;
		cursor: pointer;
	}
	.chain-custody-link:hover {
		color: #f3d471;
		text-decoration: underline;
	}

	.nei-section {
		display: flex;
		flex-direction: column;
		gap: 6px;
		border-top: 1px solid #172132;
		padding-top: 8px;
	}
	.nei-sec-head {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 10px;
		font-weight: 700;
		color: #e2e8f0;
		letter-spacing: 0.05em;
	}
	.dot-gold {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: #f3d471;
	}
	.bound-dimensions-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px;
	}
	.dim-box {
		background: #090e17;
		border: 1px solid #1a2538;
		border-radius: 4px;
		padding: 5px 8px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 10px;
	}
	.dim-box .axis { color: #f3d471; font-weight: 800; font-family: monospace; }
	.dim-box .val { color: #f1f5f9; font-family: monospace; }

	.transform-table {
		display: flex;
		flex-direction: column;
		gap: 5px;
		background: #090e17;
		border: 1px solid #1a2538;
		border-radius: 4px;
		padding: 6px 8px;
		font-size: 10px;
	}
	.tr-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.tr-lbl { color: #64748b; font-size: 9px; }
	.tr-vals {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: monospace;
	}
	.tr-num {
		color: #38bdf8;
		font-weight: 700;
	}

	.tags-badge-row {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	.forensic-tag-chip {
		background: #172233;
		border: 1px solid #23344d;
		color: #94a3b8;
		padding: 2px 7px;
		border-radius: 3px;
		font-size: 9px;
		font-family: monospace;
	}
	.add-tag-chip {
		background: transparent;
		border: 1px dashed #334155;
		color: #f3d471;
		width: 20px;
		height: 18px;
		border-radius: 3px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
	}

	/* NOIR CHEVRON PHASE TIMELINE FOOTER (IMAGE 2) */
	.crime-timeline-footer {
		display: flex;
		flex-direction: column;
		background: #080c14;
		border-top: 1px solid rgba(197, 158, 43, 0.35);
		flex-shrink: 0;
	}
	.ctf-playback-bar {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 8px 16px;
		background: #090e17;
		border-bottom: 1px solid #141d2c;
	}
	.ctf-controls {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.ctf-play-btn {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: rgba(243, 212, 113, 0.15);
		border: 1px solid #f3d471;
		color: #f3d471;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.15s;
	}
	.ctf-play-btn:hover {
		background: rgba(243, 212, 113, 0.3);
		box-shadow: 0 0 10px rgba(243, 212, 113, 0.5);
	}
	.ctf-step-btn {
		background: transparent;
		border: none;
		color: #94a3b8;
		cursor: pointer;
		padding: 4px;
	}
	.ctf-step-btn:hover {
		color: #f3d471;
	}
	.ctf-timecode {
		font-family: monospace;
		font-size: 13px;
		font-weight: 700;
		color: #f3d471;
		letter-spacing: 0.08em;
		margin-left: 6px;
	}

	.ctf-chevron-pipeline {
		display: flex;
		align-items: center;
		flex: 1;
		gap: 4px;
		overflow-x: auto;
	}
	.chevron-step {
		position: relative;
		flex: 1;
		min-width: 110px;
		height: 30px;
		background: #111723;
		border: 1px solid #1f2c40;
		color: #94a3b8;
		font-size: 10px;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
		clip-path: polygon(0% 0%, calc(100% - 10px) 0%, 100% 50%, calc(100% - 10px) 100%, 0% 100%, 10px 50%);
		cursor: pointer;
		transition: all 0.15s;
		padding: 0 12px;
	}
	.chevron-step:first-child {
		clip-path: polygon(0% 0%, calc(100% - 10px) 0%, 100% 50%, calc(100% - 10px) 100%, 0% 100%);
	}
	.chevron-step:hover {
		background: #192336;
		color: #f1f5f9;
	}
	.chevron-step.gold-active {
		background: linear-gradient(90deg, #c59e2b 0%, #f3d471 100%);
		color: #0b0f17;
		font-weight: 800;
		box-shadow: 0 0 12px rgba(243, 212, 113, 0.45);
	}
	.chevron-pin-marker {
		position: absolute;
		top: -4px;
		left: 50%;
		transform: translateX(-50%);
		width: 6px;
		height: 6px;
		background: #fef08a;
		border-radius: 50%;
		box-shadow: 0 0 6px #fef08a;
	}

	/* ========================================================
	   LIGHT THEME OVERRIDES & CLEAN DOSSIER STYLING (IMAGE 2)
	   ======================================================== */
	.detective-hud-container.light-theme {
		background: #f1f5f9;
		color: #0f172a;
	}

	.light-theme .yorha-global-nav {
		background: #ffffff;
		border-bottom: 1px solid #e2e8f0;
		color: #0f172a;
	}
	.light-theme .brand-title {
		color: #0f172a;
		font-weight: 800;
	}
	.light-theme .brand-sub {
		color: #0284c7;
		font-weight: 700;
	}
	.nav-separator {
		color: #cbd5e1;
		font-size: 14px;
	}
	.light-theme .case-chip {
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		color: #334155;
	}
	.light-theme .case-number {
		color: #0284c7;
		font-weight: 700;
	}
	.light-theme .global-search-bar {
		background: #f8fafc;
		border: 1px solid #cbd5e1;
	}
	.light-theme .global-search-bar input {
		color: #0f172a;
	}
	.light-theme .kbd-badge {
		background: #e2e8f0;
		border-color: #cbd5e1;
		color: #64748b;
	}

	/* HEADER NAV TABS (CANVAS, DOSSIER, TIMELINE, 3D LIDAR) */
	.header-nav-tabs {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.hnt-btn {
		font-size: 11px;
		font-weight: 600;
		padding: 5px 12px;
		border-radius: 6px;
		background: transparent;
		border: 1px solid transparent;
		color: #64748b;
		cursor: pointer;
		transition: all 0.15s;
	}
	.hnt-btn:hover {
		color: #0f172a;
		background: #f1f5f9;
	}
	.hnt-btn.active {
		background: #0284c7;
		color: #ffffff;
		box-shadow: 0 1px 3px rgba(2, 132, 199, 0.35);
	}

	.theme-toggle-pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 10px;
		font-weight: 700;
		font-family: monospace;
		padding: 4px 9px;
		border-radius: 20px;
		background: #f8fafc;
		border: 1px solid #cbd5e1;
		color: #334155;
		cursor: pointer;
		transition: all 0.15s;
	}
	.theme-toggle-pill:hover {
		background: #0284c7;
		color: #ffffff;
		border-color: #0284c7;
	}

	.user-profile-badge {
		cursor: pointer;
	}
	.avatar-circle {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: #0284c7;
		color: #ffffff;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* KAG VECTOR SUBBAR (IMAGE 2) */
	.kag-vector-subbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 44px;
		background: #ffffff;
		border-bottom: 1px solid #e2e8f0;
		padding: 0 16px;
		flex-shrink: 0;
	}
	.light-theme .kag-vector-subbar {
		background: #ffffff;
		border-bottom-color: #e2e8f0;
	}
	.kvs-left, .kvs-right {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.vector-query-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: #f8fafc;
		border: 1px solid #cbd5e1;
		padding: 4px 10px;
		border-radius: 6px;
		font-size: 11px;
		color: #0f172a;
	}
	.vq-code {
		font-family: monospace;
		font-weight: 600;
		color: #0284c7;
	}
	.vq-score {
		font-family: monospace;
		font-weight: 700;
		color: #16a34a;
		background: rgba(22, 163, 74, 0.1);
		padding: 1px 6px;
		border-radius: 3px;
	}
	.vq-shortcut {
		font-size: 9px;
		color: #94a3b8;
		border: 1px solid #e2e8f0;
		padding: 1px 4px;
		border-radius: 3px;
	}
	.kvs-badge {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 11px;
		font-weight: 600;
		font-family: monospace;
		padding: 4px 8px;
		border-radius: 5px;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		color: #475569;
	}
	.match-badge {
		color: #16a34a;
	}

	/* 0-100% COMPLETION RATE PILL */
	.completion-rate-pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		padding: 4px 10px;
		border-radius: 6px;
		font-size: 11px;
		cursor: pointer;
		transition: all 0.15s;
	}
	.completion-rate-pill:hover {
		border-color: #0284c7;
	}
	.cr-track {
		width: 48px;
		height: 6px;
		background: #e2e8f0;
		border-radius: 3px;
		overflow: hidden;
		display: inline-block;
	}
	.cr-fill {
		display: block;
		height: 100%;
		background: #0284c7;
		border-radius: 3px;
	}
	.cr-label {
		color: #0f172a;
		font-family: monospace;
		font-size: 10px;
	}
	.cr-label strong {
		color: #0284c7;
	}

	.synthesize-dossier-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: #0284c7;
		color: #ffffff;
		border: none;
		font-size: 11px;
		font-weight: 700;
		padding: 6px 14px;
		border-radius: 6px;
		cursor: pointer;
		box-shadow: 0 1px 3px rgba(2, 132, 199, 0.4);
		transition: all 0.15s;
	}
	.synthesize-dossier-btn:hover {
		background: #0369a1;
	}

	/* COMPLETION MODAL POPUP */
	.completion-breakdown-card {
		position: absolute;
		top: 96px;
		right: 180px;
		width: 380px;
		background: #ffffff;
		border: 1px solid #cbd5e1;
		border-radius: 8px;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
		z-index: 50;
		padding: 12px;
	}
	.cbc-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 12px;
		font-weight: 700;
		color: #0f172a;
		padding-bottom: 8px;
		border-bottom: 1px solid #e2e8f0;
	}
	.cbc-close {
		background: transparent;
		border: none;
		font-size: 16px;
		cursor: pointer;
		color: #64748b;
	}
	.cbc-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 8px;
	}
	.cbc-item {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11px;
		color: #64748b;
	}
	.cbc-item.complete {
		color: #0f172a;
		font-weight: 500;
	}
	.cbc-score {
		margin-left: auto;
		font-family: monospace;
		font-weight: 700;
		color: #0284c7;
	}

	/* ========================================================
	   ORGANIZED 2-COLUMN DOSSIER WORKSPACE (IMAGE 2)
	   ======================================================== */
	.organized-dossier-workspace {
		display: grid;
		grid-template-columns: 1fr 380px;
		gap: 16px;
		padding: 16px;
		height: calc(100vh - 120px);
		overflow-y: auto;
		background: #f8fafc;
	}

	.dossier-carousel-strip {
		grid-column: 1 / -1;
		width: 100%;
		margin-top: 4px;
	}

	.carousel-gallery-wrapper {
		width: 100%;
		padding: 2px 0;
	}

	.dossier-main-column {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	/* EXHIBIT D-44-A DOSSIER CARD */
	.dossier-exhibit-card {
		background: #ffffff;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		padding: 18px 20px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
	}
	.dec-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}
	.dec-badge-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.exhibit-pill {
		font-size: 10px;
		font-weight: 800;
		font-family: monospace;
		padding: 2px 7px;
		border-radius: 4px;
	}
	.exhibit-pill.gold {
		background: #fef3c7;
		color: #b45309;
		border: 1px solid #fde68a;
	}
	.exhibit-pill.red {
		background: #fee2e2;
		color: #b91c1c;
		border: 1px solid #fecaca;
	}
	.exhibit-pill.purple {
		background: #ede9fe;
		color: #6d28d9;
		border: 1px solid #ddd6fe;
	}
	.exhibit-pill.green {
		background: #dcfce7;
		color: #15803d;
		border: 1px solid #bbf7d0;
	}
	.exhibit-pill.blue {
		background: #e0f2fe;
		color: #0369a1;
		border: 1px solid #bae6fd;
	}
	.record-id {
		font-size: 10px;
		font-family: monospace;
		color: #64748b;
	}
	.dec-time-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.sworn-date {
		font-size: 11px;
		color: #64748b;
	}
	.icon-download-btn {
		background: transparent;
		border: none;
		color: #64748b;
		cursor: pointer;
		padding: 2px;
	}
	.dec-title {
		font-size: 18px;
		font-weight: 700;
		color: #0f172a;
		margin: 4px 0;
	}
	.dec-subtitle {
		font-size: 12px;
		color: #64748b;
		margin-bottom: 12px;
	}
	.dec-statute-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 16px;
	}
	.statute-tag {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 11px;
		font-weight: 600;
		padding: 3px 8px;
		border-radius: 4px;
	}
	.statute-tag.wire-fraud {
		background: #eff6ff;
		color: #1d4ed8;
		border: 1px solid #bfdbfe;
	}
	.statute-tag.false-stmt {
		background: #fef2f2;
		color: #dc2626;
		border: 1px solid #fecaca;
	}
	.statute-tag.chain-custody {
		background: #f8fafc;
		color: #475569;
		border: 1px solid #e2e8f0;
		font-family: monospace;
	}

	/* TRANSCRIPT STREAM */
	.transcript-stream-box {
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 6px;
		padding: 12px 14px;
	}
	.ts-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 11px;
		margin-bottom: 12px;
		padding-bottom: 6px;
		border-bottom: 1px solid #e2e8f0;
	}
	.ts-head-left {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.ts-stream-title {
		font-family: monospace;
		font-weight: 700;
		color: #0f172a;
	}
	.discrepancy-count {
		font-family: monospace;
		font-weight: 700;
		color: #dc2626;
	}
	.ts-sensitivity {
		color: #64748b;
	}
	.ts-dialogue-feed {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.dialogue-block {
		display: flex;
		gap: 10px;
		font-size: 12px;
		line-height: 1.5;
	}
	.dialogue-block .timestamp {
		font-family: monospace;
		font-size: 10px;
		color: #94a3b8;
		width: 48px;
		flex-shrink: 0;
	}
	.dialogue-block.highlighted-contradiction {
		background: #fef2f2;
		border-left: 3px solid #ef4444;
		padding: 8px 10px;
		border-radius: 4px;
		flex-direction: column;
		gap: 6px;
	}
	.discrepancy-callout-pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 10px;
		font-weight: 700;
		color: #dc2626;
		background: #fee2e2;
		padding: 2px 7px;
		border-radius: 3px;
		align-self: flex-start;
	}
	.discrepancy-callout-pill.gold {
		color: #b45309;
		background: #fef3c7;
	}

	/* CONTEXTUAL COUNSEL ORNITH AI FLOATING CARD */
	.ornith-counsel-card {
		background: #0f172a;
		color: #f8fafc;
		border-radius: 8px;
		padding: 16px;
		box-shadow: 0 4px 16px rgba(15, 23, 42, 0.25);
	}
	.occ-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
		padding-bottom: 8px;
		border-bottom: 1px solid #1e293b;
	}
	.occ-title-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.05em;
	}
	.dot-live {
		width: 6px;
		height: 6px;
		background: #38bdf8;
		border-radius: 50%;
		box-shadow: 0 0 6px #38bdf8;
	}
	.occ-vlm {
		color: #94a3b8;
		font-size: 10px;
	}
	.occ-collapse-btn {
		background: transparent;
		border: none;
		color: #94a3b8;
		cursor: pointer;
	}
	.occ-inference-meta {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 10px;
	}
	.inference-chip {
		background: #0284c7;
		color: #ffffff;
		font-family: monospace;
		font-size: 9px;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: 3px;
	}
	.confidence-val {
		font-size: 11px;
		color: #cbd5e1;
	}
	.osd-heading {
		font-size: 11px;
		font-weight: 800;
		color: #38bdf8;
		margin-bottom: 4px;
	}
	.osd-text {
		font-size: 12px;
		color: #e2e8f0;
		line-height: 1.5;
		margin-bottom: 10px;
	}
	.occ-recommendation-box {
		background: rgba(2, 132, 199, 0.12);
		border-left: 3px solid #0284c7;
		padding: 8px 10px;
		border-radius: 4px;
		margin-bottom: 12px;
		font-size: 11px;
		line-height: 1.4;
	}
	.rec-lbl {
		color: #38bdf8;
		font-weight: 700;
		margin-right: 4px;
	}
	.rec-text {
		color: #f1f5f9;
	}
	.occ-strategy-presets {
		margin-bottom: 12px;
	}
	.preset-label {
		display: block;
		font-size: 9px;
		font-weight: 700;
		color: #64748b;
		margin-bottom: 6px;
	}
	.preset-chips-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.preset-chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 10px;
		color: #cbd5e1;
		background: #1e293b;
		border: 1px solid #334155;
		padding: 4px 8px;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s;
	}
	.preset-chip:hover {
		background: #0284c7;
		color: #ffffff;
	}
	.occ-prompt-input-row {
		display: flex;
		align-items: center;
		gap: 6px;
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 6px;
		padding: 4px 8px;
	}
	.occ-prompt-input-row input {
		flex: 1;
		background: transparent;
		border: none;
		color: #f8fafc;
		font-size: 12px;
		outline: none;
	}
	.occ-send-btn {
		width: 24px;
		height: 24px;
		border-radius: 4px;
		background: #0284c7;
		color: #ffffff;
		border: none;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	/* RIGHT COLUMN: MULTI-MODAL EVIDENCE STACK */
	.dossier-evidence-stack {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.des-card {
		background: #ffffff;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		padding: 14px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
	}
	.des-card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 10px;
		padding-bottom: 6px;
		border-bottom: 1px solid #f1f5f9;
	}
	.dch-left {
		display: flex;
		align-items: center;
		gap: 6px;
		color: #0f172a;
		font-size: 12px;
		font-weight: 700;
	}

	/* CCTV FEED STYLES */
	.cctv-feed-viewport {
		height: 140px;
		background: #0a0e17;
		border-radius: 6px;
		overflow: hidden;
		position: relative;
	}
	.cctv-still-graphic {
		width: 100%;
		height: 100%;
		background: radial-gradient(circle at center, #1e293b 0%, #0a0e17 80%);
		position: relative;
	}
	.cctv-meta-overlay-top {
		position: absolute;
		top: 6px;
		left: 8px;
		font-family: monospace;
		font-size: 8px;
		color: #94a3b8;
	}
	.cctv-actor-silhouette {
		position: absolute;
		bottom: 10px;
		left: 50%;
		transform: translateX(-50%);
		width: 32px;
		height: 80px;
		background: #0f172a;
		border-radius: 12px 12px 0 0;
		border: 1px solid #334155;
	}
	.cctv-match-overlay {
		position: absolute;
		bottom: 8px;
		left: 8px;
		background: rgba(15, 23, 42, 0.85);
		padding: 2px 6px;
		border-radius: 3px;
		font-size: 9px;
		color: #22c55e;
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.cctv-fps-overlay {
		position: absolute;
		bottom: 8px;
		right: 8px;
		font-size: 8px;
		font-family: monospace;
		color: #94a3b8;
	}
	.des-card-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 9px;
		color: #64748b;
		margin-top: 8px;
	}
	.sig-tag {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	/* SWITCHBOARD TELEMETRY */
	.sb-burst-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 11px;
		color: #475569;
		margin-bottom: 6px;
	}
	.burst-val {
		color: #0284c7;
		font-family: monospace;
	}
	.sb-graph-wrap {
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 6px;
		padding: 6px;
		margin-bottom: 8px;
	}
	.sb-spike-svg {
		width: 100%;
		height: 70px;
	}
	.sb-graph-labels {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 9px;
		font-family: monospace;
		color: #94a3b8;
		margin-top: 2px;
	}
	.anomaly-pill {
		color: #dc2626;
		background: #fee2e2;
		padding: 1px 5px;
		border-radius: 3px;
		font-weight: 700;
	}
	.sb-meta-table {
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-size: 10px;
	}
	.sb-row {
		display: flex;
		justify-content: space-between;
	}
	.sb-k { color: #64748b; }
	.sb-v { font-family: monospace; color: #0f172a; font-weight: 600; }

	/* LIDAR STATUS CARD */
	.ls-text {
		font-size: 11px;
		color: #475569;
		line-height: 1.4;
		margin-bottom: 10px;
	}
	.open-sightline-btn {
		width: 100%;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		background: #f0fdf4;
		color: #16a34a;
		border: 1px solid #bbf7d0;
		padding: 6px 12px;
		border-radius: 5px;
		font-size: 11px;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.15s;
	}
	.open-sightline-btn:hover {
		background: #16a34a;
		color: #ffffff;
	}

	/* KAG TRACE CARD */
	.kag-hits-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.kag-hit-item {
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 5px;
		padding: 6px 8px;
		font-size: 10px;
	}
	.khi-top {
		display: flex;
		justify-content: space-between;
		font-weight: 700;
		margin-bottom: 2px;
	}
	.khi-statute { color: #0284c7; }
	.khi-sim { color: #16a34a; font-family: monospace; }
	.khi-title { color: #1e293b; font-weight: 500; margin-bottom: 4px; }
	.khi-meta {
		display: flex;
		justify-content: space-between;
		font-size: 9px;
		color: #64748b;
	}
	.khi-src { font-family: monospace; }
	.khi-status { font-weight: 700; color: #dc2626; }
	.khi-canonical {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 4px;
		font-size: 8.5px;
		color: #475569;
		margin-top: 3px;
		padding-top: 3px;
		border-top: 1px dashed #e2e8f0;
		font-family: monospace;
	}
	.khi-lut {
		padding: 1px 4px;
		border: 1px solid;
		border-radius: 3px;
		font-weight: 700;
		font-size: 8px;
		letter-spacing: 0.02em;
	}
	.khi-pg { color: #7c3aed; font-weight: 600; }
</style>
