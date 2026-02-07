<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';

  // UI Components
  import * as Dialog from '$lib/components/ui/dialog';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';

  // Icons
  import AlertCircle from 'lucide-svelte/icons/alert-circle';
  import BookOpen from 'lucide-svelte/icons/book-open';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import FileText from 'lucide-svelte/icons/file-text';
  import Loader2 from 'lucide-svelte/icons/loader-2';
  import Save from 'lucide-svelte/icons/save';
  import Scale from 'lucide-svelte/icons/scale';
  import Search from 'lucide-svelte/icons/search';
  import Settings from 'lucide-svelte/icons/settings';
  import Share2 from 'lucide-svelte/icons/share-2';
  import X from 'lucide-svelte/icons/x';
  import Brain from 'lucide-svelte/icons/brain';
  import Eye from 'lucide-svelte/icons/eye';

  interface Props {
    caseId?: string;
    documentId?: string;
    documentType?: "brief" | "contract" | "motion" | "evidence";
    title?: string;
    readonly?: boolean;
  }

  let {
    caseId,
    documentId,
    documentType = "brief",
    title = "Legal Document",
    readonly = false
  }: Props = $props();

  // Component state
  let content = $state<string>("");
  let query = $state<string>("");
  let isLoading = $state<boolean>(false);
  let isProcessingAI = $state<boolean>(false);
  let error = $state<string>("");
  let loadingDocument = $state<boolean>(false);
  let documentLoadError = $state<string>("");

  interface Citation {
    id: string;
    text: string;
    source: string;
    type: string;
  }

  let citations = $state<Citation[]>([]);
  let aiDialogOpen = $state(false);

  // Auto-save state
  let autoSaveTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  let lastSaved = $state<string>("");
  let isSaving = $state<boolean>(false);
  let saveError = $state<string>("");
  let hasUnsavedChanges = $state<boolean>(false);

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
                options: { includeReferences: true }
            })
        });

        if (!response.ok) throw new Error("AI request failed");

        const result = await response.json();

        // Insert AI response into document
        const aiSuggestion = `\n\n<!-- AI Suggestion -->\n${result.answer}\n`;
        content += aiSuggestion;
        query = "";
        aiDialogOpen = false;
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

  function scheduleAutoSave() {
    if (!documentId || readonly) return;
    hasUnsavedChanges = true;

    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
    }

    autoSaveTimer = setTimeout(() => {
        autoSaveDocument();
    }, 2000);
  }

  async function autoSaveDocument() {
    if (!documentId || readonly || isSaving) return;
    isSaving = true;
    saveError = "";

    try {
        const response = await fetch(`/api/documents/${documentId}/auto-save`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, isDirty: hasUnsavedChanges })
        });

        if (!response.ok) throw new Error("Failed to auto-save document");

        const result = await response.json();
        if (result.success) {
            lastSaved = new Date().toLocaleTimeString();
            hasUnsavedChanges = false;
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

  async function manualSaveDocument() {
    if (!documentId || readonly || isSaving) return;
    isSaving = true;
    saveError = "";

    try {
        const response = await fetch(`/api/documents/${documentId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, status: "draft" })
        });

        if (!response.ok) throw new Error("Failed to save document");

        const result = await response.json();
        if (result.success) {
            lastSaved = new Date().toLocaleTimeString();
            hasUnsavedChanges = false;
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

  function getSaveStatus() {
    if (isSaving) return "Saving...";
    if (saveError) return "Save failed";
    if (hasUnsavedChanges) return "Unsaved changes";
    if (lastSaved) return `Last saved ${lastSaved}`;
    return "All changes saved";
  }

  function getDocumentTypeIcon() {
    switch (documentType) {
        case "brief": return FileText;
        case "contract": return BookOpen;
        case "motion": return Scale;
        case "evidence": return Search;
        default: return FileText;
    }
  }

  async function loadDocument() {
    if (!documentId) return;
    loadingDocument = true;
    documentLoadError = "";

    try {
        const response = await fetch(`/api/documents/${documentId}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" }
        });

        if (!response.ok) throw new Error(`Failed to load document: ${response.statusText}`);

        const documentData: DocumentData = await response.json();

        content = documentData.content || "";
        title = documentData.title || title;
        documentType = documentData.type || documentType;

        if (documentData.citations) {
            citations = documentData.citations;
        }

        lastSaved = new Date(documentData.updatedAt).toLocaleTimeString();
        hasUnsavedChanges = false;
        console.log("Document loaded successfully:", documentData.title);
    } catch (err) {
        documentLoadError = err instanceof Error ? err.message : "Failed to load document";
        console.error("Error loading document:", err);
    } finally {
        loadingDocument = false;
    }
  }

  $effect(() => {
    if (documentId) {
        loadDocument();
    }
    return () => {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
    };
  });

  $effect(() => {
    if (content && documentId && !loadingDocument) {
        scheduleAutoSave();
    }
  });

  let saveStatus = $derived(getSaveStatus());
</script>

<div class="mx-auto px-4 py-6">
    <!-- Header -->
    <header class="mb-6 flex items-center justify-between">
        <div class="flex items-center gap-4">
            <svelte:component this={getDocumentTypeIcon()} class="h-8 w-8 text-primary" />
            <div>
                <h1 class="text-3xl font-bold">{title}</h1>
                <p class="text-sm text-muted-foreground flex items-center gap-2">
                    <span class="capitalize">{documentType}</span>
                    {#if caseId} <span>• Case {caseId.slice(0, 8)}</span> {/if}
                    {#if loadingDocument} <span>• Loading...</span> {/if}
                </p>
            </div>
        </div>

        <div class="flex items-center gap-2">
            <Tooltip.Root>
                <Tooltip.Trigger asChild let:builder>
                    <Button variant="ghost" size="icon" builders={[builder]}>
                        <AlertCircle class="h-5 w-5" />
                    </Button>
                </Tooltip.Trigger>
                <Tooltip.Content>
                    Need help? Ask the AI assistant.
                </Tooltip.Content>
            </Tooltip.Root>

            <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild let:builder>
                    <Button variant="outline" builders={[builder]} class="gap-2">
                        <Settings class="h-4 w-4" /> Actions <ChevronDown class="h-4 w-4" />
                    </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content class="w-56">
                    <DropdownMenu.Item onclick={() => console.log('Preview')}>
                        <Eye class="mr-2 h-4 w-4" /> Preview
                    </DropdownMenu.Item>
                    <DropdownMenu.Item onclick={() => console.log('Share')}>
                        <Share2 class="mr-2 h-4 w-4" /> Share
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item onclick={() => console.log('Delete')} class="text-red-500">
                        <X class="mr-2 h-4 w-4" /> Delete
                    </DropdownMenu.Item>
                </DropdownMenu.Content>
            </DropdownMenu.Root>

            <Button onclick={manualSaveDocument} disabled={readonly || loadingDocument || isSaving} class="gap-2">
                {#if isSaving}
                    <Loader2 class="h-4 w-4 animate-spin" /> Saving...
                {:else}
                    <Save class="h-4 w-4" /> Save
                {/if}
            </Button>
        </div>
    </header>

    <main class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- Editor Area -->
        <div class="col-span-2">
            <div class="rounded-lg border bg-background p-4 shadow-sm">
                <!-- Toolbar -->
                <div class="mb-4 flex items-center justify-between border-b pb-2">
                    <div class="flex items-center gap-1">
                        <Button variant="ghost" size="icon" title="Bold"><strong>B</strong></Button>
                        <Button variant="ghost" size="icon" title="Italic"><em>I</em></Button>
                        <Button variant="ghost" size="icon" title="Underline"><u>U</u></Button>
                        <div class="w-px h-6 bg-border mx-2"></div>
                        <Button variant="ghost" size="icon" title="Insert Citation"
                                onclick={() => insertCitation({ id: crypto.randomUUID(), text: 'Sample Citation', source: 'Smith v. Jones, 123 F.3d 456', type: 'case' })}>
                            <BookOpen class="h-4 w-4" />
                        </Button>

                        <Dialog.Root bind:open={aiDialogOpen}>
                            <Dialog.Trigger asChild let:builder>
                                <Button variant="ghost" size="icon" builders={[builder]} title="AI Assistant">
                                    <Brain class="h-5 w-5 text-purple-600" />
                                </Button>
                            </Dialog.Trigger>
                            <Dialog.Content class="sm:max-w-[500px]">
                                <Dialog.Header>
                                    <Dialog.Title class="flex items-center gap-2">
                                        <Brain class="h-6 w-6 text-purple-600" /> AI Legal Assistant
                                    </Dialog.Title>
                                    <Dialog.Description>
                                        Ask for help drafting, researching, or refining your document.
                                    </Dialog.Description>
                                </Dialog.Header>

                                {#if error}
                                    <div class="bg-red-50 text-red-600 p-3 rounded text-sm flex gap-2 items-center">
                                        <AlertCircle class="h-4 w-4" /> {error}
                                    </div>
                                {/if}

                                <div class="grid gap-4 py-4">
                                    <div class="grid gap-2">
                                        <Label for="ai-query">Your Request</Label>
                                        <Textarea id="ai-query" bind:value={query} placeholder="Help me draft a motion..." disabled={isProcessingAI} />
                                    </div>
                                </div>

                                <Dialog.Footer>
                                    <Button variant="secondary" onclick={() => aiDialogOpen = false}>Cancel</Button>
                                    <Button onclick={handleAIRequest} disabled={!query.trim() || isProcessingAI} class="gap-2">
                                        {#if isProcessingAI}
                                            <Loader2 class="h-4 w-4 animate-spin" /> Processing...
                                        {:else}
                                            <Brain class="h-4 w-4" /> Get Help
                                        {/if}
                                    </Button>
                                </Dialog.Footer>
                            </Dialog.Content>
                        </Dialog.Root>
                    </div>
                    <div class="text-xs text-muted-foreground">
                        {content.length} chars | {content.split(/\s+/).filter(Boolean).length} words
                    </div>
                </div>

                <!-- Text Area -->
                <div class="relative min-h-[600px]">
                    {#if loadingDocument}
                        <div class="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-10">
                            <Loader2 class="h-8 w-8 animate-spin text-primary" />
                            <p class="mt-2 text-sm text-muted-foreground">Loading...</p>
                        </div>
                    {:else if documentLoadError}
                         <div class="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-10">
                            <AlertCircle class="h-8 w-8 text-red-500" />
                            <p class="mt-2 text-sm font-medium">Failed to load</p>
                            <Button variant="outline" size="sm" class="mt-2" onclick={loadDocument}>Retry</Button>
                        </div>
                    {/if}

                    <Textarea
                        bind:value={content}
                        disabled={readonly}
                        placeholder="Start typing your legal document here..."
                        class="w-full h-[600px] resize-none border-0 focus-visible:ring-0 p-4 font-serif text-lg leading-relaxed"
                    />
                </div>
            </div>
        </div>

        <!-- Sidebar -->
        <div class="col-span-1 space-y-6">
            <!-- Citations -->
            <div class="rounded-lg border bg-background p-4 shadow-sm">
                <div class="mb-4 flex items-center gap-2 border-b pb-2">
                    <BookOpen class="h-5 w-5 text-primary" />
                    <h3 class="font-semibold">Citations</h3>
                </div>

                <div class="space-y-3">
                    {#if citations.length === 0}
                        <p class="text-sm text-muted-foreground italic">No citations added yet.</p>
                    {:else}
                        {#each citations as citation}
                            <div class="rounded bg-muted p-3 text-sm">
                                <div class="font-medium flex justify-between">
                                    <span class="uppercase text-xs tracking-wider text-muted-foreground">{citation.type}</span>
                                </div>
                                <div class="mt-1">{citation.source}</div>
                            </div>
                        {/each}
                    {/if}

                    <Button variant="outline" class="w-full gap-2" onclick={() => insertCitation({ id: crypto.randomUUID(), text: 'New Citation', source: 'Source Needed', type: 'other' })}>
                        <BookOpen class="h-4 w-4" /> Add Citation
                    </Button>
                </div>
            </div>

            <!-- Info -->
            <div class="rounded-lg border bg-background p-4 shadow-sm">
                <div class="mb-4 flex items-center gap-2 border-b pb-2">
                    <FileText class="h-5 w-5 text-primary" />
                    <h3 class="font-semibold">Document Info</h3>
                </div>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span class="text-muted-foreground">Type</span>
                        <span class="font-medium capitalize">{documentType}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-muted-foreground">Word Count</span>
                        <span class="font-medium">{content.split(/\s+/).filter(Boolean).length}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-muted-foreground">Status</span>
                        <span class:text-red-600={saveError} class:text-green-600={!hasUnsavedChanges && !saveError} class:text-yellow-600={hasUnsavedChanges && !saveError} class="font-medium">
                            {saveStatus}
                        </span>
                    </div>
                    {#if saveError}
                        <p class="text-xs text-red-500 mt-1">{saveError}</p>
                    {/if}
                </div>
            </div>
        </div>
    </main>
</div>
