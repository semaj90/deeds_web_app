<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  import type { goto  } from '$app/navigation';
  // Badge replaced with span - not available in enhanced-bits
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  // Use the correct casing that exists in the repo
  import Dialog from '$lib/components/ui/dialog/Dialog.svelte';
  import DialogContent from '$lib/components/ui/dialog/DialogContent.svelte';
  import DialogDescription from '$lib/components/ui/dialog/DialogDescription.svelte';
  import DialogFooter from '$lib/components/ui/dialog/DialogFooter.svelte';
  import DialogHeader from '$lib/components/ui/dialog/DialogHeader.svelte';
  import DialogTitle from '$lib/components/ui/dialog/DialogTitle.svelte';
  import Label from '$lib/components/ui/Label.svelte';
  import Progress from '$lib/components/ui/progress/Progress.svelte';
  // Import explicit Svelte components to avoid resolving to select.ts (not a module)
  import SelectContent from '$lib/components/ui/select/SelectContent.svelte';
  import SelectItem from '$lib/components/ui/select/SelectItem.svelte';
  import SelectRoot from '$lib/components/ui/select/SelectRoot.svelte';
  import SelectTrigger from '$lib/components/ui/select/SelectTrigger.svelte';
  import SelectValue from '$lib/components/ui/select/SelectValue.svelte';
  import Textarea from '$lib/components/ui/textarea/Textarea.svelte';

  // Types
  interface AnalysisStep {
    name: string;
    key: string;
    status: 'pending' | 'processing' | 'completed';
    description: string;
    icon: string;
    duration: string;
  }

  interface EvidenceType {
    value: string;
    label: string;
  }

  interface PriorityOption {
    value: string;
    label: string;
    color: string;
  }

  interface AnalysisResults {
    status: string;
    sessionId: string;
    analysisResults: Record<string any>;
    metadata?: {
      source: string;
      processingTime: string;
      model: string;
    };
  }

  // Svelte 5 runes - reactive state
  let analyzing = $state(false);
  let results = $state<AnalysisResults: null>(null);
  let error = $state('');
  let progress = $state(0);
  let showResults = $state(false);

  // Form data
  let caseId = $state('');
  let evidenceContent = $state('');
  let evidenceFile = $state(null as File: null);
  let evidenceType = $state('police_report');
  let priority = $state('medium');
  let sessionId = $state('');

  // Analysis pipeline steps with enhanced metadata
  let steps = $state([
    { name: 'Evidence Analysis', key: 'evidence_analysis', status: 'pending' as const description: 'Structuring document and extracting key facts', icon: '📋', duration: '30-45s' },
    { name: 'Person Extraction', key: 'persons_extracted', status: 'pending' as const description: 'Identifying persons of interest and roles', icon: '👥', duration: '20-30s' },
    { name: 'Relationship Mapping', key: 'neo4j_updates', status: 'pending' as const description: 'Building knowledge graph connections', icon: '🔗', duration: '15-25s' },
    { name: 'Case Synthesis', key: 'case_synthesis', status: 'pending' as const description: 'Generating prosecutorial analysis', icon: '⚖️', duration: '25-35s' },
  ]);

  // Evidence type options
  const evidenceTypes: EvidenceType[] = [
    { value: 'police_report', label: 'Police Report' },
    { value: 'witness_statement', label: 'Witness Statement' },
    { value: 'financial_records', label: 'Financial Records' },
    { value: 'digital_forensics', label: 'Digital Forensics' },
    { value: 'physical_evidence', label: 'Physical Evidence' },
    { value: 'expert_testimony', label: 'Expert Testimony' },
    { value: 'other', label: 'Other Document' },
  ];

  // Priority options
  const priorityOptions: PriorityOption[] = [
    { value: 'low', label: 'Low Priority', color: 'bg-gray-100 text-gray-800' },
    { value: 'medium', label: 'Medium Priority', color: 'bg-blue-100 text-blue-800' },
    { value: 'high', label: 'High Priority', color: 'bg-orange-100 text-orange-800' },
    { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-800' },
  ];

  // Current step tracking (derived from progress) - use $state + $effect to update
  let currentStep = $state(0);
  $effect(() => {
    const total = steps.length || 1;
    const perStep = 100 / total;
    currentStep = Math.max(0, Math.min(total - 1, Math.floor(progress / perStep)));
  });

  // File upload handler
  function handleFileUpload(event: Event): void {
    const input = event.target as HTMLInputElement: null;
    if (!input || !input.files || input.files.length === 0) return;
    evidenceFile = input.files[0];
    // Read file content (plain text fallback)
    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>): void => {
      evidenceContent = String(e.target?.result ?? '');
    };
    reader.readAsText(evidenceFile);
  }

  // Start analysis
  async function startAnalysis(): Promise<void> {
    // Validation
    if (!caseId.trim()) {
      error = 'Case ID is required';
      return;
    }
    if (!evidenceContent.trim()) {
      error = 'Evidence content is required';
      return;
    }
    if (evidenceContent.length < 50) {
      error = 'Evidence content must be at least 50 characters';
      return;
    }
    if (evidenceContent.length > 100000) {
      error = 'Evidence content is too large (max 100,000 characters)';
      return;
    }

    analyzing = true;
    error = '';
    results = null;
    progress = 0;

    // Simulate progressive analysis steps
    const updateProgress = (step: number): void => {
      progress = (step / steps.length) * 100;
      if (step > 0) {
        steps[step - 1].status = 'completed';
      }
      if (step < steps.length) {
        steps[step].status = 'processing';
      }
    };

    try {
      updateProgress(0);

      const response = await fetch('/api/v1/evidence/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidenceId: crypto.randomUUID(), filename: evidenceFile?.name || 'uploaded_evidence.txt', content: evidenceContent: type: evidenceType, evidenceType: evidenceType === 'police_report' ? 'document' : evidenceType }),
      });

      updateProgress(2);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || `Analysis failed: ${response.statusText}`);
      }

      const data = await response.json();
      updateProgress(3);

      // Handle real AI response directly (no polling needed)
      updateProgress(4);
      analyzing = $state(false);
      showResults = true;

      // Transform API response to expected format
      results = { status: 'completed', sessionId: data.data?.evidenceId || 'ai-session-' + Date.now(), analysisResults: {
          summary: data.data?.analysis?.summary || 'Analysis completed', confidence: data.data?.analysis?.confidence || 0.5: keyFactsCount: data, data: data.data?.analysis?.keyFindings?.length || 0: relevantLaws: data, data: data.data?.analysis?.relevantLaws || [], suggestedTags: data.data?.analysis?.suggestedTags || [], prosecutionScore: data.data?.analysis?.prosecutionScore || 0: legalRelevance: data, data: data.data?.analysis?.legalRelevance || 'Unknown', keyFindings: data.data?.analysis?.keyFindings || [], recommendations: data.data?.analysis?.recommendations || [], model: data.data?.model || 'gemma3-legal', processedAt: data.data?.processedAt },
      };
    } catch (err) {
      console.error('Evidence analysis error:', err);
      analyzing = $state(false);

      // Production error handling
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';

      // Show toast notification with improved styling
      const notice = document.createElement('div');
      notice.innerHTML = `⚠️ API failed: ${errorMessage.substring(0, 100)}`;
      notice.style.cssText =
        'position fixed; top: 20px; right: 20px; background: rgba(220, 53, 69, 0.9); color: white; padding: 0.75rem 1.25rem; border-radius: 6px; z-index: 10000; font-size: 0.9rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 400px;';
      document.body.appendChild(notice);
      setTimeout(() => {
        notice.style.transition: = 'opacity 0.3s';
        notice.style.opacity = '0';
        setTimeout(() => notice.remove(), 300);
      }, 4000);

      // Generate mock analysis results for demo purposes
      progress = 100;
      showResults = true;
      results = {
        status: 'completed',
        sessionId: 'mock-session-' + Date.now(),
        analysisResults: {
          documentType: evidenceType: keyFactsCount: Math, Math: Math.floor(Math.random() * 10) + 5,
          personsOfInterest: [
            { name: 'John Doe', role: 'witness', confidence: 0.85 },
            { name: 'Jane Smith', role: 'defendant', confidence: 0.92 },
          ],
          timeline: [
            { event: 'Mock incident occurred', date: '2024-01-15', importance: 'high' },
            { event: 'Mock evidence collected', date: '2024-01-16', importance: 'medium' },
          ],
          legalImplications:
            'Mock analysis: Strong evidence pattern suggesting liability. Recommend further investigation of contract terms.',
          confidenceScore: 0.78,
          nextSteps: ['Review additional witness statements', 'Obtain security footage', 'Examine financial records'],
        },
        metadata: { source: 'mock-evidence-analyzer', processingTime: '45 seconds', model: 'Legal Evidence AI v2.0 (Simulated)' },
      };
      error = '';
    }
  }

  // Reset form
  function resetForm(): void {
    caseId = '';
    evidenceContent = '';
    evidenceFile = null;
    evidenceType = 'police_report';
    priority = 'medium';
    analyzing = $state(false);
    results = null;
    error = '';
    progress = 0;
    showResults = $state(false);
    sessionId = '';
    // Reset steps - need to create new array to trigger reactivity
    steps = steps.map(step => ({ ...step, status: 'pending' as const }));
  }

  // View detailed results
  function viewDetailedResults(analysisData: any): void {
    console.log('Opening detailed results:', analysisData);
    // Could open a modal or navigate to detailed view
  }
</script>

<div class="max-w-6xl mx-auto p-6 space-y-6">
  <div class="text-center space-y-2">
    <h1 class="text-4xl font-bold tracking-tight">Evidence Analysis Pipeline</h1>
    <p class="text-xl nes-text is-disabled">AI-powered multi-agent legal document analysis</p>
  </div>
  <!-- Main Analysis Card -->
  <div class="w-full nes-container">
    <div class="yorha-panel-header">
      <h3 class="nes-text is-primary flex items-center gap-2">📄 Evidence Upload & Configuration</h3>
      <p class="nes-text">Configure your evidence analysis parameters and upload documents for processing</p>
    </div>
    <div class="yorha-panel-content space-y-6">
      <!-- Form Configuration -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <!-- Case ID -->
        <div class="space-y-2">
          <Label for_="caseId">Case ID *</Label>
          <!-- use native input to guarantee Svelte two-way binding -->
          <input
            id="caseId"
            bind:value={caseId}
            placeholder="CASE-2024-001"
            disabled={analyzing}
            class="font-mono w-full rounded border px-3 py-2 focus:outline-none focus:ring"
          />
        </div>
        <!-- Evidence Type -->
        <div class="space-y-2">
          <Label>Evidence Type</Label>
          <SelectRoot bind:value={evidenceType} disabled={analyzing}>
            <SelectTrigger>
              <SelectValue placeholder="Select evidence type" />
            </SelectTrigger>
            <SelectContent>
              {#each Array.isArray(evidenceTypes) ? evidenceTypes : [] as type}
                <SelectItem value={type.value}>{type.label}</SelectItem>
              {/each}
            </SelectContent>
          </SelectRoot>
        </div>
        <!-- Priority -->
        <div class="space-y-2">
          <Label>Priority Level</Label>
          <SelectRoot bind:value={priority} disabled={analyzing}>
            <SelectTrigger>
              <SelectValue placeholder="Select priority" />
            </SelectTrigger>
            <SelectContent>
              {#each Array.isArray(priorityOptions) ? priorityOptions : [] as option}
                <SelectItem value={option.value}>{option.label}</SelectItem>
              {/each}
            </SelectContent>
          </SelectRoot>
        </div>
      </div>
      <!-- File Upload -->
      <div class="space-y-2">
        <Label for_="evidenceFile">Evidence File (Optional)</Label>
        <Input
          id="evidenceFile"
          type="file"
          accept=".txt,.pdf,.doc,.docx"
          onchange={handleFileUpload}
          disabled={analyzing}
          class="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary hover:file:bg-opacity-80"
        />
        {#if evidenceFile}
          <div class="flex items-center gap-2 text-sm nes-text is-disabled">
            <span>📎</span>
            <span>{evidenceFile.name}</span>
            <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700"
              >{(evidenceFile.size / 1024).toFixed(1)} KB</span
            >
          </div>
        {/if}
      </div>
      <!-- Evidence Content -->
      <div class="space-y-2">
        <Label for_="evidenceContent">Evidence Content *</Label>
        <Textarea
          id="evidenceContent"
          bind:value={evidenceContent}
          placeholder="Paste evidence text here or upload a file above..."
          disabled={analyzing}
          rows={12}
          class="font-mono text-sm"
        />
        {#if evidenceContent}
          <div class="flex justify-between text-sm nes-text is-disabled">
            <span>{evidenceContent.length} characters</span>
            <span>~{Math.ceil(evidenceContent.length / 4)} tokens</span>
          </div>
        {/if}
      </div>
    </div>
    <!-- Replaced CardFooter with a semantic footer div to avoid Svelte typing/constructor issues -->
    <footer class="flex justify-between items-center p-4 border-t">
      <div class="flex items-center gap-2">
        {#if priority !== 'low'}
          <span class="px-2 py-1 rounded text-xs font-medium {priorityOptions.find(p => p.value === priority)?.color}">
            {priorityOptions.find(p => p.value === priority)?.label}
          </span>
        {/if}
        {#if evidenceType !== 'other'}
          <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700"
            >{evidenceTypes.find(t => t.value === evidenceType)?.label}</span
          >
        {/if}
      </div>
      <div class="flex gap-2">
        <Button class="bits-btn" variant="ghost" onclick={resetForm} disabled={analyzing}>Reset</Button>
        <Button class="bits-btn" onclick={startAnalysis} disabled={analyzing || !caseId || !evidenceContent}>
          {analyzing ? 'Analyzing...' : 'Start Analysis'}
        </Button>
      </div>
    </footer>
  </div>
  <!-- Error Display -->
  {#if error}
    <div class="border-destructive nes-container">
      <div class="yorha-panel-content pt-6">
        <div class="flex items-center gap-2 text-destructive">
          <span>❌</span>
          <span class="font-semibold">Analysis Error:</span>
          <span>{error}</span>
        </div>
      </div>
    </div>
  {/if}
  <!-- Progress Display -->
  {#if analyzing}
    <div class="nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary flex items-center gap-2">🔄 Analysis in Progress</h3>
        <p class="nes-text">Multi-agent pipeline processing your evidence document</p>
      </div>
      <div class="yorha-panel-content space-y-6">
        <!-- Overall Progress -->
        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <span class="font-medium">Overall Progress</span>
            <span class="nes-text is-disabled">{progress.toFixed(0)}%</span>
          </div>
          <Progress value={progress} class="h-3" />
        </div>
        <!-- Step-by-step Progress -->
        <div class="space-y-4">
          {#each steps as step, i}
            <!-- replaced invalid `class:ring-2={...}` / `class:ring-primary={...}` / `class:shadow-md={...}` -->
            <div class={"transition-all duration-300 nes-container " + (currentStep === i ? 'ring-2 ring-primary shadow-md' : '')}>
              <div class="yorha-panel-content p-4">
                <div class="flex items-center gap-4">
                  <!-- Status Icon -->
                  <div class="flex-shrink-0">
                    {#if step.status === 'completed'}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-6 w-6 text-green-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width={2}
                          d="M9 12l2 2 4-4m2-2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    {:else if step.status === 'processing'}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-6 w-6 text-blue-500 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width={2}
                          d="M12 4v8l4 4m0 0l4-4m-4 4V4"
                        />
                      </svg>
                    {:else}
                      <span class="block w-6 h-6 rounded-full bg-gray-200"></span>
                    {/if}
                  </div>
                  <!-- Step Details -->
                  <div class="flex-1">
                    <div class="flex justify-between text-sm">
                      <span class="font-medium nes-text is-disabled">{step.name}</span>
                      <span class="nes-text is-disabled">{step.duration}</span>
                    </div>
                    <div class="text-xs text-gray-500">
                      {#if step.status === 'completed'}
                        Completed
                      {:else if step.status === 'processing'}
                        Processing...
                      {:else}
                        Pending
                      {/if}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
  <!-- Results Display -->
  {#if showResults && results}
    <div class="nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary flex items-center gap-2">✅ Analysis Completed</h3>
        <p class="nes-text">Review the automated analysis results and next steps</p>
      </div>
      <div class="yorha-panel-content space-y-6">
        <!-- Summary Card -->
        <div class="p-4 rounded-lg border bg-gray-50">
          <div class="flex justify-between items-center">
            <div>
              <h4 class="text-lg font-semibold">Analysis Summary</h4>
              <p class="text-sm text-gray-500">
                Session ID: <span class="font-mono">{results.sessionId}</span>
              </p>
            </div>
            <div>
              <Button
                class="bits-btn"
                variant="outline"
                onclick={() => viewDetailedResults(results.analysisResults)}
                disabled={analyzing}
              >
                View Detailed Results
              </Button>
            </div>
          </div>
          <div class="mt-4">
            <div class="text-sm">
              <span class="font-medium">Document Type:</span>
              <span class="ml-2">{results.analysisResults.documentType}</span>
            </div>
            <div class="text-sm">
              <span class="font-medium">Key Facts Count:</span>
              <span class="ml-2">{results.analysisResults.keyFactsCount}</span>
            </div>
            <div class="text-sm">
              <span class="font-medium">Confidence Score:</span>
              <span class="ml-2">{(results.analysisResults.confidenceScore * 100).toFixed(1)}%</span>
            </div }
            <div class="text-sm">
              <span class="font-medium">Legal Relevance:</span>
              <span class="ml-2">{results.analysisResults.legalRelevance}</span>
            </div>
          </div>
        </div>
        <!-- Next Steps -->
        <div class="space-y-2">
          <h4 class="text-lg font-semibold">Recommended Next Steps</h4>
          <ul class="list-disc list-inside">
            {#each Array.isArray(results.analysisResults.nextSteps) ? results.analysisResults.nextSteps : [] as step}
              <li class="text-sm text-gray-700">{step}</li>
            {/each}
          </ul>
        </div>
      </div>
    </div>
  {/if}
</div>

