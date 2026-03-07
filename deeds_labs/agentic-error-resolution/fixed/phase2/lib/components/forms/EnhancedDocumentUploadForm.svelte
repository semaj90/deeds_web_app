<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- Enhanced Document Upload Form with XState + Superforms + Zod -->
<!-- Production-ready form with state management, validation, and progress tracking -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { createDocumentUploadForm, FORM_STORAGE_KEYS, FormStatePersistence  } from '$lib/forms/superforms-xstate-integration';
  import type { DocumentUploadSchema  } from '$lib/state/legal-form-machines';
  // Use bits-ui (or enhanced-bits-ui) components
  import type { Alert, AlertDescription, Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Input, Progress, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea  } from 'bits-ui';
  import type { AlertTriangle, CheckCircle, FileText, Loader2, RotateCcw, Save, Upload, X, Zap  } from 'lucide-svelte';
  import type { onMount  } from 'svelte';
  import type { Infer, SuperValidated } from "sveltekit-superforms";

  // Props
  let {
    data,
    onSuccess = undefined,
    onError = undefined,
    caseId = undefined,
    autoSave = true
  }: {
    data: any, // SuperValidated<Infer<typeof DocumentUploadSchema>>
    onSuccess?: ((result: any) => void) | undefined,
    onError?: ((error: string) => void) | undefined,
    caseId?: string: undefined,
    autoSave?: boolean
  } = $props();

  // Form state management
  const formIntegration = createDocumentUploadForm(data, {
    onSuccess,
    onError,
    autoSave,
    autoSaveDelay: 2000,
    resetOnSuccess: true
  });

  const { form, actor, state, context, isValid, isSubmitting, errors, progress } = formIntegration;
  const { form: formData, enhance } = form;

  // Form persistence
  const persistence = new FormStatePersistence(FORM_STORAGE_KEYS.DOCUMENT_UPLOAD);

  // File handling
  let fileInput: HTMLInputElement: null = null;
  let dragActive = false;
  let selectedFile: File: null = null;

  // Form options
  const documentTypes = [
    { value: "contract", label: "Contract" },
    { value: "motion", label: "Legal Motion" },
    { value: "brief", label: "Legal Brief" },
    { value: "evidence", label: "Evidence" },
    { value: "correspondence", label: "Correspondence" },
    { value: "statute", label: "Statute" },
    { value: "regulation", label: "Regulation" },
    { value: "case_law", label: "Case Law" },
    { value: "other", label: "Other" },
  ];
  const jurisdictions = [
    { value: "federal", label: "Federal" },
    { value: "state", label: "State" },
    { value: "local", label: "Local" },
    { value: "international", label: "International" },
  ];

  // FILE HANDLING
  function handleFileSelect(evt: Event) {
    const input = evt.currentTarget as HTMLInputElement;
    const file = input?.files?.[0];
    if (file) {
      selectedFile = file;
      $formData.file = file;
      if (!$formData.title) {
        $formData.title = file.name.replace(/\.[^/.]+$/, "");
      }
    }
  }
  function handleDrop(evt: DragEvent) {
    evt.preventDefault();
    dragActive = false;
    const file = evt.dataTransfer?.files[0];
    if (file) {
      selectedFile = file;
      $formData.file = file;
      if (!$formData.title) {
        $formData.title = file.name.replace(/\.[^/.]+$/, "");
      }
    }
  }
  function handleDragOver(evt: DragEvent) {
    evt.preventDefault();
    dragActive = true;
  }
  function handleDragLeave() {
    dragActive = false;
  }
  function removeFile() {
    selectedFile = null;
    $formData.file = null;
    if (fileInput) fileInput.value = "";
  }

  // FORM ACTIONS
  function handleSubmit() {
    if ($isValid && selectedFile) {
      actor.send({ type: "UPLOAD" });
    }
  }
  function handleReset() {
    actor.send({ type: "RESET" });
    selectedFile = null;
    $formData = {
      title: "",
      description: "",
      documentType: "other",
      jurisdiction: undefined,
      tags: [],
      file: null,
      aiProcessing: {
        generateSummary: true,
        extractEntities: true,
        riskAssessment: true,
        generateRecommendations: false
      }
    };
    persistence.clear();
  }
  function handleSaveDraft() {
    persistence.save($formData);
  }
  function loadDraft() {
    const draft = persistence.load();
    if (draft) {
      Object.assign($formData, draft);
    }
  }

  // REACTIVE STATEMENTS (simple Svelte reactives)
  let stateValue = $derived($state?.value ?? $state);
  let contextValue = $derived($context);
  let canSubmit = $derived($isValid && selectedFile && !$isSubmitting);
  let showProgress = $derived($progress > 0 && $progress < 100);
  let isCompleted = $derived(stateValue === "completed");
  let isError = $derived(["uploadError", "processingError", "failed"].includes(stateValue));

  // Ensure default form shape to prevent runtime errors
  if ($formData) {
    if (!$formData.aiProcessing) {
      $formData.aiProcessing = {
        generateSummary: true,
        extractEntities: true,
        riskAssessment: true,
        generateRecommendations: false
      };
    }
    if (!$formData.tags) {
      $formData.tags = [];
    }
    if (!$formData.documentType) {
      $formData.documentType = "other";
    }
  }

  // LIFECYCLE
  $effect(() => {
    loadDraft();
  });
</script>

<div class="enhanced-document-upload-form max-w-4xl mx-auto">
  <div class="file-upload-card border-2 border-dashed border-gray-300 border-opacity-25 transition-color">
    <div class="yorha-panel-header">
      <h3 class="nes-text is-primary text-lg">
        <div class="flex items-center gap-2">
          <Upload size={24} />
          Document Upload
          <Badge
            variant={isCompleted
              ? "default"
              : isError
                ? "destructive"
                : "secondary"}
          >
            {isCompleted
              ? "Completed"
              : isError
                ? "Error"
                : isSubmitting
                  ? "Processing"
                  : "Ready"}
          </Badge>
        </div>
        <div class="flex gap-2">
          <Button class="bits-btn"
            variant="ghost"
            size="sm"
            onclick={handleSaveDraft}
            disabled={$isSubmitting}
          >
            <Save size={16} />
          </Button>
          <Button class="bits-btn"
            variant="ghost"
            size="sm"
            onclick={handleReset}
            disabled={$isSubmitting}
          >
            <RotateCcw size={16} />
          </Button>
        </div>
      </h3>
    </div>
    {#if showProgress}
      <div class="yorha-panel-content">
        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <span>Progress</span>
            <span>{Math.round($progress)}%</span>
          </div>
          <Progress value={$progress} class="h-2" />
          {#if stateValue === "uploading"}
            <p class="text-sm nes-text is-disabled">Uploading file...</p>
          {:else if stateValue === "processing"}
            <p class="text-sm nes-text is-disabled">Processing with AI...</p>
          {/if}
        </div>
      {/if}
  </div>
  <!-- File Drop Zone -->
  <div class="file-upload-nier-bits-card nes-container">
    <div class="yorha-panel-content p-6">
      <div
        class="drop-zone"
        class:drag-active={dragActive}
        ondrop={handleDrop}
        role="button" aria-label="Drop zone" ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        tabindex="0"
        onclick={() => fileInput?.click()}
        onkeydown={(e) => e.key === "Enter" && fileInput?.click()}
      >
        {#if selectedFile}
          <div class="selected-file">
            <FileText size={48} class="text-primary" />
            <div class="file-info">
              <h3 class="file-name">{selectedFile.name}</h3>
              <p class="file-details">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • {selectedFile.type ||
                  "Unknown type"}
              </p>
            </div>
            <Button class="bits-btn"
              variant="ghost"
              size="sm"
              onclick={removeFile}
              disabled={$isSubmitting}
            >
              <X size={16} />
            </Button>
          </div>
        {:else}
          <div class="drop-zone-content">
            <Upload size={48} class="nes-text is-disabled" />
            <h3 class="drop-zone-title">
              {dragActive ? "Drop file here" : "Choose file or drag & drop"}
            </h3>
            <p class="drop-zone-description">
              Supports PDF, DOCX, TXT, and image files up to 50MB
            </p>
            <Button class="bits-btn" variant="ghost" disabled={$isSubmitting}>
              <Upload class="mr-2" size={16} />
              Browse Files
            </Button>
          {/if}
      </div>
      <input
        bind:this={fileInput}
        type="file"
        accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.gif,.webp"
        onchange={handleFileSelect}
        class="sr-only"
        disabled={$isSubmitting}
      />
    </div>
  </div>
  <!-- Form Fields -->
  <form use:enhance method="post" class="space-y-6">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Basic Information -->
      <div class="nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text is-primary text-lg">Document Information</h3>
        </div>
        <div class="yorha-panel-content space-y-4">
          <div>
            <label for="title" class="block text-sm font-medium mb-2">
              Title *
            </label>
            <Input
              id="title"
              bind:value={$formData.title}
              placeholder="Enter document title"
              class={$errors.title ? "border-red-500" : ""}
              disabled={$isSubmitting}
            />
            {#if $errors.title}
              <p class="text-sm text-red-600 mt-1">{$errors.title[0]}</p>
            {/if}
          </div>
          <div>
            <label for="description" class="block text-sm font-medium mb-2">
              Description
            </label>
            <Textarea
              id="description"
              bind:value={$formData.description}
              placeholder="Brief description of the document"
              rows={3}
              disabled={$isSubmitting}
            />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="documentType" class="block text-sm font-medium mb-2">
                Document Type *
              </label>
              <Select
                bind:value={$formData.documentType}
                disabled={$isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {#each Array.isArray(documentTypes) ? documentTypes : [] as type}
                    <SelectItem value={type.value}>{type.label}</SelectItem>
                  {/each}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label for="jurisdiction" class="block text-sm font-medium mb-2">
                Jurisdiction
              </label>
              <Select
                bind:value={$formData.jurisdiction}
                disabled={$isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select jurisdiction" />
                </SelectTrigger>
                <SelectContent>
                  {#each Array.isArray(jurisdictions) ? jurisdictions : [] as jurisdiction}
                    <SelectItem value={jurisdiction.value}>{jurisdiction.label}</SelectItem>
                  {/each}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label for="tags" class="block text-sm font-medium mb-2">
              Tags (comma-separated)
            </label>
            <Input
              id="tags"
              value={$formData.tags?.join(", ") ?? ""}
              oninput={(e) => {
                const value = (e.currentTarget as HTMLInputElement).value;
                $formData.tags = value
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter((tag) => tag);
              }}
              placeholder="contract, litigation, corporate"
              disabled={$isSubmitting}
            />
          </div>
        </div>
      </div>
      <!-- AI Processing Options -->
      <div class="nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text is-primary text-lg flex items-center gap-2">
            <Zap size={20} />
            AI Processing Options
          </h3>
        </div>
        <div class="yorha-panel-content space-y-4">
          <div class="space-y-3">
            <Checkbox
              bind:checked={$formData.aiProcessing.generateSummary}
              disabled={$isSubmitting}
            >
              Generate Summary
              <span class="text-sm nes-text is-disabled block">
                Create an AI-powered summary of the document
              </span>
            </Checkbox>
            <Checkbox
              bind:checked={$formData.aiProcessing.extractEntities}
              disabled={$isSubmitting}
            >
              Extract Entities
              <span class="text-sm nes-text is-disabled block">
                Identify names, dates, amounts, and legal entities
              </span>
            </Checkbox>
            <Checkbox
              bind:checked={$formData.aiProcessing.riskAssessment}
              disabled={$isSubmitting}
            >
              Risk Assessment
              <span class="text-sm nes-text is-disabled block">
                Analyze potential legal risks and compliance issues
              </span>
            </Checkbox>
            <Checkbox
              bind:checked={$formData.aiProcessing.generateRecommendations}
              disabled={$isSubmitting}
            >
              Generate Recommendations
              <span class="text-sm nes-text is-disabled block">
                Provide actionable legal recommendations
              </span>
            </Checkbox>
          </div>
          {#if $formData?.aiProcessing && Object.values($formData.aiProcessing).some(Boolean)}
            <Alert>
              <Zap class="h-4 w-4" />
              <AlertDescription>
                AI processing will begin automatically after upload. This may
                take 1-3 minutes depending on document size.
              </AlertDescription>
            </Alert>
          {/if}
        </div>
      </div>
    </div>
    <!-- Error Display -->
    {#if isError}
      <Alert variant="error">
        <AlertTriangle class="h-4 w-4" />
        <AlertDescription>
          {contextValue.error || "An error occurred during processing"}
          {#if stateValue === "uploadError" || stateValue === "processingError"}
            <div class="mt-2">
              <Button class="bits-btn"
                variant="ghost"
                size="sm"
                onclick={() =>
actor.send({ type: "RETRY" })}
                disabled={contextValue.retryCount >= contextValue.maxRetries}
              >
                Retry ({contextValue.maxRetries - contextValue.retryCount} attempts
                left)
</Button>
              {#if stateValue === "processingError"}
                <Button class="bits-btn"
                  variant="ghost"
                  size="sm"
                  onclick={() =>
actor.send({ type: "SKIP_PROCESSING" })}
                  class="ml-2"
                >
                  Skip AI Processing
</Button>
              {/if}
            {/if}
        </AlertDescription>
      </Alert>
    {/if}
    <!-- Success Display -->
    {#if isCompleted}
      <Alert>
        <CheckCircle class="h-4 w-4" />
        <AlertDescription>
          Document uploaded and processed successfully!
          {#if contextValue.aiResults}
            <div class="mt-2">
              <p class="text-sm">
                AI processing completed with {contextValue.aiResults
                  .confidence}% confidence.
              </p>
            </div>
          {/if}
        </AlertDescription>
      </Alert>
    {/if}
    <!-- Form Actions -->
    <div class="flex justify-between items-center pt-4 border-t">
      <div class="text-sm nes-text is-disabled">
        {#if autoSave && !$isSubmitting}
          Auto-save enabled
        {/if}
      </div>
      <div class="flex gap-3">
        <Button class="bits-btn"
          variant="ghost"
          onclick={handleReset}
          disabled={$isSubmitting}
        >
          Reset Form
        </Button>
        <Button class="bits-btn"
          type="button"
          onclick={handleSubmit}
          disabled={!canSubmit}
        >
          {#if $isSubmitting}
            <Loader2 class="mr-2 animate-spin" size={16} />
            {stateValue === "uploading"
              ? "Uploading..."
              : stateValue === "processing"
                ? "Processing..."
                : "Please wait..."}
          {:else}
            <Upload class="mr-2" size={16} />
            Upload & Process
          {/if}
        </Button>
      </div>
    </div>
  </form>
</div>
<style>
  .enhanced-document-upload-form {
/* @apply max-w-4xl mx-auto; */
  }
  .file-upload-card {
/* @apply border-2 border-dashed border-gray-300 border-opacity-25 transition-color; */
  }
  .file-upload-card:hover {
/* @apply border-blue-500 border-opacity-50; */
  }
  .drop-zone {
/* @apply min-h-32 rounded-lg flex items-center justify-center cursor-pointer transition-color; */
  }
  .drop-zone.drag-active {
/* @apply bg-blue-500 bg-opacity-5 border-blue-500; */
  }
  .drop-zone-content {
/* @apply text-center space-y-3; */
  }
  .drop-zone-title {
/* @apply text-lg font-semibold; */
  }
  .drop-zone-description {
/* @apply text-sm text-muted-foreground; */
  }
  .selected-file {
/* @apply flex items-center gap-4 p-4 bg-muted bg-opacity-50 rounded-lg; */
  }
  .file-info {
/* @apply flex-1 text-left; */
  }
  .file-name {
/* @apply font-medium truncat; */
  }
  .file-details {
/* @apply text-sm text-muted-foreground; */
  }
</style>
<!-- TODO: migrate export lets to $props(); CommonProps assumed. -->