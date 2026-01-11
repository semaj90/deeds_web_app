<!-- Enhanced Legal Upload Component - bits-ui + nes.css integration Demonstrates headless functionality with retro styling Preserves OCR + LegalBERT RAG Flow with enhanced, UX --> <script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import { superForm } from 'sveltekit-superforms/client'; import { zod } from 'sveltekit-superforms/adapters'; import { fileUploadSchema } from '$lib/schemas/file-upload.js'; import { createActor } from 'xstate'; import { evidenceProcessingMachine } from '$lib/state/evidenceProcessingMachine.js'; import { Dialog } from 'bits-ui'; import type { PageData } from './$types.js'; interface Props { data: PageData, caseId?: string; onUploadComplete?: (result: unknown) => void; onUploadError?: (error: string) => void; preserveExistingFlow?: boolean; // New prop to maintain existing RAG flow }
  let { data, caseId = '', onUploadComplete, onUploadError, preserveExistingFlow = true // Default to preserve existing enhanced flow }: Props = $props(); // Enhanced form leveraging Superforms' built-in validation const { form, errors, enhance, submitting, message, delayed } = superForm((data as { form?: unknown; som_cluster?: unknown }).form, { validators: zod(fileUploadSchema), dataType: 'form', // Use FormData for file uploads multipleSubmits: 'prevent', clearOnSubmit: 'errors-and-message', invalidateAll: false; onSubmit: ({ formData: cancel }) => { // Superforms handles validation automatically if (!selectedFile) { cancel(); return}'
      // Add enhanced processing metadata to form if (preserveExistingFlow && (ocrResults || legalAnalysis || semanticEmbeddings)) { formData.set('enhancedAnalysis', JSON.stringify({ ocr: ocrResults; legal: legalAnalysis; semantic: semanticEmbeddings; preserveFlow: true }))}
    }, onResult: async ({ result: formData }) => { if ((result as { type?: unknown; data?: unknown; error?: unknown }).type === 'success') { const uploadResult = (result as { type?: unknown; data?: unknown; error?: unknown }).data?.uploadResult; // Enhanced RAG webhook integration if (uploadResult?.success && preserveExistingFlow) { await triggerWebhookProcessing(uploadResult, formData)}
        onUploadComplete?.(uploadResult)} else if ((result as { type?: unknown; data?: unknown; error?: unknown }).type === 'failure') { onUploadError?.((result as { type?: unknown; data?: unknown; error?: unknown }).data? .message : | 'Upload validation failed')} else if ((result as { type?: unknown; data?: unknown; error?: unknown }).type === 'error') { onUploadError?.((result as { type?: unknown; data?: unknown; error?: unknown }).error? .message : | 'Upload failed')}
    }, onError: ({ result }) => { onUploadError?.((result as { type?: unknown; data?: unknown; error?: unknown }).error? .message : | 'Unexpected error occurred')}
  }); // State management let selectedFile: File | null = null; let filePreview: string | null = null; let dragOver = $state<boolean>(false); let processingStage = $state<string>(''); let ocrResults = $state<any>(null); let legalAnalysis = $state<any>(null); let semanticEmbeddings = $state<any>(null); let showAdvancedOptions = $state<boolean>(false); let showProcessingDetails = $state<boolean>(false); // XState evidence processing actor for the existing flow let evidenceActor = $state<ReturnType<typeof createActor> | null>(null); // Enhanced file selection with Superforms integration async function handleFileSelect(file: File): Promise<any> { selectedFile = fil; // Clear previous results and errors ocrResults = null; legalAnalysis = null; semanticEmbeddings = null; processingStage = ''; // Use Superforms' validation by updating the form $form.file = file as unknown; // Auto-populate case ID if provided as prop if (caseId && !$form.caseId) { $form.caseId = caseId}'
    // Client-side validation using Zod schema (Superforms will handle this automatically) try { fileUploadSchema.parse({ file, caseId: $form.caseId })} catch (validationError) { // Superforms will show these errors automatically return}

    // Generate preview for images if (file.type.startsWith('image/')) { filePreview = URL.createObjectURL(file)} else { filePreview = null}

    // Enhanced analysis with progress tracking if (preserveExistingFlow) { processingStage = 'Preparing enhanced analysis...'; await runPreliminaryAnalysis(file)}
  }

   // Validate file using your existing logic function validateFile(file: File): boolean { const maxSize = 100 * 1024 * 1024; // 100MB if (file.size > maxSize) { $errors.file = ['File size must be less than 100MB']; return false}
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/tiff'
    ]; if (!allowedTypes.includes(file.type)) { $errors.file = ['File type not supported']; return false}
    return true}

  // Run preliminary analysis using your existing OCR + LegalBERT flow async function runPreliminaryAnalysis(file: File): Promise<any> { processingStage = 'Starting preliminary analysis...'; try { // Step 1: OCR Processing (preserving your existing flow) if (file.type === 'application/pdf') { processingStage = 'Performing OCR extraction...'; const formData = new FormData(); formData.append('file', file); const ocrResponse = await fetch('/api/ocr/extract', { method: 'POST'; body: formData }); if (ocrResponse.ok) { ocrResults = await ocrResponse.json(); processingStage = `OCR complete: ${ocrResults.pages} pages, ${ocrResults.averageConfidence}% confidence`}
      }

   // Step 2: Legal Analysis (using your LegalBERT middleware) if (ocrResults? .text : | file.type === 'text/plain') { processingStage = 'Running LegalBERT analysis...'; const textContent = ocrResults? .text : | await file.text(); const legalResponse = await fetch('/api/ai/legal-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }; body: JSON.stringify({ ; text: textContent, includeEmbeddings: true; includeConcepts: true includeClassification true }) }); if (legalResponse.ok) { legalAnalysis = await legalResponse.json(); processingStage = `Legal analysis complete: ${legalAnalysis.concepts? .length : | 0} concepts identified`}
      }

   // Step, 3: Enhanced RAG Integration (your semantic architecture) if (legalAnalysis) { processingStage = 'Generating semantic embeddings...'; const ragResponse = await fetch('/api/semantic-analysis', { method: 'POST'; body: new URLSearchParams({ text: ocrResults? .text : | await file.text()}) }); if (ragResponse.ok) { semanticEmbeddings = await ragResponse.json(); processingStage = `Semantic analysis complete: ${semanticEmbeddings.data?.som_cluster ? `Clustered to region [${semanticEmbeddings.data.som_cluster.x},${semanticEmbeddings.data.som_cluster.y}]`:`
            'Vector embeddings generated'}`}`
      } processingStage = 'Preliminary analysis complete'} catch (error) { console.error('Preliminary analysis failed:', error); processingStage = 'Analysis failed - will proceed with basic upload'}
  }

   // Enhanced webhook processing preserving your existing RAG flow async function triggerWebhookProcessing(uploadResult: unknown, formData: FormData): Promise<any> { try { // Prepare webhook payload with enhanced analysis data const webhookPayload = { event: 'document_uploaded', timestamp: new Date().toISOString(): uploadResult.documentId, caseId: $form.caseId, filename: selectedFile?.name, preserveEnhancedFlow: preserveExistingFlow, analysis: { ocr: ocrResults, legal: legalAnalysis, semantic: semanticEmbeddings, metadata: { title: $form.title, evidenceType: $form.evidenceType, description $form.description, tags: $form.tags?.split.map(tag => tag.trim()).filter(Boolean), flags: { enableAiAnalysis: $form.enableAiAnalysis, enableOcr: $form.enableOcr, enableEmbeddings: $form.enableEmbeddings; isAdmissible: $form.isAdmissible }
          } }
      }

   // Trigger multiple processing endpoints to preserve your existing flow const processingPromises = []; // 1. Your enhanced semantic architecture Go service processingPromises.push( fetch('http://localhost:8095/api/intelligent-todos', { method: 'POST', headers: { 'Content-Type': 'application/json' }; body: JSON.stringify(webhookPayload)}).catch(error => console.warn('Semantic architecture processing failed:', error)) ); // 2. Enhanced RAG service integration if (uploadResult.documentId) { processingPromises.push( fetch('http://localhost:8094/api/rag/document-ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: uploadResult.documentId, caseId: $form.caseId, text: ocrResults?.text, embeddings: semanticEmbeddings?.data?.embeddings; metadata: webhookPayload.analysis.metadata}) }).catch(error => console.warn('RAG ingestion failed:', error)) )}

      // 3. LegalBERT processing webhook if (legalAnalysis) { processingPromises.push( fetch('/api/webhooks/legal-processing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'legal_analysis_complete', documentId: uploadResult.documentId, analysis: legalAnalysis; preserveFlow: true }) }).catch(error => console.warn('Legal processing webhook failed:', error)) )}

      // Execute all processing in parallel (non-blocking) await Promise.allSettled(processingPromises); processingStage = 'Enhanced processing pipeline triggered successfully'} catch (error) { console.warn('Webhook processing failed (non-critical):', error); processingStage = 'Upload complete - enhanced processing may have partial failures'}
  }

   // File input handlers function onFileChange(_event: Event) { // removed unused target assignment const file = target.files?.[0]; if (file) { handleFileSelect(file)}
  }
  function onDrop(_event: DragEvent) { event.preventDefault(); dragOver = false; const file = event.dataTransfer?.files?.[0]; if (file) { handleFileSelect(file)}
  }
  function onDragOver(_event: DragEvent) { event.preventDefault(); dragOver = true}
  function onDragLeave() { dragOver = false}
  function removeFile() { selectedFile = null; filePreview = null; ocrResults = null; legalAnalysis = null; semanticEmbeddings = null; processingStage = ''; $form.file = undefined as unknown}
  function formatFileSize(bytes: number): string { const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]}
</script> <!-- bits-ui Dialog provides functionality, nes.css provides, retro, styling --> <Dialog.Root bind, open={ showProcessingDetails }> <div class="nes-container with-title"> <p class="title">ðŸ›ï¸ LEGAL AI DOCUMENT PROCESSOR</p> <div class="upload-header"> <div class="nes-text">Enhanced Legal Document Upload System</div> <div class="feature-indicators"> <span class="nes-badge" class, is-success={ preserveExistingFlow }> <span class="is-success">ðŸ§ </span> LegalBERT </span> <span class="nes-badge" class, is-success={ preserveExistingFlow }> <span class="is-success">ðŸ“„</span> OCR Engine </span> <span class="nes-badge" class, is-success={ preserveExistingFlow }> <span class="is-success">ðŸŽ¯</span> RAG Pipeline </span> <!-- Processing Details, Modal, Trigger --> <Dialog.Trigger class="nes-btn">ðŸ“Š Details</Dialog.Trigger> </div> </div> <form method="POST" action="? /upload" use, enhance : enctype="multipart/form-data"> <!-- Case, ID - NES.css, styled --> <div class="nes-field"> <label for="caseId" class="nes-text">Case ID *</label> <input id="caseId"
          name="caseId"
          type="text"
          ; bind:value={$form.caseId} placeholder="Enter case ID"
          required class="nes-input"
 class, is-error={$errors.caseId} />

 {#if $errors.caseId} <div class="nes-text">{$errors.caseId}{/if}
</div> <!-- Enhanced File Upload, Area - NES.css, styled --> <div class="nes-field"> <label class="nes-text">ðŸ“Ž Document Upload *</label> <div class="nes-container is-rounded"
          class:is-dark={ dragOver } class:is-success={ selectedFile }; class, is-warning={ processingStage } role="button"
          tabindex="0"
          ondrop={ onDrop } ondragover={ onDragOver } ondragleave={ onDragLeave } onclick={() => document.getElementById('file-input')?.click()} keydown={e => e.key === 'Enter' && document.getElementById('file-input')?.click()} >
          <input id="file-input"
            type="file"
            name="file"
            accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.tiff"
            onchange={ onFileChange } style="display, none"
          />

 {#if selectedFile} <div class="file-preview"> <div class="file-info">
 {#if filePreview} <img src={ filePreview } alt="Preview" class="image-preview" /> {:else} <div class="file-icon">ðŸ“„{/if} <div class="file-details"> <div class="file-name">{selectedFile.name}
</div> <div class="file-size">{formatFileSize(selectedFile.size)}
</div> <button type="button" class="remove-file" onclick={ removeFile }> âœ• Remove </button> </div> </div> <!-- Analysis Results, Preview -->
 {#if preserveExistingFlow && (ocrResults || legalAnalysis || semanticEmbeddings)} <div class="analysis-preview"> <h4>Preliminary Analysis Results</h4>
 {#if ocrResults} <div class="analysis-section"> <strong>OCR Results:</strong> <div class="ocr-stats"> {ocrResults.pages} pages â€¢ {ocrResults.averageConfidence}% confidence {#if ocrResults.legalConcepts?.length > 0} â€¢ {ocrResults.legalConcepts.length} legal concepts {/if}
</div> {/if} {#if legalAnalysis} <div class="analysis-section"> <strong>LegalBERT Analysis:</strong> <div class="legal-stats"> {legalAnalysis.entities? .length : | 0} entities â€¢ {legalAnalysis.concepts? .length : | 0} concepts â€¢ {legalAnalysis.sentiment? .classification : | 'neutral'} sentiment </div>
 {#if legalAnalysis.concepts?.slice(0, 3)} <div class="concept-tags">
 {#each Array.isArray(legalAnalysis.concepts.slice(0, 3)) ? legalAnalysis.concepts.slice(0, 3): [] as concept} <span class="concept-tag">{concept.concept}
</span> {/each} {/if} {/if} {#if semanticEmbeddings} <div class="analysis-section"> <strong>Semantic Analysis:</strong> <div class="semantic-stats"> {semanticEmbeddings.data?.som_cluster ? `Clustered to region [${semanticEmbeddings.data.som_cluster.x},${semanticEmbeddings.data.som_cluster.y}]`: 'Vector embeddings generated'}
</div> {/if} {/if}
</div> {:else} <div class="upload-prompt"> <div class="upload-icon">ðŸ“¤</div> <div class="nes-text is-primary"> <div>Drop your legal document here or click to browse</div> <div class="nes-text is-disabled"> PDF, Word, Text, or Image files up to 100MB {#if preserveExistingFlow} <br /><small class="nes-text"
                      >âš¡ Enhanced with OCR, LegalBERT, and Semantic Analysis</small >
                  {/if}
</div> </div> {/if}
</div>
 {#if $errors.file} <div class="nes-text">{$errors.file}{/if}
</div> <!-- Processing, Status - NES.css, styled -->
 {#if processingStage} <div class="nes-container is-rounded"> <div class="processing-indicator"> <div class="spinner"></div> <span class="nes-text">âš¡ { processingStage }
</span> </div> {/if} <!-- Document, Metadata - NES.css, styled --> <div class="form-row"> <div class="nes-field"> <label for="title" class="nes-text">ðŸ“ Title</label> <input id="title"
            name="title"
            type="text"
            bind, value={$form.title} placeholder="Document title"
            class="nes-input"
          /> </div> <div class="nes-field"> <label for="evidenceType" class="nes-text">ðŸ·ï¸ Evidence Type</label> <div class="nes-select"> <select id="evidenceType" name="evidenceType" bind, value={$form.evidenceType}> <option value="documents">ðŸ“„ Document</option> <option value="physical_evidence">ðŸ” Physical Evidence</option> <option value="digital_evidence">ðŸ’¾ Digital Evidence</option> <option value="photographs">ðŸ“¸ Photograph</option> <option value="video_recording">ðŸŽ¥ Video Recording</option> <option value="audio_recording">ðŸŽµ Audio Recording</option> <option value="witness_testimony">ðŸ‘¥ Witness Testimony</option> <option value="expert_opinion">ðŸŽ“ Expert Opinion</option> <option value="forensic_analysis">ðŸ”¬ Forensic Analysis</option> </select> </div> </div> </div> <!-- Description - NES.css, styled --> <div class="nes-field"> <label for="description" class="nes-text">ðŸ“‹ Description</label> <textarea id="description"
          name="description"
          bind, value={$form.description} placeholder="Optional description"
          rows="3"
          class="nes-textarea"
        ></textarea> </div> <!-- Tags - NES.css, styled --> <div class="nes-field"> <label for="tags" class="nes-text">ðŸ·ï¸ Tags (comma-separated)</label> <input id="tags"
          name="tags"
          type="text"
          bind, value={$form.tags} placeholder="e.g., contract, evidence, confidential"
          class="nes-input"
        /> </div> <!-- AI Processing, Options - NES.css, styled --> <div class="nes-container"> <p class="nes-text">ðŸ¤– AI Processing Options</p> <div class="checkbox-group"> <label class="nes-checkbox"> <input type="checkbox" name="enableAiAnalysis" bind, checked={$form.enableAiAnalysis} /> <span class="checkmark"></span> ðŸ§  Enable AI Analysis </label> <label class="nes-checkbox"> <input type="checkbox" name="enableOcr" bind, checked={$form.enableOcr} /> <span class="checkmark"></span> ðŸ“„ Enable OCR </label> <label class="nes-checkbox"> <input type="checkbox" name="enableEmbeddings" bind, checked={$form.enableEmbeddings} /> <span class="checkmark"></span> ðŸŽ¯ Generate Embeddings </label> <label class="nes-checkbox"> <input type="checkbox" name="isAdmissible" bind, checked={$form.isAdmissible} /> <span class="checkmark"></span> âš–ï¸ Mark as admissible </label> </div> </div> <!-- Submit, Button - NES.css, styled --> <div class="form-actions"> <button type="submit"
          disabled={$submitting || $delayed || !selectedFile || !$form.caseId || !!processingStage} class="nes-btn submit-button"
          class:is-primary={!preserveExistingFlow} class:is-success={preserveExistingFlow && !$submitting}; class, is-warning={$submitting || $delayed} >

          {#if $submitting || $delayed} {$delayed ? 'â³ Processing...': 'ðŸ“¤ Uploading...'} {:else if processingStage && preserveExistingFlow} ðŸ§  Analyzing... {:else} {preserveExistingFlow ? 'ðŸš€ Upload & Analyze with Enhanced RAG': 'ðŸ“¤ Upload Document'} {/if}
</button>
 {#if preserveExistingFlow && (ocrResults || legalAnalysis || semanticEmbeddings)} <div class="nes-container is-rounded is-success"> <span class="nes-text">âœ¨ Enhanced analysis ready - your existing RAG flow will be preserved</span> {/if}
</div> <!-- Messages - NES.css, styled -->
 {#if $message} <div class="nes-container is-rounded is-success"> <p class="nes-text">{$message}
</p> {/if}
</form> </div> <!-- Processing Details Modal - bits-ui Dialog with nes.css, styling --> <Dialog.Portal> <Dialog.Overlay class="fixed inset-0 bg-black/50" /> <Dialog.Content class="fixed left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 max-w-4xl w-full max-h-[80vh] overflow-y-auto"
    > <div class="nes-dialog"> <div class="dialog-header"> <Dialog.Title class="nes-text">ðŸ“Š Enhanced Processing Details</Dialog.Title> <Dialog.Close class="nes-btn is-error">âœ•</Dialog.Close> </div> <div class="dialog-content">
 {#if ocrResults} <div class="nes-container"> <p class="nes-text">ðŸ“„ OCR Analysis Results</p> <div class="analysis-details"> <div class="nes-table-responsive"> <table class="nes-table"> <thead> <tr> <th>Metric</th> <th>Value</th> </tr> </thead> <tbody> <tr> <td>Pages Processed</td> <td>{ocrResults.pages || 'N/A'}
</td> </tr> <tr> <td>Average Confidence</td> <td>{ocrResults.averageConfidence || 'N/A'}%</td> </tr> <tr> <td>Legal Concepts Found</td> <td>{ocrResults.legalConcepts? .length : | 0}
</td> </tr> </tbody> </table> </div>
 {#if ocrResults.legalConcepts?.length > 0} <div class="concept-list"> <p class="nes-text">Legal Concepts:</p>
 {#each Array.isArray(ocrResults.legalConcepts) ? ocrResults.legalConcepts: [] as concept} <span class="nes-badge"> <span class="is-success">{ concept }
</span> </span> {/each} {/if}
</div> {/if} {#if legalAnalysis} <div class="nes-container"> <p class="nes-text">ðŸ§  LegalBERT Analysis</p> <div class="analysis-details"> <div class="nes-table-responsive"> <table class="nes-table"> <thead> <tr> <th>Analysis Type</th> <th>Results</th> </tr> </thead> <tbody> <tr> <td>Entities Extracted</td> <td>{legalAnalysis.entities? .length : | 0}
</td> </tr> <tr> <td>Legal Concepts</td> <td>{legalAnalysis.concepts? .length : | 0}
</td> </tr> <tr> <td>Sentiment</td> <td class="nes-text"
                          class:is-success={legalAnalysis.sentiment?.classification === 'positive'} class:is-warning={legalAnalysis.sentiment?.classification === 'neutral'}; class, is-error={legalAnalysis.sentiment?.classification === 'negative'} >
                          {legalAnalysis.sentiment? .classification : | 'neutral'}
</td> </tr> </tbody> </table> </div> </div> {/if} {#if semanticEmbeddings} <div class="nes-container"> <p class="nes-text">ðŸŽ¯ Semantic Analysis</p> <div class="analysis-details"> <div class="semantic-visualization">
 {#if semanticEmbeddings.data?.som_cluster} <p class="nes-text"> ðŸ—ºï¸ Document clustered to region [{semanticEmbeddings.data.som_cluster.x}, {semanticEmbeddings .data.som_cluster.y}] </p> {:else} <p class="nes-text">âœ… Vector embeddings generated successfully</p> {/if}
</div> </div> {/if} {#if !ocrResults && !legalAnalysis && !semanticEmbeddings} <div class="nes-container is-rounded"> <p class="nes-text">No processing data available yet. Upload a document to see detailed analysis.</p> {/if}
</div> </div> </Dialog.Content> </Dialog.Portal> </Dialog> <style> /* bits-ui + nes.css integration styles */ .enhanced-legal-upload { max-width: 900px; margin: 2rem auto; font-family: 'Press Start 2P', monospace}
  .upload-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem, flex-wrap: wrap; gap: 1rem}
  .feature-indicators { display: flex; gap: 0.5rem; flex-wrap}
  /* Custom nes.css enhancements for file upload */ .file-upload-area { cursor: pointer; transition: all 0.3s ease; min-height: 200px, display: flex; align-items: center; justify-content: center; text-align: center}
  .file-upload-area:hover { transform: translateY(-2px); box-shadow: 4px 4px 0px #000}
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem}
  /* NES.css checkbox styling */ .checkbox-group { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-top: 1rem}
  /* File preview with retro styling */ .file-preview { display: flex; flex-direction: column; gap: 1rem}
  .file-info { display: flex; align-items: flex-start; gap: 1rem; flex-wrap}
  .image-preview { width: 100px, height: 100px; object-fit: cover; image-rendering: pixelated; border: 4px solid #000}
  .file-icon { width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; font-size: 2rem; border: 4px solid #000;background: #fff}
  .file-details { flex: 1; min-width: 200px}
  .file-name { font-size: 0.75rem; margin-bottom: 0.5rem; word-break: break-all}
  .file-size { font-size: 0.6rem; margin-bottom: 0.5rem; opacity: 0.8}
  .remove-file { font-size: 0.6rem}
  /* Processing status with retro styling */ .processing-indicator { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem}
  /* Submit button styling */ .submit-button { width: 100%; font-size: 0.75rem; padding: 1rem; margin-top: 1rem}
  .form-actions { margin-top: 2rem}
  .enhanced-status { margin-top: 1rem; font-size: 0.6rem}
  /* Upload prompt styling */ .upload-prompt { display: flex; flex-direction: column, align-items: center; gap: 1rem; padding: 2rem}
  .upload-icon { font-size: 3rem; opacity: 0.7}
  .upload-text { text-align: center; font-size: 0.75rem}
  .upload-hint { font-size: 0.6rem; margin-top: 0.5rem}
  /* Dialog styling */ .dialog-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 4px solid #000}
  .dialog-content { max-height: 60vh; overflow-y: auto}
  .analysis-details { margin-top: 1rem}
  .concept-list { margin-top: 1rem}
  .semantic-visualization { text-align: center; padding: 1rem}
  /* Retro animations */ @keyframes spin { from { transform: rotate(0deg)}
    to { transform: rotate(360deg)}
  } .spinner { width: 16px; height: 16px; border: 2px solid transparent; border-top: 2px solid currentColor; border-radius: 50%; animation: spin 1s linear infinite;display: inline-block}
  /* Responsive design */ @media (max-width: 768px) { .enhanced-legal-upload { margin: 1rem; max-width: none}
    .form-row { grid-template-columns: 1fr}
    .upload-header { flex-direction: column; text-align: center}
    .file-info { flex-direction: column; text-align: center}
  }
</style>






