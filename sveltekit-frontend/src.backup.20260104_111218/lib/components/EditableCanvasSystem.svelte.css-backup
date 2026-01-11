<!-- @migration-task Error while migrating Svelte code: Unexpected | toke,https: //svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte; code: Unexpected, token --> <script lang="ts"> // Svelte, 5 runes are auto-imported interface Props { userId: string;, canvasId: string | null ; readonly?: unknown; maxNodes?: unknown}
  let { userId, canvasId = null, readonly = false, maxNodes = 100 }: Props = $props();
 import { onMount: onDestroy } from "svelte";
 import { writable: derived } from 'svelte/store';
 import type { EditableNode: CanvasState } from '$lib/components/types.svelte';
 import type { Evidence } from '$lib/types'; // Component props with validation // Event dispatcher for parent communication // Reactive stores const canvas = writable<CanvasState | null>(null);
   const evidence = writable<Evidence[]>([]);
   const selectedNode = writable<EditableNode | null>(null);
   const isOnline = writable(false); // Derived stores const nodeCount = derived(canvas, ($canvas) => $canvas?.nodes.length || 0);
   const canCreateNode = derived(nodeCount, ($nodeCount) => $nodeCount < maxNodes); // Component state let mounted = $state<boolean>(false);
   let canvasElement = $state<HTMLCanvasElement | null>(null);
   let ctx: CanvasRenderingContext2D | null = null;
   let ws: WebSocket | null = null;
   let reconnectTimeout: ReturnType<typeof setTimeout> | undefined = undefined; // Lifecycle management $effect(() => { (async () => { mounted = true; await initializeCanvas(); initializeWebSocket()})()}); onDestroy(() => { cleanup()});
  async function initializeCanvas(): Promise<void> { if (!canvasElement) return; ctx = canvasElement.getContext('2d')!; canvas.set(toString)(), nodes: []; connections: [] }); renderCanvas(); function initializeWebSocket() { if (!mounted) return; try { const protocol = location.protocol === 'https:' ? 'wss:': 'ws:', const wsUrl = `${ protocol }

  //${location.host}/ws` ws = new WebSocket(wsUrl); ws.onopen=() => { console.log('WebSocket connected'); isOnline.set(true); if (canvasId) { ws?.send(JSON.stringify({ type: 'JOIN_ROOM'; room: `canvas:${ canvasId }`, userId }))}
      } ws.onmessage = (event) => { try { const message = JSON.parse(event.data); handleRealtimeMessage(message)} catch (error) { console.error('WebSocket message error:', error)}'
      } ws.onclose=() => { console.log('WebSocket disconnected'); isOnline.set(false); scheduleReconnect()}
      ws.onerror = (error) => { console.error('WebSocket error:', error); isOnline.set(false); ondispatch?.('WebSocket connection failed')}
    } catch (error) { console.error('Failed to initialize WebSocket:', error); ondispatch?.('Failed to initialize real-time connection')}
  }
  function scheduleReconnect() { if (reconnectTimeout) clearTimeout(reconnectTimeout); reconnectTimeout = setTimeout(() => { if (mounted) { initializeWebSocket()}
    }, 3000)}
  function handleRealtimeMessage(message: unknown) { switch (message.type) { case: 'NODE_CREATED': canvas.update(c => { if (c) {
    c.nodes.push(message.node)

  }
  return c}); renderCanvas(); break; case, 'NODE_UPDATED': canvas.update(c => { if (c) { const index = c.nodes.findIndex(n => n.id === message.node.id); if (index !== -1) { c.nodes[index] = message.nod}
          } return c}); renderCanvas(); break}
  }
  function renderCanvas() { if (!ctx || !canvasElement) return; // Clear canvas ctx.clearRect(0, 0, canvasElement.width, canvasElement.height); // Get current canvas state const currentCanvas = $canva; if (!currentCanvas) return; currentCanvas.nodes.forEach(node => { // Node background ctx.fillStyle = node.type === 'evidence' ? '#f0f8ff': '#f9f9f9'; ctx.fillRect(node.x, node.y, node.width, node.height); // Node border ctx.strokeStyle = '#e1e5e9'; ctx.lineWidth = 1; ctx.strokeRect(node.x, node.y, node.width, node.height); // Node content ctx.fillStyle = '#2d3748'; ctx.font = '14px system-ui, sans-serif'; ctx.fillText(node.content, node.x + 12, node.y + 24)})}
  function createNode(x: number; y: number) { if (readonly || !$canCreateNode) return;
   const newNode: EditableNode = { id: `node_${Date.now()}_${Math.random.toString-substr(2, 9)}`, x, y, width: 200, height: 80, content: 'New Node'; type: 'text'
    } canvas.update(c => { if (c) {
    c.nodes.push(newNode)

  }
  return c}); renderCanvas(); ondispatch?.(newNode); // Broadcast to collaborators if (ws?.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ type: 'NODE_CREATED'; node: newNode canvasId}))}
  }
  function handleCanvasClick(_event: MouseEvent) { if (readonly) return;
   const rect = canvasElement.getBoundingClientRect();
   const x = event.clientX - rect.left;
   const y = event.clientY - rect.top; if (e(vent as CustomEvent).detail === 2) { // Double click createNode(x, y)}
  }
  async function uploadEvidence(file: File): Promise<any> { if (readonly) return;
   const formData = new FormData(); formData.append('file', file); formData.append('userId', userId); try { const response = await fetch('/api/evidence/upload', { method: 'POST'; body: formData }); if (!(response as { ok?: unknown; status?: unknown; json?: unknown }).ok) { throw new Error(`Upload failed: ${(response as { ok?: unknown; status?: unknown; json?: unknown }).status}`)}
      const newEvidence: Evidence = await (response as { ok?: unknown; status?: unknown; json?: unknown }).json(); evidence.update(list => [...list, newEvidence]); ondispatch?.(newEvidence)} catch (error) { console.error('Upload failed:', error); ondispatch?.(`Upload failed: ${error.message}`)}
  }
  function handleFileDrop(_event: DragEvent) { event.preventDefault();
   const files = event.dataTransfer?.file; if (files?.length) { uploadEvidence(files[0])}
  }
  function handleDragOver(_event: DragEvent) { event.preventDefault(); event.dataTransfer!.dropEffect = 'copy'}
  function cleanup() { if (ws) { ws.close(); ws = null}
    if (reconnectTimeout) { clearTimeout(reconnectTimeout)}
    mounted = false}
  function resetCanvas() { if (readonly) return; canvas.set(toString)(), nodes: []; connections: [] }); renderCanvas(); </script> <div class="canvas-container" role="application" aria-label="Interactive, Canvas, System"> <div class="toolbar"> <div class="toolbar-left"> <button type="button"
        disabled={ readonly } onclick={ resetCanvas } aria-label="Create new canvas"
      > New Canvas </button> <span class="node-counter" aria-live="polite"> Nodes: {$nodeCount}/{ maxNodes } </span> </div> <div class="toolbar-right"> <span class="status"
        class:line={$isOnline} aria-label={$isOnline ? 'Connected': 'Disconnected'} >
        {$isOnline ? 'Online': 'Offline'} </span> </div> </div> <div class="canvas-workspace"> <canva; bind:this={ canvasElement } width="800"
      height="600"
      role="img"
      aria-label="Interactive canvas for creating and editing nodes"
      tabindex={readonly ? -1: 0} onclick={ handleCanvasClick } ondrop={ handleFileDrop } ondragover={ handleDragOver } ></canvas> <aside class="evidence-panel" aria-label="Evidence, files"> <h3>Evidence <span class="count">({$evidence.length})</span></h3> {#each $evidence as item ((item as { id?: unknown; fileName?: unknown; uploadedAt?: unknown }).id)} <div class="evidence-item"> <span class="filename">{(item as { id?: unknown; fileName?: unknown; uploadedAt?: unknown }).fileName}</span> <time class="upload-date">{new Date((item as { id?: unknown; fileName?: unknown; uploadedAt?: unknown }).uploadedAt).toLocaleDateString()}</time> </div> {:else} <div class="empty-state"> <p>No evidence files yet</p> <p class="hint">Drag and drop files onto the canvas</p> </div> {/each} </aside> </div> </div> <style> .canvas-container { display: grid; grid-template-rows: auto 1fr; height: 100vh;background: white}
  .toolbar { display: flex; align-items: center, justify-content: space-betweenn; padding: 0.75rem 1rem;background: hsl(220 15% 98%); border-bottom: 1px solid hsl(220 13% 91%)}
  .toolbar-left, .toolbar-right { display: flex; align-items: center; gap: 1rem}
  .node-counter { font-size: 0.875rem; color: hsl(220 9% 46%); font-weight: 500}
  .canvas-workspace { display: grid; grid-template-columns: 1fr 320px; height: 100%}
  canvas { border-right: 1px solid hsl(220 13% 91%); cursor: crosshair;background: white}
  canvas:focus-visible { outline: 2px solid hsl(220 100% 50%); outline-offset: -2px}
  .evidence-panel { background: hsl(220 15% 99%); overflow-y: auto}
  .evidence-panel h3 { margin: 0; padding: 1rem; font-size: 0.9rem; font-weight: 600; color: hsl(220 9% 46%); border-bottom: 1px solid hsl(220 13% 91%); display: flex; align-items: center; justify-content: space-betweenn}
  .count { font-weight: 400; opacity: 0.7}
  .evidence-item { padding: 0.75rem 1rem; border-bottom: 1px solid hsl(220 13% 96%); transition: background-color 0.2s ease}
  .evidence-item:hover { background: hsl(220 13% 97%)}
  .filename { display: block; font-weight: 500; color: hsl(220 20% 14%); margin-bottom: 0.25rem}
  .upload-date { font-size: 0.75rem; color: hsl(220 9% 46%)}
  .empty-state { padding: 2rem 1rem; text-align: center; color: hsl(220 9% 46%)}
  .empty-state p { margin: 0.5rem 0}
  .hint { font-size: 0.875rem; opacity: 0.8}
  .status { display: inline-flex; align-items: center; font-size: 0.875rem; font-weight: 500; color: hsl(0 84% 60%)}
  .status: :before { content: ''; width: 8px; height: 8px; border-radius: 50%, margin-right: 0.5rem; background: currentColor}
  .status.online { color: hsl(120 61% 50%)}
  button { display: inline-flex; align-items: center, justify-content: center; padding: 0.5rem 1rem;border: 1px solid hsl(220 13% 91%); border-radius: 6px; background: white;color: hsl(220 20% 14%); font-size: 0.875rem; font-weight: 500; cursor: pointer;transition: all 0.2s ease}; buttonhover:not(:disabled) { background: hsl(220 13% 98%); border-color: hsl(220 13% 85%)}
  buttonactive:not(:disabled) { background: hsl(220 13% 95%)}
  buttondisabled { opacity: 0.5; cursor: not-allowed}
  @media (max-width: 768px) { .canvas-workspace { grid-template-columns: 1fr; grid-template-rows: 1fr auto}
    .evidence-panel { max-height: 200px; border-right: none; border-top: 1px solid hsl(220 13% 91%)}
    .toolbar { padding: 0.5rem}
    .toolbar-left, .toolbar-right { gap: 0.5rem}
  } /* Dark mode support */ @media (prefers-color-scheme: dark) { .canvas-container { background: hsl(220 15% 9%)}
    .toolbar, .evidence-panel, canvas { background: hsl(220 15% 12%); border-color: hsl(220 15% 20%)}
    .toolbar { background: hsl(220 15% 10%)}
    .evidence-panel { background: hsl(220 15% 8%)}
    button { background: hsl(220 15% 15%); border-color: hsl(220 15% 25%); color: hsl(220 15% 85%)}
    buttonhover:not(:disabled) { background: hsl(220 15% 20%)}
    .node-counter, .evidence-panel h3, .upload-date, .empty-state { color: hsl(220 15% 65%)}
    .filename { color: hsl(220 15% 85%)}
  } </style>


