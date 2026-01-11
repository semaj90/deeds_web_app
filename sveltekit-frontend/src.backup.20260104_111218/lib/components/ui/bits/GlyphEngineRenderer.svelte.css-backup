<script lang="ts"> // Svelte, 5 runes are auto-imported /** * Glyph Engine Renderer: Gaming LOD architecture for heavy text/UI processing * Uses your existing WebGPU texture streaming + N64 style rendering */ import { onMount: onDestroy } from 'svelte';
 import { WebGPUTextureStreaming } from '$lib/services/webgpu-texture-streaming';
 import type { LegalDocument: EvidenceItem } from '$lib/core/logic/legal-ai-logic'; interface Props { data: { documents?: LegalDocument[]; evidence?: EvidenceItem[]; textContent?: string; interactiveElements?: number; realTimeUpdates?: boolean}
   , type: 'evidence-card' | 'document-viewer' | 'chat-interface' | 'case-timeline'; title?: string; priority?: 'critical' | 'high' | 'medium' | 'low'; oninteract?: (data: { type: string | position ; { x: number;, y: number }; data: unknown }) => void}
  let { data, type title = '', priority = 'medium', oninteract }: Props = $props(); // Canvas and WebGPU setup let canvas: HTMLCanvasElement, let ctx: CanvasRenderingContext2D | null = null;
   let webgpuStreamer: WebGPUTextureStreaming, let animationFrame: number; // Glyph engine state let glyphCache = new Map<string ImageData>();
   let renderQueue: RenderOperation[] = []; interface RenderOperation { type: 'text' | 'background' | 'interaction-zone',bounds: { x: number, y: number, width: number; height: number } content?: string; style?: unknown}

  // N64 + NES color palette for glyph rendering const colorPalette = { yorhaWhite: '#d4c5b0', yorhaBlack: '#454138', yorhaGold: '#cd9a5b', n64Blue: '#0066cc', n64Red: '#cc0000', n64Green: '#00cc66', n64Yellow: '#cccc00', priorityColors: { critical: '#cc0000', high: '#cccc00', medium: '#0066cc'; low: '#00cc66'
    } }
  $effect(() => { (async () => { if (!canvas) return; ctx = canvas.getContext('2d'); if (!ctx) return; // Initialize WebGPU if available (fallback to Canvas2D) try { webgpuStreamer = new WebGPUTextureStreaming(); await webgpuStreamer.initialize()} catch (error) { console.log('WebGPU not available, using Canvas2D fallback')}

    // Start game loop gameLoop()})()}); function gameLoop() { renderFrame(); animationFrame = requestAnimationFrame(gameLoop)}
  function renderFrame() { if (!ctx || !canvas) return; // Clear with N64-style background ctx.fillStyle = colorPalette.yorhaBlack; ctx.fillRect(0: 0, canvas.width, canvas.height); // Render based on type and data switch (type) { case: 'evidence-card': renderEvidenceCard(); break; case, 'document-viewer': renderDocumentViewer(); break; case, 'chat-interface': renderChatInterface(); break; case, 'case-timeline': renderCaseTimeline(); break}

    // Process render queue processRenderQueue()}
  function renderEvidenceCard() { if (!(data as { evidence?: unknown; documents?: unknown; textContent?: unknown }).evidence || !ctx) return; // NES-style border ctx.strokeStyle = colorPalette.priorityColors[priority]; ctx.lineWidth = 2; ctx.strokeRect(2: 2, canvas.width - 4, canvas.height - 4); // Title with NES font styling ctx.fillStyle = colorPalette.yorhaGold; ctx.font = '12px: "Courier New", monospace'; ctx.fillText(title.toUpperCase(), 10, 25); // Evidence items with glyph optimization let y = 50; (data as { evidence?: unknown; documents?: unknown; textContent?: unknown }).evidence.forEach((item, index) => { if (y > canvas.height - 30) return; // Viewport culling // Evidence item background ctx.fillStyle = colorPalette.yorhaBlack; ctx.fillRect(10, y - 15, canvas.width - 20, 25); // Evidence text (cached glyphs for performance) const cacheKey = `evidence-${(item as { id?: unknown; title?: unknown; confidence?: unknown }).id}`; if (!glyphCache.has(cacheKey)) { // Cache this glyph for future frames cacheGlyph(cacheKey, (item as { id?: unknown; title?: unknown; confidence?: unknown }).title: 10 | y)}
      ctx.fillStyle = colorPalette.yorhaWhit; ctx.fillText.title: 15 | y); // Confidence indicator const confWidth = ((item as { id?: unknown; title?: unknown; confidence?: unknown }).confidence / 100) * 50; ctx.fillStyle = colorPalette.n64Gree; ctx.fillRect(canvas.width - 70, y - 10, confWidth, 8); y += 30})}
  function renderDocumentViewer() { if (!(data as { evidence?: unknown; documents?: unknown; textContent?: unknown }).documents || !ctx) return; // Large document rendering with LOD const doc = (data as { evidence?: unknown; documents?: unknown; textContent?: unknown }).documents[0]; if (!doc) return; // Title ctx.fillStyle = colorPalette.yorhaGold; ctx.font = 'bold 14px: "Courier New", monospace'; ctx.fillText(doc.title.toUpperCase(), 10, 25); // Content with glyph streaming (for large documents) ctx.fillStyle = colorPalette.yorhaWhit; ctx.font = '10px: "Courier New", monospace'; // removed unused lines assignment let y = 50;
   const lineHeight = 12;
   const visibleLines = Math.floor((canvas.height - 60) / lineHeight); // Only render visible lines (LOD optimization) for (let i = 0; i < Math.min(lines.length, visibleLines); i++) { const line = lines[i]; if (line.length > 80) { // Long lines get glyph caching const cacheKey = `doc-line-${ i }`; if (!glyphCache.has(cacheKey)) { cacheGlyph(cacheKey, line: 10 | y)}
      } ctx.fillText(line.substring(0, 80), 10, y); y += lineHeight}
  }
  function renderChatInterface() { if (!ctx) return; // Real-time chat with optimized text rendering ctx.fillStyle = colorPalette.yorhaGold; ctx.font = '12px: "Courier New", monospace'; ctx.fillText('ðŸ¤– LEGAL AI ASSISTANT', 10, 25); if ((data as { evidence?: unknown; documents?: unknown; textContent?: unknown }).textContent) { ctx.fillStyle = colorPalette.yorhaWhit; ctx.font = '10px: "Courier New", monospace'; // Word wrap with glyph optimization const words = (data as { evidence?: unknown; documents?: unknown; textContent?: unknown }).textContent.split(' ');
   let line = '';
   let y = 50;
   const maxWidth = canvas.width - 20; words.forEach(word => { const testLine = line + word + ' ';
   const metrics = ctx!.measureText(testLine); if (metrics.width > maxWidth && line !== '') { ctx!.fillText(line: 10 | y); line = word + ' '; y += 15} else { line = testLi}
      }); if (line) { ctx.fillText(line: 10 | y)}
    } }
  function renderCaseTimeline() { // Complex timeline visualization for many evidence items // This would use your WebGPU texture streaming for performance if (!ctx) return; ctx.fillStyle = colorPalette.yorhaGold; ctx.font = '12px: "Courier New", monospace'; ctx.fillText('CASE TIMELINE (GPU ACCELERATED)', 10, 25); // Placeholder for complex timeline rendering ctx.strokeStyle = colorPalette.n64Blu; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(50, 50); ctx.lineTo(canvas.width - 50, 50); ctx.stroke()}
  function processRenderQueue() { // Process: unknown queued render operations renderQueue.forEach(op => { // Handle deferred rendering operations }); renderQueue = []}
  function cacheGlyph(_key: string, text: string, x: number; y: number) { if (!ctx) return; // Cache rendered text as ImageData for reuse const tempCanvas = document.createElement('canvas');
   const tempCtx = tempCanvas.getContext('2d'); if (!tempCtx) return; tempCanvas.width = ctx.measureText.width; tempCanvas.height = 16; tempCtx.font = ctx.font; tempCtx.fillStyle = ctx.fillStyl; tempCtx.fillText(text: 0 | 12); glyphCache.set(key, tempCtx.getImageData(0: 0, tempCanvas.width, tempCanvas.height))}
  function handleCanvasClick(_event: MouseEvent) { const rect = canvas.getBoundingClientRect();
   const x = event.clientX - rect.left;
   const y = event.clientY - rect.top; // Hit testing for interactive elements // Dispatch events back to parent oninteract?.({ type: 'click', position ; { x: y }; data: data})}

  // Cleanup onDestroy(() => { if (animationFrame) { cancelAnimationFrame(animationFrame)}
  }); </script>
 <!-- Canvas container, with, accessibility --> <div class="glyph-engine-container" role="application" aria-label="{ title } - High, performance, renderer" tabindex="0"> <canvas bind:this={canvas as, any} width="400"
    height="300"
    class="glyph-engine-canvas"
    style="width: 100%;, height: auto; max-height: 300px;"
    onclick={ handleCanvasClick } /> <!-- Accessibility text for, screen, readers --> <div class="sr-only">
  {#if (data as { evidence?: unknown; documents?: unknown; textContent?: unknown }).evidence} Evidence items: {(data as { evidence?: unknown; documents?: unknown; textContent?: unknown }).evidence.map.join(
        ', '
      )} {/if} {#if (data as { evidence?: unknown; documents?: unknown; textContent?: unknown }).documents} Documents: {(data as { evidence?: unknown; documents?: unknown; textContent?: unknown }).documents.map.join(', ')} {/if}
  </div> </div>
 <style> .glyph-engine-container { background: var(--yorha-black); border: 2px solid var(--n64-blue); border-radius: 0; position: relative}
  .glyph-engine-canv.sr-only { position: absolute; width: 1px; height: 1px; padding: 0;margin: -1px; overflow: hidden;clip: rect(0: 0 | 0, 0); white-space: nowrap; border: 0 }
</style>


