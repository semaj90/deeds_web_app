<script lang="ts">
	// Type definitions
	interface Vec2 { x: number; y: number; }
	interface BoardViewport { pan: Vec2; zoom: number; }

	export interface BoardNode {
		id: string;
		kind: 'note' | 'evidence' | 'document';
		x: number;
		y: number;
		w: number;
		h: number;
		title?: string;
		body?: string;
		evidenceId?: string;
		locked?: boolean;
		fileType?: string;
		thumbnailUrl?: string;
	}

	export interface BoardEdge {
		id: string;
		fromId: string;
		toId: string;
		style: 'solid' | 'dashed';
		label?: string;
		connectionType?: string;
		strength?: number;
	}

	interface BoardSnapshot {
		version: number;
		viewport: BoardViewport;
		nodes: BoardNode[];
		edges: BoardEdge[];
		updatedAt?: string;
	}

	// Relationship type color map
	const EDGE_COLORS: Record<string, string> = {
		corroborates: 'rgba(34, 197, 94, 0.7)',
		supports: 'rgba(34, 197, 94, 0.7)',
		contradicts: 'rgba(239, 68, 68, 0.7)',
		refutes: 'rgba(239, 68, 68, 0.7)',
		sequence: 'rgba(59, 130, 246, 0.7)',
		timeline: 'rgba(59, 130, 246, 0.7)',
		references: 'rgba(168, 85, 247, 0.6)',
		related: 'rgba(255, 255, 255, 0.22)',
		financial: 'rgba(245, 158, 11, 0.7)',
		communication: 'rgba(236, 72, 153, 0.6)',
		location: 'rgba(20, 184, 166, 0.6)',
		person: 'rgba(249, 115, 22, 0.6)',
	};

	const EDGE_STYLES: Record<string, 'solid' | 'dashed'> = {
		contradicts: 'dashed',
		refutes: 'dashed',
		references: 'dashed',
	};

	// Props
	interface Props {
		caseId: string;
		initialSnapshot?: BoardSnapshot | null;
		readonly?: boolean;
		activeTool?: 'select' | 'evidence' | 'connection' | 'note';
		snapToGrid?: boolean;
		onDirtyChange?: ((dirty: boolean) => void) | null;
		onCanvasClick?: ((world: Vec2) => void) | null;
		onNodeSelect?: ((node: BoardNode | null) => void) | null;
		onConnectionCreated?: ((fromId: string, toId: string) => void) | null;
		onContextMenu?: ((node: BoardNode, screen: Vec2) => void) | null;
	}

	let {
		caseId,
		initialSnapshot = null,
		readonly = false,
		activeTool = 'select',
		snapToGrid = false,
		onDirtyChange = null,
		onCanvasClick = null,
		onNodeSelect = null,
		onConnectionCreated = null,
		onContextMenu = null,
	}: Props = $props();

	let rootEl = $state<HTMLDivElement | null>(null);
	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let minimapEl = $state<HTMLCanvasElement | null>(null);

	// State
	const getInitialViewport = (): BoardViewport =>
		initialSnapshot?.viewport ? { ...initialSnapshot.viewport } : { pan: { x: 0, y: 0 }, zoom: 1 };
	const getInitialNodes = (): BoardNode[] =>
		initialSnapshot?.nodes ? [...initialSnapshot.nodes] : [];
	const getInitialEdges = (): BoardEdge[] =>
		initialSnapshot?.edges ? [...initialSnapshot.edges] : [];

	let viewport = $state<BoardViewport>(getInitialViewport());
	let nodes = $state<BoardNode[]>(getInitialNodes());
	let edges = $state<BoardEdge[]>(getInitialEdges());
	let selected = $state<Set<string>>(new Set());
	let hoveredId = $state<string | null>(null);
	let dirty = $state(false);

	// Interaction modes
	let spaceDown = $state(false);
	let isPanning = $state(false);
	let isDraggingNode = $state(false);
	let dragStartScreen = $state<Vec2>({ x: 0, y: 0 });
	let dragStartWorld = $state<Vec2>({ x: 0, y: 0 });
	let panStart = $state<Vec2>({ x: 0, y: 0 });
	let dragNodeIds = $state<string[]>([]);
	let dragNodesStart = $state<Map<string, Vec2>>(new Map());

	// Connection drawing state
	let connectionSourceId = $state<string | null>(null);
	let connectionPreviewEnd = $state<Vec2 | null>(null);

	// Marquee box-selection state (drag empty canvas to select multiple nodes)
	let isMarqueeSelecting = $state(false);
	let marqueeStart = $state<Vec2>({ x: 0, y: 0 });
	let marqueeEnd = $state<Vec2>({ x: 0, y: 0 });

	// Text editing overlay
	let editing = $state<{ id: string; value: string; mode: 'title' | 'body' } | null>(null);

	// Canvas internals
	let ctx = $state<CanvasRenderingContext2D | null>(null);
	let raf = 0;
	let ro: ResizeObserver | null = null;
	let dpr = 1;

	// Thumbnail image cache
	const imageCache = new Map<string, HTMLImageElement>();

	function loadImage(url: string): HTMLImageElement | null {
		if (imageCache.has(url)) {
			const img = imageCache.get(url)!;
			return img.complete && img.naturalWidth > 0 ? img : null;
		}
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => scheduleDraw();
		img.src = url;
		imageCache.set(url, img);
		return null;
	}

	function fileTypeIcon(ft: string | undefined): string {
		if (!ft) return '\u{1F4C4}';
		const t = ft.toLowerCase();
		if (t.startsWith('video') || t === 'mp4' || t === 'mov' || t === 'avi') return '\u{25B6}';
		if (t.startsWith('audio') || t === 'mp3' || t === 'wav' || t === 'ogg') return '\u{1F3B5}';
		if (t === 'pdf' || t === 'application/pdf') return '\u{1F4D1}';
		if (t.startsWith('image') || t === 'jpg' || t === 'png' || t === 'jpeg') return '\u{1F5BC}';
		return '\u{1F4C4}';
	}

	function isAudioType(ft: string | undefined): boolean {
		if (!ft) return false;
		const t = ft.toLowerCase();
		return t.startsWith('audio') || t === 'mp3' || t === 'wav' || t === 'ogg' || t === 'aac' || t === 'flac';
	}

	function isVideoType(ft: string | undefined): boolean {
		if (!ft) return false;
		const t = ft.toLowerCase();
		return t.startsWith('video') || t === 'mp4' || t === 'mov' || t === 'avi' || t === 'webm';
	}

	function isImageType(ft: string | undefined): boolean {
		if (!ft) return false;
		const t = ft.toLowerCase();
		return t.startsWith('image') || t === 'jpg' || t === 'jpeg' || t === 'png' || t === 'gif' || t === 'webp' || t === 'svg';
	}

	/** Draw a faux waveform visualization for audio nodes */
	function drawAudioWaveform(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, inv: number, isPlaying: boolean) {
		const barCount = Math.floor(w / (4 * inv));
		const barWidth = 2 * inv;
		const gap = (w - barCount * barWidth) / (barCount + 1);
		const midY = y + h / 2;
		const maxBarH = h * 0.7;

		c.save();
		for (let i = 0; i < barCount; i++) {
			// Generate pseudo-random heights from a simple seed
			const seed = Math.sin(i * 127.1 + 311.7) * 43758.5453;
			const barH = (Math.abs(seed - Math.floor(seed)) * 0.6 + 0.2) * maxBarH;
			const bx = x + gap + i * (barWidth + gap);

			const gradient = c.createLinearGradient(bx, midY - barH / 2, bx, midY + barH / 2);
			if (isPlaying) {
				gradient.addColorStop(0, 'rgba(59, 130, 246, 0.9)');
				gradient.addColorStop(1, 'rgba(147, 51, 234, 0.6)');
			} else {
				gradient.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
				gradient.addColorStop(1, 'rgba(255, 255, 255, 0.15)');
			}
			c.fillStyle = gradient;
			c.fillRect(bx, midY - barH / 2, barWidth, barH);
		}
		c.restore();
	}

	/** Draw a play/pause button overlay for media nodes */
	function drawPlayButton(c: CanvasRenderingContext2D, cx: number, cy: number, radius: number, inv: number, isPlaying: boolean) {
		c.save();
		// Circle background
		c.beginPath();
		c.arc(cx, cy, radius, 0, Math.PI * 2);
		c.fillStyle = isPlaying ? 'rgba(59, 130, 246, 0.7)' : 'rgba(0, 0, 0, 0.5)';
		c.fill();
		c.strokeStyle = 'rgba(255, 255, 255, 0.6)';
		c.lineWidth = 1.5 * inv;
		c.stroke();

		// Play triangle or pause bars
		c.fillStyle = 'rgba(255, 255, 255, 0.9)';
		if (isPlaying) {
			// Pause bars
			const barW = radius * 0.25;
			const barH = radius * 1.0;
			c.fillRect(cx - barW * 1.5, cy - barH / 2, barW, barH);
			c.fillRect(cx + barW * 0.5, cy - barH / 2, barW, barH);
		} else {
			// Play triangle
			const triSize = radius * 0.65;
			c.beginPath();
			c.moveTo(cx - triSize * 0.35, cy - triSize);
			c.lineTo(cx + triSize * 0.85, cy);
			c.lineTo(cx - triSize * 0.35, cy + triSize);
			c.closePath();
			c.fill();
		}
		c.restore();
	}

	// ── Audio playback for board nodes ──
	let activeAudioNodeId = $state<string | null>(null);
	let audioEl: HTMLAudioElement | null = null;

	function toggleAudioPlayback(nodeId: string, evidenceId?: string) {
		if (activeAudioNodeId === nodeId) {
			// Stop
			audioEl?.pause();
			audioEl = null;
			activeAudioNodeId = null;
			scheduleDraw();
			return;
		}
		// Start new audio
		if (audioEl) { audioEl.pause(); audioEl = null; }
		if (!evidenceId) return;
		audioEl = new Audio(`/api/evidence/${evidenceId}/download`);
		audioEl.onended = () => { activeAudioNodeId = null; audioEl = null; scheduleDraw(); };
		audioEl.play().catch(() => { activeAudioNodeId = null; audioEl = null; });
		activeAudioNodeId = nodeId;
		scheduleDraw();
	}

	// ── Drag-and-drop from external (evidence sidebar) ──
	let isDragOver = $state(false);

	function handleDragOver(e: DragEvent) {
		if (readonly) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
		isDragOver = true;
	}

	function handleDragLeave() {
		isDragOver = false;
	}

	function handleDrop(e: DragEvent) {
		if (readonly || !canvasEl) return;
		e.preventDefault();
		isDragOver = false;

		const json = e.dataTransfer?.getData('application/json');
		if (!json) return;

		try {
			const data = JSON.parse(json);
			if (data.evidenceId && data.title) {
				const rect = canvasEl.getBoundingClientRect();
				const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
				const world = screenToWorld(screen);
				addEvidenceNode(data.evidenceId, data.title, world.x - 140, world.y - 80, data.fileType);
				if (data.thumbnailUrl) {
					// Set thumbnail on the newly added node
					const newNode = nodes[nodes.length - 1];
					if (newNode) newNode.thumbnailUrl = data.thumbnailUrl;
				}
			}
		} catch { /* invalid drop data */ }
	}

	// Coordinate transforms
	function screenToWorld(p: Vec2): Vec2 {
		return { x: p.x / viewport.zoom - viewport.pan.x, y: p.y / viewport.zoom - viewport.pan.y };
	}
	function worldToScreen(p: Vec2): Vec2 {
		return { x: (p.x + viewport.pan.x) * viewport.zoom, y: (p.y + viewport.pan.y) * viewport.zoom };
	}
	function getNodeById(id: string) {
		return nodes.find((n) => n.id === id) ?? null;
	}
	function hitTestNode(world: Vec2): string | null {
		for (let i = nodes.length - 1; i >= 0; i--) {
			const n = nodes[i];
			if (world.x >= n.x && world.x <= n.x + n.w && world.y >= n.y && world.y <= n.y + n.h) {
				return n.id;
			}
		}
		return null;
	}
	function setDirty(v: boolean) {
		dirty = v;
		if (onDirtyChange) onDirtyChange(v);
	}

	// Snap helper
	const GRID_STEP = 20;
	function snap(v: number): number {
		return snapToGrid ? Math.round(v / GRID_STEP) * GRID_STEP : v;
	}

	// Drawing
	function scheduleDraw() {
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(draw);
	}

	function resizeCanvasToDisplaySize() {
		if (!canvasEl) return;
		dpr = window.devicePixelRatio || 1;
		const w = canvasEl.clientWidth;
		const h = canvasEl.clientHeight;
		const nextW = Math.max(1, Math.floor(w * dpr));
		const nextH = Math.max(1, Math.floor(h * dpr));
		if (canvasEl.width !== nextW || canvasEl.height !== nextH) {
			canvasEl.width = nextW;
			canvasEl.height = nextH;
		}
	}

	function drawGrid(c: CanvasRenderingContext2D, width: number, height: number) {
		const step = 80;
		c.save();
		c.lineWidth = 1 / viewport.zoom;
		c.strokeStyle = 'rgba(255,255,255, 0.04)';
		const topLeft = screenToWorld({ x: 0, y: 0 });
		const bottomRight = screenToWorld({ x: width, y: height });
		const startX = Math.floor(topLeft.x / step) * step;
		const endX = Math.ceil(bottomRight.x / step) * step;
		const startY = Math.floor(topLeft.y / step) * step;
		const endY = Math.ceil(bottomRight.y / step) * step;
		c.beginPath();
		for (let x = startX; x <= endX; x += step) { c.moveTo(x, startY); c.lineTo(x, endY); }
		for (let y = startY; y <= endY; y += step) { c.moveTo(startX, y); c.lineTo(endX, y); }
		c.stroke();
		c.restore();
	}

	function drawArrowhead(c: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, inv: number) {
		const angle = Math.atan2(toY - fromY, toX - fromX);
		const arrowLen = 10 * inv;
		c.beginPath();
		c.moveTo(toX, toY);
		c.lineTo(toX - arrowLen * Math.cos(angle - 0.3), toY - arrowLen * Math.sin(angle - 0.3));
		c.moveTo(toX, toY);
		c.lineTo(toX - arrowLen * Math.cos(angle + 0.3), toY - arrowLen * Math.sin(angle + 0.3));
		c.stroke();
	}

	function draw() {
		if (!ctx || !canvasEl) return;
		resizeCanvasToDisplaySize();
		const w = canvasEl.clientWidth;
		const h = canvasEl.clientHeight;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);
		ctx.fillStyle = 'rgba(0,0,0,0)';
		ctx.fillRect(0, 0, w, h);
		ctx.save();
		ctx.scale(viewport.zoom, viewport.zoom);
		ctx.translate(viewport.pan.x, viewport.pan.y);
		drawGrid(ctx, w, h);

		const inv = 1 / viewport.zoom;

		// Edges with relationship type colors + strength thickness
		for (const e of edges) {
			const a = getNodeById(e.fromId);
			const b = getNodeById(e.toId);
			if (!a || !b) continue;
			const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
			const bx = b.x + b.w / 2, by = b.y + b.h / 2;

			const connType = e.connectionType || e.label || 'related';
			const color = EDGE_COLORS[connType.toLowerCase()] || EDGE_COLORS.related;
			const edgeStyle = EDGE_STYLES[connType.toLowerCase()] || e.style || 'solid';
			const strength = e.strength ?? 1.0;
			const lineWidth = Math.max(1.5, 2 + strength * 3) * inv;

			ctx.beginPath();
			ctx.moveTo(ax, ay);
			ctx.lineTo(bx, by);
			ctx.strokeStyle = color;
			ctx.lineWidth = lineWidth;
			if (edgeStyle === 'dashed') ctx.setLineDash([8 * inv, 6 * inv]);
			else ctx.setLineDash([]);
			ctx.stroke();

			// Arrowhead
			drawArrowhead(ctx, ax, ay, bx, by, inv);

			// Label
			if (e.label || e.connectionType) {
				ctx.setLineDash([]);
				ctx.fillStyle = color;
				ctx.font = `bold ${12 * inv}px system-ui`;
				const mx = (ax + bx) / 2, my = (ay + by) / 2;
				const displayLabel = (e.label || e.connectionType || '').toUpperCase();
				ctx.fillText(displayLabel, mx + 6 * inv, my - 8 * inv);

				// Strength indicator
				if (strength < 1.0) {
					ctx.font = `${10 * inv}px system-ui`;
					ctx.fillStyle = 'rgba(255,255,255,0.4)';
					ctx.fillText(`${Math.round(strength * 100)}%`, mx + 6 * inv, my + 6 * inv);
				}
			}
		}

		// Marquee selection box
		if (isMarqueeSelecting) {
			const minX = Math.min(marqueeStart.x, marqueeEnd.x);
			const maxX = Math.max(marqueeStart.x, marqueeEnd.x);
			const minY = Math.min(marqueeStart.y, marqueeEnd.y);
			const maxY = Math.max(marqueeStart.y, marqueeEnd.y);
			ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
			ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
			ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
			ctx.lineWidth = 1.5 * inv;
			ctx.setLineDash([4 * inv, 3 * inv]);
			ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
			ctx.setLineDash([]);
		}

		// Connection preview line (while drawing)
		if (connectionSourceId && connectionPreviewEnd) {
			const src = getNodeById(connectionSourceId);
			if (src) {
				const sx = src.x + src.w / 2, sy = src.y + src.h / 2;
				ctx.beginPath();
				ctx.moveTo(sx, sy);
				ctx.lineTo(connectionPreviewEnd.x, connectionPreviewEnd.y);
				ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
				ctx.lineWidth = 2 * inv;
				ctx.setLineDash([6 * inv, 4 * inv]);
				ctx.stroke();
				ctx.setLineDash([]);
				drawArrowhead(ctx, sx, sy, connectionPreviewEnd.x, connectionPreviewEnd.y, inv);
			}
		}

		// Nodes
		for (const n of nodes) {
			const isSelected = selected.has(n.id);
			const isHovered = hoveredId === n.id;
			const isConnectionSource = connectionSourceId === n.id;

			ctx.beginPath();
			if (typeof ctx.roundRect === 'function') ctx.roundRect(n.x, n.y, n.w, n.h, 12 * inv);
			else ctx.rect(n.x, n.y, n.w, n.h);

			ctx.fillStyle = n.kind === 'evidence'
				? 'rgba(59, 130, 246, 0.06)'
				: n.kind === 'document'
					? 'rgba(16, 185, 129, 0.06)'
					: 'rgba(255, 255, 255, 0.04)';
			ctx.fill();

			// Border (highlight connection source)
			ctx.strokeStyle = isConnectionSource
				? 'rgba(59, 130, 246, 0.8)'
				: isSelected
					? 'rgba(255,255,255, 0.45)'
					: isHovered
						? 'rgba(255,255,255, 0.25)'
						: 'rgba(255,255,255, 0.14)';
			ctx.lineWidth = (isConnectionSource ? 3 : 2) * inv;
			ctx.setLineDash([]);
			ctx.stroke();

			// Kind badge (top-left)
			const badgeLabel = n.kind === 'evidence' ? 'EV' : n.kind === 'document' ? 'DOC' : 'NOTE';
			const badgeColor = n.kind === 'evidence' ? 'rgba(59,130,246,0.6)' : n.kind === 'document' ? 'rgba(16,185,129,0.6)' : 'rgba(168,85,247,0.5)';
			ctx.fillStyle = badgeColor;
			ctx.font = `bold ${9 * inv}px system-ui`;
			ctx.fillText(badgeLabel, n.x + 10 * inv, n.y + 16 * inv);

			// Media content area (thumbnail, waveform, or play button)
			if (n.kind === 'evidence') {
				const contentX = n.x + 10 * inv;
				const contentY = n.y + 38 * inv;
				const contentW = n.w - 20 * inv;
				const contentH = n.h - 50 * inv;

				if (isAudioType(n.fileType)) {
					// Audio waveform visualization
					const isPlaying = activeAudioNodeId === n.id;
					drawAudioWaveform(ctx, contentX, contentY, contentW, contentH * 0.6, inv, isPlaying);
					// Play button centered below waveform
					drawPlayButton(ctx, n.x + n.w / 2, contentY + contentH * 0.8, 14 * inv, inv, isPlaying);
				} else if (isVideoType(n.fileType)) {
					// Video: dark preview area with play button
					ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
					ctx.beginPath();
					if (typeof ctx.roundRect === 'function') ctx.roundRect(contentX, contentY, contentW, contentH, 6 * inv);
					else ctx.rect(contentX, contentY, contentW, contentH);
					ctx.fill();
					if (n.thumbnailUrl) {
						const img = loadImage(n.thumbnailUrl);
						if (img) {
							ctx.save();
							ctx.beginPath();
							if (typeof ctx.roundRect === 'function') ctx.roundRect(contentX, contentY, contentW, contentH, 6 * inv);
							else ctx.rect(contentX, contentY, contentW, contentH);
							ctx.clip();
							// Aspect-ratio-preserving draw
							const scale = Math.max(contentW / img.naturalWidth, contentH / img.naturalHeight);
							const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
							ctx.drawImage(img, contentX + (contentW - dw) / 2, contentY + (contentH - dh) / 2, dw, dh);
							ctx.restore();
						}
					}
					drawPlayButton(ctx, n.x + n.w / 2, contentY + contentH / 2, 18 * inv, inv, false);
				} else if (n.thumbnailUrl) {
					// Image/PDF thumbnail with aspect-ratio-preserving draw
					const img = loadImage(n.thumbnailUrl);
					if (img) {
						ctx.save();
						ctx.beginPath();
						if (typeof ctx.roundRect === 'function') ctx.roundRect(contentX, contentY, contentW, contentH, 6 * inv);
						else ctx.rect(contentX, contentY, contentW, contentH);
						ctx.clip();
						const scale = Math.min(contentW / img.naturalWidth, contentH / img.naturalHeight);
						const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
						ctx.drawImage(img, contentX + (contentW - dw) / 2, contentY + (contentH - dh) / 2, dw, dh);
						ctx.restore();
					}
				}
			}

			// File type badge (top-right)
			if (n.kind === 'evidence' && n.fileType) {
				ctx.font = `${18 * inv}px system-ui`;
				ctx.fillStyle = 'rgba(255,255,255, 0.7)';
				ctx.fillText(fileTypeIcon(n.fileType), n.x + n.w - 28 * inv, n.y + 24 * inv);
			}

			if (n.title) {
				ctx.fillStyle = 'rgba(255,255,255, 0.85)';
				ctx.font = `bold ${15 * inv}px system-ui`;
				const maxTitleW = n.w - 40 * inv;
				const titleText = n.title.length > 30 ? n.title.slice(0, 30) + '\u2026' : n.title;
				ctx.fillText(titleText, n.x + 14 * inv, n.y + 28 * inv, maxTitleW);
			}

			if (n.body) {
				ctx.fillStyle = 'rgba(255,255,255, 0.55)';
				ctx.font = `${13 * inv}px system-ui`;
				const preview = n.body.length > 90 ? n.body.slice(0, 90) + '\u2026' : n.body;
				ctx.fillText(preview, n.x + 14 * inv, n.y + 52 * inv);
			}
		}

		ctx.restore();
	}

	$effect(() => { viewport; nodes; edges; selected; hoveredId; connectionSourceId; connectionPreviewEnd; isMarqueeSelecting; marqueeEnd; scheduleDraw(); drawMinimap(); });
	$effect(() => { nodes; edges; viewport; if (!readonly) setDirty(true); });

	function selectedBounds(): { x: number; y: number; w: number; h: number } | null {
		const ids = [...selected];
		if (ids.length === 0) return null;
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const id of ids) {
			const n = getNodeById(id);
			if (!n) continue;
			minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
			maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
		}
		if (!isFinite(minX)) return null;
		const tl = worldToScreen({ x: minX, y: minY });
		const br = worldToScreen({ x: maxX, y: maxY });
		return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
	}

	function nodeScreenRect(id: string) {
		const n = getNodeById(id);
		if (!n) return null;
		const tl = worldToScreen({ x: n.x, y: n.y });
		const br = worldToScreen({ x: n.x + n.w, y: n.y + n.h });
		return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
	}

	// Cursor derivation
	let cursorStyle = $derived.by(() => {
		if (isPanning || spaceDown) return 'grab';
		if (isMarqueeSelecting) return 'crosshair';
		if (activeTool === 'connection') return connectionSourceId ? 'crosshair' : 'cell';
		if (activeTool === 'note') return 'cell';
		if (activeTool === 'evidence') return 'copy';
		if (hoveredId) return 'pointer';
		return 'default';
	});

	// Input handlers
	function getLocalScreen(e: PointerEvent | WheelEvent | MouseEvent): Vec2 {
		const rect = canvasEl!.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	function onPointerDown(e: PointerEvent) {
		if (readonly || !canvasEl) return;
		canvasEl.setPointerCapture(e.pointerId);
		const screen = getLocalScreen(e);
		const world = screenToWorld(screen);

		// Pan with space/middle/right
		if (spaceDown || e.button === 1 || e.button === 2) {
			isPanning = true;
			dragStartScreen = screen;
			panStart = { ...viewport.pan };
			return;
		}

		const hitId = hitTestNode(world);

		// Connection tool
		if (activeTool === 'connection') {
			if (hitId) {
				if (!connectionSourceId) {
					connectionSourceId = hitId;
					connectionPreviewEnd = world;
				} else if (hitId !== connectionSourceId) {
					// Complete connection
					onConnectionCreated?.(connectionSourceId, hitId);
					connectionSourceId = null;
					connectionPreviewEnd = null;
				}
			} else {
				// Cancel connection
				connectionSourceId = null;
				connectionPreviewEnd = null;
			}
			return;
		}

		if (hitId) {
			// Check if clicking play button on audio/video node
			const hitNode = getNodeById(hitId);
			if (hitNode && hitNode.kind === 'evidence' && isAudioType(hitNode.fileType)) {
				const contentY = hitNode.y + 38 / viewport.zoom;
				const contentH = hitNode.h - 50 / viewport.zoom;
				const btnCx = hitNode.x + hitNode.w / 2;
				const btnCy = contentY + contentH * 0.8;
				const btnR = 14 / viewport.zoom;
				const dx = world.x - btnCx, dy = world.y - btnCy;
				if (dx * dx + dy * dy <= btnR * btnR) {
					toggleAudioPlayback(hitNode.id, hitNode.evidenceId);
					return;
				}
			}

			// Alt-drag from a node starts a quick connection (no tool switch needed)
			if (e.altKey) {
				connectionSourceId = hitId;
				connectionPreviewEnd = world;
				return;
			}

			if (e.shiftKey) {
				const next = new Set(selected);
				if (next.has(hitId)) next.delete(hitId); else next.add(hitId);
				selected = next;
			} else {
				if (!selected.has(hitId)) selected = new Set([hitId]);
			}
			isDraggingNode = true;
			dragStartWorld = world;
			dragNodeIds = [...selected];
			dragNodesStart = new Map(dragNodeIds.map((id) => {
				const n = getNodeById(id)!;
				return [id, { x: n.x, y: n.y }];
			}));
			onNodeSelect?.(getNodeById(hitId));
		} else {
			if (!e.shiftKey) selected = new Set();
			onNodeSelect?.(null);
			// Start marquee selection on empty canvas with select tool
			if (activeTool === 'select' && e.button === 0) {
				isMarqueeSelecting = true;
				marqueeStart = world;
				marqueeEnd = world;
			} else {
				onCanvasClick?.(world);
			}
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (!canvasEl) return;
		const screen = getLocalScreen(e);
		const world = screenToWorld(screen);

		// Update connection preview (connection tool OR alt-drag quick-connect)
		if (connectionSourceId) {
			connectionPreviewEnd = world;
			return;
		}

		// Update marquee selection box
		if (isMarqueeSelecting) {
			marqueeEnd = world;
			return;
		}

		if (!isPanning && !isDraggingNode) {
			hoveredId = hitTestNode(world);
		}

		if (isPanning) {
			const dx = (screen.x - dragStartScreen.x) / viewport.zoom;
			const dy = (screen.y - dragStartScreen.y) / viewport.zoom;
			viewport = { ...viewport, pan: { x: panStart.x + dx, y: panStart.y + dy } };
			return;
		}

		if (isDraggingNode && dragNodeIds.length > 0) {
			const dx = world.x - dragStartWorld.x;
			const dy = world.y - dragStartWorld.y;
			nodes = nodes.map((n) => {
				if (!dragNodesStart.has(n.id) || n.locked) return n;
				const start = dragNodesStart.get(n.id)!;
				return { ...n, x: snap(start.x + dx), y: snap(start.y + dy) };
			});
		}
	}

	function onPointerUp(e: PointerEvent) {
		if (canvasEl) canvasEl.releasePointerCapture(e.pointerId);

		// Alt-drag quick-connect: commit edge if released on a different node
		// (only when NOT in connection tool — that flow uses click-to-click)
		if (connectionSourceId && activeTool !== 'connection') {
			const screen = getLocalScreen(e);
			const world = screenToWorld(screen);
			const targetId = hitTestNode(world);
			if (targetId && targetId !== connectionSourceId) {
				onConnectionCreated?.(connectionSourceId, targetId);
			}
			connectionSourceId = null;
			connectionPreviewEnd = null;
		}

		// Commit marquee selection (find all nodes intersecting the box)
		if (isMarqueeSelecting) {
			const minX = Math.min(marqueeStart.x, marqueeEnd.x);
			const maxX = Math.max(marqueeStart.x, marqueeEnd.x);
			const minY = Math.min(marqueeStart.y, marqueeEnd.y);
			const maxY = Math.max(marqueeStart.y, marqueeEnd.y);
			// Only commit if box has meaningful size (avoid tiny accidental boxes)
			if (Math.abs(maxX - minX) > 5 / viewport.zoom || Math.abs(maxY - minY) > 5 / viewport.zoom) {
				const next = new Set(e.shiftKey ? selected : []);
				for (const n of nodes) {
					// Node intersects box if any corner overlaps
					if (n.x + n.w >= minX && n.x <= maxX && n.y + n.h >= minY && n.y <= maxY) {
						next.add(n.id);
					}
				}
				selected = next;
			}
			isMarqueeSelecting = false;
		}

		isPanning = false;
		isDraggingNode = false;
		dragNodeIds = [];
		dragNodesStart = new Map();
	}

	function onWheel(e: WheelEvent) {
		if (readonly || !canvasEl) return;
		e.preventDefault();
		const screen = getLocalScreen(e);
		const before = screenToWorld(screen);
		const factor = e.deltaY < 0 ? 1.1 : 0.9;
		const nextZoom = Math.min(4, Math.max(0.1, viewport.zoom * factor));
		viewport.zoom = nextZoom;
		viewport.pan = { x: screen.x / nextZoom - before.x, y: screen.y / nextZoom - before.y };
	}

	function onDblClick(e: MouseEvent) {
		if (readonly || !canvasEl) return;
		const screen = getLocalScreen(e);
		const world = screenToWorld(screen);
		const hitId = hitTestNode(world);
		if (!hitId) return;
		const n = getNodeById(hitId);
		if (!n) return;
		selected = new Set([hitId]);
		editing = { id: hitId, value: n.body ?? '', mode: 'body' };
	}

	function handleContextMenu(e: MouseEvent) {
		if (readonly || !canvasEl) return;
		e.preventDefault();
		const screen = getLocalScreen(e);
		const world = screenToWorld(screen);
		const hitId = hitTestNode(world);
		if (hitId) {
			const node = getNodeById(hitId);
			if (node) {
				selected = new Set([hitId]);
				onContextMenu?.(node, screen);
			}
		}
	}

	function commitEditing() {
		if (!editing) return;
		const { id, value, mode } = editing;
		nodes = nodes.map((n) => (n.id === id ? { ...n, [mode]: value } : n));
		editing = null;
	}

	function cancelEditing() { editing = null; }

	// External API
	export function serialize(): BoardSnapshot {
		return { version: initialSnapshot?.version ?? 1, viewport, nodes, edges, updatedAt: new Date().toISOString() };
	}

	export function addNote(x: number, y: number, title?: string, body?: string): string {
		const nodeId = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
		nodes.push({ id: nodeId, kind: 'note', x: snap(x), y: snap(y), w: 240, h: 140, title: title || 'New Note', body: body || '' });
		setDirty(true); scheduleDraw();
		return nodeId;
	}

	export function updateNodeBody(nodeId: string, body: string) {
		nodes = nodes.map(n => n.id === nodeId ? { ...n, body } : n);
		setDirty(true);
	}

	export function updateNodeTitle(nodeId: string, title: string) {
		nodes = nodes.map(n => n.id === nodeId ? { ...n, title } : n);
		setDirty(true);
	}

	export function addEvidenceNode(evidenceId: string, title: string, x: number, y: number, fileType?: string) {
		const nodeId = `ev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
		nodes.push({ id: nodeId, kind: 'evidence', x: snap(x), y: snap(y), w: 280, h: 160, title, evidenceId, fileType, body: '' });
		setDirty(true); scheduleDraw();
		return nodeId;
	}

	export function updateNodePosition(nodeId: string, x: number, y: number) {
		const node = nodes.find(n => n.id === nodeId || n.evidenceId === nodeId);
		if (node) { node.x = snap(x); node.y = snap(y); setDirty(true); scheduleDraw(); }
	}

	export function clearNodes() { nodes = []; edges = []; setDirty(true); scheduleDraw(); }
	export function getNodes(): BoardNode[] { return [...nodes]; }
	export function getEdges(): BoardEdge[] { return [...edges]; }

	export function addEdge(fromId: string, toId: string, label?: string, style?: 'solid' | 'dashed', connectionType?: string, strength?: number): string {
		const id = `edge-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
		edges = [...edges, { id, fromId, toId, style: style ?? 'solid', label, connectionType: connectionType ?? label, strength: strength ?? 1.0 }];
		setDirty(true); scheduleDraw();
		return id;
	}

	export function removeEdge(edgeId: string) {
		edges = edges.filter(e => e.id !== edgeId);
		setDirty(true); scheduleDraw();
	}

	export function removeNode(nodeId: string) {
		nodes = nodes.filter(n => n.id !== nodeId);
		edges = edges.filter(e => e.fromId !== nodeId && e.toId !== nodeId);
		selected = new Set([...selected].filter(id => id !== nodeId));
		setDirty(true); scheduleDraw();
	}

	export function zoomToFit() {
		if (!canvasEl || nodes.length === 0) return;
		const pad = 80;
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const n of nodes) {
			minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
			maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
		}
		if (!isFinite(minX)) return;
		const cw = canvasEl.clientWidth, ch = canvasEl.clientHeight;
		const contentW = maxX - minX + pad * 2, contentH = maxY - minY + pad * 2;
		const zoom = Math.max(0.1, Math.min(2, Math.min(cw / contentW, ch / contentH)));
		viewport = { zoom, pan: { x: -minX + pad + (cw / zoom - (maxX - minX)) / 2, y: -minY + pad + (ch / zoom - (maxY - minY)) / 2 } };
		scheduleDraw();
	}

	// Canvas export as PNG data URL
	export function exportPNG(): string | null {
		if (!canvasEl) return null;
		return canvasEl.toDataURL('image/png');
	}

	// Export nodes/edges as CSV
	export function exportCSV(): { nodesCSV: string; edgesCSV: string } {
		const nodesHeader = 'id,kind,title,x,y,w,h,evidenceId';
		const nodesRows = nodes.map(n => `"${n.id}","${n.kind}","${(n.title || '').replace(/"/g, '""')}",${n.x},${n.y},${n.w},${n.h},"${n.evidenceId || ''}"`);

		const edgesHeader = 'id,fromId,toId,connectionType,label,strength';
		const edgesRows = edges.map(e => `"${e.id}","${e.fromId}","${e.toId}","${e.connectionType || ''}","${(e.label || '').replace(/"/g, '""')}",${e.strength ?? 1}`);

		return {
			nodesCSV: [nodesHeader, ...nodesRows].join('\n'),
			edgesCSV: [edgesHeader, ...edgesRows].join('\n')
		};
	}

	function getNodeBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
		if (nodes.length === 0) return null;
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const n of nodes) {
			minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
			maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
		}
		return isFinite(minX) ? { minX, minY, maxX, maxY } : null;
	}

	function drawMinimap() {
		if (!minimapEl || !canvasEl || nodes.length === 0) return;
		const mc = minimapEl.getContext('2d');
		if (!mc) return;
		const mw = 160, mh = 100;
		mc.clearRect(0, 0, mw, mh);

		const bounds = getNodeBounds();
		if (!bounds) return;
		const pad = 40;
		const bw = bounds.maxX - bounds.minX + pad * 2;
		const bh = bounds.maxY - bounds.minY + pad * 2;
		const scale = Math.min(mw / bw, mh / bh);
		const offX = (mw - bw * scale) / 2;
		const offY = (mh - bh * scale) / 2;

		// Draw edges
		mc.strokeStyle = 'rgba(255,255,255,0.15)';
		mc.lineWidth = 0.5;
		for (const e of edges) {
			const a = getNodeById(e.fromId);
			const b = getNodeById(e.toId);
			if (!a || !b) continue;
			mc.beginPath();
			mc.moveTo(offX + (a.x + a.w / 2 - bounds.minX + pad) * scale, offY + (a.y + a.h / 2 - bounds.minY + pad) * scale);
			mc.lineTo(offX + (b.x + b.w / 2 - bounds.minX + pad) * scale, offY + (b.y + b.h / 2 - bounds.minY + pad) * scale);
			mc.stroke();
		}

		// Draw nodes
		for (const n of nodes) {
			const nx = offX + (n.x - bounds.minX + pad) * scale;
			const ny = offY + (n.y - bounds.minY + pad) * scale;
			const nw = Math.max(2, n.w * scale);
			const nh = Math.max(2, n.h * scale);
			mc.fillStyle = n.kind === 'evidence' ? 'rgba(59,130,246,0.6)' : n.kind === 'document' ? 'rgba(16,185,129,0.5)' : 'rgba(168,85,247,0.4)';
			if (selected.has(n.id)) mc.fillStyle = 'rgba(255,255,255,0.7)';
			mc.fillRect(nx, ny, nw, nh);
		}

		// Draw viewport rectangle
		const cw = canvasEl.clientWidth;
		const ch = canvasEl.clientHeight;
		const vpWorldTL = screenToWorld({ x: 0, y: 0 });
		const vpWorldBR = screenToWorld({ x: cw, y: ch });
		const vx = offX + (vpWorldTL.x - bounds.minX + pad) * scale;
		const vy = offY + (vpWorldTL.y - bounds.minY + pad) * scale;
		const vw = (vpWorldBR.x - vpWorldTL.x) * scale;
		const vh = (vpWorldBR.y - vpWorldTL.y) * scale;
		mc.strokeStyle = 'rgba(255,255,255,0.5)';
		mc.lineWidth = 1;
		mc.strokeRect(vx, vy, vw, vh);
	}

	$effect(() => {
		if (!canvasEl) return;
		ctx = canvasEl.getContext('2d');
		const wheelOpts: AddEventListenerOptions = { passive: false };
		canvasEl.addEventListener('wheel', onWheel, wheelOpts);
		ro = new ResizeObserver(() => scheduleDraw());
		if (rootEl) ro.observe(rootEl);

		const onKeyDown = (e: KeyboardEvent) => {
			if (editing) return;
			if (e.code === 'Space') spaceDown = true;
			if (e.code === 'Escape') {
				cancelEditing();
				connectionSourceId = null;
				connectionPreviewEnd = null;
				selected = new Set();
			}
			// Delete selected nodes
			if ((e.code === 'Delete' || e.code === 'Backspace') && selected.size > 0 && !editing) {
				for (const id of selected) removeNode(id);
				selected = new Set();
			}
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') e.preventDefault();
		};
		const onKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDown = false; };

		window.addEventListener('keydown', onKeyDown, { passive: false });
		window.addEventListener('keyup', onKeyUp);
		return () => {
			cancelAnimationFrame(raf);
			canvasEl?.removeEventListener('wheel', onWheel);
			ro?.disconnect();
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		};
	});
</script>

<div
	bind:this={rootEl}
	class="relative w-full h-full overflow-hidden select-none rounded-2xl border border-white/10 bg-black/20"
>
	<canvas
		bind:this={canvasEl}
		class="absolute inset-0 w-full h-full"
		class:drag-over={isDragOver}
		style:cursor={cursorStyle}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		oncontextmenu={handleContextMenu}
		ondblclick={onDblClick}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
	></canvas>

	<!-- DOM overlay -->
	<div class="absolute inset-0 pointer-events-none">
		{#if selected.size > 0}
			{@const b = selectedBounds()}
			{#if b}
				<div
					class="absolute rounded-xl border border-info/50 shadow-[0_0_0_1px_rgba(59_130_246_0.2)]"
					style="left:{b.x}px; top:{b.y}px; width:{b.w}px; height:{b.h}px;"
				>
					<div class="absolute -left-1.5 -top-1.5 w-3 h-3 rounded-full bg-info border border-black/50"></div>
					<div class="absolute -right-1.5 -top-1.5 w-3 h-3 rounded-full bg-info border border-black/50"></div>
					<div class="absolute -left-1.5 -bottom-1.5 w-3 h-3 rounded-full bg-info border border-black/50"></div>
					<div class="absolute -right-1.5 -bottom-1.5 w-3 h-3 rounded-full bg-info border border-black/50"></div>
				</div>
			{/if}
		{/if}

		{#if editing}
			{@const r = nodeScreenRect(editing.id)}
			{#if r}
				<div class="absolute pointer-events-auto" style="left:{r.x}px; top:{r.y}px; width:{r.w}px; height:{r.h}px;">
					<textarea
						class="w-full h-full resize-none rounded-xl border border-info/50 bg-black/80 p-3 text-white/90 outline-none text-sm font-sans"
						value={editing.value}
						oninput={(e) => (editing = { ...editing!, value: (e.currentTarget as HTMLTextAreaElement).value })}
						onkeydown={(e) => {
							if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commitEditing(); }
							if (e.key === 'Escape') { e.preventDefault(); cancelEditing(); }
						}}
						onblur={commitEditing}
					></textarea>
					<div class="mt-2 text-[10px] text-white/40 font-mono tracking-tight">CMD+ENTER to save &bull; ESC to cancel</div>
				</div>
			{/if}
		{/if}

		<!-- Connection drawing hint -->
		{#if activeTool === 'connection' && connectionSourceId}
			<div class="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none px-3 py-1 rounded-full bg-info/90 text-white text-xs font-mono">
				Click target node to connect &bull; ESC to cancel
			</div>
		{:else if activeTool === 'connection'}
			<div class="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none px-3 py-1 rounded-full bg-black/60 text-white/70 text-xs font-mono">
				Click source node to start connection
			</div>
		{:else if activeTool === 'note'}
			<div class="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none px-3 py-1 rounded-full bg-black/60 text-white/70 text-xs font-mono">
				Click canvas to place a note
			</div>
		{:else if activeTool === 'evidence'}
			<div class="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none px-3 py-1 rounded-full bg-black/60 text-white/70 text-xs font-mono">
				Click canvas to place evidence
			</div>
		{/if}
	</div>

	<!-- Drop zone overlay -->
	{#if isDragOver}
		<div class="absolute inset-0 pointer-events-none rounded-2xl border-2 border-dashed border-info/60 bg-info/5 z-10">
			<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-info/70 text-sm font-mono">
				Drop evidence here
			</div>
		</div>
	{/if}

	<!-- HUD -->
	<div class="absolute left-3 bottom-3 pointer-events-none text-[10px] text-white/30 font-mono">
		<div class="flex gap-4">
			<span>ZOOM: {Math.round(viewport.zoom * 100)}%</span>
			<span>PAN: {Math.round(viewport.pan.x)},{Math.round(viewport.pan.y)}</span>
			<span>NODES: {nodes.length}</span>
			<span>EDGES: {edges.length}</span>
		</div>
	</div>

	<!-- Edge legend -->
	{#if edges.length > 0}
		<div class="absolute right-3 bottom-3 pointer-events-none flex flex-wrap gap-2 text-[9px] font-mono">
			{#each Object.entries(EDGE_COLORS).slice(0, 6) as [type, color]}
				<span class="flex items-center gap-1">
					<span class="inline-block w-3 h-0.5 rounded" style="background:{color}"></span>
					<span class="text-white/40">{type}</span>
				</span>
			{/each}
		</div>
	{/if}

	<!-- Minimap -->
	{#if nodes.length > 0}
		<canvas
			bind:this={minimapEl}
			class="absolute top-3 right-3 rounded-lg border border-white/15 bg-black/60 backdrop-blur-sm"
			width={160}
			height={100}
			style="width:160px;height:100px;pointer-events:auto;cursor:pointer;"
			onclick={(e: MouseEvent) => {
				if (!minimapEl || !canvasEl || nodes.length === 0) return;
				const rect = minimapEl.getBoundingClientRect();
				const mx = e.clientX - rect.left;
				const my = e.clientY - rect.top;
				// Convert minimap click to world coords and center viewport there
				const bounds = getNodeBounds();
				if (!bounds) return;
				const pad = 40;
				const bw = bounds.maxX - bounds.minX + pad * 2;
				const bh = bounds.maxY - bounds.minY + pad * 2;
				const scale = Math.min(160 / bw, 100 / bh);
				const offX = (160 - bw * scale) / 2;
				const offY = (100 - bh * scale) / 2;
				const worldX = (mx - offX) / scale + bounds.minX - pad;
				const worldY = (my - offY) / scale + bounds.minY - pad;
				const cw = canvasEl.clientWidth;
				const ch = canvasEl.clientHeight;
				viewport = { ...viewport, pan: { x: -worldX + cw / (2 * viewport.zoom), y: -worldY + ch / (2 * viewport.zoom) } };
			}}
		></canvas>
	{/if}
</div>
