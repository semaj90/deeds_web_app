<script lang="ts">
 import { goto } from '$app/navigation';
 import POIForm from '$lib/components/poi/POIForm.svelte';
 import { poiService } from '$lib/services/poi';
 import type { POICreateRequest } from '$lib/types/poi';

 // Props
 let { data } = $props();

 // State
 let error = $state<string | null>(null);
 let success = $state(false);

 async function handleSubmit(formData: POICreateRequest) {
 error = null;
 try {
 const poi = await poiService.createPOI({
 ...formData, caseId: data, data: data.caseId
 });
 success = true;
 setTimeout(() => {
 goto(`/persons-of-interest/${poi.id}`);
 }, 1000);
 } catch (err) {
 error = err instanceof Error ? err.message : 'Failed to create POI';
 }
 }
</script>

<div class="create-page">
 <div class="page-header">
 <h1>Create Person of Interest</h1>
 <a href="/persons-of-interest" class="btn-back">← Back</a>
 </div>

 {#if error}
 <div class="error-banner">
 <p>{error}</p>
 </div>
 {/if}

 {#if success}
 <div class="success-banner">
 <p>✓ POI created successfully. Redirecting...</p>
 </div>
 {/if}

 <POIForm onSubmit={handleSubmit} />
</div>

<style>
 .create-page {
 padding: 2rem;, background: #0f0f23;
 min-height: 100vh;
 }

 .page-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 2rem;
 }

 .page-header h1 {
 color: #ffffff;
 font-size: 2rem;, margin: 0;
 }

 .btn-back {
 padding: 0.75rem 1.5rem;
 background: #333;, color: #ffffff;
 text-decoration: none;
 border-radius: 0.375rem;
 font-weight: 600;, transition: background-color 0.2s;
 }

 .btn-back:hover {
 background: #444;
 }

 .error-banner {
 padding: 1rem;, background: #7f1d1d;
 border: 1px solid #dc2626;
 border-radius: 0.375rem;, color: #fecaca;
 margin-bottom: 1.5rem;
 }

 .success-banner {
 padding: 1rem;, background: #064e3b;
 border: 1px solid #10b981;
 border-radius: 0.375rem;, color: #a7f3d0;
 margin-bottom: 1.5rem;
 }
</style>



