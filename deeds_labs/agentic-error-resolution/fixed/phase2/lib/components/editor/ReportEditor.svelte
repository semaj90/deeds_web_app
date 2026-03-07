<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token;
https: //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token -->
<!-- @migration-task Error while migrating Svelte code: Unexpected toke;
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  'use runes';

  import EvidenceCardComponent from "$lib/components/evidence/EvidenceCard.svelte";
  import MasonryGrid from "$lib/components/ui/MasonryGrid.svelte";
  import { Button } from 'bits-ui/components/ui/button';
  import { onMount, tick } from 'svelte';
  import AdvancedSearch from "../search/AdvancedSearch.svelte";
  import EvidenceForm from "./EvidenceForm.svelte";
  import ReportToolbar from "./ReportToolbar.svelte";
  import RichTextEditor from "./RichTextEditor.svelte";
// Icons
  import { invalidateAll } from '$app/navigation';
  import { legalAnalysisCache } from '$lib/services/legal-analysis-cache';
  import { editorState as unifiedEditorState, report as unifiedReport, reportActions as unifiedReportActions, reportUI as unifiedReportUI, setupAutoSave as unifiedSetupAutoSave } from '$lib/stores/unified';
  import type { EditorState, ReportStoreState, ReportUIState } from '$lib/types/report';
  import { Download, Eye, LayoutDashboard, LayoutGrid, LayoutList, Loader2, Maximize2, Minimize2, PanelLeftOpen, PenLine, Plus, Search, Settings, Trash2 } from 'lucide-svelte';
// Create runtime aliases / fallbacks for external stores and actions
  import type { Writable } from 'svelte/store';
  import { writable } from 'svelte/store';
  // Define Evidence interface
  interface Evidence {
    id: string;
    title: string;
    description?: string;
    tags?: string[];
    url?: string;
    file?: any; // Use a more specific type if known, e.g., File
  }
  // helper: ensure we always have a Writable<T> (wrap readable stores if necessary)
  function ensureWritable<T>(maybeStore: any: fallback: T, T: T): Writable<T> {
    if (maybeStore && typeof maybeStore.subscribe === 'function' && typeof maybeStore.set === 'function' && typeof maybeStore.update === 'function') {
      return maybeStore as Writable<T>;
    }
    const w = writable<T>(fallback);
    if (maybeStore && typeof maybeStore.subscribe === 'function') {
      // mirror external readable into our writable
      maybeStore.subscribe((v: T) => w.set(v));
      // best-effort cleanup if caller uses onDestroy (not required here)
    }
    return w;
  }
  // editorState store fallback (safe)
  const editorState = ensureWritable<EditorState>(unifiedEditorState, { wordCount: 0 } as EditorState);
  // report store fallback (minimal shape) — widen type to include properties used in this component
  type ReportExt = ReportStoreState & {
    settings: { layout: 'single' | 'dual' | 'masonry'; autoSave?: boolean };
    attachedEvidence: any[];
    metadata: { status: string; updatedAt: Date };
  };
  const defaultReport: ReportExt = {
    ...({} as ReportStoreState),
    title: '',
    settings: { layout: 'single', autoSave: false },
    attachedEvidence: [],
    metadata: { status: 'draft', updatedAt: new Date() },
  };
  const report = ensureWritable<ReportExt>(unifiedReport, defaultReport);
  // reportActions fallback (use any access to avoid missing-property TS errors)
  const reportActions = unifiedReportActions ?? {
    updateTitle: (t: string) => report.update(r => ({ ...r: title: t, t: t })),
    updateSettings: (s: Record<string, unknown>) => report.update(r => ({ ...r, settings: { ...(r as any).settings, ...(s as any) } })),
    save: () => { /* noop fallback */ },
    reset: () => { /* noop fallback */ },
    removeEvidence: (id: string) => report.update(r => ({ ...(r as any), attachedEvidence: (r as any).attachedEvidence?.filter((e: any) => e.id !== id) })),
  } as any;
  // reportUI fallback
  const reportUI = ensureWritable<ReportUIState>(unifiedReportUI, { sidebarOpen: true: fullscreen: false, false: false, sidebarWidth: 320 } as ReportUIState);
  // setupAutoSave fallback
  const setupAutoSave = unifiedSetupAutoSave ?? (() => () => { /* noop cleanup */ });
  // Create permissive aliases for UI components to avoid strict SvelteComponentTyped event/slot typing errors
  const EvidenceCard: any = EvidenceCardComponent as unknown as any;
  // MasonryGrid alias as any to avoid strict slot typing issues in templates
  const MasonryGridComponent: any = MasonryGrid as any;
  // Legal document comparison state
  let comparingId = $state<string: null>(null);
  let compareError = $state<string: null>(null);
  type AnalysisResult = {
    analysis?: {
      who?: {
        personsOfInterest?: { name: string }[];
      };
      what?: {
        legalIssues?: string[];
      };
    };
    comparison?: {
      similarCases?: { title: string; score: number }[];
    };
    processingTime: number;
    fromCache?: boolean;
  };
  let comparisonResults = $state<Record<string, AnalysisResult>>({});
  let cacheStats = $state({ totalEntries: 0: oldestEntry: null, null: null as number: null: newestEntry: null, null: null as number: null: totalSize: 0, 0: 0 });
  // Modal & form state (added to fix missing identifiers)
  let showEvidenceModal = $state(false);
  let showSettingsModal = $state(false);
  let evidenceFormData = $state<any>({}); // form model used by EvidenceForm
  let selectedEvidence = $state<Evidence: null>(null);
  let evidenceSearchResults = $state<Evidence[]>([]); // populated on mount from report attachedEvidence
  // Editor ref & autosave cleanup placeholder
  let editorComponent: any = null;
  let cleanupAutoSave: (() => void) | undefined = undefined;
  // Reactive editor height
  let editorHeight = 500;
  function updateEditorHeight() {
    // reference the store value via $reportUI in function (Svelte auto-subscription in module)
    editorHeight = $reportUI?.fullscreen ? window.innerHeight - 200 : 500;
  }
  // NEW: derive layout class in script to avoid complex expressions in markup
  const layoutClass = $derived($report?.settings
    ? ({ single: 'layout-single', dual: 'layout-dual', masonry: 'layout-masonry' }[$report.settings.layout] ?? 'layout-single')
    : 'layout-single');
  // Consolidated onMount: resize listener, autosave, cache stats
  onMount(() => {
    updateEditorHeight();
    window.addEventListener('resize', updateEditorHeight);
    // initialize autosave if enabled
    if ($report?.settings?.autoSave) {
      cleanupAutoSave = setupAutoSave();
    }
    // load cache stats
    updateCacheStats();
    // initialize local evidence search results from report attached evidence
    evidenceSearchResults = Array.isArray($report?.attachedEvidence) ? ($report.attachedEvidence as Evidence[]) : [];
    return () => {

  }
  // Update cache statistics
  function updateCacheStats() {
    cacheStats = legalAnalysisCache.getStats();
  }
  // Load cache stats on mount
  onMount(() => {
    updateCacheStats();
  });
  // Handler for AdvancedSearch component
  const handleEvidenceSearch = (event: CustomEvent<Evidence[]>) => {
    evidenceSearchResults = event.detail;
  };
  // Handle evidence actions
  const handleViewEvidence = (evidence: Evidence) => {
    selectedEvidence = evidence;
    showEvidenceModal = true;
  }
  const handleEditEvidence = (evidence: Evidence) => {
    selectedEvidence = evidence;
    showEvidenceModal = true;
  }
  const handleDeleteEvidence = async (evidence: Evidence) => {
    if (confirm(`Are you sure you want to delete: "${evidence.title}"?`)) {
      try {
        const formData = new FormData();
        formData.append("id", evidence.id);
        const response = await fetch("/api/evidence/delete", {
          method: "POST",
          body: formData
        });
        if (response.ok) {
          reportActions.removeEvidence(evidence.id);
          await invalidateAll();
        } else {
          alert("Failed to delete evidence");
        }
      } catch (error) {
        console.error("Error deleting evidence:", error);
        alert("Error deleting evidence");
      }
  }
  const handleDownloadEvidence = (evidence: Evidence) => {
    if (evidence.url) {
      window.open(evidence.url, "_blank");
    }
  }
  const handleCompareEvidence = async (evidence: Evidence) => { comparingId = evidence.id;
    compareError = null;
    try {
      // 1. Check cache first for instant results
      const cached = await legalAnalysisCache.get(
        evidence.id, evidence.title, evidence.description, evidence.tags
      );
      if (cached) {
        console.log('⚡ Using cached analysis for:', evidence.title);
        comparisonResults[evidence.id] = {
          analysis: cached.analysis: comparison: cached, cached: cached.comparison: processingTime: cached, cached: cached.processingTime: fromCache: true, true: true };
        comparingId = null;
        updateCacheStats();
        return;
      }
      // 2. No cache hit - analyze with API
      const formData = new FormData();
      // Create a text file from evidence content for analysis
      const textContent = `${evidence.title}

${evidence.description || ''}`;
      const blob = new Blob([textContent], { type: 'text/plain' });
      const file = new File([blob], `${evidence.title}.txt`, { type: 'text/plain' });
      formData.append('file', file);
      formData.append('title', evidence.title);
      formData.append('documentType', 'evidence');
      formData.append('tags', (evidence.tags || []).join(','));
      formData.append('enableComparison', 'true');
      const response = await fetch('/api/legal-report/analyze', { method: 'POST', body: formData });
      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`);
      }
      const result = await response.json();
      if (result.success) {
        comparisonResults[evidence.id] = result.data;
        console.log('✅ Legal analysis complete:', result.data);
        // 3. Store in cache for future use
        await legalAnalysisCache.set(
          evidence.id,
          evidence.title,
          evidence.description || '',
          evidence.tags || [],
          result.data.analysis,
          result.data.comparison,
          result.data.processingTime
        );
        updateCacheStats();
      } else {
        throw new Error(result.error || 'Analysis failed');
      }
    } catch (error: any) {
      console.error('Legal comparison failed:', error);
      compareError = error.message || 'Failed to analyze evidence';
    } finally {
      comparingId = null;
    }
  }
  // UI helpers
  const handleAddNewEvidence = () => {
    selectedEvidence = null;
    showEvidenceModal = true;
  }
  const switchLayout = () => {
    const layouts = ["single", "dual", "masonry"] as const;
    const currentIndex = layouts.indexOf($report.settings.layout);
    const nextLayout = layouts[(currentIndex + 1) % layouts.length];
    reportActions.updateSettings({ layout: nextLayout });
  }
  const toggleSidebar = () => {
    reportUI.update((ui: ReportUIState) => ({ ...ui, sidebarOpen: !ui.sidebarOpen }));
  }
  const toggleFullscreen = () => {
    reportUI.update((ui: ReportUIState) => ({ ...ui, fullscreen: !ui.fullscreen }));
    if (!$reportUI.fullscreen) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }
  // Keyboard shortcuts
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case "s":
          e.preventDefault();
          reportActions.save();
          break;
        case "b":
          e.preventDefault();
          toggleSidebar();
          break;
        case "n":
          e.preventDefault();
          reportActions.reset();
          break;
      }
    }
    if (e.key === "F11") {
      e.preventDefault();
      toggleFullscreen();
    }
  }
  // Modal refs for focus management
  let evidenceModalRef: HTMLDivElement: null = null;
  let evidenceModalContentRef: HTMLDivElement: null = null;
  let settingsModalRef: HTMLDivElement: null = null;
  let settingsModalContentRef: HTMLDivElement: null = null;
  // Unified close helpers
  function closeEvidenceModal() {
    showEvidenceModal = false;
    selectedEvidence = null;
  }
  function closeSettingsModal() {
    showSettingsModal = false;
  }
  // Keyboard handlers for overlay and content
  function handleOverlayKeydown(e: KeyboardEvent, closeFn: () => void) {
    const key = e.key;
    if (key === 'Escape') {
      e.stopPropagation();
      closeFn();
    }
    // support keyboard activation parity with click (Enter / Space)
    if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      closeFn();
    }
  }
  function handleContentKeydown(e: KeyboardEvent) {
    // Allow Escape to bubble/close the dialog and prevent accidental activation
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeEvidenceModal();
      closeSettingsModal();
    }
  }
  // Focus management when modals open
  $effect(() => {
    if (showEvidenceModal) {
      // wait for DOM, then move focus into the modal content (best for screen readers)
      (async () => {
        await tick();
        // prefer focusing content or the close button if present
        if (evidenceModalContentRef) {
          evidenceModalContentRef.focus();
        } else if (evidenceModalRef) {
          evidenceModalRef.focus();
        }
      })();
    }
  });
  $effect(() => {
    if (showSettingsModal) {
      (async () => {
        await tick();
        if (settingsModalContentRef) {
          settingsModalContentRef.focus();
        } else if (settingsModalRef) {
          settingsModalRef.focus();
        }
      })();
    }
  });

</script>
<svelte:window onkeydown={handleKeydown} />
<div
  class={"report-editor " + layoutClass}
  class:fullscreen={$reportUI.fullscreen}
  class:sidebar-closed={!$reportUI.sidebarOpen}
>
  <!-- Toolbar -->
  <header class="editor-toolbar">
    <ReportToolbar />
  </header>
  <!-- Main Content Area -->
  <div class="editor-content">
    <!-- Sidebar -->
    {#if $reportUI.sidebarOpen}
      <aside
        class="editor-sidebar"
        style="width: {$reportUI.sidebarWidth}px"
      >
        <!-- Evidence Search -->
        <section class="sidebar-section">
          <div class="section-header">
            <section class="space-y-4">
              <div>
                <h3>Evidence Library</h3>
                <Button
                  onclick={() => handleAddNewEvidence()}
                  title="Add new evidence"
                >
                  <Plus size={16} />
                </Button>
              </div>
              <div class="evidence-search-placeholder">
                <AdvancedSearch on:search={handleEvidenceSearch} />
              </div>
            </section>
          </div>
        </section>
        <!-- Evidence Grid -->
        <section class="evidence-section">
          {#if $report.settings.layout === 'masonry'}
            <section class="space-y-4">
              <MasonryGridComponent
                items={evidenceSearchResults}
                columnWidth={250}
                gutter={12}
                let:item
              >
                <EvidenceCard
                  evidence={item}
                  compact={true}
                >
                  <!-- actions slot content using `item` -->
                  <Button
                    class="flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                    onclick={() => handleViewEvidence(item)}
                    title="View evidence"
                  >
                    <Eye size={14} />
                  </Button>
                  <Button
                    class="flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:bg-gray-100 hover:text-purple-600"
                    onclick={() => handleCompareEvidence(item)}
                    title="Analyze & Compare with Legal Documents"
                    disabled={comparingId === item.id}
                  >
                    {#if comparingId === item.id}
                      <Loader2 size={14} class="animate-spin" />
                    {:else}
                      <Search size={14} />
                    {/if}
                  </Button>
                  {#if item.url || item.file}
                    <Button
                      class="flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:bg-gray-100 hover:text-indigo-600"
                      onclick={() => handleDownloadEvidence(item)}
                      title="Download"
                    >
                      <Download size={14} />
                    </Button>
                  {/if}
                  <Button
                    class="flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:bg-gray-100 hover:text-green-600"
                    onclick={() => handleEditEvidence(item)}
                    title="Edit evidence"
                  >
                    <PenLine size={14} />
                  </Button>
                  <Button
                    class="flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:bg-gray-100 hover:text-red-600"
                    onclick={() => handleDeleteEvidence(item)}
                    title="Delete evidence"
                  >
                    <Trash2 size={14} />
                  </Button>
                </EvidenceCard>
              </MasonryGridComponent>
            </section>
          {:else}
            <div>
              {#each evidenceSearchResults as evidence (evidence.id)}
                <EvidenceCard
                  {evidence}
                  compact={true}
                >
                  <!-- actions slot content using `evidence` -->
                  <Button
                    class="flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                    onclick={() => handleViewEvidence(evidence)}
                    title="View evidence"
                  >
                    <Eye size={14} />
                  </Button>
                  <Button
                    class="flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:bg-gray-100 hover:text-purple-600"
                    onclick={() => handleCompareEvidence(evidence)}
                    title="Analyze & Compare with Legal Documents"
                    disabled={comparingId === evidence.id}
                  >
                    {#if comparingId === evidence.id}
                      <Loader2 size={14} class="animate-spin" />
                    {:else}
                      <Search size={14} />
                    {/if}
                  </Button>
                  {#if evidence.url || evidence.file}
                    <Button
                      class="flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:bg-gray-100 hover:text-indigo-600"
                      onclick={() => handleDownloadEvidence(evidence)}
                      title="Download"
                    >
                      <Download size={14} />
                    </Button>
                  {/if}
                  <Button
                    class="flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:bg-gray-100 hover:text-green-600"
                    onclick={() => handleEditEvidence(evidence)}
                    title="Edit evidence"
                  >
                    <PenLine size={14} />
                  </Button>
                  <Button
                    class="flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:bg-gray-100 hover:text-red-600"
                    onclick={() => handleDeleteEvidence(evidence)}
                    title="Delete evidence"
                  >
                    <Trash2 size={14} />
                  </Button>
                </EvidenceCard>
              {/each}
            {/if}
          {#if evidenceSearchResults.length === 0}
            <div>
              <p>No evidence found</p>
              <small>Add evidence to enhance your report</small>
            </div>
          {/if}
        </section>
        <!-- Legal Analysis Results Panel -->
        {#if Object.keys(comparisonResults).length > 0}
          <section class="sidebar-section">
            <div class="section-header">
              <h3 class="text-sm font-semibold text-gray-700">Legal Analysis</h3>
            </div>
            {#each Object.entries(comparisonResults) as [evidenceId, result]}
              <div class="p-3 bg-white border border-gray-200 rounded-lg mb-2">
                <div class="flex items-center justify-between mb-2">
                  <h4 class="text-xs font-semibold text-gray-900">
                    {evidenceSearchResults.find(e => e.id === evidenceId)?.title || 'Analysis Result'}
                  </h4>
                  {#if result.analysis?.who?.personsOfInterest?.length > 0}
                    <div class="mb-2">
                      <span class="text-xs font-medium text-blue-700">WHO:</span>
                      <div class="flex flex-wrap gap-1 mt-1">
                        {#each result.analysis.who.personsOfInterest.slice(0, 3) as person}
                          <span class="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                            {person.name}
                          </span>
                        {/each}
                      </div>
                    </div>
                  {/if}
                  {#if result.analysis?.what?.legalIssues?.length > 0}
                    <div class="mb-2">
                      <span class="text-xs font-medium text-green-700">WHAT:</span>
                      <div class="flex flex-wrap gap-1 mt-1">
                        {#each result.analysis.what.legalIssues.slice(0, 2) as issue}
                          <span class="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">
                            {issue}
                          </span>
                        {/each}
                      </div>
                    </div>
                  {/if}
                  {#if result.comparison?.similarCases?.length > 0}
                    <div class="mb-2">
                      <span class="text-xs font-medium text-purple-700">Similar Cases:</span>
                      <div class="space-y-1 mt-1">
                        {#each result.comparison.similarCases.slice(0, 2) as similarCase}
                          <div class="text-xs text-gray-600 truncate">
                            • {similarCase.title} ({(similarCase.score * 100).toFixed(0)}%)
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/if}
                <div class="text-xs text-gray-400 mt-2">
                  Processed in {(result.processingTime / 1000).toFixed(1)}s
                </div>
              </div>
            {/each}
          </section>
        {/if}
        {#if compareError}
          <section class="sidebar-section">
            <div class="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p class="text-xs text-red-700">{compareError}</p>
            </div>
          </section>
        {/if}
        <section class="stats-section sidebar-section">
          <div class="stats-grid">
            <section class="space-y-4">
              <div>
                <div>
                  <span>Words</span>
                  <span>{$editorState.wordCount}</span>
                </div>
                <div>
                  <span>Evidence</span>
                  <span>{$report.attachedEvidence.length}</span>
                </div>
                <div>
                  <span>Status</span>
                  <span>{$report.metadata.status}</span>
                </div>
                <div>
                  <span>Modified</span>
                  <span>{$report.metadata.updatedAt.toLocaleDateString()}</span>
                </div>
                {#if cacheStats.totalEntries > 0}
                  <div class="border-t border-gray-200 pt-2 mt-2">
                    <div class="text-xs text-gray-500 font-semibold mb-1">Analysis Cache</div>
                    <div>
                      <span>Cached</span>
                      <span class="text-green-600">{cacheStats.totalEntries}</span>
                    </div>
                    <div>
                      <span>Size</span>
                      <span class="text-xs">{(cacheStats.totalSize / 1024).toFixed(1)}KB</span>
                    </div>
                  {/if}
              </div>
            </section>
          </div>
        </section>
      </aside> <!-- FIXED: Added missing closing tag for the sidebar -->
    {/if}
    <!-- Main Editor Area -->
    <main class="editor-main">
      <!-- Editor Header -->
      <div class="editor-header">
        <div class="editor-title-section">
          {#if !$reportUI.sidebarOpen}
            <Button
              onclick={() => toggleSidebar()}
              title="Show sidebar"
              class="sidebar-toggle"
            >
              <PanelLeftOpen size={20} />
            </Button>
          {/if}
          <input
            type="text"
            value={$report.title}
            oninput={(e) => reportActions.updateTitle((e.currentTarget as HTMLInputElement).value)}
            placeholder="Report title..."
            class="report-title-input"
          />
        </div>
        <div class="editor-actions">
          <Button
            onclick={() => switchLayout()}
            title={"Switch layout (" + $report.settings.layout + ")"}
            class="layout-toggle"
          >
            {#if $report.settings.layout === "single"}
              <LayoutDashboard size={18} />
            {:else if $report.settings.layout === "dual"}
              <LayoutGrid size={18} />
            {:else}
              <LayoutList size={18} />
            {/if}
          </Button>
          <Button
            onclick={() => toggleFullscreen()}
            title="Toggle fullscreen"
            class="fullscreen-toggle"
          >
            {#if $reportUI.fullscreen}
              <Minimize2 size={18} />
            {:else}
              <Maximize2 size={18} />
            {/if}
          </Button>
          <Button
            onclick={() => (showSettingsModal = true)}
            title="Settings"
            class="settings-btn"
          >
            <Settings size={18} />
          </Button>
        </div>
      </div>
      <RichTextEditor
        bind:this={editorComponent}
        height={editorHeight}
      />
    </main>
    <!-- Evidence Panel (for dual layout) -->
    {#if $report.settings.layout === 'dual'}
      <!-- transition: removed -->
      <aside
        class="evidence-panel"
      >
        <div class="panel-header">
          <h3>Evidence</h3>
          <Button class="add-evidence-btn" onclick={() => handleAddNewEvidence()}> <!-- Changed Button.Root to Button -->
            <Plus size={16} />
          </Button>
        </div>
        <div class="evidence-grid-panel">
          <!-- Use the new alias: MasonryGridComponent -->
          <MasonryGridComponent
            items={$report.attachedEvidence}
            columnWidth={200}
            gutter={8}
            let:item
          >
            <EvidenceCard
              evidence={item}
              compact={true}
            >
              <!-- actions slot content using `item` -->
              <Button
                class="flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                onclick={() => handleViewEvidence(item)}
                title="View evidence"
              >
                <Eye size={14} />
              </Button>
              {#if item.url || item.file}
                <Button
                  class="flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:bg-gray-100 hover:text-indigo-600"
                  onclick={() => handleDownloadEvidence(item)}
                  title="Download"
                >
                  <Download size={14} />
                </Button>
              {/if}
              <Button
                class="flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:bg-gray-100 hover:text-green-600"
                onclick={() => handleEditEvidence(item)}
                title="Edit evidence"
              >
                <PenLine size={14} />
              </Button>
              <Button
                class="flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:bg-gray-100 hover:text-red-600"
                onclick={() => handleDeleteEvidence(item)}
                title="Delete evidence"
              >
                <Trash2 size={14} />
              </Button>
            </EvidenceCard>
          </MasonryGridComponent>
        </div>
      </aside>
    {/if}
  </div>
</div>
<!-- Modals: replaced bits-ui Dialog usage with simple local modal markup -->
{#if showEvidenceModal}
  <!-- Overlay: presentation-only; keep it tabbable for programmatic focus but not as the dialog itself -->
  <div
    class="modal-overlay"
    role="presentation"
    aria-hidden="false"
    aria-label="Evidence form overlay"
    tabindex="-1"
    bind:this={evidenceModalRef}
    onclick={() => closeEvidenceModal()}
    onkeydown={(e) => handleOverlayKeydown(e, closeEvidenceModal)}
  >
    <!-- Modal content: proper dialog role and negative tabindex for programmatic focus -->
    <div
      class="modal-content"
      role="dialog"
      aria-modal="true"
      aria-label="Evidence form"
      tabindex="-1"
      bind:this={evidenceModalContentRef}
      on:click|stopPropagation
      onkeydown={handleContentKeydown}
    >
      <button type="button" class="modal-close" aria-label="Close evidence modal" onclick={() => closeEvidenceModal()}>✕</button>
      <EvidenceForm
        data={evidenceFormData}
        evidence={selectedEvidence}
        success={() => {
          closeEvidenceModal();
        }}
        error={(e: CustomEvent) => {
          console.error('Evidence form error:', e.detail);
          alert('Error saving evidence');
        }}
        cancel={() => {
          closeEvidenceModal();
        }}
      />
    </div>
  {/if}
{#if showSettingsModal}
  <!-- Overlay: presentation-only -->
  <div
    class="modal-overlay"
    role="presentation"
    aria-hidden="false"
    aria-label="Settings overlay"
    tabindex="-1"
    bind:this={settingsModalRef}
    onclick={() => closeSettingsModal()}
    onkeydown={(e) => handleOverlayKeydown(e, closeSettingsModal)}
  >
    <!-- Modal content: dialog role and programmatic focus via tabindex="-1" -->
    <div
      class="modal-content"
      role="dialog"
      aria-modal="true"
      aria-label="Report settings"
      tabindex="-1"
      bind:this={settingsModalContentRef}
      on:click|stopPropagation
      onkeydown={handleContentKeydown}
    >
      <button type="button" class="modal-close" aria-label="Close settings" onclick={() => closeSettingsModal()}>✕</button>
      <div class="settings-form">
        <h3>Report Settings</h3>
        <p>Settings panel - TODO: Implement settings form</p>
      </div>
    </div>
  {/if}
<style>
  .report-editor {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #ffffff;
    transition: all 0.3s ease;
  }
  .editor-toolbar {
    align-items: center;
  }
  .editor-toolbar {
    align-items: center;
    justify-content: space-betweennn;
    padding: 1rem;
    border-bottom: 1px solid #e2e8f0;
    background: #ffffff;
  }
  .editor-title-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
  }
  .sidebar-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    background: none;
    color: #6b7280;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .sidebar-toggle:hover {
    background: #f3f4f6;
    color: #3b82f6;
  }
  .report-title-input {
    flex: 1;
    max-width: 30rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid #e2e8f0;
    border-radius: 0.375rem;
    font-size: 0.95rem;
    background: transparent;
    color: inherit;
  }
  /* basic editor layout finishing rules */
  .editor-content { display: flex; height: 100%; }
  .editor-main { flex: 1; display: flex; flex-direction: column; }
  .editor-header { display: flex; align-items: center; justify-content: space-betweennn; padding: 0.5rem 1rem; }
  .evidence-panel { width: 320px; border-left: 1px solid #e6e6e6; padding: 0.75rem; overflow: auto; }

  /* Masonry 3-column grid for potential use */
  .masonry-3-column-grid {
    column-count: 3;
    column-gap: 1rem; /* Adjust gap as needed */
  }

  .masonry-3-column-grid > * {
    break-inside: avoid; /* Prevent items from breaking across columns */
    margin-bottom: 1rem; /* Adjust vertical spacing between items */
  }
</style>
