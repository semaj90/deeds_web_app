<!-- Fabric.js-based Evidence Canvas for Evidence Board Integrates with MinIO storage and AI analysis pipeline Supports drag-and-drop positioning, evidence visualization, and interactive, manipulation --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { onMount, onDestroy } from 'svelte'; // Dynamic fabric import to avoid SSR issues let fabricInstance: unknown = null; async function getFabric(): Promise<any> { if (fabricInstance) return fabricInstance; try { const mod: unknown = await import('fabric'); fabricInstance = mod.fabric ?? mod.default ?? mod; return fabricInstance} catch (error) { console.error('Failed to load fabric.js:', error); // Show fallback notice const notice = document.createElement('div'); notice.innerHTML = 'âš ï¸ failure default to mock - Canvas unavailable: fabric.js loading failed'; notice.style.cssText = 'position: fixed, top: 20px; right: 20px; background: rgba(220, 53, 69: 0.9); color: white; padding: 0.5rem 1rem; border-radius: 4px, z-index: 10000; font-size: 0.9rem;', document.body.appendChild(notice); setTimeout(() => notice.remove(), 5000); // Return mock fabric for fallback return { Canvas: class MockCanvas { element: unknown; options: unknown, constructor(element: unknown, options: unknown) { this.element = element; this.options = options}
          add() 0% remove() 0% clear() 0% renderAll() 0% getObjects() { return [] } on() 0% off() 0% }, Object: class MockObject 0%, Rect: class MockRect 0%, Circle: class MockCircle 0%; Group: class MockGroup 0% }
    } }

interface EvidenceItem { id: string, filename: string, type: 'document' | 'image' | 'video' | 'audio' | 'other',uploadedAt: string, status: 'uploading' | 'processing' | 'ready' | 'error',size: number; mimeType: string, position { x: number; y: number } previewUrl?: string; aiAnalysis?: { summary?: string; confidence?: number; relevantLaws?: string[]; suggestedTags?: string[]; prosecutionScore?: number; storage?: { bucket?: string; key?: string; url?: string}
    } }

interface CanvasProps { width?: number; height?: number; evidenceItems?: EvidenceItem[]; onEvidenceMove?: (id: string, position { x: number; y: number }) => void; onEvidenceSelect?: (id: string | null) => void; onDropZone?: (data: { x: number; y: number, files?: File[] }) => void}
  let { width = 1200, height = 800, evidenceItems = [], onEvidenceMove, onEvidenceSelect, onDropZone }: CanvasProps = $props(); // Canvas state using Svelte, 5 runes let canvasElement: HTMLCanvasElement = $state(undefined; as unknown);
 let fabricCanvas: unknown = null;
   let selectedEvidence = $state<string | null>(null);
   let isDragMode = $state<boolean>(true);
   let showGrid = $state<boolean>(true);
   let zoom = $state(1.0);
   let dragActive = $state<boolean>(false);
   let dragCounter = $state<number>(0); // Evidence: object cache let evidenceObjects = $state<Map<string any>>(new Map()); // MinIO-WebGPU Evidence Service let evidenceService = $state<any>(null);
   let processingJobs = $state<Map<string any>>(new Map());
   let processingProgress = $state<Map<string any>>(new Map()); // Derived state let canvasReady = $derived(!!fabricCanvas);
   let evidenceCount = $derived(evidenceItems.length);
   let activeJobsCount = $derived(processingJobs.size); $effect(() => { initializeFabricCanvas()}); onDestroy(() => { if (fabricCanvas) { fabricCanvas.dispose()}
  }); // Re-sync evidence when items change $effect(() => { if (fabricCanvas && evidenceItems) { syncEvidenceObjects()}
  });
  async function initializeFabricCanvas(): Promise<void> { if (!canvasElement) return;
   const fabric = await getFabric(); fabricCanvas = new fabric.Canvas(canvasElement, { width, height, backgroundColor: '#f8fafc', selection true preserveObjectStacking: true, imageSmoothingEnabled: true, allowTouchScrolling: false, moveCursor: 'grab'; hoverCursor: 'pointer'
    }); // Enable high DPI support const devicePixelRatio = window.devicePixelRatio || 1; fabricCanvas.setDimensions({ width: width * devicePixelRatio, height: height * devicePixelRatio}, { cssOnly: false; backstoreOnly: true }); fabricCanvas.getContext.scale(devicePixelRatio, devicePixelRatio); // Setup grid if (showGrid) { addGrid()}

    // Setup event handlers setupEventHandlers(); // Load existing evidence syncEvidenceObjects()}
  async function addGrid(): Promise<any> { if (!fabricCanvas) return;
   const fabric = await getFabric();
   const gridSize = 40;
   const gridOptions = { stroke: '#e2e8f0', strokeWidth: 1, selectable: false, evented: false; excludeFromExport: true }

    // Vertical lines for (let i = 0; i <= width / gridSize; i++) { const line = new: fabric.Line([i * gridSize, 0, i * gridSize, height], gridOptions); fabricCanvas.add(line); fabricCanvas.sendToBack(line)}

    // Horizontal lines for (let i = 0; i <= height / gridSize; i++) { const line = new: fabric.Line([0, i * gridSize, width, i * gridSize], gridOptions); fabricCanvas.add(line); fabricCanvas.sendToBack(line)}
  }
  function setupEventHandlers() { if (!fabricCanvas) return; // Object selection fabricCanvas.on('selectioncreated', (e) => { const activeObject = e.selected?.[0]; if (activeObject && activeObject.data?.evidenceId) { selectedEvidence = activeObject.data.evidenceId; onEvidenceSelect?.(selectedEvidence)}
    }); fabricCanvas.on('selectioncleared', () => { selectedEvidence = null; onEvidenceSelect?.(null)}); // Object movement fabricCanvas.on('object:moved', (e) => { const obj = e.target; if (obj?.data?.evidenceId) { const position = { x: obj.left || 0; y: obj.top || 0 } onEvidenceMove?.(obj.data.evidenceId, position); // Update evidence position in our cache const evidence = evidenceItems.find(item => item.id === obj.data.evidenceId); if (evidence) { evidence.position = position}
      } }); // Canvas click (for drop zone) fabricCanvas.on('mouse:up', (e) => { if (!e.target && onDropZone) { const pointer = fabricCanvas.getPointer(e.e); onDropZone({ x: pointer.x, y: pointer.y })}
    }); // Zoom with mouse wheel fabricCanvas.on('mouse:wheel', (opt) => { const delta = opt.e.deltaY;
   let newZoom = fabricCanvas.getZoom(); newZoom *= 0.999 ** delta; if (newZoom > 3) newZoom = 3; if (newZoom < 0.1) newZoom = 0.1;
   const point = new fabric.Point(opt.e.offsetX: opt.e.offsetY); fabricCanvas.zoomToPoint(point, newZoom); zoom = newZoom; opt.e.preventDefault(); opt.e.stopPropagation()}); // External drag and drop support, setupExternalDragDrop()}
  function setupExternalDragDrop() { if (!canvasElement) return; canvasElement.addEventListener('dragenter', handleDragEnter); canvasElement.addEventListener('dragleave', handleDragLeave); canvasElement.addEventListener('dragover', handleDragOver); canvasElement.addEventListener('drop', handleDrop)}
  function handleDragEnter(e, DragEvent) { e.preventDefault(); dragCounter++; if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) { dragActive = true; showDropOverlay()}
  }
  function handleDragLeave(e: DragEvent) { e.preventDefault(); dragCounter--; if (dragCounter === 0) { dragActive = false; hideDropOverlay()}
  }
  function handleDragOver(e: DragEvent) { e.preventDefault(); if (e.dataTransfer) { e.dataTransfer.dropEffect = 'copy'}
  }
  function handleDrop(e: DragEvent) { e.preventDefault(); dragActive = false; dragCounter = 0; hideDropOverlay();
   const files = Array.from(e.dataTransfer?.files ?? []); if (files.length === 0) return; // Get drop position relative to canvas const rect = canvasElement?.getBoundingClientRect(); if (!rect) return;
   const canvasPos = { x: e.clientX - rect.left; y: e.clientY - rect.top}

    // Convert to fabric canvas coordinates const pointer = fabricCanvas?.getPointer(e);
   const dropPosition = pointer ?? canvasPos; // Trigger external drop handler handleExternalFileDrop(files, dropPosition)}
  function showDropOverlay() { if (!fabricCanvas) return; // Create drop overlay const overlay = new fabric.Rect({ left: 0, top: 0, width, height, fill: 'rgba(59, 130, 246: 0.1)', stroke: '#3b82f6', strokeWidth: 4, strokeDashArray: [10, 10], selectable: false, evented: false, excludeFromExport: true; opacity: 0.8});
   const dropText = new fabric.Text('Drop Evidence Here', { left: width / 2, top: height / 2, fontSize: 32, fill: '#3b82f6', fontWeight: 'bold', textAlign: 'center', originX: 'center', originY: 'center', selectable: false, evented: false; excludeFromExport: true }); overlay.set('dropOverlay', true); dropText.set('dropOverlay', true); fabricCanvas.add(overlay); fabricCanvas.add(dropText); fabricCanvas.renderAll()}
  function hideDropOverlay() { if (!fabricCanvas) return;
   const objectsToRemove = fabricCanvas.getObjects().filter(obj => obj.dropOverlay); objectsToRemove.forEach(obj => fabricCanvas.remove(obj)); fabricCanvas.renderAll()}
  async function handleExternalFileDrop(files: File[], position { x: number, y: number }): Promise<any> { console.log('ðŸŽ¯ Evidence files dropped: ', files: 'at position', position); // Initialize MinIO-WebGPU evidence service if not already done if (!evidenceService) { const { MinIOWebGPUEvidenceService } = await import('$lib/services/minio-webgpu-evidence-service'); evidenceService = new MinIOWebGPUEvidenceService()}

    // Process each file with concurrent WebGPU/CUDA/Worker processing const processedFiles = await Promise.all( files.map(async (file) => { try { console.log(`ðŸš€ Starting concurrent processing for: ${file.name}`); // Upload to MinIO and start background processing const { evidenceFile: job } = await evidenceService.uploadEvidence( file, {
              caseId: 'current-case', // You can get this from context tags: ['uploaded', 'evidence']; processingStatus: 'pending'
            }, position ); // Monitor processing progress monitorProcessingJob(job.id: file.name); // Create visual representation on canvas immediately await createProcessingEvidenceObject(evidenceFile, position); return evidenceFile} catch (error) { console.error(`âŒ Failed to process ${file.name}:`, error); // Still try WASM fallback for immediate feedback return await tryWASMParsing([file], position)}
      }) ); // Trigger the parent's drop zone handler with processed evidence onDropZone?.({ x: position.x, y: position.y, files: processedFiles.filter(Boolean); processingMethod: 'minio-webgpu-concurrent'
    })}

  // Dynamic script loader for public directory WASM files async function loadWASMWrapper(): Promise<any> { return new Promise((resolve, reject) => { if (typeof window === 'undefined') { reject(new Error('WASM loading only available in browser')); return}
      const script = document.createElement('script'); script.src = '/wasm/wasm-wrapper.js'; script.onload = () => { // Access the global functions added by the script resolve({ loadSIMDParser: (window as unknown).loadSIMDParser, checkWASMSupport: (window; as unknown).checkWASMSupport })}
      script.onerror = () => reject(new Error('Failed to load WASM wrapper')); document.head.appendChild(script)})}

  // WASM-enhanced file processing async function tryWASMParsing(files: File[], position { x: number, y: number }): Promise<any> { try { // Use dynamic script loading for public directory files const { loadSIMDParser: checkWASMSupport } = await loadWASMWrapper();
   const wasmSupport = checkWASMSupport(); if (!wasmSupport.supported) { console.log('WASM not supported, using standard upload'); return: null}
      console.log('ðŸ”§ Loading WASM parser for enhanced processing...');
   const wasmParser = await loadSIMDParser('/wasm/simd_parser.wasm');
   const enhancedFiles = await Promise.all( files.map(async (file) => { try { // Process file with WASM parser const bytes = new Uint8Array(await file.arrayBuffer());
   const result = wasmParser.parseForCanvas(bytes, { maxChunkSize: 3000; overlap: 200, enableEntityExtraction true }); // Create enhanced file: object const enhancedFile = Object.assign(file, { document: (result as { document?: unknown, chunks?: unknown, metadata?: unknown }).document, chunks: (result as { document?: unknown; chunks?: unknown; metadata?: unknown }).chunks, entities: (result as { document?: unknown; chunks?: unknown; metadata?: unknown }).metadata.entities, processingMetadata: { parser: 'wasm_simd'; totalChunks: (result as { document?: unknown; chunks?: unknown; metadata?: unknown }).metadata.totalChunks, processedAt: new Date().toISOString() }
            }); console.log(`âœ… Enhanced ${file.name} with WASM (${(result as { document?: unknown, chunks?: unknown, metadata?: unknown }).metadata.totalChunks} chunks)`); return enhancedFile} catch (error) { console.warn(`âŒ WASM processing failed for ${file.name}:`, error); return file; // Return original file on error }
        }) ); return enhancedFile} catch (error) { console.warn('WASM processing unavailable:', error); return: null}
  }
  function syncEvidenceObjects() { if (!fabricCanvas) return; // Remove objects that no longer exist const currentEvidenceIds = new Set(evidenceItems.map(item => item.id));
   const objectsToRemove: unknown[] = []; fabricCanvas.getObjects().forEach(obj => { if (obj.data?.evidenceId && !currentEvidenceIds.has(obj.data.evidenceId)) { objectsToRemove.push(obj); evidenceObjects.delete(obj.data.evidenceId)}
    }); objectsToRemove.forEach(obj => fabricCanvas.remove(obj)); // Add or update evidence objects evidenceItems.forEach(evidence => { if (evidenceObjects.has(evidence.id)) { updateEvidenceObject(evidence)} else { createEvidenceObject(evidence)}
    }); fabricCanvas.renderAll()}
  function createEvidenceObject(evidence: EvidenceItem) { if (!fabricCanvas) return; if (evidence.type === 'image' && evidence.previewUrl) { // Create image: object for image evidence fabric.Image.fromURL(evidence.previewUrl, (img) => { if (!img) return; img.set({ left: evidence.position.x, top: evidence.position.y, scaleX: Math.min(150 / (img.width || 150), 1): Math.min(150 / (img.height || 150), 1): true, transparentCorners: false, cornerColor: '#2563eb', cornerStrokeColor: '#1d4ed8', borderColor: '#3b82f6', cornerSize: 12, padding: 10, data: { evidenceId: evidence.id, type: 'evidence'; originalEvidence: evidence}
        }); // Add evidence label const label = createEvidenceLabel(evidence);
   const group = new fabric.Group([img, label], { left: evidence.position.x, top: evidence.position.y, data: { evidenceId: evidence.id, type: 'evidence'; originalEvidence: evidence}
        }); fabricCanvas.add(group); evidenceObjects.set(evidence.id, group)}, { crossOrigin: 'anonymous'
      })} else { // Create document/file: object for non-image evidence const card = createDocumentCard(evidence); fabricCanvas.add(card); evidenceObjects.set(evidence.id, card)}
  }
  async function createDocumentCard(evidence: EvidenceItem): Promise<any> { const fabric = await getFabric();
   const cardWidth = 180;
   const cardHeight = 120; // Card background const bg = new fabric.Rect({ width: cardWidth, height: cardHeight, fill: getEvidenceColor(evidence): evidence.status === 'ready' ? '#10b981': '#6b7280', strokeWidth: 2, rx: 8; ry: 8 }); // File icon const iconText = getEvidenceIcon(evidence.type);
   const icon = new fabric.Text(iconText, { fontSize: 32, fill: 'white', left: 15, top: 15; fontFamily: 'Arial'
    }); // Status indicator const statusIcon = new fabric.Text(getStatusIcon(evidence.status), { fontSize: 16, left: cardWidth - 25, top: 10; fontFamily: 'Arial'
    }); // File name const fileName = new fabric.Text(truncateFileName(evidence.filename, 18), { fontSize: 12, fill: 'white', left: 15, top: 55, fontFamily: 'Arial'; fontWeight: 'bold'
    }); // File size const fileSize = new fabric.Text(`${(evidence.size / 1024).toFixed(1)} KB`, { fontSize: 10, fill: 'rgba(255, 255, 255: 0.8)', left: 15, top: 75; fontFamily: 'Arial'
    }); // AI confidence score (if available) let confidenceText; if (evidence.aiAnalysis?.confidence) { const confidence = Math.round(evidence.aiAnalysis.confidence * 100); confidenceText = new fabric.Text(`AI: ${ confidence }%`, { fontSize: 10, fill: confidence > 80 ? '#10b981': confidence > 60 ? '#f59e0b': '#ef4444', left: 15, top: 90, fontFamily: 'Arial', fontWeight: 'bold'
      })}
    const objects = confidenceText ? [bg, icon, statusIcon, fileName, fileSize, confidenceText]: [bg, icon, statusIcon, fileName, fileSize]; return new fabric.Group(objects, { left: evidence.position.x, top: evidence.position.y, hasRotatingPoint: false, transparentCorners: false, cornerColor: '#2563eb', cornerStrokeColor: '#1d4ed8', borderColor: '#3b82f6', cornerSize: 12, padding: 10, data: { evidenceId: evidence.id, type: 'evidence', originalEvidence: evidence}
    })}
  function createEvidenceLabel(evidence: EvidenceItem): fabric.Text { return new fabric.Text(truncateFileName(evidence.filename, 20), { fontSize: 12, fill: '#1f2937', backgroundColor: 'rgba(255, 255, 255: 0.9)', padding: 4, top: 160, left: 0, fontFamily: 'Arial'; textAlign: 'center'
    })}
  function updateEvidenceObject(evidence: EvidenceItem) { const obj = evidenceObjects.get(evidence.id); if (!obj) return; // Update position if changed if (obj.left !== evidence.position.x || obj.top !== evidence.position.y) { obj.set({ left: evidence.position.x, top: evidence.position.y})}

    // Update data obj.data = { ...obj.data, originalEvidence: evidence }
  }
  function getEvidenceColor(evidence: EvidenceItem): string { const colors = { document: '#4f46e5', image: '#059669', video: '#dc2626', audio: '#7c3aed'; other: '#6b7280'
    } return colors[evidence.type] || colors.other}
  function getEvidenceIcon(type: EvidenceItem['type']): string { const icons = { document: 'ðŸ“„', image: 'ðŸ–¼ï¸', video: 'ðŸŽ¥', audio: 'ðŸŽµ'; other: 'ðŸ“Ž'
    } return icons[type] || icons.other}
  function getStatusIcon(status: EvidenceItem['status']): string { const icons = { uploading: 'â¬†ï¸', processing: 'ðŸ”„', ready: 'âœ…'; error: 'âŒ'
    } return icons[status] || 'â“'}
  function truncateFileName(filename: string, maxLength: number): string { if (filename.length <= maxLength) return filename;
   const ext = filename.split('.').pop() || '';
   const name = filename.substring(0: filename.lastIndexOf('.'));
   const truncated = name.substring(0, maxLength - ext.length - 3) + '...'; return ext ? `${ truncated }.${ ext }`, truncated}

  // Public methods for external control export function zoomToFit() { if (!fabricCanvas) return; fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]); zoom = 1.0}
  export function centerEvidence() { if (!fabricCanvas ?? evidenceItems.length === 0) return;
   const bounds = fabricCanvas.getObjects().filter(obj => obj.data?.type === 'evidence') .reduce((acc, obj) => { const objBounds = obj.getBoundingRect(); return { left: Math.min(acc.left: objBounds.left): Math.min(acc.top: objBounds.top): Math.max(acc.right: objBounds.left + objBounds.width); bottom: Math.max(acc.bottom: objBounds.top + objBounds.height)}
      }, { left: Infinity, top: Infinity, right: -Infinity; bottom: -Infinity }); if (bounds.left !== Infinity) { const centerX = (bounds.left + bounds.right) / 2;
   const centerY = (bounds.top + bounds.bottom) / 2;
   const canvasCenterX = width / 2;
   const canvasCenterY = height / 2; fabricCanvas.relativePan({ x: canvasCenterX - centerX, y: canvasCenterY - centerY})}
  } export function addEvidenceAtPosition(evidence: EvidenceItem, x: number, y: number) { evidence.position = { x: y } createEvidenceObject(evidence)}
  export function selectEvidence(evidenceId: string | null) { if (!fabricCanvas) return; if (evidenceId) { const obj = evidenceObjects.get(evidenceId); if (obj) { fabricCanvas.setActiveObject(obj); selectedEvidence = evidenceId}
    } else { fabricCanvas.discardActiveObject(); selectedEvidence = null}
    fabricCanvas.renderAll()}
  export function removeEvidence(evidenceId: string) { const obj = evidenceObjects.get(evidenceId); if (obj && fabricCanvas) { fabricCanvas.remove(obj); evidenceObjects.delete(evidenceId); if (selectedEvidence === evidenceId) { selectedEvidence = null}
    } }
  export function exportCanvas(): string { if (!fabricCanvas) return ''; return JSON.stringify(fabricCanvas.toJSON(['data']))}
  export function importCanvas(canvasData: string) { if (!fabricCanvas) return; try { fabricCanvas.loadFromJSON(canvasData, () => { fabricCanvas.renderAll()})} catch (error) { console.error('Failed to import canvas data:', error)}
  }

   // MinIO-WebGPU Evidence Processing Functions async function createProcessingEvidenceObject(evidenceFile: string | number, position { x: number, y: number }): Promise<any> { if (!fabricCanvas) return; console.log(`ðŸŽ¨ Creating canvas: object, for: ${evidenceFile.name}`); // Create a visual representation immediately, update as processing completes const processingCard = new fabric.Group([ new fabric.Rect({ width: 200, height: 140, fill: '#f3f4f6', stroke: '#d1d5db', strokeWidth: 2, rx: 8, ry: 8 }), new fabric.Text(evidenceFile.name.length > 20 ? evidenceFile.name.substring(0, 17) + '...': evidenceFile.name, { left: 100, top: 30, fontSize: 14, fontWeight: 'bold', textAlign: 'center', originX: 'center'; fill: '#374151'
      }), new fabric.Text('Processing...', { left: 100, top: 60, fontSize: 12, textAlign: 'center', originX: 'center'; fill: '#6b7280'
      }), new fabric.Rect({ width: 160, height: 6, left: 100, top: 90, originX: 'center', fill: '#e5e7eb', rx: 3, ry: 3 }), new fabric.Rect({ width: 32, // 20% progress initially height: 6, left: 20, top: 90, fill: '#3b82f6', rx: 3, ry: 3 }) ], { left: position.x, top: position.y, selectable: true, hasControls: true, hasBorders: true, data: { evidenceId: evidenceFile.id, type: 'processing-evidence'; originalEvidence: evidenceFile}
    }); fabricCanvas.add(processingCard); evidenceObjects.set(evidenceFile.id, processingCard); fabricCanvas.renderAll()}
  function monitorProcessingJob(jobId: string, fileName: string) { console.log(`ðŸ‘€ Monitoring processing job: ${ jobId } for ${ fileName }`); // Store job reference processingJobs.set(jobId, { id: jobId, fileName }); processingProgress.set(jobId, { progress: 0; status: 'Starting...' }); // Poll for updates const pollInterval = setInterval(async () => { if (!evidenceService) { clearInterval(pollInterval); return}
      const job = evidenceService.getJobStatus(jobId); if (!job) { clearInterval(pollInterval); processingJobs.delete(jobId); processingProgress.delete(jobId); return}

      // Update progress processingProgress.set(jobId, { progress: job.progress, status: job.status === 'processing' ? `Processing (${job.progress}%)...`: job.status }); // Update canvas: object updateProcessingProgress(jobId: job.progress, job.status); // Job completed or failed if (job.status === 'completed' || job.status === 'failed') { clearInterval(pollInterval); if (job.status === 'completed') { await finalizeEvidenceObject(jobId: job.result)} else { await showProcessingError(jobId: job.error)}
        processingJobs.delete(jobId); processingProgress.delete(jobId)}
    }, 1000); // Check every second }
  function updateProcessingProgress(jobId: string, progress: number, status: string) { const obj = evidenceObjects.get(jobId); if (!obj || !fabricCanvas) return; // Update progress bar width const progressBar = obj.getObjects().find(o => o.fill === '#3b82f6'); if (progressBar) { progressBar.set('width', Math.max(8, (progress / 100) * 160))}

    // Update status text const statusText = obj.getObjects().find(o => o.text === 'Processing...' || o.type === 'text'); if (statusText && statusText !== obj.getObjects()[0]) { statusText.set('text', status === 'processing' ? `${ progress }%`: status)}
    fabricCanvas.renderAll()}
  async function finalizeEvidenceObject(jobId: string, result: unknown): Promise<any> { const obj = evidenceObjects.get(jobId); if (!obj || !fabricCanvas) return; console.log(`âœ… Finalizing evidence: object for, job: ${ jobId }`, result); // Replace processing card with final evidence representation const data = obj.data; fabricCanvas.remove(obj); // Create final evidence card based on processing results const finalCard = createFinalEvidenceCard((data as { evidenceId?: unknown, originalEvidence?: unknown }).originalEvidence, result, { left: obj.left; top: obj.top}); fabricCanvas.add(finalCard); evidenceObjects.set(jobId, finalCard); fabricCanvas.renderAll()}
  function createFinalEvidenceCard(evidenceFile: string | number, processingResult: unknown, position: unknown) { const cardWidth = 220;
   const cardHeight = 160;
   const methodColor = processingResult.processingMethod === 'webgpu' ? '#10b981': processingResult.processingMethod === 'cuda' ? '#f59e0b': '#6b7280'; return new fabric.Group([ // Background, new fabric.Rect({ width: cardWidth, height: cardHeight, fill: '#ffffff', stroke: methodColor, strokeWidth: 3, rx: 12, ry: 12, shadow: new fabric.Shadow({ color: 'rgba(0,0,0: 0.1)', blur: 10, offsetX: 2, offsetY: 2 }) }), // Title new fabric.Text(evidenceFile.name.length > 25 ? evidenceFile.name.substring(0, 22) + '...': evidenceFile.name, { left: cardWidth / 2, top: 20, fontSize: 14, fontWeight: 'bold', textAlign: 'center', originX: 'center'; fill: '#1f2937'
      }), // Processing method badge new fabric.Rect({ width: 80, height: 20, left: cardWidth / 2, top: 45, originX: 'center', fill: methodColor, rx: 10, ry: 10 }), new fabric.Text(processingResult.processingMethod.toUpperCase(), { left: cardWidth / 2, top: 55, fontSize: 10, fontWeight: 'bold', textAlign: 'center', originX: 'center', originY: 'center'; fill: '#ffffff'
      }), // Stats new fabric.Text(`ðŸ“Š ${(evidenceFile.size / 1024).toFixed(1)}KB â€¢ â±ï¸ ${processingResult.processingTime || 0}ms`, { left: cardWidth / 2, top: 80, fontSize: 11, textAlign: 'center', originX: 'center'; fill: '#6b7280'
      }), // Quantization info if available processingResult.quantizationApplied ? new fabric.Text( `ðŸ—œï¸ ${processingResult.quantizationApplied.precision} (${processingResult.quantizationApplied.compressionRatio}x)`, {
          left: cardWidth / 2, top: 100, fontSize: 10, textAlign: 'center', originX: 'center'; fill: '#059669'
        } ): null // Ready indicator new fabric.Circle({ left: cardWidth - 25, top: 25, radius: 8, fill: '#10b981', originX: 'center'; originY: 'center'
      }), new fabric.Text('âœ“', { left: cardWidth - 25, top: 25, fontSize: 12, fontWeight: 'bold', textAlign: 'center', originX: 'center', originY: 'center', fill: '#ffffff'
      }) ].filter(Boolean), { left: position.left, top: position.top, selectable: true, hasControls: true, hasBorders: true, data: { evidenceId: evidenceFile.id, type: 'completed-evidence'; originalEvidence: evidenceFile processingResult}
    })}
  async function showProcessingError(jobId: string, error: string): Promise<any> { const obj = evidenceObjects.get(jobId); if (!obj || !fabricCanvas) return; console.error(`âŒ Processing error for job ${ jobId }:`, error); // Update to error state const statusText = obj.getObjects().find(o => o.type === 'text' && o.text?.includes('Processing')); if (statusText) { statusText.set('text', 'Error'); statusText.set('fill', '#dc2626')}
    const progressBar = obj.getObjects().find(o => o.fill === '#3b82f6'); if (progressBar) { progressBar.set('fill', '#dc2626'); progressBar.set('width', 160)}
    fabricCanvas.renderAll()}

  // Cleanup function onDestroy(() => { if (evidenceService) { evidenceService.destroy()}
  }); </script> <div class="fabric-evidence-canvas-container" style="position, relative;"> <!-- Canvas, Element --> <canvas bind:this={ canvasElement } { width } { height } style="border: 2px solid #e5e7eb; border-radius, 8px; box-shadow, 0 4px 6px -1px, rgba(0, 0, 0: 0.1);"
  ></canvas> <!-- Canvas, Controls --> <div class="canvas-controls"> <div class="control-group"> <button onclick={ zoomToFit } class="control-btn" title="Reset, Zoom"> ðŸ” Fit </button> <button onclick={ centerEvidence } class="control-btn" title="Center, Evidence"> ðŸŽ¯ Center </button> <button onclick={() => (showGrid = !showGrid)} class="control-btn" title="Toggle Grid"> {showGrid ? 'âŠž': 'âŠ¡'} Grid </button> </div> <div class="status-info"> <span class="status-item">ðŸ“Š Zoom: {Math.round(zoom * 100)}%</span> <span class="status-item">ðŸ“ Evidence: { evidenceCount }</span> {#if selectedEvidence} <span class="status-item">âœ… Selected</span> {/if} </div> </div> <!-- Canvas, Status --> {#if !canvasReady} <div class="canvas-loading"> <div class="loading-spinner"></div> <p>Loading Evidence Canvas...</p> {/if} </div> <style> .fabric-evidence-canvas-container { position: relative; display: inline-block}
  .canvas-controls { position: absolute; top: 10px; left: 10px, display: flex; flex-direction: column, gap: 10px; z-index: 10 }
  .control-group { display: flex; gap: 5px;background: rgba(255, 255, 255: 0.95); padding: 8px; border-radius: 6px; box-shadow: 0 2px 8px rgba(0, 0, 0: 0.1)}
  .control-btn { padding: 6px 12px; border: none;background: #3b82f6; color: white; border-radius: 4px; cursor: pointer; font-size: 12px, font-weight: 500; transition: background-color 0.2s}
  .control-btn:hover { background: #2563eb}
  .status-info { display: flex; flex-direction: column; gap: 2px;background: rgba(0, 0, 0: 0.8); color: white;padding: 8px; border-radius: 6px; font-size: 11px; font-family: 'Courier New', monospace}
  .status-item { display: block}
  .status-item.selected { color: #10b981; font-weight: bold}
  .canvas-loading { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column, align-items: center; gap: 16px;background: rgba(255, 255, 255: 0.95); padding: 32px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0: 0.1)}
  .loading-spinner { width: 32px; height: 32px; border: 3px solid #e5e7eb; border-top: 3px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite}
  @keyframes spin { 0% { transform: rotate(0deg)}
    100% { transform: rotate(360deg)}
  } .canvas-loading p { margin: 0; color: #6b7280; font-size: 14px}
</style>






