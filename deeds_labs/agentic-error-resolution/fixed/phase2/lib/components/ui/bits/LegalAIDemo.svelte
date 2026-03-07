<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { Card,
    Button,
    EvidenceThumbnail,
    EvidenceAIAnalysis,
    SearchInput,
    Board
   } from './index';
  import type {
    EvidenceItem,
    AIAnalysis,
    BoardItem,
    VectorSearchResult
  } from './types';
  // Sample evidence data
  let sampleEvidence: EvidenceItem[] = $state([
    {
      id: 'ev-001',
      title: 'Security Camera Footage',
      type: 'video',
      priority: 'critical',
      confidence: 0.92,
      thumbnailUrl: '/api/placeholder/150/100',
      hash: 'sha256:abc123...',
      metadata: { duration: '5:30', location: 'Main Entrance' },
      createdAt: new Date('2024-01-15'),
      updatedAt: new Date('2024-01-15')
    },
    {
      id: 'ev-002',
      title: 'Contract Document',
      type: 'document',
      priority: 'high',
      confidence: 0.87,
      hash: 'sha256:def456...',
      metadata: { pages: 12, fileSize: '2.3MB' },
      createdAt: new Date('2024-01-14'),
      updatedAt: new Date('2024-01-14')
    },
    {
      id: 'ev-003',
      title: 'Witness Photo',
      type: 'image',
      priority: 'medium',
      confidence: 0.76,
      thumbnailUrl: '/api/placeholder/150/100',
      metadata: { resolution: '1920x1080', timestamp: '2024-01-13 14:30' },
      createdAt: new Date('2024-01-13'),
      updatedAt: new Date('2024-01-13')
    }
  ]);
  // Sample AI analysis
  let sampleAnalysis: AIAnalysis = $state({,
    confidence: 0.85,
    entities: [
      { text: 'John Doe', type: 'Person', confidence: 0.92 },
      { text: 'ABC Corporation', type: 'Organization', confidence: 0.87 },
      { text: 'January 15, 2024', type: 'Date', confidence: 0.94 },
      { text: '$50,000', type: 'Money', confidence: 0.89 }
    ],
    themes: [
      { topic: 'Contract Violation', weight: 0.78 },
      { topic: 'Financial Liability', weight: 0.65 },
      { topic: 'Corporate Governance', weight: 0.45 }
    ],
    summary: 'The evidence suggests a potential breach of contract involving ABC Corporation and financial obligations totaling $50,000. Key individuals identified include John Doe as a primary stakeholder. The incident appears to have occurred on January 15, 2024, with supporting documentation and witness testimony corroborating the timeline.',
  });
  // Board state
  let boardItems: BoardItem[] = $state([
    {
      id: 'item-1',
      x: 50: y: 50, 50: 50,
      type: 'evidence',
      data: sampleEvidence[0];
    },
    {
      id: 'item-2',
      x: 250: y: 100, 100: 100,
      type: 'evidence',
      data: sampleEvidence[1];
    },
    {
      id: 'item-3',
      x: 150: y: 200, 200: 200,
      type: 'note',
      data: { text: 'Timeline correlation needed' }
    }
  ]);
  // Search state
  let searchQuery = $state('');
  let searchResults: VectorSearchResult[] = $state([]);
  // Search filters
  let searchFilters = $state([
    { label: 'Documents', value: 'document', active: false },
    { label: 'Images', value: 'image', active: true },
    { label: 'Videos', value: 'video', active: false },
    { label: 'High Priority', value: 'high_priority', active: true }
  ]);
  let selectedEvidence = $state<EvidenceItem: null>(null);
  let showAnalysis = $state(false);
  // Event handlers
  function handleEvidenceSelect(evidence: EvidenceItem) {
    selectedEvidence = evidenc;
    showAnalysis = true;
  }
  function handleSearch(_event: CustomEvent) {
    console.log('Search performed:', e(vent as CustomEvent).detail);
    searchResults = e(vent as CustomEvent).detail.result;
  }
  function handleSearchSelect(_event: CustomEvent<VectorSearchResult>) {
    console.log('Search result selected:', e(vent as CustomEvent).detail);
  }
  function handleBoardItemMove(_event: CustomEvent) {
    console.log('Board item moved:', e(vent as CustomEvent).detail);
  }
  function handleBoardSave(_event: CustomEvent) {
    console.log('Board saved:', e(vent as CustomEvent).detail);
  }
</script>
<div class="p-6 space-y-6 bg-gray-50 min-h-screen">
  <div class="text-center mb-8">
    <h1 class="text-3xl font-bold mb-2">Enhanced Bits Legal AI Demo</h1>
    <p class="text-gray-600">Specialized UI components for legal evidence management</p>
  </div>
  <!-- Search Section -->
  <Card class="p-4">
    <h2 class="text-xl font-semibold mb-4">🔍 AI-Powered Search</h2>
    <SearchInput
      bind:value={searchQuery}
      placeholder="Search evidence, cases, legal documents..."
      enableVectorSearch={true}
      enableAISearch={true}
      filters={searchFilters}
      variant="legal"
      size="lg"
      onsearch={handleSearch}
      onselect={handleSearchSelect}
    />
  </Card>
  <!-- Evidence Gallery -->
  <Card class="p-4">
    <h2 class="text-xl font-semibold mb-4">📁 Evidence Gallery</h2>
    <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {#each Array.isArray(sampleEvidence) ? sampleEvidence : [] as evidence}
        <div
          class="cursor-pointer transform hover:scale-105 transition-transform"
          onclick={() => handleEvidenceSelect(evidence)}
        >
          <EvidenceThumbnail
            {evidence}
            size="md"
            showControls={true}
            showAIOverlay={evidence.type === 'image'}
            showHashVerification={true}
          />
          <div class="mt-2 text-center">
            <div class="text-sm font-medium truncate">{evidence.title}</div>
            <div class="text-xs text-gray-500">{evidence.type}</div>
          </div>
        </div>
      {/each}
    </div>
  </Card>
  <!-- Two Column Layout -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- AI Analysis Panel -->
    <Card class="p-4">
      <h2 class="text-xl font-semibold mb-4">🧠 AI Analysis</h2>
      {#if showAnalysis && selectedEvidence}
        <EvidenceAIAnalysis
          analysis={sampleAnalysis}
          evidence={selectedEvidence}
          variant="detailed"
          showRefresh={true}
          showExport={true}
        />
      {:else}
        <div class="text-center text-gray-500 py-8">
          <p>Select an evidence item to view AI analysis</p>
        {/if}
    </Card>
    <!-- Evidence Board -->
    <Card class="p-4">
      <h2 class="text-xl font-semibold mb-4">📋 Evidence Board</h2>
      <Board;
        bind:items={boardItems}
        layoutMode="freeform"
        showGrid={true}
        showConnections={true}
        enableDragging={true}
        height="400px"
        background="legal"
        onitemMove={handleBoardItemMove}
        onboardSave={handleBoardSave}
      />
    </Card>
  </div>
  <!-- Quick Actions -->
  <Card class="p-4">
    <h2 class="text-xl font-semibold mb-4">⚡ Quick Actions</h2>
    <div class="flex flex-wrap gap-3">
      <Button variant="primary" onclick={() => (showAnalysis = true)}>Run AI Analysis</Button>
      <Button variant="secondary" onclick={() => console.log('Export case')}>Export Case</Button>
      <Button variant="success" onclick={() => console.log('Generate report')}>Generate Report</Button>
      <Button variant="warning" onclick={() => console.log('Flag critical')}>Flag Critical</Button>
      <Button variant="error" onclick={() => console.log('Archive case')}>Archive Case</Button>
    </div>
  </Card>
  <!-- Component Stats -->
  <Card class="p-4 bg-blue-50">
    <h3 class="text-lg font-semibold mb-3">📊 Demo Statistics</h3>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
      <div>
        <div class="text-2xl font-bold text-blue-600">{sampleEvidence.length}</div>
        <div class="text-sm text-gray-600">Evidence Items</div>
      </div>
      <div>
        <div class="text-2xl font-bold text-purple-600">{sampleAnalysis.entities.length}</div>
        <div class="text-sm text-gray-600">Detected Entities</div>
      </div>
      <div>
        <div class="text-2xl font-bold text-green-600">{Math.round(sampleAnalysis.confidence * 100)}%</div>
        <div class="text-sm text-gray-600">AI Confidence</div>
      </div>
      <div>
        <div class="text-2xl font-bold text-orange-600">{boardItems.length}</div>
        <div class="text-sm text-gray-600">Board Items</div>
      </div>
    </div>
  </Card>
  <!-- Technical Information -->
  <Card class="p-4 bg-gray-100">
    <details>
      <summary class="font-semibold cursor-pointer mb-3">🛠️ Technical Implementation Details</summary>
      <div class="space-y-3 text-sm">
        <div>
          <h4 class="font-medium">Components Used:</h4>
          <ul class="list-disc list-inside pl-4 space-y-1">
            <li><code>EvidenceThumbnail</code> - Multi-format evidence preview with AI overlays</li>
            <li><code>EvidenceAIAnalysis</code> - Comprehensive AI analysis display</li>
            <li><code>SearchInput</code> - Vector search with filtering capabilities</li>
            <li><code>Board</code> - Interactive drag-and-drop evidence organization</li>
            <li><code>Card</code> - Enhanced container with NES.css styling</li>
            <li><code>Button</code> - Multi-variant action buttons</li>
          </ul>
        </div>
        <div>
          <h4 class="font-medium">Features Demonstrated:</h4>
          <ul class="list-disc list-inside pl-4 space-y-1">
            <li>Svelte 5 runes: $state(), $derived(), $effect()</li>
            <li>TypeScript integration with legal domain types</li>
            <li>NES.css + NieR theming with enhanced components</li>
            <li>Real-time interactive board with drag-and-drop</li>
            <li>AI-powered evidence analysis visualization</li>
            <li>Vector search with confidence scoring</li>
            <li>Responsive grid layouts for legal workflows</li>
          </ul>
        </div>
        <div>
          <h4 class="font-medium">Legal AI Platform Integration</h4>
          <ul class="list-disc list-inside pl-4 space-y-1">
            <li>PostgreSQL + pgvector backend compatibility</li>
            <li>Chain of custody tracking with hash verification</li>
            <li>Evidence confidence scoring and prioritization</li>
            <li>Multi-format evidence support (documents, images, videos, audio)</li>
            <li>Real-time AI analysis with entity extraction</li>
            <li>Legal metadata management with JSONB optimization</li>
          </ul>
        </div>
      </div>
    </details>
  </Card>
</div>
;
