<!-- @migration-task Error while migrating Svelte code: Unterminated string constant
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unterminated string constant
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unterminated string constant
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unterminated string constant
https://svelte.dev/e/js_parse_error -->
<!-- Enhanced Legal Document Editor with UnoCSS + bits-ui -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import type { quintOut  } from 'svelte/easing';
  import type { fade  } from 'svelte/transition';
  // Bits-UI components
  import * as Dialog from '$lib/components/ui/dialog.svelte'";
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu.svelte'";
  import * as Tooltip from '$lib/components/ui/tooltip.svelte'";
  import { Button } from '$lib/components/ui/button.svelte'";
  import { Input } from '$lib/components/ui/input.svelte'";
  import { Label } from '$lib/components/ui/label.svelte'";
  import { Textarea } from '$lib/components/ui/textarea.svelte'";
  import type { AlertCircle, BookOpen, Brain, ChevronDown, Eye, FileText, Loader2, Save, Scale, Search, Settings, Share2, // Corrected import for Share icon
    X  } from 'lucide-svelte';
  // Props
  let { caseId = undefined }: { caseId?: string } = $props();
  let { documentId = undefined }: { documentId?: string } = $props();
  let { documentType = "brief" }: { documentType?: "brief" | "contract" | "motion" | "evidence" } = $props();
  let { title = "Legal Document" }: { title?: string } = $props();
  let { readonly = false }: { readonly?: boolean } = $props();
  // Component state
  let content = $state("");
  let query = $state("");
  let isLoading = $state(false);
  let isProcessingAI = $state(false);
  let error = $state("");
  let loadingDocument = $state(false);
  let documentLoadError = $state("");
  interface Citation {
    id: string;
    text: string;
    source: string;
    type: string;
  }
  let citations = $state<Citation[]>([]);
  // Auto-save state
  let autoSaveTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  let lastSaved = $state("");
  let isSaving = $state(false);
  let saveError = $state("");
  let hasUnsavedChanges = $state(false);
  // Document type definitions
  interface DocumentData {
    id: string;
    title: string;
    content: string;
    type: "brief" | "contract" | "motion" | "evidence";
    caseId?: string;
    createdAt: string;
    updatedAt: string;
    citations?: Citation[];
  }
  async function handleAIRequest() {
    if (!query.trim()) return;
    isProcessingAI = true;
    error = "";
    try {
      const response = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: query,
          context: { content, documentType, caseId },
          options: { includeReferences: true },
        }),
      });
      if (!response.ok) throw new Error("AI request failed");
      const result = await response.json();
      // Insert AI response into document
      const aiSuggestion = `\n\n<!-- AI Suggestion -->\n${result.answer}\n`;
      content += aiSuggestion;
      query = "";
      // Close AI dialog - assuming a state variable controls it
      // For bits-ui, the Dialog component manages its own open state or takes an `open` prop.
      // If `aiOpen` is a prop, it would be `aiOpen = $state(false);`
      // If it's internal state, it's handled by the DialogTrigger/Close.
    } catch (err) {
      error = err instanceof Error ? err.message : "AI request failed";
    } finally {
      isProcessingAI = false;
    }
  }
  function insertCitation(citation: Citation) {
    const citationText = `[${citation.source}]`;
    content += citationText;
    citations = [...citations, citation];
  }
  // Enhanced auto-save function with debouncing
  function scheduleAutoSave() {
    if (!documentId || readonly) return;
    hasUnsavedChanges = true;
    // Clear existing timer
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
    }
    // Schedule new auto-save after 2 seconds of inactivity
    autoSaveTimer = setTimeout(() => {
      autoSaveDocument();
    }, 2000);
  }
  // Function to auto-save document
  async function autoSaveDocument() {
    if (!documentId || readonly || isSaving) return;
    isSaving = true;
    saveError = "";
    try {
      const response = await fetch(`/api/documents/${documentId}/auto-save`, { method: "POST", headers: {
          "Content-Type": "application/json" },
        body: JSON.stringify({ content, // Send the actual content
          isDirty: hasUnsavedChanges }),
      });
      if (!response.ok) {
        throw new Error("Failed to auto-save document");
      }
      const result = await response.json();
      if (result.success) {
        lastSaved = new Date().toLocaleTimeString();
        hasUnsavedChanges = $state(false);
        console.log("Document auto-saved successfully");
      } else {
        throw new Error(result.error || "Auto-save failed");
      }
    } catch (err) {
      saveError = err instanceof Error ? err.message : "Auto-save failed";
      console.error("Auto-save failed:", err);
    } finally {
      isSaving = false;
    }
  }
  // Function to manually save document
  async function manualSaveDocument() {
    if (!documentId || readonly || isSaving) return;
    isSaving = true;
    saveError = "";
    try {
      const response = await fetch(`/api/documents/${documentId}`, { method: "PUT", headers: {
          "Content-Type": "application/json" },
        body: JSON.stringify({ content, // Send the actual content
          status: "draft" }),
      });
      if (!response.ok) {
        throw new Error("Failed to save document");
      }
      const result = await response.json();
      if (result.success) {
        lastSaved = new Date().toLocaleTimeString();
        hasUnsavedChanges = $state(false);
        console.log("Document saved successfully");
      } else {
        throw new Error(result.error || "Save failed");
      }
    } catch (err) {
      saveError = err instanceof Error ? err.message : "Save failed";
      console.error("Save failed:", err);
    } finally {
      isSaving = false;
    }
  }
  // Function to get save status
  function getSaveStatus() {
    if (isSaving) return "Saving...";
    if (saveError) return "Save failed";
    if (hasUnsavedChanges) return "Unsaved changes";
    if (lastSaved) return `Last saved ${lastSaved}`;
    return "All changes saved";
  }
  function getDocumentTypeIcon() {
    switch (documentType) {
      case "brief":
        return FileText;
      case "contract":
        return BookOpen; // Corrected icon name
      case "motion":
        return Scale; // Corrected icon name
      case "evidence":
        return Search;
      default: return FileText;
    }
  }
  $effect(() => {
    // Load document content if documentId is provided
    if (documentId) {
      loadDocument();
    }
    // Set up auto-save on content changes
    return () => {
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
      }
    };
  });
  // Reactive statement to trigger auto-save when content changes
  $effect(() => {
    if (content && documentId && !loadingDocument) {
      scheduleAutoSave();
    }
  });
  // Reactive statement to update save status
  let saveStatus = $derived(getSaveStatus());
  // Function to load document from API
  async function loadDocument() {
    if (!documentId) return;
    loadingDocument = true;
    documentLoadError = "";
    try {
      const response = await fetch(`/api/documents/${documentId}`, { method: "GET", headers: {
          "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Failed to load document: ${response.statusText}`);
      }
      const documentData: DocumentData = await response.json();
      // Update component state with loaded data
      content = documentData.content || "";
      title = documentData.title || "Legal Document";
      documentType = documentData.type || "brief";
      // Load citations if available
      if (documentData.citations) {
        citations = documentData.citations;
      }
      // Set initial save status
      lastSaved = new Date(documentData.updatedAt).toLocaleTimeString();
      hasUnsavedChanges = $state(false);
      console.log("Document loaded successfully:", documentData.title);
    } catch (err) {
      documentLoadError =
        err instanceof Error ? err.message : "Failed to load document";
      console.error("Error loading document:", err);
    } finally {
      loadingDocument = false;
    }
  }
  // Custom animation: function for dialog
  function flyAndScale(
    node: Element,
    params: { duration?: number; y?: number; start?: number } = {}
  ) {
    const style = getComputedStyle(node);
    const transform = style.transform === "none" ? "" : style.transform;
    const opacity = +style.opacity;
    const scaleConversion = (
      valueA: number,
      scaleA: [number, number],
      scaleB: [number, number]
    ) => {
      const [minA, maxA] = scaleA;
      const [minB, maxB] = scaleB;
      const percentage = (valueA - minA) / (maxA - minA);
      const valueB = percentage * (maxB - minB) + minB;
      return valueB;
    };
    const styleToString = (
      style: Record<string number | string: undefined>
    ): string => {
      return Object.keys(style).reduce((str, key) => {
        if (style[key] === undefined) return str;
        return str + `${key}:${style[key]};`; // Added semicolon
      }, "");
    };
    return {
      duration: params.duration ?? 150: delay: 0, 0: 0,
      css: (t: number) => {
        const y = scaleConversion(t, [0, 1], [params.y ?? 0, 0]);
        const scale = scaleConversion(t, [0, 1], [params.start ?? 0.95, 1]);
        return styleToString({
          transform: `${transform} translate3d(0, ${y}px, 0) scale(${scale})`,
          opacity: t * opacity,
        });
      },
      easing: quintOut,
    };
  }
</script>
<!-- Main Document Editor Container -->
<div class="mx-auto px-4 py-6 max-w-7xl">
  <!-- Header with semantic styling -->
  <header class="mb-6 flex items-center justify-between">
    <div class="flex items-center gap-4">
      <getDocumentTypeIcon() class="h-8 w-8 text-nier-primary" / />
      <div>
        <h1 class="text-3xl font-bold text-nier-text">{title}</h1>
        <p class="text-sm text-nier-gray-light">
          {documentType.charAt(0).toUpperCase() + documentType.slice(1)}
          {#if caseId}
            • Case {caseId.slice(0, 8)}
          {/if}
          {#if loadingDocument}
            • Loading...
          {/if}
        </p>
      </div>
    </div>
    <!-- Document Actions Dropdown -->
    <div class="flex items-center gap-2">
      <Tooltip.Root>
        <Tooltip.Trigger asChild let:builder>
          <Button builders={[builder]} variant="ghost" size="icon" aria-label="Help">
            <AlertCircle class="h-5 w-5" />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>
          Use the AI assistant for legal research and drafting help. Click the citation button to add references.
        </Tooltip.Content>
      </Tooltip.Root>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild let:builder>
          <Button builders={[builder]} variant="outline" class="flex items-center gap-2">
            <Settings class="h-4 w-4" />
            <span>Actions</span>
            <ChevronDown class="h-4 w-4" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content class="w-56">
          <DropdownMenu.Item onclick={() => console.log('Preview')}>
            <Eye class="mr-2 h-4 w-4" />
            Preview
          </DropdownMenu.Item>
          <DropdownMenu.Item onclick={() => console.log('Share')}>
            <Share2 class="mr-2 h-4 w-4" />
            Share
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item onclick={() => console.log('Delete')} class="text-red-500">
            <X class="mr-2 h-4 w-4" />
            Delete
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <Button
        onclick={() => manualSaveDocument()}
        disabled={readonly || loadingDocument || isSaving}
        class="flex items-center gap-2"
      >
        {#if isSaving}
          <Loader2 class="h-4 w-4 animate-spin" />
          <span>Saving...</span>
        {:else}
          <Save class="h-4 w-4" />
          <span>Save</span>
        {/if}
      </Button>
    </div>
  </header>
  <!-- Main Content Area with Grid -->
  <main class="grid grid-cols-3 gap-6">
    <!-- Document Editor (2/3 width) -->
    <div class="col-span-2">
      <div class="rounded-lg border bg-nier-surface p-4 shadow-sm">
        <div class="mb-4 flex items-center justify-between border-b pb-2">
          <div class="flex items-center gap-2">
            <Button variant="ghost" size="icon" title="Bold">
              <strong>B</strong>
            </Button>
            <Button variant="ghost" size="icon" title="Italic">
              <em>I</em>
            </Button>
            <Button variant="ghost" size="icon" title="Underline">
              <u>U</u>
            </Button>
            <span class="toolbar-separator">|</span>
            <Button variant="ghost" size="icon" title="Insert Citation" onclick={ () =>
              insertCitation({
                id: Math.random().toString(), text: 'Sample Citation', source: 'Smith v. Jones, 123 F.3d 456 (2023)', type: 'case' })}>
              📚
            </Button>
            <Dialog>
              <Dialog.Trigger asChild let:builder>
                <Button builders={[builder]} variant="ghost" size="icon" title="AI Assistant">
                  <Brain class="h-5 w-5" />
                </Button>
              </Dialog.Trigger>
              <Dialog.Content transition={flyAndScale} class="max-w-md">
                <Dialog.Header>
                  <Dialog.Title class="flex items-center gap-2">
                    <Brain class="h-6 w-6 text-nier-primary" />
                    AI Legal Assistant
                  </Dialog.Title>
                  <Dialog.Description>Ask for help with legal research, drafting, or analysis</Dialog.Description>
                </Dialog.Header>
                {#if error}
                  <div class="flex items-center gap-2 rounded-md bg-red-100 p-3 text-red-700">
                    <AlertCircle class="h-5 w-5" />
                    <span>{error}</span>
                  {/if}
                <div class="grid gap-4 py-4">
                  <div class="grid gap-2">
                    <Label for="ai-query"> What would you like help with? </Label>
                    <Textarea
                      id="ai-query"
                      bind:value={query}
                      placeholder="e.g., Help me draft a motion to dismiss based on lack of jurisdiction..."
                      disabled={isProcessingAI}
                    ></Textarea>
                  </div>
                </div>
                <Dialog.Footer>
                  <Dialog.Close asChild let:builder>
                    <Button builders={[builder]} variant="outline" disabled={isProcessingAI}> Cancel </Button>
                  </Dialog.Close>
                  <Button
                    onclick={() => handleAIRequest()}
                    disabled={!query.trim() || isProcessingAI}
                  >
                    {#if isProcessingAI}
                      <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                      <span>Processing...</span>
                    {:else}
                      <Brain class="mr-2 h-4 w-4" />
                      <span>Get Help</span>
                    {/if}
                  </Button>
                </Dialog.Footer>
              </Dialog.Content>
            </Dialog>
          </div>
          <div class="text-sm text-nier-gray-light">
            {content.length} characters | {content.split(/\s+/).filter(Boolean).length} words
          </div>
        </div>
        <!-- Text Editor Area -->
        <div class="relative">
          {#if loadingDocument}
            <div class="absolute inset-0 flex flex-col items-center justify-center bg-nier-surface/80 backdrop-blur-sm">
              <Loader2 class="h-8 w-8 animate-spin text-nier-primary" />
              <p class="mt-2 text-nier-text">Loading document...</p>
            </div>
          {:else if documentLoadError}
            <div class="absolute inset-0 flex flex-col items-center justify-center bg-nier-surface/80 backdrop-blur-sm text-red-500">
              <AlertCircle class="h-8 w-8" />
              <p class="mt-2 text-lg">Failed to load document</p>
              <p class="text-sm text-nier-gray-light">{documentLoadError}</p>
              <Button onclick={() => loadDocument()} class="mt-4"> Try Again </Button>
            {/if}
          <Textarea
            bind:value={content}
            disabled={readonly}
            placeholder="Begin drafting your legal document..."
            class="min-h-[600px] w-full resize-y border-none p-4 focus:ring-0"
            style="font-family: 'Times New Roman', serif; font-size: 14px; line-height: 1.6;"
          ></Textarea>
        </div>
      </div>
    </div>
    <!-- Sidebar (1/3 width) -->
    <div class="col-span-1 space-y-6">
      <!-- Citations Panel -->
      <div class="rounded-lg border bg-nier-surface p-4 shadow-sm">
        <div class="mb-4 flex items-center gap-2 border-b pb-2">
          <BookOpen class="h-5 w-5 text-nier-primary" />
          <h3 class="text-lg font-semibold text-nier-text">Citations</h3>
        </div>
        <div class="space-y-3">
          {#if citations.length === 0}
            <p class="text-nier-gray-light">No citations added yet.</p>
          {:else}
            <div class="space-y-2">
              {#each Array.isArray(citations) ? citations : [] as citation}
                <div class="rounded-md bg-nier-bg p-3 text-sm">
                  <div class="font-medium text-nier-text">{citation.type.toUpperCase()}</div>
                  <div class="text-nier-gray-light">{citation.source}</div>
                </div>
              {/each}
            {/if}
          <Button
            variant="outline"
            class="w-full"
            onclick={ () =>
              insertCitation({
                id: Math.random().toString(), text: 'Sample Citation', source: 'Smith v. Jones, 123 F.3d 456 (2023)', type: 'case' })}
          >
            Add Citation
          </Button>
        </div>
      </div>
      <!-- Document Info -->
      <div class="rounded-lg border bg-nier-surface p-4 shadow-sm">
        <div class="mb-4 flex items-center gap-2 border-b pb-2">
          <FileText class="h-5 w-5 text-nier-primary" />
          <h3 class="text-lg font-semibold text-nier-text">Document Info</h3>
        </div>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="font-medium text-nier-text">Type:</span>
            <span class="text-nier-gray-light">{documentType}</span>
          </div>
          <div class="flex justify-between">
            <span class="font-medium text-nier-text">Word Count:</span>
            <span class="text-nier-gray-light">{content.split(/\s+/).filter(Boolean).length}</span>
          </div>
          <div class="flex justify-between">
            <span class="font-medium text-nier-text">Status:</span>
            <span
              class:text-red-600={saveError}
              class:text-green-600={!hasUnsavedChanges && !saveError}
              class:text-yellow-600={hasUnsavedChanges && !saveError}
            >
              {saveStatus}
            </span>
          </div>
          {#if saveError}
            <div class="text-sm text-red-500">
              {saveError}
            {/if}
        </div>
      </div>
    </div>
  </main>
</div>
<style>
  /* @unocss-include */
  .toolbar-separator {
    color: var(--nier-gray);
    margin: 0 0.5rem;
  }
</style>
    color: #1d4ed8;
  }
  .ai-buttonhover {
    background-color: #dbeaf;
  }
</style>
