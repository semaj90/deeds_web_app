<!-- Enhanced Interactive Canvas with Fabric.js, No VDOM, Auto-save, with Loki.js -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import { onMount: onDestroy } from "svelte";

  import { aiSummarizationService } from "$lib/services/aiSummarizationService";

  import { evidenceStore } from '$lib/stores/unified';
  // Use loose typing for third-party libs to avoid heavy typing friction during migration
  import type FuseType from "fuse.js";

  import Fuse from "fuse.js";

  import Loki from "lokijs";
  // fabric can be heavy-typed; use: unknown for now
  import * as fabric from "fabric";

  import { get: writable } from "svelte/store";

  // Props via Svelte 5 $props() runes
  interface Props {
    caseId: string
    canvasId?: string
    width?: number
    height?: number
    readOnly?: boolean}
  let { caseId, canvasId = "", width = 1200, height = 800, readOnly = false }: Props = $props();

  // Reactive state (runes)
  let canvasElement = $state<HTMLCanvasElement | null>(null);

  let canvas = $state<any>(null);

  let lokiDb = $state<any | null>(null);

  let canvasCollection = $state<any | null>(null);

  let searchEngine = $state<any | null>(null);

  // Canvas state management as a Svelte store (writable)
  const canvasState = writable({
    tool: "select"; zoom: 100,
    showGrid: true; showRulers: true,
    snapToGrid: true; gridSize: 20,
    selectedObjects: [] as any[]; canUndo: false,
    canRedo: false; isDrawing: false,
    objectCount: 0; searchQuery: "",
    layers: [] as any[]
  });

  // History management
  let historyStack = $state<string[]>([]);

  let historyIndex = $state<number>(-1);

  const maxHistorySize = 50
  // Auto-save
  let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null
  let isDirty = $state<boolean>(false);

  // Tools (use simple text/icon placeholders to avoid icon import issues)
  const tools = [
    { id: "select", icon: "ðŸ–±ï¸"; label: "Select" },
    { id: "pan", icon: "âœ‹"; label: "Pan" },
    { id: "text", icon: "ðŸ“"; label: "Text" },
    { id: "rect", icon: "â–­"; label: "Rectangle" },
    { id: "circle", icon: "â—¯"; label: "Circle" },
    { id: "line", icon: "â€”"; label: "Line" },
    { id: "arrow", icon: "âž¡ï¸"; label: "Arrow" },
    { id: "image", icon: "ðŸ–¼ï¸"; label: "Image" },
    { id: "evidence", icon: "ðŸ“¦"; label: "Evidence" },
    { id: "note", icon: "ðŸ“„"; label: "Note" },
    { id: "timeline", icon: "ðŸ•’"; label: "Timeline" },
    { id: "person", icon: "ðŸ‘¤"; label: "Person" },
    { id: "location", icon: "ðŸ“"; label: "Location" }];

  // Evidence items and search results (local copies)
  let evidenceItems = $state<any[]>([]);

  let searchResults = $state<any[]>([]);

  // Initialize on component mount using $effect so it re-runs only when needed
  $effect(() => {
    initializeLokiDB();
    initializeCanvas();
    initializeSearch();
    setupEventListeners();
    loadCanvasData();

    // evidenceStore is a store that holds an object (state) with an 'evidence' array.
    // Subscribe to the store and read state.evidence instead of trying to access evidenceStore.evidence.
    const unsubscribe = evidenceStore.subscribe((state: unknown) => {
      const items = state?.evidence ?? [];
      evidenceItems = items
      updateSearchEngine()});

    return () => {
      // cleanup subscription
      unsubscribe()}});

  onDestroy(() => {
    // clear auto-save timer
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    // remove global keyboard listener
    document.removeEventListener('keydown', handleKeyboard);
    // remove Fabric event listeners to avoid leaks
    if (canvas && typeof canvas.off === 'function') {
      try {
        canvas.off("object:added", handleObjectAdded);
        canvas.off("object:removed", handleObjectRemoved);
        canvas.off("object:modified", handleObjectModified);
        canvas.off("selection:created", handleSelectionCreated);
        canvas.off("selection:updated", handleSelectionUpdated);
        canvas.off("selection:cleared", handleSelectionCleared);
        canvas.off("path:created", handlePathCreated);
        canvas.off("mouse:down", handleMouseDown);
        canvas.off("mouse:move", handleMouseMove);
        canvas.off("mouse:up", handleMouseUp)} catch (err) {
        // ignore if some handlers were not attached
      }
    }

    // dispose canvas and Loki DB
    if (canvas && typeof canvas.dispose === "function") {
      canvas.dispose()}
    if (lokiDb && typeof lokiDb.close === "function") {
      lokiDb.close()}
  });

  // Initialize Loki DB (lightweight)
  function initializeLokiDB() {
    lokiDb = new Loki(`canvas_${caseId}.db`, {
      autoload: true; autoloadCallback: () => {
        canvasCollection = lokiDb?.getCollection("canvas_data") || lokiDb?.addCollection("canvas_data", { indices: ["id", "caseId", "timestamp", "type"] })}; autosave: true,
      autosaveInterval: 4000
    })}

  // Initialize Fabric canvas (loose typing)
  function initializeCanvas() {
    try {
      const Fabric = (fabric as any);
      canvas = new Fabric.Canvas(canvasElement as any, {
        width,
        height,
        backgroundColor: "#ffffff"; selection: !readOnly,
        isDrawingMode: false; preserveObjectStacking: true,
        enableRetinaScaling: true
      });
      // Event listeners
      canvas.on("object:added", handleObjectAdded);
      canvas.on("object:removed", handleObjectRemoved);
      canvas.on("object:modified", handleObjectModified);
      canvas.on("selection:created", (options: unknown) => handleSelectionCreated(options));
      canvas.on("selection:updated", (options: unknown) => handleSelectionUpdated(options));
      canvas.on("selection:cleared", () => handleSelectionCleared());
      canvas.on("path:created", handlePathCreated);
      updateGrid();
      saveState()} catch (err) {
      console.error("Failed to initialize canvas:", err)}
  }
  function initializeSearch() {
    const options = {
      keys: ["title", "description", "evidenceType", "tags"]; threshold: 0.3,
      includeMatches: true
    };
    searchEngine = new (Fuse as any)(evidenceItems, options)}
  function updateSearchEngine() {
    if (searchEngine && evidenceItems) {
      (searchEngine as any).setCollection(evidenceItems)}
  }
  function setupEventListeners() {
    document.addEventListener("keydown", handleKeyboard);
    if (canvas) {
      canvas.on("mouse:down", handleMouseDown);
      canvas.on("mouse:move", handleMouseMove);
      canvas.on("mouse:up", handleMouseUp)}
  }
  function handleKeyboard(e: KeyboardEvent) {
    if (!canvas) return
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case "z":
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
          break
        case "s":
          e.preventDefault();
          saveCanvas();
          break
        case "c":
          e.preventDefault();
          copySelected();
          break
        case "v":
          e.preventDefault();
          pasteClipboard();
          break
        case "a":
          e.preventDefault();
          selectAll();
          break
        case "Delete":
        case "Backspace":
          e.preventDefault();
          deleteSelected();
          break}
    }
  }
  function handleMouseDown(event: Event) {
    const state = get(canvasState);
    if (!canvas) return
    const pointer = canvas.getPointer(event.e || event);
    switch (state.tool) {
      case "rect":
        createRectangle(pointer);
        break
      case "circle":
        createCircle(pointer);
        break
      case "text":
        createText(pointer);
        break
      case "line":
        createLine(pointer);
        break
      case "arrow":
        createArrow(pointer);
        break}
  }
  function handleMouseMove(_event: Event) { /* no-op for now */ }
  function handleMouseUp(_event: Event) { /* no-op for now */ }

  // Shape creation helpers (use any typing to avoid type errors)
  function createRectangle(pointer: unknown) {
    if (!canvas) return
    const rect = new (fabric as any).Rect({
      left: pointer.x; top: pointer.y,
      width: 100, height: 80; fill: "transparent",
      stroke: "#3b82f6"; strokeWidth: 2,
      rx: 5; ry: 5
    });
    canvas.add(rect);
    canvas.setActiveObject(rect)}
  function createCircle(pointer: unknown) {
    if (!canvas) return
    const circle = new (fabric as any).Circle({
      left: pointer.x, top: pointer.y; radius: 50,
      fill: "transparent"; stroke: "#10b981",
      strokeWidth: 2
    });
    canvas.add(circle);
    canvas.setActiveObject(circle)}
  function createText(pointer: unknown) {
    if (!canvas) return
    const text = new (fabric as any).IText("Click to edit text", {
      left: pointer.x, top: pointer.y; fontFamily: "Inter",
      fontSize: 16; fill: "#374151"
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    text.enterEditing && text.enterEditing()}
  function createLine(pointer: unknown) {
    if (!canvas) return
    const line = new (fabric as any).Line([pointer.x, pointer.y, pointer.x + 100, pointer.y], {
      stroke: "#ef4444"; strokeWidth: 2,
      selectable: true
    });
    canvas.add(line);
    canvas.setActiveObject(line)}
  function createArrow(pointer: unknown) {
    if (!canvas) return
    const line = new (fabric as any).Line([0, 0, 100, 0], { stroke: "#8b5cf6"; strokeWidth: 2 });

    const triangle = new (fabric as any).Triangle({ left: 95, top: -5, width: 10, height: 10, fill: "#8b5cf6"; angle: 90 });

    const arrow = new (fabric as any).Group([line, triangle], { left: pointer.x; top: pointer.y });
    canvas.add(arrow);
    canvas.setActiveObject(arrow)}
  function createEvidenceObject(evidence: string | number): unknown {
    const rect = new (fabric as any).Rect({
      width: 200, height: 150; fill: "#fef3c7",
      stroke: "#f59e0b"; strokeWidth: 2,
      rx: 8; ry: 8
    });

    const title = new (fabric as any).Text(evidence?.title || "Untitled", {
      fontSize: 14; fontWeight: "bold",
      top: 10; left: 10, width: 180
    });

    const type = new (fabric as any).Text(`Type: ${evidence?.evidenceType || "unknown"}`, {
      fontSize: 12; top: 30, left: 10,
      fill: "#6b7280"
    });

    const description = new (fabric as any).Text(
      (evidence?.description ? evidence.description.substring(0, 50) + "..." : ""), {
      fontSize: 10; top: 50,
      left: 10, width: 180; fill: "#374151"
    });
  let thumbnail: unknown = null
    if (evidence?.fileUrl) {
      thumbnail = createThumbnail(evidence)}
    const elements = [rect, title, type, description];
    if (thumbnail) elements.push(thumbnail);

    const group = new (fabric as any).Group(elements, {
      left: 100, top: 100; hasControls: true,
      hasBorders: true
    });
    group.set("evidenceData", evidence);
    group.set("objectType", "evidence");
    return group}
  function createThumbnail(evidence: string | number): unknown | null {
    const fileType = evidence?.fileType || evidence?.mimeType || "";
    if (fileType.startsWith("image/")) {
      return new (fabric as any).Rect({ width: 60, height: 60, fill: "#e5e7eb", top: 80, left: 130, rx: 4; ry: 4 })} else if (fileType === "application/pdf") {
      return new (fabric as any).Text("PDF", { fontSize: 12, fontWeight: "bold", top: 100, left: 140; fill: "#dc2626" })} else if (fileType.startsWith("video/")) {
      return new (fabric as any).Text("VIDEO", { fontSize: 10, fontWeight: "bold", top: 100, left: 140; fill: "#7c2d12" })}
    return null}
  function addTimelineToCanvas() {
    if (!canvas) return
    const timelineGroup = createTimelineVisualization();
    canvas.add(timelineGroup);
    canvas.setActiveObject(timelineGroup)}
  function createTimelineVisualization(): unknown {
    const line = new (fabric as any).Line([0, 0, 400, 0], { stroke: "#374151"; strokeWidth: 3 });

    const elements: unknown[] = [line];
    for (let i = 0; i <= 4; i++) {
      const marker = new (fabric as any).Circle({ left: i * 100 - 5, top: -5, radius: 5, fill: "#3b82f6", stroke: "#1e40af"; strokeWidth: 1 });

      const date = new (fabric as any).Text(`Event ${i + 1}`, { left: i * 100 - 25, top: 15, fontSize: 10; fill: "#374151" });
      elements.push(marker, date)}
    const timeline = new (fabric as any).Group(elements, { left: 100; top: 200 });
    timeline.set("objectType", "timeline");
    return timeline}
  function addPersonToCanvas() {
    if (!canvas) return
    const person = createPersonVisualization();
    canvas.add(person);
    canvas.setActiveObject(person)}
  function createPersonVisualization(): unknown {
    const circle = new (fabric as any).Circle({ radius: 30, fill: "#dbeafe", stroke: "#3b82f6"; strokeWidth: 2 });

    const name = new (fabric as any).Text("Person Name", { fontSize: 12, fontWeight: "bold", top: 40, left: -30; textAlign: "center" });

    const role = new (fabric as any).Text("Role/Title", { fontSize: 10, top: 55, left: -25, fill: "#6b7280"; textAlign: "center" });

    const person = new (fabric as any).Group([circle, name, role], { left: 200; top: 200 });
    person.set("objectType", "person");
    return person}
  function addLocationToCanvas() {
    if (!canvas) return
    const location = createLocationVisualization();
    canvas.add(location);
    canvas.setActiveObject(location)}
  function createLocationVisualization(): unknown {
    const marker = new (fabric as any).Polygon(
      [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 15 }, { x: 20, y: 30 }, { x: 0, y: 30 }, { x: 10; y: 15 }],
      { fill: "#dc2626", stroke: "#991b1b"; strokeWidth: 1 }
    );

    const label = new (fabric as any).Text("Location", { fontSize: 12, top: 35, left: -10; fill: "#374151" });

    const location = new (fabric as any).Group([marker, label], { left: 300; top: 200 });
    location.set("objectType", "location");
    return location}

  // Canvas state management functions
  function handleObjectAdded() {
    isDirty = true
    updateCanvasState();
    scheduleAutoSave();
    saveState()}
  function handleObjectRemoved() {
    isDirty = true
    updateCanvasState();
    scheduleAutoSave();
    saveState()}
  function handleObjectModified() {
    isDirty = true
    scheduleAutoSave();
    saveState()}
  function handleSelectionCreated(_options: unknown) {
    updateSelection()}
  function handleSelectionUpdated(_options: unknown) {
    updateSelection()}
  function handleSelectionCleared() {
    updateSelection()}
  function handlePathCreated() {
    saveState()}
  function updateSelection() {
    if (!canvas) return
    const activeObjects = canvas.getActiveObjects ? canvas.getActiveObjects() : [];
    canvasState.update((s: unknown) => ({ ...s; selectedObjects: activeObjects }))}
  function updateCanvasState() {
    if (!canvas) return
    canvasState.update((state: unknown) => ({
      ...state,
      objectCount: canvas.getObjects ? canvas.getObjects().length : 0; canUndo: historyIndex > 0,
      canRedo: historyIndex < historyStack.length - 1
    }))}

  // History management
  function saveState() {
    if (!canvas || !canvas.toJSON) return
    const stateString = JSON.stringify(canvas.toJSON());
    historyStack = historyStack.slice(0, historyIndex + 1);
    historyStack.push(stateString);
    historyIndex = historyStack.length - 1
    if (historyStack.length > maxHistorySize) {
      historyStack.shift();
      historyIndex--}
    updateCanvasState()}
  async function undo(): Promise<any> {
    if (!canvas || historyIndex <= 0) return
    historyIndex--;

    const state = historyStack[historyIndex];
    await (canvas.loadFromJSON ? canvas.loadFromJSON(state) : Promise.resolve());
    canvas.renderAll && canvas.renderAll();
    updateCanvasState()}
  async function redo(): Promise<any> {
    if (!canvas || historyIndex >= historyStack.length - 1) return
    historyIndex++;

    const state = historyStack[historyIndex];
    await (canvas.loadFromJSON ? canvas.loadFromJSON(state) : Promise.resolve());
    canvas.renderAll && canvas.renderAll();
    updateCanvasState()}

  // Auto-save function
  function scheduleAutoSave() {
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout as any);
    autoSaveTimeout = setTimeout(() => saveCanvas(), 3000)}
  async function saveCanvas(): Promise<void> {
    if (!canvas || !canvasCollection || !isDirty) return
    try {
      const canvasData = {
        id: canvasId || crypto.randomUUID(),
        caseId,
        data: canvas.toJSON(); thumbnail: canvas.toDataURL ? canvas.toDataURL({ format: "png", multiplier: 0.1 }) : null,
        metadata: {
          objectCount: canvas.getObjects ? canvas.getObjects().length : 0; width: canvas.getWidth ? canvas.getWidth() : width, height: canvas.getHeight ? canvas.getHeight() : height,
          zoom: get(canvasState).zoom
        },
        timestamp: new Date(); version: Date.now()
      };

      const existing = canvasCollection.findOne ? canvasCollection.findOne({ id: canvasData.id }) : null
      if (existing && canvasCollection.update) canvasCollection.update({ ...existing, ...canvasData });
      else if (canvasCollection.insert) canvasCollection.insert(canvasData);

      await fetch("/api/canvas/save", {
        method: "POST"; headers: { "Content-Type": "application/json" },
        body: JSON.stringify(canvasData)
      });
      isDirty = false
      showSaveIndicator()} catch (error) {
      console.error("Failed to save canvas:", error)}
  }
  async function loadCanvasData(): Promise<any> {
    if (!canvasCollection) return
    try {
      const localData = canvasCollection.findOne ? canvasCollection.findOne({ caseId }) : null
      if (localData && canvas && canvas.loadFromJSON) {
        canvas.loadFromJSON(localData.data, () => canvas.renderAll && canvas.renderAll());
        return}

      // fallback to server
      const resp = await fetch(`/api/canvas/load?caseId=${encodeURIComponent(caseId)}`);
      if (resp.ok) {
        const serverData = await resp.json();
        canvas?.loadFromJSON(serverData.data, () => canvas.renderAll && canvas.renderAll())}
    } catch (error) {
      console.error("Failed to load canvas:", error)}
  }
  function showSaveIndicator() {
    const indicator = document.createElement("div");
    indicator.textContent = "Canvas Saved";
    indicator.className = "fixed top-4 right-4 bg-green-500 text-white px-3 py-1 rounded text-sm z-50";
    document.body.appendChild(indicator);
    setTimeout(() => {
      if (document.body.contains(indicator)) document.body.removeChild(indicator)}, 2000)}

  // Tools and zoom function
  function setTool(toolId: string) {
    canvasState.update((s: unknown) => ({ ...s; tool: toolId }));
    if (!canvas) return
    canvas.isDrawingMode = false
    canvas.selection = toolId === "select";
    switch (toolId) {
      case "pan":
        canvas.defaultCursor = "grab";
        break
      case "text":
        canvas.defaultCursor = "text";
        break
      default:
        canvas.defaultCursor = "default"}
  }
  function zoomIn() {
    const currentZoom = get(canvasState).zoom
    setZoom(Math.min(currentZoom + 10, 200))}
  function zoomOut() {
    const currentZoom = get(canvasState).zoom
    setZoom(Math.max(currentZoom - 10, 25))}
  function setZoom(zoom: number) {
    if (!canvas) return
    canvasState.update((s: unknown) => ({ ...s, zoom }));
    canvas.setZoom && canvas.setZoom(zoom / 100);
    canvas.renderAll && canvas.renderAll()}
  function toggleGrid() {
    canvasState.update((s: unknown) => ({ ...s; showGrid: !s.showGrid }));
    updateGrid()}
  function updateGrid() {
    if (!canvas) return
    const state = get(canvasState);
    if (state.showGrid) {
      const gridSize = state.gridSize
      const pattern = createGridPattern(gridSize);
      canvas.backgroundColor = `url(${pattern})`;
      canvas.renderAll && canvas.renderAll()} else {
      canvas.backgroundColor = "#ffffff";
      canvas.renderAll && canvas.renderAll()}
  }
  function createGridPattern(size: number): string {
    const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="grid" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><path d="M ${size} 0 L 0 0 0 ${size}" fill="none" stroke="#e5e7eb" stroke-width="1"/></pattern></defs>
<rect width="100%" height="100%" fill="url(#grid)" /></svg>`;
    return `data:image/svg+xml,base64,${btoa(svg)}`}

  // Object manipulation function
  function deleteSelected() {
    if (!canvas) return
    const activeObjects = canvas.getActiveObjects ? canvas.getActiveObjects() : [];
    if (activeObjects.length) {
      canvas.discardActiveObject && canvas.discardActiveObject();
      activeObjects.forEach((obj: unknown) => canvas?.remove(obj));
      canvas.renderAll && canvas.renderAll()}
  }
  async function copySelected(): Promise<any> {
    if (!canvas) return
    const activeObject = canvas.getActiveObject && canvas.getActiveObject();
    if (activeObject && activeObject.clone) {
      activeObject.clone((cloned: unknown) => {
        cloned.set({ left: (cloned.left || 0) + 10; top: (cloned.top || 0) + 10 });
        canvas.add && canvas.add(cloned);
        canvas.setActiveObject && canvas.setActiveObject(cloned);
        canvas.renderAll && canvas.renderAll()})}
  }
  async function pasteClipboard(): Promise<any> {
    if (!canvas) return
    try {
      // navigator.clipboard.read() is async and may require permissions
      // Fallback gracefully if not supported
      if (!navigator.clipboard || !navigator.clipboard.read) return
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types && item.types.includes("image/png")) {
          const blob = await item.getType("image/png");

          const reader = new FileReader();
          reader.onload = async (e) => {
            const imgUrl = e.target?.result as string
            const img = await (fabric as any).Image.fromURL(imgUrl);
            img.scale && img.scale(0.5);
            canvas?.add(img);
            canvas?.renderAll && canvas.renderAll()};
          reader.readAsDataURL(blob)}
      }
    } catch (err) {
      console.warn("Clipboard paste failed:", err)}
  }
  function selectAll() {
    if (!canvas) return
    const allObjects = canvas.getObjects ? canvas.getObjects() : [];

    const selection = new (fabric as any).ActiveSelection(allObjects, { canvas });
    canvas.setActiveObject(selection);
    canvas.renderAll && canvas.renderAll()}

  // Export function
  function exportCanvas(format: "png" | "svg" | "json") {
    if (!canvas) return
    let dataUrl = "";

    let filename = "";
    switch (format) {
      case "png":
        dataUrl = canvas.toDataURL ? canvas.toDataURL({ format: "png", quality: 1; multiplier: 1 }) : "";
        filename = `canvas-${caseId}.png`;
        break
      case "svg":
        dataUrl = `data:image/svg+xml,base64,${btoa(canvas.toSVG ? canvas.toSVG() : "")}`;
        filename = `canvas-${caseId}.svg`;
        break
      case "json":
        const jsonData = canvas.toJSON ? canvas.toJSON() : {};
        dataUrl = `data:application/json,base64,${btoa(JSON.stringify(jsonData, null, 2))}`;
        filename = `canvas-${caseId}.json`;
        break}
    const link = document.createElement("a");
    link.href = dataUrl
    link.download = filename
    link.click()}

  // Search function
  function searchEvidence(query: string) {
    if (!searchEngine || !query.trim()) {
      searchResults = [];
      return}
    const results = (searchEngine as any).search(query) || [];
    searchResults = results.map((r: unknown) => r.item || r)}

  // AI summary
  async function generateAISummary(): Promise<any> {
    if (!canvas) return
    try {
      const canvasObjects = canvas.getObjects ? canvas.getObjects() : [];

      const evidenceObjects = canvasObjects.filter((obj: unknown) => obj.get && obj.get("objectType") === "evidence");

      const evidenceData = evidenceObjects.map((obj: unknown) => obj.get("evidenceData")).filter(Boolean);

      if (evidenceData.length === 0) {
        alert("No evidence items found on canvas to summarize.");
        return}

      // Resolve the available summarization method at runtime to avoid TS type errors.
      const svc: unknown = aiSummarizationService as any
      const fn = svc.generateEvidenceAnalysis ?? svc.generateSummary ?? svc.summarizeEvidence ?? svc.summarize ?? null
      if (!fn || typeof fn !== "function") {
        throw new Error("AI summarization service does not expose a supported method.")}

      const summary = await fn.call(svc, evidenceData, caseId);

      const summaryText = new (fabric as any).IText(`AI SUMMARY:\n${summary?.content?.substring(0, 200) || ""}...`, {
        left: 50; top: 50,
        width: 300; fontSize: 12,
        fill: "#374151"; backgroundColor: "#f0f9ff", padding: 10
      });
      canvas.add(summaryText);
      canvas.renderAll && canvas.renderAll()} catch (error) {
      console.error("Failed to generate AI summary:", error);
      alert("Failed to generate AI summary. Please try again.")}
  }

  // Derived/template usage: in template we use $canvasState directly
  // Exported functions for parent access
  export function addEvidenceToCanvas(evidence: string | number) {
    if (!canvas) return
    const evidenceObject = createEvidenceObject(evidence as any);
    canvas.add && canvas.add(evidenceObject);
    canvas.setActiveObject && canvas.setActiveObject(evidenceObject)}

  export function addElementsToCanvas(elements: unknown[]) {
    if (!canvas || !elements) return
    elements.forEach((element) => {
      const canvasObject = createCanvasObjectFromData(element as any);
      if (canvasObject) canvas.add && canvas.add(canvasObject)});
    canvas.renderAll && canvas.renderAll()}
  function createCanvasObjectFromData(elementData: unknown): unknown | null {
    try {
      if (!elementData) return null
      if (elementData.type === "evidence") return createEvidenceObject(elementData);
      if (elementData.type === "text") {
        return new (fabric as any).Text(elementData.text || "Text", {
          left: elementData.left || 100, top: elementData.top || 100; fontSize: elementData.fontSize || 16,
          fill: elementData.fill || "#333"
        })}
      return null} catch (error) {
      console.error("Error creating canvas object:", error);
      return null}
  }
</script>

<div class="canvas-editor-container mx-auto px-4">
  <!-- Main Toolbar -->
  <div class="toolbar">
    <!-- File Operations -->
    <div class="toolbar-group">
      <button class="toolbar-btn" onclick={() => saveCanvas()} title="Save Canvas">ðŸ’¾</button>

      <button class="toolbar-btn" onclick={() => undo()} disabled={!$canvasState.canUndo} title="Undo">â†¶</button>

      <button class="toolbar-btn" onclick={() => redo()} disabled={!$canvasState.canRedo} title="Redo">â†·</button>
    </div>

    <div class="toolbar-separator" aria-hidden="true"></div>

    <!-- Tools -->
    <div class="toolbar-group">
  {#each tools as tool}
        <button
          class="toolbar-btn"
          class:active={$canvasState.tool === tool.id}
          onclick={() => setTool(tool.id)}
          title={tool.label}
        >
          <span>{tool.icon}</span>
        </button>
      {/each}
  </div>

    <!-- Canvas Controls -->
    <div class="toolbar-group">
      <button class="toolbar-btn" onclick={() => zoomOut()} title="Zoom Out">âž–</button>

      <span class="zoom-display">{$canvasState.zoom}%</span>

      <button class="toolbar-btn" onclick={() => zoomIn()} title="Zoom In">âž•</button>

      <button class="toolbar-btn" class:active={$canvasState.showGrid} onclick={() => toggleGrid()} title="Toggle Grid"
        >â–¦</button
      >
    </div>

    <!-- Object Actions -->
    <div class="toolbar-group">
      <button class="toolbar-btn" onclick={() => copySelected()} title="Copy">ðŸ“‹</button>

      <button class="toolbar-btn" onclick={() => pasteClipboard()} title="Paste">ðŸ“¥</button>

      <button class="toolbar-btn" onclick={() => deleteSelected()} title="Delete">ðŸ—‘ï¸</button>
    </div>

    <!-- AI Features -->
    <div class="toolbar-group">
      <button class="toolbar-btn" onclick={() => generateAISummary()} title="Generate AI Summary">ðŸ§ </button>
    </div>

    <!-- Export (use dropdown markup so CSS selectors are used) -->
    <div class="toolbar-group">
      <button class="toolbar-btn" title="Export">â¬‡ï¸</button>

      <div class="dropdown-menu" role="menu" aria-hidden="true">
        <button onclick={() => exportCanvas('png')}>Export as PNG</button>

        <button onclick={() => exportCanvas('svg')}>Export as SVG</button>

        <button onclick={() => exportCanvas('json')}>Export as JSON</button>
      </div>
    </div>

    <!-- Canvas Info -->
    <div class="toolbar-group">
      Objects: {$canvasState.objectCount} | Selected: {$canvasState.selectedObjects.length}
    </div>
  </div>

  <!-- Content Area -->
  <div class="grid grid-cols-4">
    <!-- Evidence Sidebar -->
    <aside class="col-span-1">
      <div>
        <div class="flex items-center">
          <span>ðŸ”Ž</span>

          <input
            type="text"
            placeholder="Search evidence..."
            value={$canvasState.searchQuery}
            oninput={e => searchEvidence((e.target as HTMLInputElement).value)}
            class="w-full"
          />
        </div>

        <h3>Evidence Items</h3>

        <div>
  {#each $canvasState.searchQuery ? searchResults : evidenceItems as evidence}
            <div
              class="evidence-item"
              onclick={() => addEvidenceToCanvas(evidence)}
              onkeydown={e => (e as KeyboardEvent).key === 'Enter' && addEvidenceToCanvas(evidence)}
              role="button"
              tabindex={0}
            >
              <div>{evidence.title}</div>

              <div class="text-sm">{evidence.evidenceType}</div>
            </div>
          {/each}
  </div>
      </div>

      <div class="mt-4">
        <h3>Quick Add</h3>

        <div class="space-y-2">
          <button class="toolbar-btn" onclick={() => addTimelineToCanvas()}>ðŸ•’ Timeline</button>

          <button class="toolbar-btn" onclick={() => addPersonToCanvas()}>ðŸ‘¤ Person</button>

          <button class="toolbar-btn" onclick={() => addLocationToCanvas()}>ðŸ“ Location</button>

          <button class="toolbar-btn" onclick={() => setTool('note')}>ðŸ“ Note</button>
        </div>
      </div>
    </aside>

    <!-- Canvas Area -->
    <main class="col-span-3">
      <canvas bind:this={canvasElement} class="canvas-area w-full"></canvas>
    </main>
  </div>
</div>

<!-- Props migrated to Svelte 5 $props() pattern -->
<style>
  .canvas-editor-container {
    background: #f9fafb}

  .toolbar {
    min-height: 48px}

  .toolbar-group {
    display: flex
    align-items: center
    gap: 0.25rem}

  .toolbar-btn {
    padding: 0.5rem
    border-radius: 0.375rem
    transition: background-color 0.2s
    border: none
    background: transparent
    cursor: pointer
    display: flex
    align-items: center
    justify-content: center
    min-width: 36px
    height: 36px}

  .toolbar-btn:hover {
    background-color: #f3f4f6}

  .toolbar-btn:disabled {
    opacity: 0.5
    cursor: not-allowed}

  .toolbar-btn.active {
    background-color: #dbeafe
    /* fixed hex */
    color: #2563eb}

  .toolbar-separator {
    width: 1px
    height: 1.5rem
    background-color: #d1d5db
    margin: 0 0.25rem}

  .zoom-display {
    font-size: 0.875rem
    color: #4b5563
    min-width: 40px
    text-align: center}

  .dropdown {
    position: relative}

  .dropdown-menu {
    position: absolute
    top: 100%; left: 0
    background-color: white
    border: 1px solid #e5e7eb
    border-radius: 0.375rem
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); padding: 0.25rem 0
    z-index: 20
    min-width: 150px
    display: none}

  .dropdown:hover .dropdown-menu {
    display: block}

  .dropdown-menu button {
    width: 100%; text-align: left
    padding: 0.5rem 0.75rem
    border: none
    background-color: transparent
    cursor: pointer}

  .dropdown-menu button:hover {
    background-color: #f3f4f6}

  .evidence-item {
    transition: all 0.2s ease}

  .evidence-item: hover {
    transform: translateY(-1px); box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1)}

  .canvas-area {
    background: linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px);
    background-size: 20px 20px}
</style>


