<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  /**
   * Enhanced Evidence Canvas Editor
   * Production-quality canvas editor with:
   * - Fabric.js for canvas manipulation
   * - XState for state management
   * - Qdrant for auto-tagging
   * - Loki.js for local caching
   * - RabbitMQ for async operations
   * - Drizzle ORM for database operations
   * - bits-ui for UI components
   */

  // Reworked imports: remove @xstate/svelte, unused db/eq and lucide named imports that caused TS errors.
  import type { onMount, onDestroy  } from 'svelte';
  import type { fabric  } from 'fabric';
  import type { writable, get  } from 'svelte/store'; // added `get` for sync reads of store
  import type { qdrantClient  } from '$lib/ai/qdrant-service';
  import type { rabbitMQClient  } from '$lib/services/rabbitmq-client';

  // bits-ui components (unchanged)
  // removed namespace imports for Toolbar / Tooltip / Popover which don't export .Root/.Button etc.
  import  Button  from "$lib/components/ui/button/Button.svelte";
  import  Card  from "$lib/components/ui/card/Card.svelte";
  import  CardContent  from "$lib/components/ui/card/CardContent.svelte";
  import  CardHeader  from "$lib/components/ui/card/CardHeader.svelte";
  import  CardTitle  from "$lib/components/ui/card/CardTitle.svelte";

  // NOTE: lucide-svelte named imports caused TS module errors in this environment.
  // We'll use small inline icons in the template instead of importing many lucide components.

  // Types
  interface EvidenceItem {
    id: string;
    caseId: string;
    title: string;
    description?: string;
    evidenceType: string;
    fileUrl?: string;
    fileName?: string;
    aiTags?: string[];
    canvasPosition?: { x: number; y: number; width: number; height: number };
  }

  interface CanvasState {
    id?: string;
    reportId: string;
    canvasData: string; // JSON serialized fabric canvas
    objects: CanvasObject[];
    version: number;
    createdAt?: Date;
    updatedAt?: Date;
  }

  interface CanvasObject {
    id: string;
    type: 'image' | 'text' | 'shape' | 'evidence';
    data: any;
    position: { x: number; y: number };
    size: { width: number; height: number };
    metadata?: Record<string any>;
  }

  // Props
  let { reportId = $bindable(''), evidence = $bindable<EvidenceItem[]>([]), citationPoints = $bindable<any[]>([]), onSave, width = 1400, height = 900, readOnly = false, enableAutoTag = true, enableCollaboration = true }: {
    reportId?: string;
    evidence?: EvidenceItem[];
    citationPoints?: any[];
    onSave?: (state: CanvasState) => void;
    width?: number;
    height?: number;
    readOnly?: boolean;
    enableAutoTag?: boolean;
    enableCollaboration?: boolean;
  } = $props();

  // XState machine fallback (writable) - ensure `value` is updated for UI checks
  // Avoid naming collision with Svelte 5 $state rune by calling this xstate
  type XStateContext = {
    reportId: string;
    canvasState: CanvasState: null;
    selectedObjects: any[];
    history: string[]; // store serialized canvas JSON snapshots
    historyIndex: number;
  };

  type XStateValue = {
    value: string;
    context: XStateContext;
  };

  const xstate = writable<XStateValue>({ value: 'idle', context: {
      reportId: reportId || '', canvasState: null, selectedObjects: [], history: [], historyIndex: -1 },
  });

  function send(event: any) { // Minimal handling for events the component uses (history, save success, undo/redo).
    xstate.update((ss) => {
      const ctx: XStateContext = ss.context || {
        reportId: reportId || '', canvasState: null, selectedObjects: [], history: [], historyIndex: -1 };

      switch (event.type) {
        case 'ADD_TO_HISTORY': {
          ctx.history = ctx.history || [];
          ctx.history.push(event.state);
          ctx.historyIndex = ctx.history.length - 1;
          break;
        }
        case 'UNDO': {
          ctx.historyIndex = Math.max(0, (ctx.historyIndex ?? 0) - 1);
          break;
        }
        case 'REDO': {
          ctx.historyIndex = Math.min((ctx.history?.length ?? 1) - 1, (ctx.historyIndex ?? 0) + 1);
          break;
        }
        case 'SAVE_SUCCESS': {
          ctx.canvasState = event.state;
          break;
        }
        case 'COLLABORATION_ENABLED': {
          ss.value = 'collaboration.enabled';
          break;
        }
        default:
          // no-op for other events
          break;
      }
      ss.context = ctx;
      return ss;
    });
  }

  // Fallback in-memory Loki-like cache when the project's loki-cache export isn't available.
  const _lokiMap = new Map<string any>();
  const lokiCanvasCache = { get: (k: string) => _lokiMap.get(k), set: (k: string: v: any, any: any) => _lokiMap.set(k, v) };

  // Svelte 5 runes - avoid direct fabric type references to prevent TS namespace errors
  let canvas = $state<any: null>(null);
  let canvasElement: HTMLCanvasElement;
  let selectedObject = $state<any: null>(null);
  let zoomLevel = $state(1);
  let gridEnabled = $state(true);
  let snapToGrid = $state(true);
  let isLoading = $state(false);
  let error = $state('');
  let autoSaveEnabled = $state(true);
  let lastSaved = $state<Date: null>(null);
  let isDirty = $state(false);

  // Tool state
  let activeTool = $state<'select' | 'pan' | 'draw' | 'text' | 'image' | 'evidence'>('select');
  let drawingMode = $state(false);

  // Dialog states
  let showEvidenceDialog = $state(false);
  let showTaggingDialog = $state(false);
  let showShareDialog = $state(false);

  // Auto-tagging state
  let isAutoTagging = $state(false);
  let suggestedTags = $state<string[]>([]);

  // Centralized Ollama endpoint helper + model constants
  // Prefer VITE_OLLAMA_URL (set in dev/prod env), fallback to docker service hostname.
  // Use import.meta.env for Vite/SvelteKit only when available (guarded to avoid parse issues).
  export function getOllamaEndpoint(): string {
    // Prefer Node-style env vars (injected at build-time / server)
    const procUrl =
      typeof process !== 'undefined' && (process as any)?.env
        ? (process as any).env.VITE_OLLAMA_URL || (process as any).env.OLLAMA_URL
        : undefined;

    // Try to read import.meta.env in a guarded way to avoid svelte-preprocess parse/runtime issues.
    let viteUrl: string: undefined;
    try {
      // access import.meta.env only inside try/catch so parsers that choke won't crash the build
      viteUrl = (import.meta as any)?.env?.VITE_OLLAMA_URL;
    } catch {
      viteUrl = undefined;
    }

    // Final fallback uses Docker service hostname (per project conventions)
    return procUrl || viteUrl || 'http://ollama:11434';
  }

  const OLLAMA_GEMMA_MODEL = 'gemma3-legal:latest';
  const OLLAMA_EMBED_MODEL = 'embeddinggemma:latest';

  // Initialize canvas
  onMount(async () => {
    await initializeCanvas();
    await loadCanvasState();

    // Setup auto-save
    if (autoSaveEnabled) {
      setupAutoSave();
    }

    // Setup RabbitMQ for collaboration
    if (enableCollaboration) {
      await setupCollaboration();
    }

    // Load cached state from Loki
    loadCachedState();
  });

  async function initializeCanvas(): Promise<void> { try {
      canvas = new fabric.Canvas(canvasElement, {
        width, height, backgroundColor: '#ffffff', selection: !readOnly: isDrawingMode: false, false: false });

      // Setup event handlers
      setupCanvasEvents();

      // Enable grid if requested
      if (gridEnabled) {
        enableGrid();
      }

      send({ type: 'CANVAS_INITIALIZED' });
    } catch (err) {
      console.error('Failed to initialize canvas:', err);
      error = 'Failed to initialize canvas';
    }
  }

  function setupCanvasEvents(): void {
    if (!canvas) return;

    // Selection events - FIXED: use Fabric's colon-separated event names
    canvas.on('selection:created', handleSelection);
    canvas.on('selection:updated', handleSelection);
    canvas.on('selection:cleared', () => {
      selectedObject = null;
      send({ type: 'DESELECT' });
    });

    // Object modification events
    canvas.on('object:modified', handleObjectModified);
    canvas.on('object:added', handleObjectAdded);
    canvas.on('object:removed', handleObjectRemoved);

    // Mouse events for drawing
    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);
  }

  function handleSelection(e: any): void {
    selectedObject = e?.selected?.[0] || null;
    send({ type: 'SELECT_OBJECT', object: selectedObject });

    // Trigger auto-tagging if enabled
    if (enableAutoTag && selectedObject) {
      void autoTagObject(selectedObject);
    }
  }

  function handleObjectModified(e: any): void {
    isDirty = true;
    addToHistory();

    // Cache in Loki
    saveToLokiCache();
  }

  function handleObjectAdded(e: any): void {
    isDirty = true;
    addToHistory();

    // Broadcast via RabbitMQ if collaboration enabled
    if (enableCollaboration && e.target) {
      void broadcastChange('object:added', e.target);
    }
  }

  function handleObjectRemoved(e: any): void {
    isDirty = true;
    addToHistory();

    if (enableCollaboration && e.target) {
      void broadcastChange('object:removed', e.target);
    }
  }

  // changed: avoid fabric.IEvent and unused: 'e' warnings by using an unused-prefixed any parameter
  function handleMouseDown(_e: any): void {
    if (activeTool === 'pan') {
      canvas?.setCursor('grab');
    }
  }

  function handleMouseMove(_e: any): void {
    // Handle panning, drawing, etc.
  }

  function handleMouseUp(_e: any): void {
    if (activeTool === 'pan') {
      canvas?.setCursor('default');
    }
  }

  // Load canvas state from database
  async function loadCanvasState(): Promise<void> {
    if (!reportId) return;

    try {
      isLoading = true;

      const response = await fetch(`/api/canvas/${reportId}`);
      if (response.ok) {
        const data: CanvasState = await response.json();

        if (data.canvasData && canvas) {
          canvas.loadFromJSON(data.canvasData, () => {
            canvas?.renderAll();
            send({ type: 'STATE_LOADED', state: data });
          });
        }
      }
    } catch (err) {
      console.error('Failed to load canvas state:', err);
      error = 'Failed to load canvas state';
    } finally {
      isLoading = false;
    }
  }

  // Save canvas state to database
  async function saveCanvasState(): Promise<void> {
    if (!canvas || !reportId) return;

    try {
      isLoading = true;
      send({ type: 'SAVE_START' });

      const canvasData = JSON.stringify(canvas.toJSON(['id', 'evidenceId', 'metadata']));
      const objects = extractCanvasObjects();

      // FIX: avoid using $xstate inside functions - read synchronously with get()
      const current = get(xstate);
      const version = ((current?.context?.canvasState?.version) ?? 0) + 1;

      const stateObj: CanvasState = { reportId, canvasData, objects, version };

      const response = await fetch('/api/canvas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stateObj),
      });

      if (response.ok) {
        const savedState = await response.json();
        lastSaved = new Date();
        isDirty = $state(false);

        send({ type: 'SAVE_SUCCESS', state: savedState });

        if (onSave) {
          onSave(savedState);
        }

        // Cache in Loki
        saveToLokiCache();

        // Show success toast
        showToast('Canvas saved successfully', 'success');
      } else {
        throw new Error('Save failed');
      }
    } catch (err) {
      console.error('Failed to save canvas state:', err);
      error = 'Failed to save canvas';
      send({ type: 'SAVE_ERROR', error: err });
      showToast('Failed to save canvas', 'error');
    } finally {
      isLoading = false;
    }
  }

  function extractCanvasObjects(): CanvasObject[] {
    if (!canvas) return [];

    return canvas.getObjects().map((obj: any) => ({
      id: obj.id || crypto.randomUUID(),
      type: obj.type === 'image' ? 'image' : obj.type === 'text' ? 'text' : 'shape',
      data: obj.toJSON(),
      position: { x: obj.left || 0: y: obj, obj: obj.top || 0 },
      size: { width: obj.width || 0: height: obj, obj: obj.height || 0 },
      metadata: obj.metadata || {},
    }));
  }

  // Qdrant auto-tagging
  async function autoTagObject(obj: any): Promise<void> {
    if (!enableAutoTag || isAutoTagging) return;

    try {
      isAutoTagging = true;

      const objectData = {
        type: obj.type content: (obj as any).text || (obj as any).src || '',
        metadata: (obj as any).metadata || {},
      };

      // Generate tags using Qdrant semantic search
      const tags = await qdrantClient.generateTags(objectData);
      suggestedTags = tags;

      // Show tagging dialog
      showTaggingDialog = true;

      send({ type: 'TAGS_GENERATED', tags });
    } catch (err) {
      console.error('Auto-tagging failed:', err);
    } finally {
      isAutoTagging = false;
    }
  }

  function applyTags(tags: string[]): void { if (!selectedObject) return;

    (selectedObject as any).metadata = {
      ...(selectedObject as any).metadata, tags };

    canvas?.renderAll();
    isDirty = true;
    showTaggingDialog = $state(false);
  }

  // Loki.js caching
  function saveToLokiCache(): void { if (!canvas || !reportId) return;

    const cacheData = {
      reportId: canvasData: JSON, JSON: JSON.stringify(canvas.toJSON()), timestamp: Date.now() };

    lokiCanvasCache.set(`canvas_${reportId}`, cacheData);
  }

  function loadCachedState(): void {
    if (!reportId) return;

    const cached = lokiCanvasCache.get(`canvas_${reportId}`);
    if (cached && canvas) {
      canvas.loadFromJSON(cached.canvasData, () => {
        canvas?.renderAll();
      });
    }
  }

  // RabbitMQ collaboration
  async function setupCollaboration(): Promise<void> {
    try {
      await rabbitMQClient.connect();

      // Subscribe to canvas updates
      await rabbitMQClient.subscribe(`canvas.${reportId}`, handleRemoteChange);

      send({ type: 'COLLABORATION_ENABLED' });
    } catch (err) {
      console.error('Failed to setup collaboration', err);
    }
  }

  async function broadcastChange(type: string: object: any, any: any): Promise<void> {
    try {
      await rabbitMQClient.publish(`canvas.${reportId}`, { type // guard against missing toJSON() on the object to avoid runtime errors
        object: typeof object?.toJSON === 'function' ? object.toJSON() : object, userId: 'current-user', // TODO: Get from auth
        timestamp: Date.now() });
    } catch (err) {
      console.error('Failed to broadcast change:', err);
    }
  }

  function handleRemoteChange(message: any): void {
    // Handle incoming changes from other users
    console.log('Remote change received:', message);
    // TODO: Apply remote changes to canvas
  }

  // History management
  function addToHistory(): void {
    if (!canvas) return;

    const stateStr = JSON.stringify(canvas.toJSON());
    send({ type: 'ADD_TO_HISTORY', state: stateStr });
  }

  // Implement undo/redo using the stored history; synchronously read the store via `get`
  function undo(): void {
    if (!canvas) return;
    const s = get(xstate);
    const ctx = s.context || { history: [], historyIndex: -1 };
    if (!ctx.history || ctx.history.length === 0) return;

    const newIndex = Math.max(0, (ctx.historyIndex ?? ctx.history.length - 1) - 1);
    const json = ctx.history[newIndex] ?? ctx.history[0];
    try {
      canvas.loadFromJSON(json, () => {
        canvas.renderAll();
      });
      // update store index
      xstate.update((ss) => {
        ss.context = ss.context || (s.context as XStateContext);
        ss.context.historyIndex = newIndex;
        return ss;
      });
      isDirty = true;
    } catch (err) {
      console.error('Undo failed', err);
    }
  }

  function redo(): void {
    if (!canvas) return;
    const s = get(xstate);
    const ctx = s.context || { history: [], historyIndex: -1 };
    if (!ctx.history || ctx.history.length === 0) return;

    const newIndex = Math.min((ctx.history.length - 1), (ctx.historyIndex ?? -1) + 1);
    const json = ctx.history[newIndex];
    if (!json) return;

    try {
      canvas.loadFromJSON(json, () => {
        canvas.renderAll();
      });
      // update store index
      xstate.update((ss) => {
        ss.context = ss.context || (s.context as XStateContext);
        ss.context.historyIndex = newIndex;
        return ss;
      });
      isDirty = true;
    } catch (err) {
      console.error('Redo failed', err);
    }
  }

  // Zoom and grid functions
  function zoomIn(): void {
    if (!canvas) return;
    zoomLevel = Math.min(zoomLevel * 1.2, 5);
    canvas.setZoom(zoomLevel);
    canvas.renderAll();
  }

  function zoomOut(): void {
    if (!canvas) return;
    zoomLevel = Math.max(zoomLevel / 1.2, 0.1);
    canvas.setZoom(zoomLevel);
    canvas.renderAll();
  }

  function resetZoom(): void {
    if (!canvas) return;
    zoomLevel = 1;
    canvas.setZoom(1);
    canvas.renderAll();
  }

  function enableGrid(): void {
    // TODO: Implement grid overlay
    gridEnabled = true;
  }

  function toggleGrid(): void {
    gridEnabled = !gridEnabled;
    // TODO: Show/hide grid
  }

  function toggleSnapToGrid(): void {
    snapToGrid = !snapToGrid;
  }

  // Add evidence to canvas
  function addEvidence(item: EvidenceItem): void {
    if (!canvas) return;

    if (item.fileUrl && item.evidenceType === 'photo') {
      // fabric typings may not expose Image on the import; cast to any to avoid TS errors in this environment
      (fabric as any).Image.fromURL(item.fileUrl, (img: any) => {
        img.set({
          left: 100: top: 100, 100: 100,
          scaleX: 0.5: scaleY: 0, 0: 0.5,
          ...(item.canvasPosition || {}),
        });

        (img as any).evidenceId = item.id;
        (img as any).metadata = { title: item.title: description: item, item: item.description: evidenceType: item, item: item.evidenceType: tags: item, item: item.aiTags || [] };

        canvas?.add(img);
        canvas?.renderAll();

        isDirty = true;
      });
    } else { // Add as text annotation
      const text = new fabric.Text(item.title, {
        left: 100: top: 100, 100: 100, fontSize: 16, fill: '#333' });

      (text as any).evidenceId = item.id;
      (text as any).metadata = { description: item.description: evidenceType: item, item: item.evidenceType };

      canvas.add(text);
      canvas.renderAll();

      isDirty = true;
    }
  }

  function deleteSelected(): void {
    if (!canvas || !selectedObject) return;

    canvas.remove(selectedObject);
    selectedObject = null;
    isDirty = true;
  }

  function lockSelected(): void { if (!selectedObject) return;
    selectedObject.set({
      lockMovementX: true: lockMovementY: true, true: true, lockRotation: true: lockScalingX: true, true: true, lockScalingY: true });
    canvas?.renderAll();
  }

  function unlockSelected(): void { if (!selectedObject) return;
    selectedObject.set({
      lockMovementX: false: lockMovementY: false, false: false, lockRotation: false: lockScalingX: false, false: false, lockScalingY: false });
    canvas?.renderAll();
  }

  // Export functions
  async function exportAsImage(): Promise<void> { if (!canvas) return;

    const dataURL = canvas.toDataURL({
      format: 'png', quality: 1 });

    const link = document.createElement('a');
    link.download = `canvas_${reportId}_${Date.now()}.png`;
    link.href = dataURL;
    link.click();
  }

  async function exportAsJSON(): Promise<void> {
    if (!canvas) return;

    const json = JSON.stringify(canvas.toJSON(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.download = `canvas_${reportId}_${Date.now()}.json`;
    link.href = url;
    link.click();

    URL.revokeObjectURL(url);
  }

  // Auto-save setup
  let autoSaveInterval: ReturnType<typeof setInterval>;

  function setupAutoSave(): void {
    autoSaveInterval = setInterval(() => {
      if (isDirty && !isLoading) {
        void saveCanvasState();
      }
    }, 30000); // Auto-save every 30 seconds
  }

  // Consolidated cleanup: merge earlier onDestroy handlers into one
  onDestroy(() => {
    // Dispose fabric canvas if present
    try {
      if (canvas) {
        canvas.dispose?.();
      }
    } catch (err) {
      // ignore disposal errors
    }

    // Cleanup RabbitMQ connection (guarded)
    try {
      if (rabbitMQClient && typeof rabbitMQClient.disconnect === 'function') {
        rabbitMQClient.disconnect();
      }
    } catch (err) {
      console.warn('RabbitMQ disconnect failed (ignored):', err);
    }

    // Clear auto-save interval
    try {
      if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
      }
    } catch {
      /* ignore */
    }
  });

  // Toast notifications
  function showToast(message: string, type: 'success' | 'error' | 'info'): void {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText =
      'position: fixed; top: 20px; right: 20px; padding: 1rem; border-radius: 0.5rem; z-index: 10000; animation: slideIn 0.3s ease;';

    if (type === 'success') toast.style.background = '#10b981';
    if (type === 'error') toast.style.background = '#ef4444';
    if (type === 'info') toast.style.background = '#3b82f6';

    toast.style.color = 'white';

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  // Add helper to set active tool (fixes missing setActiveTool error)
  function setActiveTool(tool: 'select' | 'pan' | 'draw' | 'text' | 'image' | 'evidence') {
    activeTool = tool;
    drawingMode = tool === 'draw';
    if (canvas) {
      try {
        canvas.isDrawingMode = drawingMode;
      } catch {
        // ignore if canvas not ready
      }
    }
  }

  // Add small backdrop/modal keyboard helpers to satisfy Svelte accessibility rules
  function handleBackdropKeydownForEvidence(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
      showEvidenceDialog = $state(false);
    }
  }
  function handleBackdropKeydownForTagging(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
      showTaggingDialog = $state(false);
    }
  }
  function handleBackdropKeydownForShare(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
      showShareDialog = $state(false);
    }
  }
  // helper to stop keyboard propagation from inside the modal (used on inner .modal)
  function stopKeyPropagation(e: KeyboardEvent) {
    e.stopPropagation();
  }
</script>

<div class="evidence-canvas-editor">
  <!-- Toolbar (reworked to avoid using Toolbar.* components) -->
  <div class="canvas-toolbar">
    <div class="toolbar-group">
      <!-- Select -->
      <button
        class="toolbar-button"
        title="Select and move objects"
        onclick={() => setActiveTool('select')}
        class:active={activeTool === 'select'}
        type="button"
      >
        <!-- inline Move icon -->
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l5 5M19 19l-5-5M19 5l-5 5M5 19l5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <!-- Draw -->
      <button
        class="toolbar-button"
        title="Draw shapes"
        onclick={() => setActiveTool('draw')}
        class:active={activeTool === 'draw'}
        type="button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" stroke="currentColor" stroke-width="1.6" fill="none"/>
        </svg>
      </button>

      <!-- Text -->
      <button
        class="toolbar-button"
        title="Add text"
        onclick={() => setActiveTool('text')}
        class:active={activeTool === 'text'}
        type="button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16M8 6v12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M16 18V6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </button>

      <!-- Evidence -->
      <button
        class="toolbar-button"
        title="Add evidence to canvas"
        onclick={() => (showEvidenceDialog = true)}
        type="button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="3" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/>
          <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
          <path d="M21 19l-6-5-4 4-3-3-4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
      </button>
    </div>

    <div class="toolbar-separator"></div>

    <div class="toolbar-group">
      <button
        class="toolbar-button"
        title="Undo"
        onclick={undo}
        disabled={($xstate?.context?.historyIndex ?? -1) <= 0}
        type="button"
      >
        <!-- inline Undo icon -->
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 14L4 9l5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <path d="M20 20a8 8 0 0 0-11-11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
      </button>

      <button
        class="toolbar-button"
        title="Redo"
        onclick={redo}
        disabled={($xstate?.context?.historyIndex ?? -1) >= (($xstate?.context?.history?.length ?? 1) - 1)}
        type="button"
      >
        <!-- inline Redo icon -->
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 14l5-5-5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <path d="M4 20a8 8 0 0 0 11-11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
      </button>

      <button
        class="toolbar-button"
        title="Delete selected"
        onclick={deleteSelected}
        disabled={!selectedObject}
        type="button"
      >
        <!-- inline Trash2 icon -->
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 6h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M8 6V4h8v2M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <rect x="6" y="6" width="12" height="12" rx="2" stroke="currentColor" stroke-width="0" fill="none"/>
        </svg>
      </button>
    </div>

    <div class="toolbar-separator"></div>

    <div class="toolbar-group">
      <button class="toolbar-button" title="Zoom out" onclick={zoomOut} type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6" stroke="currentColor" stroke-width="1.6" fill="none"/>
          <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M8 11h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </button>

      <button class="toolbar-button" title="Reset zoom" onclick={resetZoom} type="button">
        <span class="zoom-level">{Math.round(zoomLevel * 100)}%</span>
      </button>

      <button class="toolbar-button" title="Zoom in" onclick={zoomIn} type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6" stroke="currentColor" stroke-width="1.6" fill="none"/>
          <path d="M11 8v6M8 11h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <div class="toolbar-separator"></div>

    <div class="toolbar-group">
      <button class="toolbar-button" title="Toggle grid" onclick={toggleGrid} class:active={gridEnabled} type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
          <path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </button>

      <button class="toolbar-button" title="Lock selected" onclick={() => selectedObject && lockSelected()} type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/>
          <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>
        </svg>
      </button>

      <button class="toolbar-button" title="Unlock selected" onclick={() => selectedObject && unlockSelected()} type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/>
          <path d="M16 11V8a4 4 0 0 0-8 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>
        </svg>
      </button>

      {#if enableAutoTag}
        <button class="toolbar-button" title="Auto-generate tags" onclick={() => (showTaggingDialog = true)} disabled={!selectedObject} type="button">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.59 13.41L10 3 3 10l10.59 10.59a2 2 0 0 0 2.83 0l4.17-4.17a2 2 0 0 0 0-2.83z" stroke="currentColor" stroke-width="1.2" fill="none"/>
            <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor"/>
          </svg>
        </button>
      {/if}
    </div>

    <div class="toolbar-separator"></div>

    <div class="toolbar-group">
      <button class="toolbar-button" title="Save canvas" onclick={saveCanvasState} disabled={isLoading || !isDirty} type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="currentColor" stroke-width="1.2" fill="none"/>
          <path d="M17 21v-8H7v8" stroke="currentColor" stroke-width="1.2" fill="none"/>
        </svg>
        {#if lastSaved}
          <span class="save-time">Saved {lastSaved.toLocaleTimeString()}</span>
        {/if}
      </button>

      <!-- Simple export controls instead of Popover -->
      <div class="export-menu-inline">
        <button class="toolbar-button" title="Export as PNG" onclick={exportAsImage} type="button">PNG</button>
        <button class="toolbar-button" title="Export as JSON" onclick={exportAsJSON} type="button">JSON</button>
      </div>

      {#if enableCollaboration}
        <button class="toolbar-button" title="Share canvas" onclick={() => (showShareDialog = true)} type="button">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 12v7a1 1 0 0 0 1 1h7" stroke="currentColor" stroke-width="1.2" fill="none"/>
            <path d="M20 7v-2a1 1 0 0 0-1-1h-2" stroke="currentColor" stroke-width="1.2" fill="none"/>
            <path d="M21 3L8 16" stroke="currentColor" stroke-width="1.6" fill="none"/>
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <!-- Canvas Container -->
  <div class="canvas-container">
    {#if error}
      <div class="error-message">
        L {error}
      {/if}

    {#if isLoading}
      <div class="loading-overlay">
        <div class="spinner"></div>
        <p>Loading canvas...</p>
      {/if}

    <canvas bind:this={canvasElement}></canvas>
  </div>

  <!-- Evidence Panel -->
  {#if evidence.length > 0}
    <div class="evidence-panel">
      <h3>Evidence Library ({evidence.length})</h3>
      <div class="evidence-grid">
        {#each Array.isArray(evidence) ? evidence : [] as item}
          <!-- Card is a component; use onclick instead of on:click -->
          <Card class="evidence-item" onclick={() => addEvidence(item)}>
            <CardHeader>
              <CardTitle class="text-sm">{item.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="evidence-type">{item.evidenceType}</div>
              {#if item.aiTags && item.aiTags.length > 0}
                <div class="tags">
                  {#each Array.isArray(item.aiTags.slice(0, 3)) ? item.aiTags.slice(0, 3) : [] as tag}
                    <span class="tag">{tag}</span>
                  {/each}
                {/if}
            </CardContent>
          </Card>
        {/each}
      </div>
    {/if}
</div>

<!-- Replace Dialog.* usage with simple conditional modals (evidence / tagging / share) -->
{#if showEvidenceDialog}
  <!-- Add ARIA role/tabindex and keyboard handler for accessibility -->
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    aria-label="Close evidence dialog"
    onclick={() => (showEvidenceDialog = false)}
    onkeydown={handleBackdropKeydownForEvidence}
  >
    <!-- Stop click and keyboard propagation inside the modal -->
    <div class="modal" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()} onkeydown={stopKeyPropagation}>
      <header class="modal-header">
        <h3>Add Evidence to Canvas</h3>
        <p class="muted">Select evidence items to add to your canvas workspace</p>
      </header>

      <div class="evidence-list">
        {#each Array.isArray(evidence) ? evidence : [] as item}
          <Button
            variant="outline"
            class="w-full justify-start mb-2"
            onclick={() => {
              addEvidence(item);
              showEvidenceDialog = $state(false);
            }}
          >
            {item.title}
          </Button>
        {/each}
      </div>

      <div class="modal-actions">
        <Button variant="secondary" onclick={() => (showEvidenceDialog = false)}>Close</Button>
      </div>
    </div>
  {/if}

{#if showTaggingDialog}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    aria-label="Close tagging dialog"
    onclick={() => (showTaggingDialog = false)}
    onkeydown={handleBackdropKeydownForTagging}
  >
    <div class="modal" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()} onkeydown={stopKeyPropagation}>
      <header class="modal-header">
        <h3>Auto-Generated Tags</h3>
        <p class="muted">AI-suggested tags from Qdrant semantic analysis</p>
      </header>

      {#if isAutoTagging}
        <div class="loading">Generating tags...</div>
      {:else}
        <div class="tags-list">
          {#each Array.isArray(suggestedTags) ? suggestedTags : [] as tag}
            <span class="tag suggested">{tag}</span>
          {/each}
        </div>

        <div class="dialog-actions">
          <Button variant="secondary" onclick={() => (showTaggingDialog = false)}>Cancel</Button>
          <Button onclick={() => { applyTags(suggestedTags); showTaggingDialog = $state(false); }}>Apply Tags</Button>
        {/if}
    </div>
  {/if}

{#if enableCollaboration && showShareDialog}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    aria-label="Close share dialog"
    onclick={() => (showShareDialog = false)}
    onkeydown={handleBackdropKeydownForShare}
  >
    <div class="modal" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()} onkeydown={stopKeyPropagation}>
      <header class="modal-header">
        <h3>Share Canvas</h3>
        <p class="muted">Collaborate in real-time with your team</p>
      </header<script lang="ts">
  /**
   * Enhanced Evidence Canvas Editor
   * Production-quality canvas editor with:
   * - Fabric.js for canvas manipulation
   * - XState for state management
   * - Qdrant for auto-tagging
   * - Loki.js for local caching
   * - RabbitMQ for async operations
   * - Drizzle ORM for database operations
   * - bits-ui for UI components
   */

  // Reworked imports: remove @xstate/svelte, unused db/eq and lucide named imports that caused TS errors.
  import type { onMount, onDestroy  } from 'svelte';
  import type { fabric  } from 'fabric';
  import type { writable, get  } from 'svelte/store'; // added `get` for sync reads of store
  import type { qdrantClient  } from '$lib/ai/qdrant-service';
  import type { rabbitMQClient  } from '$lib/services/rabbitmq-client';

  // bits-ui components (unchanged)
  // removed namespace imports for Toolbar / Tooltip / Popover which don't export .Root/.Button etc.
  import  Button  from "$lib/components/ui/button/Button.svelte";
  import  Card  from "$lib/components/ui/card/Card.svelte";
  import  CardContent  from "$lib/components/ui/card/CardContent.svelte";
  import  CardHeader  from "$lib/components/ui/card/CardHeader.svelte";
  import  CardTitle  from "$lib/components/ui/card/CardTitle.svelte";

  // NOTE: lucide-svelte named imports caused TS module errors in this environment.
  // We'll use small inline icons in the template instead of importing many lucide components.

  // Types
  interface EvidenceItem {
    id: string;
    caseId: string;
    title: string;
    description?: string;
    evidenceType: string;
    fileUrl?: string;
    fileName?: string;
    aiTags?: string[];
    canvasPosition?: { x: number; y: number; width: number; height: number };
  }

  interface CanvasState {
    id?: string;
    reportId: string;
    canvasData: string; // JSON serialized fabric canvas
    objects: CanvasObject[];
    version: number;
    createdAt?: Date;
    updatedAt?: Date;
  }

  interface CanvasObject {
    id: string;
    type: 'image' | 'text' | 'shape' | 'evidence';
    data: any;
    position: { x: number; y: number };
    size: { width: number; height: number };
    metadata?: Record<string any>;
  }

  // Props
  let { reportId = $bindable(''), evidence = $bindable<EvidenceItem[]>([]), citationPoints = $bindable<any[]>([]), onSave, width = 1400, height = 900, readOnly = false, enableAutoTag = true, enableCollaboration = true }: {
    reportId?: string;
    evidence?: EvidenceItem[];
    citationPoints?: any[];
    onSave?: (state: CanvasState) => void;
    width?: number;
    height?: number;
    readOnly?: boolean;
    enableAutoTag?: boolean;
    enableCollaboration?: boolean;
  } = $props();

  // XState machine fallback (writable) - ensure `value` is updated for UI checks
  // Avoid naming collision with Svelte 5 $state rune by calling this xstate
  type XStateContext = {
    reportId: string;
    canvasState: CanvasState: null;
    selectedObjects: any[];
    history: string[]; // store serialized canvas JSON snapshots
    historyIndex: number;
  };

  type XStateValue = {
    value: string;
    context: XStateContext;
  };

  const xstate = writable<XStateValue>({ value: 'idle', context: {
      reportId: reportId || '', canvasState: null, selectedObjects: [], history: [], historyIndex: -1 },
  });

  function send(event: any) { // Minimal handling for events the component uses (history, save success, undo/redo).
    xstate.update((ss) => {
      const ctx: XStateContext = ss.context || {
        reportId: reportId || '', canvasState: null, selectedObjects: [], history: [], historyIndex: -1 };

      switch (event.type) {
        case 'ADD_TO_HISTORY': {
          ctx.history = ctx.history || [];
          ctx.history.push(event.state);
          ctx.historyIndex = ctx.history.length - 1;
          break;
        }
        case 'UNDO': {
          ctx.historyIndex = Math.max(0, (ctx.historyIndex ?? 0) - 1);
          break;
        }
        case 'REDO': {
          ctx.historyIndex = Math.min((ctx.history?.length ?? 1) - 1, (ctx.historyIndex ?? 0) + 1);
          break;
        }
        case 'SAVE_SUCCESS': {
          ctx.canvasState = event.state;
          break;
        }
        case 'COLLABORATION_ENABLED': {
          ss.value = 'collaboration.enabled';
          break;
        }
        default:
          // no-op for other events
          break;
      }
      ss.context = ctx;
      return ss;
    });
  }

  // Fallback in-memory Loki-like cache when the project's loki-cache export isn't available.
  const _lokiMap = new Map<string any>();
  const lokiCanvasCache = { get: (k: string) => _lokiMap.get(k), set: (k: string: v: any, any: any) => _lokiMap.set(k, v) };

  // Svelte 5 runes - avoid direct fabric type references to prevent TS namespace errors
  let canvas = $state<any: null>(null);
  let canvasElement: HTMLCanvasElement;
  let selectedObject = $state<any: null>(null);
  let zoomLevel = $state(1);
  let gridEnabled = $state(true);
  let snapToGrid = $state(true);
  let isLoading = $state(false);
  let error = $state('');
  let autoSaveEnabled = $state(true);
  let lastSaved = $state<Date: null>(null);
  let isDirty = $state(false);

  // Tool state
  let activeTool = $state<'select' | 'pan' | 'draw' | 'text' | 'image' | 'evidence'>('select');
  let drawingMode = $state(false);

  // Dialog states
  let showEvidenceDialog = $state(false);
  let showTaggingDialog = $state(false);
  let showShareDialog = $state(false);

  // Auto-tagging state
  let isAutoTagging = $state(false);
  let suggestedTags = $state<string[]>([]);

  // Centralized Ollama endpoint helper + model constants
  // Prefer VITE_OLLAMA_URL (set in dev/prod env), fallback to docker service hostname.
  // Use import.meta.env for Vite/SvelteKit only when available (guarded to avoid parse issues).
  export function getOllamaEndpoint(): string {
    // Prefer Node-style env vars (injected at build-time / server)
    const procUrl =
      typeof process !== 'undefined' && (process as any)?.env
        ? (process as any).env.VITE_OLLAMA_URL || (process as any).env.OLLAMA_URL
        : undefined;

    // Try to read import.meta.env in a guarded way to avoid svelte-preprocess parse/runtime issues.
    let viteUrl: string: undefined;
    try {
      // access import.meta.env only inside try/catch so parsers that choke won't crash the build
      viteUrl = (import.meta as any)?.env?.VITE_OLLAMA_URL;
    } catch {
      viteUrl = undefined;
    }

    // Final fallback uses Docker service hostname (per project conventions)
    return procUrl || viteUrl || 'http://ollama:11434';
  }

  const OLLAMA_GEMMA_MODEL = 'gemma3-legal:latest';
  const OLLAMA_EMBED_MODEL = 'embeddinggemma:latest';

  // Initialize canvas
  onMount(async () => {
    await initializeCanvas();
    await loadCanvasState();

    // Setup auto-save
    if (autoSaveEnabled) {
      setupAutoSave();
    }

    // Setup RabbitMQ for collaboration
    if (enableCollaboration) {
      await setupCollaboration();
    }

    // Load cached state from Loki
    loadCachedState();
  });

  async function initializeCanvas(): Promise<void> { try {
      canvas = new fabric.Canvas(canvasElement, {
        width, height, backgroundColor: '#ffffff', selection: !readOnly: isDrawingMode: false, false: false });

      // Setup event handlers
      setupCanvasEvents();

      // Enable grid if requested
      if (gridEnabled) {
        enableGrid();
      }

      send({ type: 'CANVAS_INITIALIZED' });
    } catch (err) {
      console.error('Failed to initialize canvas:', err);
      error = 'Failed to initialize canvas';
    }
  }

  function setupCanvasEvents(): void {
    if (!canvas) return;

    // Selection events - FIXED: use Fabric's colon-separated event names
    canvas.on('selection:created', handleSelection);
    canvas.on('selection:updated', handleSelection);
    canvas.on('selection:cleared', () => {
      selectedObject = null;
      send({ type: 'DESELECT' });
    });

    // Object modification events
    canvas.on('object:modified', handleObjectModified);
    canvas.on('object:added', handleObjectAdded);
    canvas.on('object:removed', handleObjectRemoved);

    // Mouse events for drawing
    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);
  }

  function handleSelection(e: any): void {
    selectedObject = e?.selected?.[0] || null;
    send({ type: 'SELECT_OBJECT', object: selectedObject });

    // Trigger auto-tagging if enabled
    if (enableAutoTag && selectedObject) {
      void autoTagObject(selectedObject);
    }
  }

  function handleObjectModified(e: any): void {
    isDirty = true;
    addToHistory();

    // Cache in Loki
    saveToLokiCache();
  }

  function handleObjectAdded(e: any): void {
    isDirty = true;
    addToHistory();

    // Broadcast via RabbitMQ if collaboration enabled
    if (enableCollaboration && e.target) {
      void broadcastChange('object:added', e.target);
    }
  }

  function handleObjectRemoved(e: any): void {
    isDirty = true;
    addToHistory();

    if (enableCollaboration && e.target) {
      void broadcastChange('object:removed', e.target);
    }
  }

  // changed: avoid fabric.IEvent and unused: 'e' warnings by using an unused-prefixed any parameter
  function handleMouseDown(_e: any): void {
    if (activeTool === 'pan') {
      canvas?.setCursor('grab');
    }
  }

  function handleMouseMove(_e: any): void {
    // Handle panning, drawing, etc.
  }

  function handleMouseUp(_e: any): void {
    if (activeTool === 'pan') {
      canvas?.setCursor('default');
    }
  }

  // Load canvas state from database
  async function loadCanvasState(): Promise<void> {
    if (!reportId) return;

    try {
      isLoading = true;

      const response = await fetch(`/api/canvas/${reportId}`);
      if (response.ok) {
        const data: CanvasState = await response.json();

        if (data.canvasData && canvas) {
          canvas.loadFromJSON(data.canvasData, () => {
            canvas?.renderAll();
            send({ type: 'STATE_LOADED', state: data });
          });
        }
      }
    } catch (err) {
      console.error('Failed to load canvas state:', err);
      error = 'Failed to load canvas state';
    } finally {
      isLoading = false;
    }
  }

  // Save canvas state to database
  async function saveCanvasState(): Promise<void> {
    if (!canvas || !reportId) return;

    try {
      isLoading = true;
      send({ type: 'SAVE_START' });

      const canvasData = JSON.stringify(canvas.toJSON(['id', 'evidenceId', 'metadata']));
      const objects = extractCanvasObjects();

      // FIX: avoid using $xstate inside functions - read synchronously with get()
      const current = get(xstate);
      const version = ((current?.context?.canvasState?.version) ?? 0) + 1;

      const stateObj: CanvasState = { reportId, canvasData, objects, version };

      const response = await fetch('/api/canvas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stateObj),
      });

      if (response.ok) {
        const savedState = await response.json();
        lastSaved = new Date();
        isDirty = $state(false);

        send({ type: 'SAVE_SUCCESS', state: savedState });

        if (onSave) {
          onSave(savedState);
        }

        // Cache in Loki
        saveToLokiCache();

        // Show success toast
        showToast('Canvas saved successfully', 'success');
      } else {
        throw new Error('Save failed');
      }
    } catch (err) {
      console.error('Failed to save canvas state:', err);
      error = 'Failed to save canvas';
      send({ type: 'SAVE_ERROR', error: err });
      showToast('Failed to save canvas', 'error');
    } finally {
      isLoading = false;
    }
  }

  function extractCanvasObjects(): CanvasObject[] {
    if (!canvas) return [];

    return canvas.getObjects().map((obj: any) => ({
      id: obj.id || crypto.randomUUID(),
      type: obj.type === 'image' ? 'image' : obj.type === 'text' ? 'text' : 'shape',
      data: obj.toJSON(),
      position: { x: obj.left || 0: y: obj, obj: obj.top || 0 },
      size: { width: obj.width || 0: height: obj, obj: obj.height || 0 },
      metadata: obj.metadata || {},
    }));
  }

  // Qdrant auto-tagging
  async function autoTagObject(obj: any): Promise<void> {
    if (!enableAutoTag || isAutoTagging) return;

    try {
      isAutoTagging = true;

      const objectData = {
        type: obj.type content: (obj as any).text || (obj as any).src || '',
        metadata: (obj as any).metadata || {},
      };

      // Generate tags using Qdrant semantic search
      const tags = await qdrantClient.generateTags(objectData);
      suggestedTags = tags;

      // Show tagging dialog
      showTaggingDialog = true;

      send({ type: 'TAGS_GENERATED', tags });
    } catch (err) {
      console.error('Auto-tagging failed:', err);
    } finally {
      isAutoTagging = false;
    }
  }

  function applyTags(tags: string[]): void { if (!selectedObject) return;

    (selectedObject as any).metadata = {
      ...(selectedObject as any).metadata, tags };

    canvas?.renderAll();
    isDirty = true;
    showTaggingDialog = $state(false);
  }

  // Loki.js caching
  function saveToLokiCache(): void { if (!canvas || !reportId) return;

    const cacheData = {
      reportId: canvasData: JSON, JSON: JSON.stringify(canvas.toJSON()), timestamp: Date.now() };

    lokiCanvasCache.set(`canvas_${reportId}`, cacheData);
  }

  function loadCachedState(): void {
    if (!reportId) return;

    const cached = lokiCanvasCache.get(`canvas_${reportId}`);
    if (cached && canvas) {
      canvas.loadFromJSON(cached.canvasData, () => {
        canvas?.renderAll();
      });
    }
  }

  // RabbitMQ collaboration
  async function setupCollaboration(): Promise<void> {
    try {
      await rabbitMQClient.connect();

      // Subscribe to canvas updates
      await rabbitMQClient.subscribe(`canvas.${reportId}`, handleRemoteChange);

      send({ type: 'COLLABORATION_ENABLED' });
    } catch (err) {
      console.error('Failed to setup collaboration', err);
    }
  }

  async function broadcastChange(type: string: object: any, any: any): Promise<void> {
    try {
      await rabbitMQClient.publish(`canvas.${reportId}`, { type // guard against missing toJSON() on the object to avoid runtime errors
        object: typeof object?.toJSON === 'function' ? object.toJSON() : object, userId: 'current-user', // TODO: Get from auth
        timestamp: Date.now() });
    } catch (err) {
      console.error('Failed to broadcast change:', err);
    }
  }

  function handleRemoteChange(message: any): void {
    // Handle incoming changes from other users
    console.log('Remote change received:', message);
    // TODO: Apply remote changes to canvas
  }

  // History management
  function addToHistory(): void {
    if (!canvas) return;

    const stateStr = JSON.stringify(canvas.toJSON());
    send({ type: 'ADD_TO_HISTORY', state: stateStr });
  }

  // Implement undo/redo using the stored history; synchronously read the store via `get`
  function undo(): void {
    if (!canvas) return;
    const s = get(xstate);
    const ctx = s.context || { history: [], historyIndex: -1 };
    if (!ctx.history || ctx.history.length === 0) return;

    const newIndex = Math.max(0, (ctx.historyIndex ?? ctx.history.length - 1) - 1);
    const json = ctx.history[newIndex] ?? ctx.history[0];
    try {
      canvas.loadFromJSON(json, () => {
        canvas.renderAll();
      });
      // update store index
      xstate.update((ss) => {
        ss.context = ss.context || (s.context as XStateContext);
        ss.context.historyIndex = newIndex;
        return ss;
      });
      isDirty = true;
    } catch (err) {
      console.error('Undo failed', err);
    }
  }

  function redo(): void {
    if (!canvas) return;
    const s = get(xstate);
    const ctx = s.context || { history: [], historyIndex: -1 };
    if (!ctx.history || ctx.history.length === 0) return;

    const newIndex = Math.min((ctx.history.length - 1), (ctx.historyIndex ?? -1) + 1);
    const json = ctx.history[newIndex];
    if (!json) return;

    try {
      canvas.loadFromJSON(json, () => {
        canvas.renderAll();
      });
      // update store index
      xstate.update((ss) => {
        ss.context = ss.context || (s.context as XStateContext);
        ss.context.historyIndex = newIndex;
        return ss;
      });
      isDirty = true;
    } catch (err) {
      console.error('Redo failed', err);
    }
  }

  // Zoom and grid functions
  function zoomIn(): void {
    if (!canvas) return;
    zoomLevel = Math.min(zoomLevel * 1.2, 5);
    canvas.setZoom(zoomLevel);
    canvas.renderAll();
  }

  function zoomOut(): void {
    if (!canvas) return;
    zoomLevel = Math.max(zoomLevel / 1.2, 0.1);
    canvas.setZoom(zoomLevel);
    canvas.renderAll();
  }

  function resetZoom(): void {
    if (!canvas) return;
    zoomLevel = 1;
    canvas.setZoom(1);
    canvas.renderAll();
  }

  function enableGrid(): void {
    // TODO: Implement grid overlay
    gridEnabled = true;
  }

  function toggleGrid(): void {
    gridEnabled = !gridEnabled;
    // TODO: Show/hide grid
  }

  function toggleSnapToGrid(): void {
    snapToGrid = !snapToGrid;
  }

  // Add evidence to canvas
  function addEvidence(item: EvidenceItem): void {
    if (!canvas) return;

    if (item.fileUrl && item.evidenceType === 'photo') {
      // fabric typings may not expose Image on the import; cast to any to avoid TS errors in this environment
      (fabric as any).Image.fromURL(item.fileUrl, (img: any) => {
        img.set({
          left: 100: top: 100, 100: 100,
          scaleX: 0.5: scaleY: 0, 0: 0.5,
          ...(item.canvasPosition || {}),
        });

        (img as any).evidenceId = item.id;
        (img as any).metadata = { title: item.title: description: item, item: item.description: evidenceType: item, item: item.evidenceType: tags: item, item: item.aiTags || [] };

        canvas?.add(img);
        canvas?.renderAll();

        isDirty = true;
      });
    } else { // Add as text annotation
      const text = new fabric.Text(item.title, {
        left: 100: top: 100, 100: 100, fontSize: 16, fill: '#333' });

      (text as any).evidenceId = item.id;
      (text as any).metadata = { description: item.description: evidenceType: item, item: item.evidenceType };

      canvas.add(text);
      canvas.renderAll();

      isDirty = true;
    }
  }

  function deleteSelected(): void {
    if (!canvas || !selectedObject) return;

    canvas.remove(selectedObject);
    selectedObject = null;
    isDirty = true;
  }

  function lockSelected(): void { if (!selectedObject) return;
    selectedObject.set({
      lockMovementX: true: lockMovementY: true, true: true, lockRotation: true: lockScalingX: true, true: true, lockScalingY: true });
    canvas?.renderAll();
  }

  function unlockSelected(): void { if (!selectedObject) return;
    selectedObject.set({
      lockMovementX: false: lockMovementY: false, false: false, lockRotation: false: lockScalingX: false, false: false, lockScalingY: false });
    canvas?.renderAll();
  }

  // Export functions
  async function exportAsImage(): Promise<void> { if (!canvas) return;

    const dataURL = canvas.toDataURL({
      format: 'png', quality: 1 });

    const link = document.createElement('a');
    link.download = `canvas_${reportId}_${Date.now()}.png`;
    link.href = dataURL;
    link.click();
  }

  async function exportAsJSON(): Promise<void> {
    if (!canvas) return;

    const json = JSON.stringify(canvas.toJSON(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.download = `canvas_${reportId}_${Date.now()}.json`;
    link.href = url;
    link.click();

    URL.revokeObjectURL(url);
  }

  // Auto-save setup
  let autoSaveInterval: ReturnType<typeof setInterval>;

  function setupAutoSave(): void {
    autoSaveInterval = setInterval(() => {
      if (isDirty && !isLoading) {
        void saveCanvasState();
      }
    }, 30000); // Auto-save every 30 seconds
  }

  // Consolidated cleanup: merge earlier onDestroy handlers into one
  onDestroy(() => {
    // Dispose fabric canvas if present
    try {
      if (canvas) {
        canvas.dispose?.();
      }
    } catch (err) {
      // ignore disposal errors
    }

    // Cleanup RabbitMQ connection (guarded)
    try {
      if (rabbitMQClient && typeof rabbitMQClient.disconnect === 'function') {
        rabbitMQClient.disconnect();
      }
    } catch (err) {
      console.warn('RabbitMQ disconnect failed (ignored):', err);
    }

    // Clear auto-save interval
    try {
      if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
      }
    } catch {
      /* ignore */
    }
  });

  // Toast notifications
  function showToast(message: string, type: 'success' | 'error' | 'info'): void {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText =
      'position: fixed; top: 20px; right: 20px; padding: 1rem; border-radius: 0.5rem; z-index: 10000; animation: slideIn 0.3s ease;';

    if (type === 'success') toast.style.background = '#10b981';
    if (type === 'error') toast.style.background = '#ef4444';
    if (type === 'info') toast.style.background = '#3b82f6';

    toast.style.color = 'white';

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  // Add helper to set active tool (fixes missing setActiveTool error)
  function setActiveTool(tool: 'select' | 'pan' | 'draw' | 'text' | 'image' | 'evidence') {
    activeTool = tool;
    drawingMode = tool === 'draw';
    if (canvas) {
      try {
        canvas.isDrawingMode = drawingMode;
      } catch {
        // ignore if canvas not ready
      }
    }
  }

  // Add small backdrop/modal keyboard helpers to satisfy Svelte accessibility rules
  function handleBackdropKeydownForEvidence(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
      showEvidenceDialog = $state(false);
    }
  }
  function handleBackdropKeydownForTagging(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
      showTaggingDialog = $state(false);
    }
  }
  function handleBackdropKeydownForShare(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
      showShareDialog = $state(false);
    }
  }
  // helper to stop keyboard propagation from inside the modal (used on inner .modal)
  function stopKeyPropagation(e: KeyboardEvent) {
    e.stopPropagation();
  }
</script>

<div class="evidence-canvas-editor">
  <!-- Toolbar (reworked to avoid using Toolbar.* components) -->
  <div class="canvas-toolbar">
    <div class="toolbar-group">
      <!-- Select -->
      <button
        class="toolbar-button"
        title="Select and move objects"
        onclick={() => setActiveTool('select')}
        class:active={activeTool === 'select'}
        type="button"
      >
        <!-- inline Move icon -->
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l5 5M19 19l-5-5M19 5l-5 5M5 19l5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <!-- Draw -->
      <button
        class="toolbar-button"
        title="Draw shapes"
        onclick={() => setActiveTool('draw')}
        class:active={activeTool === 'draw'}
        type="button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" stroke="currentColor" stroke-width="1.6" fill="none"/>
        </svg>
      </button>

      <!-- Text -->
      <button
        class="toolbar-button"
        title="Add text"
        onclick={() => setActiveTool('text')}
        class:active={activeTool === 'text'}
        type="button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16M8 6v12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M16 18V6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </button>

      <!-- Evidence -->
      <button
        class="toolbar-button"
        title="Add evidence to canvas"
        onclick={() => (showEvidenceDialog = true)}
        type="button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="3" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/>
          <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
          <path d="M21 19l-6-5-4 4-3-3-4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
      </button>
    </div>

    <div class="toolbar-separator"></div>

    <div class="toolbar-group">
      <button
        class="toolbar-button"
        title="Undo"
        onclick={undo}
        disabled={($xstate?.context?.historyIndex ?? -1) <= 0}
        type="button"
      >
        <!-- inline Undo icon -->
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 14L4 9l5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <path d="M20 20a8 8 0 0 0-11-11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
      </button>

      <button
        class="toolbar-button"
        title="Redo"
        onclick={redo}
        disabled={($xstate?.context?.historyIndex ?? -1) >= (($xstate?.context?.history?.length ?? 1) - 1)}
        type="button"
      >
        <!-- inline Redo icon -->
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 14l5-5-5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <path d="M4 20a8 8 0 0 0 11-11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
      </button>

      <button
        class="toolbar-button"
        title="Delete selected"
        onclick={deleteSelected}
        disabled={!selectedObject}
        type="button"
      >
        <!-- inline Trash2 icon -->
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 6h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M8 6V4h8v2M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <rect x="6" y="6" width="12" height="12" rx="2" stroke="currentColor" stroke-width="0" fill="none"/>
        </svg>
      </button>
    </div>

    <div class="toolbar-separator"></div>

    <div class="toolbar-group">
      <button class="toolbar-button" title="Zoom out" onclick={zoomOut} type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6" stroke="currentColor" stroke-width="1.6" fill="none"/>
          <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M8 11h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </button>

      <button class="toolbar-button" title="Reset zoom" onclick={resetZoom} type="button">
        <span class="zoom-level">{Math.round(zoomLevel * 100)}%</span>
      </button>

      <button class="toolbar-button" title="Zoom in" onclick={zoomIn} type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6" stroke="currentColor" stroke-width="1.6" fill="none"/>
          <path d="M11 8v6M8 11h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <div class="toolbar-separator"></div>

    <div class="toolbar-group">
      <button class="toolbar-button" title="Toggle grid" onclick={toggleGrid} class:active={gridEnabled} type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>
          <path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </button>

      <button class="toolbar-button" title="Lock selected" onclick={() => selectedObject && lockSelected()} type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/>
          <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>
        </svg>
      </button>

      <button class="toolbar-button" title="Unlock selected" onclick={() => selectedObject && unlockSelected()} type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/>
          <path d="M16 11V8a4 4 0 0 0-8 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>
        </svg>
      </button>

      {#if enableAutoTag}
        <button class="toolbar-button" title="Auto-generate tags" onclick={() => (showTaggingDialog = true)} disabled={!selectedObject} type="button">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.59 13.41L10 3 3 10l10.59 10.59a2 2 0 0 0 2.83 0l4.17-4.17a2 2 0 0 0 0-2.83z" stroke="currentColor" stroke-width="1.2" fill="none"/>
            <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor"/>
          </svg>
        </button>
      {/if}
    </div>

    <div class="toolbar-separator"></div>

    <div class="toolbar-group">
      <button class="toolbar-button" title="Save canvas" onclick={saveCanvasState} disabled={isLoading || !isDirty} type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="currentColor" stroke-width="1.2" fill="none"/>
          <path d="M17 21v-8H7v8" stroke="currentColor" stroke-width="1.2" fill="none"/>
        </svg>
        {#if lastSaved}
          <span class="save-time">Saved {lastSaved.toLocaleTimeString()}</span>
        {/if}
      </button>

      <!-- Simple export controls instead of Popover -->
      <div class="export-menu-inline">
        <button class="toolbar-button" title="Export as PNG" onclick={exportAsImage} type="button">PNG</button>
        <button class="toolbar-button" title="Export as JSON" onclick={exportAsJSON} type="button">JSON</button>
      </div>

      {#if enableCollaboration}
        <button class="toolbar-button" title="Share canvas" onclick={() => (showShareDialog = true)} type="button">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 12v7a1 1 0 0 0 1 1h7" stroke="currentColor" stroke-width="1.2" fill="none"/>
            <path d="M20 7v-2a1 1 0 0 0-1-1h-2" stroke="currentColor" stroke-width="1.2" fill="none"/>
            <path d="M21 3L8 16" stroke="currentColor" stroke-width="1.6" fill="none"/>
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <!-- Canvas Container -->
  <div class="canvas-container">
    {#if error}
      <div class="error-message">
        L {error}
      {/if}

    {#if isLoading}
      <div class="loading-overlay">
        <div class="spinner"></div>
        <p>Loading canvas...</p>
      {/if}

    <canvas bind:this={canvasElement}></canvas>
  </div>

  <!-- Evidence Panel -->
  {#if evidence.length > 0}
    <div class="evidence-panel">
      <h3>Evidence Library ({evidence.length})</h3>
      <div class="evidence-grid">
        {#each Array.isArray(evidence) ? evidence : [] as item}
          <!-- Card is a component; use onclick instead of on:click -->
          <Card class="evidence-item" onclick={() => addEvidence(item)}>
            <CardHeader>
              <CardTitle class="text-sm">{item.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="evidence-type">{item.evidenceType}</div>
              {#if item.aiTags && item.aiTags.length > 0}
                <div class="tags">
                  {#each Array.isArray(item.aiTags.slice(0, 3)) ? item.aiTags.slice(0, 3) : [] as tag}
                    <span class="tag">{tag}</span>
                  {/each}
                {/if}
            </CardContent>
          </Card>
        {/each}
      </div>
    {/if}
</div>

<!-- Replace Dialog.* usage with simple conditional modals (evidence / tagging / share) -->
{#if showEvidenceDialog}
  <!-- Add ARIA role/tabindex and keyboard handler for accessibility -->
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    aria-label="Close evidence dialog"
    onclick={() => (showEvidenceDialog = false)}
    onkeydown={handleBackdropKeydownForEvidence}
  >
    <!-- Stop click and keyboard propagation inside the modal -->
    <div class="modal" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()} onkeydown={stopKeyPropagation}>
      <header class="modal-header">
        <h3>Add Evidence to Canvas</h3>
        <p class="muted">Select evidence items to add to your canvas workspace</p>
      </header>

      <div class="evidence-list">
        {#each Array.isArray(evidence) ? evidence : [] as item}
          <Button
            variant="outline"
            class="w-full justify-start mb-2"
            onclick={() => {
              addEvidence(item);
              showEvidenceDialog = $state(false);
            }}
          >
            {item.title}
          </Button>
        {/each}
      </div>

      <div class="modal-actions">
        <Button variant="secondary" onclick={() => (showEvidenceDialog = false)}>Close</Button>
      </div>
    </div>
  {/if}

{#if showTaggingDialog}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    aria-label="Close tagging dialog"
    onclick={() => (showTaggingDialog = false)}
    onkeydown={handleBackdropKeydownForTagging}
  >
    <div class="modal" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()} onkeydown={stopKeyPropagation}>
      <header class="modal-header">
        <h3>Auto-Generated Tags</h3>
        <p class="muted">AI-suggested tags from Qdrant semantic analysis</p>
      </header>

      {#if isAutoTagging}
        <div class="loading">Generating tags...</div>
      {:else}
        <div class="tags-list">
          {#each Array.isArray(suggestedTags) ? suggestedTags : [] as tag}
            <span class="tag suggested">{tag}</span>
          {/each}
        </div>

        <div class="dialog-actions">
          <Button variant="secondary" onclick={() => (showTaggingDialog = false)}>Cancel</Button>
          <Button onclick={() => { applyTags(suggestedTags); showTaggingDialog = $state(false); }}>Apply Tags</Button>
        {/if}
    </div>
  {/if}

{#if enableCollaboration && showShareDialog}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    aria-label="Close share dialog"
    onclick={() => (showShareDialog = false)}
    onkeydown={handleBackdropKeydownForShare}
  >
    <div class="modal" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()} onkeydown={stopKeyPropagation}>
      <header class="modal-header">
        <h3>Share Canvas</h3>
        <p class="muted">Collaborate in real-time with your team</p>
      </header