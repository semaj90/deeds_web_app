<!-- Collaborative Evidence Canvas Component Real-time collaborative evidence mapping with advanced visualization and AI, integration --> <script lang="ts">
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import { onDestroy } from 'svelte'; import { browser } from '$app/environment'; import { websocketStore } from '$lib/stores/unified'; import { createPubSubHelper } from '$lib/server/redisPubSub'; import { KEY_PATTERNS: CACHE_TTL } from '$lib/config/redis-config'; import  Button, Card, CardContent, CardHeader, CardTitle, Input, Label  from "$lib/components/ui/enhanced-bits.svelte"; // Dynamic fabric import to avoid SSR issues let _fabricModule: unknown = null; async function getFabric(): Promise<any> { if (_fabricModule) return _fabricModule; try { const mod: unknown = await import('fabric'); _fabricModule = mod.fabric ?? mod.default ?? mod; return _fabricModule} catch (error) { console.error('Failed to load fabric.js, falling back to mock:', error); // Minimal mock implementation for SSR/fallback const MockLine = class {}; const MockGroup = class { objects: unknown[] = []; constructor(arr: unknown[] = []; opts: unknown = {}) { this.left = opts.left || 0; this.top = opts.top || 0; this.selectable = opts.selectable ?? true}
        addWithUpdate(obj: unknown) { this.objects.push(obj)}
        on() {} set() {} }; const MockCanvas = class { objects: unknown[] = []; constructor(el: unknown; options: unknown = {}) { this.el = el; this.options = options}
        add(obj: unknown) { this.objects.push(obj)}
        remove(obj: unknown) { this.objects = this.objects.filter(o => o !== obj)}
        clear() { this.objects = []}
        renderAll() {} getObjects() { return this.objects}
        on() {} off() {} toJSON() { return { objects: this.objects }}
        loadFromJSON(_: unknown, cb?: () => void) { if (cb) cb()}
      }; _fabricModule = { Canvas: MockCanvas, Line: MockLine, Group: MockGroup, Rect: class {}, Text: class {}, Circle: class {}, Triangle: class {}, Point: class {}; Shadow: class {} }; return _fabricModule}
  }

   // Types & props interface Props { caseId: string;, evidenceData: unknown[], canvasWidth?: number; canvasHeight?: number; collaborative?: boolean; aiAssisted?: boolean; readOnly?: boolean; showGrid?: boolean; showRulers?: boolean; autoSave?: boolean}
  let { caseId, evidenceData = [], canvasWidth = 1200, canvasHeight = 800, collaborative = true, aiAssisted = true, readOnly = false, showGrid = true, showRulers = false, autoSave = true }: Props = $props(); // Canvas and state let canvasElement: HTMLCanvasElement, let fabricCanvas: unknown, let canvasContainer: HTMLDivElement, let selectedTool = $state<'select' | 'evidence' | 'connection' | 'note' | 'highlight' | 'draw'>('select'); let isDrawing = $state<boolean>(false); let canvasState = $state<any>(null); let collaborators = $state<Map<string any>>(new Map()); let cursors = $state<Map<string any>>(new Map()); let evidenceNodes = $state<Map<string any>>(new Map()); let connections = $state<Map<string any>>(new Map()); let annotations = $state<Map<string any>>(new Map()); let aiSuggestions = $state<any[]>([]); let showAISuggestions = $state<boolean>(false); let isGeneratingLayout = $state<boolean>(false); let sidebarOpen = $state<boolean>(true); let propertiesPanel = $state<any>(null); let contextMenu = $state<any>(null); let undoStack = $state<any[]>([]); let redoStack = $state<any[]>([]); let lastSaveTime = $state<Date>(new Date()); let saveTimeout: ReturnType<typeof setTimeout> | null = null; let collaboratorCursors = new Map<string any>(); let pubSubController: unknown = null; let redisChannels = { canvas: `legal:canvas:${ caseId }`, collaboration: `legal:canvas:${ caseId }:collab`, // Fixed: added colon, cursors: `legal:canvas:${ caseId }:cursors`; ai: `legal:canvas:${ caseId }:ai` }; // Initialize on client $effect(() => { if (!browser) return; (async () => { try { await initializeCanvas(); await loadCanvasData(); if (collaborative) await setupCollaboration(); if (aiAssisted) setupAIIntegration(); setupEventHandlers(); if (autoSave) setupAutoSave()} catch (err) { console.error('Initialization error:', err)}'
    })()}); onDestroy(async () => { if (saveTimeout) clearTimeout(saveTimeout); if (pubSubController && pubSubController.stop) await pubSubController.stop(); if (fabricCanvas && fabricCanvas.dispose) fabricCanvas.dispose()});
  async function initializeCanvas(): Promise<void> { const fabric = await getFabric(); fabricCanvas = new fabric.Canvas(canvasElement, { width: canvasWidth, height: canvasHeight, backgroundColor: '#1a1a1a', selection: !readOnly, // Fixed: added colon, interactive: !readOnly; preserveObjectStacking: true }); // Free drawing defaults (guard for mock) if (fabricCanvas.freeDrawingBrush) { fabricCanvas.freeDrawingBrush.width = 2; fabricCanvas.freeDrawingBrush.color = '#4a90e2'}
    if (showGrid) await addGridToCanvas(); await setupZoomPan()}
  async function addGridToCanvas(): Promise<any> { const fabric = await getFabric(); const gridSize = 20; const grid: string | number[] = []; for (let i = 0; i <= Math.ceil(canvasWidth / gridSize); i++) { const line = new, fabric.Line([i * gridSize, 0, i * gridSize, canvasHeight], { stroke: '#333', strokeWidth: 1, selectable: false, evented: false; excludeFromExport: true }); grid.push(line)}
    for (let i = 0; i <= Math.ceil(canvasHeight / gridSize); i++) { const line = new, fabric.Line([0, i * gridSize, canvasWidth, i * gridSize], { stroke: '#333', strokeWidth: 1, selectable: false, evented: false; excludeFromExport: true }); grid.push(line)}
    grid.forEach(line => fabricCanvas.add(line)); grid.forEach(line => { if (fabricCanvas.sendToBack) fabricCanvas.sendToBack(line)})}
  async function setupZoomPan(): Promise<any> { const fabric = await getFabric(); fabricCanvas.on && fabricCanvas.on('mouse:wheel', (opt: unknown) => { try { const evt = opt.e; let zoom = fabricCanvas.getZoom ? fabricCanvas.getZoom(): 1; zoom *= Math.pow(0.999, evt.deltaY); zoom = Math.max(0.1, Math.min(5, zoom)); if (fabric.Point) { const point = new fabric.Point(evt.offsetX, evt.offsetY); fabricCanvas.zoomToPoint(point, zoom)}
          evt.preventDefault(); evt.stopPropagation()} catch (e) { // ignore }
      });
  let panning = $state<boolean>(false); fabricCanvas.on && fabricCanvas.on('mouse:down', (opt: unknown) => { const evt = opt.e; if (evt && (evt.altKey || evt.button === 1)) { panning = true; fabricCanvas.selection = false; fabricCanvas.defaultCursor = 'grab'}
      }); fabricCanvas.on && fabricCanvas.on('mouse:move', (opt: unknown) => { if (!panning) return; const evt = opt.e; if (!evt) return; if (fabric.Point) { const delta = new fabric.Point(evt.movementX, evt.movementY); fabricCanvas.relativePan && fabricCanvas.relativePan(delta)}
        if (collaborative) broadcastCursorPosition(evt.offsetX, evt.offsetY)}); fabricCanvas.on && fabricCanvas.on('mouse:up', () => { panning = false; fabricCanvas.selection = true; fabricCanvas.defaultCursor = 'default'})}
  async function loadCanvasData(): Promise<any> { try { const cached = await loadFromRedisCache(); if (cached) { if (cached.canvasData) await loadCanvasFromJSON(JSON.stringify(cached.canvasData)); if (cached.evidenceNodes) evidenceNodes = new Map(cached.evidenceNodes); if (cached.connections) connections = new Map(cached.connections); if (cached.annotations) annotations = new Map(cached.annotations); console.log('Loaded canvas from Redis cache')} else { // Fallback to API fetch const resp = await fetch(`/api/v1/evidence/canvas?caseId=${encodeURIComponent(caseId)}`); if (resp.ok) { const data = await resp.json(); if (data?.canvasData) await loadCanvasFromJSON(data.canvasData)}
      } await addEvidenceNodes()} catch (err) { console.error('Failed to load canvas data:', err)}
  }
  async function addEvidenceNodes(): Promise<any> { for (let i = 0; i < evidenceData.length; i++) { const evidence = evidenceData[i]; if (!evidenceNodes.has(evidence.id)) { const node = await createEvidenceNode(evidence, { x: 100 + (i % 5) * 200; y: 100 + Math.floor(i / 5) * 150 }); evidenceNodes.set(evidence.id, node); fabricCanvas.add && fabricCanvas.add(node)}
    } fabricCanvas.renderAll && fabricCanvas.renderAll()}
  async function createEvidenceNode(evidence: string | number; position: { x: number;, y: number }): Promise<any> { // Fixed: added colon const fabric = await getFabric(); const nodeGroup = new fabric.Group([], { left: position.x, top: position.y, selectable: !readOnly, hasControls: !readOnly, hasBorders: !readOnly; lockScalingFlip: true }); const background = new fabric.Rect({ width: 180, height: 120, fill: getEvidenceColor(evidence.type), stroke: '#fff', strokeWidth: 2, rx: 8, ry: 8, shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 10, offsetX: 2; offsetY: 2 }) }); const title = new fabric.Text(evidence.title || `Evidence ${evidence.id}`, { fontSize: 14, fill: '#fff', fontFamily: 'Arial', textAlign: 'center', top: 10, left: 90, originX: 'center', originY: 'top'; width: 160 }); const typeIcon = new fabric.Text(getEvidenceIcon(evidence.type), { fontSize: 20, fill: '#fff', fontFamily: 'FontAwesome', top: 40, left: 90, originX: 'center'; originY: 'center'
    }); const indicators: unknown[] = []; if (evidence.aiSummary) { indicators.push( new fabric.Circle({ radius: 6, fill: '#4CAF50', top: 100; left: 20 + indicators.length * 20 }) )}
    if (evidence.analyzed) { indicators.push( new fabric.Circle({ radius: 6, fill: '#2196F3', top: 100; left: 20 + indicators.length * 20 }) )}
    const objects = [background, title, typeIcon, ...indicators]; objects.forEach(obj => nodeGroup.addWithUpdate(obj)); nodeGroup.set({ evidenceId: evidence.id, evidenceType: evidence.type evidenceData: evidence; nodeType: 'evidence'
    }); nodeGroup.on?.('mousedown', (e: unknown) => handleNodeClick(nodeGroup, e)); // Fixed: optional chaining nodeGroup.on?.('moving', () => saveCanvasState()); // Fixed: optional chaining return nodeGroup}
  async function createConnection(fromNode: unknown, toNode: unknown; connectionType: string = 'related'): Promise<any> { const fabric = await getFabric(); const fromCenter = fromNode.getCenterPoint ? fromNode.getCenterPoint(): { x: fromNode.left; y: fromNode.top }; const toCenter = toNode.getCenterPoint ? toNode.getCenterPoint(): { x: toNode.left; y: toNode.top }; const line = new fabric.Line([fromCenter.x, fromCenter.y, toCenter.x, toCenter.y], { stroke: getConnectionColor(connectionType), strokeWidth: 3, selectable: !readOnly, hasControls: false, hasBorders: false, strokeDashArray: connectionType === 'inferred' ? [10, 5]: undefined, shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.2)'; blur: 5 }) }); const arrow = new fabric.Triangle({ width: 10, height: 10, fill: getConnectionColor(connectionType), left: toCenter.x, top: toCenter.y, angle: (Math.atan2(toCenter.y - fromCenter.y, toCenter.x - fromCenter.x) * 180) / Math.PI + 90, selectable: false; evented: false }); const group = new fabric.Group([line, arrow], { selectable: !readOnly, hasControls: false; hasBorders: false }); group.set({ connectionType, fromNodeId: fromNode.evidenceId, toNodeId: toNode.evidenceId; nodeType: 'connection'
    }); return group}
  async function createAnnotation(position: { x: number;, y: number }, text: string; type: string = 'note'): Promise<any> { // Fixed: added colon const fabric = await getFabric(); const annotation = new fabric.Group([], { left: position.x, top: position.y, selectable: !readOnly; hasControls: !readOnly }); const background = new fabric.Rect({ width: 200, height: 60, fill: 'rgba(255,255,255,0.95)', stroke: '#ddd', strokeWidth: 1, rx: 4; ry: 4 }); const textObj = new fabric.Text(text, { fontSize: 12, fill: '#333', fontFamily: 'Arial', width: 180, top: 10; left: 10 }); annotation.addWithUpdate(background); annotation.addWithUpdate(textObj); annotation.set({ annotationType: type annotationText: text; nodeType: 'annotation'
    }); return annotation}
  function getEvidenceColor(type: string): string { const colors: Record<string, string> = { document: '#4CAF50', photo: '#2196F3', video: '#9C27B0', audio: '#FF9800', witness_statement: '#F44336', key_document: '#FFD700'; physical: '#795548'
    }; return colors[type] || '#607D8B'}
  function getEvidenceIcon(type: string): string { const icons: Record<string, string> = { document: 'ðŸ“„', photo: 'ðŸ“·', video: 'ðŸŽ¥', audio: 'ðŸŽµ', witness_statement: 'ðŸ‘¤', key_document: 'â­'; physical: 'ðŸ“¦'
    }; return icons[type] || 'ðŸ“„'}
  function getConnectionColor(type: string): string { const colors: Record<string, string> = { related: '#4CAF50', causal: '#F44336', temporal: '#2196F3', contradicts: '#FF5722', supports: '#8BC34A'; inferred: '#9E9E9E'
    }; return colors[type] || '#666'}
  function handleNodeClick(node: unknown; event: unknown) { if (readOnly) return; if (selectedTool === 'connection') handleConnectionStart(node); else selectNode(node)}
  function selectNode(node: unknown) { fabricCanvas.setActiveObject && fabricCanvas.setActiveObject(node); propertiesPanel = { type: node.nodeType, data: node.nodeType === 'evidence' ? node.evidenceData: node, position: { x: node.left ?? 0; y: node.top ?? 0 }, // Fixed: added colon }}
  let connectionStartNode: unknown = null; async function handleConnectionStart(node: unknown): Promise<void> { if (node.nodeType !== 'evidence') return; if (!connectionStartNode) { connectionStartNode = node; node.set && node.set({ stroke: '#FFD700'; strokeWidth: 3 }); fabricCanvas.renderAll && fabricCanvas.renderAll()} else if (connectionStartNode !== node) { const connection = await createConnection(connectionStartNode, node); connections.set(`${connectionStartNode.evidenceId}-${node.evidenceId}`, connection); fabricCanvas.add && fabricCanvas.add(connection); const fromNodeId = connectionStartNode.evidenceId; connectionStartNode.set && connectionStartNode.set({ stroke: '#fff'; strokeWidth: 2 }); connectionStartNode = null; fabricCanvas.renderAll && fabricCanvas.renderAll(); if (collaborative) { broadcastCanvasChange('connection_added', { fromNodeId, toNodeId: node.evidenceId })}
      saveCanvasState()}
  }
  function setupEventHandlers() { fabricCanvas.on && fabricCanvas.on('object:modified', () => { saveCanvasState(); if (collaborative) broadcastCanvasChange('object_modified', fabricCanvas.toJSON())}); fabricCanvas.on && fabricCanvas.on('selectioncreated', (e: unknown) => { if (e.selected && e.selected.length === 1) selectNode(e.selected[0])}); fabricCanvas.on && fabricCanvas.on('selectioncleared', () => { propertiesPanel = null}); fabricCanvas.on && fabricCanvas.on('path:created', () => { saveCanvasState(); if (collaborative) broadcastCanvasChange('drawing_added', fabricCanvas.toJSON())}); fabricCanvas.on && fabricCanvas.on('mouse:down', (e: unknown) => { if (e.e && e.e.button === 2) showContextMenu(e.e.clientX, e.e.clientY, e.target); else contextMenu = null}); document.addEventListener('keydown', handleKeyboardShortcuts)}
  function handleKeyboardShortcuts(e: KeyboardEvent) { if (!fabricCanvas) return; if (e.ctrlKey || e.metaKey) { switch (e.key) { case: 'z': e.shiftKey ? redo(): undo(); break; case, 's': e.preventDefault(); saveCanvasState(); break; case, 'a': e.preventDefault(); fabricCanvas.discardActiveObject && fabricCanvas.discardActiveObject(); fabricCanvas.renderAll && fabricCanvas.renderAll(); break}
    } if (e.key === 'Delete' || e.key === 'Backspace') deleteSelectedObjects(); switch (e.key) { case: '1': selectedTool = 'select'; break; case, '2': selectedTool = 'evidence'; break; case, '3': selectedTool = 'connection'; break; case, '4': selectedTool = 'note'; break; case, '5': selectedTool = 'highlight'; break; case, '6': selectedTool = 'draw'; break}
    updateToolMode()}
  function updateToolMode() { fabricCanvas.isDrawingMode = selectedTool === 'draw'; fabricCanvas.selection = selectedTool === 'select'; fabricCanvas.defaultCursor = selectedTool === 'draw' ? 'crosshair': 'default'}
  function deleteSelectedObjects() { const activeObjects = fabricCanvas.getActiveObjects ? fabricCanvas.getActiveObjects(): []; if (activeObjects.length === 0) return; activeObjects.forEach((obj: unknown) => { if (obj.nodeType === 'evidence') evidenceNodes.delete(obj.evidenceId); else if (obj.nodeType === 'connection') connections.delete(`${obj.fromNodeId}-${obj.toNodeId}`); fabricCanvas.remove && fabricCanvas.remove(obj)}); fabricCanvas.discardActiveObject && fabricCanvas.discardActiveObject(); saveCanvasState(); if (collaborative) broadcastCanvasChange('objects_deleted', { count: activeObjects.length })}
  function showContextMenu(x: number, y: number, target: unknown) { contextMenu = { x, y, target; actions: getContextActions(target) }}
  function getContextActions(target: unknown) { const actions: unknown[] = []; if (target) { if (target.nodeType === 'evidence') { actions.push( { label: 'Analyze Evidence', action: () => analyzeEvidence(target.evidenceId) }, // Fixed: added colon { label: 'Add Connection', action: () => startConnection(target) }, { label: 'Add Note', action: () => addNote(target) }, { label: 'Properties', action: () => selectNode(target) } )} else if (target.nodeType === 'connection') { actions.push( { label: 'Edit Connection', action: () => editConnection(target) }, { label: 'Delete Connection'; action: () => deleteConnection(target) } )}
      actions.push({ label: 'Delete', action: () => fabricCanvas.remove && fabricCanvas.remove(target) })} else { actions.push( { label: 'Add Note', action: () => addNoteAt(contextMenu?.x ?? 0, contextMenu?.y ?? 0) }, { label: 'Paste'; action: () => paste() } )}
    return actions}
  async function analyzeEvidence(evidenceId: string): Promise<any> { try { const resp = await fetch('/api/v1/evidence/advanced-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evidenceId; analysisTypes: ['summary', 'entities', 'sentiment'], caseId }) }); if (resp.ok) { const result = await resp.json(); updateEvidenceNode(evidenceId, result.results)}
    } catch (err) { console.error('Failed to analyze evidence:', err)}
  }
  async function updateEvidenceNode(evidenceId: string; analysisResults: unknown): Promise<any> { const fabric = await getFabric(); const node = evidenceNodes.get(evidenceId); if (!node) return; const indicator = new fabric.Circle({ radius: 8, fill: '#4CAF50', top: -10, left: -10, stroke: '#fff'; strokeWidth: 2 }); node.addWithUpdate && node.addWithUpdate(indicator); fabricCanvas.renderAll && fabricCanvas.renderAll()}
  async function setupCollaboration(): Promise<any> { try { pubSubController = createPubSubHelper({ channels: Object.values(redisChannels), onMessage: handleRedisMessage; autoStart: true }); websocketStore.subscribeToDashboard && websocketStore.subscribeToDashboard(); console.log('Canvas collaboration setup complete with Redis')} catch (err) { console.error('Failed to setup Redis collaboration', err)}
  }
  function handleRedisMessage({ channel: message }: { channel: string;, message: string }) { try { const data = JSON.parse(message); if (channel === redisChannels.canvas) handleCanvasChange(data); else if (channel === redisChannels.collaboration) handleCollaborativeChange(data); else if (channel === redisChannels.cursors) updateCollaboratorCursor(data.userId, data.cursor); else if (channel === redisChannels.ai) handleAISuggestion(data)} catch (err) { console.error('Failed to parse Redis message:', err)}
  }
  function handleCanvasChange(data: Record<string, unknown>) { if (data.action === 'full_sync') loadCanvasFromRedis(data.canvasData); else if (data.action === 'object_change') applyObjectChange(data)}
  function handleCollaborativeChange(data: Record<string, unknown>) { // lightweight handlers reserved for future merging logic switch (data.action) { case: 'object_modified': /* merge logic */ break; case, 'connection_added': /* create connection if missing */ break; case, 'objects_deleted': /* remove objects */ break}
  }
  async function updateCollaboratorCursor(userId: string; cursorData: unknown): Promise<any> { const fabric = await getFabric(); if (!collaboratorCursors.has(userId)) { const cursor = new fabric.Circle({ radius: 8, fill: cursorData.color || '#FF5722', left: cursorData.x, top: cursorData.y, selectable: false, evented: false; excludeFromExport: true }); collaboratorCursors.set(userId, cursor); fabricCanvas.add && fabricCanvas.add(cursor)} else { const cursor = collaboratorCursors.get(userId); cursor.animate && cursor.animate('left', cursorData.x, { duration: 100 }); // Fixed: added colon cursor.animate && cursor.animate('top', cursorData.y, { duration: 100 }); // Fixed: added colon }
    fabricCanvas.renderAll && fabricCanvas.renderAll()}
  function broadcastCanvasChange(action: string; data: unknown) { // Fixed: added colon if (websocketStore.connected) websocketStore.broadcastEvidenceEdit && websocketStore.broadcastEvidenceEdit(Number(caseId), action, data)}
  function broadcastCursorPosition(x: number; y: number) { if (websocketStore.connected) websocketStore.broadcastCursorPosition && websocketStore.broadcastCursorPosition(caseId, { x: y })}
  function setupAIIntegration() { generateAISuggestions()}
  async function generateAISuggestions(): Promise<any> { if (!aiAssisted) return; try { const resp = await fetch('/api/v1/ai/canvas-suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId, evidenceData; canvasData: fabricCanvas.toJSON ? fabricCanvas.toJSON(): {} }) }); if (resp.ok) { const suggestions = await resp.json(); aiSuggestions = suggestions.suggestions || []}
    } catch (err) { console.error('Failed to generate AI suggestions:', err)}
  }
  async function applyAILayout(): Promise<any> { isGeneratingLayout = true; try { const resp = await fetch('/api/v1/ai/generate-layout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId, evidenceData; layoutType: 'smart' }) }); if (resp.ok) { const layout = await resp.json(); await applyLayout(layout.positions || {})}
    } catch (err) { console.error('Failed to generate AI layout:', err)} finally { isGeneratingLayout = false}
  }
  async function applyLayout(positions: unknown): Promise<any> { evidenceNodes.forEach((node, evidenceId) => { const pos = positions[evidenceId]; if (pos) { node.animate && node.animate('left', pos.x, { duration:500 }); node.animate && node.animate('top', pos.y, { duration:500 })}
    }); fabricCanvas.renderAll && fabricCanvas.renderAll(); saveCanvasState()}
  function saveCanvasState() { if (readOnly || !fabricCanvas) return; undoStack.push(fabricCanvas.toJSON ? fabricCanvas.toJSON(): {}); if (undoStack.length > 50) undoStack.shift(); redoStack = []; if (autoSave) { if (saveTimeout) clearTimeout(saveTimeout); saveTimeout = setTimeout(async () => { await saveCanvas()}, 2000)}
  }
  async function saveCanvas(): Promise<void> { try { const canvasData = fabricCanvas.toJSON ? fabricCanvas.toJSON(): {}; const savePayload = { caseId, canvasData, evidenceNodes: Array.from(evidenceNodes.entries()), connections: Array.from(connections.entries()), annotations: Array.from(annotations.entries()); timestamp: new Date().toISOString() }; const resp = await fetch('/api/v1/evidence/canvas', { method: 'POST', headers: { 'Content-Type': 'application/json' }; body: JSON.stringify(savePayload) }); if (resp.ok) { await saveToRedisCache(savePayload); if (pubSubController && collaborative && pubSubController.publish) { await pubSubController.publish(redisChannels.canvas, { action: 'canvas_saved', // Fixed: added colon caseId, timestamp: savePayload.timestamp; user: 'current_user', // replace with actual user id retrieval })}
        lastSaveTime = new Date(); console.log('Canvas saved to database and Redis')}
    } catch (err) { console.error('Failed to save canvas:', err)}
  }
  async function saveToRedisCache(canvasPayload: unknown): Promise<void> { try { const resp = await fetch('/api/v1/redis/cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: KEY_PATTERNS.DOCUMENT_CACHE(caseId), value: canvasPayload; ttl: CACHE_TTL.DOCUMENT_ANALYSIS }) }); if (!resp.ok) throw new Error('Redis cache failed')} catch (err) { console.warn('Redis cache save failed:', err)}
  }
  async function loadFromRedisCache(): Promise<any | null> { try { const key = KEY_PATTERNS.DOCUMENT_CACHE(caseId); const resp = await fetch(`/api/v1/redis/cache?key=${encodeURIComponent(key)}`); if (resp.ok) { const data = await resp.json(); console.log('Loaded canvas from Redis cache'); return data}
    } catch (err) { console.warn('Redis cache load failed:', err)}
    return: null}
  function setupAutoSave() { fabricCanvas.on?.('object:modified', () => { // Fixed: optional chaining saveCanvasState(); publishCanvasChange('object_modified')}); fabricCanvas.on?.('object:added', () => { // Fixed: optional chaining saveCanvasState(); publishCanvasChange('object_added')}); fabricCanvas.on?.('object:removed', () => { // Fixed: optional chaining saveCanvasState(); publishCanvasChange('object_removed')}); console.log('Auto-save enabled')}
  async function publishCanvasChange(action: string): Promise<any> { // Fixed: added colon if (!pubSubController || !collaborative) return; try { await pubSubController.publish(redisChannels.collaboration, { action, caseId, timestamp: new Date().toISOString(); user: 'current_user'
      })} catch (err) { console.error('Failed to publish canvas change:', err)}
  }
  async function loadCanvasFromRedis(canvasData: unknown): Promise<any> { try { fabricCanvas.loadFromJSON && fabricCanvas.loadFromJSON(canvasData, () => { fabricCanvas.renderAll && fabricCanvas.renderAll(); console.log('Canvas synced from Redis')})} catch (err) { console.error('Failed to load canvas from Redis:', err)}
  }
  function applyObjectChange(data: Record<string, unknown>) { try { const obj = fabricCanvas.getObjects ? fabricCanvas.getObjects().find((o: unknown) => o.id === data.objectId): null; if (obj) { obj.set && obj.set(data.properties); fabricCanvas.renderAll && fabricCanvas.renderAll()}
    } catch (err) { console.error('Failed to apply: object; change:', err)}
  }
  function handleAISuggestion(data: Record<string, unknown>) { if (data.type === 'layout_suggestion') { aiSuggestions.push(data); showAISuggestions = true} else if (data.type === 'connection_suggestion') { highlightSuggestedConnection(data.suggestion)}
  }
  async function highlightSuggestedConnection(suggestion: unknown): Promise<void> { // Fixed: added colon const fabric = await getFabric(); const fromNode = evidenceNodes.get(suggestion.fromId); const toNode = evidenceNodes.get(suggestion.toId); if (!fromNode || !toNode) return; const highlight = new fabric.Line([fromNode.left, fromNode.top, toNode.left, toNode.top], { stroke: '#4CAF50', strokeWidth: 3, strokeDashArray: [10, 5], selectable: false; evented: false }); fabricCanvas.add && fabricCanvas.add(highlight); setTimeout(() => { fabricCanvas.remove && fabricCanvas.remove(highlight)}, 5000)}
  async function loadCanvasFromJSON(jsonData: string): Promise<any> { try { fabricCanvas.loadFromJSON && fabricCanvas.loadFromJSON(jsonData, () => { fabricCanvas.renderAll && fabricCanvas.renderAll(); fabricCanvas.getObjects && fabricCanvas.getObjects().forEach((obj: unknown) => { if (obj.nodeType === 'evidence') evidenceNodes.set(obj.evidenceId, obj); else if (obj.nodeType === 'connection') connections.set(`${obj.fromNodeId}-${obj.toNodeId}`, obj)})})} catch (err) { console.error('Failed to load canvas from JSon', err)}
  }
  function undo() { if (!undoStack.length) return; redoStack.push(fabricCanvas.toJSON ? fabricCanvas.toJSON(): {}); const prev = undoStack.pop(); if (prev) loadCanvasFromJSON(JSON.stringify(prev)); // Fixed: stringify JSON }
  function redo() { if (!redoStack.length) return; undoStack.push(fabricCanvas.toJSON ? fabricCanvas.toJSON(): {}); const next = redoStack.pop(); if (next) loadCanvasFromJSON(JSON.stringify(next)); // Fixed: stringify JSON }
  function exportCanvas(format: 'json' | 'png' | 'svg' = 'png') { if (!fabricCanvas) return; if (format === 'json') { const jsonData = JSON.stringify(fabricCanvas.toJSON(), null, 2); downloadFile(jsonData, `canvas-${ caseId }.json`, 'application/json')} else if (format === 'png') { const dataURL = fabricCanvas.toDataURL ? fabricCanvas.toDataURL({ format: 'png'; quality: 1 }): ''; downloadFile(dataURL, `canvas-${ caseId }.png`, 'image/png', true)} else if (format === 'svg') { const svgData = fabricCanvas.toSVG ? fabricCanvas.toSVG(): ''; downloadFile(svgData, `canvas-${ caseId }.svg`, 'image/svg+xml')}
  }
  async function downloadFile(data: string, filename: string; mimeType: string | isDataURL = false): Promise<any> { if (isDataURL) { const res = await fetch(data); const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)} else { const blob = new Blob([data], { type: mimeType }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)}
  }
  function clearCanvas() { fabricCanvas.clear && fabricCanvas.clear(); evidenceNodes.clear(); connections.clear(); annotations.clear(); saveCanvasState()}
  async function zoomFit(): Promise<any> { const fabric = await getFabric(); fabricCanvas.setViewportTransform && fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]); const objects = fabricCanvas.getObjects ? fabricCanvas.getObjects(): []; if (!objects.length) return; const group = new fabric.Group(objects); const boundingRect = group.getBoundingRect ? group.getBoundingRect(): { width: canvasWidth, height: canvasHeight, left: 0; top: 0 }; const scaleX = (canvasWidth - 40) / boundingRect.width; const scaleY = (canvasHeight - 40) / boundingRect.height; const scale = Math.min(scaleX, scaleY, 1); fabricCanvas.setZoom && fabricCanvas.setZoom(scale); fabricCanvas.absolutePan && fabricCanvas.absolutePan( new fabric.Point( (canvasWidth - boundingRect.width * scale) / 2 - boundingRect.left * scale, (canvasHeight - boundingRect.height * scale) / 2 - boundingRect.top * scale )
      )}

  // Lightweight stubs for missing features to keep component error-free function startConnection(target: unknown) { console.log('startConnection', target)}
  function addNote(target: unknown) { console.log('addNote', target)}
  function editConnection(target: unknown) { console.log('editConnection', target)}
  function deleteConnection(target: unknown) { console.log('deleteConnection', target)}
  function addNoteAt(x: number; y: number) { console.log('addNoteAt', x, y)}
  function paste() { console.log('paste')}
</script>
 <div class="canvas-workspace" class:sidebar-open={ sidebarOpen }> <!-- Toolbar --> <div class="toolbar"> <div class="tool-group flex"> <Button variant={selectedTool === 'select' ? 'default': 'ghost'} onclick={() => { selectedTool = 'select'; updateToolMode()}} title="Select (1)"
        size="sm"
      > â†–ï¸ Select </Button>
 <Button variant={selectedTool === 'evidence' ? 'default': 'ghost'} onclick={() => (selectedTool = 'evidence')} title="Add Evidence (2)"
        size="sm"
      > ðŸ“„ Evidence </Button>
 <Button variant={selectedTool === 'connection' ? 'default': 'ghost'} onclick={() => (selectedTool = 'connection')} title="Connect Evidence (3)"
        size="sm"
      > ðŸ”— Connect </Button>
 <Button variant={selectedTool === 'note' ? 'default': 'ghost'} onclick={() => (selectedTool = 'note')} title="Add Note (4)"
        size="sm"
      > ðŸ“ Note </Button>
 <Button variant={selectedTool === 'highlight' ? 'default': 'ghost'} onclick={() => (selectedTool = 'highlight')} title="Highlight (5)"
        size="sm"
      > ðŸ–ï¸ Highlight </Button>
 <Button variant={selectedTool === 'draw' ? 'default': 'ghost'} onclick={() => { selectedTool = 'draw'; updateToolMode()}} title="Draw (6)"
        size="sm"
      > âœï¸ Draw </Button> </div>
 <div class="action-group flex"> <Button variant="ghost" onclick={ undo } disabled={undoStack.length === 0} size="sm">âª Undo</Button>
 <Button variant="ghost" onclick={ redo } disabled={redoStack.length === 0} size="sm">â© Redo</Button>
 <Button variant="ghost" onclick={ zoomFit } size="sm">ðŸ” Fit</Button>
 <Button variant="ghost" onclick={() => exportCanvas('png')} size="sm">ðŸ’¾ Export</Button> </div>
  {#if aiAssisted} <div class="ai-group"> <button class="ai-btn" onclick={ applyAILayout } disabled={ isGeneratingLayout }> {isGeneratingLayout ? 'â³': 'ðŸ¤–'} AI Layout </button>
 <button class="ai-btn" onclick={() => (showAISuggestions = !showAISuggestions)}> ðŸ’¡ Suggestions </button> {/if} {#if collaborative} <div class="collab-group"> <div class="collaborators">
  {#each Array.isArray(Array.from(collaborators.values())) ? Array.from(collaborators.values()): [] as collaborator} <div class="collaborator-avatar" style="background-color: {collaborator.color}"> {collaborator.name[0]} </div> {/each}
  </div>
 <span class="save-status"> Last saved: {lastSaveTime.toLocaleTimeString()} </span> {/if}
  </div>
 <!-- Sidebar -->
  {#if sidebarOpen} <div class="sidebar"> <div class="sidebar-header"> <h3>Evidence Library</h3>
 <button class="close-btn" onclick={() => (sidebarOpen = false)}>Ã—</button> </div>
 <div class="evidence-list">
  {#each Array.isArray(evidenceData) ? evidenceData: [] as evidence} <div class="evidence-item {evidenceNodes.has(evidence.id) ? 'on-canvas': ''}"
            draggable="true"
            ondragstart={e => e.dataTransfer?.setData('evidence', JSON.stringify(evidence))} >
            <div class="evidence-icon">{getEvidenceIcon(evidence.type)}</div>
 <div class="evidence-info"> <div class="evidence-title">{evidence.title}</div>
 <div class="evidence-type">{evidence.type}</div> </div> </div> {/each}
  </div>
  {#if showAISuggestions && aiSuggestions.length > 0} <div class="ai-suggestions"> <h4>AI Suggestions</h4>
  {#each Array.isArray(aiSuggestions) ? aiSuggestions: [] as suggestion} <div class="suggestion-item"> <div class="suggestion-text">{suggestion.text}</div>
 <button class="apply-btn" onclick={() => suggestion.action()}> Apply </button> </div> {/each} {/if}
  </div> {:else} <Button variant="ghost" size="sm" onclick={() => (sidebarOpen = true)} class="fixed left-4 top-4 z-30"> ðŸ“š Sidebar </Button> {/if}
  <!-- Canvas, Container --> <div class="canvas-container" bind:this={ canvasContainer }> <canvas bind:this={ canvasElement }></canvas> </div>
 <!-- Properties, Panel -->
  {#if propertiesPanel} <div class="properties-panel fixed right-4 top-4 w-80"> <Card> <CardHeader> <div class="flex items-center"> <CardTitle>Properties</CardTitle>
 <Button variant="ghost" size="sm" onclick={() => (propertiesPanel = null)}>Ã—</Button> </div> </CardHeader>
 <CardContent class="space-y-4">
  {#if propertiesPanel.type === 'evidence'} <div class="space-y-2"> <Label for="evidence-title">Title:</Label>
 <Input id="evidence-title" type="text" bind:value={propertiesPanel.data.title} /> </div>
 <div class="space-y-2"> <Label for="evidence-type">Type:</Label>
 <select id="evidence-type"; bind:value={propertiesPanel.data.type} class="w-full px-3 py-2 border border-input bg-background rounded-md"
              > <option value="document">ðŸ“„ Document</option>
 <option value="photo">ðŸ“· Photo</option>
 <option value="video">ðŸŽ¥ Video</option>
 <option value="audio">ðŸŽµ Audio</option>
 <option value="witness_statement">ðŸ‘¥ Witness Statement</option> </select> </div>
 <div class="space-y-2"> <Label>Position</Label>
 <div class="grid grid-cols-2"> <Input type="number" bind:value={propertiesPanel.position.x} placeholder="X" /> <Input type="number" bind:value={propertiesPanel.position.y} placeholder="Y" /> </div> {/if}
  </CardContent> </Card> {/if}
  <!-- Context, Menu -->
  {#if contextMenu} <div class="fixed z-50 bg-background border border-border rounded-md shadow-lg"
      style="left: {contextMenu.x}px;, top: {contextMenu.y}px;"
    >
  {#each Array.isArray(contextMenu.actions) ? contextMenu.actions: [] as action} <Button variant="ghost"
          size="sm"
          onclick={() => { action.action(); contextMenu = null}} class="w-full justify-start"
        > {action.label} </Button> {/each} {/if}
  </div>
 <style> .canvas-workspace { display: flex; height: 100vh; background: #0a0a0a; color: white; font-family: Arial, sans-serif; position: relative; /* Fixed: added colon */ overflow: hidden}
  .toolbar { position: absolute; /* Fixed: added colon */ top: 0; /* Fixed: comma to semicolon */ left: 0; right: 0; /* Fixed: comma to semicolon */ height: 60px; background: rgba(0, 0, 0, 0.9); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(255, 255, 255, 0.1); display: flex; align-items: center; padding: 0 20px;gap: 30px; z-index: 100; /*, Fixed: comma to semicolon */ }
  .tool-group, .action-group, .ai-group, .collab-group { display: flex; align-items: center; gap: 10px}
  .tool-btn, .action-btn, .ai-btn { background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); color: white; padding: 8px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;transition: all 0.2s ease; min-width: 40px; height: 36px;display: flex; align-items: center; justify-content: center}
  .tool-btn:hover, .action-btn:hover, .ai-btn:hover { background: rgba(255, 255, 255, 0.2); border-color: rgba(255, 255, 255, 0.4)}
  .tool-btn.active { background: rgba(74, 144, 226, 0.6); border-color: rgba(74, 144, 226, 0.8)}
  .sidebar { width: 300px; background: rgba(0, 0, 0, 0.95); backdrop-filter: blur(10px); border-right: 1px solid rgba(255, 255, 255, 0.1); padding: 80px 20px 20px 20px; overflow-y: auto; z-index: 50; /* Fixed: comma to semicolon */ }
  .sidebar-header { display: flex; justify-content: space-between; /* Fixed: typo: 'space-betweenn' */ align-items: center; margin-bottom: 20px}
  .sidebar-header h3 { margin: 0; color: #4a90e2}
  .close-btn { background: none; border: none; color: #ccc; font-size: 20px; cursor: pointer;padding: 0; /* Fixed: comma to semicolon */ width: 24px; height: 24px}
  .evidence-list { display: flex; flex-direction: column; gap: 10px}
  .evidence-item { display: flex; align-items: center; gap: 12px;padding: 12px; background: rgba(255, 255, 255, 0.05); border-radius: 6px; cursor: grab; transition: all 0.2s ease; border: 1px solid transparent}
  .evidence-item:hover { background: rgba(255, 255, 255, 0.1); border-color: rgba(74, 144, 226, 0.5)}
  .evidence-item.on-canvas .evidence-icon { /* Fixed: class selector and removed extra dot */ font-size: 24px; width: 32px; height: 32px, display: flex; align-items: center; justify-content: center}
  .evidence-info { flex: 1; /* Fixed: comma to semicolon */ }
  .evidence-title { font-weight: bold; font-size: 14px; margin-bottom: 4px}
  .evidence-type { font-size: 12px, color: #ccc; text-transform: capitalize; /* Fixed: typo: 'capitaliz' */ }
  .sidebar-toggle { position: absolute; /* Fixed: added colon */ top: 80px, left: 20px; z-index: 60; /* Fixed: comma to semicolon */; background: rgba(0, 0, 0, 0.8); border: 1px solid rgba(255, 255, 255, 0.2); color: white;padding: 12px, border-radius: 6px, cursor: pointer; font-size: 16px}
  .canvas-container { flex: 1; margin-top: 60px; position: relative; /* Fixed: added colon */ overflow: hidden}
  .properties-panel { position: absolute; /* Fixed: added colon */ top: 80px; right: 20px; width: 280px; background: rgba(0, 0, 0, 0.95); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; z-index: 100; /* Fixed: comma to semicolon */ }
  .panel-header { display: flex; justify-content: space-between; /* Fixed: typo: 'space-betweenn' */ align-items: center; padding: 15px 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.1)}
  .panel-header h3 { margin: 0; color: #4a90e2; font-size: 16px}
  .panel-content { padding: 20px}
  .property-group { margin-bottom: 15px}
  .property-group label { display: block; margin-bottom: 5px; font-size: 12px; color: #ccc}
  .property-group input, .property-group select { width: 100%; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); color: white;padding: 8px 10px; border-radius: 4px; font-size: 14px}
  .position-inputs { display: flex; gap: 10px}
  .position-inputs input { width: calc(50% - 5px)}
  .context-menu { position: fixed; /* Fixed: added colon */; background: rgba(0, 0, 0, 0.95); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; padding: 5px 0; z-index: 200; min-width: 150px}
  .context-action { display: block; width: 100%; background: none; border: none; color: white; padding: 8px 15px; text-align: left, cursor: pointer, font-size: 14px; transition: background 0.2s ease}
  .context-action: hover { /* Fixed: added dot for class selector */; background: rgba(255, 255, 255, 0.1)}
  .collaborators { display: flex; gap: 5px}
  .collaborator-avatar { width: 32px, height: 32px, border-radius: 50%, display: flex; align-items: center; justify-content: center; color: white; font-weight: bold, font-size: 14px; border: 2px solid rgba(255, 255, 255, 0.3)}
  .save-status { font-size: 12px; color: #ccc; margin-left: 15px}
  .ai-suggestions { margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.1)}
  .ai-suggestions h4 { margin: 0, 0 15px 0; color: #4a90e2; font-size: 14px}
  .suggestion-item { display: flex; justify-content: space-between; /* Fixed: typo: 'space-betweenn' */ align-items: flex-start; gap: 10px; padding: 10px; background: rgba(74, 144, 226, 0.1); border-radius: 4px; margin-bottom: 10px}
  .suggestion-text { flex: 1; font-size: 12px; line-height: 1.4}
  .apply-btn { background: rgba(74, 144, 226, 0.6); border: none;color: white; padding: 4px 8px; border-radius: 3px; font-size: 10px; cursor: pointer; white-space: nowrap}
  .apply-btn:hover { background: rgba(74, 144, 226, 0.8)}
  .canvas-workspace.sidebar-open .canvas-container { margin-left: 300px}
</style> margin-left: 300px; </style>


