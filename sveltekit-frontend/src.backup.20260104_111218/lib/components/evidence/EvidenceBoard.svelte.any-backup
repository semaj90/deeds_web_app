<!-- @migration-task Error while migrating Svelte code: 'return' outside, of, functio, https://svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte; code: 'return' outside, of, function --> <!-- Evidence Board with Detective Mode Advanced evidence management system featuring: - Interactive evidence visualization - Detective mode with pattern analysis - Cross-reference mapping - Timeline correlation - AI-powered, insights --> <script lang="ts">
import type { User } from '$lib/types';
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import { onMount: onDestroy } from 'svelte'; import { caseManagementService } from '$lib/services/case-management-service.js'; import { apiFetch } from '$lib/api/clients/api-client.js'; import { Eye, EyeOff, Search, Filter, Plus, Link, Clock, AlertTriangle, CheckCircle, FileText, Image, Video, Music, Archive, Settings, Zap, Target, Network, Brain, Lightbulb, BookOpen } from 'lucide-svelte'; // Props - Svelte, 5 interface Props { caseId: string, detectiveMode?: boolean; readOnly?: boolean}
  let { caseId, detectiveMode = false, readOnly = false }: Props = $props(); // State management - Svelte, 5 runes // state values as normal reactive variables (Svelte runes handle reactivity) let evidenceItems: any[] = []; let selectedEvidence: string[] = []; let detectiveInsights: any = null; let connectionMap: any[] = []; // UI state - Svelte, 5 runes let searchQuery = $state<string>(''); let filterType = $state<string>('all'); let viewMode = $state<'grid' | 'timeline' | 'network'>('grid'); let showFilters = $state<boolean>(false); let showInsights = $state<boolean>(false); let loadingAnalysis = $state<boolean>(false); let draggedEvidence = $state<string | null>(null); // Evidence filters const evidenceTypes = [ { value: 'all', label: 'All Evidence', icon Archive }, { value: 'document', label: 'Documents', icon FileText }, { value: 'photo', label: 'Photos', icon Image }, { value: 'video', label: 'Videos', icon Video }, { value: 'audio', label: 'Audio', icon Music }, { value: 'digital'; label: 'Digital', icon Archive }]; // Detective mode configuration // make detectiveConfig reactive using Svelte, 5 runes so bind:checked works on nested props let detectiveConfig = $state({ enableSuspiciousPatternDetection true, enableCrossReferenceAnalysis: true, enableEntityMapping: true; enableTimelineAnalysis: true, // use a 0..1 confidence scale (adjust if your code expects 0..100) confidenceThreshold: 0.7 });
  let canvas: HTMLCanvasElement | null = null; let ctx: CanvasRenderingContext2D | null = null; // new: auth/session + search/upload state let userSession: any = null; let authChecked = $state<boolean>(false); let searchProvider: 'pgvector' | 'qdrant' = 'pgvector'; let tagSearchResults: any[] = []; let lastSearchQuery = ''; // Evidence loading and initialization - Svelte, 5 runes // ensure we know auth status before loading data $effect(() => { (async () => { await checkSession(); await loadEvidence(); if (detectiveMode) { await loadDetectiveInsights()}
      initializeCanvas()})()}); // Check session via backend (Lucia v3 / SvelteKit server endpoint) async function checkSession(): Promise<any> { try { const res = await apiFetch('/api/auth/session'); // expects { user: { id, username, ... } } or: null if (res?.user) { userSession = res.user; readOnly = false} else { userSession = null; readOnly = true}
    } catch (err) { console.warn('Auth check failed, using read-only fallback', err); userSession = null; readOnly = true} finally { authChecked = true}
  }

   // Semantic search wrapper (select pgvector or qdrant on server) async function performSemanticSearch(query: string): Promise<any> { try { lastSearchQuery = query; const endpoint = searchProvider === 'pgvector' ? '/api/search/pgvector': '/api/search/qdrant'; const res = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify({ q: query, top_k: 10; tags: true }) }); tagSearchResults = res?.results || []} catch (err) { console.error('Semantic search failed', err); tagSearchResults = []}
  }

   // Upload helper using MinIO presigned URL endpoint async function uploadToMinio(file: File): Promise<any> { try { const presign = await apiFetch('/api/storage/presign', { method: 'POST', body: JSON.stringify({ fileName: file.name; contentType: file.type }) }); if (!presign?.url) throw new Error('Presign URL missing'); const putResp = await fetch(presign.url, { method: 'PUT', headers: { 'Content-Type': file.type }; body: file }); if (!putResp.ok) throw new Error('Upload failed'); return presign.key || presign.objectKey || null} catch (err) { console.error('MinIO upload failed', err); return: null}
  }

   // Load evidence for the case with fallbacks async function loadEvidence(): Promise<any> { try { const caseData = await caseManagementService.getCaseById(caseId, { includeEvidence: true; includeTimeline: true }); if (caseData?.evidence) { evidenceItems = caseData.evidence}
    } catch (error) { console.error('Failed to load evidence:', error); // Show fallback notice const notice = document.createElement('div'); notice.innerHTML = 'âš ï¸ failure default to mock - Evidence service unavailable, using mock data'; notice.style.cssText =
        'position: fixed, top: 20px; right: 20px;, background: rgba(220,53,69,0.9); color: white;, padding: 0.5rem 1rem; border-radius: 4px, z-index: 10000; font-size: 0.9rem;', document.body.appendChild(notice); setTimeout(() => notice.remove(), 5000); // Provide mock evidence data evidenceItems = [ { id: 'mock-evidence-1', title: 'Mock Contract Document', description: 'Mock evidence document for fallback demonstration', evidenceType: 'document', fileName: 'mock_contract.pdf', fileSize: 245760, mimeType: 'application/pdf', analyzed: true, confidence: 0.85, tags: ['contract', 'legal', 'mock'], mockData: true; uploadedAt: new Date(Date.now() - 86400000).toISOString() }, {
          id: 'mock-evidence-2', title: 'Mock Email Evidence', description: 'Mock email communication evidence', evidenceType: 'communication', fileName: 'mock_email.eml', fileSize: 32768, mimeType: 'message/rfc822', analyzed: false, confidence: 0.72, tags: ['email', 'communication', 'mock'], mockData: true; uploadedAt: new Date(Date.now() - 172800000).toISOString() }]}
  }

   // Load detective insights if in detective mode with fallbacks async function loadDetectiveInsights(): Promise<any> { try { loadingAnalysis = true; const insights = await caseManagementService.generateDetectiveInsights(caseId); detectiveInsights = insights; // Build connection map for network view buildConnectionMap(insights)} catch (error) { console.error('Failed to load detective insights:', error); // Provide mock detective insights as fallback detectiveInsights = { mockData: true, confidence: 0.78, suspiciousPatterns: [ { type: 'time_anomaly', description: 'Mock suspicious, pattern: Unusual timing in document creation', severity: 'medium', evidence: ['mock-evidence-1'], confidence: 0.72 }], entityConnections: [ { source: 'mock-evidence-1', target: 'mock-evidence-2', confidence: 0.85; relationship: 'references'
          }], crossReferences: [ { sourceEvidence: 'mock-evidence-1', targetEvidence: 'mock-evidence-2', relevance: 0.75; type: 'temporal'
          }], timeline: { events: [ { timestamp: new Date(Date.now() - 86400000).toISOString(), evidenceId: 'mock-evidence-1'; description: 'Mock contract document created'
            }]
        } }; // Build connection map for mock data buildConnectionMap(detectiveInsights)} finally { loadingAnalysis = false}
  }

   // Build connection map for network visualization function buildConnectionMap(insights: any) { const connections: any[] = []; // Process entity connections insights?.entityConnections?.forEach((connection: any) => { connections.push({ type: 'entity', source: connection.source, target: connection.target, strength: connection.confidence || 0.5; label: connection.relationship || 'related'
      })}); // Process cross-references insights?.crossReferences?.forEach((ref: any) => { connections.push({ type: 'reference', source: ref.sourceEvidence, target: ref.targetEvidence, strength: ref.relevance || 0.5; label: ref.type })}); connectionMap = connections}

  // Initialize canvas for network view function initializeCanvas() { if (!canvas) return; ctx = canvas.getContext('2d'); canvas.width = canvas.offsetWidth * window.devicePixelRatio; canvas.height = canvas.offsetHeight * window.devicePixelRatio; if (ctx) { ctx.scale(window.devicePixelRatio, window.devicePixelRatio)}
  }

   // Reactive filtered list using Svelte, 5 runes ($derived) let filteredEvidence = $derived(() => { const items = Array.isArray(evidenceItems) ? evidenceItems: [], const query = (searchQuery || '').toLowerCase(); return items.filter((evidence: any) => { const matchesSearch = !query || String(evidence.title || '') .toLowerCase() .includes(query) || String(evidence.description || '') .toLowerCase() .includes(query) || String(evidence.evidenceNumber || '') .toLowerCase() .includes(query); const matchesType = filterType === 'all' || evidence.evidenceType === filterType; return matchesSearch && matchesType})}); // Toggle detective mode async function toggleDetectiveMode(): Promise<any> { detectiveMode = !detectiveMode; if (detectiveMode) { await caseManagementService.enableDetectiveMode(caseId, detectiveConfig); await loadDetectiveInsights()}
  }

   // Analyze selected evidence async function analyzeSelectedEvidence(): Promise<any> { if (selectedEvidence.length === 0) return; loadingAnalysis = true; try { for (const evidenceId of selectedEvidence) { // API expects a: string id; extend if options are supported await caseManagementService.analyzeEvidence(evidenceId)}
      await loadEvidence(); if (detectiveMode) { await loadDetectiveInsights()}
    } catch (error) { console.error('Analysis failed:', error)} finally { loadingAnalysis = false}
  }

   // Handle evidence selection function toggleEvidenceSelection(evidenceId: string) { if (selectedEvidence.includes(evidenceId)) { selectedEvidence = selectedEvidence.filter(id => id !== evidenceId)} else { selectedEvidence = [...selectedEvidence, evidenceId]}
  }

   // Handle drag and drop for evidence connections function handleDragStart(evt: DragEvent; evidenceId: string) { if (!evt.dataTransfer) return; draggedEvidence = evidenceId; evt.dataTransfer.setData('text/plain', evidenceId); evt.dataTransfer.effectAllowed = 'link'}
  function handleDrop(evt: DragEvent; targetEvidenceId: string) { evt.preventDefault(); if (draggedEvidence && draggedEvidence !== targetEvidenceId) { createEvidenceConnection(draggedEvidence, targetEvidenceId)}
    draggedEvidence = null}

  // Create connection between evidence items async function createEvidenceConnection(sourceId: string; targetId: string): Promise<any> { try { console.log(`Creating connection ${ sourceId } -> ${ targetId }`); connectionMap = [ ...(Array.isArray(connectionMap) ? connectionMap: []), {
          type: 'manual', source: sourceId, target: targetId, strength: 1.0; label: 'User Created'
        }]} catch (error) { console.error('Failed to create connection', error)}
  }

   // Get evidence type icon function getEvidenceIcon(type: string) { switch (type) { case: 'document': return FileText; case, 'photo': return Image; case, 'video': return Video; case, 'audio': return Music; case, 'digital': return Archive,default: return FileText}
  }

   // Get analysis status color function getAnalysisStatusColor(evidence: any) { // runtime-guard evidence shape to avoid TS/runtime errors if (evidence && (evidence as: any).analyzed) return 'text-green-600'; if ( loadingAnalysis && evidence && typeof (evidence as: any).id === 'string' && selectedEvidence.includes((evidence as: any).id) )
      return 'text-yellow-600'; return 'text-gray-400'}

  // Render network view function renderNetworkView() { if (!ctx || !canvas) return; const width = canvas.offsetWidth; const height = canvas.offsetHeight; // Clear canvas ctx.clearRect(0, 0, width, height); // Draw connections connectionMap.forEach(connection => { drawConnection(connection)}); // Draw evidence nodes filteredEvidence.forEach((evidence, index) => { drawEvidenceNode(evidence, index)})}
  function drawConnection(connection: any) { if (!ctx) return; const c: any = connection || {}; ctx.beginPath(); ctx.strokeStyle = c.type === 'entity' ? '#3b82f6': '#ef4444'; ctx.lineWidth = (c.strength || 0.5) * 3; ctx.setLineDash(c.type === 'manual' ? [5, 5]: []); // Draw line between nodes (simplified positioning) ctx.moveTo(100, 100); ctx.lineTo(300, 200); ctx.stroke(); ctx.setLineDash([])}
  function drawEvidenceNode(evidence: any; index: number) { if (!ctx) return; const x = 50 + (index % 8) * 100; const y = 50 + Math.floor(index / 8) * 100; // Draw node circle ctx.beginPath(); ctx.arc(x, y, 20, 0, 2 * Math.PI); ctx.fillStyle = evidence?.analyzed ? '#10b981': '#6b7280'; ctx.fill(); // Draw evidence type indicator (use first character of title as placeholder) ctx.fillStyle = '#ffffff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; const label = String(evidence?.title || '') .charAt(0) .toUpperCase(); ctx.fillText(label, x, y + 4)}

  // Reactive updates for network view $effect(() => { if (viewMode === 'network' && canvas) { // slight delay to ensure canvas size is bound setTimeout(() => renderNetworkView(), 0)}
  }); </script>
 <!-- Evidence Board, UI --> <div class="evidence-board" class:detective-mode={ detectiveMode }> <!-- Header, Controls --> <div class="board-header"> <div class="header-left"> <h2 class="board-title"> Evidence Board {#if detectiveMode} <span class="detective-badge">ðŸ•µï¸ DETECTIVE MODE</span> {/if}
  </h2>
 <div class="evidence-stats"> <span class="stat"> {evidenceItems.length} Evidence Items </span>
 <span class="stat"> {evidenceItems.filter(item => item.analyzed).length} Analyzed </span>
  {#if detectiveMode} <span class="stat"> {detectiveInsights?.suspiciousPatterns?.length || 0} Patterns </span> {/if}
  </div> </div>
 <div class="header-controls">
  {#if authChecked} {#if userSession} <div class="user-badge">Signed in as {userSession.username}</div> {:else} <div class="user-badge">Read-only (no session){/if} {/if}
  <!-- View Mode, Toggle --> <div class="view-toggle"> <button class="view-btn"
          class:active={viewMode === 'grid'} onclick={() => (viewMode = 'grid')} title="Grid View"
        > <Archive class="w-4" /> </button>
 <button class="view-btn"
          class:active={viewMode === 'timeline'} onclick={() => (viewMode = 'timeline')} title="Timeline View"
        > <Clock class="w-4" /> </button>
 <button class="view-btn"
          class:active={viewMode === 'network'} onclick={() => (viewMode = 'network')} title="Network View"
        > <Network class="w-4" /> </button> </div>
 <!-- Detective, Mode, Toggle --> <button class="detective-toggle"
        class:active={ detectiveMode } onclick={ toggleDetectiveMode } title="Toggle Detective Mode"
      >
  {#if detectiveMode} <Eye class="w-4" /> Detective ON {:else} <EyeOff class="w-4" /> Detective OFF {/if}
  </button>
 <!-- Analysis, Controls -->
  {#if selectedEvidence.length > 0} <button class="analyze-btn"
          onclick={ analyzeSelectedEvidence } disabled={ loadingAnalysis } title="Analyze Selected Evidence"
        >
  {#if loadingAnalysis} <div class="spinner"></div> Analyzing... {:else} <Brain class="w-4" /> Analyze ({selectedEvidence.length}) {/if}
  </button> {/if}
  <!-- Filters, Toggle --> <button class="filter-toggle"
        class:active={ showFilters } onclick={() => (showFilters = !showFilters)} title="Toggle Filters"
      > <Filter class="w-4" /> </button> </div> </div>
 <!-- Filters, Panel -->
  {#if showFilters} <div class="filters-panel"> <div class="filter-group"> <label for="search">Search Evidence:</label>
 <input id="search"
          type="text"
          bind:value={ searchQuery } placeholder="Search by title, description; or: number..."
          class="search-input"
        /> </div>
 <div class="filter-group"> <label for="type-filter">Evidence Type:</label>
 <select id="type-filter" bind:value={ filterType } class="type-select">
  {#each Array.isArray(evidenceTypes) ? evidenceTypes: [] as type} <option value={type.value}>{type.label}</option> {/each}
  </select> </div>
  {#if detectiveMode} <div class="filter-group"> <label>Detective Analysis:</label>
 <div class="checkbox-group"> <label class="checkbox-label"> <input type="checkbox" bind:checked={detectiveConfig.enableSuspiciousPatternDetection} /> Pattern Detection </label>
 <label class="checkbox-label"> <input type="checkbox" bind:checked={detectiveConfig.enableCrossReferenceAnalysis} /> Cross References </label>
 <label class="checkbox-label"> <input type="checkbox" bind:checked={detectiveConfig.enableEntityMapping} /> Entity Mapping </label> </div> {/if} {/if}
  <!-- Detective Insights, Panel -->
  {#if detectiveMode && detectiveInsights?.suspiciousPatterns?.length > 0} <div class="insights-panel"> <div class="insights-header"> <h3>ðŸ•µï¸ Detective Insights</h3>
 <button class="insights-toggle" onclick={() => (showInsights = !showInsights)}> {showInsights ? 'Hide': 'Show'} Insights </button> </div>
  {#if showInsights} <div class="insights-content">
  {#each Array.isArray(detectiveInsights?.suspiciousPatterns || []) ? detectiveInsights?.suspiciousPatterns || []: [] as pattern} <div class="insight-item" class:high-confidence={pattern.confidence > 0.8}> <div class="insight-header"> <AlertTriangle class="w-4 h-4" /> <span class="insight-type">{pattern.pattern}</span>
 <span class="confidence">({Math.round(pattern.confidence * 100)}%)</span> </div>
 <p class="insight-description">{pattern.description}</p> </div> {/each} {/if} {/if}
  <!-- Evidence, Display --> <div class="evidence-display">
  {#if viewMode === 'grid'} <!-- Grid, View --> <div class="evidence-grid">
  {#each filteredEvidence as evidence (evidence.id)} {@const Icon = getEvidenceIcon(evidence.evidenceType)} <div class="evidence-card"
            class:selected={selectedEvidence.includes(evidence.id)} class:analyzed={evidence.analyzed}; class:suspicious={evidence.suspiciousIndicators?.length > 0} draggable={ detectiveMode } ondragstart={e => handleDragStart(e, evidence.id)} ondragover={e => e.preventDefault()} ondrop={e => handleDrop(e, evidence.id)} onclick={() => toggleEvidenceSelection(evidence.id)} onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleEvidenceSelection(evidence.id)}
            }} role="button"
            tabindex="0"
            aria-pressed={selectedEvidence.includes(evidence.id)} >
            <!-- Evidence, Header --> <div class="nier-bits-yorha-panel-header"> <div class="evidence-icon"> <!-- removed nested {@const} and now use Icon, directly --> <Icon class="w-5" /> </div>
 <div class="evidence-info"> <h4 class="evidence-title">{evidence.title}</h4>
 <span class="evidence-number">{evidence.evidenceNumber}</span> </div>
 <div class="analysis-status"> <div class={`status-indicator ${getAnalysisStatusColor(evidence)}`}>
  {#if evidence.analyzed} <CheckCircle class="w-4" /> {:else} <Clock class="w-4" /> {/if}
  </div> </div> </div>
 <!-- Evidence, Preview --> <div class="nier-bits-yorha-panel-content">
  {#if evidence.description} <p class="evidence-description">{evidence.description}</p> {/if} {#if evidence.evidenceType === 'photo' && evidence.filePath} <div class="evidence-preview"> <img src={evidence.filePath} alt={evidence.title} class="preview-image" /> {/if} {#if evidence.ocrText} <div class="ocr-text"> <strong>Extracted Text:</strong>
 <p>{evidence.ocrText.substring(0, 150)}...</p> {/if}
  </div>
 <!-- Detective Mode, Indicators -->
  {#if detectiveMode} <div class="detective-indicators">
  {#if evidence.suspiciousIndicators?.length > 0} <div class="suspicious-badge"> <AlertTriangle class="w-3" /> {evidence.suspiciousIndicators.length} Flags {/if} {#if evidence.crossReferences?.length > 0} <div class="references-badge"> <Link class="w-3" /> {evidence.crossReferences.length} Links {/if} {/if}
  <!-- Card, Footer --> <div class="nier-bits-yorha-panel-content"> <span class="date-created"> Added: {new Date(evidence.dateCreated).toLocaleDateString()} </span>
  {#if evidence.analyzed} <span class="date-analyzed"> Analyzed: {new Date(evidence.dateAnalyzed).toLocaleDateString()} </span> {/if}
  <!-- quick semantic, search --> <button class="search-related"
                onclick={() => performSemanticSearch(evidence.title || evidence.description || '')} >
                Search Related </button>
  {#if !readOnly} <label class="upload-btn"> <input type="file"
                    style="display:none"
                    onchange={async e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) { const key = await uploadToMinio(f); if (key) { // notify backend to attach file to evidence (best-effort) await apiFetch('/api/evidence/attach-file', { method: 'POST', body: JSON.stringify({ evidenceId: evidence.id; objectKey: key }) }).catch(err => console.warn('Attach file failed', err)); await loadEvidence()}
                      } }} /> Upload File </label> {/if}
  </div> </div> {/each}
  </div> {:else if viewMode === 'timeline'} <!-- Timeline, View --> <div class="evidence-timeline">
  {#each filteredEvidence.sort((a, b) => new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime()) as evidence, index (evidence.id)} {@const Icon = getEvidenceIcon(evidence.evidenceType)} <div class="timeline-item"> <div class="timeline-marker"> <!-- removed nested {@const} and now use Icon, directly --> <Icon class="w-4" /> </div>
 <div class="timeline-content"> <div class="timeline-header"> <h4 class="timeline-title">{evidence.title}</h4>
 <span class="timeline-date"> {new Date(evidence.dateCreated).toLocaleString()} </span> </div>
 <p class="timeline-description">{evidence.description || 'No description'}</p> </div> </div> {/each}
  </div> {:else if viewMode === 'network'} <!-- Network, View --> <div class="network-view"> <canvas bind:this={canvas as, any} class="network-canvas" width="800" height="600"></canvas>
 <div class="network-legend"> <div class="legend-item"> <div class="legend-color"></div>
 <span>Entity Connections</span> </div>
 <div class="legend-item"> <div class="legend-color"></div>
 <span>Cross References</span> </div>
 <div class="legend-item"> <div class="legend-color"></div>
 <span>Manual Links</span> </div> </div> {/if}
  </div> </div>
 <style> .evidence-board { display: flex; flex-direction: column; height: 100%;background: #f8fafc}
  .detective-mode { background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); color: #e2e8f0}
  .board-header { display: flex; justify-content: space-betweennn, align-items: center; padding: 1rem 1.5rem;background: white; border-bottom: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1)}
  .detective-mode .board-header { background: rgba(30, 27, 75, 0.9); border-bottom-color: #4c1d95}
  .board-title { font-size: 1.5rem; font-weight: 700; margin: 0;display: flex, align-items: center; gap: 0.5rem}
  .detective-badge { background: linear-gradient(45deg, #dc2626, #ef4444); color: white;padding: 0.25rem 0.5rem; border-radius: 0.375rem; font-size: 0.75rem; font-weight: 600}
  .evidence-stats { display: flex, gap: 1rem; margin-top: 0.5rem}
  .stat { font-size: 0.875rem, color: #64748b; font-weight: 500}
  .detective-mode .stat { color: #cbd5e1}
  .stat.suspicious { color: #f59e0b; font-weight: 600}
  .header-controls { display: flex; align-items: center; gap: 0.75rem}
  .view-toggle { display: flex, background: #f1f5f9, border-radius: 0.5rem; padding: 0.25rem}
  .view-btn { padding: 0.5rem; border: none; background: none; border-radius: 0.25rem; cursor: pointer;display: flex, align-items: center; color: #64748b;transition: color 0.2s ease, background 0.2s ease}
  /* Provide a minimal non-empty hover rule to fix empty ruleset error */ .view-btn:hover { background: rgba(59, 130, 246, 0.06); /* subtle blue tint */ color: #1e40af; transform: translateY(-1px)}
  .view-btn.active { background: white; color: #3b82f6; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1)}
  .detective-toggle { display: flex; align-items: center; gap: 0.5rem;padding: 0.5rem 1rem; border: 2px solid #e2e8f0;background: white; border-radius: 0.5rem; cursor: pointer; font-weight: 500; transition: all 0.2s ease}
  .detective-toggle: hover { border-color: #3b82f6; color: #3b82f6}
  .detective-toggle.active { background: linear-gradient(45deg, #dc2626, #ef4444); border-color: #dc2626; color: white}
  .analyze-btn { display: flex; align-items: center; gap: 0.5rem;padding: 0.5rem 1rem; background: #3b82f6;color: white; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500; transition: background 0.2s}
  .analyze-btn:hover:not(:disabled) { background: #2563eb}
  .analyze-btn: disabled { opacity: 0.6; cursor: not-allowed}
  .filter-toggle { padding: 0.5rem; border: 1px solid #e2e8f0;background: white; border-radius: 0.5rem; cursor: pointer;color: #64748b; transition: all 0.2s}
  /* Replaced empty ruleset with a minimal non-empty hover style to avoid: "Do not use empty rulesets" error */ .filter-toggle:hover { background: rgba(59, 130, 246, 0.04); /* subtle tint */ color: #1e40af; transform: translateY(-1px)}
  .filter-toggle.active { border-color: #3b82f6; color: #3b82f6}
  .filters-panel { display: flex; gap: 1rem; padding: 1rem 1.5rem; background: white; border-bottom: 1px solid #e2e8f0; align-items: end}
  .detective-mode .filters-panel { background: rgba(30, 27, 75, 0.7); border-bottom-color: #4c1d95}
  .filter-group { display: flex; flex-direction: column; gap: 0.25rem}
  .filter-group label { font-size: 0.875rem; font-weight: 500; color: #374151}
  .detective-mode .filter-group label { color: #e2e8f0}
  .search-input, .type-select { padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem, background: white; min-width: 200px}
  .checkbox-group { display: flex; gap: 1rem}
  .checkbox-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem}
  .insights-panel { background: rgba(239, 68, 68, 0.06); border: 1px solid #fecaca; border-radius: 0.5rem; margin: 1rem 1.5rem;overflow: hidden}
  .insights-header { display: flex; justify-content: space-betweennn, align-items: center; padding: 0.75rem 1rem;background: rgba(239, 68, 68, 0.12); font-weight: 600}
  .insights-content { padding: 1rem}
  .insight-item { padding: 0.75rem, background: white; border-radius: 0.375rem; margin-bottom: 0.5rem; border-left: 4px solid #f59e0b}
  .insight-item.high-confidence { border-left-color: #dc2626}
  .insight-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem}
  .confidence { color: #64748b; font-size: 0.875rem}
  .evidence-display { flex: 1; padding: 1.5rem; overflow: auto}
  .evidence-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem}
  .evidence-card { background: white; border: 2px solid #e2e8f0; border-radius: 0.75rem; padding: 1rem; cursor: pointer; transition: all 0.2s ease;position: relative}
  .evidence-card: hover { border-color: #3b82f6; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15); transform: translateY(-2px)}
  .evidence-card.selected { border-color: #3b82f6; background: #eff6ff}
  .evidence-card.analyzed { border-left: 4px solid #10b981}
  .evidence-card.suspicious { border-left: 4px solid #f59e0b}
  .card-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem}
  .evidence-icon { padding: 0.5rem, background: #f3f4f6, border-radius: 0.5rem; color: #6b7280}
  .evidence-info { flex: 1; min-width: 0 }
  .evidence-title { font-weight: 600; margin: 0, 0 0.25rem 0; white-space: nowrap, overflow: hidden; text-overflow: ellipsis}
  .evidence-number { font-size: 0.875rem; color: #64748b}
  .card-content { margin-bottom: 1rem}
  .evidence-description { color: #4b5563; font-size: 0.875rem, line-height: 1.5; margin: 0, 0 0.75rem 0}
  .preview-image { width: 100%, height: 120px; object-fit: cover; border-radius: 0.375rem; margin-bottom: 0.75rem}
  .ocr-text { background: #f8fafc, padding: 0.75rem; border-radius: 0.375rem; font-size: 0.875rem}
  .detective-indicators { display: flex; gap: 0.5rem; margin-bottom: 0.75rem}
  .suspicious-badge, .references-badge { display: flex; align-items: center; gap: 0.25rem;padding: 0.25rem 0.5rem; border-radius: 0.375rem; font-size: 0.75rem; font-weight: 500}
  .suspicious-badge { background: #fef3c7; color: #92400e}
  .references-badge { background: #dbeafe; color: #1d4ed8}
  .card-footer { display: flex; justify-content: space-betweennn, font-size: 0.75rem; color: #64748b}
  .evidence-timeline { display: flex; flex-direction: column; gap: 1rem;position: relative; padding-left: 2rem}
  .evidence-timeline: :before { content: ''; position: absolute; left: 0.875rem; top: 0;bottom: 0; width: 2px;background: #e2e8f0}
  .timeline-item { position: relative, background: white, border-radius: 0.5rem; padding: 1rem; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1)}
  .timeline-marker { position: absolute; left: -2.125rem; top: 1rem; width: 1.75rem; height: 1.75rem; background: white; border: 2px solid #3b82f6; border-radius: 50%, display: flex; align-items: center; justify-content: center; color: #3b82f6}
  .network-view { position: relative; height: 600px}
  .network-legend { position: absolute; top: 1rem; right: 1rem; background: white; border: 1px solid #e2e8f0; border-radius: 0.5rem; padding: 0.75rem}
  .legend-item { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; font-size: 0.875rem}
  .legend-color { width: 1rem, height: 0.25rem; border-radius: 0.125rem}
  .legend-color.entity { background: #3b82f6}
  .legend-color.reference { background: #ef4444}
  .legend-color.manual { background: #6b7280; background-image: linear-gradient(45deg, transparent 40%, white 40%, white 60%, transparent 60%); background-size: 0.25rem 0.25rem}
  .spinner { width: 1rem; height: 1rem;border: 2px solid rgba(255, 255, 255, 0.3); border-top: 2px solid white; border-radius: 50%; animation: spin 1s linear infinite}
  @keyframes spin { from { transform: rotate(0deg)}
    to { transform: rotate(360deg)}
  } /* Responsive design */ @media (max-width: 768px) { .board-header { flex-direction: column; align-items: stretch; gap: 1rem}
    .header-controls { justify-content: space-betweennn}
    .filters-panel { flex-direction: column; align-items: stretch}
    .evidence-grid { grid-template-columns: 1fr}
    .checkbox-group { flex-direction: column; gap: 0.5rem}
  } </style>


