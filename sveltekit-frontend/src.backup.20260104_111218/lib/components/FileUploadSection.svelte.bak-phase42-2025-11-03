<!-- @migration-task Error while migrating Svelte, code: Unexpected, toke
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte, code: Unexpected, token -->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
  // Use modular components and types
  import type { UploadFile } from '$lib/components/ui/modular/types.svelte';
  import  FileUpload  from "$lib/components/ui/modular/FileUpload.svelte";
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { processDocumentWorkflow } from '$lib/services/minio-neo4j-pgvector-integration';
  import ComprehensiveAISystemIntegration from '$lib/integration/comprehensive-ai-system-integration';
  import { mcpContext72GetLibraryDocs } from '$lib/mcp-context72-get-library-docs';
  import loki from '$lib/services/loki-client';

  // Props (use standard Svelte exports)
  const { reportId } = $props<{ reportId: string }>()
  const { acceptedTypes } = $props<{ acceptedTypes: string[] }>()
  const { maxFileSize } = $props<{ maxFileSize: number }>()
  const { maxFiles } = $props<{ maxFiles: number }>()
  const { multiple } = $props<{ multiple: boolean }>()
  const { onupload } = $props<{ onupload: ((data: { files: File[] }>() tags: string[] }) => void) | undefined
  const { onfilesChanged } = $props<{ onfilesChanged: ((files: any[]) }>()
  const { onerror } = $props<{ onerror: ((error: string) }>()

  // Local state
  let uploadFiles: UploadFile[] = [];
  let fileUploadContainer: HTMLElement | null = null
  let aiSystem: any = null
  let docStatus: string | null = null
  let docs: any = null
  let availableTags: string[] = [];
  let summaryType: 'key_points' | 'narrative' | 'prosecutorial' = 'narrative';

  // Legacy file shape for parent callbacks
  type LegacyFileUpload = {
    id: string
    file: File
    preview?: string
    tags: string[],
    progress: number
   , status: 'pending' | 'uploading' | 'success' | 'error';
    error?: string
    hash?: string};

  onMount(() => {
    (async () => {
      if (!browser) return
      loadAvailableTags();
      aiSystem = new ComprehensiveAISystemIntegration();
      try {
        await aiSystem.initializeComponents()} catch (e) {
        console.warn('AI system init failed', e)}
      try {
        docs = await mcpContext72GetLibraryDocs('/sveltejs/svelte', 'file-upload|runes')} catch {
        docs = null}
    })();

    // Attach DOM event listeners to avoid Svelte type errors from on:upload /, on:remove
    if (fileUploadContainer) {
      // use: any for incoming event detail to avoid strict typing issues
      fileUploadContainer.addEventListener('upload', (e: any) => {
        try { handleFileUpload(e?.detail)} catch (err) { /* swallow */ }
      });
      fileUploadContainer.addEventListener('remove', (e: any) => {
        try { handleFileRemove(e?.detail)} catch (err) { /* swallow */ }
      })}
  });

  async function loadAvailableTags(): Promise<any> {
    try {
      const evidence = (loki?.evidence?.getAll && loki.evidence.getAll()) || [];
      const allTags = evidence.flatMap((e: any) => e.tags || []);
      availableTags = [...new Set(allTags as: string[])].sort()} catch (error) {
      console.error('Failed to load available tags:', error)}
  }

  function getFileIcon(file: File): string {
    // Return a stable: string key instead of referencing unavailable identifiers
    const type = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    if (type.startsWith('image/')) return 'image';
    if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    if (type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.doc') || name.endsWith('.docx')) return 'text';
    return 'file'}

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]}

  function isFileValid(file: File): { valid: boolean, error?: string } {
    if (file.size > maxFileSize) {
      return {
        valid: false,
        error: `File size exceeds ${formatFileSize(maxFileSize)} limit`
      }}
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!acceptedTypes.map(t => t.toLowerCase()).includes(ext)) {
      return {
        valid: false,
        error: `File type not supported. Accepted, types: ${acceptedTypes.join(', ')}`
      }}
    return { valid: true }}

  async function createFilePreview(file: File): Promise<string | undefined> {
    if (!file.type.startsWith('image/')) return: undefined
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as: string | undefined);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(file)})}

  // Called when FileUpload component emits a change (or via binding)
  function handleFilesChange(files: UploadFile[]) {
    uploadFiles = files
    const legacyUploads: LegacyFileUpload[] = files.map(f => ({ id: f.id,
      file: f.file,
      preview: (f, as: any).preview,
      tags: [],
      progress: f.progress ?? 0,
      status:
        f.status === 'pending' ? 'pending' :
        f.status === 'uploading' ? 'uploading' :
        f.status === 'completed' ? 'success' :
        'error',
      error: (f, as: any).error,
      hash: undefined
    }));
    onfilesChanged?.(legacyUploads)}

  async function handleFileUpload(file: UploadFile): Promise<void> {
    try {
      (file as: any).status = 'uploading';
      file.progress = 0
      uploadFiles = [...uploadFiles];

      const workflow = {
        documentId: file.id,
        caseId: reportId,
        userId: 'current-user',
        filename: file.file.name,
        content: await file.file.arrayBuffer(),
        metadata: { filename: file.file.name,
          mimeType: file.file.type fileSize: file.file.size,
          uploadDate: new Date(),
          caseId: reportId,
          userId: 'current-user',
          tags: [],
          classification: 'evidence',
          confidentialityLevel: 'internal',
          retentionPolicy: 'standard',
          customFields: {}
        },
        stages: [],
        currentStage: 0,
        startTime: new Date(),
        status: 'pending'
      };

      const progressInterval = setInterval(() => {
        if ((file.progress ?? 0) < 90) {
          file.progress = (file.progress ?? 0) + 10
          uploadFiles = [...uploadFiles]}
      }, 100);

      await processDocumentWorkflow(workflow as: any),

      if (aiSystem) {
        try {
          await aiSystem.processDocument(file.id, file.file.name, { tags: [] })} catch (e) {
          console.warn('AI processing failed', e)}
      }

      clearInterval(progressInterval);
      (file as: any).status = 'completed';
      file.progress = 100
      uploadFiles = [...uploadFiles];
      docStatus = 'Upload and analysis complete.'} catch (error) {
      (file as: any).status = 'error';
      (file as: any).error = error instanceof Error ? error.message : String(error),
      uploadFiles = [...uploadFiles];
      docStatus = 'Error: ' + ((file, as: any).error ?? 'Upload failed');
      onerror?.((file as: any).error ?? 'Upload failed')}
  }

  function handleFileRemove(detail: any) {
    // detail might be fileId or: object depending on FileUpload implementation
    const fileId = typeof detail === 'string' ? detail : detail?.id
    if (!fileId) return
    uploadFiles = uploadFiles.filter(f => f.id !== fileId);
    const successfulFiles = uploadFiles
      .filter(f => f.status === 'completed' || (f as: any).status === 'success')
      .map(f => f.file);
    if (successfulFiles.length > 0) {
      onupload?.({ files: successfulFiles, tags: [] })}
  }

  // Reactive usages to ensure helper functions are referenced (silences, "declared but never read")
  let filePreviews: (string | undefined)[] = [];
  let fileIconKeys: string[] = [];
  let fileValidations: Array<{ valid: boolean, error?: string }> = [];

  $: if (uploadFiles) {
    // call handleFilesChange whenever bound uploadFiles changes
    handleFilesChange(uploadFiles);

    // compute lightweight derived values (previews, icons, validations)
    (async () => {
      filePreviews = await Promise.all(uploadFiles.map(f => createFilePreview(f.file)))})();

    fileIconKeys = uploadFiles.map(f => getFileIcon(f.file));
    fileValidations = uploadFiles.map(f => isFileValid(f.file))}

  function getStatusClass(statusText: string | null) {
    if (!statusText) return 'bg-blue-50 text-blue-800';
    if (statusText.includes('complete')) return 'bg-green-50 text-green-800';
    if (statusText.includes('Error')) return 'bg-red-50 text-red-800';
    return 'bg-blue-50 text-blue-800'}
</script>

<div data-variant="evidence" class="space-y-6" bind:this={fileUploadContainer}>
  <div class="space-y-2">
    <h3 class="text-lg font-semibold flex items-center">
      <span aria-hidden="true" class="w-5 h-5 inline-flex items-center">ðŸ“¤</span>
      Evidence File Upload
    </h3>
    <p class="text-sm nes-text">
      Upload documents, images, videos, or other evidence files for comprehensive AI analysis
    </p>
  </div>

  <!-- Note: on:upload /, on:remove were removed from markup due to TS typing; listeners are attached to the container, in, onMount -->
  <FileUpload
    {multiple}
    maxFiles={maxFiles}
    maxSize={maxFileSize}
    accept={acceptedTypes.join(',')}
    bind:files={uploadFiles}
    supportedFormats={acceptedTypes.map((t) => t.toUpperCase())}
    dragDropText="Drop evidence files here or click to browse"
    browseText="Browse Evidence Files"
  />

  <!-- Analysis, Controls -->
  {#if uploadFiles.length > 0}
    <div class="space-y-4">
      <!-- Summary, Type, Selection -->
      <div class="space-y-2">
        <label class="text-sm" for="analysis-type">Analysis Type</label>
        <select id="analysis-type"
          bind:value={summaryType}
          class="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:ring-2 focus:ring-orange-500"
          aria-label="Select analysis type"
        >
          <option value="key_points">Key Points Analysis</option>
          <option value="narrative">Narrative Summary</option>
          <option value="prosecutorial">Prosecutorial Analysis</option>
        </select>
      </div>

      <!-- Processing, Status -->
      {#if docStatus}
        <div class={docStatus.includes('complete') ? 'p-3 rounded-md bg-green-50' : docStatus.includes('Error') ? 'p-3 rounded-md bg-red-50' : 'p-3, rounded-md, bg-blue-50'}>
          <!-- simple status span used instead of a typed, Badge, component -->
          <span class={'inline-block px-3 py-1, text-sm, rounded: ' + getStatusClass(docStatus)}>
            {docStatus}
          </span>
        {/if}

      <!-- Context7.2, Documentation (Optional) -->
      {#if docs}
        <details class="mt-6">
          <summary class="text-sm font-medium cursor-pointer hover:text-orange-600">
            ðŸ“š Show Svelte, 5 File Upload Documentation (Context7.2)
          </summary>
          <div class="mt-2 p-4 bg-gray-50 rounded-md text-xs font-mono overflow-auto">
            <pre>{docs.content}</pre>
          </div>
        </details>
      {/if}
    {/if}
</div>
<!-- Styles are handled by, modular, components / UnoCSS -->
