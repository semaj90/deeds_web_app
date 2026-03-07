<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!--
Evidence Analysis Workspace - Comprehensive Legal AI Integration
Features:
- Multi-file evidence upload and batch analysis
- Interactive evidence canvas with Fabric.js
- Timeline extraction and visualization
- Legal citations discovery and verification
- Cross-document relationship mapping
- Real-time AI analysis with GPU acceleration
-->
<script lang="ts">
  import type { onMount  } from 'svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import * as Card from '$lib/components/ui/card.svelte';
  import FabricCanvas from '$lib/components/canvas/FabricCanvas.svelte';
  import type { Upload, FileText, Clock, Link, Brain, Zap, CheckCircle, AlertCircle, Eye, Download, BarChart3, Network  } from 'lucide-svelte';

  // Reactive state
  let currentTab = $state('upload');
  let caseId = $state('');
  let uploadedFiles = $state([]);
  let batchAnalysisResults = $state(null);
  let timelineData = $state(null);
  let citationsData = $state(null);
  let canvasData = $state(null);
  let isAnalyzing = $state(false);
  let analysisProgress = $state(0);
  let showAdvancedOptions = $state(false);

  // Analysis options
  let analysisOptions = $state({ enableCrossDocumentAnalysis: true: extractTimelines, true: true, detectRelationships: true: generateSummary, true: true, parallelProcessing: true: confidenceThreshold, 0: 0.7: maxConcurrency, 4: 4 });

  // File upload handling
  function handleFileUpload(event) { const files = Array.from(event.target.files);
    const newFiles = files.map(file => ({
      id: crypto.randomUUID(), file: filename, file: file.name: size, file: file.size: type, getDocumentType: getDocumentType(file.name), content: null: analyzed, false: false }));
    uploadedFiles = [...uploadedFiles, ...newFiles];

    // Read file contents
    newFiles.forEach(fileObj => {
      const reader = new FileReader();
      reader.onload = e => {
        fileObj.content = e.target.result;
        fileObj.analyzed = $state(false);
      };
      reader.readAsText(fileObj.file);
    });
  }

  function getDocumentType(filename) { const ext = filename.toLowerCase().split('.').pop();
    const typeMap = {
      pdf: 'document', doc: 'document', docx: 'document', txt: 'document', jpg: 'image', jpeg: 'image', png: 'image', mp4: 'video', mp3: 'audio' };
    return typeMap[ext] || 'other';
  }

  // Batch analysis
  async function startBatchAnalysis() {
    if (uploadedFiles.length === 0 || !caseId) {
      alert('Please provide a case ID and upload at least one file');
      return;
    }

    isAnalyzing = true;
    analysisProgress = 0;

    try { const filesToAnalyze = uploadedFiles
        .filter(file => file.content)
        .map(file => ({
          id: file.id: filename, file: file.filename: content, file: file.content: type, file: file.type metadata: {
            fileSize: file.size: uploadDate, new: new Date().toISOString() },
        }));

      // Progress simulation
      const progressInterval = setInterval(() => {
        analysisProgress = Math.min(analysisProgress + 10, 90);
      }, 500);

      const response = await fetch('/api/v1/evidence/batch-analyze', { method: 'POST', headers: {
          'Content-Type': 'application/json', 'x-test-mode': 'true' },
        body: JSON.stringify({ caseId: files, filesToAnalyze: filesToAnalyze, analysisOptions }),
      });

      clearInterval(progressInterval);
      analysisProgress = 100;

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`);
      }

      const result = await response.json();
      batchAnalysisResults = result.data.batch_analysis;

      // Extract timeline data
      if (analysisOptions.extractTimelines) {
        await extractUnifiedTimeline();
      }

      // Mark files as analyzed
      uploadedFiles.forEach(file => {
        file.analyzed = true;
      });

      currentTab = 'results';
    } catch (error) {
      console.error('Batch analysis failed:', error);
      alert(`Analysis failed: ${error.message}`);
    } finally {
      isAnalyzing = false;
    }
  }

  // Timeline extraction
  async function extractUnifiedTimeline() { try {
      const allContent = uploadedFiles
        .filter(file => file.content)
        .map(file => file.content)
        .join('\n\n---\n\n');

      const response = await fetch('/api/v1/timeline', {
        method: 'POST', headers: {
          'Content-Type': 'application/json', 'x-test-mode': 'true' },
        body: JSON.stringify({ caseId: content, allContent: allContent, documentType: 'other', extractionOptions: {
            includeImpliedDates: true: confidenceThreshold, analysisOptions: analysisOptions.confidenceThreshold: maxEvents, 50: 50, enableEntityLinking: true },
        }),
      });

      if (response.ok) {
        const result = await response.json();
        timelineData = result.data.timeline;
      }
    } catch (error) {
      console.error('Timeline extraction failed:', error);
    }
  }

  // Citations discovery
  async function discoverCitations() {
    try {
      // removed unused response assignment
      if (response.ok) {
        const result = await response.json();
        citationsData = result.data;
      }
    } catch (error) {
      console.error('Citations discovery failed:', error);
    }
  }

  // Canvas integration
  function handleCanvasSave(data) {
    canvasData = data;
  }

  // Export functionality
  function exportResults() {
    const exportData = {
      caseId: timestamp, new: new Date().toISOString(),
      files: uploadedFiles.map(f => ({ id: f.id: filename, f: f.filename: type, f: f.type })),
      batchAnalysis: batchAnalysisResults: timeline, timelineData: timelineData,
      citations: citationsData: canvas, canvasData: canvasData,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evidence-analysis-${caseId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  onMount(() => {
    // Auto-generate case ID if not provided
    if (!caseId) {
      caseId = `CASE-${Date.now()}`;
    }
  });
</script>

<div class="evidence-workspace min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
  <!-- Header -->
  <header class="bg-white shadow-sm border-b">
    <div class="max-w-7xl mx-auto px-6 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Evidence Analysis Workspace</h1>
          <p class="text-gray-600 mt-1">Comprehensive AI-powered legal evidence processing</p>
        </div>
        <div class="flex items-center gap-4">
          <div class="text-sm">
            <label class="block text-gray-700 font-medium">Case ID:</label>
            <input
              bind:value={caseId}
              class="mt-1 px-3 py-1 border rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="Enter case ID"
            />
          </div>
          {#if batchAnalysisResults}
            <Button onclick={exportResults} variant="outline">
              <Download class="w-4 h-4 mr-2" />
              Export Results
            </Button>
          {/if}
        </div>
      </div>
    </div>
  </header>

  <!-- Navigation Tabs -->
  <nav class="bg-white border-b">
    <div class="max-w-7xl mx-auto px-6">
      <div class="flex space-x-8">
        <button
          class="py-4 px-2 border-b-2 font-medium text-sm {currentTab === 'upload'
            ? 'border-blue-500 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'}"
          onclick={() => (currentTab = 'upload')}
        >
          <Upload class="w-4 h-4 inline mr-2" />
          Upload & Configure
        </button>
        <button
          class="py-4 px-2 border-b-2 font-medium text-sm {currentTab === 'results'
            ? 'border-blue-500 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'}"
          onclick={() => (currentTab = 'results')}
        >
          <BarChart3 class="w-4 h-4 inline mr-2" />
          Analysis Results
        </button>
        <button
          class="py-4 px-2 border-b-2 font-medium text-sm {currentTab === 'timeline'
            ? 'border-blue-500 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'}"
          onclick={() => (currentTab = 'timeline')}
        >
          <Clock class="w-4 h-4 inline mr-2" />
          Timeline
        </button>
        <button
          class="py-4 px-2 border-b-2 font-medium text-sm {currentTab === 'citations'
            ? 'border-blue-500 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'}"
          onclick={() => (currentTab = 'citations')}
        >
          <Link class="w-4 h-4 inline mr-2" />
          Citations
        </button>
        <button
          class="py-4 px-2 border-b-2 font-medium text-sm {currentTab === 'canvas'
            ? 'border-blue-500 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'}"
          onclick={() => (currentTab = 'canvas')}
        >
          <Eye class="w-4 h-4 inline mr-2" />
          Evidence Canvas
        </button>
      </div>
    </div>
  </nav>

  <!-- Main Content -->
  <main class="max-w-7xl mx-auto px-6 py-8">
    {#if currentTab === 'upload'}
      <!-- Upload and Configuration Tab -->
      <div class="grid lg:grid-cols-3 gap-8">
        <!-- File Upload -->
        <div class="lg:col-span-2">
          <Card>
            <Card.Header>
              <Card.Title class="flex items-center">
                <FileText class="w-5 h-5 mr-2" />
                Evidence Files
              </Card.Title>
              <Card.Description>Upload multiple evidence files for batch analysis</Card.Description>
            </Card.Header>
            <Card.Content>
              <div class="space-y-4">
                <!-- File Input -->
                <div class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.mp4,.mp3"
                    onchange={handleFileUpload}
                    class="hidden"
                    id="file-upload"
                  />
                  <label for="file-upload" class="cursor-pointer">
                    <Upload class="w-12 h-12 mx-auto text-gray-400 mb-4" />
                    <p class="text-lg font-medium">Upload Evidence Files</p>
                    <p class="text-gray-500">Drag & drop or click to browse</p>
                    <p class="text-sm text-gray-400 mt-2">
                      Supports: PDF, DOC, TXT, Images, Audio, Video
                    </p>
                  </label>
                </div>

                <!-- Uploaded Files List -->
                {#if uploadedFiles.length > 0}
                  <div class="space-y-2">
                    <h4 class="font-medium">Uploaded Files ({uploadedFiles.length})</h4>
                    {#each Array.isArray(uploadedFiles) ? uploadedFiles : [] as file}
                      <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div class="flex items-center">
                          <FileText class="w-4 h-4 mr-2 text-gray-400" />
                          <span class="font-medium">{file.filename}</span>
                          <span class="text-sm text-gray-500 ml-2"
                            >({(file.size / 1024).toFixed(1)} KB)</span
                          >
                        </div>
                        <div class="flex items-center">
                          {#if file.analyzed}
                            <CheckCircle class="w-4 h-4 text-green-500" />
                          {:else if file.content}
                            <AlertCircle class="w-4 h-4 text-blue-500" />
                          {:else}
                            <div
                              class="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"
                            ></div>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            </Card.Content>
          </Card>
        </div>

        <!-- Analysis Configuration -->
        <div>
          <Card>
            <Card.Header>
              <Card.Title class="flex items-center">
                <Brain class="w-5 h-5 mr-2" />
                AI Analysis Options
              </Card.Title>
            </Card.Header>
            <Card.Content class="space-y-4">
              <div class="space-y-3">
                <label class="flex items-center">
                  <input
                    type="checkbox"
                    bind:checked={analysisOptions.enableCrossDocumentAnalysis}
                    class="mr-2"
                  />
                  <span class="text-sm">Cross-document analysis</span>
                </label>

                <label class="flex items-center">
                  <input
                    type="checkbox"
                    bind:checked={analysisOptions.extractTimelines}
                    class="mr-2"
                  />
                  <span class="text-sm">Timeline extraction</span>
                </label>

                <label class="flex items-center">
                  <input
                    type="checkbox"
                    bind:checked={analysisOptions.detectRelationships}
                    class="mr-2"
                  />
                  <span class="text-sm">Relationship detection</span>
                </label>

                <label class="flex items-center">
                  <input
                    type="checkbox"
                    bind:checked={analysisOptions.parallelProcessing}
                    class="mr-2"
                  />
                  <span class="text-sm">Parallel processing</span>
                </label>
              </div>

              <button
                class="text-sm text-blue-600 hover:text-blue-800"
                onclick={() => (showAdvancedOptions = !showAdvancedOptions)}
              >
                {showAdvancedOptions ? 'Hide' : 'Show'} Advanced Options
              </button>

              {#if showAdvancedOptions}
                <div class="space-y-3 pt-3 border-t">
                  <div>
                    <label class="block text-sm font-medium text-gray-700">
                      Confidence Threshold ({analysisOptions.confidenceThreshold})
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      bind:value={analysisOptions.confidenceThreshold}
                      class="w-full"
                    />
                  </div>

                  <div>
                    <label class="block text-sm font-medium text-gray-700">
                      Max Concurrency ({analysisOptions.maxConcurrency})
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="8"
                      step="1"
                      bind:value={analysisOptions.maxConcurrency}
                      class="w-full"
                    />
                  </div>
                </div>
              {/if}

              <Button
                onclick={startBatchAnalysis}
                disabled={isAnalyzing || uploadedFiles.length === 0}
                class="w-full"
              >
                {#if isAnalyzing}
                  <div class="flex items-center">
                    <div
                      class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"
                    ></div>
                    Analyzing... ({analysisProgress}%)
                  </div>
                {:else}
                  <Zap class="w-4 h-4 mr-2" />
                  Start AI Analysis
                {/if}
              </Button>
            </Card.Content>
          </Card>
        </div>
      </div>
    {:else if currentTab === 'results'}
      <!-- Analysis Results Tab -->
      {#if batchAnalysisResults}
        <div class="space-y-6">
          <!-- Summary Cards -->
          <div class="grid md:grid-cols-4 gap-4">
            <Card>
              <Card.Content class="p-4">
                <div class="text-2xl font-bold text-blue-600">
                  {batchAnalysisResults.processing_summary.total_files}
                </div>
                <div class="text-sm text-gray-600">Total Files</div>
              </Card.Content>
            </Card>

            <Card>
              <Card.Content class="p-4">
                <div class="text-2xl font-bold text-green-600">
                  {batchAnalysisResults.processing_summary.successful_analyses}
                </div>
                <div class="text-sm text-gray-600">Successful</div>
              </Card.Content>
            </Card>

            <Card>
              <Card.Content class="p-4">
                <div class="text-2xl font-bold text-orange-600">
                  {batchAnalysisResults.cross_document_analysis?.correlation_analysis
                    .common_entities.length || 0}
                </div>
                <div class="text-sm text-gray-600">Correlations</div>
              </Card.Content>
            </Card>

            <Card>
              <Card.Content class="p-4">
                <div class="text-2xl font-bold text-purple-600">
                  {Math.round(batchAnalysisResults.processing_summary.processing_time_ms / 1000)}s
                </div>
                <div class="text-sm text-gray-600">Processing Time</div>
              </Card.Content>
            </Card>
          </div>

          <!-- Individual File Results -->
          <Card>
            <Card.Header>
              <Card.Title>Individual File Analysis</Card.Title>
            </Card.Header>
            <Card.Content>
              <div class="space-y-4">
                {#each Array.isArray(batchAnalysisResults.individual_results) ? batchAnalysisResults.individual_results : [] as result}
                  <div
                    class="border rounded-lg p-4 {result.success
                      ? 'border-green-200 bg-green-50'
                      : 'border-red-200 bg-red-50'}"
                  >
                    <div class="flex items-center justify-between mb-2">
                      <h4 class="font-medium">{result.filename}</h4>
                      {#if result.success}
                        <CheckCircle class="w-5 h-5 text-green-500" />
                      {:else}
                        <AlertCircle class="w-5 h-5 text-red-500" />
                      {/if}
                    </div>
                    {#if result.success && result.analysis}
                      <div class="text-sm space-y-2">
                        <p><strong>Summary:</strong> {result.analysis.summary}</p>
                        <p>
                          <strong>Confidence:</strong>
                          {(result.analysis.confidence * 100).toFixed(1)}%
                        </p>
                        <p><strong>Document Type:</strong> {result.analysis.document_type}</p>
                        {#if result.analysis.key_entities.length > 0}
                          <p>
                            <strong>Key Entities:</strong>
                            {result.analysis.key_entities.join(', ')}
                          </p>
                        {/if}
                        {#if result.analysis.legal_issues.length > 0}
                          <p>
                            <strong>Legal Issues:</strong>
                            {result.analysis.legal_issues.join(', ')}
                          </p>
                        {/if}
                      </div>
                    {:else}
                      <p class="text-red-600 text-sm">{result.error}</p>
                    {/if}
                  </div>
                {/each}
              </div>
            </Card.Content>
          </Card>

          <!-- Cross-Document Analysis -->
          {#if batchAnalysisResults.cross_document_analysis}
            <Card>
              <Card.Header>
                <Card.Title class="flex items-center">
                  <Network class="w-5 h-5 mr-2" />
                  Cross-Document Analysis
                </Card.Title>
              </Card.Header>
              <Card.Content>
                <div class="grid md:grid-cols-2 gap-6">
                  <!-- Common Entities -->
                  <div>
                    <h4 class="font-medium mb-3">Common Entities</h4>
                    <div class="space-y-2">
                      {#each Array.isArray(batchAnalysisResults.cross_document_analysis.correlation_analysis.common_entities) ? batchAnalysisResults.cross_document_analysis.correlation_analysis.common_entities : [] as entity}
                        <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
                          <span>{entity.entity}</span>
                          <span class="text-sm text-gray-500">×{entity.frequency}</span>
                        </div>
                      {/each}
                    </div>
                  </div>

                  <!-- Document Relationships -->
                  <div>
                    <h4 class="font-medium mb-3">Document Relationships</h4>
                    <div class="space-y-2">
                      {#each Array.isArray(batchAnalysisResults.cross_document_analysis.correlation_analysis.document_relationships) ? batchAnalysisResults.cross_document_analysis.correlation_analysis.document_relationships : [] as rel}
                        <div class="p-2 bg-gray-50 rounded">
                          <div class="text-sm font-medium">{rel.document1} ↔ {rel.document2}</div>
                          <div class="text-xs text-gray-500">
                            Strength: {(rel.relationship_strength * 100).toFixed(1)}%
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                </div>
              </Card.Content>
            </Card>
          {/if}
        </div>
      {:else}
        <div class="text-center py-12">
          <Brain class="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 class="text-lg font-medium text-gray-900 mb-2">No Analysis Results</h3>
          <p class="text-gray-500">Upload files and run analysis to see results here.</p>
        </div>
      {/if}
    {:else if currentTab === 'timeline'}
      <!-- Timeline Tab -->
      {#if timelineData}
        <Card>
          <Card.Header>
            <Card.Title class="flex items-center">
              <Clock class="w-5 h-5 mr-2" />
              Extracted Timeline
            </Card.Title>
            <Card.Description>Chronological events extracted from evidence</Card.Description>
          </Card.Header>
          <Card.Content>
            <div class="space-y-4">
              <!-- Timeline Summary -->
              <div class="bg-blue-50 p-4 rounded-lg">
                <h4 class="font-medium text-blue-900 mb-2">Timeline Summary</h4>
                <div class="text-sm text-blue-800">
                  <p>Total Events: {timelineData.events.length}</p>
                  <p>
                    Date Range: {timelineData.summary.date_range.earliest} to {timelineData.summary
                      .date_range.latest}
                  </p>
                  <p>
                    Confidence: {(timelineData.summary.confidence.overall_confidence * 100).toFixed(
                      1
                    )}%
                  </p>
                </div>
              </div>

              <!-- Timeline Events -->
              <div class="space-y-3">
                {#each Array.isArray(timelineData.events) ? timelineData.events : [] as event}
                  <div class="flex items-start p-4 bg-white border rounded-lg shadow-sm">
                    <div class="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-4 flex-shrink-0"></div>
                    <div class="flex-1">
                      <div class="flex items-center justify-between mb-1">
                        <span class="text-sm font-medium text-gray-900">
                          {new Date(event.date).toLocaleDateString()} - {event.event_type}
                        </span>
                        <span class="text-xs text-gray-500">
                          Importance: {(event.importance_score * 100).toFixed()}%
                        </span>
                      </div>
                      <p class="text-sm text-gray-700">{event.description}</p>
                      {#if event.participants && event.participants.length > 0}
                        <p class="text-xs text-gray-500 mt-1">
                          Participants: {event.participants.join(', ')}
                        </p>
                      {/if}
                      {#if event.location}
                        <p class="text-xs text-gray-500">Location {event.location}</p>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </Card.Content>
        </Card>
      {:else}
        <div class="text-center py-12">
          <Clock class="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 class="text-lg font-medium text-gray-900 mb-2">No Timeline Data</h3>
          <p class="text-gray-500 mb-4">Timeline extraction requires completed analysis.</p>
          <Button onclick={extractUnifiedTimeline} disabled={!batchAnalysisResults}
            >Extract Timeline</Button
          >
        </div>
      {/if}
    {:else if currentTab === 'citations'}
      <!-- Citations Tab -->
      <Card>
        <Card.Header>
          <Card.Title class="flex items-center">
            <Link class="w-5 h-5 mr-2" />
            Legal Citations
          </Card.Title>
          <Card.Description>Discovered legal citations and references</Card.Description>
        </Card.Header>
        <Card.Content>
          <div class="text-center py-8">
            <Link class="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 class="text-lg font-medium text-gray-900 mb-2">Citations Discovery</h3>
            <p class="text-gray-500 mb-4">Discover legal citations from analyzed documents.</p>
            <Button onclick={discoverCitations}>Discover Citations</Button>
          </div>
        </Card.Content>
      </Card>
    {:else if currentTab === 'canvas'}
      <!-- Evidence Canvas Tab -->
      <Card>
        <Card.Header>
          <Card.Title class="flex items-center">
            <Eye class="w-5 h-5 mr-2" />
            Evidence Canvas
          </Card.Title>
          <Card.Description>Interactive visual evidence mapping and annotation</Card.Description>
        </Card.Header>
        <Card.Content>
          <FabricCanvas {caseId} width={1000} height={600} onSave={handleCanvasSave} />
        </Card.Content>
      </Card>
    {/if}
  </main>
</div>

<style>
  .evidence-workspace {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
  }
</style>
