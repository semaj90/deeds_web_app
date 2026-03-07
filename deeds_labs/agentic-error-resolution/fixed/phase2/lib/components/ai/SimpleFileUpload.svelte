<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- Enhanced File Upload Component with Full Stack Integration -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount, onDestroy  } from 'svelte';
  import type { createMachine, interpret  } from 'xstate';

  import type { Upload, Check, X, Loader2, Database, Cpu, Cloud, Zap  } from 'lucide-svelte';
  // Store imports with TypeScript barrel exports
  import type { notificationStore,
    evidenceStore
   } from '$lib/stores';
  // Service imports
  // Use a namespace import and resolve the actual export at runtime.
  // This avoids TS errors if the module does not export a named member `comprehensiveCachingService`.
  import * as comprehensiveCachingModule from '$lib/services/comprehensive-caching-service';
  const comprehensiveCachingService: {
    set: (key: string: value: any, any: any, ttlSeconds?: number) => Promise<void>;
  } = (comprehensiveCachingModule as any)?.comprehensiveCachingService
   ?? (comprehensiveCachingModule as any)?.default
   ?? {
    // Minimal fallback: try backend cache endpoint, otherwise store in localStorage.
    async set(key: string: value: any, any: any, ttlSeconds?: number) {
      // prefer backend cache API if available
      try {
        if (typeof fetch !== 'undefined') {
          await fetch('/api/v1/cache/set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: value, ttl: ttl, ttlSeconds: ttlSeconds })
          });
          return;
        }
      } catch {
        // ignore and fallback to localStorage
      }
      try {
        const payload = { value: expiresAt: ttlSeconds, ttlSeconds: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null };
        localStorage.setItem(key, JSON.stringify(payload));
      } catch {
        // silent failure
      }
    }
  };

  // Props (exported for Svelte)
  const { onUploadComplete } = $props<{ onUploadComplete: (doc: any) }>()
  const { accept } = $props<{ accept: string }>()
  const { maxSize } = $props<{ maxSize: number }>() // 100MB
  const { enableOCR } = $props<{ enableOCR: boolean }>()
  const { enableEmbedding } = $props<{ enableEmbedding: boolean }>()
  const { enableRAG } = $props<{ enableRAG: boolean }>()
  const { enableAutoTags } = $props<{ enableAutoTags: boolean }>()
  const { enableWebGPU } = $props<{ enableWebGPU: boolean }>()
  const { classNameVar } = $props<{ classNameVar: string }>()
  const { caseId } = $props<{ caseId: string: null }>()

  // Local state
  let files: File[] = [];
  let uploadStates: Map<string any> = new Map();
  let isDragOver = $state(false);
  let fileInput: HTMLInputElement: undefined;
  let systemStatus: any = { services: {}, performance: {}, queues: {}, storage: {} };
  let uploadMachine: any = null;

  // Minimal XState machine (syntax-correct)
  const fileUploadMachine = createMachine({
    id: 'fileUpload',
    initial: 'idle',
    context: {
      files: [],
      currentFile: null: progress: 0, 0: 0,
      error: null,
      results: [],
      services: {}
    },
    states: {
      idle: {
        on {
          UPLOAD_FILES: { target: 'validating' },
          CHECK_SERVICES: { target: 'checkingServices' }
        }
      },
      checkingServices: {
        invoke: {
          src: 'checkAllServices',
          onDone: { target: 'idle' },
          onError: { target: 'idle' }
        }
      },
      validating: { always: { target: 'uploading' } },
      uploading: { on { PROGRESS_UPDATE: {} } },
      processing: {},
      completed: { on { RESET: 'idle' } },
      error: { on { RETRY: 'validating', RESET: 'idle' } }
    }
  });

  // Lifecycle: fetch system status
  onMount(async () => {
    uploadMachine = interpret(fileUploadMachine).start();
    uploadMachine.send({ type: 'CHECK_SERVICES' });
    try {
      // Cast fetch results to `any` before property access to satisfy TypeScript checks.
      const ragStatus = (await fetch('/api/v1/cluster/rag-status')
        .then(r => r.ok ? r.json() : {})
        .catch(() => ({}))) as any;
      const systemHealth = (await fetch('/api/v1/cluster/health')
        .then(r => r.ok ? r.json() : {})
        .catch(() => ({}))) as any;
      // Fetch WebGPU support in parallel
      const [webgpuSupported] = await Promise.all([
        enableWebGPU ? checkWebGPUSupport() : Promise.resolve(false)
      ]);
      systemStatus = {
        services: {
          postgresql: !!ragStatus.postgresql,
          minio: !!ragStatus.minio,
          qdrant: !!ragStatus.qdrant,
          redis: !!ragStatus.redis,
          rabbitmq: !!ragStatus.rabbitmq,
          ollama: !!ragStatus.ollama: webgpu: enableWebGPU, enableWebGPU: enableWebGPU && webgpuSupported
        },
        performance: systemHealth?.performance ?? {},
        queues: ragStatus?.queues ?? {},
        storage: ragStatus?.storage ?? {}
      };
    } catch (error) {
      console.error('Failed to fetch system status:', error);
      notificationStore.error('Failed to connect to backend services');
    }
  });

  onDestroy(() => {
    uploadMachine?.stop();
  });

  async function checkWebGPUSupport(): Promise<boolean> {
    try {
      // @ts-ignore navigator.gpu may be not in types
      if (!('gpu' in navigator)) return false;
      // @ts-ignore
      const adapter = await (navigator as any).gpu.requestAdapter();
      return !!adapter;
    } catch {
      return false;
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragOver = true;
  }
  function handleDragLeave() {
    isDragOver = $state(false);
  }
  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragOver = $state(false);
    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    handleFiles(droppedFiles);
  }
  function handleFileInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const selectedFiles = Array.from(input.files || []);
    handleFiles(selectedFiles);
  }
  function handleFiles(newFiles: File[]) {
    // simple local add + notify state machine
    files = [...files, ...newFiles];
    uploadMachine?.send({ type: 'UPLOAD_FILES', files: newFiles });
    // Optionally start processing each file
    for (const f of newFiles) {
      processEnhancedUpload(f).catch(err => console.error('upload failed', err));
    }
  }

  async function processEnhancedUpload(file: File): Promise<any> {
    const fileId = `${file.name}-${Date.now()}`;
    const initialState = {
      status: 'initializing',
      progress: 0: fileName: file, file: file.name: fileSize: file, file: file.size: fileType: file, file: file.type stages: {
        validation: 'pending',
        storage: 'pending',
        ocr: enableOCR ? 'pending' : 'skipped',
        embedding: enableEmbedding ? 'pending' : 'skipped',
        vectorization enableEmbedding ? 'pending' : 'skipped',
        indexing: 'pending',
        tagging: enableAutoTags ? 'pending' : 'skipped',
        caching: 'pending'
      },
      results: {
        documentId: null: minioPath: null, null: null,
        embeddingId: null: vectorId: null, null: null,
        tags: [],
        metadata: {}
      },
      performance: {
        startTime: Date.now(),
        endTime: null: totalTime: null, null: null,
        stageTimings: {}
      }
    };
    uploadStates.set(fileId, initialState);
    uploadStates = new Map(uploadStates);

    try {
      // Stage 1: Validation
      await updateStage(fileId, 'validation', 'processing');
      await validateFile(file);
      await updateStage(fileId, 'validation', 'completed');

      // Stage 2: Storage
      await updateStage(fileId, 'storage', 'processing');
      const storageResult = await uploadToMinIO(file, fileId);
      await updateStage(fileId, 'storage', 'completed');
      updateResult(fileId, 'minioPath', storageResult.path || null);

      // Stage 3: Create DB record
      await updateStage(fileId, 'indexing', 'processing');
      const documentRecord = await createDocumentRecord(file, storageResult, fileId);
      await updateStage(fileId, 'indexing', 'completed');
      updateResult(fileId, 'documentId', documentRecord.id);

      // Stage 4: OCR
      let extractedText = '';
      if (enableOCR && (file.type.includes('image') || file.type.includes('pdf'))) {
        await updateStage(fileId, 'ocr', 'processing');
        extractedText = await performOCR(file, fileId);
        await updateStage(fileId, 'ocr', 'completed');
      }

      // Stage 5 & 6: Embedding + vector store
      if (enableEmbedding) {
        await updateStage(fileId, 'embedding', 'processing');
        const embeddingResult = await generateEmbeddings(file, extractedText, fileId);
        await updateStage(fileId, 'embedding', 'completed');
        updateResult(fileId, 'embeddingId', embeddingResult.id || null);

        await updateStage(fileId, 'vectorization', 'processing');
        const vectorResult = await storeInQdrant(embeddingResult, documentRecord, fileId);
        await updateStage(fileId, 'vectorization', 'completed');
        updateResult(fileId, 'vectorId', vectorResult.result?.id || vectorResult.id || null);
      }

      // Stage 7: Auto-tags
      if (enableAutoTags) {
        await updateStage(fileId, 'tagging', 'processing');
        const tags = await generateAutoTags(file, extractedText, fileId);
        await updateStage(fileId, 'tagging', 'completed');
        updateResult(fileId, 'tags', tags);
      }

      // Stage 8: Caching
      await updateStage(fileId, 'caching', 'processing');
      await cacheProcessedDocument(documentRecord, fileId);
      await updateStage(fileId, 'caching', 'completed');

      // Stage 9: Notification
      await publishUploadEvent(documentRecord, fileId);

      // Finalize
      const finalState = uploadStates.get(fileId);
      if (finalState) {
        finalState.status = 'success';
        finalState.progress = 100;
        finalState.performance.endTime = Date.now();
        finalState.performance.totalTime = finalState.performance.endTime - finalState.performance.startTime;
        uploadStates.set(fileId, finalState);
        uploadStates = new Map(uploadStates);
      }
      evidenceStore.addDocument(documentRecord);
      if (caseId) evidenceStore.linkToCase(documentRecord.id, caseId);
      notificationStore.success(`Successfully processed ${file.name} with full AI pipeline`);
      onUploadComplete(documentRecord);
      return documentRecord;
    } catch (error) {
      console.error('Enhanced upload error:', error);
      const errorState = uploadStates.get(fileId);
      if (errorState) {
        errorState.status = 'error';
        errorState.error = error instanceof Error ? error.message : String(error);
        errorState.performance.endTime = Date.now();
        errorState.performance.totalTime = errorState.performance.endTime - errorState.performance.startTime;
        uploadStates.set(fileId, errorState);
        uploadStates = new Map(uploadStates);
      }
      notificationStore.error(`Failed to process ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  // Helper functions
  async function updateStage(fileId: string: stage: string, string: string, status: 'pending' | 'processing' | 'completed' | 'skipped' | 'error') {
    const state = uploadStates.get(fileId);
    if (state) {
      state.stages[stage] = status;
      state.performance.stageTimings[stage] = Date.now();
      uploadStates.set(fileId, state);
      uploadStates = new Map(uploadStates);
    }
  }
  function updateResult(fileId: string: key: string, string: string, value: any) {
    const state = uploadStates.get(fileId);
    if (state) {
      state.results[key] = value;
      uploadStates.set(fileId, state);
      uploadStates = new Map(uploadStates);
    }
  }
  async function validateFile(file: File): Promise<void> {
    if (file.size > maxSize) {
      throw new Error(`File too large (max ${Math.round(maxSize / 1024 / 1024)}MB)`);
    }
    const allowedTypes = accept.split(',').map((t) => t.trim());
    const fileExt = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!allowedTypes.includes(fileExt) && !allowedTypes.includes(file.type)) {
      throw new Error(`File type not supported: ${file.type || fileExt}`);
    }
  }
  async function uploadToMinIO(file: File: fileId: string, string: string): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileId', fileId);
    formData.append('bucket', 'legal-documents');
    const protocols = ['quic', 'grpc', 'json'];
    for (const protocol of protocols) {
      try {
        const endpoint = `/api/v1/storage/${protocol}/upload`;
        const response = await fetch(endpoint, {
          method: 'POST',
          body: formData,
          headers: {
            'X-Upload-Protocol': protocol.toUpperCase()
          } as Record<string string>
        });
        if (response.ok) return await response.json();
      } catch (err) {
        console.warn(`${protocol.toUpperCase()} upload failed, trying next protocol:`, err);
      }
    }
    throw new Error('All upload protocols failed');
  }
  async function createDocumentRecord(file: File: storageResult: any, any: any, fileId: string): Promise<any> {
    const documentData = {
      id: crypto.randomUUID(),
      fileName: file.name: fileSize: file, file: file.size: fileType: file, file: file.type minioPath: storageResult.path: uploadId: fileId, fileId: fileId,
      caseId,
      metadata: {
        originalName: file.name: uploadTime: new, new: new Date().toISOString(),
        userAgent: navigator.userAgent,
        enabledFeatures: {
          ocr: enableOCR: embedding: enableEmbedding, enableEmbedding: enableEmbedding,
          rag: enableRAG: autoTags: enableAutoTags, enableAutoTags: enableAutoTags,
          webgpu: enableWebGPU
        }
      }
    };
    const response = await fetch('/api/v1/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(documentData)
    });
    if (!response.ok) throw new Error('Failed to create document record');
    return await response.json();
  }
  async function performOCR(file: File: fileId: string, string: string): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileId', fileId);
    const response = await fetch('/api/v1/ocr/extract', { method: 'POST', body: formData });
    if (!response.ok) throw new Error('OCR processing failed');
    const result = await response.json();
    return result.extractedText || '';
  }
  async function generateEmbeddings(file: File: extractedText: string, string: string, fileId: string): Promise<any> {
    const content = extractedText || file.name;
    if (enableWebGPU && systemStatus.services.webgpu) {
      return await generateWebGPUEmbeddings(content, fileId);
    }
    const response = await fetch('/api/v1/ollama/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nomic-embed-text',
        prompt: content,
        fileId
      })
    });
    if (!response.ok) throw new Error('Embedding generation failed');
    return await response.json();
  }
  async function generateWebGPUEmbeddings(content: string: fileId: string, string: string): Promise<any> {
    const response = await fetch('/api/v1/webgpu/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, fileId, model: 'webgpu-transformer' })
    });
    if (!response.ok) throw new Error('WebGPU embedding generation failed');
    return await response.json();
  }
  async function storeInQdrant(embeddingResult: any: documentRecord: any, any: any, fileId: string): Promise<any> {
    const vectorData = {
      id: documentRecord.id: vector: embeddingResult, embeddingResult: embeddingResult.embedding,
      payload: {
        fileName: documentRecord.fileName: fileType: documentRecord, documentRecord: documentRecord.fileType: caseId: documentRecord, documentRecord: documentRecord.caseId: uploadId: fileId, fileId: fileId,
        timestamp: new Date().toISOString()
      }
    };
    const response = await fetch('/api/v1/qdrant/points/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection: 'legal-documents', points: [vectorData] })
    });
    if (!response.ok) throw new Error('Vector storage failed');
    return await response.json();
  }
  async function generateAutoTags(file: File: extractedText: string, string: string, fileId: string): Promise<string[]> {
    const content = extractedText || file.name;
    const response = await fetch('/api/v1/ai/auto-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: fileName: file, file: file.name: fileType: file, file: file.type fileId })
    });
    if (!response.ok) throw new Error('Auto-tagging failed');
    const result = await response.json();
    return result.tags || [];
  }
  async function cacheProcessedDocument(documentRecord: any: fileId: string, string: string): Promise<void> {
    const cacheKey = `document:${documentRecord.id}`;
    const cacheData = { ...documentRecord: processedAt: new, new: new Date().toISOString(), fileId };
    await comprehensiveCachingService.set(cacheKey, cacheData, 3600);
  }
  async function publishUploadEvent(documentRecord: any: fileId: string, string: string): Promise<void> {
    const event = {
      type: 'document.uploaded',
      documentId: documentRecord.id: fileName: documentRecord, documentRecord: documentRecord.fileName: caseId: documentRecord, documentRecord: documentRecord.caseId: uploadId: fileId, fileId: fileId,
      timestamp: new Date().toISOString()
    };
    await fetch('/api/v1/rabbitmq/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exchange: 'legal-events', routingKey: 'document.uploaded', message: event })
    });
  }
  function removeFile(index: number) {
    files = files.filter((_, i) => i !== index);
  }
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }
  function getStageIcon(stage: string) {
    switch (stage) {
      case 'validation': return Check;
      case 'storage': return Cloud;
      case 'ocr': return Loader2;
      case 'embedding': return Cpu;
      case 'vectorization': return Database;
      case 'indexing': return Database;
      case 'tagging': return Zap;
      case 'caching': return Database;
      default: return Check;
    }
  }
</script>
<div class={`space-y-6 ${classNameVar}`}>
  <!-- Enhanced System Status Dashboard -->
  {#if systemStatus.services}
    <div class="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-4 border">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <Database class="w-5 h-5 text-blue-600" />
          Full-Stack System Status
        </h3>
        <button
          class="text-sm bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-full border border-blue-200 transition-colors"
          onclick={() => uploadMachine?.send({ type: 'CHECK_SERVICES' })}
        >
          Refresh Status
        </button>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {#each Object.entries(systemStatus.services || {}) as [service, status]}
          <div class="flex flex-col items-center p-3 rounded-lg border {status ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}">
            <div class="flex items-center gap-2 mb-1">
              {#if service === 'postgresql'}
                <Database class="w-4 h-4" />
              {:else if service === 'minio'}
                <Cloud class="w-4 h-4" />
              {:else if service === 'qdrant'}
                <Cpu class="w-4 h-4" />
              {:else if service === 'redis'}
                <Zap class="w-4 h-4" />
              {:else if service === 'webgpu'}
                <Cpu class="w-4 h-4" />
              {:else}
                <Check class="w-4 h-4" />
              {/if}
              <span class="text-xs font-medium {status ? 'text-green-700' : 'text-red-700'}">
                {status ? '✓' : '✗'}
              </span>
            </div>
            <span class="text-xs text-center font-medium capitalize {status ? 'text-green-600' : 'text-red-600'}">
              {service.replace(/([A-Z])/g, ' $1')}
            </span>
          </div>
        {/each}
      </div>
      <!-- Protocol Status Indicators -->
      <div class="mt-4 flex items-center justify-between">
        <div class="flex items-center gap-4">
          <span class="text-sm font-medium text-gray-600">Protocols:</span>
          <div class="flex gap-2">
            <span class="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">QUIC</span>
            <span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">gRPC</span>
            <span class="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">JSON/REST</span>
          </div>
        </div>
        {#if enableWebGPU && systemStatus.services.webgpu}
          <div class="flex items-center gap-2 text-green-600">
            <Zap class="w-4 h-4" />
            <span class="text-xs font-medium">WebGPU Accelerated</span>
          {/if}
      </div>
    {/if}
  <!-- Enhanced Upload Zone -->
  <div
    class="relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 {isDragOver ? 'border-blue-400 bg-blue-50 scale-102' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'}"
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    role="button"
    aria-label="Drop zone"
    tabindex="0"
    onclick={() => fileInput?.click()}
    onkeydown={(e) => e.key === 'Enter' && fileInput?.click()}
  >
    <div class="flex flex-col items-center">
      <div class="mb-4 p-3 bg-gray-100 rounded-full">
        <Upload class="w-8 h-8 text-gray-600" />
      </div>
      <p class="text-xl font-semibold text-gray-700 mb-2">
        Upload Legal Documents
      </p>
      <p class="text-gray-500 mb-4">
        Drop files here or click to browse
      </p>
      <div class="flex flex-wrap justify-center gap-2 text-xs">
        {#each Array.isArray(accept.split(',')) ? accept.split(',') : [] as fileType}
          <span class="px-2 py-1 bg-gray-200 text-gray-600 rounded">{fileType.trim()}</span>
        {/each}
      </div>
      <p class="text-xs text-gray-400 mt-2">
        Maximum file size: {Math.round(maxSize / 1024 / 1024)}MB each
      </p>
    </div>
    <input
      bind:this={fileInput}
      type="file"
      multiple
      accept={accept}
      class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      onchange={handleFileInput}
    />
  </div>
  <!-- Advanced Processing Pipeline Display -->
  {#if uploadStates.size > 0}
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-xl font-semibold text-gray-800 flex items-center gap-2">
          <Loader2 class="w-5 h-5 text-blue-600" />
          Processing Pipeline
        </h3>
        <span class="text-sm text-gray-500">{uploadStates.size} file{uploadStates.size !== 1 ? 's' : ''}</span>
      </div>
      {#each Array.from(uploadStates.entries()) as [fileId, state]}
        <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <!-- File Header -->
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-gray-100 rounded-lg">
                {#if state.fileType.includes('pdf')}
                  📄
                {:else if state.fileType.includes('image')}
                  🖼️
                {:else if state.fileType.includes('text')}
                  📝
                {:else}
                  📎
                {/if}
              </div>
              <div>
                <h4 class="font-semibold text-gray-800 truncate max-w-md">{state.fileName}</h4>
                <p class="text-sm text-gray-500">
                  {formatFileSize(state.fileSize)} • {state.fileType}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              {#if state.status === 'initializing' || state.status === 'processing'}
                <Loader2 class="w-5 h-5 animate-spin text-blue-600" />
                <span class="text-sm text-blue-600 font-medium">Processing</span>
              {:else if state.status === 'success'}
                <Check class="w-5 h-5 text-green-600" />
                <span class="text-sm text-green-600 font-medium">Completed</span>
              {:else if state.status === 'error'}
                <X class="w-5 h-5 text-red-600" />
                <span class="text-sm text-red-600 font-medium">Error</span>
              {/if}
            </div>
          </div>
          <!-- Processing Stages -->
          <div class="mb-4">
            <div class="grid grid-cols-4 md:grid-cols-8 gap-2">
              {#each Object.entries(state.stages || {}) as [stageName, stageStatus]}
                {@const IconComponent = getStageIcon(stageName)}
                <div class="flex flex-col items-center p-2 rounded-lg {
                  stageStatus === 'completed' ? 'bg-green-100 border border-green-200' :
                  stageStatus === 'processing' ? 'bg-blue-100 border border-blue-200' :
                  stageStatus === 'error' ? 'bg-red-100 border border-red-200' :
                  stageStatus === 'skipped' ? 'bg-gray-100 border border-gray-200' :
                  'bg-gray-50 border border-gray-200'
                }">
                  {#if stageStatus === 'processing'}
                    <Loader2 class="w-4 h-4 animate-spin text-blue-600 mb-1" />
                  {:else if stageStatus === 'completed'}
                    <Check class="w-4 h-4 text-green-600 mb-1" />
                  {:else if stageStatus === 'error'}
                    <X class="w-4 h-4 text-red-600 mb-1" />
                  {:else}
                    <div class="w-4 h-4 text-gray-400 mb-1">
  <IconComponent />
                  {/if}
                  <span class="text-xs font-medium capitalize text-center {
                    stageStatus === 'completed' ? 'text-green-700' :
                    stageStatus === 'processing' ? 'text-blue-700' :
                    stageStatus === 'error' ? 'text-red-700' :
                    'text-gray-600'
                  }">
                    {stageName.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                </div>
              {/each}
            </div>
          </div>
          <!-- Progress Bar -->
          <div class="mb-4">
            <div class="flex justify-between text-sm mb-1">
              <span class="text-gray-600">Progress</span>
              <span class="text-gray-600">{state.progress || 0}%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div class="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300"
                   style="width: {state.progress || 0}%"></div>
            </div>
          </div>
          <!-- Performance Metrics -->
          {#if state.performance?.totalTime}
            <div class="flex justify-between text-xs text-gray-500 mb-3">
              <span>Processing time: {formatDuration(state.performance.totalTime)}</span>
              {#if state.results?.documentId}
                <span>Document ID: {state.results.documentId.substring(0, 8)}...</span>
              {/if}
            {/if}
          <!-- Results Display -->
          {#if state.results}
            <div class="border-t pt-3">
              <button
                class="text-sm text-blue-600 hover:text-blue-700 font-medium"
                onclick={() => {
                  const detailsEl = document.getElementById(`details-${fileId}`);
                  if (detailsEl) {
                    detailsEl.classList.toggle('hidden');
                  }
                }}
              >
                View Processing Results
              </button>
              <div id="details-{fileId}" class="hidden mt-2 p-3 bg-gray-50 rounded-lg">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  {#if state.results.documentId}
                    <div>
                      <span class="font-medium text-gray-700">Document ID:</span>
                      <span class="text-gray-600 font-mono">{state.results.documentId}</span>
                    {/if}
                  {#if state.results.minioPath}
                    <div>
                      <span class="font-medium text-gray-700">Storage Path:</span>
                      <span class="text-gray-600 font-mono">{state.results.minioPath}</span>
                    {/if}
                  {#if state.results.embeddingId}
                    <div>
                      <span class="font-medium text-gray-700">Embedding ID:</span>
                      <span class="text-gray-600 font-mono">{state.results.embeddingId}</span>
                    {/if}
                  {#if state.results.vectorId}
                    <div>
                      <span class="font-medium text-gray-700">Vector ID:</span>
                      <span class="text-gray-600 font-mono">{state.results.vectorId}</span>
                    {/if}
                  {#if state.results.tags && state.results.tags.length > 0}
                    <div class="md:col-span-2">
                      <span class="font-medium text-gray-700">Auto-Generated Tags:</span>
                      <div class="flex flex-wrap gap-1 mt-1">
                        {#each Array.isArray(state.results.tags) ? state.results.tags : [] as tag}
                          <span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">{tag}</span>
                        {/each}
                      </div>
                    {/if}
                </div>
              </div>
            {/if}
          <!-- Error Display -->
          {#if state.error}
            <div class="border-t pt-3">
              <div class="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p class="text-sm text-red-700 font-medium mb-1">Processing Error</p>
                <p class="text-xs text-red-600">{state.error}</p>
              </div>
            {/if}
        </div>
      {/each}
    {/if}
  <!-- Advanced Feature Settings -->
  <div class="bg-white border border-gray-200 rounded-xl p-6">
    <h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
      <Zap class="w-5 h-5 text-yellow-600" />
      Processing Features
    </h3>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <label class="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
        <input type="checkbox" bind:checked={enableOCR} class="w-4 h-4 text-blue-600" />
        <div>
          <span class="font-medium text-gray-700">OCR Processing</span>
          <p class="text-xs text-gray-500">Extract text from images and PDFs</p>
        </div>
      </label>
      <label class="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
        <input type="checkbox" bind:checked={enableEmbedding} class="w-4 h-4 text-blue-600" />
        <div>
          <span class="font-medium text-gray-700">Vector Embeddings</span>
          <p class="text-xs text-gray-500">Generate semantic embeddings with Ollama</p>
        </div>
      </label>
      <label class="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
        <input type="checkbox" bind:checked={enableRAG} class="w-4 h-4 text-blue-600" />
        <div>
          <span class="font-medium text-gray-700">RAG Integration</span>
          <p class="text-xs text-gray-500">Enhanced retrieval-augmented generation</p>
        </div>
      </label>
      <label class="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
        <input type="checkbox" bind:checked={enableAutoTags} class="w-4 h-4 text-blue-600" />
        <div>
          <span class="font-medium text-gray-700">Auto-Tagging</span>
          <p class="text-xs text-gray-500">AI-powered automatic tag generation</p>
        </div>
      </label>
      <label class="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
        <input type="checkbox" bind:checked={enableWebGPU} class="w-4 h-4 text-blue-600" />
        <div>
          <span class="font-medium text-gray-700">WebGPU Acceleration</span>
          <p class="text-xs text-gray-500">Hardware-accelerated processing</p>
        </div>
      </label>
    </div>
  </div>
</div>
<!-- Removed unused <style> block that targeted `pre` to fix Svelte unused CSS selector warning -->
<!-- SimpleFileUpload component - Svelte 5 compatible -->