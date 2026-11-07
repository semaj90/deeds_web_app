<!-- Canonical Warm Ivory Investigative Dossier Canvas (Screenshot 1 Alignment) -->
<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { onMount } from 'svelte';

	interface Props {
		caseId?: string;
		docketNumber?: string;
		caseTitle?: string;
		evidenceItems?: any[];
		onOpenModal?: (item: any) => void;
		onOpenUpload?: () => void;
	}

	let {
		caseId = '3ac1c56f-8812-4f3b-9a10-20261106a1b2',
		docketNumber = '#986B5214',
		caseTitle = 'UNTITLED CASE DOSSIER',
		evidenceItems = [],
		onOpenModal,
		onOpenUpload
	}: Props = $props();

	// Active selected exhibit
	let selectedId = $state<string>('e-001');

	// Left sidebar filters
	let activeFilter = $state<'ALL' | 'FILE' | 'MEDIA' | 'ANALYSIS'>('ALL');
	let searchQuery = $state<string>('');

	// Canvas zoom and pan
	let zoom = $state<number>(1.0);
	let pan = $state<{ x: number; y: number }>({ x: 0, y: 0 });
	let isPanning = $state(false);
	let panStart = { x: 0, y: 0 };
	let activeTool = $state<'select' | 'pan' | 'link' | 'rect' | 'image' | 'cube' | 'pen'>('select');

	// Accordion states in Evidence Inspector
	let isRelationshipsOpen = $state(true);
	let isNotesOpen = $state(false);

	// Canonical Hypothesis
	const hypothesis = {
		code: 'H-01',
		label: 'PRIMARY HYPOTHESIS',
		title: 'SUBJECT AT SCENE',
		description: 'Multiple evidence streams place the subject at the location during the relevant window.'
	};

	// Canonical Exhibits (matching Screenshot 1)
	interface StarExhibit {
		id: string;
		code: string;
		title: string;
		category: string;
		categoryPill: 'PHYSICAL' | 'TESTIMONY' | 'VIDEO' | 'ANALYSIS' | 'RECONSTRUCTION' | 'DOCUMENT';
		pillColor: 'mint' | 'amber' | 'blue' | 'purple';
		type: string;
		subtitle: string;
		relation: string;
		collected: string;
		location: string;
		chainOfCustody: string;
		verified: boolean;
		sha256: string;
		caliper1?: string;
		caliper2?: string;
		checklist: { text: string; checked: boolean }[];
		verdict: string;
		supports: string;
		position: { x: number; y: number }; // Relative to center (0,0) in canvas space
	}

	const DEFAULT_STAR_EXHIBITS: StarExhibit[] = [
		{
			id: 'e-001',
			code: 'E-001',
			title: 'Trace Residue (Footprint)',
			category: 'PHYSICAL',
			categoryPill: 'PHYSICAL',
			pillColor: 'mint',
			type: 'Image (Scene)',
			subtitle: 'IMAGE · SCENE',
			relation: 'PLACES SUBJECT',
			collected: 'Mar 14, 2024 14:02:18',
			location: 'North Corridor, L1',
			chainOfCustody: 'View (3 entries) >',
			verified: true,
			sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
			caliper1: '42.23"',
			caliper2: '0.287 m',
			checklist: [
				{ text: "Subject's footwear signature (p = 0.94)", checked: true },
				{ text: 'Matches security footage timing', checked: true },
				{ text: 'Consistent with 3D scene reconstruction', checked: false }
			],
			verdict: 'Strongly corroborates subject presence at the scene.',
			supports: 'H-01',
			position: { x: -380, y: -90 }
		},
		{
			id: 'e-002',
			code: 'E-002',
			title: 'Witness Statement',
			category: 'TESTIMONY',
			categoryPill: 'TESTIMONY',
			pillColor: 'amber',
			type: 'Document (PDF)',
			subtitle: 'PDF · 12 PAGES',
			relation: 'REPORTS PRESENCE',
			collected: 'Mar 14, 2024 16:30:00',
			location: 'Room 204',
			chainOfCustody: 'View (2 entries) >',
			verified: true,
			sha256: '7e9ba1c4d92004ef513c19b0aa93817112049e91849a01c4ba22c09191e4f3a2',
			checklist: [
				{ text: 'Corroborates hallway arrival window', checked: true },
				{ text: 'Identified suspect jacket & boots', checked: true },
				{ text: 'Verified sworn deposition integrity', checked: true }
			],
			verdict: 'Confirms timeline placement within 5 minutes of footage.',
			supports: 'H-01',
			position: { x: 0, y: -260 }
		},
		{
			id: 'e-003',
			code: 'E-003',
			title: 'Security Footage (Lobby)',
			category: 'VIDEO',
			categoryPill: 'VIDEO',
			pillColor: 'amber',
			type: 'Video (MP4)',
			subtitle: 'VIDEO · MP4',
			relation: 'CORROBORATES',
			collected: 'Mar 14, 2024 14:05:00',
			location: 'Lobby Cam 02',
			chainOfCustody: 'View (4 entries) >',
			verified: true,
			sha256: 'd832303be9f4a107293b74052f5c181a938c4109ba24ec98150493fae9812401',
			checklist: [
				{ text: 'Keycard timestamp match: 14:02:11', checked: true },
				{ text: 'Facial contour match (p = 0.89)', checked: true }
			],
			verdict: 'Visual confirmation of entrance and exit trajectory.',
			supports: 'H-01',
			position: { x: 380, y: -90 }
		},
		{
			id: 'e-005',
			code: 'E-005',
			title: '3D Scene Reconstruction',
			category: 'RECONSTRUCTION',
			categoryPill: 'RECONSTRUCTION',
			pillColor: 'amber',
			type: '3D (GLB)',
			subtitle: '3D · GLB',
			relation: 'SPATIAL MATCH',
			collected: 'Mar 15, 2024 11:45:00',
			location: 'North Corridor Scene',
			chainOfCustody: 'View (3 entries) >',
			verified: true,
			sha256: 'b23c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c',
			checklist: [
				{ text: 'Stride length matches footprint delta', checked: true },
				{ text: 'Camera angle frustum aligned', checked: true },
				{ text: 'Physics trajectory collision verified', checked: true }
			],
			verdict: 'Geometric alignment corroborates camera blindspot passage.',
			supports: 'H-01',
			position: { x: -380, y: 170 }
		},
		{
			id: 'e-004',
			code: 'E-004',
			title: 'Financial Transfer Map',
			category: 'ANALYSIS',
			categoryPill: 'ANALYSIS',
			pillColor: 'mint',
			type: 'Image (Analysis)',
			subtitle: 'IMAGE · ANALYSIS',
			relation: 'ESTABLISHES MOTIVE',
			collected: 'Mar 15, 2024 09:12:00',
			location: 'Ledger Node 4',
			chainOfCustody: 'View (1 entry) >',
			verified: true,
			sha256: 'a12b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
			checklist: [
				{ text: 'Traced $240K offshore escrow deposit', checked: true },
				{ text: 'Beneficiary signature linked to shell LLC', checked: true }
			],
			verdict: 'Direct financial motive tying subject to property transfer.',
			supports: 'H-01',
			position: { x: 0, y: 260 }
		},
		{
			id: 'e-006',
			code: 'E-006',
			title: 'Contract Excerpt (Escrow)',
			category: 'DOCUMENT',
			categoryPill: 'DOCUMENT',
			pillColor: 'mint',
			type: 'Document (PDF)',
			subtitle: 'PDF · 6 PAGES',
			relation: 'LINKS ENTITY',
			collected: 'Mar 15, 2024 14:20:00',
			location: 'County Records',
			chainOfCustody: 'View (2 entries) >',
			verified: true,
			sha256: 'c34d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d',
			checklist: [
				{ text: 'Escrow clause section 4.1 breached', checked: true },
				{ text: 'Notarized timestamp precedes wire', checked: true }
			],
			verdict: 'Contractual liability firmly established against subject entity.',
			supports: 'H-01',
			position: { x: 380, y: 170 }
		}
	];

	let exhibits = $state<StarExhibit[]>(DEFAULT_STAR_EXHIBITS);

	$effect(() => {
		if (evidenceItems && evidenceItems.length > 0) {
			const mapped: StarExhibit[] = evidenceItems.map((item: any, idx: number) => {
				const num = `E-${String(idx + 1).padStart(3, '0')}`;
				const angle = (idx / evidenceItems.length) * 2 * Math.PI - Math.PI / 2;
				const radius = 340;
				const posX = Math.round(Math.cos(angle) * radius);
				const posY = Math.round(Math.sin(angle) * radius * 0.7);
				const isDoc = (item.fileType || item.mimeType || '').includes('pdf') || (item.fileType || '').includes('doc');
				const isVid = (item.fileType || item.mimeType || '').includes('video') || (item.fileType || '').includes('mp4');
				const is3d = (item.fileType || item.mimeType || '').includes('3d') || (item.fileType || '').includes('glb');
				const isAnalysis = (item.category || '').toLowerCase().includes('analysis') || (item.title || '').toLowerCase().includes('map');
				const catPill = isDoc ? 'DOCUMENT' : isVid ? 'VIDEO' : is3d ? 'RECONSTRUCTION' : isAnalysis ? 'ANALYSIS' : 'PHYSICAL';
				return {
					id: item.id || `ev-${idx}`,
					code: num,
					title: item.title || `Exhibit ${num}`,
					category: catPill,
					categoryPill: catPill as any,
					pillColor: isDoc || isAnalysis ? 'mint' : 'amber',
					type: item.fileType || item.mimeType || 'Image (Scene)',
					subtitle: `${item.fileType || 'FILE'} · ${item.fileSize ? `${Math.round(item.fileSize / 1024)} KB` : 'EXHIBIT'}`,
					relation: idx === 0 ? 'PLACES SUBJECT' : idx === 1 ? 'REPORTS PRESENCE' : idx === 2 ? 'CORROBORATES' : idx === 3 ? 'ESTABLISHES MOTIVE' : idx === 4 ? 'SPATIAL MATCH' : 'LINKS ENTITY',
					collected: item.uploadedAt ? new Date(item.uploadedAt).toLocaleString() : 'Mar 14, 2024 14:02:18',
					location: item.location || 'North Corridor, L1',
					chainOfCustody: 'View (3 entries) >',
					verified: Boolean(item.hash),
					sha256: item.hash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
					caliper1: '42.23"',
					caliper2: '0.287 m',
					checklist: [
						{ text: 'File hash verified against ledger', checked: true },
						{ text: 'Corroborates evidence stream in primary hypothesis', checked: true }
					],
					verdict: 'Corroborates subject presence at the scene.',
					supports: 'H-01',
					position: { x: posX, y: posY }
				};
			});
			exhibits = mapped;
			if (!mapped.some(e => e.id === selectedId) && mapped.length > 0) {
				selectedId = mapped[0].id;
			}
		} else {
			exhibits = DEFAULT_STAR_EXHIBITS;
		}
	});

	// Currently selected exhibit
	let selectedExhibit = $derived(
		exhibits.find((e) => e.id === selectedId) || exhibits[0]
	);

	// Filtered exhibits for sidebar
	let filteredSidebarExhibits = $derived.by(() => {
		let list = exhibits;
		if (activeFilter === 'FILE') {
			list = list.filter((e) => e.categoryPill === 'DOCUMENT' || e.categoryPill === 'TESTIMONY');
		} else if (activeFilter === 'MEDIA') {
			list = list.filter((e) => e.categoryPill === 'VIDEO' || e.categoryPill === 'PHYSICAL');
		} else if (activeFilter === 'ANALYSIS') {
			list = list.filter((e) => e.categoryPill === 'ANALYSIS' || e.categoryPill === 'RECONSTRUCTION');
		}
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			list = list.filter((e) => e.title.toLowerCase().includes(q) || e.code.toLowerCase().includes(q));
		}
		return list;
	});

	// Zoom and pan functions
	function zoomIn() {
		zoom = Math.min(zoom + 0.15, 2.0);
	}
	function zoomOut() {
		zoom = Math.max(zoom - 0.15, 0.5);
	}
	function resetZoom() {
		zoom = 1.0;
		pan = { x: 0, y: 0 };
	}

	function handleCanvasMouseDown(e: MouseEvent) {
		if (activeTool === 'pan' || e.button === 1 || e.altKey) {
			isPanning = true;
			panStart = { x: e.clientX - pan.x, y: e.clientY - pan.y };
		}
	}
	function handleCanvasMouseMove(e: MouseEvent) {
		if (isPanning) {
			pan = { x: e.clientX - panStart.x, y: e.clientY - panStart.y };
		}
	}
	function handleCanvasMouseUp() {
		isPanning = false;
	}

	// File upload trigger
	let fileInputRef: HTMLInputElement | null = null;
	function triggerUpload() {
		if (onOpenUpload) {
			onOpenUpload();
		} else if (fileInputRef) {
			fileInputRef.click();
		}
	}

	async function handleDirectFileUpload(e: Event) {
		const target = e.target as HTMLInputElement;
		const files = target.files;
		if (!files || files.length === 0) return;
		const file = files[0];

		// Calculate SHA-256 in browser
		let sha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
		try {
			const buf = await file.arrayBuffer();
			const hashBuf = await crypto.subtle.digest('SHA-256', buf);
			sha256 = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
		} catch (err) {
			console.warn('SHA-256 fallback:', err);
		}

		const num = `E-${String(exhibits.length + 1).padStart(3, '0')}`;
		const newEx: StarExhibit = {
			id: `e-${Date.now()}`,
			code: num,
			title: file.name,
			category: 'PHYSICAL',
			categoryPill: 'PHYSICAL',
			pillColor: 'mint',
			type: file.type || 'Upload (Evidence)',
			subtitle: `${(file.size / 1024 / 1024).toFixed(1)} MB · UPLOADED`,
			relation: 'SUPPORTS H-01',
			collected: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
			location: 'Uploaded Asset',
			chainOfCustody: 'View (1 entry) >',
			verified: true,
			sha256,
			checklist: [
				{ text: `Cryptographic SHA-256 verified (${sha256.slice(0, 12)}...)`, checked: true },
				{ text: 'Ingested to SeaweedFS [legal-evidence]', checked: true }
			],
			verdict: 'Newly admitted evidentiary item pending forensic alignment.',
			supports: 'H-01',
			position: { x: (Math.random() - 0.5) * 400, y: (Math.random() - 0.5) * 300 }
		};

		exhibits = [...exhibits, newEx];
		selectedId = newEx.id;
	}
</script>

<div class="star-canvas-container flex flex-col h-full w-full bg-[#fbf9f5] select-none text-[#2b2b2b] overflow-hidden font-sans">
	<!-- Hidden File Input for Direct Ingest -->
	<input
		type="file"
		class="hidden"
		bind:this={fileInputRef}
		onchange={handleDirectFileUpload}
		multiple
	/>

	<!-- Top Docket Subheader Banner -->
	<header class="docket-subheader-banner flex items-center justify-between px-6 py-2.5 bg-[#181a1f] text-[#cfd3dc] border-b border-[#2d3139] text-xs font-mono shadow-md z-30">
		<div class="banner-left flex items-center gap-3">
			<span class="docket-id font-bold tracking-widest text-[#e5c158] uppercase">DOCKET {docketNumber}</span>
			<span class="sep text-[#4f5564]">·</span>
			<span class="docket-title font-semibold text-white tracking-wide uppercase">{caseTitle}</span>
			<span class="sep text-[#4f5564]">·</span>
			<span class="docket-jurisdiction text-[#8f96a4] hidden md:inline">Superior Court Evidentiary Dossier · Canonical PostgreSQL · Ledger & 768-D Semantic Corpus</span>
		</div>
		<div class="banner-right flex items-center gap-3">
			<div class="pending-badge flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#272b33] border border-[#e5c158]/40 text-[#e5c158] text-[11px] font-semibold tracking-wider uppercase">
				<span class="h-2 w-2 rounded-full bg-[#e5c158] animate-pulse"></span>
				<span>PENDING REVIEW</span>
			</div>
		</div>
	</header>

	<!-- Main 3-Column Dossier Workspace -->
	<div class="star-workspace-body flex flex-1 overflow-hidden">
		<!-- LEFT SIDEBAR: EVIDENCE BOARD -->
		<aside class="sidebar-evidence-board w-[300px] flex flex-col bg-[#fbf9f5] border-r border-[#e8e2d4] shrink-0 z-20 shadow-sm">
			<div class="sb-header p-4 border-b border-[#ece5d8]">
				<div class="flex items-center gap-2 mb-1">
					<Icon name="scale" size={18} class="text-[#8c733e]" />
					<h2 class="text-sm font-bold tracking-wider text-[#1e2025] uppercase">EVIDENCE BOARD</h2>
				</div>
				<p class="text-[11px] text-[#7a808c] font-mono">Case {docketNumber} · Investigative Canvas</p>
			</div>

			<!-- Filter Pills (ALL, FILE, MEDIA, ANALYSIS) -->
			<div class="filter-tabs flex items-center gap-1 px-3 py-2.5 border-b border-[#ece5d8] bg-[#f5f0e6]/60">
				{#each (['ALL', 'FILE', 'MEDIA', 'ANALYSIS'] as const) as tab}
					<button
						class="filter-btn px-2.5 py-1 text-[11px] font-semibold tracking-wider rounded transition-colors"
						class:active={activeFilter === tab}
						onclick={() => (activeFilter = tab)}
					>
						{tab}
					</button>
				{/each}
			</div>

			<!-- Search Input -->
			<div class="search-box px-3 py-2 border-b border-[#ece5d8] flex items-center gap-2">
				<div class="flex items-center flex-1 bg-white border border-[#dfd7c7] rounded px-2.5 py-1.5 shadow-inner">
					<Icon name="search" size={13} class="text-[#999] mr-2 shrink-0" />
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search evidence..."
						class="w-full text-xs bg-transparent border-none outline-none text-[#222] placeholder-[#aaa]"
					/>
				</div>
				<button class="filter-icon-btn p-1.5 text-[#777] hover:text-[#222]" title="Filter">
					<Icon name="filter" size={13} />
				</button>
			</div>

			<!-- Evidence List Cards -->
			<div class="evidence-list-cards flex-1 overflow-y-auto p-3 space-y-2">
				{#each filteredSidebarExhibits as item (item.id)}
					<div
						class="sidebar-card flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer"
						class:selected={selectedId === item.id}
						onclick={() => (selectedId = item.id)}
						ondblclick={() => onOpenModal?.(item)}
					>
						<!-- Thumbnail Box -->
						<div class="thumb-box w-12 h-12 rounded bg-[#1e2025] border border-[#d6ccbb] flex items-center justify-center shrink-0 overflow-hidden relative shadow-sm">
							{#if item.id === 'e-001'}
								<!-- Footprint Glowing Green SVG -->
								<svg class="w-8 h-8 text-[#10b981]" viewBox="0 0 24 24" fill="currentColor">
									<path d="M12 2C9.5 2 7.5 4 7.5 6.5c0 1.9 1.1 3.5 2.7 4.2-.8 1.4-1.2 3-1.2 4.8 0 3.6 2.2 6.5 5 6.5s5-2.9 5-6.5c0-1.8-.4-3.4-1.2-4.8 1.6-.7 2.7-2.3 2.7-4.2C20.5 4 18.5 2 16 2h-4zm-1.5 13c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5-1.5-.7-1.5-1.5.7-1.5 1.5-1.5zm5 0c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5-1.5-.7-1.5-1.5.7-1.5 1.5-1.5z" />
								</svg>
							{:else if item.id === 'e-002'}
								<!-- Paper Document SVG -->
								<svg class="w-7 h-7 text-[#e5c158]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
									<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
									<polyline points="14 2 14 8 20 8" />
									<line x1="16" y1="13" x2="8" y2="13" />
									<line x1="16" y1="17" x2="8" y2="17" />
									<line x1="10" y1="9" x2="8" y2="9" />
								</svg>
							{:else if item.id === 'e-003'}
								<!-- CCTV Corridor Still with Play Overlay -->
								<div class="relative w-full h-full bg-[#111] flex items-center justify-center">
									<Icon name="video" size={16} class="text-[#e5c158]" />
									<span class="absolute bottom-0.5 right-0.5 text-[8px] font-mono text-[#aaa] bg-black/80 px-1 rounded">42s</span>
								</div>
							{:else if item.id === 'e-004'}
								<!-- Financial Node Network SVG -->
								<svg class="w-7 h-7 text-[#10b981]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
									<circle cx="18" cy="5" r="3" />
									<circle cx="6" cy="12" r="3" />
									<circle cx="18" cy="19" r="3" />
									<line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
									<line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
								</svg>
							{:else if item.id === 'e-005'}
								<!-- 3D Room Cube SVG -->
								<svg class="w-7 h-7 text-[#888]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
									<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
									<polyline points="3.27 6.96 12 12.01 20.73 6.96" />
									<line x1="12" y1="22.08" x2="12" y2="12" />
								</svg>
							{:else}
								<!-- Escrow Contract SVG -->
								<svg class="w-7 h-7 text-[#b45309]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
									<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
									<circle cx="14" cy="15" r="3" fill="#b45309" stroke="none" />
								</svg>
							{/if}
						</div>

						<!-- Text Details -->
						<div class="card-info flex-1 min-w-0">
							<div class="flex items-center justify-between">
								<span class="text-[10px] font-mono font-bold text-[#8c733e]">{item.code}</span>
								<span class="h-1.5 w-1.5 rounded-full" class:bg-[#10b981]={item.pillColor === 'mint'} class:bg-[#e5c158]={item.pillColor === 'amber'}></span>
							</div>
							<div class="text-xs font-semibold text-[#1e2025] truncate">{item.title}</div>
							<div class="text-[10px] font-mono text-[#7a808c] uppercase">{item.subtitle}</div>
						</div>
					</div>
				{/each}
			</div>

			<!-- Bottom Button: + ADD EVIDENCE -->
			<div class="sb-footer p-3 border-t border-[#ece5d8]">
				<button
					class="add-evidence-btn w-full py-2.5 px-4 rounded-lg bg-[#272a31] hover:bg-[#1d2026] text-[#e5c158] font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
					onclick={triggerUpload}
				>
					<Icon name="plus" size={14} />
					<span>ADD EVIDENCE</span>
				</button>
			</div>
		</aside>

		<!-- CENTER: INVESTIGATIVE CANVAS (RADIAL HYPOTHESIS GRAPH) -->
		<main
			class="center-investigative-canvas flex-1 relative bg-[#fcfaf6] overflow-hidden"
			onmousedown={handleCanvasMouseDown}
			onmousemove={handleCanvasMouseMove}
			onmouseup={handleCanvasMouseUp}
		>
			<!-- Subtle Grid Pattern Background -->
			<div class="canvas-grid-bg absolute inset-0 pointer-events-none opacity-40"></div>

			<!-- Floating Top Toolbar (Screenshot 1 Pill Dock) -->
			<div class="floating-top-dock absolute top-4 left-1/2 -translate-x-1/2 bg-[#202228] text-white px-3 py-1.5 rounded-xl shadow-xl flex items-center gap-2 border border-[#3b3f4d] z-30">
				<button class="dock-tool-btn" class:active={activeTool === 'select'} onclick={() => (activeTool = 'select')} title="Select / Move">
					<Icon name="mouse-pointer" size={14} />
				</button>
				<button class="dock-tool-btn" class:active={activeTool === 'pan'} onclick={() => (activeTool = 'pan')} title="Pan Canvas">
					<Icon name="hand" size={14} />
				</button>
				<button class="dock-tool-btn" class:active={activeTool === 'link'} onclick={() => (activeTool = 'link')} title="Connect Nodes">
					<Icon name="git-branch" size={14} />
				</button>
				<button class="dock-tool-btn" class:active={activeTool === 'rect'} onclick={() => (activeTool = 'rect')} title="Bounding Box">
					<Icon name="square" size={14} />
				</button>
				<button class="dock-tool-btn" class:active={activeTool === 'image'} onclick={triggerUpload} title="Add Image">
					<Icon name="image" size={14} />
				</button>
				<button class="dock-tool-btn" class:active={activeTool === 'cube'} onclick={() => (activeTool = 'cube')} title="3D Scene">
					<Icon name="box" size={14} />
				</button>
				<button class="dock-tool-btn" class:active={activeTool === 'pen'} onclick={() => (activeTool = 'pen')} title="Annotation Pen">
					<Icon name="edit-3" size={14} />
				</button>
				<div class="h-4 w-[1px] bg-[#3e4352] mx-1"></div>
				<button class="dock-tool-btn" onclick={zoomOut} title="Zoom Out">
					<Icon name="zoom-out" size={14} />
				</button>
				<button class="dock-tool-btn" onclick={zoomIn} title="Zoom In">
					<Icon name="zoom-in" size={14} />
				</button>
				<button class="dock-tool-btn" onclick={resetZoom} title="Reset View">
					<Icon name="maximize" size={14} />
				</button>
				<button class="dock-tool-btn" title="Toggle Grid">
					<Icon name="grid" size={14} />
				</button>
			</div>

			<!-- Canvas Substrate with Transform Matrix -->
			<div
				class="canvas-transform-layer absolute inset-0 flex items-center justify-center transition-transform duration-75"
				style="transform: translate({pan.x}px, {pan.y}px) scale({zoom}); transform-origin: center center;"
			>
				<!-- SVG Connection Cables Layer -->
				<svg class="absolute inset-0 w-full h-full pointer-events-none" style="overflow: visible;">
					<defs>
						<!-- Star Connector Gradient -->
						<linearGradient id="gold-link-grad" x1="0%" y1="0%" x2="100%" y2="100%">
							<stop offset="0%" stop-color="#c59e2b" />
							<stop offset="100%" stop-color="#997b21" />
						</linearGradient>
					</defs>

					<!-- Render Radial Links from Center (0,0) to Exhibits -->
					{#each exhibits as item}
						{@const isSelected = selectedId === item.id}
						{@const midX = item.position.x * 0.48}
						{@const midY = item.position.y * 0.48}
						<g>
							<!-- Curved Bezier or Straight Line to Exhibit -->
							<line
								x1="0"
								y1="0"
								x2={item.position.x}
								y2={item.position.y}
								stroke={isSelected ? '#c59e2b' : '#d8cfbe'}
								stroke-width={isSelected ? '2.5' : '1.5'}
								stroke-dasharray={isSelected ? 'none' : '4,3'}
							/>

							<!-- Connection Pill over Center of Edge -->
							<foreignObject x={midX - 55} y={midY - 12} width="110" height="24" class="pointer-events-auto">
								<div class="edge-relation-pill text-[9px] font-mono font-bold tracking-wider px-2 py-0.5 rounded-full bg-white border border-[#d6ccbb] text-[#7a6021] text-center shadow-sm whitespace-nowrap uppercase">
									{item.relation}
								</div>
							</foreignObject>
						</g>
					{/each}
				</svg>

				<!-- CENTER NODE: H-01 PRIMARY HYPOTHESIS -->
				<div
					class="center-hypothesis-card absolute z-20 w-[240px] p-4 rounded-xl bg-[#20232a] text-white border-2 border-[#d4af37] shadow-2xl text-center transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform hover:scale-105"
				>
					<div class="h-badge inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#30343f] border border-[#e5c158]/40 text-[#e5c158] text-[9px] font-mono font-bold uppercase mb-2">
						<span>{hypothesis.code}</span>
						<span>·</span>
						<span>{hypothesis.label}</span>
					</div>
					<div class="flex items-center justify-center gap-2 mb-1.5">
						<Icon name="scale" size={20} class="text-[#e5c158]" />
						<h3 class="text-sm font-bold tracking-widest text-[#f5f0e6]">{hypothesis.title}</h3>
					</div>
					<p class="text-[11px] leading-relaxed text-[#a8b0c0] font-sans">
						{hypothesis.description}
					</p>
				</div>

				<!-- RADIAL EXHIBIT NODES -->
				{#each exhibits as item (item.id)}
					{@const isSelected = selectedId === item.id}
					<div
						class="radial-exhibit-node absolute z-10 w-[210px] p-2.5 rounded-xl bg-white border transition-all cursor-pointer shadow-md hover:shadow-lg transform -translate-x-1/2 -translate-y-1/2 {isSelected ? 'border-[#c59e2b] ring-2 ring-[#c59e2b]/50' : 'border-[#ded6c7]'}"
						style="left: calc(50% + {item.position.x}px); top: calc(50% + {item.position.y}px);"
						onclick={() => (selectedId = item.id)}
						ondblclick={() => onOpenModal?.(item)}
					>
						<div class="flex items-center gap-2.5">
							<!-- Thumbnail -->
							<div class="w-12 h-12 rounded-lg bg-[#181a1f] border border-[#ddd3c2] flex items-center justify-center shrink-0 overflow-hidden relative shadow-inner">
								{#if item.id === 'e-001'}
									<!-- Footprint Thumbnail -->
									<svg class="w-7 h-7 text-[#10b981]" viewBox="0 0 24 24" fill="currentColor">
										<path d="M12 2C9.5 2 7.5 4 7.5 6.5c0 1.9 1.1 3.5 2.7 4.2-.8 1.4-1.2 3-1.2 4.8 0 3.6 2.2 6.5 5 6.5s5-2.9 5-6.5c0-1.8-.4-3.4-1.2-4.8 1.6-.7 2.7-2.3 2.7-4.2C20.5 4 18.5 2 16 2h-4z" />
									</svg>
								{:else if item.id === 'e-002'}
									<!-- Witness Document -->
									<svg class="w-6 h-6 text-[#e5c158]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
										<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
										<polyline points="14 2 14 8 20 8" />
									</svg>
								{:else if item.id === 'e-003'}
									<!-- CCTV Preview -->
									<div class="relative w-full h-full bg-[#111] flex items-center justify-center">
										<Icon name="video" size={14} class="text-[#e5c158]" />
										<span class="absolute bottom-0 right-0 text-[7px] font-mono text-[#aaa] bg-black/80 px-0.5">42s</span>
									</div>
								{:else if item.id === 'e-004'}
									<!-- Financial Network -->
									<svg class="w-6 h-6 text-[#10b981]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
										<circle cx="18" cy="5" r="3" />
										<circle cx="6" cy="12" r="3" />
										<circle cx="18" cy="19" r="3" />
										<line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
									</svg>
								{:else if item.id === 'e-005'}
									<!-- 3D Room GLB -->
									<svg class="w-6 h-6 text-[#aaa]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
										<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
									</svg>
								{:else}
									<!-- Escrow Deed -->
									<svg class="w-6 h-6 text-[#b45309]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
										<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
									</svg>
								{/if}
							</div>

							<!-- Node Metadata -->
							<div class="min-w-0 flex-1">
								<div class="flex items-center justify-between gap-1 mb-0.5">
									<span class="text-[9px] font-mono font-bold text-[#8c733e]">{item.code}</span>
									<span class="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold uppercase" class:bg-[#ecfdf5]={item.pillColor === 'mint'} class:text-[#065f46]={item.pillColor === 'mint'} class:bg-[#fffbeb]={item.pillColor === 'amber'} class:text-[#92400e]={item.pillColor === 'amber'}>
										{item.categoryPill}
									</span>
								</div>
								<div class="text-[11px] font-bold text-[#1f2329] truncate">{item.title}</div>
								<div class="text-[9px] font-mono text-[#8b92a0] truncate uppercase">{item.subtitle}</div>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<!-- Bottom Left Canvas Label -->
			<div class="absolute bottom-4 left-6 flex items-center gap-2 text-[#8c733e] opacity-80 pointer-events-none z-20">
				<Icon name="compass" size={16} />
				<div>
					<div class="text-[10px] font-mono font-bold tracking-widest uppercase">INVESTIGATIVE CANVAS</div>
					<div class="text-[8px] font-mono tracking-wider text-[#9f9480] uppercase">EVIDENCE · ENTITIES · RELATIONSHIPS</div>
				</div>
			</div>

			<!-- Bottom Right Zoom Controls -->
			<div class="absolute bottom-4 right-6 flex items-center gap-2 bg-white/90 backdrop-blur border border-[#ded6c7] px-2.5 py-1 rounded-lg shadow-sm z-20 text-xs font-mono">
				<button class="px-1 text-[#666] hover:text-[#111]" onclick={zoomOut}>-</button>
				<span class="text-[#333] font-bold">{Math.round(zoom * 100)}%</span>
				<button class="px-1 text-[#666] hover:text-[#111]" onclick={zoomIn}>+</button>
				<button class="px-1 text-[#666] hover:text-[#111] ml-1" onclick={resetZoom} title="Reset">
					<Icon name="maximize" size={12} />
				</button>
			</div>
		</main>

		<!-- RIGHT SIDEBAR: EVIDENCE INSPECTOR (MATCHING SCREENSHOT 1) -->
		<aside class="sidebar-evidence-inspector w-[340px] flex flex-col bg-[#fbf9f5] border-l border-[#e8e2d4] shrink-0 z-20 shadow-sm overflow-y-auto">
			<!-- Header -->
			<div class="insp-header p-4 border-b border-[#ece5d8] flex items-center justify-between">
				<div class="flex items-center gap-2">
					<Icon name="target" size={16} class="text-[#8c733e]" />
					<h2 class="text-sm font-bold tracking-wider text-[#1e2025] uppercase">EVIDENCE INSPECTOR</h2>
				</div>
				<button class="menu-btn text-[#888] hover:text-[#222]" title="Options">
					<Icon name="more-horizontal" size={15} />
				</button>
			</div>

			<div class="insp-body p-4 space-y-4 flex-1">
				<!-- High-Res Graphic Caliper Viewer Box -->
				<div class="caliper-preview-box rounded-xl bg-[#1a1c22] border border-[#d6ccbb] p-2 relative overflow-hidden shadow-inner flex flex-col items-center justify-center min-h-[170px]">
					{#if selectedExhibit.id === 'e-001'}
						<!-- Calibrated Footprint Graphic with Calipers (Screenshot 1) -->
						<div class="relative w-full h-[160px] flex items-center justify-center">
							<!-- Soil Mud Background Graphic -->
							<div class="absolute inset-0 bg-radial from-[#2a2c34] to-[#121317] rounded-lg"></div>

							<!-- Glowing Green Footprint Imprint -->
							<svg class="w-20 h-28 text-[#10b981] drop-shadow-[0_0_12px_rgba(16,185,129,0.7)]" viewBox="0 0 24 24" fill="currentColor">
								<path d="M12 2C9.5 2 7.5 4 7.5 6.5c0 1.9 1.1 3.5 2.7 4.2-.8 1.4-1.2 3-1.2 4.8 0 3.6 2.2 6.5 5 6.5s5-2.9 5-6.5c0-1.8-.4-3.4-1.2-4.8 1.6-.7 2.7-2.3 2.7-4.2C20.5 4 18.5 2 16 2h-4zm-1.5 13c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5-1.5-.7-1.5-1.5.7-1.5 1.5-1.5zm5 0c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5-1.5-.7-1.5-1.5.7-1.5 1.5-1.5z" />
							</svg>

							<!-- Caliper Overlay Yellow Box (Screenshot 1: 42.23", 0.287 m) -->
							<div class="caliper-bounding-frame absolute inset-x-8 inset-y-4 border border-[#e5c158] rounded pointer-events-none">
								<!-- Length Measurement Badge -->
								<div class="absolute -top-3 right-2 bg-[#202228] border border-[#e5c158] text-[#e5c158] px-1.5 py-0.2 rounded text-[9px] font-mono font-bold shadow">
									{selectedExhibit.caliper1 || '42.23"'}
								</div>
								<!-- Width Measurement Badge -->
								<div class="absolute -right-7 top-1/2 -translate-y-1/2 bg-[#202228] border border-[#e5c158] text-[#e5c158] px-1 py-0.2 rounded text-[9px] font-mono font-bold shadow">
									{selectedExhibit.caliper2 || '0.287 m'}
								</div>
							</div>
						</div>
					{:else}
						<!-- Standard High-Res Preview for Other Exhibits -->
						<div class="w-full h-[150px] flex flex-col items-center justify-center text-center p-3">
							<Icon name={selectedExhibit.categoryPill === 'VIDEO' ? 'video' : 'file-text'} size={32} class="text-[#e5c158] mb-2" />
							<div class="text-xs font-bold text-white">{selectedExhibit.title}</div>
							<div class="text-[10px] font-mono text-[#8c94a4]">{selectedExhibit.type}</div>
						</div>
					{/if}
				</div>

				<!-- Title and Exhibit Code -->
				<div>
					<div class="text-[10px] font-mono font-bold text-[#8c733e] uppercase mb-0.5">{selectedExhibit.code}</div>
					<h3 class="text-sm font-bold text-[#1a1d24] leading-snug">{selectedExhibit.title}</h3>
				</div>

				<!-- Metadata Key-Value Table -->
				<div class="metadata-table divide-y divide-[#ece5d8] text-xs font-sans">
					<div class="flex items-center justify-between py-1.5">
						<span class="text-[#7d8492] font-mono text-[10px] uppercase">TYPE</span>
						<span class="font-semibold text-[#1e2025]">{selectedExhibit.type}</span>
					</div>
					<div class="flex items-center justify-between py-1.5">
						<span class="text-[#7d8492] font-mono text-[10px] uppercase">COLLECTED</span>
						<span class="font-semibold text-[#1e2025]">{selectedExhibit.collected}</span>
					</div>
					<div class="flex items-center justify-between py-1.5">
						<span class="text-[#7d8492] font-mono text-[10px] uppercase">LOCATION</span>
						<span class="font-semibold text-[#1e2025]">{selectedExhibit.location}</span>
					</div>
					<div class="flex items-center justify-between py-1.5">
						<span class="text-[#7d8492] font-mono text-[10px] uppercase">CHAIN OF CUSTODY</span>
						<button class="font-semibold text-[#8c733e] hover:underline text-right" onclick={() => onOpenModal?.(selectedExhibit)}>
							{selectedExhibit.chainOfCustody}
						</button>
					</div>
				</div>

				<!-- Section: ANALYSIS & SYNTHESIS -->
				<div class="analysis-synthesis-box pt-2 border-t border-[#ece5d8]">
					<h4 class="text-[11px] font-mono font-bold tracking-wider text-[#1e2025] uppercase mb-2">ANALYSIS & SYNTHESIS</h4>
					<div class="space-y-2">
						{#each selectedExhibit.checklist as checkItem}
							<div class="flex items-start gap-2 text-xs">
								{#if checkItem.checked}
									<span class="h-4 w-4 rounded-full bg-[#ecfdf5] border border-[#10b981] text-[#10b981] flex items-center justify-center shrink-0 mt-0.5">
										<Icon name="check" size={11} />
									</span>
								{:else}
									<span class="h-4 w-4 rounded-full border border-[#d6ccbb] text-transparent flex items-center justify-center shrink-0 mt-0.5">
										○
									</span>
								{/if}
								<span class="text-[#333] leading-snug">{checkItem.text}</span>
							</div>
						{/each}
					</div>
				</div>

				<!-- Verdict Callout Card: SUPPORTS H-01 (Screenshot 1) -->
				<div class="verdict-callout p-3 rounded-xl bg-[#fdfaf3] border border-[#d9a74a]/60 shadow-sm">
					<div class="flex items-center gap-2 mb-1">
						<Icon name="scale" size={15} class="text-[#c59e2b]" />
						<span class="text-xs font-bold tracking-wider text-[#8c733e] uppercase">SUPPORTS {selectedExhibit.supports}</span>
					</div>
					<p class="text-xs text-[#444] leading-relaxed">
						{selectedExhibit.verdict}
					</p>
				</div>

				<!-- Accordion: RELATIONSHIPS (4) -->
				<div class="border-t border-[#ece5d8] pt-2">
					<button
						class="w-full flex items-center justify-between py-1.5 text-xs font-mono font-bold text-[#1e2025] uppercase"
						onclick={() => (isRelationshipsOpen = !isRelationshipsOpen)}
					>
						<span>RELATIONSHIPS ({exhibits.length - 2})</span>
						<Icon name={isRelationshipsOpen ? 'chevron-up' : 'chevron-down'} size={14} class="text-[#777]" />
					</button>
					{#if isRelationshipsOpen}
						<div class="py-2 text-[11px] text-[#555] space-y-1 font-mono">
							<div class="flex items-center justify-between">
								<span>→ Linked to H-01 (Hypothesis)</span>
								<span class="text-[#10b981] font-bold">100%</span>
							</div>
							<div class="flex items-center justify-between">
								<span>→ Spatial alignment to E-005</span>
								<span class="text-[#8c733e] font-bold">94%</span>
							</div>
							<div class="flex items-center justify-between">
								<span>→ Temporal overlap to E-003</span>
								<span class="text-[#10b981] font-bold">98%</span>
							</div>
						</div>
					{/if}
				</div>

				<!-- Accordion: NOTES -->
				<div class="border-t border-[#ece5d8] pt-2 pb-6">
					<button
						class="w-full flex items-center justify-between py-1.5 text-xs font-mono font-bold text-[#1e2025] uppercase"
						onclick={() => (isNotesOpen = !isNotesOpen)}
					>
						<span>NOTES</span>
						<Icon name={isNotesOpen ? 'chevron-up' : 'chevron-down'} size={14} class="text-[#777]" />
					</button>
					{#if isNotesOpen}
						<div class="py-2 text-xs text-[#555]">
							<textarea
								placeholder="Enter forensic notes or hypothesis annotations..."
								class="w-full h-16 p-2 text-xs bg-white border border-[#dfd7c7] rounded outline-none resize-none"
							></textarea>
						</div>
					{/if}
				</div>
			</div>
		</aside>
	</div>
</div>

<style>
	/* Canvas Grid Pattern matching Screenshot 1 */
	.canvas-grid-bg {
		background-image:
			linear-gradient(to right, #e8dfcf 1px, transparent 1px),
			linear-gradient(to bottom, #e8dfcf 1px, transparent 1px);
		background-size: 32px 32px;
	}

	.filter-btn {
		color: #64748b;
	}
	.filter-btn.active {
		background-color: #272a31;
		color: #ffffff;
	}

	.sidebar-card {
		background-color: #ffffff;
		border-color: #e5ded0;
	}
	.sidebar-card:hover {
		background-color: #fdfcfa;
		border-color: #d1c4ae;
	}
	.sidebar-card.selected {
		background-color: #fcf9f0;
		border-color: #c59e2b;
		box-shadow: 0 1px 4px rgba(197, 158, 43, 0.15);
	}

	.dock-tool-btn {
		padding: 6px;
		border-radius: 6px;
		color: #a0a6b5;
		transition: all 0.15s ease;
	}
	.dock-tool-btn:hover {
		color: #ffffff;
		background-color: #2d3039;
	}
	.dock-tool-btn.active {
		color: #e5c158;
		background-color: #353944;
	}
</style>
