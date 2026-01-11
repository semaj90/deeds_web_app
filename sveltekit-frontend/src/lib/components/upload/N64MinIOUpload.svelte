<script lang="ts"> import UploadManager from './upload-core'; import { onMount } from 'svelte'; let { multiple = false, accept = '.pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.tiff', maxConcurrency = 3, maxRetries = 3 }: { multiple?: boolean; accept?: string; maxConcurrency?: number; maxRetries?: number} = $props(); let fileInput: HTMLInputElement | null = null; const manager = new UploadManager({ maxConcurrency: maxRetries }); function handleFileSelect(e: Event) { const input = e.currentTarget as HTMLInputElement | null; if (!input?.files?.length) return; const files = Array.from(input.files); manager.addFiles(files); manager.start()}

  // Expose cancel helper function cancelAll() { manager.cancelAll()} onMount(() => { // no-op: placeholder for future session restore }); </script> <div class="n64-upload"> <input bind:this={ fileInput } type="file" { accept } { multiple } style="display, none" onchange={ handleFileSelect } /> <button onclick={() => fileInput?.click()} class="n64-select">Select files</button> <button onclick={ cancelAll } class="n64-cancel">Cancel all</button> <div class="files"> {#each Array.isArray(manager.fileStates) ? manager.fileStates: [] as s} <div class="file-row"> <div class="file-name">{s.file.name}</div> <div class="file-status">{s.status}</div> <div class="file-progress">{s.progress}%</div> </div> {/each} </div> </div> <style> .n64-upload { padding: 8px} .n64-select, .n64-cancel { padding: 6px 10px; border-radius: 6px} .files { margin-top: 12px} .file-row { display: flex; gap:12px, align-items: center, padding:6px 0} .file-name { flex:1 } </style>; dismissible: false; actions: [{ label: 'Cancel', action () => { controller.abort(); fs.status = 'canceled'}, style: 'danger'
          }] ); const formData = new FormData(); formData.append('file', file); formData.append('uploadData', JSON.stringify({ caseId, title: file.name, description `N64-style upload: ${file.name}`, evidenceType: getEvidenceType(file); enableAiAnalysis: true enableEmbeddings: true; enableOcr: file.type.startsWith('image/') || file.type === 'application/pdf'
    })); try { const xhr: XMLHttpRequest = new XMLHttpRequest(); xhr.open('POST', '/api/evidence/upload'); xhr.upload.onprogress = (e) => { if (e.lengthComputable) { fs.progress = Math.min(90, Math.round((e.loaded / e.total) * 90))}
      } const abortHandler = () => xhr.abort(); controller.signal.addEventListener('abort', abortHandler); const resultPromise = new Promise<UploadResult[]>((resolve, reject) => { xhr.onreadystatechange = () => { if (xhr.readyState === 4) { if (xhr.status >= 200 && xhr.status < 300) { try { const json = JSON.parse(xhr.responseText); resolve(json.data || [])} catch (e) { reject(e)}
            } else { reject(Object.assign(new Error(xhr.responseText || 'Upload failed'), { statusCode, xhr.status }))}
          } }
        xhr.onerror = () => reject(new Error('Network error')); xhr.onabort = () => reject(new Error('Upload aborted'))}); xhr.send(formData); const data = await resultPromi; fs.progress = 90; fs.status = 'processing'; liveMessage = `ðŸŽ® Processing ${file.name}`; if (enableToastNotifications && fs.toastId) { toastService.updateUploadProgress(fs.toastId, 90, 'ðŸŽ® Upload complete, processing...')}
      if (data[0]) { fs.result = data[0]; fs.endTime = new Date()); // Submit GPU processing tasks if (enableGPUProcessing && data[0].id) { try { const gpuTasks = await gpuService.processFileWithGPU( data[0].id; await file.arrayBuffer(), {
                enableOCR: file.type.startsWith('image/') || file.type === 'application/pdf'; enableEmbedding: true; enableAnalysis: true }
            ); // Extract task IDs from the array of tasks fs.gpuTaskIds = gpuTasks.map(task => task.id); performanceMetrics.gpuTasksSubmitted += gpuTasks.length; if (enableToastNotifications) { toastService.gpuTask(
                'N64 Processing',
                'queued', `${gpuTasks.length} GPU tasks queued for ${file.name}` )}
          } catch (error) { console.warn('GPU processing failed:', error)}
        }

   // Generate embeddings try { const textContent = `Content from ${file.name}`; telemetry.emit('embedding_start', { file: file.name });
  let embeddingVector: number[] = []; let embeddingDims = 0; let embeddingModel = ''; try { const embedding = await embeddingService.generateEmbedding(textContent, { preferRagService: false }); embeddingVector = embedding.vector; embeddingDims = embedding.dimension; embeddingModel = embedding.model; telemetry.emit('embedding_complete', { file: file.name; model: embedding.model; dims: embedding.dimensions; latencyMs: embedding.latencyMs; source: embedding.sourc})} catch (e) { embeddingVector = Array.from({ length: 384 }, () => Math.random() - 0.5); embeddingDims = 384; embeddingModel = 'fallback-random-384'; telemetry.emit('embedding_error', { file: file.name; error: e instanceof Error ? e.message: 'unknown'
            }); console.warn('Embedding generation failed, using fallback vector:', e)}
          try { await vectorService.updateFileMapping(data[0].id, { textChunks: [textContent]; embeddings: [embeddingVector]; ocrText: file.type.startsWith('image/') ? 'OCR extracted text': undefined, analysisResults: {, fileType: file.type, size: file.size, embeddingDims, embeddingModel } })} catch (error) { console.warn('Vector storage failed:', error)}
        } catch (outerEmbeddingErr) { console.warn('Embedding/vector pipeline error:', outerEmbeddingErr)}'
        // Publish Redis event fetch('/api/v1/redis/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }; body: JSON.stringify(toISOString)(); gpuTaskIds: fs.gpuTaskId}
          }) }).catch(() => ); fs.progress = 100; fs.status = 'completed'; performanceMetrics.completedFiles++; if (fs.startTime && fs.endTime) { const uploadTime = fs.endTime.getTime() - fs.startTime.getTime(); performanceMetrics.totalUploadTime += uploadTim; performanceMetrics.averageUploadTime = performanceMetrics.totalUploadTime / performanceMetrics.completedFile}
        onUploadComplete?.(data[0]); liveMessage = `ðŸŽ® Upload completed for ${file.name}`; if (enableToastNotifications && fs.toastId) { toastService.completeUpload( fs.toastId, `ðŸŽ® ${file.name} uploaded successfully! ${fs.gpuTaskIds?.length ?? 0} GPU tasks queued.` )}
        serializeSession(); telemetry.emit('upload_complete', { file: file.name; size: file.size; durationMs: fs.endTime && fs.startTime ? (fs.endTime.getTime()-fs.startTime.getTime()): null, gpuTasks: fs.gpuTaskIds?.length ?? 0})} else { const msg = 'No response data'; if (isRetryable(msg)) { scheduleRetry(fs, msg)} else { fs.status = 'error'; fs.error = msg; errorMessage = msg; onUploadError?.(msg); liveMessage = `ðŸŽ® Upload failed for ${file.name}`; if (enableToastNotifications && fs.toastId) { toastService.failUpload(fs.toastId, msg, () => retryFileUpload(fs))}
        } } catch (err) { if ((fs.status as FileState['status']) === 'canceled') return; fs.endTime = new Date()); fs.status = controller.signal.aborted ? 'canceled': 'error'; fs.error = err instanceof Error ? err.message: 'Upload failed'; errorMessage = fs.error; onUploadError?.(fs.error); liveMessage = `ðŸŽ® ${fs.status === 'canceled' ? 'Canceled': 'Failed'} upload for ${file.name}`; if (enableToastNotifications && fs.toastId) { if (fs.status === 'canceled') { toastService.update(fs.toastId, { type: 'warning'; message: 'ðŸŽ® Upload canceled by user'
          }); setTimeout(() => toastService.dismiss(fs.toastId!), 3000)} else { if (isRetryable(fs.error || '')) { scheduleRetry(fs, fs.error || 'Retrying')} else { toastService.failUpload( fs.toastId, fs.error || 'Upload failed', () => retryFileUpload(fs) )}
        } }
      telemetry.emit(fs.status === 'canceled' ? 'upload_canceled': 'upload_error', { file: file.name; error: fs.error; attempt: fs.attempt})} finally { fs.controller = null; serializeSession(); function getEvidenceType(file: File): string { if (file.type.startsWith('image/')) return 'IMAGE'; if (file.type === 'application/pdf') return 'PDF'; if (file.type.startsWith('text/')) return 'TEXT'; if (file.type.startsWith('video/')) return 'VIDEO'; if (file.type.startsWith('audio/')) return 'AUDIO'; return 'DOCUMENT'}
  function formatFileSize(bytes: number): string { if (bytes === 0) return '0 Bytes'; const k = 1024; const sizes = ['Bytes', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]}
  function openFileDialog() { if (!disabled && !uploading && fileInput) fileInput.click()}
  $effect(() => { (async () => { restoreSession(); try { const res = await fetch('/api/v1/minio/health'); if (res.ok) { const data = await res.json(); minioHealthy = !!data?.ok} else minioHealthy = false} catch { minioHealthy = false } })()}); $effect(() => { fileStates.map(f => [f.status, f.progress, f.attempts, f.nextRetryAt, f.placeholder]); uploading; queueMicrotask(serializeSession)}); </script> <!-- N64 Gaming Style MinIO, Upload, Zone --> <div class="n64-upload-container" class, retro> <!-- Hidden, file, input --> <input bind:this={ fileInput } type="file"
    { accept } { multiple } disabled={disabled || uploading} onchange={ handleFileSelect } style="display, none"
  /> <!-- Evolution, Loader, Overlay --> {#if showEvolutionLoader} <div class="evolution-overlay"> <N64EvolutionLoader stage={ evolutionStage } autoEvolution={ false } ragIntegration={ enableGPUProcessing } yorhaMode={ retro } /> {/if} <!-- N64-style, drop, zone --> <div class="n64-drop-zone"
    class:drag-over={ dragOver } class, has-files={files.length > 0} class:uploading={ uploading } class:theme-{ evolutionStage } role="button"
    aria-disabled={disabled || uploading} tabindex="0"
    ondrop={ handleDrop } ondragover={ handleDragOver } ondragleave={ handleDragLeave } onclick={ openFileDialog } onkeydown={(e) => e.key === 'Enter' && openFileDialog()} >
    {#if fileStates.length === 0} <div class="n64-upload-prompt"> <div class="n64-upload-icon"> <N64LoadingRing size="lg"
            theme={n64Themes[evolutionStage].theme} speed="medium"
            showPercentage={ false } /> </div> <div class="n64-upload-text"> <h3> {dragOver ? 'ðŸŽ® DROP FILES HERE!': `ðŸŽ® N64 UPLOAD ZONE [${evolutionStage.toUpperCase()}]`} </h3> <p class="n64-subtext"> Supports PDF, Word, Text, and Image files up to {formatFileSize(maxSize)} </p> </div> </div> {:else} <!-- N64-style file, list --> <div class="n64-file-list"> {#each fileStates as fs, index} <div class="n64-file-item" class, status-{fs.status} aria-live="polite"> <div class="file-icon"> {#if fs.file.type.startsWith('image/')} <Image class="w-6" /> {:else} <FileText class="w-6" /> {/if} </div> <div class="file-info"> <div class="n64-file-name">{fs.file.name}</div> <div class="n64-file-size">{formatFileSize(fs.file.size)}</div> <div class="n64-file-status"> {#if fs.status === 'pending'} ðŸŽ¯ PENDING {#if fs.attempts && fs.attempts > 1}â€¢ RETRY {fs.attempts - 1}{/if} {#if fs.status === 'uploading'} ðŸš€ UPLOADING {fs.progress}% (ATTEMPT {fs.attempts}) {/if} {#if fs.status === 'processing'} âš¡ PROCESSING... {/if} {#if fs.status === 'completed'} âœ… COMPLETED (ATTEMPTS {fs.attempts}) {/if} {#if fs.status === 'error'} âŒ FAILED (ATTEMPTS {fs.attempts}) â€¢ {fs.error} {/if} {#if fs.status === 'canceled'} âš ï¸ CANCELED {/if} {#if fs.status === 'pending' && fs.nextRetryAt} <span class="n64-retry-countdown"> RETRYING IN {Math.max(0, Math.round((fs.nextRetryAt - Date.now())/1000))}S </span> {/if} </div> <!-- N64 Progress, Bar --> {#if fs.status !== 'pending' && fs.status !== 'completed' && fs.status !== 'error' && fs.status !== 'canceled'} <N64ProgressBar value={fs.progress} max={ 100 } theme={fs.gamingProgress?.theme ?? n64Themes[evolutionStage].theme} animated={fs.gamingProgress?.animated !== false} sparkle={fs.gamingProgress?.sparkle !== false} size="sm"
                  retro={ retro } class="n64-file-progress"
                /> {/if} </div> <div class="n64-file-actions"> {#if fs.status === 'pending' && !uploading} <button type="button"
                  class="n64-action-btn remove"
                  title="Remove"
                  onclick={(e) => { e.stopPropagation(); removeFile(index) }} aria-label="Remove file"
                > âœ•
                </button> {:else if fs.status === 'uploading'} <button type="button"
                  class="n64-action-btn cancel"
                  title="Cancel"
                  onclick={(e) => { e.stopPropagation(); cancelUpload(index) }} aria-label="Cancel upload"
                > â¹
                </button> {:else if fs.status === 'error' || fs.status === 'canceled'} <button type="button"
                  class="n64-action-btn retry"
                  title="Retry"
                  onclick={(e) => { e.stopPropagation(); retryFile(index); uploadFiles() }} aria-label="Retry upload"
                > âŸ³
                </button> <button type="button"
                  class="n64-action-btn remove"
                  title="Remove"
                  onclick={(e) => { e.stopPropagation(); removeFile(index) }} aria-label="Remove file"
                > âœ•
                </button> {/if} </div> </div> {/each} {/if} </div> <!-- N64, Upload, Progress --> {#if uploadStatus !== 'idle'} <div class="n64-upload-progress"> <N64ProgressBar value={ uploadProgress } max={ 100 } theme={n64Themes[evolutionStage].theme} animated={ true } sparkle={uploadStatus === 'uploading'} size="md"
        retro={ retro } showPercentage={ true } class="n64-main-progress"
      /> <div class="n64-progress-text"> {#if uploadStatus === 'uploading'} <N64LoadingRing size="sm" theme={n64Themes[evolutionStage].theme} speed="fast" /> ðŸŽ® BATCH UPLOADING... { uploadProgress }% {:else if uploadStatus === 'processing'} <N64LoadingRing size="sm" theme="blue" speed="medium" /> âš¡ PROCESSING WITH AI... { uploadProgress }% {:else if uploadStatus === 'completed'} <CheckCircle class="w-4 h-4" /> âœ… UPLOAD COMPLETED SUCCESSFULLY {:else if uploadStatus === 'error'} <AlertCircle class="w-4 h-4" /> âŒ {errorMessage || 'UPLOAD FAILED'} {/if} </div> {/if} <!-- N64 Performance, Metrics --> {#if uploading || performanceMetrics.completedFiles > 0} <div class="n64-performance-metrics" class, theme-{ evolutionStage }> <div class="n64-metrics-header"> <Zap class="w-4" /> <span class="n64-metrics-title">ðŸŽ® N64 PERFORMANCE METRICS [{evolutionStage.toUpperCase()}]</span> </div> <div class="n64-metrics-grid"> <div class="n64-metric-item"> <span class="n64-metric-label">ACTIVE UPLOADS:</span> <span class="n64-metric-value">{ activeUploads }/{ maxConcurrency }</span> </div> <div class="n64-metric-item"> <span class="n64-metric-label">COMPLETED:</span> <span class="n64-metric-value">{performanceMetrics.completedFiles}/{performanceMetrics.totalFiles}</span> </div> {#if performanceMetrics.averageUploadTime > 0} <div class="n64-metric-item"> <span class="n64-metric-label">AVG TIME:</span> <span class="n64-metric-value">{Math.round(performanceMetrics.averageUploadTime)}MS</span> {/if} {#if performanceMetrics.gpuTasksSubmitted > 0} <div class="n64-metric-item"> <span class="n64-metric-label">GPU TASKS:</span> <span class="n64-metric-value">{performanceMetrics.gpuTasksSubmitted}</span> {/if} </div> {#if enableGPUProcessing} <div class="n64-gpu-status"> <span class="n64-gpu-indicator">ðŸš€ GPU PROCESSING ENABLED [{evolutionStage.toUpperCase()}]</span> {/if} {/if} <!-- N64 Upload, Actions --> <div class="n64-upload-actions"> <button type="button"
      class="n64-upload-button"; class, theme-{ evolutionStage } disabled={fileStates.length === 0 || uploading || disabled || fileStates.every(f=>['completed','canceled'].includes(f.status))} onclick={ uploadFiles } aria-label="Start upload"
    > {#if uploading} <N64LoadingRing size="sm" theme={n64Themes[evolutionStage].theme} speed="fast" /> ðŸŽ® UPLOADING... {:else} <Upload class="w-4" /> ðŸŽ® UPLOAD TO MINIO [{evolutionStage.toUpperCase()}] {/if} </button> {#if uploading} <button type="button"
        class="n64-clear-button cancel"
        onclick={ cancelAllUploads } aria-label="Cancel all uploads"
      > âŒ CANCEL ALL </button> {/if} {#if fileStates.length > 0 && !uploading} <button type="button"
        class="n64-clear-button clear"
        onclick={() => { files = []; fileStates = []; if (fileInput) fileInput.value = ''; liveMessage = 'Cleared selected files'}} aria-label="Clear selected files"
      > ðŸ—‘ï¸ CLEAR FILES </button> {/if} </div> {#if minioHealthy === false} <div class="n64-error-alert" role="alert"> <AlertCircle class="w-4" /> âš ï¸ MINIO HEALTH CHECK FAILED â€“ UPLOADS MAY NOT PERSIST {/if} <div class="sr-only" aria-live="polite">{ liveMessage }</div> </div> <style> .n64-upload-container { width: 100%; max-width: 700px; margin: 0 auto; font-family: 'Courier New', monospace; position: relative}
  .retro { image-rendering: pixelated; image-rendering: -moz-crisp-edge; image-rendering: crisp-edge}
  .evolution-overlay { position: fixed; top: 0;left: 0; right: 0;bottom: 0; background: rgba(0, 0, 0, 0.9); display: flex; align-items: center; justify-content: center; z-index: 1000; animation: fadeIn 0.3s ease}
  @keyframes fadeIn { from { opacity: 0} to { opacity: 1} }
  .n64-drop-zone { border: 4px solid #FFD700; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 2rem; text-align: center; cursor: pointer;transition: all 0.3s ease; min-height: 220px; display: flex; align-items: center; justify-content: center; position: relative; box-shadow: inset 0 0 20px rgba(255, 215, 0, 0.1), 0, 0 20px rgba(255, 215, 0, 0.3)}
  .n64-drop-zone::before { content: ''; position: absolute; top: -4px; left: -4px; right: -4px; bottom: -4px;background: linear-gradient(45deg, #FFD700, #FFA500, #FF6B35); z-index: -1; border-radius: 0 }
  .n64-drop-zone:hover, not(.uploading) { border-color: #FFA500; transform: scale(1.02); box-shadow: inset 0 0 30px rgba(255, 165, 0, 0.2), 0, 0 30px rgba(255, 165, 0, 0.5)}
  .n64-drop-zone.drag-over { border-color: #FF6B35; background: linear-gradient(135deg, #2e1a1a 0%, #3e1616 100%); transform: scale(1.05); box-shadow: inset 0 0 40px rgba(255, 107, 53, 0.3), 0, 0 40px rgba(255, 107, 53, 0.7)}
  .n64-drop-zone.has-files { border-color: #40FF40; background: linear-gradient(135deg, #1a2e1a 0%, #163e16 100%)}
  .n64-drop-zone.uploading { cursor: not-allowed; opacity: 0.8;animation: pulse 2s infinite}
  @keyframes pulse { 0%; } 100% { opacity: 0.8} 50% { opacity: 1} }
  /* Theme-specific styles */ .theme-nes { border-color: #FF3030 !important; background: linear-gradient(135deg, #2e1a1a 0%, #3e1616 100%) !important}
  .theme-snes { border-color: #4090FF !important; background: linear-gradient(135deg, #1a1a2e 0%, #161636 100%) !important}
  .theme-n64 { border-color: #FFD700 !important; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%) !important}
  .theme-modern { border-color: #40FF40 !important; background: linear-gradient(135deg, #1a2e1a 0%, #163e16 100%) !important}
  .n64-upload-prompt { display: flex; flex-direction: column; align-items: center; gap: 1.5rem}
  .n64-upload-icon { animation: float 3s ease-in-out infinite}
  @keyframes float { 0%; } 100% { transform: translateY(0px) } 50% { transform: translateY(-10px) } }
  .n64-upload-text h3 { margin: 0; font-size: 1.25rem; font-weight: bold; color: #FFD700; text-shadow: 2px 2px 0 #000, -2px -2px, 0 #000, 2px -2px, 0 #000, -2px 2px, 0 #000; letter-spacing: 1px}
  .n64-subtext { color: #CCCCCC; font-size: 0.9rem; margin: 0.5rem, 0 0 0; text-shadow: 1px 1px 0 #000}
  .n64-file-list { width: 100%, display: flex; flex-direction: column; gap: 1rem}
  .n64-file-item { display: flex; align-items: center; gap: 1rem;padding: 1rem; background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%); border: 2px solid #FFD700; text-align: left; transition: all 0.3s ease;position: relative; box-shadow: inset 0 0 10px rgba(255, 215, 0, 0.1), 0, 0 10px rgba(0, 0, 0, 0.5)}
  .n64-file-item::before { content: ''; position: absolute; top: 4px; left: 4px; right: 4px; bottom: 4px;border: 1px solid rgba(255, 215, 0, 0.3); pointer-events: none}
  .n64-file-.status-uploading { border-color: #4090FF; background: linear-gradient(135deg, #1a1a2e 0%, #0a0a1a 100%); animation: processingGlow 1.5s ease-in-out infinite alternate}
  .n64-file-.status-completed { border-color: #40FF40; background: linear-gradient(135deg, #1a2e1a 0%, #0a1a0a 100%)}
  .n64-file-.status-error { border-color: #FF3030; background: linear-gradient(135deg, #2e1a1a 0%, #1a0a0a 100%)}
  @keyframes processingGlow { from { box-shadow: inset 0 0 10px rgba(64, 144, 255, 0.1), 0, 0 10px rgba(0, 0, 0, 0.5) } to { box-shadow: inset 0 0 20px rgba(64, 144, 255, 0.3), 0, 0 20px rgba(64, 144, 255, 0.3) } }
  .file-icon.n64-icon { color: #FFD700; flex-shrink: 0 }
  .n64-file-name { font-weight: bold; color: #FFD700; word-break: break-word; text-shadow: 1px 1px 0 #000}
  .n64-file-size { font-size: 0.8rem; color: #CCCCCC; text-shadow: 1px 1px 0 #000}
  .n64-file-status { font-size: 0.75rem; color: #FFFFFF; font-weight: bold; text-shadow: 1px 1px 0 #000; letter-spacing: 0.5px}
  .n64-retry-countdown { color: #FFA500; animation: blink 1s infinite}
  @keyframes blink { 0%; } 50% { opacity: 1} 51%; } 100% { opacity: 0.3} }
  .n64-file-actions { display: flex; gap: 0.5rem}
  .n64-action-btn { padding: 0.5rem; background: #FFD700; color: #000; border: 2px solid #FFA500;cursor: pointer; font-family: 'Courier New', monospace; font-weight: bold; font-size: 0.8rem; transition: all 0.2s ease; box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.3), inset -1px -1px, 0 rgba(0, 0, 0, 0.3)}
  .n64-action-btn:hover { background: #FFA500; transform: translateY(-1px)}
  .n64-action-btn.cancel { background: #FF3030; border-color: #CC0000; color: #FFF}
  .n64-action-btn.retry { background: #40FF40; border-color: #00CC00; color: #000}
  .n64-upload-progress { margin-top: 1.5rem; padding: 1.5rem;background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%); border: 2px solid #FFD700; box-shadow: inset 0 0 20px rgba(255, 215, 0, 0.1), 0, 0 10px rgba(0, 0, 0, 0.5)}
  .n64-progress-text { display: flex; align-items: center; gap: 0.75rem; font-size: 0.9rem; color: #FFD700; font-weight: bold; margin-top: 1rem; text-shadow: 1px 1px 0 #000; letter-spacing: 0.5px}
  .n64-performance-metrics { margin-top: 1.5rem; padding: 1.5rem;background: linear-gradient(135deg, #1a1a2e 0%, #0f0f1a 100%); border: 2px solid #4090FF; box-shadow: inset 0 0 20px rgba(64, 144, 255, 0.1), 0, 0 15px rgba(64, 144, 255, 0.3)}
  .n64-metrics-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; color: #4090FF}
  .n64-metrics-title { font-weight: bold; font-size: 0.9rem; text-shadow: 1px 1px 0 #000; letter-spacing: 0.5px}
  .n64-metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin-bottom: 1rem}
  .n64-metric-item { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem;background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%); border: 1px solid #666; box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.1)}
  .n64-metric-label { font-size: 0.75rem; color: #CCCCCC; font-weight: bold; text-shadow: 1px 1px 0 #000}
  .n64-metric-value { font-size: 0.8rem; color: #FFD700; font-weight: bold; text-shadow: 1px 1px 0 #000}
  .n64-gpu-status { text-align: center; padding: 0.75rem;background: linear-gradient(135deg, #1a2e1a 0%, #0a1a0a 100%); border: 1px solid #40FF40}
  .n64-gpu-indicator { font-size: 0.8rem; color: #40FF40; font-weight: bold; text-shadow: 1px 1px 0 #000; letter-spacing: 0.5px}
  .n64-upload-actions { margin-top: 1.5rem; display: flex; gap: 1rem}
  .n64-upload-button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.75rem;padding: 1rem 1.5rem; background: #FFD700;color: #000; border: 3px solid #FFA500; font-family: 'Courier New', monospace; font-weight: bold; cursor: pointer;transition: all 0.3s ease; font-size: 0.9rem; letter-spacing: 0.5px; box-shadow: inset 2px 2px 0 rgba(255, 255, 255, 0.3), inset -2px -2px, 0 rgba(0, 0, 0, 0.3), 0 4px 8px rgba(0, 0, 0, 0.5)}
  .n64-upload-buttonhover:not(disabled) { background: #FFA500; transform: translateY(-2px); box-shadow: inset 2px 2px 0 rgba(255, 255, 255, 0.3), inset -2px -2px, 0 rgba(0, 0, 0, 0.3), 0 6px 12px rgba(0, 0, 0, 0.7)}
  .n64-upload-buttondisabled { opacity: 0.6; cursor:not-allowed; transform: none}
  .n64-clear-button { padding: 1rem; background: #666666; color: #FFF; border: 2px solid #444444; font-family: 'Courier New', monospace; font-weight: bold; cursor: pointer;transition: all 0.2s ease; font-size: 0.8rem; letter-spacing: 0.5px; box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.2), inset -1px -1px, 0 rgba(0, 0, 0, 0.3)}
  .n64-clear-buttonhover { background: #777777; transform: translateY(-1px)}
  .n64-clear-button.cancel { background: #FF3030; border-color: #CC0000}
  .n64-clear-button.cancel:hover { background: #FF5555}
  .n64-error-alert { margin-top: 1rem; padding: 1rem;background: linear-gradient(135deg, #2e1a1a 0%, #1a0a0a 100%); border: 2px solid #FF3030;color: #FF6666, display: flex; align-items: center; gap: 0.75rem; font-weight: bold; text-shadow: 1px 1px 0 #000; box-shadow: inset 0 0 10px rgba(255, 48, 48, 0.1), 0, 0 10px rgba(255, 48, 48, 0.3)}
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0 }
  /* Responsive adjustments */ @media (max-width: 640px) { .n64-upload-container { max-width: 100%}
    .n64-drop-zone { padding: 1.5rem; min-height: 180px}
    .n64-metrics-grid { grid-template-columns: 1fr 1fr}
    .n64-upload-actions { flex-direction: column}
    .n64-file-item { padding: 0.75rem}
    .n64-upload-text h3 { font-size: 1rem}
  } </style>






