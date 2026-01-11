<script lang="ts">
 import UploadProgress from '$lib/components/upload/UploadProgress.svelte';
 import type { submitWithProgress } from '$lib/api/submitWithProgress';

 let last = '';
 let metadata = { title: 'My upload', tags: ['demo'] };

 function onDone(e: CustomEvent) {
 last = `Done: status=${(e as CustomEvent).detail.status}`;
 }
 function onProgress(e: CustomEvent) {
 last = `Progress: ${(e as CustomEvent).detail.percent}%`;
 }
 function onError(e: CustomEvent) {
 last = `Error: ${(e as CustomEvent).detail?.message ?? 'unknown'}`;
 }
 async function saveMetadata(): Promise<void> {
 last = 'Saving metadata...';
 try {
 const res = await submitWithProgress('/api/metadata/save', metadata);
 last = `Metadata saved (status=${res.status})`;
 } catch (err) {
 last = `Save failed: ${String(err)}`;
 }
 }
</script>

<main class="page-repair">
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
 .page-repair {
 padding: 2rem;
 font-family: sans-serif;
 }
</style>
