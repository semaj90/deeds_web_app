<script lang="ts">
  import type { Evidence } from '$lib/types/api';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import ReportEditor from '$lib/components/ReportEditor.svelte';
  import CanvasEditor from '$lib/components/CanvasEditor.svelte';
  import type { Report, CanvasState, CitationPoint } from '$lib/data/types';

  let currentReport: Report | null = null;
  let currentCanvasState: CanvasState | null = null;
  let evidence: Evidence[] = [];
  let citationPoints: CitationPoint[] = [];
  let activeTab: 'editor' | 'canvas' = 'editor';
  let isLoading = false;
  let error = '';

  // Demo case ID - in real app this would come from the route
  const caseId = $page.params.caseId || 'demo-case-123';

  onMount(async () => {
    await loadDemoData();
  });

  async function loadDemoData() {
    try {
      isLoading = true;

      // Load sample citation points
      const citationsResponse = await fetch(`/api/citations?caseId=${caseId}`);
      if (citationsResponse.ok) {
        citationPoints = await citationsResponse.json();
      }
      // Load sample evidence (mock for now)
      evidence = [
        {
          id: '1',
          caseId,
          criminalId: null,
          title: 'Security Camera Footage',
          description: 'CCTV footage from main entrance',
          evidenceType: 'video',
          fileType: 'video/mp4',
          subType: null,
          fileUrl: null,
          fileName: 'security_footage.mp4',
          fileSize: null,
          mimeType: 'video/mp4',
          hash: 'abc123def456',
          tags: [],
          chainOfCustody: [],
          collectedAt: null,
          collectedBy: null,
          location: null,
          labAnalysis: {},
          aiAnalysis: {},
          aiTags: [],
          aiSummary: null,
          summary: null,
          isAdmissible: true,
          confidentialityLevel: 'standard',
          canvasPosition: {},
          uploadedBy: '1',
          uploadedAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          caseId,
          criminalId: null,
          title: 'Witness Statement - John Doe',
          description: 'Eyewitness account of the incident',
          evidenceType: 'document',
          fileType: 'application/pdf',
          subType: null,
          fileUrl: null,
          fileName: 'witness_statement.pdf',
          fileSize: null,
          mimeType: 'application/pdf',
          hash: 'def456ghi789',
          tags: [],
          chainOfCustody: [],
          collectedAt: null,
          collectedBy: null,
          location: null,
          labAnalysis: {},
          aiAnalysis: {},
          aiTags: [],
          aiSummary: null,
          summary: null,
          isAdmissible: true,
          confidentialityLevel: 'standard',
          canvasPosition: {},
          uploadedBy: '1',
          uploadedAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '3',
          caseId,
          criminalId: null,
          title: 'Physical Evidence - Weapon',
          description: 'Photograph of recovered weapon',
          evidenceType: 'photo',
          fileType: 'image/jpeg',
          subType: null,
          fileUrl: null,
          fileName: 'weapon_photo.jpg',
          fileSize: null,
          mimeType: 'image/jpeg',
          hash: 'ghi789jkl012',
          tags: [],
          chainOfCustody: [],
          collectedAt: null,
          collectedBy: null,
          location: null,
          labAnalysis: {},
          aiAnalysis: {},
          aiTags: [],
          aiSummary: null,
          summary: null,
          isAdmissible: true,
          confidentialityLevel: 'standard',
          canvasPosition: {},
          uploadedBy: '1',
          uploadedAt: new Date(),
          updatedAt: new Date(),
        },
      ];
    } catch (err) {
      console.error('Failed to load demo data:', err);
      error = 'Failed to load demo data';
    } finally {
      isLoading = false;
    }
  }
  async function handleReportSave(report: Report) {
    try {
      currentReport = report;
      console.log('Report saved:', report);
    } catch (err) {
      console.error('Failed to save report:', err);
      error = 'Failed to save report';
    }
  }
  async function handleCanvasSave(canvasState: CanvasState) {
    try {
      currentCanvasState = canvasState;
      console.log('Canvas saved:', canvasState);
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
</script>

<svelte:head>
  <title>Report Builder - Prosecutor's Case Management</title>
  <meta name="description" content="AI-powered report builder for legal case analysis" />
</svelte:head>

<div class="container mx-auto px-4">
  <!-- Header -->
  <header class="container mx-auto px-4">
    <div class="container mx-auto px-4">
      <h1>📝 Report Builder</h1>
      <p class="container mx-auto px-4">AI-powered case analysis and report generation</p>

      <div class="container mx-auto px-4">
        <button class="container mx-auto px-4" on:click={() => createNewReport()}> 📄 New Report </button>
        <button class="container mx-auto px-4" on:click={() => createNewCanvas()}> 🎨 New Canvas </button>
      </div>
    </div>
  </header>

  <!-- Error Message -->
  {#if error}
    <div class="container mx-auto px-4">
      ❌ {error}
      <button on:click={() => (error = '')} class="container mx-auto px-4">×</button>
    </div>
  {/if}

  <!-- Loading State -->
  {#if isLoading}
    <div class="container mx-auto px-4">
      <div class="container mx-auto px-4">⏳</div>
      <p>Loading demo data...</p>
    </div>
  {:else}
    <!-- Tab Navigation -->
    <div class="container mx-auto px-4">
      <button
        class="container mx-auto px-4"
        class:active={activeTab === 'editor'}
        on:click={() => (activeTab = 'editor')}
      >
        📝 Report Editor
      </button>
      <button
        class="container mx-auto px-4"
        class:active={activeTab === 'canvas'}
        on:click={() => (activeTab = 'canvas')}
      >
        🎨 Interactive Canvas
      </button>
    </div>

    <!-- Main Content -->
    <main class="container mx-auto px-4">
      {#if activeTab === 'editor'}
        <!-- Report Editor Tab -->
        <div class="container mx-auto px-4">
          <div class="container mx-auto px-4">
            <h2>Prosecutor's Report</h2>
            <p>Write, edit, and analyze case reports with AI assistance</p>
          </div>

          <ReportEditor report={currentReport} {caseId} onSave={handleReportSave} autoSaveEnabled={true} />
        </div>
      {:else if activeTab === 'canvas'}
        <!-- Canvas Editor Tab -->
        <div class="container mx-auto px-4">
          <div class="container mx-auto px-4">
            <h2>Interactive Evidence Canvas</h2>
            <p>Visualize evidence, create diagrams, and annotate with AI insights</p>
          </div>

          <CanvasEditor
            canvasState={currentCanvasState}
            reportId={currentReport?.id || 'temp-report-id'}
            {evidence}
            {citationPoints}
            onSave={handleCanvasSave}
          />
        </div>
      {/if}
    </main>

    <!-- Sidebar with Features Overview -->
    <aside class="container mx-auto px-4">
      <div class="container mx-auto px-4">
        <h3>🤖 AI Features</h3>
        <ul class="container mx-auto px-4">
          <li>✨ Auto-complete suggestions</li>
          <li>📊 Case analysis insights</li>
          <li>🔍 Citation recommendations</li>
          <li>📝 Content summarization</li>
        </ul>
      </div>

      <div class="container mx-auto px-4">
        <h3>📚 Citation Library</h3>
        <p class="container mx-auto px-4">{citationPoints.length} citations available</p>
        <div class="container mx-auto px-4">
          {#each citationPoints.slice(0, 3) as citation}
            <div class="container mx-auto px-4">
              <div class="container mx-auto px-4">{citation.source}</div>
              <div class="container mx-auto px-4">{citation.text.substring(0, 60)}...</div>
            </div>
          {/each}
        </div>
      </div>

      <div class="container mx-auto px-4">
        <h3>📋 Evidence Repository</h3>
        <p class="container mx-auto px-4">{evidence.length} pieces of evidence</p>
        <div class="container mx-auto px-4">
          {#each evidence as item}
            <div class="container mx-auto px-4">
              <div class="container mx-auto px-4">{item.title}</div>
              <div class="container mx-auto px-4">{item.evidenceType || item.type || 'unknown'}</div>
            </div>
          {/each}
        </div>
      </div>

      <div class="container mx-auto px-4">
        <h3>⚡ Quick Actions</h3>
        <div class="container mx-auto px-4">
          <button class="container mx-auto px-4">📤 Export PDF</button>
          <button class="container mx-auto px-4">💾 Save Template</button>
          <button class="container mx-auto px-4">🔄 Sync Offline</button>
        </div>
      </div>
    </aside>
  {/if}
</div>

<style>
  /* @unocss-include */
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
</style>
