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
  import type { Button, Dialog, Input  } from './index';
  // Local SelectOption type (used by the demo data)
  type SelectOption = {
    value: string;
    label: string;
    description?: string;
    category?: string;
  };
  import type { cn  } from '$lib/utils/cn';
  import type { Search, FileText, Scale, Brain, AlertTriangle, CheckCircle  } from 'lucide-svelte';
  // Demo state using Svelte 5 runes
  let selectedCaseType = $state('');
  let selectedEvidenceCategory = $state('');
  let searchQuery = $state('');
  let dialogOpen = $state(false);
  let evidenceDialogOpen = $state(false);
  let currentTab = $state('buttons');
  let selectedEvidenceCard = $state(null);
  let aiAnalysisLoading = $state(false);
  let evidenceUploadProgress = $state(0);
  // Mock data for demos
  const caseTypes: SelectOption[] = [
    { value: 'criminal', label: 'Criminal Cases', description: 'Criminal law proceedings and investigations' },
    { value: 'civil', label: 'Civil Litigation', description: 'Civil disputes and tort claims' },
    { value: 'family', label: 'Family Law', description: 'Divorce, custody, and family matters' },
    { value: 'corporate', label: 'Corporate Law', description: 'Business and corporate legal affairs' },
    { value: 'contract', label: 'Contract Law', description: 'Contract disputes and negotiations' },
    { value: 'intellectual', label: 'Intellectual Property', description: 'Patents, trademarks, and IP disputes' },
  ];
  const evidenceCategories: SelectOption[] = [
    { value: 'critical', label: 'Critical Evidence', description: 'High-priority evidence for case', category: 'Priority' },
    { value: 'supporting', label: 'Supporting Evidence', description: 'Additional supporting materials', category: 'Priority' },
    { value: 'document', label: 'Legal Documents', description: 'Contracts, motions, briefs', category: 'Type' },
    { value: 'multimedia', label: 'Multimedia Evidence', description: 'Audio, video, images', category: 'Type' },
    { value: 'witness', label: 'Witness Testimony', description: 'Depositions and statements', category: 'Type' },
  ];
  const mockEvidenceItems = [
    { id: '1', title: 'Contract Amendment #3', type: 'document', priority: 'critical' as const confidence: 'high' as const description: 'Modified terms regarding liability clauses' },
    { id: '2', title: 'Security Camera Footage', type: 'video', priority: 'high' as const confidence: 'medium' as const description: 'Incident recording from 2024-01-15' },
    { id: '3', title: 'Expert Witness Statement', type: 'document', priority: 'medium' as const confidence: 'high' as const description: 'Technical analysis by Dr. Smith' },
  ] as const;
  // Demo functions
  async function runAIAnalysis() {
    aiAnalysisLoading = true;
    // Simulate AI processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    aiAnalysisLoading = $state(false);
  }
  async function uploadEvidence() {
    evidenceUploadProgress = 0;
    const interval = setInterval(() => {
      evidenceUploadProgress += 10;
      if (evidenceUploadProgress >= 100) {
        clearInterval(interval);
        evidenceDialogOpen = $state(false);
        evidenceUploadProgress = 0;
      }
    }, 200);
  }
  function selectEvidenceCard(id: string) {
    selectedEvidenceCard = selectedEvidenceCard === id ? null : id;
  }
  // Reactive computed values using $derived
  function tabClasses(tab: string) { return cn('px-4 py-2 text-sm font-medium border-b-2 transition-colors', {
      'border-nier-border-primary text-nier-text-primary bg-nier-bg-tertiary': currentTab === tab, 'border-transparent text-nier-text-secondary hover:text-nier-text-primary hover:border-nier-border-secondary':
        currentTab !== tab });
  }
  let demoSections = $derived([
    { id: 'buttons', label: 'Enhanced Buttons', icon FileText },
    { id: 'inputs', label: 'Smart Inputs', icon Search },
    { id: 'dialogs', label: 'Legal Dialogs', icon Scale },
    { id: 'cards', label: 'Evidence Cards', icon Brain },
  ]);
</script>
<div class="yorha-panel p-6 max-w-6xl mx-auto">
  <!-- Header -->
  <div class="yorha-panel-header mb-6">
    <h1 class="text-2xl font-gothic tracking-wide text-nier-text-primary mb-2">Enhanced Bits UI v2 Integration Demo</h1>
    <p class="text-nier-text-secondary">
      Comprehensive showcase of Bits UI components enhanced with Svelte 5 runes, UnoCSS styling, and legal AI features.
    </p>
  </div>
  <!-- Tab Navigation -->
  <div class="border-b border-nier-border-secondary mb-6">
    <nav class="flex space-x-8">
      {#each demoSections as section (section.id)}
        <button class={tabClasses(section.id)} onclick={() => (currentTab = section.id)}>
          <div class="flex items-center gap-2">
            <section.icon class="w-4 h-4" />
            {section.label}
          </div>
        </button>
      {/each}
    </nav>
  </div>
  <!-- Demo Content -->
  <div class="demo-content">
    {#if currentTab === 'buttons'}
      <!-- Enhanced Buttons Demo -->
      <div class="demo-config-section">
        <h2 class="text-xl font-gothic mb-4 text-nier-text-primary">Enhanced Button Components</h2>
        <p class="text-nier-text-secondary mb-6">
          Buttons with legal AI context, confidence indicators, and NieR theming.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <!-- Standard Variants -->
          <div class="yorha-nier-bits-card p-4">
            <h3 class="font-semibold mb-3 text-nier-text-primary">Standard Variants</h3>
            <div class="space-y-3">
              <Button class="bits-btn" variant="default">Default Button</Button>
              <Button class="bits-btn" variant="primary">Primary Action</Button>
              <Button class="bits-btn" variant="default">YoRHa Legal</Button>
              <Button class="bits-btn" variant="ghost">Outline Style</Button>
            </div>
          </div>
          <!-- Legal AI Variants -->
          <div class="yorha-nier-bits-card p-4">
            <h3 class="font-semibold mb-3 text-nier-text-primary">Legal AI Variants</h3>
            <div class="space-y-3">
              <Button class="bits-btn" variant="crimson">Critical Evidence</Button>
              <Button class="bits-btn" variant="gold">Case Analysis</Button>
              <Button class="bits-btn" variant="primary">Review Required</Button>
              <Button class="bits-btn" variant="ghost" loading>Processing...</Button>
            </div>
          </div>
          <!-- Priority Buttons -->
          <div class="yorha-nier-bits-card p-4">
            <h3 class="font-semibold mb-3 text-nier-text-primary">Priority Actions</h3>
            <div class="space-y-3">
              <Button class="bits-btn" variant="destructive">
                <AlertTriangle class="w-4 h-4 mr-2" />
                Critical Alert
              </Button>
              <Button class="bits-btn" variant="ghost">High Priority</Button>
              <Button class="bits-btn" variant="secondary">Medium Priority</Button>
              <Button class="bits-btn" variant="ghost">Low Priority</Button>
            </div>
          </div>
        </div>
      </div>
    {:else if currentTab === 'inputs'}
      <!-- Enhanced Inputs Demo -->
      <div class="demo-config-section">
        <h2 class="text-xl font-gothic mb-4 text-nier-text-primary">Smart Input Components</h2>
        <p class="text-nier-text-secondary mb-6">
          Input fields with AI assistance, legal context validation, and evidence search capabilities.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Search Inputs -->
          <div class="yorha-nier-bits-card p-4">
            <h3 class="font-semibold mb-3 text-nier-text-primary">Search & Evidence</h3>
            <div class="space-y-4">
              <Input
                variant="search"
                placeholder="Search legal precedents..."
                bind:value={searchQuery}
                evidenceSearch
                legal
                label="Evidence Search"
                helpText="AI-powered semantic search across case database"
              />
              <Input
                variant="legal"
                placeholder="Case number (e.g., CV-2024-001)"
                caseNumber
                legal
                label="Case Reference"
                pattern="^[A-Z]{2}-\d{4}-\d{3}$"
                errorMessage="Invalid case number format"
              />
              <Input
                variant="evidence"
                placeholder="Document title or description..."
                aiAssisted
                legal
                label="Evidence Description"
                helpText="AI will suggest tags and categorization"
                showCharCount
                maxlength={200}
              />
            </div>
          </div>
          <!-- Status Inputs -->
          <div class="yorha-nier-bits-card p-4">
            <h3 class="font-semibold mb-3 text-nier-text-primary">Status & Validation</h3>
            <div class="space-y-4">
              <Input
                variant="default"
                placeholder="Validated input..."
                success
                label="Validated Field"
                helpText="All validation checks passed"
                icon={CheckCircle}
                iconPosition="right"
              />
              <Input
                variant="default"
                placeholder="Error state input..."
                error
                errorMessage="This field requires legal review"
                label="Error State"
                icon={AlertTriangle}
                iconPosition="right"
              />
              <Input
                variant="password"
                placeholder="Secure access..."
                label="Secure Information"
                helpText="Encrypted storage for sensitive data"
                legal
              />
            </div>
          </div>
        </div>
      </div>
    {:else if currentTab === 'dialogs'}
      <!-- Enhanced Dialogs Demo -->
      <div class="demo-config-section">
        <h2 class="text-xl font-gothic mb-4 text-nier-text-primary">Legal Dialog Components</h2>
        <p class="text-nier-text-secondary mb-6">
          Modal dialogs optimized for legal workflows with evidence analysis and case management features.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Button class="bits-btn" variant="default" onclick={() => (dialogOpen = true)}>Case Management</Button>
          <Button class="bits-btn" variant="primary" onclick={() => (evidenceDialogOpen = true)}>
            Evidence Upload
          </Button>
          <Button class="bits-btn" variant="ghost" onclick={runAIAnalysis} loading={aiAnalysisLoading}>
            {#if aiAnalysisLoading}
              Running AI Analysis...
            {:else}
              AI Case Analysis
            {/if}
          </Button>
        </div>
        <!-- Case Management Dialog -->
        <Dialog bind:open={dialogOpen} size="lg">
          <div data-legal data-case-management>
            <div class="yorha-panel-header">
              <h2 class="text-xl font-gothic text-nier-text-primary">Case Management System</h2>
              <p class="text-nier-text-secondary mt-2">
                Comprehensive case tracking and evidence management for legal professionals.
              </p>
            </div>
            <div class="yorha-panel-content space-y-6">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div data-legal data-case-type>
                  <!-- Fallback native select (replaces missing Select component) -->
                  <label for="case-category-select" class="block text-sm mb-2 text-nier-text-secondary"
                    >Case Category</label
                  >
                  <select
                    id="case-category-select"
                    bind:value={selectedCaseType}
                    class="w-full rounded border px-3 py-2 bg-transparent text-nier-text-primary"
                  >
                    <option value="" disabled>Select case type...</option>
                    {#each Array.isArray(caseTypes) ? caseTypes : [] as opt}
                      <option value={opt.value} title={opt.description}>{opt.label}</option>
                    {/each}
                  </select>
                </div>
                <div data-legal>
                  <Input variant="legal" placeholder="Enter case title..." label="Case Title" required />
                </div>
              </div>
              <div class="agent-nier-bits-card p-4">
                <h3 class="font-semibold text-nier-text-primary mb-2">AI Assistant Recommendations</h3>
                <ul class="space-y-2 text-sm text-nier-text-secondary">
                  <li class="flex items-center gap-2">
                    <div class="ai-status-indicator ai-status-online w-2 h-2"></div>
                    Configure evidence collection strategy
                  </li>
                  <li class="flex items-center gap-2">
                    <div class="ai-status-indicator ai-status-online w-2 h-2"></div>
                    Set up automated document review
                  </li>
                  <li class="flex items-center gap-2">
                    <div class="ai-status-indicator ai-status-processing w-2 h-2"></div>
                    Schedule precedent research
                  </li>
                </ul>
              </div>
            </div>
            <div class="bits-dialog-footer">
              <Button class="bits-btn" variant="ghost" onclick={() => (dialogOpen = false)}>Cancel</Button>
              <Button class="bits-btn" variant="primary">Create Case</Button>
            </div>
          </div>
        </Dialog>
        <!-- Evidence Upload Dialog -->
        <Dialog bind:open={evidenceDialogOpen} size="md">
          <div data-legal data-evidence-analysis>
            <div class="yorha-panel-header">
              <h2 class="text-xl font-gothic text-nier-text-primary">Evidence Upload</h2>
              <p class="text-nier-text-secondary mt-2">Upload and categorize evidence with AI-powered analysis.</p>
            </div>
            <div class="yorha-panel-content space-y-4">
              <div data-legal data-evidence-category>
                <!-- Native select for evidence category -->
                <label for="evidence-type-select" class="block text-sm mb-2 text-nier-text-secondary"
                  >Evidence Type</label
                >
                <select
                  id="evidence-type-select"
                  bind:value={selectedEvidenceCategory}
                  class="w-full rounded border px-3 py-2 bg-transparent text-nier-text-primary"
                >
                  <option value="" disabled>Select evidence category...</option>
                  {#each Array.isArray(evidenceCategories) ? evidenceCategories : [] as opt}
                    <option value={opt.value} title={opt.description}>{opt.label}</option>
                  {/each}
                </select>
              </div>
              {#if evidenceUploadProgress > 0}
                <div class="processing-bar">
                  <div class="processing-indicator" style="width: {evidenceUploadProgress}%"></div>
                </div>
                <p class="text-sm text-nier-text-secondary text-center">
                  Processing evidence... {evidenceUploadProgress}%
                </p>
              {:else}
                <div class="yorha-drop-zone p-8 text-center">
                  <FileText class="w-12 h-12 mx-auto mb-4 text-nier-text-muted" />
                  <p class="text-nier-text-secondary">Drop files here or click to browse</p>
                {/if}
            </div>
            <div class="bits-dialog-footer">
              <Button class="bits-btn" variant="ghost" onclick={() => (evidenceDialogOpen = false)}>Cancel</Button>
              <Button class="bits-btn" variant="primary" onclick={uploadEvidence} disabled={evidenceUploadProgress > 0}>
                Upload Evidence
              </Button>
            </div>
          </div>
        </Dialog>
      </div>
    {:else if currentTab === 'cards'}
      <!-- Enhanced Cards Demo -->
      <div class="demo-config-section">
        <h2 class="text-xl font-gothic mb-4 text-nier-text-primary">Evidence Card Components</h2>
        <p class="text-nier-text-secondary mb-6">
          Interactive cards for evidence management with priority indicators and AI confidence scores.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each mockEvidenceItems as item (item.id)}
            <button
              type="button"
              class="nes-container yorha-nier-bits-card p-4 cursor-pointer transition-all duration-200 hover:shadow-lg"
              class:ring-2={selectedEvidenceCard === item.id}
              class:ring-nier-border-primary={selectedEvidenceCard === item.id}
              aria-pressed={selectedEvidenceCard === item.id}
              onclick={() => selectEvidenceCard(item.id)}
            >
              <div class="space-y-3">
                <div class="flex items-start justify-between">
                  <h3 class="font-semibold text-nier-text-primary text-sm">
                    {item.title}
                  </h3>
                  <div class="vector-confidence-badge vector-confidence-{item.confidence}">
                    {item.confidence.toUpperCase()}
                  </div>
                </div>
                <p class="text-xs text-nier-text-secondary">
                  {item.description}
                </p>
                <div class="flex items-center justify-between text-xs">
                  <span class="yorha-priority-{item.priority} px-2 py-1 rounded text-white">
                    {item.priority.toUpperCase()}
                  </span>
                  <span class="text-nier-text-muted">
                    {item.type.toUpperCase()}
                  </span>
                </div>
                {#if selectedEvidenceCard === item.id}
                  <div class="border-t border-nier-border-secondary pt-3 mt-3">
                    <div class="flex gap-2">
                      <Button size="sm" variant="ghost" class="flex-1 bits-btn bits-btn">Review</Button>
                      <Button size="sm" variant="primary" class="flex-1 bits-btn bits-btn">Analyze</Button>
                    </div>
                  {/if}
              </div>
            </button>
          {/each}
        </div>
        <!-- AI Analysis Card -->
        <div class="mt-6">
          <div data-variant="default" data-ai-analysis data-confidence="high" data-size="lg" class="p-6 nes-container">
            <div class="space-y-4">
              <div class="flex items-center gap-3">
                <Brain class="w-6 h-6 text-blue-600" />
                <div>
                  <h3 class="font-semibold text-nier-text-primary">AI Case Analysis Results</h3>
                  <p class="text-sm text-nier-text-secondary">Generated with 94% confidence</p>
                </div>
              </div>
              <div class="prose prose-sm max-w-none text-nier-text-secondary">
                <p>
                  Based on the uploaded evidence and case parameters, the AI analysis suggests a strong likelihood of
                  success for this contract dispute. Key factors include clear breach documentation and favorable
                  precedent cases.
                </p>
              </div>
              <div class="flex gap-2">
                <Button class="bits-btn" size="sm" variant="primary">Accept Analysis</Button>
                <Button class="bits-btn" size="sm" variant="ghost">Request Review</Button>
                <Button class="bits-btn" size="sm" variant="ghost">Generate Report</Button>
              </div>
            </div>
          </div>
        </div>
      {/if}
  </div>
  <!-- Footer -->
  <div class="mt-8 pt-6 border-t border-nier-border-secondary">
    <div class="text-center text-sm text-nier-text-muted">
      <p>Enhanced Bits UI v2 Integration • Svelte 5 Runes • UnoCSS • Legal AI • NieR Theme</p>
    </div>
  </div>
</div>
<style>
  /* @unocss-include */
  .demo-content {
    min-height: 400px;
  }
  /* Enhanced demo styling */
  :global(.demo-config-section) {
    animation: demo-section-enter 0.5s ease-out;
  }
  @keyframes demo-section-enter {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  /* Hover/card elevation fix (replaced invalid :global($1)) */
  :global(.yorha-nier-bits-card:hover) {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
  }
  /* Tab navigation styling */
  .demo-content {
    background: linear-gradient(135deg, var(--color-nier-bg-primary) 0%, var(--color-nier-bg-secondary) 100%);
    border-radius: 8px;
    padding: 2rem;
    margin-top: 1rem;
  }
  /* Legal AI specific demo styling */
  :global(.yorha-drop-zone) {
    background: linear-gradient(
      45deg,
      transparent 25%,
      rgba(58, 55, 47, 0.05) 25%,
      rgba(58, 55, 47, 0.05) 75%,
      transparent 75%
    );
    background-size: 20px 20px;
    border: 2px dashed var(--color-nier-border-secondary);
    border-radius: 8px;
    transition: all 0.3s ease;
  }
  :global(.yorha-drop-zone:hover) {
    border-color: var(--color-nier-border-primary);
    background-color: var(--color-nier-bg-tertiary);
  }
  /* Processing animation: */
  :global(.processing-bar) {
    height: 4px;
    background: var(--color-nier-bg-tertiary);
    border-radius: 2px;
    overflow: hidden;
  }
  :global(.processing-indicator) {
    height: 100%;
    background: linear-gradient(90deg, var(--color-ai-status-online), var(--color-ai-status-processing));
    transition: width: 0.3s ease;
  }
</style>
