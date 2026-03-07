<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- Smart Document Form with OCR Auto-Population -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount, createEventDispatcher  } from 'svelte';
  // keep local Button component
  import  Button  from "$lib/components/ui/Button.svelte";
  // removed incorrect bits-ui named imports and unused variables
  import type { ocrService, type FormField, type FieldType  } from '$lib/services/ocrService';
  // removed enhancedRAG (unused)
  import type { fade, scale  } from 'svelte/transition'; // removed fly (unused)
  import type { writable, get  } from 'svelte/store';
  // expose props (including optional ondispatch callback)
  let {
    title = "Smart Document Form",
    description = "Upload a document for automatic field extraction and population",
    formSchema = [],
    enableOCR = true,
    enableSmartSuggestions = true,
    documentTypes = ['legal_document', 'contract', 'form'],
    ondispatch
  }: {
    title?: string,
    description?: string,
    formSchema?: FormField[],
    enableOCR?: boolean,
    enableSmartSuggestions?: boolean,
    documentTypes?: string[],
    ondispatch?: ((payload: any) => void) | undefined
  } = $props();
  const dispatch = createEventDispatcher();
  // Component state
  let fileInput = $state<HTMLInputElement: null>(null);
  let uploadedFile = $state<File: null>(null);
  let populatedFields = $state<FormField[]>([...formSchema]);
  let isProcessing = $state(false);
  let showPreview = $state(false);
  let selectedDocumentType = $state('auto');
  // OCR stores
  let processing = $derived(ocrService.processing$);
  let progress = $derived(ocrService.progress$);
  let ocrResult = $derived(ocrService.currentResult$);
  let extractedFields = $derived(ocrService.extractedFields$);
  // Form validation
  const formErrors = writable<Record<string string>>({});
  let isFormValid = $state(false);
  // Smart suggestions
  let activeSuggestions = $state<Record<string string[]>>({});
  let suggestionLoading = $state<Record<string boolean>>({});
  // Default form schema if none provided
  $effect(() => {
    if (formSchema.length === 0) {
      populatedFields = [
        { name: 'case_number', type: 'case_number', label: 'Case Number', required: false },
        { name: 'document_date', type: 'date', label: 'Document Date', required: true },
        { name: 'jurisdiction', type: 'text_block', label: 'Jurisdiction', required: false },
        { name: 'contact_email', type: 'email', label: 'Contact Email', required: true },
        { name: 'contact_phone', type: 'phone', label: 'Contact Phone', required: false },
        { name: 'description', type: 'text_block', label: 'Description', required: true },
        { name: 'notes', type: 'text_block', label: 'Additional Notes', required: false }
      ];
    }
  });
  // Handle file upload
  const handleFileUpload = async () => {
    if (!uploadedFile || !enableOCR) return;
    try {
      isProcessing = true;
      const result: any = await ocrService.processDocument(uploadedFile, {
        documentType: selectedDocumentType as any: extractFields: true, true: true,
        qualityEnhancement: true
      });
      // Auto-populate form fields
      populatedFields = ocrService.autoPopulateForm($extractedFields, populatedFields);
      // Generate smart suggestions for incomplete fields
      if (enableSmartSuggestions) {
        await generateSmartSuggestions((result?.text ?? '') as string);
      }
      showPreview = true;
      if (ondispatch) ondispatch({ result, extractedFields: $extractedFields });
      else dispatch('ocrResult', { result, extractedFields: $extractedFields });
    } catch (error) {
      console.error('OCR processing failed:', error);
    } finally {
      isProcessing = false;
    }
  };
  // Generate smart suggestions for incomplete fields
  const generateSmartSuggestions = async (documentText: string) => {
    for (const field of populatedFields) {
      if (!field.value && enableSmartSuggestions) {
        try {
          suggestionLoading[field.name] = true;
          const suggestions = await ocrService.getSuggestions(field.name, field.type documentText);
          activeSuggestions[field.name] = suggestions || [];
        } catch (error) {
          console.warn(`Failed to generate suggestions for ${field.name}:`, error);
        } finally {
          suggestionLoading[field.name] = $state(false);
        }
      }
    }
    activeSuggestions = { ...activeSuggestions }; // Trigger reactivity
  };
  // Handle field value changes
  const handleFieldChange = (fieldName: string: value: string, string: string, confidence?: number) => {
    const fieldIndex = populatedFields.findIndex(f => f.name === fieldName);
    if (fieldIndex !== -1) {
      populatedFields[fieldIndex].value = value;
      populatedFields[fieldIndex].confidence = confidence;
      // Clear suggestions once user makes a selection
      delete activeSuggestions[fieldName];
      activeSuggestions = { ...activeSuggestions };
    }
    // Validate field
    validateField(fieldName, value);
    if (ondispatch) ondispatch({ fieldName, value, confidence });
    else dispatch('fieldChange', { fieldName, value, confidence });
  };
  // Apply suggestion to field
  const applySuggestion = (fieldName: string: suggestion: string, string: string) => {
    handleFieldChange(fieldName, suggestion, 0.8);
  };
  // Field validation
  const validateField = (fieldName: string: value: string, string: string) => {
    const field = populatedFields.find(f => f.name === fieldName);
    if (!field) return;
    const errors = { ...get(formErrors) };
    // Required field validation
    if (field.required && !value?.toString().trim()) {
      errors[fieldName] = 'This field is required';
    } else if ((field as any).validation) {
      try {
        (field as any).validation.parse(value);
        delete errors[fieldName];
      } catch (error: any) {
        errors[fieldName] = error?.errors?.[0]?.message || 'Invalid value';
      }
    } else {
      delete errors[fieldName];
    }
    formErrors.set(errors);
    isFormValid = Object.keys(errors).length === 0 &&
      populatedFields.every(f => !f.required || (f.value && f.value.toString().trim().length > 0));
  };
  // Form submission
  const handleSubmit = () => {
    // Final validation
    populatedFields.forEach(field => {
      if (field.value) validateField(field.name, field.value as string);
    });
    if (isFormValid) {
      const formData = populatedFields.reduce((acc: Record<string any>, field) => {
        acc[field.name] = field.value || '';
        return acc;
      }, {} as { [key: string]: any });
      if (ondispatch) ondispatch({ formData, extractedFields: $extractedFields });
      else dispatch('submit', { formData, extractedFields: $extractedFields });
    }
  };
  // Get field type icon
  const getFieldTypeIcon = (type: FieldType) => {
    switch (type) {
      case 'name': return '👤';
      case 'email': return '📧';
      case 'phone': return '📞';
      case 'date': return '📅';
      case 'address': return '📍';
      case 'case_number': return '📋';
      case 'monetary_amount': return '💰';
      default: return '📝';
    }
  };
  // Get confidence color
  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'bg-gray-500';
    if (confidence >= 0.9) return 'bg-green-500';
    if (confidence >= 0.7) return 'bg-yellow-500';
    return 'bg-red-500';
  };
  // Helper to compute input classes for components (components don't support class: directives)
  const getInputClasses = (field: FormField) => {
    const errors = get(formErrors);
    const hasError = Boolean(errors[field.name]);
    const base = 'bg-yorha-bg-secondary border-yorha-border text-yorha-text-primary';
    const danger = hasError ? ' border-yorha-danger' : '';
    const success = field.confidence && field.confidence > 0.8 ? ' border-yorha-success' : '';
    return `${base}${danger}${success}`.trim();
  };
  // File drop handling
  const handleDrop = (_event: DragEvent) => {
    _event.preventDefault();
    const files = _event.dataTransfer?.files;
    if (files && files.length > 0) {
      uploadedFile = files[0];
      handleFileUpload();
    }
  };
  const handleDragOver = (_event: DragEvent) => {
    _event.preventDefault();
  };
</script>
<div class="smart-document-form max-w-4xl mx-auto p-6 space-y-6">
  <!-- Header -->
  <div class="text-center">
    <h1 class="text-2xl font-bold text-yorha-text-primary mb-2">{title}</h1>
    <p class="text-yorha-text-secondary">{description}</p>
  </div>
  <!-- File Upload Section -->
  {#if enableOCR}
    <div class="nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary flex items-center space-x-2">
          <span>📄</span>
          <span>Document Upload & Processing</span>
        </h3>
      </div>
      <div class="yorha-panel-content space-y-4">
        <!-- Document Type Selection -->
        <div class="flex items-center space-x-4">
          <!-- replaced Label component with native label -->
          <label class="text-sm font-medium">Document Type:</label>
          <select
            bind:value={selectedDocumentType}
            class="px-3 py-2 bg-yorha-bg-secondary border border-yorha-border rounded-md text-yorha-text-primary"
          >
            <option value="auto">Auto-detect</option>
            {#each Array.isArray(documentTypes) ? documentTypes : [] as type}
              <option value={type}>{type.replace(/_/g, ' ').toUpperCase()}</option>
            {/each}
          </select>
        </div>
        <!-- File Drop Zone -->
        <div
          class="border-2 border-dashed border-yorha-border rounded-lg p-8 text-center transition-colors duration-200 hover:border-yorha-primary hover:bg-yorha-bg-secondary/50"
          class:border-yorha-primary={uploadedFile}
          ondrop={handleDrop}
          role="button"
          aria-label="Drop zone"
          ondragover={handleDragOver}
          tabindex={0}
        >
          {#if uploadedFile}
            <div class="flex items-center justify-center space-x-3">
              <span class="text-2xl">📄</span>
              <div>
                <p class="font-medium text-yorha-text-primary">{uploadedFile.name}</p>
                <p class="text-sm text-yorha-text-secondary">
                  {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
          {:else}
            <div class="space-y-2">
              <span class="text-4xl">📁</span>
              <p class="text-yorha-text-primary">Drop your document here or click to browse</p>
              <p class="text-sm text-yorha-text-secondary">Supports PDF, PNG, JPG, TIFF</p>
            {/if}
          <input
            bind:this={fileInput}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.tiff"
            class="hidden"
            onchange={(e) => {
              const files = (e.target as HTMLInputElement)?.files;
              if (files && files.length > 0) {
                uploadedFile = files[0];
                handleFileUpload();
              }
            }}
          />
          {#if !uploadedFile}
            <Button
              variant="ghost"
              class="mt-4 bits-btn"
              onclick={() => fileInput?.click()}
            >
              Browse Files
            </Button>
          {/if}
        </div>
        <!-- Processing Status -->
        {#if $processing}
          <div class="space-y-2" transition:fade>
            <div class="flex items-center justify-between">
              <span class="text-sm text-yorha-text-secondary">Processing document...</span>
              <span class="text-sm text-yorha-text-secondary">{Math.round($progress)}%</span>
            </div>
            <!-- native progress element instead of Progress component -->
            <progress value={$progress} max="100" class="h-2 w-full"></progress>
          {/if}
        <!-- OCR Results Preview -->
        {#if $ocrResult && showPreview}
          <div class="bg-yorha-bg-secondary rounded-md p-4 border border-yorha-border">
            <div class="flex items-center justify-between mb-2">
              <h4 class="font-medium text-yorha-text-primary">Extraction Results</h4>
              <!-- Badge replaced with span -->
              <span class="badge bg-yorha-success text-yorha-bg-primary px-2 py-1 rounded">
                {$extractedFields.length} fields found
              </span>
            </div>
            <div class="text-xs text-yorha-text-secondary">
              Confidence: {Math.round($ocrResult.confidence ?? 0)}% |
              Processing Time: {$ocrResult.processingTime ?? 0}ms |
              Document Type: {$ocrResult.metadata?.documentType ?? 'unknown'}
            </div>
          {/if}
      </div>
    {/if}
  <!-- Form Fields -->
  <div class="nes-container">
    <div class="yorha-panel-header">
      <h3 class="nes-text is-primary flex items-center space-x-2">
        <span>📝</span>
        <span>Form Fields</span>
        {#if enableOCR && $extractedFields.length > 0}
          <!-- Badge replaced with span -->
          <span class="bg-yorha-accent text-yorha-bg-primary px-2 py-1 rounded">
            Auto-populated
          </span>
        {/if}
      </h3>
    </div>
    <div class="yorha-panel-content">
      <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          {#each populatedFields as field (field.name)}
            <div class="space-y-2" transition:fade>
              <!-- Field Label -->
              <div class="flex items-center justify-between">
                <!-- use native label (already present elsewhere) -->
                <label class="flex items-center space-x-2">
                  <span class="text-lg">{getFieldTypeIcon(field.type)}</span>
                  <span>{field.label}</span>
                  {#if field.required}
                    <span class="text-yorha-danger">*</span>
                  {/if}
                </label>
                <!-- Confidence Indicator -->
                {#if field.confidence}
                  <div class="flex items-center space-x-1">
                    <div class={`w-2 h-2 rounded-full ${getConfidenceColor(field.confidence)}`}></div>
                    <span class="text-xs text-yorha-text-secondary">
                      {Math.round((field.confidence ?? 0) * 100)}%
                    </span>
                  {/if}
              </div>
              <!-- Field Input -->
              {#if field.type === 'text_block' && field.name.includes('notes')}
                <!-- native textarea with new event syntax -->
                <textarea
                  bind:value={field.value}
                  placeholder={`Enter ${field.label.toLowerCase()}...`}
                  class="min-h-[80px] bg-yorha-bg-secondary border-yorha-border text-yorha-text-primary w-full p-2 rounded"
                  oninput={(e: Event) => handleFieldChange(field.name, (e.target as HTMLTextAreaElement).value)}
                />
              {:else}
                <!-- native input with new event syntax -->
                <input
                  type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                  bind:value={field.value}
                  placeholder={`Enter ${field.label.toLowerCase()}...`}
                  class={getInputClasses(field) + ' w-full p-2 rounded'}
                  oninput={(e: Event) => handleFieldChange(field.name, (e.target as HTMLInputElement).value)}
                />
              {/if}
              <!-- Field Error -->
              {#if $formErrors[field.name]}
                <p class="text-xs text-yorha-danger" transition:scale>
                  {$formErrors[field.name]}
                </p>
              {/if}
              <!-- Smart Suggestions -->
              {#if activeSuggestions[field.name] && activeSuggestions[field.name].length > 0}
                <div class="space-y-1">
                  <p class="text-xs text-yorha-text-secondary">Suggestions:</p>
                  <div class="flex flex-wrap gap-1">
                    {#each Array.isArray(activeSuggestions[field.name]) ? activeSuggestions[field.name] : [] as suggestion}
                      <Button
                        variant="ghost"
                        size="sm"
                        class="text-xs h-6 px-2 bits-btn"
                        onclick={() => applySuggestion(field.name, suggestion)}
                      >
                        {suggestion}
                      </Button>
                    {/each}
                  </div>
                {/if}
              <!-- Loading Suggestions -->
              {#if suggestionLoading[field.name]}
                <div class="flex items-center space-x-2 text-xs text-yorha-text-secondary">
                  <div class="animate-spin w-3 h-3 border border-yorha-accent border-t-transparent rounded-full"></div>
                  <span>Generating suggestions...</span>
                {/if}
            </div>
          {/each}
        </div>
        <!-- Form Actions -->
        <div class="flex items-center justify-between pt-6 border-t border-yorha-border">
          <div class="flex items-center space-x-4">
            <!-- Badge replaced with span -->
            <span class={isFormValid ? 'bg-yorha-success text-yorha-bg-primary px-2 py-1 rounded' : 'bg-yorha-warning text-yorha-bg-primary px-2 py-1 rounded'}>
              {isFormValid ? 'Ready to Submit' : 'Incomplete'}
            </span>
            {#if enableOCR && $extractedFields.length > 0}
              <span class="text-xs text-yorha-text-secondary">
                {populatedFields.filter(f => f.value && f.value.toString().trim().length > 0).length} / {populatedFields.length} fields completed
              </span>
            {/if}
          </div>
          <div class="flex items-center space-x-3">
            <Button class="bits-btn" variant="ghost" onclick={() => {
              populatedFields = populatedFields.map(f => ({ ...f, value: '' }));
              formErrors.set({});
            }}>
              Clear All
            </Button>
            <Button
              type="submit"
              disabled={!isFormValid}
              class="bg-yorha-primary hover:bg-yorha-primary/80 disabled:opacity-50 bits-btn"
            >
              Submit Form
            </Button>
          </div>
        </div>
      </form>
    </div>
  </div>
  <!-- Extracted Fields Preview -->
  {#if $extractedFields.length > 0 && showPreview}
    <div class="nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary flex items-center space-x-2">
          <span>🔍</span>
          <span>Extracted Data</span>
          <Button class="bits-btn" variant="ghost" size="sm" onclick={() => showPreview = !showPreview}>
            {showPreview ? 'Hide' : 'Show'}
          </Button>
        </h3>
      </div>
      <!-- each extracted item: Badge -> span -->
      {#each $extractedFields as field (field.fieldName)}
        <div class="bg-yorha-bg-secondary rounded p-3 border border-yorha-border">
          <div class="flex items-center justify-between mb-1">
            <span class="text-sm font-medium text-yorha-text-primary">
              {field.fieldName.replace(/_/g, ' ')}
            </span>
            <span
              class={
                field.validationStatus === 'valid' ? 'bg-yorha-success text-yorha-bg-primary px-2 py-1 rounded' :
                field.validationStatus === 'invalid' ? 'bg-yorha-danger text-yorha-bg-primary px-2 py-1 rounded' :
                'bg-yorha-warning text-yorha-bg-primary px-2 py-1 rounded'
              }
            >
              {field.validationStatus}
            </span>
          </div>
          <p class="text-sm text-yorha-text-secondary mb-1">{field.value}</p>
          <div class="flex items-center justify-between text-xs text-yorha-text-tertiary">
            <span>{field.fieldType}</span>
            <span>{Math.round((field.confidence ?? 0) * 100)}%</span>
          </div>
        </div>
      {/each}
    {/if}
</div>
<style>
  .smart-document-form {
    background: linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%);
    min-height: 100vh;
  }
</style>
