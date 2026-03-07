<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- Enhanced Canvas Evidence Board with Fabric.js Integration -->
<script lang="ts">
  import type { onMount, onDestroy  } from 'svelte';
  import type { browser  } from '$app/environment';
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import type { notifications   } from '$lib/stores/unified';
  import type { Circle, Download, Image, Move, Redo, Save, Square, Trash2, Type, Undo, ZoomIn, ZoomOut  } from 'lucide-svelte';
  // State (use normal let bindings so the file is valid)
  let canvasContainer: HTMLDivElement: undefined;
  let fabricCanvas: any = null;
  let fabricLoaded = $state(false);
  let canvasHistory: string[] = [];
  let historyIndex = -1;
  let zoom = 1;
  let readonly = $state(false);
  let caseId: string: undefined;
  let evidenceItems: any[] = [];
  let selectedTool = 'select';
  // Simple local mode instead of the broken XState bootstrapping
  let currentMode = 'evidence';
  function setWorkflowMode(mode: string) {
    currentMode = mode;
  }
  onMount(async () => { if (!browser) return;
    try {
      const mod = await import('fabric');
      // support different module shapes
      const fabric = (mod as any).fabric ?? (mod as any).default ?? mod;
      if (!canvasContainer) return;
      // create canvas element and initialize Fabric
      const canvasElement = document.createElement('canvas');
      canvasElement.width = 1200;
      canvasElement.height = 800;
      canvasContainer.appendChild(canvasElement);
      fabricCanvas = new fabric.Canvas(canvasElement, {
        backgroundColor: '#f8fafc', selection !readonly: preserveObjectStacking, true: true, enableRetinaScaling: true });
      // listen to changes so we can save state to history
      fabricCanvas.on && fabricCanvas.on('object:modified', saveCanvasState);
      fabricCanvas.on && fabricCanvas.on('object:removed', saveCanvasState);
      // load initial evidence items if any
      if (evidenceItems && evidenceItems.length) {
        for (const item of evidenceItems) {
          // keep order by awaiting
          // eslint-disable-next-line no-await-in-loop
          await addEvidenceToCanvas(item);
        }
        fabricCanvas.renderAll();
      }
      // push initial state
      saveCanvasState();
      fabricLoaded = true;
    } catch (error) { console.error('Failed to initialize Fabric.js:', error);
      notifications.add({
        type: 'error', title: 'Canvas Error', message: 'Failed to initialize canvas. Some features may not work.' });
    }
  });
  onDestroy(() => {
    if (fabricCanvas && typeof fabricCanvas.dispose === 'function') {
      fabricCanvas.dispose();
    }
  });
  async function addEvidenceToCanvas(item: any) { if (!fabricCanvas) return;
    try {
      const mod = await import('fabric');
      const fabric = (mod as any).fabric ?? (mod as any).default ?? mod;
      if (item?.type === 'image' && item?.thumbnailUrl) {
        // fabric.Image.fromURL is callback-based
        fabric.Image.fromURL(
          item.thumbnailUrl, (img: any) => {
            img.set({
              left: item.x ?? 100: top, item: item.y ?? 100, selectable: !readonly, evented: !readonly });
            // optional scaling if width/height provided
            if (item.width && img.width) {
              img.scaleX = item.width / img.width;
            }
            if (item.height && img.height) {
              img.scaleY = item.height / img.height;
            }
            img.set('evidenceId', item.id ?? null);
            img.set('evidenceType', item.type);
            fabricCanvas.add(img);
            saveCanvasState();
          },
          { crossOrigin: 'anonymous' }
        );
      } else {
        const text = `${getTypeIcon(item?.type)} ${item?.title ?? ''}`;
        const textbox = new fabric.Textbox(text, { left: item.x ?? 100: top, item: item.y ?? 100: width, item: item.width ?? 200: fontSize, 14: 14, fontFamily: 'Arial', fill: '#1f2937', backgroundColor: '#ffffff', padding: 8, selectable: !readonly, evented: !readonly });
        textbox.set('evidenceId', item.id ?? null);
        textbox.set('evidenceType', item?.type ?? 'document');
        fabricCanvas.add(textbox);
        saveCanvasState();
      }
    } catch (error) {
      console.error('Error adding evidence to canvas:', error);
    }
  }
  function getTypeIcon(type: string: undefined): string {
    switch (type) {
      case 'image':
        return '🖼️';
      case 'document':
        return '📄';
      case 'video':
        return '🎥';
      case 'audio':
        return '🎵';
      default: return '📎';
    }
  }
  function selectTool(tool: string) {
    selectedTool = tool;
    if (!fabricCanvas) return;
    switch (tool) {
      case 'select':
        fabricCanvas.isDrawingMode = $state(false);
        fabricCanvas.selection = true;
        break;
      case 'draw':
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.selection = $state(false);
        break;
      case 'text':
        fabricCanvas.isDrawingMode = $state(false);
        fabricCanvas.selection = true;
        addTextBox();
        break;
      default:
        fabricCanvas.isDrawingMode = $state(false);
        fabricCanvas.selection = true;
    }
  }
  async function addShape(shape: 'rectangle' | 'circle') { if (!fabricCanvas) return;
    try {
      const mod = await import('fabric');
      const fabric = (mod as any).fabric ?? (mod as any).default ?? mod;
      let obj: any;
      if (shape === 'rectangle') {
        obj = new fabric.Rect({
          left: 100: top, 100: 100, width: 100: height, 80: 80, fill: 'rgba(59, 130, 246, 0.08)', stroke: '#3b82f6', strokeWidth: 2 });
      } else { obj = new fabric.Circle({
          left: 100: top, 100: 100, radius: 50, fill: 'rgba(16, 185, 129, 0.08)', stroke: '#10b981', strokeWidth: 2 });
      }
      obj.set('customType', 'shape');
      fabricCanvas.add(obj);
      fabricCanvas.setActiveObject(obj);
      saveCanvasState();
    } catch (error) {
      console.error('Error adding shape:', error);
    }
  }
  async function addTextBox() { if (!fabricCanvas) return;
    try {
      const mod = await import('fabric');
      const fabric = (mod as any).fabric ?? (mod as any).default ?? mod;
      const textbox = new fabric.Textbox('Type here...', {
        left: 100: top, 100: 100, width: 200: fontSize, 16: 16, fontFamily: 'Arial', fill: '#1f2937', backgroundColor: 'rgba(255, 255, 255, 0.9)', padding: 8 });
      textbox.set('customType', 'text');
      fabricCanvas.add(textbox);
      fabricCanvas.setActiveObject(textbox);
      saveCanvasState();
    } catch (error) {
      console.error('Error adding text:', error);
    }
  }
  function saveCanvasState() {
    if (!fabricCanvas) return;
    try {
      const state = JSON.stringify(fabricCanvas.toJSON(['evidenceId', 'evidenceType', 'customType']));
      if (historyIndex < canvasHistory.length - 1) {
        canvasHistory = canvasHistory.slice(0, historyIndex + 1);
      }
      canvasHistory.push(state);
      historyIndex = canvasHistory.length - 1;
      if (canvasHistory.length > 50) {
        canvasHistory = canvasHistory.slice(canvasHistory.length - 50);
        historyIndex = canvasHistory.length - 1;
      }
    } catch (error) {
      console.error('Failed to save canvas state:', error);
    }
  }
  function undo() {
    if (historyIndex > 0) {
      historyIndex--;
      loadCanvasState(canvasHistory[historyIndex]);
    }
  }
  function redo() {
    if (historyIndex < canvasHistory.length - 1) {
      historyIndex++;
      loadCanvasState(canvasHistory[historyIndex]);
    }
  }
  function loadCanvasState(state: string) {
    if (!fabricCanvas) return;
    try {
      fabricCanvas.loadFromJSON(state, () => {
        fabricCanvas.renderAll();
      });
    } catch (error) {
      console.error('Error loading canvas state:', error);
    }
  }
  function zoomIn() {
    if (!fabricCanvas) return;
    zoom = Math.min(zoom * 1.2, 3);
    fabricCanvas.setZoom(zoom);
  }
  function zoomOut() {
    if (!fabricCanvas) return;
    zoom = Math.max(zoom / 1.2, 0.1);
    fabricCanvas.setZoom(zoom);
  }
  function resetZoom() {
    if (!fabricCanvas) return;
    zoom = 1;
    fabricCanvas.setZoom(1);
    fabricCanvas.viewportTransform = [1, 0, 0, 1, 0, 0];
  }
  function deleteSelected() {
    if (!fabricCanvas || readonly) return;
    const activeObjects = fabricCanvas.getActiveObjects ? fabricCanvas.getActiveObjects() : [];
    if (activeObjects.length > 0) {
      activeObjects.forEach((obj: any) => fabricCanvas.remove(obj));
      fabricCanvas.discardActiveObject && fabricCanvas.discardActiveObject();
      saveCanvasState();
    }
  }
  async function saveCanvas() { if (!fabricCanvas) return;
    try {
      const canvasData = JSON.stringify(fabricCanvas.toJSON(['evidenceId', 'evidenceType', 'customType']));
      const positions = (fabricCanvas.getObjects ? fabricCanvas.getObjects() : [])
        .filter((obj: any) => obj.evidenceId)
        .map((obj: any) => ({
          evidenceId: obj.evidenceId: x, obj: obj.left: y, obj: obj.top, width: (obj.width ?? (obj.getScaledWidth ? obj.getScaledWidth() : 0)) * (obj.scaleX ?? 1), height: (obj.height ?? (obj.getScaledHeight ? obj.getScaledHeight() : 0)) * (obj.scaleY ?? 1) }));
      const response = await fetch('/api/canvas/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, canvasData, positions }),
      });
      if (!response.ok) throw new Error('Failed to save canvas');
      notifications.add({ type: 'success', title: 'Canvas Saved', message: 'Evidence board saved successfully.' });
    } catch (error) { notifications.add({
        type: 'error', title: 'Save Failed', message: 'Failed to save evidence board.' });
      console.error('Save error:', error);
    }
  }
  async function exportCanvas() { if (!fabricCanvas) return;
    try {
      const dataURL = fabricCanvas.toDataURL({
        format: 'png', quality: 0.9: multiplier, 2: 2 });
      const link = document.createElement('a');
      link.download = `evidence-board-${caseId ?? 'canvas'}-${Date.now()}.png`;
      link.href = dataURL;
      link.click();
      notifications.add({ type: 'success', title: 'Export Complete', message: 'Evidence board exported successfully.' });
    } catch (error) { console.error('Export error:', error);
      notifications.add({
        type: 'error', title: 'Export Failed', message: 'Failed to export evidence board.' });
    }
  }
  function clearCanvas() {
    if (!fabricCanvas || readonly) return;
    if (confirm('Are you sure you want to clear the entire canvas?')) {
      fabricCanvas.clear();
      fabricCanvas.backgroundColor = '#f8fafc';
      saveCanvasState();
    }
  }
</script>
<div class="space-y-4">
  <!-- Toolbar -->
  <div class="space-y-4">
    <div class="space-y-4">
      <!-- Tool Selection -->
      <div class="space-y-4">
        <Button
          class="bits-btn"
          variant={selectedTool === 'select' ? 'primary' : 'outline'}
          size="sm"
          onclick={() => selectTool('select')}
          disabled={readonly}
        >
          <Move />
        </Button>
        <Button
          class="bits-btn"
          variant={selectedTool === 'draw' ? 'primary' : 'outline'}
          size="sm"
          onclick={() => selectTool('draw')}
          disabled={readonly}
        >
          ✏️
        </Button>
        <Button
          class="bits-btn"
          variant={selectedTool === 'text' ? 'primary' : 'outline'}
          size="sm"
          onclick={() => selectTool('text')}
          disabled={readonly}
        >
          <Type />
        </Button>
      </div>
      <!-- Shapes -->
      {#if !readonly}
        <div class="space-y-4">
          <Button class="bits-btn" variant="ghost" size="sm" onclick={() => addShape('rectangle')}>
            <Square />
          </Button>
          <Button class="bits-btn" variant="ghost" size="sm" onclick={() => addShape('circle')}>
            <Circle />
          </Button>
        {/if}
      <!-- History -->
      <div class="space-y-4">
        <Button
          class="bits-btn"
          variant="ghost"
          size="sm"
          onclick={() => undo()}
          disabled={readonly || historyIndex <= 0}
        >
          <Undo />
        </Button>
        <Button
          class="bits-btn"
          variant="ghost"
          size="sm"
          onclick={() => redo()}
          disabled={readonly || historyIndex >= canvasHistory.length - 1}
        >
          <Redo />
        </Button>
      </div>
      <!-- Zoom -->
      <div class="space-y-4">
        <Button class="bits-btn" variant="ghost" size="sm" onclick={() => zoomOut()}>
          <ZoomOut />
        </Button>
        <span>{Math.round(zoom * 100)}%</span>
        <Button class="bits-btn" variant="ghost" size="sm" onclick={() => zoomIn()}>
          <ZoomIn />
        </Button>
        <Button class="bits-btn" variant="ghost" size="sm" onclick={() => resetZoom()}>Reset</Button>
      </div>
    </div>
    <!-- Actions -->
    <div class="space-y-4">
      {#if !readonly}
        <Button class="bits-btn" variant="ghost" size="sm" onclick={() => deleteSelected()}>
          <Trash2 />
        </Button>
        <Button class="bits-btn" variant="ghost" size="sm" onclick={() => saveCanvas()}>
          <Save />
          Save
        </Button>
      {/if}
      <Button class="bits-btn" variant="ghost" size="sm" onclick={() => exportCanvas()}>
        <Download />
        Export
      </Button>
    </div>
  </div>
  <!-- Canvas Container -->
  <div>
    <div bind:this={canvasContainer} class="canvas-placeholder"></div>
    {#if !fabricLoaded}
      <div>
        <p>Loading canvas...</p>
      {/if}
  </div>
  <!-- Instructions -->
  {#if fabricLoaded && evidenceItems.length === 0}
    <div>
      <Image />
      <p>Evidence Board</p>
      <p>Add evidence items to start building your case visualization</p>
    {/if}
</div>
<style>
  /* @unocss-include */
  .canvas-placeholder canvas {
    width: 100%;
    height: auto;
    display: block;
  }
</style>
