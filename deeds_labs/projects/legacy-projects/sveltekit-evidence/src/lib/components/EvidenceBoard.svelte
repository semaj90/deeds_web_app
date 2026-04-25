<!--
EvidenceBoard.svelte - Main evidence board component with Fabric.js canvas
Provides drag-drop positioning, zoom, selection, and object management
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    boardObjects,
    selectedObjects,
    canvasSize,
    zoomLevel,
    boardActions
  } from '$lib/stores/boardStore';
  import type { BoardObject, Evidence } from '$lib/types';

  // Note: fabric module types will be resolved at runtime via dynamic import
  // This avoids TypeScript compilation errors in environments without @types/fabric

  // Svelte 5 props
  interface Props {
    caseId: string;
    readonly?: boolean;
  }

  let { caseId, readonly = false }: Props = $props();

  // Component state using Svelte 5 runes
  let canvas = $state<any>(null);
  let canvasElement = $state<HTMLCanvasElement>();
  let fabric = $state<any>(null);
  let fabricObjects = $state(new Map<string, any>());
  let isInitialized = $state(false);

  // Initialize Fabric.js dynamically to avoid static import/type errors
  onMount(async () => {
    try {
      // @ts-ignore - dynamic import may not have ambient type declarations in this workspace
      const mod = await import('fabric');
      fabric = (mod as any).fabric || (mod as any).default || mod;
    } catch (err) {
      // If fabric isn't installed in the environment, fail gracefully in dev
      console.warn('fabric module not available:', err);
      fabric = undefined;
    }

    initializeCanvas();
    loadBoardState();

    window.addEventListener('keydown', handleKeyDown);
  });

  onDestroy(() => {
    if (canvas && typeof canvas.dispose === 'function') {
      canvas.dispose();
    }
    window.removeEventListener('keydown', handleKeyDown);
  });

  function initializeCanvas() {
    if (!fabric) {
      // fabric not loaded; nothing to initialize
      return;
    }

    canvas = new fabric.Canvas(canvasElement, {
      width: $canvasSize.width,
      height: $canvasSize.height,
      backgroundColor: '#212529',
      selection: !readonly,
      interactive: !readonly
    });

    // Canvas event listeners
    canvas.on('object:moving', handleObjectMove);
    canvas.on('object:scaling', handleObjectScale);
    canvas.on('object:rotating', handleObjectRotate);
    canvas.on('selection:created', handleSelectionChange);
    canvas.on('selection:updated', handleSelectionChange);
    canvas.on('selection:cleared', () => selectedObjects.set([]));
    canvas.on('mouse:wheel', handleZoom);

    isInitialized = true;
  }

  function loadBoardState() {
    boardActions.loadBoard(caseId);
  }

  // Handle object movement
  function handleObjectMove(e: any) {
    const obj = e.target as (any & {
      data?: BoardObject;
      left?: number;
      top?: number;
    }) | null;
    if (obj && obj.data) {
      const boardObj = obj.data as BoardObject;
      boardActions.updateObject(boardObj.id, {
        position: { x: obj.left ?? 0, y: obj.top ?? 0 }
      });
    }
  }

  // Handle object scaling
  function handleObjectScale(e: any) {
    const obj = e.target as (any & {
      data?: BoardObject;
      width?: number;
      height?: number;
      scaleX?: number;
      scaleY?: number;
    }) | null;
    if (obj && obj.data) {
      const boardObj = obj.data as BoardObject;
      boardActions.updateObject(boardObj.id, {
        size: {
          width: (obj.width ?? 0) * (obj.scaleX ?? 1),
          height: (obj.height ?? 0) * (obj.scaleY ?? 1)
        }
      });
    }
  }

  // Handle object rotation
  function handleObjectRotate(e: any) {
    const obj = e.target as (any & {
      data?: BoardObject;
      angle?: number;
    }) | null;
    if (obj && obj.data) {
      const boardObj = obj.data as BoardObject;
      boardActions.updateObject(boardObj.id, {
        metadata: {
          ...boardObj.metadata,
          rotation: obj.angle ?? 0
        }
      });
    }
  }

  // Handle selection changes
  function handleSelectionChange() {
    if (!canvas) return;
    const activeObjects = canvas.getActiveObjects();
    const selectedIds = activeObjects
      .map((obj: any) => (obj.data as BoardObject)?.id)
      .filter(Boolean);
    selectedObjects.set(selectedIds);
  }

  // Handle mouse wheel zoom
  function handleZoom(opt: any) {
    if (!canvas) return;
    const delta = (opt.e as WheelEvent).deltaY;
    let zoom = canvas.getZoom();
    zoom *= 0.999 ** delta;

    if (zoom > 20) zoom = 20;
    if (zoom < 0.01) zoom = 0.01;

    canvas.zoomToPoint({ x: (opt.e as MouseEvent).offsetX, y: (opt.e as MouseEvent).offsetY }, zoom);
    zoomLevel.set(zoom);

    opt.e.preventDefault();
    opt.e.stopPropagation();
  }

  // React to board objects changes using Svelte 5 $effect
  $effect(() => {
    if (isInitialized && $boardObjects) {
      updateCanvasObjects($boardObjects);
    }
  });

  // React to canvas size changes using Svelte 5 $effect
  $effect(() => {
    if (canvas && $canvasSize) {
      canvas.setDimensions({ width: $canvasSize.width, height: $canvasSize.height });
    }
  });

  // Update canvas objects based on store
  function updateCanvasObjects(objects: BoardObject[]) {
    if (!canvas) return;

    // Clear canvas
    canvas.clear();
    fabricObjects.clear();

    // Add objects to canvas
    objects.forEach(obj => {
      createFabricObject(obj);
    });

    // Render canvas
    canvas.renderAll();
  }

  // Create Fabric.js object from BoardObject
  function createFabricObject(boardObj: BoardObject) {
    if (!fabric || !canvas) return;
    let fabricObj: any;

    switch (boardObj.type) {
      case 'image':
        if (boardObj.url) {
          fabric.Image.fromURL(boardObj.url, (img: any) => {
            img.set({
              left: boardObj.position.x,
              top: boardObj.position.y,
              selectable: !readonly,
              hasControls: !readonly,
              hasBorders: !readonly
            });
            img.data = boardObj;

            if (boardObj.size) {
              img.scaleToWidth(boardObj.size.width);
            }

            canvas.add(img);
            fabricObjects.set(boardObj.id, img);
          }, { crossOrigin: 'anonymous' });
        }
        break;

      case 'text':
        fabricObj = new fabric.Textbox(boardObj.content || '', {
          left: boardObj.position.x,
          top: boardObj.position.y,
          width: boardObj.size?.width || 300,
          fontSize: 16,
          fill: '#ffffff',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          padding: 10,
          selectable: !readonly,
          hasControls: !readonly,
          hasBorders: !readonly
        });
        fabricObj.data = boardObj;
        canvas.add(fabricObj);
        fabricObjects.set(boardObj.id, fabricObj);
        break;

      case 'note':
        fabricObj = new fabric.Rect({
          left: boardObj.position.x,
          top: boardObj.position.y,
          width: boardObj.size?.width || 200,
          height: boardObj.size?.height || 100,
          fill: 'rgba(255, 255, 0, 0.3)',
          stroke: '#ffff00',
          strokeWidth: 2,
          selectable: !readonly,
          hasControls: !readonly,
          hasBorders: !readonly
        });

        const noteText = new fabric.Textbox(boardObj.content || '', {
          left: boardObj.position.x + 10,
          top: boardObj.position.y + 10,
          width: (boardObj.size?.width || 200) - 20,
          fontSize: 14,
          fill: '#000000',
          selectable: false
        });

        const noteGroup = new fabric.Group([fabricObj, noteText], {
          left: boardObj.position.x,
          top: boardObj.position.y,
          selectable: !readonly,
          hasControls: !readonly,
          hasBorders: !readonly
        });

        noteGroup.data = boardObj;
        canvas.add(noteGroup);
        fabricObjects.set(boardObj.id, noteGroup);
        break;
    }
  }

  // Add evidence from drag-drop (exposed to parent via binding)
  function addEvidenceFromDrop(evidence: Evidence, x: number, y: number) {
    const boardObjectId = boardActions.addEvidenceToBoard(
      evidence.id,
      evidence.minioUrl,
      evidence.type,
      { x, y }
    );
    return boardObjectId;
  }

  // Export function for parent components
  $effect(() => {
    // Make function available to parent through binding
    if (typeof window !== 'undefined') {
      (window as any).__evidenceBoard = {
        addEvidenceFromDrop
      };
    }
  });

  // Keyboard shortcuts
  function handleKeyDown(e: KeyboardEvent) {
    if (!canvas) return;

    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        deleteSelectedObjects();
        break;
      case 'a':
      case 'A':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          selectAllObjects();
        }
        break;
      case 'z':
      case 'Z':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          // TODO: Implement undo
        }
        break;
    }
  }

  function deleteSelectedObjects() {
    $selectedObjects.forEach((id: string) => {
      boardActions.removeObject(id);
    });
  }

  function selectAllObjects() {
    const allIds = $boardObjects.map((obj: BoardObject) => obj.id);
    selectedObjects.set(allIds);
  }

  // Save board state
  function saveBoard() {
    boardActions.saveBoard(caseId);
  }

  // Auto-arrange objects
  function autoArrange() {
    boardActions.autoArrange();
  }

  // Export canvas as image
  function exportAsImage() {
    if (!canvas) return;

    const dataURL = canvas.toDataURL({
      format: 'png',
      quality: 1.0
    });

    const link = document.createElement('a');
    link.href = dataURL;
    link.download = `evidence-board-${caseId}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
</script>

<div class="evidence-board-container">
  <div class="board-header">
    <div class="board-controls">
      {#if !readonly}
        <button class="nes-btn is-primary" onclick={() => autoArrange()}>
          Auto Arrange
        </button>
        <button class="nes-btn is-success" onclick={() => saveBoard()}>
          Save Board
        </button>
      {/if}

      <button class="nes-btn" onclick={() => exportAsImage()}>
        Export PNG
      </button>

      <div class="zoom-controls">
        <span class="nes-text">Zoom: {Math.round($zoomLevel * 100)}%</span>
      </div>
    </div>
  </div>

  <!-- Canvas Container -->
  <div class="canvas-container nes-container is-dark">
    <canvas bind:this={canvasElement} id="evidence-board-canvas"></canvas>

    <!-- Canvas Overlay Info -->
    {#if $boardObjects.length === 0}
      <div class="empty-board-message">
        <div class="nes-container is-centered">
          <p class="nes-text">🎯 Drag evidence from the sidebar to start building your board</p>
          <p class="nes-text is-disabled">Use mouse wheel to zoom, drag to move objects</p>
        </div>
      </div>
    {/if}
  </div>

  <!-- Board Stats -->
  <div class="board-stats nes-container is-dark">
    <div class="stats-grid">
      <div class="stat-item">
        <span class="nes-text is-primary">Objects:</span>
        <span class="nes-text">{$boardObjects.length}</span>
      </div>
      <div class="stat-item">
        <span class="nes-text is-success">Selected:</span>
        <span class="nes-text">{$selectedObjects.length}</span>
      </div>
      <div class="stat-item">
        <span class="nes-text is-warning">Zoom:</span>
        <span class="nes-text">{Math.round($zoomLevel * 100)}%</span>
      </div>
    </div>
  </div>
</div>

<style>
  .evidence-board-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 1rem;
  }

  .board-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
  }

  .board-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .zoom-controls {
    margin-left: 1rem;
  }

  .canvas-container {
    flex: 1;
    position: relative;
    overflow: hidden;
    min-height: 600px;
    background: #212529;
  }

  #evidence-board-canvas {
    display: block;
    border: 2px solid #495057;
  }

  .empty-board-message {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    pointer-events: none;
    z-index: 10;
  }

  .board-stats {
    padding: 0.5rem 1rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 1rem;
  }

  .stat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
</style>