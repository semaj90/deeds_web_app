<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import CaseNotesEditor from '$lib/components/cases/CaseNotesEditor.svelte';
	import ContextualChatModal from '$lib/components/cases/ContextualChatModal.svelte';
	import CitationSaveModal from '$lib/components/legal-ai/CitationSaveModal.svelte';
	import StreamingAnalysisPanel from '$lib/components/cases/StreamingAnalysisPanel.svelte';
	import { onMount } from "svelte";
import EvidenceUploadPreview from '$lib/components/evidence/EvidenceUploadPreview.svelte';
import SummaryReviewPanel from '$lib/components/evidence/SummaryReviewPanel.svelte';
import WysiwygEditor from '$lib/components/editor/WysiwygEditor.svelte';
import TipTapEditor from '$lib/components/TipTapEditor.svelte';
import CaseTheoryConstructor from '$lib/components/yorha/CaseTheoryConstructor.svelte';
import QuickActionsPanel from '$lib/components/dashboard/QuickActionsPanel.svelte';
import CaseOutcomePrediction from '$lib/components/CaseOutcomePrediction.svelte';
import CaseTimeline from '$lib/components/legal/CaseTimeline.svelte';
import CrossExaminationAssistant from '$lib/components/yorha/CrossExaminationAssistant.svelte';
import SimilarCasesPanel from '$lib/components/case/SimilarCasesPanel.svelte';
import StatuteModal from '$lib/components/charges/StatuteModal.svelte';
import CaseStatuteLinks from '$lib/components/legal-ai/CaseStatuteLinks.svelte';
import ContractAnalyzer from '$lib/components/legal/ContractAnalyzer.svelte';
import LegalDocumentEditor from '$lib/components/editor/LegalDocumentEditor.svelte';
import CanvasEditor from '$lib/components/CanvasEditor.svelte';
import HeadlessTypingListener from '$lib/components/HeadlessTypingListener.svelte';
import SummaryEditor from '$lib/components/case/SummaryEditor.svelte';
import ReportToolbar from '$lib/components/editor/ReportToolbar.svelte';
import NierRichTextEditor from '$lib/components/editors/NierRichTextEditor.svelte';
import CaseDocumentWriter from '$lib/components/legal-ai/CaseDocumentWriter.svelte';
import TiptapWithAIAssistant from '$lib/components/editor/TiptapWithAIAssistant.svelte';
import type { SimilarCase, CaseSummary } from '$lib/types/case-summary';
 import { CacheStrategies, useCache } from '$lib/cache/cache-service.svelte';
 import NesModal from '$lib/components/nes/NesModal.svelte';

 const cache = useCache();

 interface Evidence { id: string, fileName: string;
 documentType: string;
	inferenceConfidence: number;
 status: 'pending' | 'approved' | 'rejected';
 createdAt: string;
 metadata?: Record<string, unknown>;
 }

 interface Case { id: string, title: string;
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
 let showDescriptionEditor = $state(false);
 let caseDescription = $state('');
 let editorMode = $state<'wysiwyg' | 'tiptap' | 'ai-tiptap' | 'nier'>('wysiwyg');
 let showDocumentWriter = $state(false);
 let typingPrompts = $state<string[]>([]);

 // Citation & Statute state
 interface CitationLink {
   id: string;
   linkType: string;
   notes: string | null;
   createdAt: string;
   citationId: string | null;
   citationText: string | null;
   sourceUrl: string | null;
 }
 interface StatuteLink {
   id: string;
   linkType: string;
   notes: string | null;
   createdAt: string;
   statuteId: string | null;
   statuteTitle: string | null;
   statuteSection: string | null;
   statuteJurisdiction: string | null;
 }
 let citations = $state<CitationLink[]>([]);
 let statutes = $state<StatuteLink[]>([]);
 let isLoadingCitations = $state(false);
 let isLoadingStatutes = $state(false);
 let showCitationModal = $state(false);
 let activeTab = $state<'evidence' | 'citations' | 'theory' | 'cross-exam' | 'prediction' | 'timeline' | 'statutes' | 'contract' | 'document' | 'canvas' | 'summary'>('evidence');
 let caseSummary = $state<CaseSummary>({
   id: 'summary-1',
   caseId: '',
   text: '',
   citations: [],
   holding: '',
   version: 1,
   createdAt: new Date().toISOString(),
   createdBy: 'system',
   isCurrent: true
 });
 let similarCases = $state<SimilarCase[]>([]);
 let isLoadingSimilar = $state(false);
 let selectedStatute = $state<any>(null);
 let showStatuteModal = $state(false);

 const caseId = page.params.id;

 onMount(async () => {
 await loadCase();
 await Promise.all([loadEvidence(), loadCitations(), loadStatutes(), loadSimilarCases()]);
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
 caseDescription = data.description ?? '';

 // Cache with 5 minute TTL
 await cache.set(cacheKey, data, CacheStrategies.TWO_LAYER);
 console.log('💾 Cached: case-' + caseId);
 } catch (err) {
 error = err instanceof Error ? err.message : 'Failed to load case';
 }
 };

 const loadSimilarCases = async () => {
   isLoadingSimilar = true;
   try {
     const response = await fetch(`/api/cases/${caseId}/similar`);
     if (!response.ok) return;
     const data = await response.json();
     similarCases = (data.cases ?? data ?? []).map((c: any) => ({
       id: c.id,
       title: c.title ?? 'Untitled',
       charges: c.charges ?? [],
       outcome: c.outcome ?? '',
       relevanceScore: c.relevanceScore ?? c.similarity ?? 0,
     }));
   } catch {
     // Degrade gracefully — similar cases are optional
   } finally {
     isLoadingSimilar = false;
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

 const loadCitations = async () => {
   isLoadingCitations = true;
   try {
     const response = await fetch(`/api/cases/${caseId}/citations`);
     if (!response.ok) throw new Error('Failed to load citations');
     const data = await response.json();
     citations = data.data ?? [];
   } catch (err) {
     console.error('Failed to load citations:', err);
   } finally {
     isLoadingCitations = false;
   }
 };

 const loadStatutes = async () => {
   isLoadingStatutes = true;
   try {
     const response = await fetch(`/api/cases/${caseId}/laws`);
     if (!response.ok) throw new Error('Failed to load statutes');
     const data = await response.json();
     statutes = data.data ?? [];
   } catch (err) {
     console.error('Failed to load statutes:', err);
   } finally {
     isLoadingStatutes = false;
   }
 };

 const handleCitationSaved = async () => {
   await loadCitations();
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
 <div class="mt-3">
   <button
     onclick={() => (showDescriptionEditor = !showDescriptionEditor)}
     class="text-sm text-blue-600 hover:underline"
   >
     {showDescriptionEditor ? 'Hide Description Editor' : 'Edit Case Description'}
   </button>
 </div>
 {#if showDescriptionEditor}
   <div class="mt-2 mb-2 flex gap-2">
     <button onclick={() => (editorMode = 'wysiwyg')} class="text-xs px-2 py-1 rounded {editorMode === 'wysiwyg' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}">Rich Editor</button>
     <button onclick={() => (editorMode = 'tiptap')} class="text-xs px-2 py-1 rounded {editorMode === 'tiptap' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}">TipTap Editor</button>
     <button onclick={() => (editorMode = 'ai-tiptap')} class="text-xs px-2 py-1 rounded {editorMode === 'ai-tiptap' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}">AI Editor</button>
     <button onclick={() => (editorMode = 'nier')} class="text-xs px-2 py-1 rounded {editorMode === 'nier' ? 'bg-gray-800 text-green-400' : 'bg-gray-200 text-gray-700'}">NieR Editor</button>
   </div>
   <div class="mt-2">
     {#if editorMode === 'wysiwyg'}
       <WysiwygEditor
         content={caseDescription}
         height="250px"
         enableAI={true}
         enableCitation={true}
         onchange={(detail) => { caseDescription = detail.content; }}
       />
     {:else if editorMode === 'ai-tiptap'}
       <TiptapWithAIAssistant
         initialContent={caseDescription}
         placeholder="Write case description with AI assistance..."
         onUpdate={(html) => { caseDescription = html; }}
       />
     {:else if editorMode === 'nier'}
       <div style="height: 250px;">
         <NierRichTextEditor bind:value={caseDescription} placeholder="Case description..." caseId={caseId} />
       </div>
     {:else}
       <TipTapEditor
         content={caseDescription}
         placeholder="Write case description..."
         onChange={(html) => { caseDescription = html; }}
       />
     {/if}
   </div>
   <!-- Headless Typing Listener — contextual AI prompts while editing -->
   <HeadlessTypingListener
     bind:text={caseDescription}
     enableContextualPrompts={true}
     enableAnalytics={true}
     oncontextualPrompt={(e) => { typingPrompts = e.detail.prompts; }}
   />
   {#if typingPrompts.length > 0}
     <div class="mt-2 flex flex-wrap gap-2">
       {#each typingPrompts as prompt}
         <button
           class="text-xs px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full hover:bg-blue-100 transition"
           onclick={() => { console.log('AI prompt:', prompt); typingPrompts = []; }}
         >
           {prompt}
         </button>
       {/each}
     </div>
   {/if}
 {/if}
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

 <!-- Citation Save Modal -->
 <CitationSaveModal
   isOpen={showCitationModal}
   {caseId}
   onsaved={handleCitationSaved}
 />

 <!-- Main Content -->
 <main class="max-w-7xl mx-auto px-4 py-8">
 {#if error}
 <div class="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
 <p class="text-red-700">{error}</p>
 </div>
 {/if}

 <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
 <!-- Left Column: Tabs for Evidence / Citations -->
 <div class="lg:col-span-2 space-y-6">
 <!-- Tab Navigation -->
 <div class="flex border-b border-gray-200 bg-white rounded-t-lg shadow px-4">
   <button
     onclick={() => (activeTab = 'evidence')}
     class={`px-4 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'evidence' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
   >
     Evidence ({evidence.length})
   </button>
   <button
     onclick={() => (activeTab = 'citations')}
     class={`px-4 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'citations' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
   >
     Citations & Laws ({citations.length + statutes.length})
   </button>
   <button
     onclick={() => (activeTab = 'theory')}
     class={`px-4 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'theory' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
   >
     Case Theory
   </button>
   <button
     onclick={() => (activeTab = 'cross-exam')}
     class={`px-4 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'cross-exam' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
   >
     Cross-Exam
   </button>
   <button
     onclick={() => (activeTab = 'prediction')}
     class={`px-4 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'prediction' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
   >
     Prediction
   </button>
   <button
     onclick={() => (activeTab = 'timeline')}
     class={`px-4 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'timeline' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
   >
     Timeline
   </button>
   <button
     onclick={() => (activeTab = 'statutes')}
     class={`px-4 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'statutes' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
   >
     Statutes
   </button>
   <button
     onclick={() => (activeTab = 'contract')}
     class={`px-4 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'contract' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
   >
     Contract
   </button>
   <button
     onclick={() => (activeTab = 'document')}
     class={`px-4 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'document' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
   >
     Document
   </button>
   <button
     onclick={() => (activeTab = 'canvas')}
     class={`px-4 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'canvas' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
   >
     Canvas
   </button>
   <button
     onclick={() => (activeTab = 'summary')}
     class={`px-4 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'summary' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
   >
     Summary
   </button>
 </div>

 {#if activeTab === 'evidence'}
 <!-- Upload Section -->
 <div class="bg-white rounded-lg shadow p-6">
 <h2 class="text-lg font-semibold text-gray-900 mb-4">Upload Evidence</h2>

 <label class="block">
 <div class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition">
 <p class="text-gray-600 mb-2">Click to upload or drag and drop</p>
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
  : 'border-gray-200 hover:border-gray-300'}`}
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

 {:else if activeTab === 'citations'}
 <!-- Citations & Laws Tab -->
 <div class="bg-white rounded-lg shadow p-6">
   <div class="flex items-center justify-between mb-4">
     <h2 class="text-lg font-semibold text-gray-900">Citations</h2>
     <button
       onclick={() => (showCitationModal = true)}
       class="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
     >
       + Add Citation
     </button>
   </div>

   {#if isLoadingCitations}
     <p class="text-gray-600">Loading citations...</p>
   {:else if citations.length === 0}
     <p class="text-gray-500 text-sm">No citations linked to this case yet.</p>
   {:else}
     <div class="space-y-3">
       {#each citations as cite (cite.id)}
         <div class="p-4 rounded-lg border border-gray-200 hover:border-blue-300 transition">
           <div class="flex items-start justify-between">
             <div class="flex-1">
               <p class="font-medium text-gray-900">{cite.citationText || 'Untitled citation'}</p>
               {#if cite.sourceUrl}
                 <a href={cite.sourceUrl} target="_blank" rel="noopener" class="text-sm text-blue-600 hover:underline mt-1 block">
                   {cite.sourceUrl}
                 </a>
               {/if}
             </div>
             <span class="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 ml-2 whitespace-nowrap">
               {cite.linkType}
             </span>
           </div>
           {#if cite.notes}
             <p class="text-sm text-gray-500 mt-2">{cite.notes}</p>
           {/if}
         </div>
       {/each}
     </div>
   {/if}
 </div>

 <!-- Statutes / Laws -->
 <div class="bg-white rounded-lg shadow p-6">
   <h2 class="text-lg font-semibold text-gray-900 mb-4">Applicable Laws</h2>

   {#if isLoadingStatutes}
     <p class="text-gray-600">Loading statutes...</p>
   {:else if statutes.length === 0}
     <p class="text-gray-500 text-sm">No statutes linked to this case yet.</p>
   {:else}
     <div class="space-y-3">
       {#each statutes as statute (statute.id)}
         <div
           class="p-4 rounded-lg border border-gray-200 hover:border-amber-300 transition cursor-pointer"
           onclick={() => { selectedStatute = { id: statute.statuteId, title: statute.statuteTitle, section: statute.statuteSection, jurisdiction: statute.statuteJurisdiction }; showStatuteModal = true; }}
           role="button"
           tabindex="0"
           onkeydown={(e) => { if (e.key === 'Enter') { selectedStatute = { id: statute.statuteId, title: statute.statuteTitle, section: statute.statuteSection, jurisdiction: statute.statuteJurisdiction }; showStatuteModal = true; } }}
         >
           <div class="flex items-start justify-between">
             <div class="flex-1">
               <p class="font-medium text-gray-900">{statute.statuteTitle || 'Untitled statute'}</p>
               {#if statute.statuteSection}
                 <p class="text-sm text-gray-600 mt-1">{statute.statuteSection}</p>
               {/if}
               {#if statute.statuteJurisdiction}
                 <p class="text-xs text-gray-400 mt-1">{statute.statuteJurisdiction}</p>
               {/if}
             </div>
             <span class="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 ml-2 whitespace-nowrap">
               {statute.linkType}
             </span>
           </div>
           {#if statute.notes}
             <p class="text-sm text-gray-500 mt-2">{statute.notes}</p>
           {/if}
         </div>
       {/each}
     </div>
   {/if}
 </div>
 {:else if activeTab === 'theory'}
 <!-- Case Theory Tab -->
 <QuickActionsPanel {caseId} />
 <div class="mt-6">
   <CaseTheoryConstructor />
 </div>
 {:else if activeTab === 'cross-exam'}
 <!-- Cross-Examination Tab -->
 <CrossExaminationAssistant
   evidence={evidence.map(e => ({ id: e.id, title: e.fileName, description: e.documentType }))}
   caseContext={caseData?.title ?? ''}
 />
 {:else if activeTab === 'prediction'}
 <!-- Outcome Prediction Tab -->
 <CaseOutcomePrediction
   caseFacts={caseData?.title ?? ''}
   jurisdiction="general"
 />
 {:else if activeTab === 'timeline'}
 <!-- Case Timeline Tab -->
 <CaseTimeline
   {caseId}
   caseName={caseData?.title ?? ''}
   events={[]}
   interactive={true}
 />
 {:else if activeTab === 'statutes'}
 <!-- Linked Statutes Tab -->
 <CaseStatuteLinks
   {caseId}
   onview={(link) => { selectedStatute = { id: link.statute_code, title: link.statute_code, section: link.link_type }; showStatuteModal = true; }}
 />
 {:else if activeTab === 'contract'}
 <!-- Contract Analysis Tab -->
 <ContractAnalyzer
   onAnalyze={async (id) => { console.log('Analyzing contract:', id); }}
   onExport={(format) => { console.log('Exporting contract as', format); }}
 />
 {:else if activeTab === 'document'}
 <!-- Legal Document Editor Tab -->
 <LegalDocumentEditor
   {caseId}
   documentType="brief"
   title={caseData?.title ?? 'Legal Document'}
 />
 {:else if activeTab === 'canvas'}
 <!-- Evidence Canvas Tab -->
 <CanvasEditor
   canvasState={null}
   reportId={caseId}
   evidence={evidence.map(e => ({ id: e.id, title: e.fileName, evidenceType: e.documentType }))}
   citationPoints={citations.map(c => ({ id: c.id, source: c.citationText ?? 'Citation' }))}
   save={async (state) => { console.log('Canvas state saved:', state); }}
 />
 {:else if activeTab === 'summary'}
 <!-- Case Summary Editor Tab -->
 <div class="bg-white rounded-lg shadow p-6">
   <ReportToolbar />
   <div class="mt-4">
     <SummaryEditor summary={caseSummary} {caseId} />
   </div>
 </div>
 {/if}

 </div>

 <!-- Right Column: Preview, Analysis & Stats -->
 <div class="space-y-6">
 <!-- AI Analysis Panel -->
 <StreamingAnalysisPanel {caseId} />

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
 <div class="flex justify-between">
 <span class="text-gray-600">Citations</span>
 <span class="font-medium text-blue-600">{citations.length}</span>
 </div>
 <div class="flex justify-between">
 <span class="text-gray-600">Statutes</span>
 <span class="font-medium text-amber-600">{statutes.length}</span>
 </div>
 </div>
 </div>

 <!-- Similar Cases -->
 {#if isLoadingSimilar}
 <div class="bg-white rounded-lg shadow p-6 text-center text-gray-600">
   <p>Finding similar cases...</p>
 </div>
 {:else if similarCases.length > 0}
 <SimilarCasesPanel cases={similarCases} />
 {/if}
 </div>
 </div>
 </main>


 <!-- Statute Detail Modal -->
 {#if showStatuteModal}
 <StatuteModal
   isOpen={showStatuteModal}
   statute={selectedStatute}
   {caseId}
   onClose={() => { showStatuteModal = false; selectedStatute = null; }}
   onAttach={(charge) => { showStatuteModal = false; selectedStatute = null; loadStatutes(); }}
 />
 {/if}

<!-- Case Document Writer Dialog -->
<CaseDocumentWriter bind:isOpen={showDocumentWriter} />

<!-- Floating Write Document Button -->
<button
  onclick={() => (showDocumentWriter = true)}
  class="fixed bottom-6 right-6 z-40 px-4 py-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition text-sm font-medium"
  title="Write Case Document"
>
  Write Document
</button>
</div>
