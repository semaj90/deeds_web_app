<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import CaseNotesEditor from '$lib/components/cases/CaseNotesEditor.svelte';
	import ContextualChatModal from '$lib/components/cases/ContextualChatModal.svelte';
	import { onMount } from "svelte";
// Evidence components temporarily disabled for core build
 // TODO: Re-enable after de-minification tool runs
import EvidenceUploadPreview from '$lib/components/evidence/EvidenceUploadPreview.svelte';
import SummaryReviewPanel from '$lib/components/evidence/SummaryReviewPanel.svelte';
// import EvidenceUploadPreview from '$lib/components/evidence/EvidenceUploadPreview.svelte';
 // import SummaryReviewPanel from '$lib/components/evidence/SummaryReviewPanel.svelte';
 import { CacheStrategies, useCache } from '$lib/cache/cache-service.svelte';
 import NesModal from '$lib/components/nes/NesModal.svelte';
 // Migrated to $effect

 const cache = useCache();

 interface Evidence { id: string; fileName: string;
 documentType: string;
	inferenceConfidence: number;
 status: 'pending' | 'approved' | 'rejected';
 createdAt: string;
 metadata?: Record<string, unknown>;
 }

 interface Case { id: string; title: string;
 createdAt: string;
 }

 let caseData = $state<Case | null>(null);
 let evidence = $state<Evidence[]>([]);
 let isLoading = $state(true);
 let error = $state('');
 let isUploading = $state(false);
 let selectedEvidence = $state<Evidence | null>(null);
 let suggestedSummary = $state<any>(null);
 let isGeneratingSummary = $state(false);
 let showNotesPanel = $state(false);
 let showChatModal = $state(false);
 let isExportingPacket = $state(false);
 let exportPacketError = $state('');

 const caseId = page.params.id;

 onMount(async () => {
 await loadCase();
 await loadEvidence();
 });

 const loadCase = async () => {
 try {
 const cacheKey = `case-${caseId}`;

 // Try cache first
 const cached = await cache.get<Case>(cacheKey);
 if (cached) {
 caseData = cached;
 console.log('✅ Cache hit: case-' + caseId);
 return;
 }

 // Cache miss - fetch from API
 const response = await fetch(`/api/cases/${caseId}`);
 if (!response.ok) {
 if (response.status === 401) {
 await goto('/login');
 return;
 }
 throw new Error('Failed to load case');
 }

 const data = await response.json();
 caseData = data;

 // Cache with 5 minute TTL
 await cache.set(cacheKey, data, CacheStrategies.TWO_LAYER);
 console.log('💾 Cached: case-' + caseId);
 } catch (err) {
 error = err instanceof Error ? err.message : 'Failed to load case';
 }
 };

 const loadEvidence = async () => {
 try {
 const cacheKey = `evidence-list-${caseId}`;

 // Try cache first
 const cached = await cache.get<Evidence[]>(cacheKey);
 if (cached) {
 evidence = cached;
 console.log('✅ Cache hit: evidence-list-' + caseId);
 isLoading = false;
 return;
 }

 // Cache miss - fetch from API
 const response = await fetch(`/api/cases/${caseId}/evidence`);
 if (!response.ok) throw new Error('Failed to load evidence');

 const data = await response.json();
 evidence = data;

 // Cache with 10 minute TTL (evidence changes less frequently)
 await cache.set(cacheKey, data, {
 memory: true,
 persistent: true,
 ttl: 600000 // 10 minutes
 });
 console.log('💾 Cached: evidence-list-' + caseId);
 } catch (err) {
 error = err instanceof Error ? err.message : 'Failed to load evidence';
 } finally {
 isLoading = false;
 }
 };

 const handleFileUpload = async (event: Event) => {
 const input = event.target as HTMLInputElement;
 const file = input.files?.[0];
 if (!file) return;

 isUploading = true;
 error = '';

 try {
 const formData = new FormData();
 formData.append('file', file);
 formData.append('caseId', caseId);

 const response = await fetch('/api/evidence/upload', {
 method: 'POST',
 body: formData,
 });

 if (!response.ok) {
 const data = await response.json();
 throw new Error(data.error || 'Upload failed');
 }

 // Invalidate evidence cache before reloading
 await cache.delete(`evidence-list-${caseId}`);
 await cache.delete(`evidence-${caseId}`);
 console.log('🗑️ Cache invalidated: evidence after upload');

 // Reload evidence (will fetch fresh data)
 await loadEvidence();
 input.value = '';
 } catch (err) {
 error = err instanceof Error ? err.message : 'Upload failed';
 } finally {
 isUploading = false;
 }
 };

 const handleGenerateSummary = async () => {
 if (!selectedEvidence) return;

 isGeneratingSummary = true;
 error = '';

 try {
 const response = await fetch(`/api/evidence/${selectedEvidence.id}/suggest-summary`, {
 method: 'POST',
 });

 if (!response.ok) throw new Error('Failed to generate summary');

 suggestedSummary = await response.json();
 } catch (err) {
 error = err instanceof Error ? err.message : 'Summary generation failed';
 } finally {
 isGeneratingSummary = false;
 }
 };

 const handleApproveSummary = async (data: any) => {
 if (!suggestedSummary) return;

 try {
 const response = await fetch(`/api/evidence/summary/${suggestedSummary.summaryId}/approve`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(data),
 });

 if (!response.ok) throw new Error('Failed to approve summary');

 // Reload evidence
 await loadEvidence();
 selectedEvidence = null;
 suggestedSummary = null;
 } catch (err) {
 error = err instanceof Error ? err.message : 'Approval failed';
 }
 };

 const handleRejectEvidence = async () => {
 if (!selectedEvidence) return;

 try {
 const response = await fetch(`/api/evidence/${selectedEvidence.id}/approve`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({action: 'reject', rejectionReason: 'Rejected by prosecutor' }),
 });

 if (!response.ok) throw new Error('Failed to reject evidence');

 await loadEvidence();
 selectedEvidence = null;
 suggestedSummary = null;
 } catch (err) {
 error = err instanceof Error ? err.message : 'Rejection failed';
 }
 };

 const getPendingCount = () => evidence.filter((e) => e.status === 'pending').length;
 const getApprovedCount = () => evidence.filter((e) => e.status === 'approved').length;

 const handleExportPacket = async () => {
 isExportingPacket = true;
 exportPacketError = '';

 try {
 const response = await fetch(`/api/cases/${caseId}/export/pdf`, {
 method: 'POST',
 });

 if (!response.ok) {
 throw new Error('Failed to generate PDF');
 }

 const blob = await response.blob();
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `case_${caseId}_packet_${Date.now()}.pdf`;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(url);
 } catch (err) {
 exportPacketError = err instanceof Error ? err.message : 'Export failed';
 } finally {
 isExportingPacket = false;
 }
 };
</script>

<div class="min-h-screen bg-gray-50">
 <!-- Header -->
 <header class="bg-white shadow">
 <div class="max-w-7xl mx-auto px-4 py-6">
 <div class="flex items-center justify-between mb-2">
 <a href="/dashboard" class="text-blue-600 hover:text-blue-700 text-sm font-medium">
 ← Back to Cases
 </a>
 <div class="flex gap-2">
 <button
 onclick={() => (showNotesPanel = !showNotesPanel)}
 class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
 title="Open case notes editor"
 >
 📝 {showNotesPanel ? 'Hide Notes' : 'Case Notes'}
 </button>
 <button
 onclick={() => (showChatModal = true)}
 class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center gap-2"
 title="Open AI chat with case context"
 >
 🧠 AI Chat
 </button>
 <button
 onclick={handleExportPacket}
 disabled={isExportingPacket}
 class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-2 disabled:opacity-50"
 title="Export case packet as PDF"
 >
 📄 {isExportingPacket ? 'Exporting...' : 'Export Packet'}
 </button>
 </div>
 </div>
 <h1 class="text-3xl font-bold text-gray-900">{caseData?.title ?? 'Loading...'}</h1>
 </div>
 </header>

 <!-- Notes Panel (Slide-out) -->
 {#if showNotesPanel}
 <div class="fixed inset-y-0 right-0 w-[600px] bg-gray-900 shadow-2xl z-50 transform transition-transform">
 <CaseNotesEditor {caseId} onClose={() => showNotesPanel = false} />
 </div>
 <button
 class="fixed inset-0 bg-black/50 z-40"
 onclick={() => (showNotesPanel = false)}
 aria-label="Close notes panel"
 ></button>
 {/if}

 <!-- Export Error Message -->
 {#if exportPacketError}
 <div class="fixed top-4 right-4 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg z-50">
 <p>{exportPacketError}</p>
 </div>
 {/if}

 <!-- AI Chat Modal -->
 <NesModal
 open={showChatModal}
 title="🧠 AI CONTEXTUAL CHAT"
 onClose={() => showChatModal = false}
 widthClass="w-[900px]"
 >
 <ContextualChatModal {caseId} onClose={() => showChatModal = false} />
 </NesModal>

 <!-- Main Content -->
 <main class="max-w-7xl mx-auto px-4 py-8">
 {#if error}
 <div class="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
 <p class="text-red-700">{error}</p>
 </div>
 {/if}

 <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
 <!-- Left, Upload & Evidence List -->
 <div class="lg:col-span-2 space-y-6">
 <!-- Upload Section -->
 <div class="bg-white rounded-lg shadow p-6">
 <h2 class="text-lg font-semibold text-gray-900 mb-4">Upload Evidence</h2>

 <label class="block">
 <div class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition">
 <p class="text-gray-600 mb-2">📄 Click to upload or drag and drop</p>
 <p class="text-sm text-gray-500">PDF, images, documents</p>
 <input
 type="file"
 onchange={handleFileUpload}
 disabled={isUploading}
 class="hidden"
 accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
 />
 </div>
 </label>

 {#if isUploading}
 <p class="text-sm text-gray-600 mt-2">Uploading...</p>
 {/if}
 </div>

 <!-- Evidence List -->
 <div class="bg-white rounded-lg shadow p-6">
 <h2 class="text-lg font-semibold text-gray-900 mb-4">Evidence</h2>

 {#if isLoading}
 <p class="text-gray-600">Loading evidence...</p>
 {:else if evidence.length === 0}
 <p class="text-gray-600">No evidence uploaded yet.</p>
 {:else}
 <div class="space-y-3">
 {#each evidence as item (item.id)}
 <button
 onclick={() => (selectedEvidence = item)}
 class={`w-full text-left p-4 rounded-lg border-2 transition ${selectedEvidence?.id === item.id
 ? 'border-blue-500 bg-blue-50'
  : 'border-gray-200, hover:border-gray-300'}`}
 >
 <div class="flex items-start justify-between">
 <div>
 <p class="font-medium text-gray-900">{item.fileName}</p>
 <p class="text-sm text-gray-600 mt-1">
 {item.documentType} • {(item.inferenceConfidence * 100).toFixed(0)}% confidence
 </p>
 </div>
 <span
 class={`px-3 py-1 rounded-full text-xs font-medium ${item.status === 'pending'
 ? 'bg-yellow-100 text-yellow-800'
 : item.status === 'approved'
 ? 'bg-green-100 text-green-800'
 : 'bg-red-100 text-red-800'}`}
 >
 {item.status}
 </span>
 </div>
 </button>
 {/each}
 </div>
 {/if}
 </div>
 </div>

 <!-- Right, Preview & Summary -->
 <div class="space-y-6">
 {#if selectedEvidence}
 {#if !suggestedSummary}
 <EvidenceUploadPreview
 evidenceId={selectedEvidence.id}
 fileName={selectedEvidence.fileName}
 documentType={selectedEvidence.documentType}
 confidence={selectedEvidence.inferenceConfidence}
 metadata={selectedEvidence.metadata}
 onGenerateSummary={handleGenerateSummary}
 onReject={handleRejectEvidence}
 isGenerating={isGeneratingSummary}
 />
 {:else}
 <SummaryReviewPanel
 summaryId={suggestedSummary.summaryId}
 holding={suggestedSummary.holding}
 reasoning={suggestedSummary.reasoning}
 citations={suggestedSummary.citations}
 keywords={suggestedSummary.keywords}
 confidence={suggestedSummary.confidence}
 onApprove={handleApproveSummary}
 onReject={handleRejectEvidence}
 />
 {/if}
 {:else}
 <div class="bg-white rounded-lg shadow p-6 text-center text-gray-600">
 <p>Select evidence to review</p>
 </div>
 {/if}

 <!-- Stats -->
 <div class="bg-white rounded-lg shadow p-6">
 <h3 class="font-semibold text-gray-900 mb-4">Case Stats</h3>
 <div class="space-y-3">
 <div class="flex justify-between">
 <span class="text-gray-600">Total Evidence</span>
 <span class="font-medium text-gray-900">{evidence.length}</span>
 </div>
 <div class="flex justify-between">
 <span class="text-gray-600">Pending Review</span>
 <span class="font-medium text-yellow-600">{getPendingCount()}</span>
 </div>
 <div class="flex justify-between">
 <span class="text-gray-600">Approved</span>
 <span class="font-medium text-green-600">{getApprovedCount()}</span>
 </div>
 </div>
 </div>
 </div>
 </div>
 </main>
</div>

<style>
 /* Additional styles if needed */
</style>
