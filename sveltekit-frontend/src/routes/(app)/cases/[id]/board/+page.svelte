<script lang="ts">
	import HybridBoard from '$lib/components/canvas/HybridBoard.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { ChatSession } from '$lib/models/ChatSession.svelte.js';
	import TypewriterResponse from '$lib/components/ai/TypewriterResponse.svelte';
	import AISummaryMiniModal from '$lib/components/legal/AISummaryMiniModal.svelte';
	import { boardHistory } from '$lib/components/evidence/board-history.svelte.js';
	import {
		scheduleSave,
		flushSave,
		scheduleServerSave,
		flushServerSave,
		loadLayout,
		type BoardLayout,
	} from '$lib/components/evidence/board-persistence.svelte.js';
	import WebGPUParticleOverlay from '$lib/components/evidence/WebGPUParticleOverlay.svelte';
	import Fuse from 'fuse.js';
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { notificationStore } from '$lib/stores/notifications.svelte';

	// Props
	let { data }: { data: PageData } = $props();
	let caseId = $derived(data.caseId);
	let initialState = $derived(data.initialState);
	let evidenceItems = $derived(data.evidence || []);
	let dbConnections = $derived(data.connections || []);

	// State
	let board: HybridBoard = $state() as HybridBoard;
	let isDirty = $state(false);
	let isSaving = $state(false);
	// Set of evidence IDs currently on the canvas (updated via refreshPlacedIds)
	let placedEvidenceIds = $state<Set<string>>(new Set());

	function refreshPlacedIds() {
		if (!board) return;
		const nodes = board.getNodes();
		const next = new Set<string>();
		for (const n of nodes) {
			if (n.evidenceId) next.add(n.evidenceId);
		}
		placedEvidenceIds = next;
	}
	let activeView = $state<'wall' | 'line' | 'file' | 'list'>('wall');
	let selectedEvidence = $state<any>(null);
	let showAddEvidence = $state(false);
	let activeTool = $state<'select' | 'evidence' | 'connection' | 'note'>('select');
	let showAIChat = $state(false);
	let isGeneratingLayout = $state(false);

	// File type detection helpers for media preview
	function isEvidenceAudio(ft: string | undefined): boolean {
		if (!ft) return false;
		const t = ft.toLowerCase();
		return t.startsWith('audio') || t === 'mp3' || t === 'wav' || t === 'ogg' || t === 'aac';
	}
	function isEvidenceVideo(ft: string | undefined): boolean {
		if (!ft) return false;
		const t = ft.toLowerCase();
		return t.startsWith('video') || t === 'mp4' || t === 'mov' || t === 'avi' || t === 'webm';
	}
	function isEvidenceImage(ft: string | undefined): boolean {
		if (!ft) return false;
		const t = ft.toLowerCase();
		return t.startsWith('image') || t === 'jpg' || t === 'jpeg' || t === 'png' || t === 'gif' || t === 'webp';
	}

	// Case switcher (lets user jump between cases without leaving board)
	interface CaseListItem { id: string; title: string; status: string; updatedAt?: string }
	let caseList = $state<CaseListItem[]>([]);
	let showCaseSwitcher = $state(false);
	let caseSwitcherQuery = $state('');
	let filteredCases = $derived.by(() => {
		const q = caseSwitcherQuery.trim().toLowerCase();
		if (!q) return caseList;
		return caseList.filter(c => c.title.toLowerCase().includes(q) || c.id.startsWith(q));
	});

	// Inline case creation from command palette
	let isCreatingCase = $state(false);
	let showCreateCaseForm = $state(false);
	let newCaseTitle = $state('');
	let newCaseDescription = $state('');

	async function createNewCase() {
		const title = newCaseTitle.trim();
		const description = (newCaseDescription.trim() || `Created from board ${new Date().toLocaleDateString()}`);
		if (!title) return;
		isCreatingCase = true;
		try {
			const res = await fetch('/api/cases', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title, description, status: 'open', priority: 'medium' })
			});
			if (res.ok) {
				const body = await res.json();
				// API wraps as { success, data: { case, message }, timestamp }; some routes return raw { case }
				const created = body?.data?.case || body?.case || body?.data || body;
				const newId = created?.id;
				if (newId) {
					// Reset and navigate
					newCaseTitle = '';
					newCaseDescription = '';
					showCreateCaseForm = false;
					showCaseSwitcher = false;
					window.location.href = `/cases/${newId}/board`;
					return;
				}
			}
			notificationStore.add({ type: 'error', title: 'Create failed', message: 'Could not create case.' });
		} catch (e) {
			console.error('Create case failed:', e);
			notificationStore.add({ type: 'error', title: 'Create failed', message: 'Network error creating case.' });
		} finally {
			isCreatingCase = false;
		}
	}

	async function loadCaseList() {
		try {
			const res = await fetch('/api/cases?limit=50');
			if (res.ok) {
				const data = await res.json();
				caseList = (data.cases || []).map((c: any) => ({
					id: c.id,
					title: c.title || 'Untitled Case',
					status: c.status || 'open',
					updatedAt: c.updatedAt
				}));
			}
		} catch (e) {
			console.error('Failed to load case list:', e);
		}
	}

	function switchToCase(targetId: string) {
		if (targetId === caseId) {
			showCaseSwitcher = false;
			return;
		}
		showCaseSwitcher = false;
		// Use SvelteKit's goto for client-side navigation
		window.location.href = `/cases/${targetId}/board`;
	}

	// Fuse.js fuzzy search for evidence sidebar
	let searchQuery = $state('');
	let placementFilter = $state<'all' | 'unplaced' | 'placed'>('all');
	const fuseOptions = { keys: ['title', 'description', 'type', 'location', 'fileType'], threshold: 0.4, ignoreLocation: true };
	let fuse = $derived(new Fuse(evidenceItems, fuseOptions));
	let filteredEvidence = $derived.by(() => {
		const base = searchQuery.trim()
			? fuse.search(searchQuery).map((r: any) => r.item)
			: evidenceItems;
		if (placementFilter === 'unplaced') return base.filter((it: any) => !placedEvidenceIds.has(it.id));
		if (placementFilter === 'placed') return base.filter((it: any) => placedEvidenceIds.has(it.id));
		return base;
	});

	// Position of the currently-selected evidence within the filtered list (1-based)
	let selectedEvidenceIndex = $derived.by(() => {
		if (!selectedEvidence) return -1;
		return filteredEvidence.findIndex((it: any) => it.id === selectedEvidence.id);
	});

	/** Places every filtered+unplaced evidence item onto the canvas in a grid around the visible center. */
	function placeAllVisible() {
		if (!board || filteredEvidence.length === 0) return;
		const toPlace = filteredEvidence.filter((it: any) => !placedEvidenceIds.has(it.id));
		if (toPlace.length === 0) {
			notificationStore.add({ type: 'info', title: 'Nothing to place', message: 'All visible evidence is already on the board.' });
			return;
		}
		const center = board.getVisibleCenter();
		const nodeW = 280, nodeH = 160, gap = 40;
		const columns = Math.max(1, Math.ceil(Math.sqrt(toPlace.length)));
		const rows = Math.ceil(toPlace.length / columns);
		// Grid origin so the block is centered on the viewport center
		const originX = center.x - (columns * (nodeW + gap) - gap) / 2;
		const originY = center.y - (rows * (nodeH + gap) - gap) / 2;
		for (let i = 0; i < toPlace.length; i++) {
			const col = i % columns;
			const row = Math.floor(i / columns);
			const item = toPlace[i];
			board.addEvidenceNode(
				item.id,
				item.title,
				originX + col * (nodeW + gap),
				originY + row * (nodeH + gap),
				item.fileType
			);
		}
		notificationStore.add({
			type: 'success',
			title: `${toPlace.length} placed`,
			message: `Laid out in a ${columns}×${rows} grid`
		});
	}

	function navEvidence(direction: 1 | -1) {
		if (filteredEvidence.length === 0) return;
		const current = selectedEvidenceIndex;
		const next = direction === 1
			? (current < 0 ? 0 : (current + 1) % filteredEvidence.length)
			: (current <= 0 ? filteredEvidence.length - 1 : current - 1);
		selectedEvidence = filteredEvidence[next];
		queueMicrotask(() => {
			document.querySelector(`.evidence-card.selected`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		});
	}

	// AI Chat session (contextual to this case)
	let chatSession: ChatSession | null = $state(null);
	let currentMessage = $state('');
	let chatContainer: HTMLElement | null = $state(null);
	let isRecording = $state(false);
	let mediaRecorder: MediaRecorder | null = null;

	// AI Summary Modal
	let showSummaryModal = $state(false);
	let summaryEvidenceId = $state<string | null>(null);
	let summaryEvidenceTitle = $state<string | null>(null);

	// WebGPU particle overlay state
	let particlesEnabled = $state(true);
	let crtEnabled = $state(true);
	let boardMouseX = $state(0.5);
	let boardMouseY = $state(0.5);
	let isDraggingNode = $state(false);
	let boardZoom = $state(1.0);
	let canvasAreaEl: HTMLElement | null = $state(null);

	function handleCanvasMouseMove(e: MouseEvent) {
		if (!canvasAreaEl) return;
		const rect = canvasAreaEl.getBoundingClientRect();
		boardMouseX = (e.clientX - rect.left) / rect.width;
		boardMouseY = (e.clientY - rect.top) / rect.height;
	}

	// Context menu
	let contextMenu = $state<{ node: any; x: number; y: number } | null>(null);

	// Selected board node (for note editing in sidebar)
	let selectedNode = $state<any>(null);
	let noteTitle = $state('');
	let noteBody = $state('');

	// Handle canvas click — create note when note tool is active
	function handleCanvasClick(world: { x: number; y: number }) {
		contextMenu = null;

		if (activeTool === 'note' && board) {
			const nodeId = board.addNote(world.x, world.y);
			const nodes = board.getNodes();
			const newNode = nodes.find((n: any) => n.id === nodeId);
			if (newNode) {
				selectedNode = newNode;
				noteTitle = newNode.title ?? 'New Note';
				noteBody = newNode.body ?? '';
				selectedEvidence = null;
			}
			activeTool = 'select';
		} else if (activeTool === 'evidence' && board && selectedEvidence) {
			board.addEvidenceNode(selectedEvidence.id, selectedEvidence.title, world.x, world.y, selectedEvidence.fileType);
			activeTool = 'select';
		}
	}

	// Handle node selection from canvas
	function handleNodeSelect(node: any) {
		if (!node) {
			selectedNode = null;
			return;
		}
		selectedNode = node;
		if (node.kind === 'note') {
			noteTitle = node.title ?? '';
			noteBody = node.body ?? '';
			selectedEvidence = null;
		} else if (node.kind === 'evidence' && node.evidenceId) {
			const match = evidenceItems.find((e: any) => e.id === node.evidenceId);
			if (match) selectedEvidence = match;
		}
	}

	// Save note edits back to the board
	function saveNoteEdits() {
		if (!board || !selectedNode) return;
		board.updateNodeTitle(selectedNode.id, noteTitle);
		board.updateNodeBody(selectedNode.id, noteBody);
		selectedNode = { ...selectedNode, title: noteTitle, body: noteBody };
	}

	// Delete the selected note from the board
	function deleteSelectedNote() {
		if (!board || !selectedNode) return;
		board.removeNode(selectedNode.id);
		selectedNode = null;
		noteTitle = '';
		noteBody = '';
	}

	// Key points generation
	let isGeneratingKeyPoints = $state(false);

	async function generateEvidenceKeyPoints(evidenceId: string) {
		isGeneratingKeyPoints = true;
		try {
			const res = await fetch(`/api/evidence/${evidenceId}/key-points`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ caseId })
			});
			if (res.ok) {
				const result = await res.json();
				if (result.keyPoints?.length) {
					// Update the evidence item in the local array
					const idx = evidenceItems.findIndex((e: { id: string }) => e.id === evidenceId);
					if (idx >= 0) {
						(evidenceItems[idx] as Record<string, unknown>).keyPoints = result.keyPoints;
						// Force reactivity by reassigning selectedEvidence
						if (selectedEvidence?.id === evidenceId) {
							selectedEvidence = { ...selectedEvidence, keyPoints: result.keyPoints };
						}
					}
				}
			}
		} catch {
			// Silent fail
		} finally {
			isGeneratingKeyPoints = false;
		}
	}

	// Handle connection created from HybridBoard canvas
	async function handleConnectionCreated(fromNodeId: string, toNodeId: string) {
		if (!board) return;
		const nodes = board.getNodes();
		const fromNode = nodes.find((n: any) => n.id === fromNodeId);
		const toNode = nodes.find((n: any) => n.id === toNodeId);

		// Add visual edge immediately
		const edgeId = board.addEdge(fromNodeId, toNodeId, 'related', 'solid', 'related', 1.0);

		// Push undo command
		boardHistory.push({
			execute: () => board.addEdge(fromNodeId, toNodeId, 'related', 'solid', 'related', 1.0),
			undo: () => board.removeEdge(edgeId),
			description: 'Add connection'
		});

		// Persist to DB if both are evidence nodes
		if (fromNode?.evidenceId && toNode?.evidenceId) {
			await persistConnection(fromNode.evidenceId, toNode.evidenceId);
		}
	}

	// Handle right-click context menu from HybridBoard canvas
	function handleBoardContextMenu(node: any, screen: { x: number; y: number }) {
		contextMenu = { node, x: screen.x, y: screen.y };
	}

	// Close context menu
	function closeContextMenu() {
		contextMenu = null;
	}

	// Context menu actions
	function ctxDelete() {
		if (!board || !contextMenu) return;
		board.removeNode(contextMenu.node.id);
		boardHistory.push({
			execute: () => board.removeNode(contextMenu!.node.id),
			undo: () => {}, // simplified — full restore would need node data
			description: 'Delete node'
		});
		closeContextMenu();
	}

	function ctxDuplicate() {
		if (!board || !contextMenu) return;
		const n = contextMenu.node;
		if (n.kind === 'note') {
			board.addNote(n.x + 40, n.y + 40, n.title, n.body);
		} else if (n.kind === 'evidence' && n.evidenceId) {
			board.addEvidenceNode(n.evidenceId, n.title ?? 'Untitled', n.x + 40, n.y + 40, n.fileType);
		}
		closeContextMenu();
	}

	function ctxSummarize() {
		if (!contextMenu) return;
		const n = contextMenu.node;
		if (n.evidenceId) {
			summaryEvidenceId = n.evidenceId;
			summaryEvidenceTitle = n.title ?? null;
			showSummaryModal = true;
		}
		closeContextMenu();
	}

	// Export canvas as PNG download
	function exportPNG() {
		if (!board) return;
		const dataUrl = board.exportPNG();
		if (!dataUrl) return;
		const a = document.createElement('a');
		a.href = dataUrl;
		a.download = `evidence-board-${caseId.substring(0, 8)}-${Date.now()}.png`;
		a.click();
	}

	// Export canvas data as CSV download
	function exportCSV() {
		if (!board) return;
		const { nodesCSV, edgesCSV } = board.exportCSV();
		const blob = new Blob([`--- NODES ---\n${nodesCSV}\n\n--- EDGES ---\n${edgesCSV}`], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `evidence-board-${caseId.substring(0, 8)}-${Date.now()}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	onMount(() => {
		// Initialize chat session with case context
		chatSession = new ChatSession(`board-${caseId}`, [], true);

		// Load timeline events (non-blocking)
		loadTimeline();

		// Load case list for the case switcher (non-blocking)
		loadCaseList();

		// Initial scan of placed evidence (after board mounts + initialState hydrates)
		queueMicrotask(refreshPlacedIds);

		// Seed board edges from DB connections (after board mounts)
		if (board && dbConnections.length > 0) {
			const existingNodes = board.getNodes();
			const nodeByEvidenceId = new Map(
				existingNodes.filter((n: any) => n.evidenceId).map((n: any) => [n.evidenceId, n.id])
			);

			for (const conn of dbConnections) {
				const fromNodeId = nodeByEvidenceId.get(conn.fromEvidenceId);
				const toNodeId = nodeByEvidenceId.get(conn.toEvidenceId);
				if (fromNodeId && toNodeId) {
					board.addEdge(fromNodeId, toNodeId, conn.label ?? conn.connectionType ?? undefined, 'solid', conn.connectionType ?? 'related', conn.strength ?? 1.0);
				}
			}
		}

		// Load cached layout from IndexedDB if no server state
		const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
		if (!initialState && board && validId) {
			loadLayout(caseId).then((cached) => {
				if (cached && cached.nodes?.length > 0) {
					// Restore cached viewport/nodes via board methods
					for (const n of cached.nodes) {
						if (n.evidenceId) {
							board.addEvidenceNode(n.evidenceId, n.title ?? 'Untitled', n.x, n.y);
						}
					}
					board.zoomToFit();
				}
			});
		}

		// Flush pending saves on page unload.
		// flushSave() writes to IndexedDB (local); flushServerSave() uses
		// navigator.sendBeacon so the POST survives page teardown.
		const onBeforeUnload = () => {
			flushSave();
			flushServerSave();
		};
		window.addEventListener('beforeunload', onBeforeUnload);

		return () => {
			chatSession?.destroy();
			boardHistory.clear();
			flushSave();
			flushServerSave();
			window.removeEventListener('beforeunload', onBeforeUnload);
		};
	});

	// Auto-save when the board is dirty. Two-tier debounce:
	//   IndexedDB (2s) — survives refresh on the same device
	//   Server (4s)   — survives device-switch, browser wipe, tab close via sendBeacon
	// The client cache is still the fast read path on load, but the server is now
	// the durable source of truth even when the user never clicks Save.
	const isValidCaseId = $derived(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId));
	$effect(() => {
		if (isDirty && board && isValidCaseId) {
			const snapshot = board.serialize();
			const layout: BoardLayout = {
				caseId,
				nodes: snapshot.nodes,
				connections: snapshot.edges,
				viewport: { zoom: snapshot.viewport.zoom, panX: snapshot.viewport.pan.x, panY: snapshot.viewport.pan.y },
				timestamp: Date.now()
			};
			scheduleSave(layout);
			scheduleServerSave(caseId, snapshot);
		}
	});

	// Timeline state (fetched client-side)
	interface TimelineEvent {
		id: string;
		type: string;
		title: string;
		description: string;
		actor: string | null;
		method: string | null;
		reason: string | null;
		timestamp: string;
		metadata: Record<string, any>;
	}
	let timelineEvents = $state<TimelineEvent[]>([]);
	let timelineLoading = $state(false);

	// Keyboard shortcuts (from CollaborativeEvidenceCanvas analysis)
	function handleKeyboard(e: KeyboardEvent) {
		// Quick switch case: Ctrl/Cmd + K (command palette pattern)
		if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
			e.preventDefault();
			showCaseSwitcher = !showCaseSwitcher;
			if (showCaseSwitcher && caseList.length === 0) loadCaseList();
			return;
		}
		// Close case switcher with Escape
		if (e.key === 'Escape' && showCaseSwitcher) {
			showCaseSwitcher = false;
			return;
		}

		// Arrow up/down, Home/End: navigate evidence sidebar when not typing
		const target = e.target as HTMLElement | null;
		const inEditable = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
		if (!inEditable && !showCaseSwitcher && filteredEvidence.length > 0) {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				navEvidence(e.key === 'ArrowDown' ? 1 : -1);
				return;
			}
			if (e.key === 'Home') {
				e.preventDefault();
				selectedEvidence = filteredEvidence[0];
				queueMicrotask(() => document.querySelector(`.evidence-card.selected`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
				return;
			}
			if (e.key === 'End') {
				e.preventDefault();
				selectedEvidence = filteredEvidence[filteredEvidence.length - 1];
				queueMicrotask(() => document.querySelector(`.evidence-card.selected`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
				return;
			}
			// Enter: place evidence on canvas — OR pan to it if already placed
			if (e.key === 'Enter' && selectedEvidence && board) {
				e.preventDefault();
				const existing = board.findNodeByEvidenceId(selectedEvidence.id);
				if (existing) {
					// Already on canvas — pan to the existing node instead of duplicating
					board.centerOnNode(existing.id);
					notificationStore.add({
						type: 'info',
						title: 'Already on board',
						message: `Centered on "${existing.title ?? selectedEvidence.title}"`
					});
					return;
				}
				// Use world-space visible center (respects pan/zoom)
				const center = board.getVisibleCenter();
				// Stagger so repeated presses don't overlap exactly
				const jitter = (Math.random() - 0.5) * 120;
				const placedTitle = selectedEvidence.title;
				const newId = board.addEvidenceNode(
					selectedEvidence.id,
					placedTitle,
					center.x - 140 + jitter,
					center.y - 80 + jitter,
					selectedEvidence.fileType
				);
				// Brief flash + toast to confirm placement
				if (newId) {
					board.flashNode(newId);
					notificationStore.add({
						type: 'success',
						title: 'Evidence placed',
						message: placedTitle
					});
				}
				return;
			}
		}
		// Save: Ctrl/Cmd + S
		if ((e.ctrlKey || e.metaKey) && e.key === 's') {
			e.preventDefault();
			save();
		}
		// Undo: Ctrl/Cmd + Z
		else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
			e.preventDefault();
			undo();
		}
		// Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
		else if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
			e.preventDefault();
			redo();
		}
		// Zoom to fit: Ctrl/Cmd + 0
		else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
			e.preventDefault();
			board?.zoomToFit();
		}
		// Tool shortcuts
		else if (e.key === 'v') {
			activeTool = 'select';
		} else if (e.key === 'e') {
			activeTool = 'evidence';
		} else if (e.key === 'c') {
			activeTool = 'connection';
		} else if (e.key === 'n') {
			activeTool = 'note';
		}
		// View shortcuts
		else if (e.key === '1') {
			activeView = 'wall';
		} else if (e.key === '2') {
			activeView = 'line';
		} else if (e.key === '3') {
			activeView = 'file';
		} else if (e.key === '4') {
			activeView = 'list';
		}
		// FX toggles
		else if (e.key === 'p') {
			particlesEnabled = !particlesEnabled;
		} else if (e.key === 'o') {
			crtEnabled = !crtEnabled;
		}
	}

	function undo() {
		if (!boardHistory.canUndo) return;
		boardHistory.undo();
		isDirty = true;
	}

	function redo() {
		if (!boardHistory.canRedo) return;
		boardHistory.redo();
		isDirty = true;
	}

	// Persist a new connection to the API
	async function persistConnection(fromEvidenceId: string, toEvidenceId: string, connectionType = 'related', label?: string) {
		if (!isValidCaseId) return null;
		try {
			const res = await fetch(`/api/cases/${caseId}/connections`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fromEvidenceId, toEvidenceId, connectionType, label })
			});
			if (res.ok) {
				const { connection } = await res.json();
				return connection;
			}
		} catch (e) {
			console.error('Failed to persist connection:', e);
		}
		return null;
	}

	// Delete a connection from the API
	async function deleteConnectionFromApi(connectionId: string) {
		if (!isValidCaseId) return;
		try {
			await fetch(`/api/cases/${caseId}/connections`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ connectionId })
			});
		} catch (e) {
			console.error('Failed to delete connection:', e);
		}
	}

	// Fetch timeline events client-side
	async function loadTimeline() {
		if (!isValidCaseId) { timelineLoading = false; return; }
		timelineLoading = true;
		try {
			const res = await fetch(`/api/cases/${caseId}/timeline?limit=30`);
			if (res.ok) {
				const data = await res.json();
				timelineEvents = data.events ?? [];
			}
		} catch (e) {
			console.error('Failed to load timeline:', e);
		} finally {
			timelineLoading = false;
		}
	}

	// Parse AI layout suggestions and apply to canvas
	function parseAndApplyLayout(aiResponse: string) {
		if (!board) return;

		// Parse format: "Item N: position (x%, y%)"
		const regex = /Item (\d+):\s*position\s*\((\d+)%?,?\s*(\d+)%?\)/gi;
		let match;
		const positions: Array<{ itemIndex: number; x: number; y: number }> = [];

		while ((match = regex.exec(aiResponse)) !== null) {
			positions.push({
				itemIndex: parseInt(match[1]) - 1, // 0-indexed
				x: parseInt(match[2]),
				y: parseInt(match[3])
			});
		}

		if (positions.length === 0) {
			console.warn('No layout positions found in AI response');
			return;
		}

		// Clear existing nodes and apply new layout
		board.clearNodes();

		// Canvas dimensions (approximate, will scale with viewport)
		const canvasWidth = 2000;
		const canvasHeight = 1500;

		positions.forEach(({ itemIndex, x, y }) => {
			const item = evidenceItems[itemIndex];
			if (item) {
				// Convert percentage to canvas coordinates
				const posX = (x / 100) * canvasWidth;
				const posY = (y / 100) * canvasHeight;
				board.addEvidenceNode(item.id, item.title, posX, posY);
			}
		});

		// Mark as dirty to trigger save prompt
		isDirty = true;
	}

	// AI-powered layout generation
	async function generateAILayout() {
		if (!chatSession || evidenceItems.length === 0) return;

		isGeneratingLayout = true;
		showAIChat = true; // Auto-open chat to show progress

		const layoutPrompt = `You are analyzing ${evidenceItems.length} evidence items for case ${caseId}.

Evidence summary:
${evidenceItems.slice(0, 20).map((e: any, i: number) => `${i + 1}. "${e.title}" (${e.type}) - ${e.date}`).join('\n')}

Generate an optimal canvas layout strategy. For each evidence item, suggest:
1. X/Y position (0-100% of canvas width/height)
2. Grouping strategy (chronological, by type, by importance)
3. Connection suggestions between related items

Format as: "Item N: position (x%, y%), group: [name], connect to: [items]"

IMPORTANT: Always include position coordinates for each item in the exact format shown above.`;

		await chatSession.sendMessage(layoutPrompt);

		// Watch for the AI's response to auto-apply layout
		const checkResponse = setInterval(() => {
			if (chatSession && chatSession.status === 'idle' && chatSession.messages.length > 0) {
				const lastMsg = chatSession.messages[chatSession.messages.length - 1];
				if (lastMsg.role === 'assistant') {
					parseAndApplyLayout(lastMsg.content);
					clearInterval(checkResponse);
				}
			}
		}, 500);

		// Cleanup after 30 seconds
		setTimeout(() => {
			clearInterval(checkResponse);
			isGeneratingLayout = false;
		}, 30000);

		isGeneratingLayout = false;
	}

	// Send chat message
	async function sendChatMessage() {
		if (!chatSession || !currentMessage.trim()) return;

		const msg = currentMessage.trim();
		currentMessage = '';
		await chatSession.sendMessage(msg);

		// Save to database
		await saveChatToDatabase();

		// Auto-scroll chat
		setTimeout(() => {
			if (chatContainer) {
				chatContainer.scrollTop = chatContainer.scrollHeight;
			}
		}, 100);
	}

	// Save chat history to database
	async function saveChatToDatabase() {
		if (!chatSession || chatSession.messages.length === 0 || !isValidCaseId) return;

		try {
			const chatId = `board-${caseId}`;
			const response = await fetch(`/api/cases/${caseId}/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					chatId,
					messages: chatSession.messages,
					metadata: {
						evidenceCount: evidenceItems.length,
						timestamp: new Date().toISOString()
					}
				})
			});

			if (!response.ok) {
				console.error('Failed to save chat history');
			}
		} catch (e) {
			console.error('Error saving chat:', e);
		}
	}

	// Export chat transcript as PDF
	async function exportChatPDF() {
		if (!chatSession || chatSession.messages.length === 0) return;

		const transcript = chatSession.messages
			.map((msg, idx) => {
				const role = msg.role === 'user' ? 'You' : 'AI Assistant';
				const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '';
				return `${idx + 1}. ${role} ${timestamp ? `(${timestamp})` : ''}\n${msg.content}\n`;
			})
			.join('\n---\n\n');

		const blob = new Blob([
			`Evidence Board Chat Transcript\n`,
			`Case ID: ${caseId}\n`,
			`Generated: ${new Date().toLocaleString()}\n`,
			`\n${'='.repeat(80)}\n\n`,
			transcript
		], { type: 'text/plain' });

		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `evidence-board-chat-${caseId.substring(0, 8)}-${Date.now()}.txt`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// Voice input with Whisper STT
	async function startVoiceInput() {
		if (!navigator.mediaDevices || isRecording) return;

		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const chunks: Blob[] = [];

			mediaRecorder = new MediaRecorder(stream);
			mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
			mediaRecorder.onstop = async () => {
				const audioBlob = new Blob(chunks, { type: 'audio/webm' });
				const formData = new FormData();
				formData.append('audio', audioBlob, 'voice.webm');

				try {
					const response = await fetch('/api/whisper/transcribe', {
						method: 'POST',
						body: formData
					});

					if (response.ok) {
						const data = await response.json();
						currentMessage = (currentMessage ? currentMessage + ' ' : '') + data.text;
					} else {
						console.error('Transcription failed');
					}
				} catch (e) {
					console.error('Error transcribing audio:', e);
				}

				stream.getTracks().forEach(track => track.stop());
			};

			mediaRecorder.start();
			isRecording = true;
		} catch (e) {
			console.error('Error accessing microphone:', e);
			notificationStore.add({ type: 'error', title: 'Microphone error', message: 'Unable to access microphone. Please check permissions.' });
		}
	}

	function stopVoiceInput() {
		if (mediaRecorder && isRecording) {
			mediaRecorder.stop();
			isRecording = false;
			mediaRecorder = null;
		}
	}

	async function save() {
		if (!board || !isValidCaseId) return;
		isSaving = true;

		try {
			const snapshot = board.serialize();
			// Manual save flushes any pending debounced server save first to
			// avoid a double-POST + give the user accurate "saved at" feedback.
			flushServerSave();
			const res = await fetch(`/api/cases/${caseId}/canvas`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(snapshot),
			});
			if (!res.ok) {
				console.error('Failed to save', await res.json());
				notificationStore.add({ type: 'error', title: 'Save failed', message: 'Failed to save board state.' });
			} else {
				isDirty = false;
			}
		} catch (e) {
			console.error('Save error', e);
			notificationStore.add({ type: 'error', title: 'Save error', message: 'Error saving board state.' });
		} finally {
			isSaving = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeyboard} />

<div class="evidence-board-container">
	<!-- Header -->
	<header class="board-header">
		<div class="header-left">
			<div class="board-title">
				<Icon name="layout-grid" class="title-icon" />
				<h1>EVIDENCE BOARD</h1>
			</div>
			<div class="case-meta">
				<span class="case-number">CASE #{caseId.substring(0, 8)}</span>
				<span class="separator">•</span>
				<span class="view-mode">Interactive Investigation Canvas</span>
			</div>
		</div>

		<div class="header-actions">
			<!-- Case Switcher -->
			<div class="case-switcher">
				<button
					class="action-btn"
					onclick={() => { showCaseSwitcher = !showCaseSwitcher; if (showCaseSwitcher && caseList.length === 0) loadCaseList(); }}
					title="Switch to another case (Ctrl+K)"
				>
					<Icon name="arrow-left-right" />
					Switch Case
					<kbd class="kbd-hint">⌘K</kbd>
				</button>
			</div>

			<button
				class="action-btn"
				onclick={generateAILayout}
				disabled={isGeneratingLayout || evidenceItems.length === 0}
				title="AI-Powered Layout Generation"
			>
				<Icon name={isGeneratingLayout ? 'loader' : 'sparkles'} />
				{isGeneratingLayout ? '' : 'AI Layout'}
			</button>
			<button
				class="action-btn"
				class:active={showAIChat}
				onclick={() => (showAIChat = !showAIChat)}
				title="AI Assistant Chat"
			>
				<Icon name="message-circle" />
				Chat
			</button>
			<button class="action-btn" title="Active Investigation">
				<Icon name="activity" />
			</button>
			<button class="btn-primary" onclick={() => (showAddEvidence = true)}>
				<Icon name="plus" />
				Add Evidence
			</button>
		</div>
	</header>

	<!-- View Tabs -->
	<div class="view-tabs">
		<button
			class="tab"
			class:active={activeView === 'wall'}
			onclick={() => (activeView = 'wall')}
		>
			<Icon name="grid-3x3" />
			WALL
		</button>
		<button
			class="tab"
			class:active={activeView === 'line'}
			onclick={() => (activeView = 'line')}
		>
			<Icon name="git-branch" />
			LINE
		</button>
		<button
			class="tab"
			class:active={activeView === 'file'}
			onclick={() => (activeView = 'file')}
		>
			<Icon name="file-text" />
			FILE
		</button>
		<button
			class="tab"
			class:active={activeView === 'list'}
			onclick={() => (activeView = 'list')}
		>
			<Icon name="list" />
			LIST
		</button>

		{#if isDirty}
			<div class="unsaved-indicator">
				<span class="pulse-dot"></span>
				Unsaved changes
			</div>
		{/if}

		<button class="save-btn" onclick={save} disabled={isSaving || !isDirty}>
			<Icon name="save" />
			{isSaving ? 'Saving...' : 'Save Board'}
		</button>
	</div>

	<!-- Tools Toolbar (inspired by CollaborativeEvidenceCanvas) -->
	<div class="tools-toolbar">
		<div class="tool-group">
			<button
				class="tool-btn"
				class:active={activeTool === 'select'}
				onclick={() => (activeTool = 'select')}
				title="Select Tool (V)"
			>
				<Icon name="mouse-pointer-2" />
			</button>
			<button
				class="tool-btn"
				class:active={activeTool === 'evidence'}
				onclick={() => (activeTool = 'evidence')}
				title="Add Evidence (E)"
			>
				<Icon name="file-plus" />
			</button>
			<button
				class="tool-btn"
				class:active={activeTool === 'connection'}
				onclick={() => (activeTool = 'connection')}
				title="Draw Connection (C)"
			>
				<Icon name="git-branch" />
			</button>
			<button
				class="tool-btn"
				class:active={activeTool === 'note'}
				onclick={() => (activeTool = 'note')}
				title="Add Note (N)"
			>
				<Icon name="sticky-note" />
			</button>
		</div>

		<div class="tool-group">
			<button
				class="tool-btn"
				onclick={undo}
				disabled={!boardHistory.canUndo}
				title="Undo (Ctrl+Z)"
			>
				<Icon name="undo" />
			</button>
			<button
				class="tool-btn"
				onclick={redo}
				disabled={!boardHistory.canRedo}
				title="Redo (Ctrl+Shift+Z)"
			>
				<Icon name="redo" />
			</button>
		</div>

		<div class="tool-group">
			<button
				class="tool-btn"
				onclick={() => board?.zoomToFit()}
				title="Zoom to Fit (Ctrl+0)"
			>
				<Icon name="maximize" />
			</button>
		</div>

		<div class="tool-group">
			<button class="tool-btn" onclick={exportPNG} title="Export as PNG">
				<Icon name="image" />
			</button>
			<button class="tool-btn" onclick={exportCSV} title="Export as CSV">
				<Icon name="download" />
			</button>
		</div>

		<div class="tool-group fx-toggles">
			<button
				class="tool-btn"
				class:active={particlesEnabled}
				onclick={() => (particlesEnabled = !particlesEnabled)}
				title="Toggle Particles (P)"
			>
				<Icon name="sparkles" />
			</button>
			<button
				class="tool-btn"
				class:active={crtEnabled}
				onclick={() => (crtEnabled = !crtEnabled)}
				title="Toggle CRT Effect (O)"
			>
				<Icon name="monitor" />
			</button>
		</div>

		<div class="keyboard-hint">
			<span class="hint-text">↑↓=Nav • Enter=Place • Home/End=Jump • ⌘K=Switch • V=Select • C=Connect • N=Note • Drag=Marquee • Alt+Drag=Quick Connect</span>
		</div>
	</div>

	<!-- Main Content Area -->
	<div class="board-content">
		<!-- Left Sidebar - Evidence List -->
		<aside class="evidence-sidebar">
			<div class="sidebar-header">
				<h3>EVIDENCE</h3>
				<div class="sidebar-header-counts">
					<span class="count-badge" title="Matching / total">{filteredEvidence.length}/{evidenceItems.length}</span>
					{#if placedEvidenceIds.size > 0}
						<span class="count-badge count-placed" title="Placed on board">
							<Icon name="check" size={10} />
							{placedEvidenceIds.size}
						</span>
					{/if}
				</div>
			</div>

			<div class="search-box">
				<Icon name="search" />
				<input
					type="text"
					placeholder="Search evidence..."
					bind:value={searchQuery}
				/>
				{#if searchQuery}
					<button class="search-clear" onclick={() => (searchQuery = '')}>
						<Icon name="x" />
					</button>
				{/if}
			</div>

			<!-- Placement filter toggle -->
			<div class="placement-filter" role="tablist" aria-label="Filter by placement">
				<button
					class="placement-filter-btn"
					class:active={placementFilter === 'all'}
					onclick={() => (placementFilter = 'all')}
					role="tab"
					aria-selected={placementFilter === 'all'}
				>
					All
				</button>
				<button
					class="placement-filter-btn"
					class:active={placementFilter === 'unplaced'}
					onclick={() => (placementFilter = 'unplaced')}
					role="tab"
					aria-selected={placementFilter === 'unplaced'}
					title="Evidence not yet on the board"
				>
					Unplaced
				</button>
				<button
					class="placement-filter-btn"
					class:active={placementFilter === 'placed'}
					onclick={() => (placementFilter = 'placed')}
					role="tab"
					aria-selected={placementFilter === 'placed'}
					title="Evidence already on the board"
				>
					<Icon name="check" size={10} />
					Placed
				</button>
			</div>

			<!-- Bulk action: place all visible (unplaced) evidence -->
			{#if placementFilter !== 'placed'}
				{@const unplacedVisible = filteredEvidence.filter((it: any) => !placedEvidenceIds.has(it.id)).length}
				{#if unplacedVisible > 0}
					<button class="place-all-btn" onclick={placeAllVisible} title="Arrange all unplaced visible evidence in a grid on the canvas">
						<Icon name="layout-grid" size={12} />
						Place all ({unplacedVisible})
					</button>
				{/if}
			{/if}

			<div class="evidence-list">
				{#each filteredEvidence as item (item.id)}
					{@const ft = (item.fileType || '').toLowerCase()}
					{@const isAudio = ft.startsWith('audio') || ft === 'mp3' || ft === 'wav' || ft === 'ogg'}
					{@const isVideo = ft.startsWith('video') || ft === 'mp4' || ft === 'mov' || ft === 'avi'}
					{@const isImage = ft.startsWith('image') || ft === 'jpg' || ft === 'jpeg' || ft === 'png' || ft === 'gif'}
					{@const isPdf = ft === 'pdf' || ft === 'application/pdf'}
					{@const typeColor = isAudio ? '#8b5cf6' : isVideo ? '#ef4444' : isImage ? '#3b82f6' : isPdf ? '#f59e0b' : '#6b7280'}
					{@const typeIcon = isAudio ? 'headphones' : isVideo ? 'video' : isImage ? 'image' : isPdf ? 'file-text' : 'file'}
					<div
						class="evidence-card"
						class:selected={selectedEvidence?.id === item.id}
						class:on-board={placedEvidenceIds.has(item.id)}
						onclick={() => (selectedEvidence = item)}
						draggable="true"
						ondragstart={(e: DragEvent) => {
							if (!e.dataTransfer) return;
							e.dataTransfer.effectAllowed = 'copy';
							e.dataTransfer.setData('application/json', JSON.stringify({
								evidenceId: item.id,
								title: item.title,
								fileType: item.fileType,
								thumbnailUrl: item.thumbnail
							}));
						}}
						style="border-left: 3px solid {typeColor}"
					>
						<div class="evidence-thumbnail">
							{#if item.thumbnail && (isImage || isPdf)}
								<img src={item.thumbnail} alt={item.title} />
							{:else}
								<div class="placeholder" style="background: {typeColor}15">
									<Icon name={typeIcon} size={28} />
								</div>
							{/if}
							<span class="file-type-badge" style="background: {typeColor}">{ft.split('/').pop() || 'file'}</span>
							{#if placedEvidenceIds.has(item.id)}
								<span class="on-board-badge" title="On board — press Enter to center">
									<Icon name="check" size={10} />
								</span>
							{/if}
						</div>
						<div class="evidence-info">
							<h4>{item.title}</h4>
							<p class="evidence-meta">
								{#if item.date}<span>{item.date}</span>{/if}
								{#if item.type}<span class="evidence-type-tag">{item.type}</span>{/if}
							</p>
							{#if item.location}
								<p class="evidence-location"><Icon name="map-pin" size={10} /> {item.location}</p>
							{/if}
						</div>
						<div class="drag-hint">
							<Icon name="grip-vertical" size={14} />
						</div>
					</div>
				{/each}
			</div>
		</aside>

		<!-- Center Canvas / Alt Views -->
		<div class="canvas-area" bind:this={canvasAreaEl} onmousemove={handleCanvasMouseMove}>
			{#if activeView === 'wall'}
				{#key caseId}
					<HybridBoard
						bind:this={board}
						initialSnapshot={initialState as any}
						onDirtyChange={(d) => { isDirty = d; refreshPlacedIds(); }}
						onCanvasClick={handleCanvasClick}
						onNodeSelect={handleNodeSelect}
						onConnectionCreated={handleConnectionCreated}
						onContextMenu={handleBoardContextMenu}
						{activeTool}
						{caseId}
					/>
				{/key}
				<!-- WebGPU Particle + CRT Overlay -->
				<WebGPUParticleOverlay
					particleCount={2048}
					{crtEnabled}
					crtIntensity={0.3}
					{particlesEnabled}
					mouseX={boardMouseX}
					mouseY={boardMouseY}
					isDragging={isDraggingNode}
					boardZoom={boardZoom}
				/>
			{:else if activeView === 'line'}
				<div class="alt-view">
					<h3 class="alt-view-title">Timeline View</h3>
					<div class="line-track-view">
						{#each evidenceItems.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')) as item (item.id)}
							<button class="line-card" class:selected={selectedEvidence?.id === item.id} onclick={() => (selectedEvidence = item)}>
								<span class="line-date">{item.date || 'No date'}</span>
								<span class="line-dot"></span>
								<span class="line-title">{item.title}</span>
								<span class="line-type">{item.type}</span>
							</button>
						{/each}
					</div>
				</div>
			{:else if activeView === 'file'}
				<div class="alt-view file-view">
					<h3 class="alt-view-title">File View</h3>
					{#each evidenceItems as item (item.id)}
						<button class="file-card" class:selected={selectedEvidence?.id === item.id} onclick={() => (selectedEvidence = item)}>
							<div class="file-icon"><Icon name="file" /></div>
							<div class="file-info">
								<div class="file-name">{item.title}</div>
								<div class="file-meta">{item.type} &bull; {item.date} &bull; {item.fileType || 'Unknown'}</div>
							</div>
						</button>
					{/each}
				</div>
			{:else if activeView === 'list'}
				<div class="alt-view list-view">
					<table class="list-table">
						<thead><tr><th>Title</th><th>Type</th><th>Date</th><th>Location</th></tr></thead>
						<tbody>
							{#each evidenceItems as item (item.id)}
								<tr class:selected={selectedEvidence?.id === item.id} onclick={() => (selectedEvidence = item)}>
									<td class="list-title">{item.title}</td>
									<td>{item.type}</td>
									<td>{item.date || '—'}</td>
									<td>{item.location || '—'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<!-- Right Sidebar - Note Editor -->
		{#if selectedNode?.kind === 'note' && !selectedEvidence}
			<aside class="details-sidebar">
				<div class="details-header">
					<h3>Note</h3>
					<button class="close-btn" onclick={() => { selectedNode = null; noteTitle = ''; noteBody = ''; }}>
						<Icon name="x" />
					</button>
				</div>

				<div class="details-content">
					<div class="detail-section">
						<label class="note-label">Title</label>
						<input
							class="note-title-input"
							type="text"
							bind:value={noteTitle}
							oninput={saveNoteEdits}
							placeholder="Note title..."
						/>
					</div>

					<div class="detail-section">
						<label class="note-label">Content</label>
						<textarea
							class="note-body-input"
							bind:value={noteBody}
							oninput={saveNoteEdits}
							placeholder="Write your notes here..."
							rows="8"
						></textarea>
					</div>

					<div class="detail-section note-actions">
						<button class="action-btn" onclick={deleteSelectedNote} title="Delete Note">
							<Icon name="trash-2" />
							Delete Note
						</button>
					</div>
				</div>
			</aside>
		{/if}

		<!-- Right Sidebar - Detailed Evidence -->
		{#if selectedEvidence}
			<aside class="details-sidebar">
				<div class="details-header">
					<div class="details-header-title">
						<h3>Detailed Evidence</h3>
						{#if selectedEvidenceIndex >= 0 && filteredEvidence.length > 1}
							<span class="details-position" title="Use ↑↓ arrow keys to navigate">
								{selectedEvidenceIndex + 1} of {filteredEvidence.length}
							</span>
						{/if}
					</div>
					<div class="details-header-actions">
						{#if filteredEvidence.length > 1}
							<button class="details-nav-btn" onclick={() => navEvidence(-1)} title="Previous (↑)">
								<Icon name="chevron-up" size={14} />
							</button>
							<button class="details-nav-btn" onclick={() => navEvidence(1)} title="Next (↓)">
								<Icon name="chevron-down" size={14} />
							</button>
						{/if}
						<button class="close-btn" onclick={() => (selectedEvidence = null)} title="Close">
							<Icon name="x" />
						</button>
					</div>
				</div>

				<div class="details-content">
					<!-- Inline media preview -->
					{#if isEvidenceImage(selectedEvidence.fileType) && selectedEvidence.thumbnail}
						<div class="detail-section media-preview">
							<img src={selectedEvidence.thumbnail} alt={selectedEvidence.title} class="preview-image" />
						</div>
					{:else if isEvidenceAudio(selectedEvidence.fileType)}
						<div class="detail-section media-preview">
							<audio controls preload="metadata" class="preview-audio">
								<source src="/api/evidence/{selectedEvidence.id}/download" />
							</audio>
						</div>
					{:else if isEvidenceVideo(selectedEvidence.fileType)}
						<div class="detail-section media-preview">
							<!-- svelte-ignore a11y_media_has_caption -->
							<video controls preload="metadata" class="preview-video" poster={selectedEvidence.thumbnail || undefined}>
								<source src="/api/evidence/{selectedEvidence.id}/download" />
							</video>
						</div>
					{/if}

					<div class="detail-section">
						<h4>Evidence Details</h4>
						<p class="evidence-description">{selectedEvidence.description || 'No description available'}</p>
					</div>

					<div class="detail-section">
						<h4>Document Statistics</h4>
						<div class="stats-grid">
							<div class="stat">
								<span class="stat-label">Date</span>
								<span class="stat-value">{selectedEvidence.date || 'Unknown'}</span>
							</div>
							<div class="stat">
								<span class="stat-label">Type</span>
								<span class="stat-value">{selectedEvidence.type || 'Unknown'}</span>
							</div>
							<div class="stat">
								<span class="stat-label">File Type</span>
								<span class="stat-value">{selectedEvidence.fileType || 'N/A'}</span>
							</div>
							{#if selectedEvidence.confidence > 0}
								<div class="stat">
									<span class="stat-label">Confidence</span>
									<span class="stat-value">{Math.round(selectedEvidence.confidence * 100)}%</span>
								</div>
							{/if}
						</div>
					</div>

					<div class="detail-section">
						<h4>Location</h4>
						<p class="related-info">{selectedEvidence.location || 'No location data'}</p>
					</div>

					<div class="detail-section">
						<button
							class="action-btn"
							onclick={() => { summaryEvidenceId = selectedEvidence.id; summaryEvidenceTitle = selectedEvidence.title; showSummaryModal = true; }}
						>
							<Icon name="sparkles" />
							AI Summary
						</button>
					</div>

					<div class="detail-section">
						<h4>Key Points</h4>
						{#if selectedEvidence.keyPoints?.length}
							<ul class="key-points-list">
								{#each selectedEvidence.keyPoints as point}
									<li class="key-point-item">
										<span class="key-point-bullet">•</span>
										<span>{point}</span>
									</li>
								{/each}
							</ul>
						{:else}
							<button
								class="action-btn"
								disabled={isGeneratingKeyPoints}
								onclick={() => generateEvidenceKeyPoints(selectedEvidence.id)}
							>
								<Icon name="sparkles" />
								{isGeneratingKeyPoints ? 'Generating...' : 'Generate Key Points'}
							</button>
						{/if}
					</div>
				</div>
			</aside>
		{/if}
	</div>

	<!-- Timeline View (enriched: who/what/why/how) -->
	<div class="timeline-section">
		<div class="timeline-header">
			<span class="timeline-label">CASE TIMELINE</span>
			<span class="timeline-count">
				{#if timelineLoading}
					loading...
				{:else}
					{timelineEvents.length} events
				{/if}
			</span>
			<button class="timeline-refresh" onclick={loadTimeline} title="Refresh timeline">
				<Icon name="refresh-cw" />
			</button>
		</div>
		<div class="timeline-track">
			{#if timelineEvents.length > 0}
				{#each timelineEvents.slice(0, 15) as evt, idx (evt.id)}
					{@const position = ((idx + 1) / (Math.min(timelineEvents.length, 15) + 1)) * 100}
					{@const typeColors: Record<string, string> = {
						evidence_upload: 'blue',
						report: 'green',
						note: 'orange',
						audit: 'gray',
						ai_chat: 'purple',
						connection: 'red'
					}}
					{@const color = typeColors[evt.type] ?? 'blue'}
					<div
						class="timeline-node"
						style="left: {position}%"
						role="button"
						tabindex="0"
						title="{evt.title} — {evt.actor ?? 'System'} ({evt.timestamp ? new Date(evt.timestamp).toLocaleString() : ''})"
						onclick={() => {
							if (evt.metadata?.evidenceId) {
								const match = evidenceItems.find((e: any) => e.id === evt.metadata.evidenceId);
								if (match) selectedEvidence = match;
							}
						}}
						onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLElement).click()}
					>
						<div class="node-dot {color}"></div>
						<div class="node-type-badge">{evt.type.split('_')[0].charAt(0).toUpperCase()}</div>
					</div>
				{/each}
			{:else if !timelineLoading}
				<div class="timeline-empty">No case activity yet</div>
			{/if}
		</div>
	</div>

	<!-- AI Chat Panel (SSE Streaming) -->
	{#if showAIChat && chatSession}
		<aside class="ai-chat-panel">
			<div class="chat-header">
				<div class="chat-title">
					<Icon name="bot" />
					<h3>AI Assistant</h3>
					<span class="chat-status" class:connected={chatSession.connectionStatus === 'connected'}>
						{chatSession.connectionStatus === 'connected' ? 'Ready' : 'Connecting...'}
					</span>
				</div>
				<div class="chat-header-actions">
					<button
						class="header-action-btn"
						onclick={exportChatPDF}
						disabled={chatSession.messages.length === 0}
						title="Export Transcript"
					>
						<Icon name="download" />
					</button>
					<button class="close-btn" onclick={() => (showAIChat = false)}>
						<Icon name="x" />
					</button>
				</div>
			</div>

			<div class="chat-messages" bind:this={chatContainer}>
				{#if chatSession.messages.length === 0}
					<div class="chat-welcome">
						<Icon name="sparkles" />
						<p class="welcome-title">Evidence Board AI Assistant</p>
						<p class="welcome-text">Ask about evidence connections, generate layouts, or get case insights.</p>
						<div class="quick-actions">
							<button class="quick-btn" onclick={() => currentMessage = 'What connections do you see between evidence items?'}>
								<Icon name="git-branch" />
								Analyze Connections
							</button>
							<button class="quick-btn" onclick={() => currentMessage = 'Suggest an optimal timeline arrangement'}>
								<Icon name="clock" />
								Timeline Suggestions
							</button>
							<button class="quick-btn" onclick={() => {
								if (selectedEvidence) {
									summaryEvidenceId = selectedEvidence.id;
									summaryEvidenceTitle = selectedEvidence.title;
									showSummaryModal = true;
								}
							}} disabled={!selectedEvidence}>
								<Icon name="brain" />
								Summarize Evidence
							</button>
						</div>
					</div>
				{:else}
					{#each chatSession.messages as msg, idx (idx)}
						<div class="chat-message" class:user={msg.role === 'user'} class:assistant={msg.role === 'assistant'}>
							{#if msg.role === 'user'}
								<div class="message-content">
									<Icon name="user" />
									<p>{msg.content}</p>
								</div>
							{:else}
								<div class="message-content">
									<Icon name="bot" />
									{#if idx === chatSession.messages.length - 1 && chatSession.status === 'streaming'}
										<div class="streaming-content">{msg.content}</div>
									{:else}
										<TypewriterResponse text={msg.content} speed={60} enableThinking={false} />
									{/if}
								</div>
								{#if msg.metadata?.confidence}
									<div class="message-meta">
										<span class="confidence">Confidence: {Math.round(msg.metadata.confidence * 100)}%</span>
										{#if msg.source}
											<span class="source">{msg.source}</span>
										{/if}
									</div>
								{/if}
							{/if}
						</div>
					{/each}

					{#if chatSession.status === 'thinking'}
						<div class="chat-message assistant">
							<div class="message-content">
								<Icon name="bot" />
								<div class="thinking-indicator">
									<span class="dot"></span>
									<span class="dot"></span>
									<span class="dot"></span>
								</div>
							</div>
						</div>
					{/if}
				{/if}
			</div>

			<div class="chat-input">
				<textarea
					bind:value={currentMessage}
					placeholder="Ask about evidence, connections, or layouts..."
					rows="2"
					onkeydown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault();
							sendChatMessage();
						}
					}}
				></textarea>
				<div class="input-actions">
					<button
						class="voice-btn"
						class:recording={isRecording}
						onclick={isRecording ? stopVoiceInput : startVoiceInput}
						title={isRecording ? 'Stop Recording' : 'Voice Input'}
					>
						<Icon name={isRecording ? 'mic-off' : 'mic'} />
					</button>
					<button
						class="send-btn"
						onclick={sendChatMessage}
						disabled={!currentMessage.trim() || chatSession.status !== 'idle'}
					>
						<Icon name="send" />
					</button>
				</div>
			</div>
		</aside>
	{/if}

	<!-- AI Summary Mini Modal -->
	<AISummaryMiniModal
		bind:open={showSummaryModal}
		{caseId}
		evidenceId={summaryEvidenceId}
		evidenceTitle={summaryEvidenceTitle}
		onClose={() => {
			summaryEvidenceId = null;
			summaryEvidenceTitle = null;
		}}
	/>

	<!-- Context Menu Overlay -->
	{#if contextMenu}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="ctx-backdrop" onclick={closeContextMenu} onkeydown={(e) => e.key === 'Escape' && closeContextMenu()}>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="ctx-menu" style="left:{contextMenu.x}px;top:{contextMenu.y}px" onclick={(e) => e.stopPropagation()}>
				<button class="ctx-item" onclick={ctxDuplicate}>
					<Icon name="copy" />
					Duplicate
				</button>
				{#if contextMenu.node.evidenceId}
					<button class="ctx-item" onclick={ctxSummarize}>
						<Icon name="sparkles" />
						AI Summary
					</button>
				{/if}
				<button class="ctx-item danger" onclick={ctxDelete}>
					<Icon name="trash-2" />
					Delete
				</button>
			</div>
		</div>
	{/if}

	<!-- Case Switcher Overlay (click-outside backdrop) -->
	{#if showCaseSwitcher}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="case-switcher-backdrop"
			onclick={() => (showCaseSwitcher = false)}
			onkeydown={(e) => e.key === 'Escape' && (showCaseSwitcher = false)}
		>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="case-switcher-dropdown" onclick={(e) => e.stopPropagation()}>
				<div class="case-switcher-header">
					<Icon name="search" />
					<input
						type="text"
						placeholder="Search cases by title or ID..."
						bind:value={caseSwitcherQuery}
						class="case-switcher-search"
					/>
					<button class="close-btn" onclick={() => (showCaseSwitcher = false)} title="Close (Esc)">
						<Icon name="x" />
					</button>
				</div>
				<div class="case-switcher-list">
					{#if !showCreateCaseForm}
						<button
							class="case-switcher-item case-switcher-new"
							onclick={() => { showCreateCaseForm = true; if (!newCaseTitle && caseSwitcherQuery) newCaseTitle = caseSwitcherQuery; }}
						>
							<span class="case-switcher-new-icon">
								<Icon name="plus" size={14} />
							</span>
							<div class="case-switcher-info">
								<div class="case-switcher-title">
									{caseSwitcherQuery ? `Create "${caseSwitcherQuery}"` : 'New Case'}
								</div>
								<div class="case-switcher-id">Quick-create from here</div>
							</div>
						</button>
					{:else}
						<div class="case-switcher-create-form">
							<input
								type="text"
								class="case-switcher-input"
								placeholder="Case title (required)"
								bind:value={newCaseTitle}
								onkeydown={(e) => {
									if (e.key === 'Enter') createNewCase();
									if (e.key === 'Escape') { showCreateCaseForm = false; newCaseTitle = ''; newCaseDescription = ''; }
								}}
							/>
							<textarea
								class="case-switcher-textarea"
								placeholder="Description (optional)"
								rows="2"
								bind:value={newCaseDescription}
							></textarea>
							<div class="case-switcher-form-actions">
								<button
									class="case-switcher-btn-cancel"
									onclick={() => { showCreateCaseForm = false; newCaseTitle = ''; newCaseDescription = ''; }}
								>
									Cancel
								</button>
								<button
									class="case-switcher-btn-create"
									onclick={createNewCase}
									disabled={!newCaseTitle.trim() || isCreatingCase}
								>
									<Icon name={isCreatingCase ? 'loader' : 'plus'} size={12} />
									{isCreatingCase ? 'Creating...' : 'Create & Open'}
								</button>
							</div>
						</div>
					{/if}

					{#if filteredCases.length === 0 && !showCreateCaseForm}
						<div class="case-switcher-empty">
							{caseList.length === 0 ? 'Loading cases...' : 'No matches — create one above'}
						</div>
					{:else if !showCreateCaseForm}
						{#each filteredCases as c (c.id)}
							<button
								class="case-switcher-item"
								class:active={c.id === caseId}
								onclick={() => switchToCase(c.id)}
							>
								<span class="case-switcher-status status-{c.status}" title={c.status}></span>
								<div class="case-switcher-info">
									<div class="case-switcher-title">{c.title}</div>
									<div class="case-switcher-id">#{c.id.substring(0, 8)} • {c.status}</div>
								</div>
								{#if c.id === caseId}
									<span class="case-switcher-current">CURRENT</span>
								{/if}
							</button>
						{/each}
					{/if}
				</div>
				<div class="case-switcher-footer">
					<span class="kbd-hint">Esc</span> close • <span class="kbd-hint">⌘K</span> toggle • <span class="kbd-hint">Enter</span> create
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.evidence-board-container {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: #fafafa;
		font-family: 'JetBrains Mono', monospace;
	}

	/* Header */
	.board-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.5rem;
		background: white;
		border-bottom: 1px solid #e5e7eb;
	}

	.header-left {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.board-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.title-icon {
		color: #3b82f6;
	}

	.board-title h1 {
		font-size: 1.25rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: #1f2937;
		margin: 0;
	}

	.case-meta {
		font-size: 0.75rem;
		color: #6b7280;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.case-number {
		font-weight: 600;
	}

	.separator {
		color: #d1d5db;
	}

	.header-actions {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	/* Case switcher (command palette pattern) */
	.case-switcher {
		position: relative;
	}

	.kbd-hint {
		display: inline-block;
		padding: 1px 5px;
		margin-left: 0.4rem;
		font-size: 0.65rem;
		font-family: 'JetBrains Mono', monospace;
		font-weight: 600;
		color: #6b7280;
		background: #f3f4f6;
		border: 1px solid #d1d5db;
		border-bottom-width: 2px;
		border-radius: 3px;
	}

	.case-switcher-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.4);
		backdrop-filter: blur(4px);
		z-index: 1000;
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding-top: 10vh;
	}

	.case-switcher-dropdown {
		width: 480px;
		max-height: 60vh;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.75rem;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: switcherSlide 0.15s ease-out;
	}

	@keyframes switcherSlide {
		from { opacity: 0; transform: translateY(-8px) scale(0.98); }
		to { opacity: 1; transform: translateY(0) scale(1); }
	}

	.case-switcher-footer {
		padding: 0.5rem 0.75rem;
		font-size: 0.7rem;
		color: #9ca3af;
		border-top: 1px solid #f3f4f6;
		background: #fafafa;
	}

	.case-switcher-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.case-switcher-search {
		flex: 1;
		padding: 0.4rem 0.6rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.3rem;
		font-size: 0.8rem;
		outline: none;
	}

	.case-switcher-search:focus {
		border-color: #3b82f6;
	}

	.case-switcher-list {
		overflow-y: auto;
		flex: 1;
	}

	.case-switcher-empty {
		padding: 1.5rem;
		text-align: center;
		color: #9ca3af;
		font-size: 0.8rem;
	}

	.case-switcher-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.6rem 0.75rem;
		background: transparent;
		border: none;
		border-bottom: 1px solid #f3f4f6;
		text-align: left;
		cursor: pointer;
		transition: background 0.15s;
	}

	.case-switcher-item:hover {
		background: #f9fafb;
	}

	.case-switcher-item.active {
		background: #eff6ff;
	}

	.case-switcher-status {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #9ca3af;
		flex-shrink: 0;
	}

	.case-switcher-status.status-open {
		background: #22c55e;
	}

	.case-switcher-status.status-in_progress {
		background: #3b82f6;
	}

	.case-switcher-status.status-closed {
		background: #6b7280;
	}

	.case-switcher-status.status-archived {
		background: #d1d5db;
	}

	.case-switcher-info {
		flex: 1;
		min-width: 0;
	}

	.case-switcher-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: #1f2937;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.case-switcher-id {
		font-size: 0.65rem;
		color: #9ca3af;
		font-family: 'JetBrains Mono', monospace;
	}

	.case-switcher-current {
		font-size: 0.6rem;
		font-weight: 700;
		color: #3b82f6;
		padding: 1px 5px;
		background: #dbeafe;
		border-radius: 3px;
	}

	/* New Case button + inline create form */
	.case-switcher-new {
		background: #f0fdf4;
	}

	.case-switcher-new:hover {
		background: #dcfce7;
	}

	.case-switcher-new-icon {
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #22c55e;
		color: white;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.case-switcher-create-form {
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		background: #fafafa;
		border-bottom: 1px solid #e5e7eb;
	}

	.case-switcher-input,
	.case-switcher-textarea {
		width: 100%;
		padding: 0.45rem 0.6rem;
		border: 1px solid #d1d5db;
		border-radius: 0.3rem;
		font-size: 0.8rem;
		outline: none;
		font-family: inherit;
	}

	.case-switcher-input:focus,
	.case-switcher-textarea:focus {
		border-color: #3b82f6;
		box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
	}

	.case-switcher-textarea {
		resize: vertical;
		min-height: 50px;
	}

	.case-switcher-form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.case-switcher-btn-cancel,
	.case-switcher-btn-create {
		padding: 0.4rem 0.75rem;
		border-radius: 0.3rem;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		border: 1px solid transparent;
		transition: all 0.15s;
	}

	.case-switcher-btn-cancel {
		background: transparent;
		color: #6b7280;
		border-color: #d1d5db;
	}

	.case-switcher-btn-cancel:hover {
		background: #f3f4f6;
	}

	.case-switcher-btn-create {
		background: #22c55e;
		color: white;
	}

	.case-switcher-btn-create:hover:not(:disabled) {
		background: #16a34a;
	}

	.case-switcher-btn-create:disabled {
		background: #d1d5db;
		cursor: not-allowed;
	}

	.action-btn {
		padding: 0.5rem;
		background: #f3f4f6;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.2s;
	}

	.action-btn:hover {
		background: #e5e7eb;
		color: #1f2937;
	}

	.key-points-list {
		list-style: none;
		padding: 0;
		margin: 0.25rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.key-point-item {
		display: flex;
		align-items: flex-start;
		gap: 0.375rem;
		font-size: 0.75rem;
		color: #d1d5db;
		line-height: 1.4;
	}

	.key-point-bullet {
		color: #34d399;
		margin-top: 0.125rem;
		flex-shrink: 0;
	}

	/* Note editor styles */
	.note-label {
		display: block;
		font-size: 0.7rem;
		font-weight: 600;
		color: #9ca3af;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.375rem;
	}

	.note-title-input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: #1f2937;
		outline: none;
		transition: border-color 0.2s;
	}

	.note-title-input:focus {
		border-color: #3b82f6;
	}

	.note-body-input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		font-size: 0.8125rem;
		color: #374151;
		outline: none;
		resize: vertical;
		min-height: 120px;
		line-height: 1.5;
		font-family: inherit;
		transition: border-color 0.2s;
	}

	.note-body-input:focus {
		border-color: #3b82f6;
	}

	.note-actions {
		display: flex;
		gap: 0.5rem;
	}

	.btn-primary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-primary:hover {
		background: #2563eb;
	}

	/* View Tabs */
	.view-tabs {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		background: white;
		border-bottom: 1px solid #e5e7eb;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.2s;
	}

	.tab:hover {
		background: #f3f4f6;
		color: #1f2937;
	}

	.tab.active {
		background: #eff6ff;
		border-color: #3b82f6;
		color: #3b82f6;
	}

	.unsaved-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: auto;
		font-size: 0.75rem;
		color: #f59e0b;
	}

	.pulse-dot {
		width: 0.5rem;
		height: 0.5rem;
		background: #f59e0b;
		border-radius: 50%;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.save-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: #10b981;
		color: white;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.save-btn:hover:not(:disabled) {
		background: #059669;
	}

	.save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Tools Toolbar */
	.tools-toolbar {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1.5rem;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.tool-group {
		display: flex;
		gap: 0.25rem;
		padding: 0.25rem;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
	}

	.tool-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s;
	}

	.tool-btn:hover:not(:disabled) {
		background: #f3f4f6;
		color: #1f2937;
	}

	.tool-btn.active {
		background: #3b82f6;
		color: white;
	}

	.tool-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.keyboard-hint {
		margin-left: auto;
		padding: 0.5rem 1rem;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
	}

	.hint-text {
		font-size: 0.75rem;
		color: #6b7280;
		font-weight: 500;
	}

	/* Main Content */
	.board-content {
		display: grid;
		grid-template-columns: 280px 1fr 320px;
		flex: 1;
		overflow: hidden;
		gap: 1px;
		background: #e5e7eb;
	}

	/* Evidence Sidebar */
	.evidence-sidebar {
		background: white;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.sidebar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.sidebar-header h3 {
		font-size: 0.875rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: #1f2937;
		margin: 0;
	}

	.sidebar-header-counts {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.count-badge {
		padding: 0.125rem 0.5rem;
		background: #eff6ff;
		color: #3b82f6;
		border-radius: 1rem;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.count-badge.count-placed {
		background: #dcfce7;
		color: #166534;
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}

	.search-box {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		margin: 0.5rem;
		background: #f3f4f6;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		color: #6b7280;
		transition: border-color 0.15s;
	}

	.search-box:focus-within {
		border-color: #3b82f6;
		background: white;
	}

	.placement-filter {
		display: flex;
		gap: 2px;
		margin: 0 0.5rem 0.5rem;
		padding: 2px;
		background: #f3f4f6;
		border-radius: 0.375rem;
	}

	.placement-filter-btn {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 3px;
		padding: 0.3rem;
		border: none;
		background: transparent;
		color: #6b7280;
		font-size: 0.7rem;
		font-weight: 600;
		border-radius: 0.25rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.placement-filter-btn:hover {
		color: #1f2937;
	}

	.placement-filter-btn.active {
		background: white;
		color: #1f2937;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
	}

	.place-all-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		margin: 0 0.5rem 0.5rem;
		padding: 0.4rem 0.75rem;
		background: #22c55e;
		color: white;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}

	.place-all-btn:hover {
		background: #16a34a;
	}

	.search-box input {
		flex: 1;
		border: none;
		background: transparent;
		outline: none;
		font-size: 0.8125rem;
		font-family: inherit;
		color: #1f2937;
	}

	.search-box input::placeholder {
		color: #9ca3af;
	}

	.search-clear {
		padding: 0.125rem;
		background: transparent;
		border: none;
		color: #9ca3af;
		cursor: pointer;
		display: flex;
		align-items: center;
	}

	.search-clear:hover {
		color: #1f2937;
	}

	.evidence-list {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem;
	}

	.evidence-card {
		padding: 0.75rem;
		margin-bottom: 0.5rem;
		background: #fafafa;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		cursor: grab;
		transition: all 0.2s;
	}

	.evidence-card:active {
		cursor: grabbing;
		opacity: 0.7;
		transform: scale(0.97);
	}

	.evidence-card:hover {
		background: #f3f4f6;
		border-color: #3b82f6;
	}

	.evidence-card.selected {
		background: #eff6ff;
		border-color: #3b82f6;
	}

	.evidence-thumbnail {
		position: relative;
		width: 100%;
		height: 100px;
		background: #1f2937;
		border-radius: 0.375rem;
		overflow: hidden;
		margin-bottom: 0.5rem;
	}

	.placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #6b7280;
	}

	.file-type-badge {
		position: absolute;
		top: 6px;
		right: 6px;
		padding: 1px 6px;
		border-radius: 4px;
		font-size: 0.6rem;
		font-weight: 700;
		color: white;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.on-board-badge {
		position: absolute;
		top: 6px;
		left: 6px;
		width: 18px;
		height: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #22c55e;
		color: white;
		border-radius: 50%;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}

	.evidence-card.on-board {
		background: #f0fdf4;
	}

	.evidence-card.on-board .evidence-info h4 {
		color: #065f46;
	}

	.evidence-info {
		flex: 1;
		min-width: 0;
	}

	.evidence-info h4 {
		font-size: 0.8rem;
		font-weight: 600;
		color: #1f2937;
		margin: 0 0 0.25rem 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.evidence-meta {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.7rem;
		color: #6b7280;
		margin: 0;
	}

	.evidence-type-tag {
		padding: 0 4px;
		border-radius: 3px;
		background: #e5e7eb;
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.evidence-location {
		display: flex;
		align-items: center;
		gap: 3px;
		font-size: 0.65rem;
		color: #9ca3af;
		margin: 0.2rem 0 0 0;
	}

	.drag-hint {
		display: flex;
		align-items: center;
		color: #d1d5db;
		opacity: 0;
		transition: opacity 0.15s;
	}

	.evidence-card:hover .drag-hint {
		opacity: 1;
	}

	/* Media preview in detail sidebar */
	.media-preview {
		padding: 0 !important;
		overflow: hidden;
		border-radius: 0.5rem;
		background: #111827;
	}

	.preview-image {
		width: 100%;
		max-height: 200px;
		object-fit: contain;
		display: block;
	}

	.preview-audio {
		width: 100%;
		display: block;
		padding: 0.75rem;
	}

	.preview-video {
		width: 100%;
		max-height: 200px;
		display: block;
	}

	/* Canvas Area */
	.canvas-area {
		background: white;
		position: relative;
		overflow: hidden;
	}

	/* Details Sidebar */
	.details-sidebar {
		background: white;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.details-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.details-header h3 {
		font-size: 0.875rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: #1f2937;
		margin: 0;
	}

	.details-header-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.details-header-actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.details-position {
		font-size: 0.7rem;
		font-family: 'JetBrains Mono', monospace;
		color: #6b7280;
		padding: 2px 6px;
		background: #f3f4f6;
		border-radius: 3px;
	}

	.details-nav-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.25rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.25rem;
		background: white;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s;
	}

	.details-nav-btn:hover {
		background: #f3f4f6;
		color: #1f2937;
		border-color: #d1d5db;
	}

	.close-btn {
		padding: 0.25rem;
		background: transparent;
		border: none;
		color: #6b7280;
		cursor: pointer;
		transition: color 0.2s;
	}

	.close-btn:hover {
		color: #1f2937;
	}

	.details-content {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
	}

	.detail-section {
		margin-bottom: 1.5rem;
	}

	.detail-section h4 {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: #6b7280;
		margin: 0 0 0.75rem 0;
		text-transform: uppercase;
	}

	.financial-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: #1f2937;
		margin-bottom: 0.25rem;
	}

	.financial-subtitle {
		font-size: 0.75rem;
		color: #6b7280;
		margin: 0;
	}

	.insights-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.insights-list li {
		padding: 0.5rem;
		margin-bottom: 0.5rem;
		background: #f3f4f6;
		border-left: 2px solid #3b82f6;
		font-size: 0.75rem;
		color: #1f2937;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.stat-label {
		font-size: 0.75rem;
		color: #6b7280;
		text-transform: uppercase;
	}

	.stat-value {
		font-size: 0.875rem;
		font-weight: 600;
		color: #1f2937;
	}

	.stat-value.priority-high {
		color: #dc2626;
	}

	.related-info {
		font-size: 0.75rem;
		color: #6b7280;
		margin: 0;
	}

	/* Timeline */
	.timeline-section {
		background: white;
		border-top: 1px solid #e5e7eb;
		padding: 0.75rem 1.5rem;
	}

	.timeline-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.timeline-count {
		margin-left: auto;
		font-size: 0.75rem;
		color: #9ca3af;
	}

	.timeline-label {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: #6b7280;
	}

	.timeline-track {
		position: relative;
		height: 2rem;
		background: #f3f4f6;
		border-radius: 0.25rem;
	}

	.timeline-empty {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 0.75rem;
		color: #9ca3af;
		font-style: italic;
	}

	.timeline-node {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
	}

	.node-dot {
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		border: 2px solid white;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.node-dot.orange {
		background: #f59e0b;
	}
	.node-dot.green {
		background: #10b981;
	}
	.node-dot.blue {
		background: #3b82f6;
	}
	.node-dot.purple {
		background: #8b5cf6;
	}
	.node-dot.red {
		background: #ef4444;
	}

	.timeline-node {
		cursor: pointer;
		transition: transform 0.2s;
	}

	.timeline-node:hover .node-dot {
		transform: scale(1.2);
	}

	.timeline-node.active .node-dot {
		width: 1.25rem;
		height: 1.25rem;
	}

	.node-dot.gray {
		background: #9ca3af;
	}

	.node-label {
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-top: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: #1f2937;
		white-space: nowrap;
	}

	.node-type-badge {
		position: absolute;
		top: -0.25rem;
		right: -0.25rem;
		width: 0.875rem;
		height: 0.875rem;
		border-radius: 50%;
		background: rgba(0,0,0,0.5);
		color: white;
		font-size: 0.5rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	.timeline-refresh {
		padding: 0.25rem;
		background: transparent;
		border: 1px solid #e5e7eb;
		border-radius: 0.25rem;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s;
		display: flex;
		align-items: center;
	}

	.timeline-refresh:hover {
		background: #f3f4f6;
		color: #1f2937;
	}

	/* AI Chat Panel */
	.ai-chat-panel {
		position: fixed;
		right: 0;
		top: 0;
		bottom: 0;
		width: 400px;
		background: white;
		border-left: 1px solid #e5e7eb;
		display: flex;
		flex-direction: column;
		z-index: 100;
		box-shadow: -4px 0 12px rgba(0, 0, 0, 0.1);
	}

	.chat-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid #e5e7eb;
		background: #f9fafb;
	}

	.chat-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.chat-title h3 {
		font-size: 1rem;
		font-weight: 700;
		color: #1f2937;
		margin: 0;
	}

	.chat-status {
		font-size: 0.75rem;
		color: #6b7280;
		padding: 0.25rem 0.5rem;
		background: #e5e7eb;
		border-radius: 0.25rem;
	}

	.chat-status.connected {
		background: #d1fae5;
		color: #065f46;
	}

	.chat-header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.header-action-btn {
		padding: 0.5rem;
		background: transparent;
		border: 1px solid #e5e7eb;
		color: #6b7280;
		cursor: pointer;
		border-radius: 0.375rem;
		transition: all 0.15s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.header-action-btn:hover:not(:disabled) {
		background: #f3f4f6;
		color: #1f2937;
		border-color: #3b82f6;
	}

	.header-action-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.close-btn {
		padding: 0.25rem;
		background: transparent;
		border: none;
		color: #6b7280;
		cursor: pointer;
		border-radius: 0.25rem;
		transition: all 0.15s;
	}

	.close-btn:hover {
		background: #e5e7eb;
		color: #1f2937;
	}

	.chat-messages {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.chat-welcome {
		text-align: center;
		padding: 2rem 1rem;
		color: #6b7280;
	}

	.welcome-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: #1f2937;
		margin: 1rem 0 0.5rem;
	}

	.welcome-text {
		font-size: 0.875rem;
		margin-bottom: 1.5rem;
	}

	.quick-actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.quick-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem;
		background: #f3f4f6;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		color: #1f2937;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.15s;
		text-align: left;
	}

	.quick-btn:hover:not(:disabled) {
		background: #e5e7eb;
		border-color: #3b82f6;
	}

	.quick-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.chat-message {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.chat-message.user .message-content {
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		margin-left: 2rem;
	}

	.chat-message.assistant .message-content {
		background: #f3f4f6;
		border: 1px solid #e5e7eb;
		margin-right: 2rem;
	}

	.message-content {
		display: flex;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		line-height: 1.5;
	}

	.streaming-content {
		color: #1f2937;
	}

	.message-meta {
		display: flex;
		gap: 1rem;
		font-size: 0.75rem;
		color: #6b7280;
		padding-left: 2.5rem;
	}

	.confidence {
		font-weight: 600;
	}

	.source {
		color: #9ca3af;
	}

	.thinking-indicator {
		display: flex;
		gap: 0.25rem;
		align-items: center;
	}

	.thinking-indicator .dot {
		width: 0.5rem;
		height: 0.5rem;
		background: #9ca3af;
		border-radius: 50%;
		animation: thinking 1.4s infinite;
	}

	.thinking-indicator .dot:nth-child(2) {
		animation-delay: 0.2s;
	}

	.thinking-indicator .dot:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes thinking {
		0%, 60%, 100% {
			opacity: 0.3;
			transform: scale(0.8);
		}
		30% {
			opacity: 1;
			transform: scale(1);
		}
	}

	.chat-input {
		display: flex;
		gap: 0.75rem;
		padding: 1rem 1.5rem;
		border-top: 1px solid #e5e7eb;
		background: white;
	}

	.chat-input textarea {
		flex: 1;
		padding: 0.75rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.875rem;
		resize: none;
		outline: none;
		transition: border-color 0.15s;
	}

	.chat-input textarea:focus {
		border-color: #3b82f6;
	}

	.input-actions {
		display: flex;
		gap: 0.5rem;
	}

	.voice-btn {
		padding: 0.75rem;
		background: #f3f4f6;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.voice-btn:hover {
		background: #e5e7eb;
		color: #1f2937;
	}

	.voice-btn.recording {
		background: #fee2e2;
		border-color: #ef4444;
		color: #dc2626;
		animation: pulse-red 1.5s infinite;
	}

	@keyframes pulse-red {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.7;
		}
	}

	.send-btn {
		padding: 0.75rem 1rem;
		background: #3b82f6;
		border: none;
		border-radius: 0.5rem;
		color: white;
		cursor: pointer;
		transition: all 0.15s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.send-btn:hover:not(:disabled) {
		background: #2563eb;
	}

	.send-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.action-btn.active {
		background: #3b82f6;
		color: white;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.action-btn [class*="loader"] {
		animation: spin 1s linear infinite;
	}

	/* Context Menu */
	.ctx-backdrop {
		position: fixed;
		inset: 0;
		z-index: 200;
	}

	.ctx-menu {
		position: fixed;
		min-width: 160px;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		padding: 0.25rem;
		z-index: 201;
	}

	.ctx-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.8125rem;
		color: #374151;
		cursor: pointer;
		transition: background 0.1s;
	}

	.ctx-item:hover {
		background: #f3f4f6;
	}

	.ctx-item.danger {
		color: #dc2626;
	}

	.ctx-item.danger:hover {
		background: #fef2f2;
	}

	/* Alt View Modes (LINE / FILE / LIST) */
	.alt-view {
		padding: 1.5rem;
		overflow-y: auto;
		height: 100%;
	}

	.alt-view-title {
		font-size: 0.875rem;
		font-weight: 700;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 0 1rem;
	}

	/* LINE (timeline) */
	.line-track {
		display: flex;
		gap: 1rem;
		overflow-x: auto;
		padding: 1rem 0;
	}

	.line-card {
		flex: 0 0 180px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem;
		background: #fafafa;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 0.15s;
		text-align: center;
	}

	.line-card:hover { border-color: #3b82f6; background: #f0f9ff; }
	.line-card.selected { border-color: #3b82f6; background: #eff6ff; }

	.line-date { font-size: 0.7rem; color: #6b7280; font-weight: 600; }
	.line-dot { width: 10px; height: 10px; border-radius: 50%; background: #3b82f6; }
	.line-title { font-size: 0.8125rem; font-weight: 600; color: #1f2937; }
	.line-type { font-size: 0.7rem; color: #9ca3af; }

	/* FILE (stacked cards) */
	.file-view { display: flex; flex-direction: column; gap: 0.5rem; }

	.file-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: #fafafa;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.file-card:hover { border-color: #3b82f6; background: #f0f9ff; }
	.file-card.selected { border-color: #3b82f6; background: #eff6ff; }

	.file-icon {
		flex: 0 0 2.5rem;
		height: 2.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #e5e7eb;
		border-radius: 0.375rem;
		color: #6b7280;
	}

	.file-info { flex: 1; min-width: 0; }
	.file-name { font-size: 0.875rem; font-weight: 600; color: #1f2937; }
	.file-meta { font-size: 0.75rem; color: #9ca3af; margin-top: 0.125rem; }
	.file-desc { font-size: 0.75rem; color: #6b7280; margin-top: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.file-confidence { font-size: 0.75rem; font-weight: 700; color: #3b82f6; }

	/* LIST (table) */
	.list-view { overflow: auto; height: 100%; }

	.list-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8125rem;
	}

	.list-table th {
		padding: 0.625rem 0.75rem;
		text-align: left;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #6b7280;
		border-bottom: 2px solid #e5e7eb;
		background: #f9fafb;
		position: sticky;
		top: 0;
	}

	.list-table td {
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid #f3f4f6;
		color: #374151;
	}

	.list-table tr { cursor: pointer; transition: background 0.1s; }
	.list-table tr:hover { background: #f0f9ff; }
	.list-table tr.selected { background: #eff6ff; }

	.list-title { font-weight: 600; color: #1f2937; }
</style>
