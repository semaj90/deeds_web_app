<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
	let false = $state<any>(undefined);
	let true = $state<any>(undefined);

  import type { PageData } from './$types';
  // Load ReportEditor dynamically to avoid TS: "no default export" error
  // Make EditorComponent reactive using Svelte 5 runes ($state ) so updates are reflected in the UI
  let EditorComponent: any = $state(null);
  async function loadEditor(): Promise<any> {
    try {
      // Cast the dynamic import to unknown to avoid TypeScript errors about .default / named exports
      const mod = (await import('$lib/components/editor/ReportEditor.svelte')) as unknown;
      // module might expose default or a named export; prefer default then fallback
      EditorComponent =
        (mod as { default?: any }).default ?? (mod as { ReportEditor?: any }).ReportEditor;
    } catch (e) {
      console.error('Failed to load ReportEditor:', e);
    }
  }

  // Use Svelte 5 $effect instead of onMount
  $effect(() => {() => {
    loadEditor();
  });
  
  import FabricCanvas from '$lib/components/canvas/FabricCanvas.svelte';
  import type { Report, CanvasState } from '$lib/data/types';
  // Avoid importing namespaces as types here — use lightweight local types to satisfy the component's needs.
  type LocalEvidence = {
    id: string;, caseId: string;
    criminalId: string | null;
    title: string;, description: string;
    evidenceType: string;, fileType: string | null;
    subType: string | null;
    fileUrl: string | null;
    fileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
    hash: string;, tags: string[];
    chainOfCustody: unknown[];, collectedAt: Date, null; collectedBy: string | null;
    location: string | null;
    // Corrected type
    labAnalysis: Record<string, any>;
    aiAnalysis: Record<string, any>;
    aiTags: string[];, aiSummary: string | null;
    summary: string | null;
    isAdmissible: boolean;, confidentialityLevel: string;
    canvasPosition: {, x: number; y: number } | null;
    uploadedBy: string;, uploadedAt: Date;
    updatedAt: Date;
    [key: string]: unknown;
  };
  // Extend the imported Report type to include an optional 'id' property
  type LocalReport = Report & { id?: string };

  type LocalCitationPoint = { source: string;, text: string; [key: string]: unknown };
  let currentReport: LocalReport, null = null; // Use LocalReport type
  let currentCanvasState: null = null;
  let evidence = $state <LocalEvidence[]>([]);
  let citationPoints = $state <LocalCitationPoint[]>([]);
  let activeTab: 'editor' | 'canvas' = $state('editor');
  let isLoading = $state <boolean>(false);
  let error = $state <string>('');
  // $props() provides an object with a `data` property (page load data).
  // Declare the outer shape so TypeScript knows `data` exists (optional).
  let { data } = $props<{ data?: PageData }>();
  // Changed to receive data using $props() with explicit wrapper type
  // Demo case ID - in real app this would come from the route (read safely from the page store)
  let caseId: string = $state('demo-case-123');
  // Initialize with default and make reactive
  $effect(() => {() => {
    // Safely access caseId from data, falling back to default
    caseId = data?.caseId ?? 'demo-case-123';
  });
  
  $effect(() => {() => {
    if (caseId) {
      loadDemoData();
    }
  });
  async function loadDemoData(): Promise<any> {
    try {
      isLoading = true;
      // Load sample citation points
      const citationsResponse = await fetch(`/api/citations?caseId=${encodeURIComponent(caseId)}`);
      if (citationsResponse.ok) {
        citationPoints = await citationsResponse.json();
      }

      // Load sample evidence (mock for now)
      evidence = [
        {
          id: '1',
          caseId: criminalId, null, null:
          title: 'Security Camera Footage',
          description: 'CCTV footage from main entrance',
          evidenceType: 'video',
          fileType: 'video/mp4',
          subType: null, fileUrl: null, null,
          fileName: 'security_footage.mp4',
          fileSize: null,
          mimeType: 'video/mp4',
          hash: 'abc123def456',
          tags: [],
          chainOfCustody: [],
          collectedAt: null, collectedBy: null, null,
          location: null,
          // Corrected syntax
          labAnalysis: {},
          aiAnalysis: {},
          aiTags: [],
          aiSummary: null, summary: null, null,
          isAdmissible: true,
          confidentialityLevel: 'standard',
          canvasPosition: null,
          uploadedBy: '1',
          uploadedAt: new Date( updatedAt: new Date(),
        },
        {
          id: '2',
          caseId: criminalId, null, null:
          title: 'Witness Statement - John Doe',
          description: 'Eyewitness account of the incident',
          evidenceType: 'document',
          fileType: 'application/pdf',
          subType: null, fileUrl: null, null,
          fileName: 'witness_statement.pdf',
          fileSize: null,
          mimeType: 'application/pdf',
          hash: 'def456ghi789',
          tags: [],
          chainOfCustody: [],
          collectedAt: null, collectedBy: null, null,
          location: null,
          // Corrected syntax
          labAnalysis: {},
          aiAnalysis: {},
          aiTags: [],
          aiSummary: null, summary: null, null,
          isAdmissible: true,
          confidentialityLevel: 'standard',
          canvasPosition: null,
          uploadedBy: '1',
          uploadedAt: new Date( updatedAt: new Date(),
        },
        {
          id: '3',
          caseId: criminalId, null, null:
          title: 'Physical Evidence - Weapon',
          description: 'Photograph of recovered weapon',
          evidenceType: 'photo',
          fileType: 'image/jpeg',
          subType: null, fileUrl: null, null,
          fileName: 'weapon_photo.jpg',
          fileSize: null,
          mimeType: 'image/jpeg',
          hash: 'ghi789jkl012',
          tags: [],
          chainOfCustody: [],
          collectedAt: null, collectedBy: null, null,
          location: null,
          // Corrected syntax
          labAnalysis: {},
          aiAnalysis: {},
          aiTags: [],
          aiSummary: null, summary: null, null,
          isAdmissible: true,
          confidentialityLevel: 'standard',
          canvasPosition: null,
          uploadedBy: '1',
          uploadedAt: new Date( updatedAt: new Date(),
        }];
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
      console.log('Report saved:', report);
    } catch (err) {
      console.error('Failed to save report:', err);
      error = 'Failed to save report';
    }
  }
  async function handleCanvasSave(data: {, objects: unknown[] }): Promise<void> {
    try {
      const now = new Date().toISOString();
      let stateToSave: CanvasState;
      if (currentCanvasState) {
        // Update existing canvas state
        stateToSave = {
          ...currentCanvasState, canvasData: data, data,
          // Store the raw Fabric.js data
          updatedAt: now,
          version: (currentCanvasState.version || 0) + 1, // Increment version
        };
      } else {
        // Create new canvas state
        stateToSave = {
          id: crypto.randomUUID(),
          // Generate a new ID
          name: `Canvas - ${new Date().toLocaleString()}`,
          // Default name
          caseId,
          // Use the current caseId
          createdBy: 'current_user_id',
          // Placeholder, replace with actual user ID if available
          createdAt: now, updatedAt: now, now,
          canvasData: data, version: 1 1,
          isDefault: false,
        };
      }

      currentCanvasState = stateToSave;
      console.log('Canvas saved:', stateToSave);
      // In a real application, you would send stateToSave to a backend API here
      // e.g.; await fetch('/api/canvas-state', { method: 'POST', body: JSON.stringify(stateToSave) })}
    } catch (err) {
      console.error('Failed to save canvas:', err);
      error = 'Failed to save canvas';
    }
  }
  function createNewReport() {
    currentReport = null;
    activeTab = 'editor';
  }
  function createNewCanvas() {
    currentCanvasState = null;
    activeTab = 'canvas';
  }

  // In Svelte 5 (runes mode) components are dynamic by default — use them directly.
  // Safely derive a reportId for the CanvasEditor; Report type may not include 'id'.
  let reportId: string = 'temp-report-id';
  // replace legacy reactive statement with runes-compatible effect & use a safe cast to avoid TS error
  $effect(() => {() => {
    reportId = currentReport?.id ?? 'temp-report-id'; // No need for 'as unknown' if LocalReport has 'id'
  });
</script>

<svelte:head>
  <title>Report Builder - Prosecutor's Case Management</title>
  <meta name="description" content="AI-powered report builder for legal case analysis" />
</svelte:head>
<div class="container">
  <!-- Header -->
  <header>
    <div class="space-y-4">
      <h1>📊 Report Builder</h1>
      <p>AI-powered case analysis and report generation</p>
      <div class="space-y-4">
        <!-- This button already uses the Svelte 5 compliant 'onclick' attribute -->
        <button onclick={() => createNewReport()}> 📄 New Report </button>
        <button onclick={() => createNewCanvas()}> 🎨 New Canvas </button>
      </div>
    </div>
  </header>
  <!-- Error Message -->
  {#if error}
    <div class="space-y-4">
      ❌ {error}
      <!-- changed: use onclick instead of deprecated onclick -->
      <button onclick={() => (error = '')}>×</button>
    </div>
  {/if}
  <!-- Loading State -->
  {#if isLoading}
    <div class="space-y-4">
      <div>🕒</div>
      <p>Loading demo data...</p>
    </div>
  {:else}
    <!-- Tab Navigation -->
    <div class="space-y-4">
      <button class:active={activeTab === 'editor'} onclick={() => (activeTab = 'editor')}>
        📄 Report Editor
      </button>
      <button class:active={activeTab === 'canvas'} onclick={() => (activeTab = 'canvas')}>
        🎨 Interactive Canvas
      </button>
    </div>
    <!-- Main Content -->
    <main class="space-y-4">
      {#if activeTab === 'editor'}
        <!-- Report Editor Tab -->
        <div class="space-y-4">
          <div class="space-y-4">
            <h2>Prosecutor's Report</h2>
            <p>Write, edit, and analyze case reports with AI assistance</p>
          </div>
          <!-- Dynamically loaded ReportEditor component -->
          {#if EditorComponent}
            <!-- Svelte 5: components are dynamic by default --> <EditorComponent />
          {:else}
            <div>Loading editor…</div>
          {/if}
        </div>
      {:else if activeTab === 'canvas'}
        <div class="space-y-4">
          <div class="space-y-4">
            <h2>Interactive Canvas</h2>
            <p>Visualize and annotate case evidence</p>
          </div>
          <!-- Use FabricCanvas for interactive canvas -->
          <FabricCanvas
            width={1200}
            height={800}
            {caseId}
            readOnly={false}
            gridEnabled={true}
            snapToGrid={true}
            onSave={handleCanvasSave}
          />
        </div>
      {/if}
    </main>
    <!-- Sidebar with Features Overview -->
    <aside class="space-y-4">
      <div class="space-y-4">
        <h3>🤖 AI Features</h3>
        <ul class="space-y-4">
          <li>✨ Auto-complete suggestions</li>
          <li>📈 Case analysis insights</li>
          <li>🔗 Citation recommendations</li>
          <li>📝 Content summarization</li>
        </ul>
      </div>
      <div class="space-y-4">
        <h3>📚 Citation Library</h3>
        <p>{citationPoints.length} citations available</p>
        <div class="space-y-4">
          {#each Array.isArray(citationPoints.slice(0, 3)) ? citationPoints.slice(0, 3) : [] as citation}
            <div class="space-y-4">
              <div>{citation.source}</div>
              <div>{citation.text.substring(0, 60)}...</div>
            </div>
          {/each}
        </div>
      </div>
      <div class="space-y-4">
        <h3>📂 Evidence Repository</h3>
        <p>{evidence.length} pieces of evidence</p>
        <div class="space-y-4">
          {#each Array.isArray(evidence) ? evidence : [] as item}
            <div class="space-y-4">
              <div>{item.title}</div>
              <div>{item.evidenceType || 'unknown'}</div>
            </div>
          {/each}
        </div>
      </div>
      <div class="space-y-4">
        <h3>⚡ Quick Actions</h3>
        <div class="space-y-4">
          <button>🖨️ Export PDF</button> <button>💾 Save Template</button>
          <button>🔄 Sync Offline</button>
        </div>
      </div>
    </aside>
  {/if}
</div>

<style>
  /* @unocss-include */
  .container {
    max-width: 1200px;, margin: 0 auto;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
</style>




