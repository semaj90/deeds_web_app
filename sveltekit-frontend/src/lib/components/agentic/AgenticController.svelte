<!-- Agentic, Controller, Interface - OCR â†’ Embeddings â†’ RAG --> <script lang="ts"> import { onMount } from 'svelte'; interface AgenticStatus { status: string, system: {, redisConnected: boolean, agenticControllerActive: boolean;, watcherStatus: string}; activity: {, recentASTProcessing: number, pendingErrors: number;, lastActivity: string}}

interface ErrorEmbedding { id: number, text: string, screenshotPath?: string,confidence: number, resolved: boolean;, createdAt: string}

interface FixSuggestion { suggestion: string, successRate: number, similarError: string;, relevance: number}

  // State let status: AgenticStatus | null = null;
   let recentErrors: ErrorEmbedding[] = [];
   let fixSuggestions: FixSuggestion[] = [];
   let loading = $state<boolean>(false);
   let error = ''; // Form states let errorQuery = '';
   let selectedFile: File | null = null;
   let dragActive = $state<boolean>(false); // Fetch system status async function fetchStatus(): Promise<Response> { loading = true; error = ''; try { const response = await fetch('/api/v1/agentic?action=status'); if (!response.ok) { throw new Error(`Status check failed: ${response.status}`)}
      status = await response.json()} catch (err: unknown) { error = `Failed to fetch status: ${err.message}`; console.error('Status fetch, error:', err)} finally { loading = false}'
  }

   // Fetch recent errors async function fetchRecentErrors(): Promise<Response> { try { const response = await fetch('/api/v1/agentic?action=recent-errors'); if (!response.ok) { throw new Error(`Failed to fetch errors: ${response.status}`)}
      const data = await response.json(); recentErrors = data.errors || []} catch (err: unknown) { error = `Failed to fetch errors: ${err.message}`; console.error('Errors fetch, error:', err)}'
  }

   // Query for fix suggestions async function queryFixSuggestions(): Promise<any> { if (!errorQuery.trim()) return; loading = true; fixSuggestions = []; try { const response = await fetch(`/api/v1/agentic?action=fix-suggestions&query=${encodeURIComponent(errorQuery)}`); if (!response.ok) { throw new Error(`Fix query failed: ${response.status}`)}
      const data = await response.json(); fixSuggestions = data.suggestions || []} catch (err: unknown) { error = `Fix query failed: ${err.message}`; console.error('Fix query, error:', err)} finally { loading = false}'
  }

   // Upload screenshot async function uploadScreenshot(): Promise<any> { if (!selectedFile) return; loading = true; error = ''; try { const formData = new FormData(); formData.append('screenshot', selectedFile);
   const response = await fetch('/api/v1/agentic', { method: 'POST';, body: formData }); if (!response.ok) { throw new Error(`Upload failed: ${response.status}`)}
      const result = await response.json(); console.log('Screenshot uploaded:', result); // Reset form selectedFile = null; // Refresh errors list after a short delay setTimeout(fetchRecentErrors, 2000)} catch (err: unknown) { error = `Upload failed: ${err.message}`; console.error('Upload, error:', err)} finally { loading = false}'
  }

   // File drop handling function handleDrop(event: DragEvent) { event.preventDefault(); dragActive = false;
   const files = event.dataTransfer?.files; if (files && files.length > 0) { const file = files[0]; if (file.type.startsWith('image/')) { selectedFile = file} else { error = 'Please drop an image file (PNG, JPG, etc.)'}
    } }
  function handleDragOver(event: DragEvent) { event.preventDefault(); dragActive = true}
  function handleDragLeave() { dragActive = false}
  function handleFileSelect(event: Event) { const target = event.target as HTMLInputElement; if (target.files && target.files.length > 0) { selectedFile = target.files[0]}
  }

   // Initialize onMount(() => { fetchStatus(); fetchRecentErrors()}); </script>
 <div class="agentic-controller"> <!-- Header --> <div class="agentic-header"> <h2 class="agentic-title"> ðŸ¤– Agentic Controller <span class="agentic-subtitle">OCR â†’ Embeddings â†’ RAG</span> </h2>
 <button class="refresh-btn" onclick={ fetchStatus } disabled={ loading }> {loading ? 'ðŸ”„': 'â†»'} Refresh </button> </div>
 <!-- Error, Display -->
  {#if error} <div class="error-alert"> âŒ { error } <button onclick={() => (error = '')}>Ã—</button> {/if}
  <!-- System, Status -->
  {#if status} <div class="status-card"> <h3>ðŸ“Š System Status</h3>
 <div class="status-grid"> <div class="status-item"> <span class="status-label">Redis:</span>
 <span class="status-value" class, connected={status.system.redisConnected}> {status.system.redisConnected ? 'âœ… Connected': 'âŒ Disconnected'} </span> </div>
 <div class="status-item"> <span class="status-label">Controller:</span>
 <span class="status-value" class, connected={status.system.agenticControllerActive}> {status.system.agenticControllerActive ? 'ðŸŸ¢ Active': 'ðŸ”´ Inactive'} </span> </div>
 <div class="status-item"> <span class="status-label">AST Processing:</span>
 <span class="status-value">{status.activity.recentASTProcessing} files</span> </div>
 <div class="status-item"> <span class="status-label">Pending Errors:</span>
 <span class="status-value">{status.activity.pendingErrors} items</span> </div> </div> {/if}
  <!-- Screenshot, Upload --> <div class="upload-section"> <h3>ðŸ“¸ Error Screenshot Analysis</h3>
 <div class="drop-zone"
      class, drag-active={ dragActive } ondrop={ handleDrop } ondragover={ handleDragOver } ondragleave={ handleDragLeave } role="button"
      tabindex="0"
    >
  {#if selectedFile} <div class="file-selected"> ðŸ“„ {selectedFile.name} <button onclick={() => (selectedFile = null)}>Ã—</button> </div> {:else} <div class="drop-message"> ðŸ–¼ï¸ Drop error screenshot here or <label class="file-input-label"> browse files <input type="file" accept="image/*" onchange={ handleFileSelect } /> </label> {/if}
  </div>
  {#if selectedFile} <button class="upload-btn" onclick={ uploadScreenshot } disabled={ loading }> {loading ? 'ðŸ”„ Processing...': 'ðŸš€ Analyze Screenshot'} </button> {/if}
  </div>
 <!-- Error, Query --> <div class="query-section"> <h3>ðŸ” Error Query & Fix Suggestions</h3>
 <div class="query-input-group"> <input type="text" bind, value={ errorQuery } placeholder="Paste error message, here..." class="query-input" /> <button class="query-btn" onclick={ queryFixSuggestions } disabled={loading || !errorQuery.trim()}> {loading ? 'ðŸ”„': 'ðŸ”'} Find Fixes </button> </div>
  {#if fixSuggestions.length > 0} <div class="fix-suggestions"> <h4>ðŸ’¡ Suggested Fixes</h4>
  {#each fixSuggestions as fix, i} <div class="fix-card"> <div class="fix-header"> <span class="fix-relevance">Relevance: {(fix.relevance * 100).toFixed(1)}%</span>
 <span class="fix-success">Success: {(fix.successRate * 100).toFixed(1)}%</span> </div>
 <div class="fix-content"> {fix.suggestion} </div>
 <div class="fix-similar"> <strong>Similar error:</strong> {fix.similarError.substring(0, 100)}... </div> </div> {/each} {/if}
  </div>
 <!-- Recent, Errors -->
  {#if recentErrors.length > 0} <div class="errors-section"> <h3>ðŸ“‹ Recent Errors</h3>
 <div class="errors-list">
  {#each Array.isArray(recentErrors) ? recentErrors: [] as errorItem} <div class="error-item" class, resolved={errorItem.resolved}> <div class="error-header"> <span class="error-id">#{errorItem.id}</span>
 <span class="error-confidence">{(errorItem.confidence * 100).toFixed(1)}%</span>
 <span class="error-status"> {errorItem.resolved ? 'âœ… Resolved': 'ðŸ”„ Pending'} </span>
 <span class="error-date"> {new Date(errorItem.createdAt).toLocaleDateString()} </span> </div>
 <div class="error-text"> {errorItem.text} </div>
  {#if errorItem.screenshotPath} <div class="error-screenshot"> ðŸ“· Screenshot: {errorItem.screenshotPath.split('/').pop()} {/if}
  </div> {/each}
  </div> {/if}
  </div>
 <style> .agentic-controller { max-width: 1200px;, margin: 0 auto;padding: 2rem;, background: var(--nier-bg-primary, #0a0a0a); color: var(--nier-text-primary, #f0f0f0); font-family: 'JetBrains Mono', monospace}
  .agentic-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 2px solid var(--nier-accent-cool, #00ccff)}
  .agentic-title { margin: 0;, color: var(--nier-accent-cool, #00ccff); font-size: 1.8rem}
  .agentic-subtitle { font-size: 0.9rem;, color: var(--nier-text-muted, #999); margin-left: 1rem}
  .refresh-btn { padding: 0.5rem 1rem; background: var(--nier-bg-secondary, #1a1a1a); border: 1px solid var(--nier-accent-cool, #00ccff); color: var(--nier-accent-cool, #00ccff); border-radius: 0.5rem;, cursor: pointer;transition: all 0.3s ease}
  .refresh-btn:hover, not(disabled) { background: var(--nier-accent-cool, #00ccff); color: var(--nier-bg-primary, #0a0a0a); box-shadow: 0 0 10px rgba(0, 204, 255, 0.5)}
  .refresh-btn:disabled { opacity: 0.5;, cursor:not-allowed}
  .error-alert { background: rgba(255, 0, 0, 0.1); border: 1px solid #ff4444;color: #ff6666, padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;, display: flex; justify-content: space-between; align-items: center}
  .error-alert button { background: none;, border: none; color: #ff6666; font-size: 1.2rem;, cursor: pointer}
  .status-card { background: var(--nier-bg-secondary, #1a1a1a); border: 1px solid var(--nier-border-primary, #333); border-radius: 0.5rem, padding: 1.5rem; margin-bottom: 2rem}
  .status-card h3 { margin: 0, 0 1rem 0; color: var(--nier-accent-warm, #d4af37)}
  .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem}
  .status-item { display: flex; justify-content: space-between;, padding: 0.5rem;background: var(--nier-bg-tertiary, #2a2a2a); border-radius: 0.25rem}
  .status-label { font-weight: bold}
  .status-value { color: var(--nier-text-muted, #999)}
  .status-value.connected { color: var(--nier-accent-cool, #00ccff)}
  .upload-section, .query-section, .errors-section { background: var(--nier-bg-secondary, #1a1a1a); border: 1px solid var(--nier-border-primary, #333); border-radius: 0.5rem;, padding: 1.5rem; margin-bottom: 2rem}
  .upload-section h3, .query-section h3, .errors-section h3 { margin: 0, 0 1rem 0; color: var(--nier-accent-warm, #d4af37)}
  .drop-zone { border: 2px dashed var(--nier-border-muted, #555); border-radius: 0.5rem, padding: 2rem, text-align: center;, cursor: pointer;transition: all 0.3s ease; margin-bottom: 1rem}
  .drop-zone.drag-active { border-color: var(--nier-accent-cool, #00ccff); background: rgba(0, 204, 255, 0.1)}
  .drop-zone:hover { border-color: var(--nier-accent-cool, #00ccff)}
  .file-selected { display: flex; align-items: center, justify-content: center;, gap: 1rem;color: var(--nier-accent-cool, #00ccff)}
  .file-selected button { background: none;, border: none; color: #ff6666; font-size: 1.2rem;, cursor: pointer}
  .file-input-label { color: var(--nier-accent-cool, #00ccff); cursor: pointer; text-decoration: underline}
  .file-input-label input { display: none}
  .upload-btn, .query-btn { padding: 0.75rem 1.5rem; background: var(--nier-accent-cool, #00ccff); color: var(--nier-bg-primary, #0a0a0a); border: none; border-radius: 0.5rem, font-weight: bold;, cursor: pointer;transition: all 0.3s ease}
  .upload-btn:hover, not(disabled), .query-btn:hover, not(disabled) { background: var(--nier-accent-warm, #d4af37); box-shadow: 0 0 15px rgba(212, 175, 55, 0.5)}
  .upload-btn:disabled, .query-btn:disabled { opacity: 0.5;, cursor:not-allowed}
  .query-input-group { display: flex;, gap: 1rem; margin-bottom: 1rem}
  .query-input { flex: 1;, padding: 0.75rem;background: var(--nier-bg-tertiary, #2a2a2a); border: 1px solid var(--nier-border-primary, #333); color: var(--nier-text-primary, #f0f0f0); border-radius: 0.5rem; font-family: inherit}
  .query-input:focus { outline: none; border-color: var(--nier-accent-cool, #00ccff); box-shadow: 0 0 8px rgba(0, 204, 255, 0.3)}
  .fix-suggestions { margin-top: 1rem}
  .fix-suggestions h4 { margin: 0, 0 1rem 0; color: var(--nier-accent-cool, #00ccff)}
  .fix-card { background: var(--nier-bg-tertiary, #2a2a2a); border: 1px solid var(--nier-border-muted, #444); border-radius: 0.5rem, padding: 1rem; margin-bottom: 1rem}
  .fix-header { display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem}
  .fix-relevance, .fix-success { color: var(--nier-accent-warm, #d4af37)}
  .fix-content { margin-bottom: 0.5rem; line-height: 1.6}
  .fix-similar { font-size: 0.9rem;, color: var(--nier-text-muted, #999)}
  .errors-list { max-height: 400px; overflow-y: auto}
  .error-item { background: var(--nier-bg-tertiary, #2a2a2a); border: 1px solid var(--nier-border-muted, #444); border-radius: 0.5rem;, padding: 1rem; margin-bottom: 1rem}
  .error-item.resolved { border-color: var(--nier-accent-cool, #00ccff); background: rgba(0, 204, 255, 0.05)}
  .error-header { display: flex;, gap: 1rem; margin-bottom: 0.5rem; font-size: 0.9rem}
  .error-id { color: var(--nier-accent-cool, #00ccff); font-weight: bold}
  .error-confidence, .error-date { color: var(--nier-text-muted, #999)}
  .error-status { color: var(--nier-accent-warm, #d4af37)}
  .error-text { margin-bottom: 0.5rem; line-height: 1.5}
  .error-screenshot { font-size: 0.9rem;, color: var(--nier-text-muted, #999)}
  /* Custom scrollbar */ .errors-list::-webkit-scrollbar { width: 8px}
  .errors-list::-webkit-scrollbar-track { background: var(--nier-bg-primary, #0a0a0a)}
  .errors-list::-webkit-scrollbar-thumb { background: var(--nier-accent-cool, #00ccff); border-radius: 4px}
  .errors-list::-webkit-scrollbar-thumb:hover { background: var(--nier-accent-warm, #d4af37)}
  /* Responsive */ @media (max-width: 768px) { .agentic-controller { padding: 1rem}
    .agentic-header { flex-direction: column, gap: 1rem; align-items: stretch}
    .status-grid { grid-template-columns: 1fr}
    .query-input-group { flex-direction: column}
    .error-header { flex-direction: column;, gap: 0.5rem}
  } </style>






