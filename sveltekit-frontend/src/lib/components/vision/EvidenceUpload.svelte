<script lang="ts">
 import { uploadEvidenceImage, uploadEvidenceVideo } from '$lib/vision/api';

 let { onupdated }: { onupdated?: (data: any) => void } = $props();

 let caseId = $state('');
 let evidenceId = $state('');
 let isUploading = $state(false);

 async function handleImageUpload(e: Event) {
 const files = (e.target as HTMLInputElement).files;
 if (!files?.length) return;

 isUploading = true;

 try {
 const results = [];
 for (const file of files) {
 const fd = new FormData();
 fd.append('file', file);
 fd.append('case_id', caseId);
 fd.append('evidence_id', evidenceId);

 const res = await uploadEvidenceImage(fd);

 results.push({
 embeddingId: res.qdrant_id,
 thumbUrl: `/minio/${res.object_key}`,
 embedding: res.vector ?? null
 });
 }

 onupdated?.(results);
 } catch (error) {
 console.error('Image upload failed:', error);
 // TODO: Show error toast
 } finally {
 isUploading = false;
 }
 }

 async function handleVideoUpload(e: Event) {
 const files = (e.target as HTMLInputElement).files;
 if (!files?.length) return;

 isUploading = true;

 try {
 const results = [];

 for (const file of files) {
 const fd = new FormData();
 fd.append('file', file);
 fd.append('case_id', caseId);
 fd.append('evidence_id', evidenceId);

 const res = await uploadEvidenceVideo(fd);

 for (const f of res.frames) {
          results.push({
            embeddingId: f.qdrant_id,
            thumbUrl: `/minio/${f.thumb_key}`,
            frameIndex: f.frame_index,
            timestamp: f.timestamp_ms,
            embedding: null // fetched via similarity-search if needed
          });
 }
 }

 onupdated?.(results);
 } catch (error) {
 console.error('Video upload failed:', error);
 // TODO: Show error toast
 } finally {
 isUploading = false;
 }
 }
</script>

<div class="p-4 border-2 border-black bg-[#f4e7c7]">
 <h2 class="text-lg font-bold mb-2">Upload Evidence</h2>

 <div class="flex flex-col gap-2 mb-4">
 <input
 bind:value={caseId}
 placeholder="Case ID"
 class="border px-2 py-1"
 />
 <input
 bind:value={evidenceId}
 placeholder="Evidence ID"
 class="border px-2 py-1"
 />
 </div>

 <div class="flex flex-col gap-3">
 <div>
 <label class="font-semibold">Images</label>
 <input
 type="file"
 accept="image/*"
 multiple
 onchange={handleImageUpload}
 disabled={isUploading}
 class="block w-full"
 />
 </div>

 <div>
 <label class="font-semibold">Videos</label>
 <input
 type="file"
 accept="video/*"
 multiple
 onchange={handleVideoUpload}
 disabled={isUploading}
 class="block w-full"
 />
 </div>
 </div>

 {#if isUploading}
 <div class="mt-3 text-sm animate-pulse">Uploading…</div>
 {/if}
</div>
