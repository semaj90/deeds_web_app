<script lang="ts">
 import { createEventDispatcher } from 'svelte';
 // Migrated from createEventDispatcher to callback props;

 const dispatch = createEventDispatcher();

 let isDragOver = $state(false);
 let uploadedFiles: File[] = $state([]);
 let uploadProgress = $state(0);
 let isUploading = $state(false);

 function handleDragOver(event: DragEvent) {
 event.preventDefault();
 isDragOver = true;
 }

 function handleDragLeave(event: DragEvent) {
 event.preventDefault();
 isDragOver = false;
 }

 function handleDrop(event: DragEvent) {
 event.preventDefault();
 isDragOver = false;

 const files = Array.from(event.dataTransfer?.files || []);
 handleFiles(files);
 }

 function handleFileSelect(event: Event) {
 const input = event.target as HTMLInputElement;
 const files = Array.from(input.files || []);
 handleFiles(files);
 }

 function handleFiles(files: File[]) {
 // Filter for supported file types
 const supportedTypes = [
 'application/pdf',
 'application/msword',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-excel',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'message/rfc822',
 'video/mp4',
 'video/avi',
 'video/quicktime',
 'image/jpeg',
 'image/png',
 'image/gif'
 ];

 const validFiles = files.filter(file => supportedTypes.includes(file.type));

 if (validFiles.length !== files.length) {
 console.warn(`${files.length - validFiles.length} files were skipped due to unsupported format`);
 }

 uploadedFiles = [...uploadedFiles, ...validFiles];
 dispatch('filesAdded', { files: validFiles });
 }

 function removeFile(index: number) {
 uploadedFiles = uploadedFiles.filter((_, i) => i !== index);
 }

 async function uploadFiles() {
 if (uploadedFiles.length === 0) return;

 isUploading = true;
 uploadProgress = 0;

 // Simulate upload process
 for (let i = 0; i <= 100; i += 10) {
 await new Promise(resolve => setTimeout(resolve, 200));
 uploadProgress = i;
 }

 // Dispatch upload complete event
 dispatch('uploadComplete', { files: uploadedFiles });
  
 uploadedFiles = [];
 isUploading = false;
 uploadProgress = 0;
 }

 function formatFileSize(bytes: number): string {
 if (bytes === 0) return '0 Bytes';
 const k = 1024;
 const sizes = ['Bytes', 'KB', 'MB', 'GB'];
 const i = Math.floor(Math.log(bytes) / Math.log(k));
 return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
 }

 function getFileIcon(type: string): string {
 if (type.startsWith('application/pdf')) return '📄';
 if (type.includes('word')) return '📝';
 if (type.includes('excel') || type.includes('spreadsheet')) return '📊';
 if (type.startsWith('message/')) return '📧';
 if (type.startsWith('video/')) return '🎥';
 if (type.startsWith('image/')) return '🖼️';
 return '📄';
 }
</script>

<div class="bg-slate-800/50 backdrop-blur rounded-lg p-6 border border-slate-700/50">
 <!-- Upload Zone -->
 <div
 class="border-2 border-dashed rounded-lg p-8 text-center transition-colors {isDragOver ? 'border-cyan-400 bg-cyan-400/10' : 'border-slate-600 hover:border-slate-500'}"
 role="region"
 ondragover={handleDragOver}
 ondragleave={handleDragLeave}
 ondrop={handleDrop}
 >
 <div class="mb-4">
 <div class="text-4xl mb-4">📁</div>
 <h3 class="text-lg font-medium text-white mb-2">Upload Evidence Files</h3>
 <p class="text-slate-400 text-sm">
 Drag and drop files here, or click to browse
 </p>
 </div>

 <input
 type="file"
 multiple
 accept=".pdf,.doc,.docx,.xls,.xlsx,.eml,.mp4,.avi,.mov,.jpg,.png,.gif"
 class="hidden"
 id="file-input"
 onchange={handleFileSelect}
 />

 <label
 for="file-input"
 class="inline-flex items-center px-4 py-2 bg-cyan-400/20 hover:bg-cyan-400/30 text-cyan-400 rounded-lg cursor-pointer transition-colors"
 >
 <span class="mr-2">📎</span>
 Choose Files
 </label>

 <div class="mt-4 text-xs text-slate-500">
 Supported: PDF, Word, Excel, Email, Video, Images
 </div>
 </div>

 <!-- File List -->
 {#if uploadedFiles.length > 0}
 <div class="mt-6">
 <div class="flex items-center justify-between mb-4">
 <h4 class="text-sm font-medium text-slate-300">Files to Upload ({uploadedFiles.length})</h4>
 <button
 class="px-4 py-2 bg-green-400/20 hover:bg-green-400/30 text-green-400 text-sm rounded-lg transition-colors disabled:opacity-50"
 disabled={isUploading}
 onclick={uploadFiles}
 >
 {isUploading ? 'Uploading...' : 'Upload All'}
 </button>
 </div>

 <!-- Upload Progress -->
 {#if isUploading}
 <div class="mb-4">
 <div class="flex justify-between text-sm mb-1">
 <span class="text-slate-300">Uploading files...</span>
 <span class="text-cyan-400">{uploadProgress}%</span>
 </div>
 <div class="w-full bg-slate-600 rounded-full h-2">
 <div
 class="h-2 rounded-full bg-cyan-400 transition-all duration-300"
 style="width: {uploadProgress}%"
 ></div>
 </div>
 </div>
 {/if}

 <!-- File List -->
 <div class="space-y-2 max-h-64 overflow-y-auto">
 {#each uploadedFiles as file, index}
 <div class="flex items-center justify-between bg-slate-700/30 rounded-lg p-3">
 <div class="flex items-center space-x-3 flex-1 min-w-0">
 <span class="text-lg">{getFileIcon(file.type)}</span>
 <div class="flex-1 min-w-0">
 <div class="font-medium text-white text-sm truncate">{file.name}</div>
 <div class="text-xs text-slate-400">{formatFileSize(file.size)}</div>
 </div>
 </div>
 <button
 class="p-1 text-slate-400 hover:text-red-400 transition-colors"
 onclick={() => removeFile(index)}
 disabled={isUploading}
 >
 ✕
 </button>
 </div>
 {/each}
 </div>
 </div>
 {/if}

 <!-- Upload Tips -->
 <div class="mt-6 pt-4 border-t border-slate-700/50">
 <h4 class="text-sm font-medium text-slate-300 mb-2">Upload Tips</h4>
 <ul class="text-xs text-slate-400 space-y-1">
 <li>• Maximum file size: 100MB per file</li>
 <li>• Files are automatically scanned for viruses</li>
 <li>• AI analysis begins immediately after upload</li>
 <li>• All uploads are encrypted and stored securely</li>
 </ul>
 </div>
</div>
