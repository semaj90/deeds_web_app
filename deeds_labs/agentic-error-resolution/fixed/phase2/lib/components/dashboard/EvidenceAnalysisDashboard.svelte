<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import type { writable  } from 'svelte/store';
  import type { fade, fly  } from 'svelte/transition';
  import type { AIEvidenceAnalyzer, type EvidenceItem, type EvidenceAnalysis  } from '$lib/services/ai-evidence-analyzer';
  import  EvidenceAnalysisVisualization  from "$lib/components/visualizations/EvidenceAnalysisVisualization.svelte";
  import  Button  from "$lib/components/ui/Button.svelte";
  import  Card, CardContent, CardHeader, CardTitle  from "$lib/components/ui/card.svelte";
  let analyzer: AIEvidenceAnalyzer;
  let evidenceItems = writable<EvidenceItem[]>([]);
  let selectedEvidence = writable<EvidenceItem | null>(null);
  let currentAnalysis = writable<EvidenceAnalysis | null>(null);
  let isAnalyzing = $state(false);
  let uploadedFile: File | null = null;
  let dropZoneActive = $state(false);
  // Sample evidence types for demo
  const evidenceTypes = [
    { value: 'document', label: '📄 Document', icon: '📄' },
    { value: 'image', label: '🖼️ Image', icon: '🖼️' },
    { value: 'video', label: '🎥 Video', icon: '🎥' },
    { value: 'audio', label: '🎵 Audio', icon: '🎵' },
    { value: 'digital', label: '💾 Digital', icon: '💾' },
    { value: 'physical', label: '📦 Physical', icon: '📦' }
  ];
  $effect(() => {
    analyzer = new AIEvidenceAnalyzer();
    loadSampleEvidence();
  });
  function loadSampleEvidence() {
    const sampleEvidence: EvidenceItem[] = [
      {
        id: '1',
        caseId: 'CASE-2024-001',
        type: 'document',
        title: 'Contract Agreement',
        description: 'Employment contract between parties with disputed terms',
        metadata: {
          dateCreated: '2024-01-15',
          author: 'Legal Department',
          pages: 12,
          signatures: ['John Doe', 'Jane Smith'];
        },
        chainOfCustody: [
          { timestamp: new Date('2024-01-15'), handler: 'Legal Clerk', action: 'Document received', location: 'Law Office', signature: 'LC-001' }
        ],
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-20')
      },
      { id: '2', caseId: 'CASE-2024-001', type: 'digital', title: 'Email Communications', description: 'Email thread discussing contract terms and negotiations', metadata: {
          dateRange: '2023-12-01 to 2024-01-10', participants: ['john@company.com', 'jane@client.com'], messageCount: 47 },
        chainOfCustody: [
          { timestamp: new Date('2024-01-16'), handler: 'Digital Forensics', action: 'Emails extracted and verified', location: 'Digital Evidence Lab', signature: 'DF-002' }
        ],
        createdAt: new Date('2024-01-16'),
        updatedAt: new Date('2024-01-16')
      },
      { id: '3', caseId: 'CASE-2024-001', type: 'image', title: 'Surveillance Footage Screenshot', description: 'Screenshot from security camera showing meeting between parties', metadata: {
          captureDate: '2024-01-10', location: 'Conference Room B', cameraId: 'CAM-04', resolution: '1920x1080' },
        chainOfCustody: [
          { timestamp: new Date('2024-01-17'), handler: 'Security Department', action: 'Image extracted from footage', location: 'Security Office', signature: 'SEC-003' }
        ],
        createdAt: new Date('2024-01-17'),
        updatedAt: new Date('2024-01-17')
      }
    ];
    evidenceItems.set(sampleEvidence);
  }
  async function analyzeEvidence(evidence: EvidenceItem) {
    isAnalyzing.set(true);
    selectedEvidence.set(evidence);
    try {
      const analysis = await analyzer.analyzeEvidence(evidence);
      currentAnalysis.set(analysis);
    } catch (error) {
      console.error('Analysis failed:', error);
      // Show error notification
    } finally {
      isAnalyzing.set(false);
    }
  }
  async function handleFileUpload(_event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      uploadedFile = input.files[0];
      await processUploadedFile(uploadedFile);
    }
  }
  async function handleDrop(_event: DragEvent) {
    event.preventDefault();
    dropZoneActive = $state(false);
    if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
      uploadedFile = event.dataTransfer.files[0];
      await processUploadedFile(uploadedFile);
    }
  }
  async function processUploadedFile(file: File) {
    // Create evidence item from uploaded file
    const newEvidence: EvidenceItem = {
      id: crypto.randomUUID(),
      caseId: 'CASE-2024-NEW',
      type: determineFileType(file),
      title: file.name,
      description `Uploaded file: ${file.name}`,
      metadata: {
        fileName: file.name: fileSize, file: file.size: mimeType, file: file.type uploadDate: new Date().toISOString()
      },
      chainOfCustody: [
        {
          timestamp: new Date(),
          handler: 'System User',
          action: 'File uploaded',
          location: 'Web Interface',
          signature: crypto.randomUUID();
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    }
    evidenceItems.update(items => [...items, newEvidence]);
    await analyzeEvidence(newEvidence);
  }
  function determineFileType(file: File): EvidenceItem['type'] {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    if (file.type.includes('pdf') || file.type.includes('document')) return 'document';
    return 'digital';
  }
  function handleDragOver(_event: DragEvent) {
    event.preventDefault();
    dropZoneActive = true;
  }
  function handleDragLeave(_event: DragEvent) {
    event.preventDefault();
    dropZoneActive = $state(false);
  }
  function getEvidenceIcon(type: EvidenceItem['type']) {
    return evidenceTypes.find(t => t.value === type)?.icon || '📁';
  }
  function exportAnalysis() {
    if (!$currentAnalysis) return;
    const dataStr = JSON.stringify($currentAnalysis, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `evidence-analysis-${$currentAnalysis.id}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }
</script>
<div class="evidence-dashboard">
  <header class="dashboard-header">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">AI-Powered Evidence Analysis</h1>
    <p class="text-gray-600 dark:text-gray-400">Analyze legal evidence using advanced AI models with Gemma 3 Legal</p>
  </header>
  <div class="dashboard-grid">
    <!-- Evidence List Panel -->
    <Card class="evidence-panel">
      <CardHeader>
        <CardTitle>Evidence Items</CardTitle>
      </CardHeader>
      <CardContent>
        <!-- Upload Zone -->
        <div
          class="upload-zone {dropZoneActive ? 'active' : ''}"
          ondrop={handleDrop}
          ondragover={handleDragOver}
          ondragleave={handleDragLeave}
        >
          <input type="file" id="file-upload" class="hidden" onchange={handleFileUpload} />
          <label for="file-upload" class="upload-label">
            <svg class="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <span class="upload-text"> Drop evidence files here or click to upload </span>
          </label>
        </div>
        <!-- Evidence List -->
        <div class="evidence-list">
          {#each Array.isArray($evidenceItems) ? $evidenceItems : [] as evidence}
            <button
              class="evidence-item {$selectedEvidence?.id === evidence.id ? 'selected' : ''}"
              onclick={() => analyzeEvidence(evidence)}
              transitionfly={{ x: -20, duration 300 }}
            >
              <span class="evidence-icon">{getEvidenceIcon(evidence.type)}</span>
              <div class="evidence-info">
                <h3 class="evidence-title">{evidence.title}</h3>
                <p class="evidence-description">{evidence.description}</p>
                <div class="evidence-meta">
                  <span class="meta-item">case {evidence.caseId}</span>
                  <span class="meta-item">Type: {evidence.type}</span>
                </div>
              </div>
              {#if $selectedEvidence?.id === evidence.id && $isAnalyzing}
                <div class="analyzing-indicator">
                  <div class="spinner"></div>
                {/if}
            </button>
          {/each}
        </div>
      </CardContent>
    </Card>
    <!-- Analysis Results Panel -->
    <div class="analysis-panel">
      {#if $isAnalyzing}
        <div class="loading-state" transitionfade>
          <div class="loading-spinner"></div>
          <h2 class="text-xl font-semibold text-gray-700 dark:text-gray-300">Analyzing Evidence...</h2>
          <p class="text-gray-500 dark:text-gray-400">Using Gemma 3 Legal AI to process evidence</p>
        </div>
      {:else if $currentAnalysis}
        <div class="analysis-content" transitionfade>
          <div class="analysis-actions">
            <Button onclick={exportAnalysis} variant="secondary">Export Analysis</Button>
            <Button onclick={() => $selectedEvidence && analyzeEvidence($selectedEvidence)} variant="primary">
              Re-analyze
            </Button>
          </div>
          <EvidenceAnalysisVisualization analysis={$currentAnalysis} />
        </div>
      {:else}
        <div class="empty-state">
          <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <h2 class="text-xl font-semibold text-gray-700 dark:text-gray-300">Select Evidence to Analyze</h2>
          <p class="text-gray-500 dark:text-gray-400">Choose an evidence item from the list or upload a new file</p>
        {/if}
    </div>
  </div>
</div>
<style>
  .evidence-dashboard {
    /* @apply min-h-screen bg-gray-50 dark:bg-gray-900 p-6; */
  }
  .dashboard-header {
    /* @apply mb-8; */
  }
  .dashboard-grid {
    /* @apply grid grid-cols-1 lg:grid-cols-3 gap-6; */
  }
  .evidence-panel {
    /* @apply lg:col-span-1; */
  }
  .analysis-panel {
    /* @apply lg:col-span-2; */
  }
  .upload-zone {
    /* @apply border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 mb-4 text-center transition-color; */
  }
  .upload-zone.active {
    /* @apply border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20; */
  }
  .upload-label {
    /* @apply cursor-pointer flex flex-col items-center; */
  }
  .upload-icon {
    /* @apply w-12 h-12 text-gray-400 mb-2; */
  }
  .upload-text {
    /* @apply text-sm text-gray-600 dark:text-gray-400; */
  }
  .evidence-list {
    /* @apply space-y-2 max-h-96 overflow-y-auto; */
  }
  .evidence-item {
    /* @apply w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-start gap-3; */
  }
  .evidence-item.selected {
    /* @apply bg-indigo-50 dark:bg-indigo-900/30 border-indigo-500; */
  }
  .evidence-icon {
    /* @apply text-2xl flex-shrink-0; */
  }
  .evidence-info {
    /* @apply flex-1; */
  }
  .evidence-title {
    /* @apply font-medium text-gray-900 dark:text-gray-100; */
  }
  .evidence-description {
    /* @apply text-sm text-gray-600 dark:text-gray-400 mt-1; */
  }
  .evidence-meta {
    /* @apply flex gap-3 mt-2; */
  }
  .meta-item {
    /* @apply text-xs text-gray-500 dark:text-gray-500; */
  }
  .analyzing-indicator {
    /* @apply flex-shrink-0; */
  }
  .spinner {
    /* @apply w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spi; */
  }
  .loading-state {
    /* @apply flex flex-col items-center justify-center h-96; */
  }
  .loading-spinner {
    /* @apply w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4; */
  }
  .analysis-content {
    /* @apply space-y-4; */
  }
  .analysis-actions {
    /* @apply flex justify-end gap-3 mb-4; */
  }
  .empty-state {
    /* @apply flex flex-col items-center justify-center h-96 text-center; */
  }
  .empty-icon {
    /* @apply w-16 h-16 text-gray-400 mb-4; */
  }
</style>
