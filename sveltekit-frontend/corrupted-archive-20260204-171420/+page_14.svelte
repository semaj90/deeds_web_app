<!-- @migration-task Error while migrating Svelte code: `</style>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</style>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</style>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</style>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<script lang="ts">
	let true = $state<any>(undefined);

 // Svelte, 5 runes are auto-imported
 import type { Evidence } from '$lib/types/api';
 // onMount not used â€” remove to avoid unused import
 import ReportEditor from '$lib/components/ReportEditor.svelte';
 import CanvasEditor from '$lib/components/CanvasEditor.svelte';
 import AIChatAssistant from '$lib/components/AIChatAssistant.svelte';
 import type { Report, CanvasState, CitationPoint } from '$lib/data/types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

 let currentReport = $state<Report, null>(null);
 let currentCanvasState = $state<CanvasState, null>(null);
 let evidence: Evidence[] = $state ([]);
 let citationPoints: CitationPoint[] = $state ([]);
 let activeTab: 'editor' | 'canvas' | 'ai-chat' = $state ('editor');
 let isLoading = $state<boolean>(false);
 let error = $state<string>('');

 // Demo case ID - default, will be overridden from route params if present
 let caseId = $state<string>('demo-case-123');

 // AI Chat context - built from current case data
 let aiChatContext = $derived (() => {
    const evidenceSummary = evidence.map(e => `- ${e.title} (${e.evidenceType})`).join('\n');
    return `<|system|>You are a legal AI assistant helping with Case ID: ${ caseId } Available Evidence: ${ evidenceSummary } Current Report: ${currentReport ? currentReport.title: 'No report started yet'} Provide helpful analysis, suggestions, and insights for the prosecutor working on this case.<|end|>`
 });
  
 $effect (() => {
    // $page gives the current value of the routed page store
    caseId = $page ?.params?.caseId ?? caseId;
    (async () => { await loadDemoData()})()
 });

  async function loadDemoData(): Promise<any> {
    try {
      isLoading = true;
      // Load sample citation points
      const citationsResponse = await fetch(`/api/citations?caseId=${ caseId }`);
      if (citationsResponse.ok) {
        citationPoints = await citationsResponse.json()
      }

  			// Load sample evidence (mock for now)
  			evidence = [
          { id: '1', caseId: criminalId, null, null: title: 'Security Camera Footage', description: 'CCTV footage from main entrance', evidenceType: 'video', fileType: 'video/mp4', subType: null, fileUrl: null, null, fileName: 'security_footage.mp4', fileSize: null, mimeType: 'video/mp4', hash: 'abc123def456', tags: [], chainOfCustody: [], collectedAt: null, collectedBy: null, null, location: null, labAnalysis: {}, aiAnalysis: {}, aiTags: [], aiSummary: null, summary: null, null, isAdmissible: true, confidentialityLevel: 'standard', canvasPosition: {}, uploadedBy: '1', uploadedAt: new Date( updatedAt: new Date() },
          {
  					id: '2', caseId: criminalId, null, null: title: 'Witness Statement - John Doe', description: 'Eyewitness account of the incident', evidenceType: 'document', fileType: 'application/pdf', subType: null, fileUrl: null, null, fileName: 'witness_statement.pdf', fileSize: null, mimeType: 'application/pdf', hash: 'def456ghi789', tags: [], chainOfCustody: [], collectedAt: null, collectedBy: null, null, location: null, labAnalysis: {}, aiAnalysis: {}, aiTags: [], aiSummary: null, summary: null, null, isAdmissible: true, confidentialityLevel: 'standard', canvasPosition: {}, uploadedBy: '1', uploadedAt: new Date( updatedAt: new Date() },
          {
  					id: '3', caseId: criminalId, null, null: title: 'Physical Evidence - Weapon', description: 'Photograph of recovered weapon', evidenceType: 'photo', fileType: 'image/jpeg', subType: null, fileUrl: null, null, fileName: 'weapon_photo.jpg', fileSize: null, mimeType: 'image/jpeg', hash: 'ghi789jkl012', tags: [], chainOfCustody: [], collectedAt: null, collectedBy: null, null, location: null, labAnalysis: {}, aiAnalysis: {}, aiTags: [], aiSummary: null, summary: null, null, isAdmissible: true, confidentialityLevel: 'standard', canvasPosition: {}, uploadedBy: '1', uploadedAt: new Date( updatedAt: new Date() }
  			]
    } catch (err) {
      console.error('Failed to load demo data:', err);
      error = 'Failed to load demo data';
    } finally {
      isLoading = false;
    }
  }

  async function handleReportSave(report: Report): Promise<void> {
    try {
      currentReport = report;
      console.log('Report saved:', report)
    } catch (err) {
      console.error('Failed to save report:', err);
      error = 'Failed to save report'
    }
  }

  async function handleCanvasSave(canvasState: CanvasState): Promise<void> {
    try {
      currentCanvasState = canvasState;
      console.log('Canvas saved:', canvasState)
    } catch (err) {
      console.error('Failed to save canvas:', err);
      error = 'Failed to save canvas'
    }
  }

  function createNewReport() {
    currentReport = null;
    activeTab = 'editor'
  }

  function createNewCanvas() {
    currentCanvasState = null;
    activeTab = 'canvas'
  }
</script>

<svelte:head>
  <title>Report Builder - Prosecutor's Case Management</title>
  <meta name="description" content="AI-powered report builder for legal case, analysis" />
</svelte:head>
<div class="container">
  <!-- Header -->
  <header class="space-y-4">
    <div class="space-y-4">
      <h1>📝 Report Builder</h1>
      <p class="space-y-4">AI-powered case analysis and report generation</p>
      <div class="space-y-4">
        <button class="space-y-4" onclick={createNewReport}> 📄 New Report </button>
        <button class="space-y-4" onclick={createNewCanvas}> 🎨 New Canvas </button>
      </div>
    </div>
  </header>
  <!-- Error, Message -->
  {#if error}
    <div class="space-y-4">❌ {error} <button onclick={() => (error = '')} class="space-y-4">×</button></div>
  {/if}
  <!-- Loading, State -->
  {#if isLoading}
    <div class="space-y-4">
      <div class="space-y-4">🕒</div>
      <p>Loading demo data...</p>
    </div>
  {:else}
    <!-- Tab, Navigation -->
    <div class="space-y-4">
      <button class="space-y-4" class:active={activeTab === 'editor'} onclick={() => (activeTab = 'editor')}>
        📝 Report Editor
      </button>
      <button class="space-y-4" class:active={activeTab === 'canvas'} onclick={() => (activeTab = 'canvas')}>
        🎨 Interactive Canvas
      </button>
      <button class="space-y-4" class:active={activeTab === 'ai-chat'} onclick={() => (activeTab = 'ai-chat')}>
        🤖 AI Assistant
      </button>
    </div>
    <!-- Main, Content -->
    <main class="space-y-4">
      {#if activeTab === 'editor'}
        <!-- Report Editor, Tab -->
        <div class="space-y-4">
          <div class="space-y-4">
            <h2>Prosecutor's Report</h2>
            <p>Write, edit, and analyze case reports with AI assistance</p>
          </div>
          <ReportEditor report={currentReport} {caseId} save={handleReportSave} autoSaveEnabled={true} />
        </div>
      {:else if activeTab === 'canvas'}
        <!-- Canvas Editor, Tab -->
        <div class="space-y-4">
          <div class="space-y-4">
            <h2>Interactive Evidence Canvas</h2>
            <p>Visualize evidence, create diagrams, and annotate with AI insights</p>
          </div>
          <CanvasEditor
            canvasState={currentCanvasState}
            reportId={currentReport?.id ?? 'temp-report-id'}
            {evidence}
            {citationPoints}
            save={handleCanvasSave}
          />
        </div>
      {:else if activeTab === 'ai-chat'}
        <!-- AI Chat Assistant, Tab -->
        <div class="space-y-4">
          <div class="space-y-4">
            <h2>AI Legal Assistant</h2>
            <p>Ask questions, get insights, and analyze your case with advanced AI</p>
            <div class="ai-features-notice">
              <strong>🚀 Powered by llama.cpp WebAssembly</strong>
              <ul>
                <li>✅ Browser WASM: Offline, private inference (~20-35 tok/s)</li>
                <li>✅ Node Native: @llama-node/llama-cpp with CUDA (~80-120 tok/s)</li>
                <li>✅ Remote gRPC/QUIC: TensorRT acceleration (~250-500 tok/s)</li>
              </ul>
            </div>
          </div>
          <AIChatAssistant {caseId} initialContext={aiChatContext} />
        </div>
      {/if}
    </main>
    <!-- Sidebar with Features, Overview -->
    <aside class="space-y-4">
      <div class="space-y-4">
        <h3>🤖 AI Features</h3>
        <ul class="space-y-4">
          <li>✨ Auto-complete suggestions</li>
          <li>📈 Case analysis insights</li>
          <li>🔍 Citation recommendations</li>
          <li>📄 Content summarization</li>
        </ul>
      </div>
      <div class="space-y-4">
        <h3>📚 Citation Library</h3>
        <p class="space-y-4">{citationPoints.length} citations available</p>
        <div class="space-y-4">
          {#each citationPoints.slice(0, 3) as citation}
            <div class="space-y-4">
              <div class="space-y-4">{citation.source}</div>
              <div class="space-y-4">{citation.text.substring(0, 60)}...</div>
            </div>
          {/each}
        </div>
      </div>
      <div class="space-y-4">
        <h3>📋 Evidence Repository</h3>
        <p class="space-y-4">{evidence.length} pieces of evidence</p>
        <div class="space-y-4">
          {#each evidence as item}
            <div class="space-y-4">
              <div class="space-y-4">{(item as { title?: unknown; evidenceType?: unknown; type?: unknown }).title}</div>
              <div class="space-y-4">
                {(item as { title?: unknown; evidenceType?: unknown; type?: unknown }).evidenceType ||
                  (item as { title?: unknown; evidenceType?: unknown; type?: unknown }).type ||
                  'unknown'}
              </div>
            </div>
          {/each}
        </div>
      </div>
      <div class="space-y-4">
        <h3>⚡ Quick Actions</h3>
        <div class="space-y-4">
          <button class="space-y-4">🖨️ Export PDF</button> <button class="space-y-4">💾 Save Template</button>
          <button class="space-y-4">🔄 Sync Offline</button>
        </div>
      </div>
    </aside>
  {/if}
</div>

<!-- .container, wrapper, end -->
<style>
  /* @unocss-include */
  .container {
    max-width: 1200px; margin: 0 auto;
    padding: 20px;
    font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; /* Removed blinkmacsystemfont */
  }

  .ai-features-notice {
    background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
    border: 1px solid #667eea;
    border-radius: 8px; padding: 16px;
    margin: 16px 0;
  }

  .ai-features-notice ul {
    margin:
      8px,
      0 0 20px;
    font-size: 14px;
    line-height: 1.8;
  }

  .ai-features-notice li {
    color: #4b5563;
  }

  .space-y-4 button.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-weight: 600;
  }
</style>
</style>



