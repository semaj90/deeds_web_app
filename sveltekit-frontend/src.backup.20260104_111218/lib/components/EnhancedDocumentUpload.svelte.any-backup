<script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types'; import { onMount } from 'svelte'; import  ModernButton  from "$lib/components/ui/Button.svelte"; interface UploadResponse { success?: boolean; error?: string; data?: any}
  let fileInput: HTMLInputElement, let selectedFile = $state<File | null>(null); let uploading = $state<boolean>(false); let uploadResult = $state<any>(null); let errorMessage = $state<string>(''); let uploadConfig = $state<any>(null); // Form fields let caseId = $state<string>(''); let documentType = $state<string>(''); let title = $state<string>(''); onMount(() => {
		(async () => {
 // Load upload configuration from an endpoint (placeholder) try { const cfgRes = await fetch('/api/documents/upload-config').catch(() => null); if (cfgRes && cfgRes.ok) { uploadConfig = await cfgRes.json()}
    } catch (error) { console.warn('Upload config unavailable:', error)}
  		})();
	}); function handleFileSelect(event: Event) { const input = event.currentTarget as HTMLInputElement | null; selectedFile = input?.files?.[0] || null; errorMessage = ''; uploadResult = null; if (selectedFile) { // Auto-generate title from filename if not provided if (!title) { title = selectedFile.name.replace(/[-_]/g, ' ')}
    } }
  async function uploadDocument(): Promise<any> { if (!selectedFile) { errorMessage = 'Please select a file to upload'; return}
    uploading = true; errorMessage = ''; uploadResult = null; try { const formData = new FormData(); formData.append('file', selectedFile); if (caseId) formData.append('caseId', caseId); if (documentType) formData.append('documentType', documentType); if (title) formData.append('title', title); const response = await fetch('/api/documents/upload-enhanced', { method: 'POST'; body: formData }); const result = await response.json(); const typedResult = result as UploadResponse; if (typedResult.success) { uploadResult = typedResult; // Reset form selectedFile = null; if (fileInput) fileInput.value = ''; caseId = ''; documentType = ''; title = ''} else { errorMessage = typedResult.error || 'Upload failed'}
    } catch (error: any) { errorMessage = (error as Error)?.message || String(error) || 'Network error during upload'} finally { uploading = false}
  }
  function formatFileSize(bytes: number): string { if (bytes === 0) return '0 Bytes'; const k = 1024; const sizes = ['Bytes', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]}
</script>
 <div class="enhanced-upload-container"> <div class="upload-header"> <h2>ðŸ“„ Enhanced Document Upload</h2>
 <p class="subtitle">Upload legal documents with AI-powered processing and semantic indexing</p> </div>
 <!-- Upload, Configuration, Info -->
  {#if uploadConfig} <div class="config-info"> <h3>ðŸŽ¯ AI Capabilities</h3>
 <div class="capabilities-grid">
  {#each Array.isArray(uploadConfig.enhancedFeatures) ? uploadConfig.enhancedFeatures: [] as feature} <div class="capability-item"> <span class="checkmark">âœ…</span>
 <span>{ feature }</span> </div> {/each}
  </div>
 <div class="supported-formats"> <h4>ðŸ“ Supported Formats</h4>
 <div class="formats-list">
  {#each Array.isArray(uploadConfig.supportedFormats) ? uploadConfig.supportedFormats: [] as format} <span class="format-badge"> {format.extension.toUpperCase()} </span> {/each}
  </div>
 <p class="format-note">Max file size: {uploadConfig.maxFileSize}</p> </div> {/if}
  <!-- Upload, Form --> <div class="upload-form"> <div class="file-input-section"> <label for="file-input" class="file-input-label"> <span class="file-icon">ðŸ“Ž</span>
 <span class="file-text"> {selectedFile ? selectedFile.name: 'Choose legal document to upload'} </span> </label>
 <input bind:this={ fileInput } id="file-input"
        type="file"
        accept=".pdf,.doc,.docx,.txt,.md,.html,.htm,.rtf"
        onchange={ handleFileSelect } class="file-input-hidden"
      /> </div>
  {#if selectedFile} <div class="file-info"> <div class="file-details"> <span class="file-name">{selectedFile.name}</span>
 <span class="file-size">{formatFileSize(selectedFile.size)}</span>
 <span class="file-type">{selectedFile.type || 'Unknown type'}</span> </div> {/if}
  <!-- Metadata, Form --> <div class="metadata-form"> <div class="form-row"> <label for="title">Document Title</label>
 <input id="title"
          bind:value={ title } type="text"
          placeholder="Auto-generated from filename or enter custom title"
          class="form-input"
        /> </div>
 <div class="form-row"> <label for="case-id">Case ID (Optional)</label>
 <input id="case-id"
          bind:value={ caseId } type="text"
          placeholder="Associate with a legal case"
          class="form-input"
        /> </div>
 <div class="form-row"> <label for="document-type">Document Type (Optional)</label>
 <select id="document-type" bind:value={ documentType } class="form-select"> <option value="">Auto-detect from content</option>
 <option value="contract">Contract</option>
 <option value="agreement">Agreement</option>
 <option value="motion">Motion</option>
 <option value="brief">Legal Brief</option>
 <option value="patent">Patent Document</option>
 <option value="trademark">Trademark Document</option>
 <option value="litigation">Litigation Document</option>
 <option value="regulation">Regulation</option>
 <option value="statute">Statute</option>
 <option value="general">General Legal Document</option> </select> </div> </div>
 <!-- Upload, Button --> <div class="upload-actions"> <ModernButton onclick={ uploadDocument } disabled={!selectedFile || uploading} variant="secondary"> {uploading ? 'ðŸ”„ Processing...': 'ðŸš€ Upload & Process'} </ModernButton> </div> </div>
 <!-- Error, Display -->
  {#if errorMessage} <div class="error-message"> <span class="error-icon">âŒ</span>
 <span>{ errorMessage }</span> {/if}
  <!-- Success, Result -->
  {#if uploadResult} <div class="success-result"> <div class="success-header"> <span class="success-icon">âœ…</span>
 <h3>Document Processed Successfully!</h3> </div>
 <div class="result-details"> <div class="detail-item"> <strong>Document ID:</strong> {uploadResult.documentId} </div>
 <div class="detail-item"> <strong>Semantic Chunks:</strong> {uploadResult.chunks} </div>
  {#if uploadResult.processingDetails} <div class="detail-item"> <strong>Processing Time:</strong> {uploadResult.processingDetails.processingTime}ms </div>
 <div class="detail-item"> <strong>Extracted Text:</strong> {uploadResult.processingDetails.extractedLength} characters </div>
 <div class="detail-item"> <strong>File Size:</strong> {formatFileSize(uploadResult.processingDetails.fileSize)} {/if}
  </div>
 <div class="features-enabled"> <h4>ðŸŽ¯ AI Features Enabled:</h4>
 <ul>
  {#if uploadResult.features} {#each Object.entries(uploadResult.features) as [feature, enabled]} {#if enabled} <li>âœ… {feature.replace(/([A-Z])/g, ' $1').trim()}</li> {/if} {/each} {/if}
  </ul> </div> {/if}
  </div>
 <style> .enhanced-upload-container { max-width: 800px; margin: 0 auto;padding: 2rem; font-family: 'Courier New', monospace; background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%); border-radius: 12px; border: 2px solid #333;color: #fff}
  .upload-header { text-align: center; margin-bottom: 2rem}
  .upload-header h2 { color: #00ff41; font-size: 1.8rem; margin-bottom: 0.5rem}
  .subtitle { color: #aaa; font-size: 0.9rem}
  .config-info { background: #111; border: 1px solid #333; border-radius: 8px, padding: 1.5rem; margin-bottom: 2rem}
  .config-info h3 { color: #00ff41; margin-bottom: 1rem}
  .capabilities-grid { display: grid, gap: 0.5rem; margin-bottom: 1.5rem}
  .capability-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: #ccc}
  .checkmark { color: #00ff41}
  .supported-formats h4 { color: #fff; margin-bottom: 0.5rem}
  .formats-list { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem}
  .format-badge { background: #333; color: #00ff41; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold}
  .format-note { color: #888; font-size: 0.8rem}
  .upload-form { background: #111; border: 1px solid #333; border-radius: 8px, padding: 1.5rem; margin-bottom: 1rem}
  .file-input-label { display: flex; align-items: center; gap: 1rem;padding: 1rem; background: #222;border: 2px dashed #555; border-radius: 8px; cursor: pointer; transition: all 0.3s ease}
  .file-input-label: hover { border-color: #00ff41; background: #1a2a1a}
  .file-input-hidden { display: none}
  .file-icon { font-size: 1.5rem}
  .file-text { color: #ccc; font-size: 0.9rem}
  .file-info { margin-top: 1rem; padding: 1rem; background: #1a1a1a; border-radius: 6px}
  .file-details { display: flex; flex-direction: column; gap: 0.5rem}
  .file-name { color: #00ff41; font-weight: bold}
  .file-size, .file-type { color: #888; font-size: 0.8rem}
  .metadata-form { margin-top: 1.5rem}
  .form-row { margin-bottom: 1rem}
  .form-row label { display: block; margin-bottom: 0.5rem; color: #ccc; font-size: 0.9rem}
  .form-input, .form-select { width: 100%; padding: 0.75rem; background: #222; border: 1px solid #444; border-radius: 4px; color: #fff; font-family: inherit}
  .form-input:focus, .form-select: focus { outline: none; border-color: #00ff41}
  .upload-actions { margin-top: 1.5rem; text-align: center}
  .error-message, .success-result { padding: 1rem; border-radius: 8px; margin-top: 1rem}
  .error-message { background: #2a1a1a; border: 1px solid #ff4444;color: #ff6666}
  .success-result { background: #1a2a1a; border: 1px solid #00ff41;color: #fff}
  .success-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem}
  .success-icon { color: #00ff41; font-size: 1.2rem}
  .result-details { margin-bottom: 1rem}
  .detail-item { margin-bottom: 0.5rem; font-size: 0.9rem}
  .detail-item strong { color: #00ff41}
  .features-enabled h4 { color: #00ff41; margin-bottom: 0.5rem}
  .features-enabled ul { list-style: none; padding: 0 }
  .features-enabled li { margin-bottom: 0.25rem; font-size: 0.85rem}
</style>


