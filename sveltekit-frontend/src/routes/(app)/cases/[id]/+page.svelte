<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/ui/Icon.svelte';
	import CaseNotesEditor from '$lib/components/cases/CaseNotesEditor.svelte';
	import ContextualChatModal from '$lib/components/cases/ContextualChatModal.svelte';
	import CitationSaveModal from '$lib/components/legal-ai/CitationSaveModal.svelte';
	import StreamingAnalysisPanel from '$lib/components/cases/StreamingAnalysisPanel.svelte';
	import { onMount } from "svelte";
import EvidenceUploadPreview from '$lib/components/evidence/EvidenceUploadPreview.svelte';
import EvidenceViewModal from '$lib/components/evidence/EvidenceViewModal.svelte';
import SummaryReviewPanel from '$lib/components/evidence/SummaryReviewPanel.svelte';
import WysiwygEditor from '$lib/components/editor/WysiwygEditor.svelte';
import TipTapEditor from '$lib/components/TipTapEditor.svelte';
import CaseTheoryConstructor from '$lib/components/yorha/CaseTheoryConstructor.svelte';
import QuickActions from '$lib/components/dashboard/QuickActions.svelte';
import type { QuickAction } from '$lib/components/dashboard/QuickActions.svelte';
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
import RecommendationWidget from '$lib/components/recommendations/RecommendationWidget.svelte';
import SummaryEditor from '$lib/components/case/SummaryEditor.svelte';
import ReportToolbar from '$lib/components/editor/ReportToolbar.svelte';
import NierRichTextEditor from '$lib/components/editors/NierRichTextEditor.svelte';
import YoRHaModal from '$lib/components/yorha/YoRHaModal.svelte';
import CaseDocumentWriter from '$lib/components/legal-ai/CaseDocumentWriter.svelte';
import TiptapWithAIAssistant from '$lib/components/editor/TiptapWithAIAssistant.svelte';
import EnhancedInlineEditor from '$lib/components/ai/EnhancedInlineEditor.svelte';
import CollaborationPanel from '$lib/components/legal/CollaborationPanel.svelte';
import CaseEvidenceOrganizer from '$lib/components/evidence/CaseEvidenceOrganizer.svelte';
import EvidenceUploadButton from '$lib/components/evidence/EvidenceUploadButton.svelte';
import type { SimilarCase, CaseSummary } from '$lib/types/case-summary';
import type { BoardSnapshotSchema } from '$lib/schemas/board';
 import { CacheStrategies, useCache } from '$lib/cache/cache-service.svelte';
 import { Tooltip } from 'bits-ui';

 const cache = useCache();

 interface Evidence { id: string, fileName: string;
 documentType: string;
	inferenceConfidence: number | null;
 status: 'pending' | 'approved' | 'rejected';
 createdAt: string;
 metadata?: Record<string, unknown> | null;
 }

 let { data } = $props<{
   data?: {
     caseData?: { id: string; title: string; caseNumber?: string | null; createdAt?: string | Date | null; description?: string | null; jurisdiction?: string | null; status?: string | null } | null;
     case?: { id: string; title: string; caseNumber?: string | null; createdAt?: string | Date | null; description?: string | null; jurisdiction?: string | null; status?: string | null } | null;
   };
 }>();

 interface Case { id: string, title: string;
 caseNumber?: string | null;
 createdAt: string;
 description?: string | null;
 jurisdiction?: string | null;
 status?: string | null;
 }

 let caseData = $state<Case | null>(null);
 let isEditingTitle = $state(false);
 let draftCaseTitle = $state('');
 let isSavingTitle = $state(false);

 function isPlaceholderMash(rawTitle: string | undefined | null): boolean {
   const t = (rawTitle ?? '').trim();
   if (!t) return true;
   if (!t.includes(' ') && t.length >= 7 && /^[asdfghjklqwertyuiopzxcvbnm]+$/i.test(t)) {
     const uniqueChars = new Set(t.toLowerCase()).size;
     if (uniqueChars <= 4) return true;
   }
   return false;
 }

 $effect(() => {
   const ssrCase = data?.caseData ?? data?.case;
   if (ssrCase && !caseData) {
     caseData = {
       id: ssrCase.id,
       title: ssrCase.title,
       caseNumber: ssrCase.caseNumber ?? null,
       createdAt: ssrCase.createdAt ? String(ssrCase.createdAt) : '',
       description: ssrCase.description ?? null,
       jurisdiction: ssrCase.jurisdiction ?? null,
       status: ssrCase.status ?? null,
     };
     if (!caseDescription && ssrCase.description) {
       caseDescription = ssrCase.description;
     }
   }
 });
 let evidence = $state<Evidence[]>([]);
 let isLoading = $state(false);
 let error = $state('');
 let isUploading = $state(false);
 let selectedEvidence = $state<Evidence | null>(null);
 let showEvidenceViewer = $state(false);
 let suggestedSummary = $state<any>(null);
 let isGeneratingSummary = $state(false);
 let showNotesPanel = $state(false);
 let showChatModal = $state(false);
 let isExportingPacket = $state(false);
 let exportPacketError = $state('');
 let showDescriptionEditor = $state(false);
 let caseDescription = $state('');
 let editorMode = $state<'wysiwyg' | 'tiptap' | 'ai-tiptap' | 'nier' | 'inline'>('wysiwyg');
 let showDocumentWriter = $state(false);
 let showYoRHaDetails = $state(false);
 let chatInitialMessage = $state('');
 let typingPrompts = $state<string[]>([]);
 let showIdleRecommendations = $state(false);
 let idleRecommendationQuery = $state('');
 let canvasState = $state<BoardSnapshotSchema | null>(null);
 let isLoadingCanvas = $state(false);
 let canvasError = $state('');
 let hasLoadedCanvas = $state(false);

 // Case Intelligence Hub state
 let ragResults = $state<any[]>([]);
 let ragLoading = $state(false);
 let ragQuery = $state('');
 let evidenceContext = $state<any[]>([]);
 let knowledgeResults = $state<any[]>([]);

 async function runRAGSearch(query: string) {
   if (!query.trim()) return;
   ragLoading = true;
   try {
     const res = await fetch('/api/rag/search', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ query, caseId, top_k: 5 }),
       signal: AbortSignal.timeout(30_000)
     });
     if (res.ok) {
       const data = await res.json();
       ragResults = data.results ?? data.chunks ?? [];
     }
   } catch (e) { console.error('RAG search error:', e); }
   finally { ragLoading = false; }
 }

 async function loadEvidenceContext() {
   try {
     const res = await fetch('/api/evidence/search', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ query: caseData?.title ?? '', caseId, limit: 5 }),
       signal: AbortSignal.timeout(30_000)
     });
     if (res.ok) {
       const data = await res.json();
       evidenceContext = data.results ?? data.bundles ?? [];
     }
   } catch (e) { console.error('Evidence context error:', e); }
 }

 async function searchKnowledge(query: string) {
   try {
     const res = await fetch('/api/knowledge/search', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ query, topK: 5 }),
       signal: AbortSignal.timeout(30_000)
     });
     if (res.ok) {
       const data = await res.json();
       knowledgeResults = data.results ?? [];
     }
   } catch (e) { console.error('Knowledge search error:', e); }
 }

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
 type CaseTabId = 'evidence' | 'organize' | 'citations' | 'theory' | 'cross-exam' | 'prediction' | 'timeline' | 'statutes' | 'contract' | 'document' | 'canvas' | 'summary' | 'collaboration';
 let activeTab = $state<CaseTabId>('evidence');
 const isEditQueryParam = $derived(page.url.searchParams.get('edit') === 'true');
 const caseTabs = $derived<{ id: CaseTabId; label: string; icon: string; count?: number }[]>([
   { id: 'evidence', label: 'Evidence', icon: 'yorha-evidence', count: evidence.length },
   { id: 'organize', label: 'Organize', icon: 'yorha-network' },
   { id: 'citations', label: 'Citations & Laws', icon: 'yorha-citation', count: citations.length + statutes.length },
   { id: 'theory', label: 'Case Theory', icon: 'yorha-precedent' },
   { id: 'cross-exam', label: 'Cross-Exam', icon: 'yorha-warning' },
   { id: 'prediction', label: 'Prediction', icon: 'yorha-integrity' },
   { id: 'timeline', label: 'Timeline', icon: 'yorha-timeline' },
   { id: 'statutes', label: 'Statutes', icon: 'yorha-law-book', count: statutes.length },
   { id: 'contract', label: 'Contract', icon: 'yorha-regulation' },
   { id: 'document', label: 'Document', icon: 'yorha-law-book' },
   { id: 'canvas', label: 'Canvas', icon: 'yorha-network' },
   { id: 'summary', label: 'Summary', icon: 'yorha-glossary' },
   { id: 'collaboration', label: 'Collaborate', icon: 'yorha-subject' },
 ]);
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

function normalizeCaseResponse(payload: unknown): Case | null {
 if (!payload || typeof payload !== 'object') return null;

 const response = payload as Record<string, unknown>;
 const nestedCase = response.data;

 if (nestedCase && typeof nestedCase === 'object' && !Array.isArray(nestedCase)) {
  return nestedCase as Case;
 }

 if ('id' in response && typeof response.id === 'string') {
  return response as unknown as Case;
 }

 return null;
}

function normalizeInferenceConfidence(value: unknown): number | null {
 const confidence = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : null;
 return confidence !== null && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : null;
}

function normalizeEvidenceResponse(payload: unknown): Evidence[] {
 const list = Array.isArray(payload)
  ? payload
  : payload && typeof payload === 'object'
   ? ((payload as Record<string, unknown>).evidence ?? (payload as Record<string, unknown>).data)
   : null;

 if (!Array.isArray(list)) return [];

 return list.flatMap((item): Evidence[] => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
  const row = item as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id) return [];

  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
   ? row.metadata as Record<string, unknown>
   : {};
  const fileSize = row.fileSize ?? row.file_size ?? row.sizeBytes ?? metadata.fileSize;
  const documentType = [row.documentType, row.evidenceType, row.type, row.fileType, row.mimeType]
   .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const status = row.status === 'approved' || row.status === 'rejected' ? row.status : 'pending';

  return [{
   ...row,
   id: row.id,
   fileName: [row.fileName, row.filename, row.title]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? 'Untitled evidence',
   documentType: documentType ?? 'Unknown type',
   inferenceConfidence: normalizeInferenceConfidence(row.inferenceConfidence ?? row.inference_confidence),
   status,
   createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
   metadata: { ...metadata, fileSize: metadata.fileSize ?? fileSize ?? null },
  } as Evidence];
 });
}

function formatInferenceConfidence(value: number | null): string {
 return value === null ? 'Not scored' : `${Math.round(value * 100)}% conf`;
}

 function resolveCaseId() {
  const fromParams = page.params.id;
  if (fromParams) return fromParams;

  const segments = page.url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'cases' && segments[1]) return segments[1];

  return '';
 }

 let caseId = $derived(resolveCaseId());
 let initializedCaseId = $state('');

 let theoryQuickActions = $derived<QuickAction[]>([
   {
     id: 'timeline-analysis',
     icon: 'bar-chart-2',
     label: 'Timeline Analysis',
     description: 'Jump to the live case timeline tab.',
     variant: 'primary',
     onClick: () => {
       activeTab = 'timeline';
     }
   },
   {
     id: 'evidence-summary',
     icon: 'file-text',
     label: 'Evidence Summary',
     description: 'Open the current summary editor for this case.',
     variant: 'success',
     onClick: () => {
       activeTab = 'summary';
     }
   },
   {
     id: 'suspect-connections',
     icon: 'search',
     label: 'Suspect Connections',
     description: 'Open the evidence board for relationship mapping.',
     variant: 'default',
     onClick: () => {
       goto(`/cases/${caseId}/board`);
     }
   },
   {
     id: 'draft-document',
     icon: 'gavel',
     label: 'Draft Document',
     description: 'Open the legal document drafting tab.',
     variant: 'warning',
     onClick: () => {
       activeTab = 'document';
     }
   }
 ]);

 const isValidUUID = $derived(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId));

 $effect(() => {
  if (!caseId || !isValidUUID || initializedCaseId === caseId) return;

  initializedCaseId = caseId;
  void (async () => {
    if (!data || !('caseData' in data)) {
      isLoading = true;
    }
    await loadCase();
    await Promise.all([loadEvidence(), loadCitations(), loadStatutes(), loadSimilarCases()]);
  })();
 });

 $effect(() => {
    if (activeTab === 'canvas' && !hasLoadedCanvas && isValidUUID) {
      void loadCanvasState();
    }
 });

  onMount(() => {
    const handleEvidenceUpdated = async () => {
      await cache.delete(`evidence-list-${caseId}`);
      await loadEvidence();
    };
    window.addEventListener('evidence-updated', handleEvidenceUpdated);
    return () => {
      window.removeEventListener('evidence-updated', handleEvidenceUpdated);
    };
  });

 const loadCase = async () => {
 try {
 const cacheKey = `case-${caseId}`;

 // Try cache first
 const cached = await cache.get<Case>(cacheKey);
 if (cached) {
 caseData = cached;
 caseDescription = cached.description ?? '';
 return;
 }

 // Cache miss - fetch from API
 const response = await fetch(`/api/cases/${caseId}`, { signal: AbortSignal.timeout(30_000) });
 if (!response.ok) {
 if (response.status === 401) {
 await goto('/login');
 return;
 }
 if (response.status === 404) {
 isLoading = false;
 if (!caseData) {
   error = 'Uncommitted Staging Dossier — Record not yet committed to PostgreSQL 18 ledger; local inspection & synthesis ready.';
 }
 return;
 }
 throw new Error('Failed to load case');
 }

 const payload = await response.json();
 const normalizedCase = normalizeCaseResponse(payload);
 if (!normalizedCase) {
 throw new Error('Failed to load case');
 }

 caseData = normalizedCase;
 caseDescription = normalizedCase.description ?? '';
 error = '';

 // Cache with 5 minute TTL
 await cache.set(cacheKey, normalizedCase, CacheStrategies.TWO_LAYER);
 } catch (err) {
 if (!caseData) {
   error = err instanceof Error ? err.message : 'Failed to load case';
 }
 }
 };

 function startTitleEdit() {
   const current = caseData?.title ?? '';
   draftCaseTitle = isPlaceholderMash(current) ? '' : current;
   isEditingTitle = true;
 }

 async function saveCaseTitle() {
   const nextTitle = draftCaseTitle.trim();
   if (!nextTitle || !caseId) {
     isEditingTitle = false;
     return;
   }
   isSavingTitle = true;
   try {
     const res = await fetch(`/api/cases/${caseId}`, {
       method: 'PATCH',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ title: nextTitle }),
       signal: AbortSignal.timeout(15_000)
     });
     if (res.ok) {
       const payload = await res.json();
       const updated = normalizeCaseResponse(payload) ?? {
         ...(caseData ?? { id: caseId, createdAt: new Date().toISOString() }),
         title: nextTitle
       };
       caseData = updated;
       await cache.set(`case-${caseId}`, updated, CacheStrategies.TWO_LAYER);
       error = '';
     } else if (caseData) {
       caseData = { ...caseData, title: nextTitle };
     }
     isEditingTitle = false;
   } catch {
     if (caseData) caseData = { ...caseData, title: nextTitle };
     isEditingTitle = false;
   } finally {
     isSavingTitle = false;
   }
 }

 const loadSimilarCases = async () => {
   isLoadingSimilar = true;
   try {
     const response = await fetch(`/api/cases/${caseId}/similar`, { signal: AbortSignal.timeout(30_000) });
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
 evidence = normalizeEvidenceResponse(cached);
 isLoading = false;
 return;
 }

 // Cache miss - fetch from API
 const response = await fetch(`/api/cases/${caseId}/evidence`, { signal: AbortSignal.timeout(30_000) });
 if (response.status === 404) {
 evidence = [];
 return;
 }
 if (!response.ok) throw new Error('Failed to load evidence');

 const payload = await response.json();
 const normalizedEvidence = normalizeEvidenceResponse(payload);
 evidence = normalizedEvidence;

 // Cache with 10 minute TTL (evidence changes less frequently)
 await cache.set(cacheKey, normalizedEvidence, {
 memory: true,
 persistent: true,
 ttl: 600000 // 10 minutes
 });
 } catch (err) {
 error = err instanceof Error ? err.message : 'Failed to load evidence';
 } finally {
 isLoading = false;
 }
 };

 const loadCanvasState = async () => {
    isLoadingCanvas = true;
    canvasError = '';

    try {
      const response = await fetch(`/api/cases/${caseId}/canvas`, { signal: AbortSignal.timeout(30_000) });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        canvasState = null;
        canvasError = data?.error ?? 'Failed to load canvas';
        return;
      }

      canvasState = data;
    } catch (err) {
      canvasState = null;
      canvasError = err instanceof Error ? err.message : 'Failed to load canvas';
    } finally {
      hasLoadedCanvas = true;
      isLoadingCanvas = false;
    }
 };

 const saveCanvasState = async (state: BoardSnapshotSchema) => {
    canvasError = '';

    const response = await fetch(`/api/cases/${caseId}/canvas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
      signal: AbortSignal.timeout(30_000)
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      canvasError = data?.error ?? 'Failed to save canvas';
      throw new Error(canvasError);
    }

    canvasState = state;
    hasLoadedCanvas = true;
 };

 const loadCitations = async () => {
   isLoadingCitations = true;
   try {
     const response = await fetch(`/api/cases/${caseId}/citations`, { signal: AbortSignal.timeout(30_000) });
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
     const response = await fetch(`/api/cases/${caseId}/laws`, { signal: AbortSignal.timeout(30_000) });
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

  let isDragOver = $state(false);

  const uploadFileArtifact = async (file: File) => {
    isUploading = true;
    error = '';

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('case_id', caseId);
      formData.append('enableAiAnalysis', 'true');
      formData.append('enableOcr', 'true');
      formData.append('enableEmbeddings', 'true');
      formData.append('enableSummarization', 'true');

      const response = await fetch('/api/evidence/upload', {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(120_000)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      await cache.delete(`evidence-list-${caseId}`);
      await cache.delete(`evidence-${caseId}`);
      await loadEvidence();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Upload failed';
    } finally {
      isUploading = false;
    }
  };

  const handleFileUpload = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await uploadFileArtifact(file);
    input.value = '';
  };

  const handleDropzoneDrop = async (event: DragEvent) => {
    event.preventDefault();
    isDragOver = false;
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      await uploadFileArtifact(files[i]);
    }
  };

  const handleDropzoneDragOver = (event: DragEvent) => {
    event.preventDefault();
    isDragOver = true;
  };

  const handleDropzoneDragLeave = () => {
    isDragOver = false;
  };

 const handleGenerateSummary = async () => {
 if (!selectedEvidence) return;

 isGeneratingSummary = true;
 error = '';

 try {
 const response = await fetch(`/api/evidence/${selectedEvidence.id}/suggest-summary`, {
 method: 'POST',
 signal: AbortSignal.timeout(120_000)
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
 signal: AbortSignal.timeout(30_000)
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
 signal: AbortSignal.timeout(30_000)
 });

 if (!response.ok) throw new Error('Failed to reject evidence');

 await loadEvidence();
 selectedEvidence = null;
 suggestedSummary = null;
 } catch (err) {
 error = err instanceof Error ? err.message : 'Rejection failed';
 }
 };

 const getPendingCount = () => (Array.isArray(evidence) ? evidence.filter((e) => e.status === 'pending').length : 0);
 const getApprovedCount = () => (Array.isArray(evidence) ? evidence.filter((e) => e.status === 'approved').length : 0);

 const handleExportPacket = async () => {
 isExportingPacket = true;
 exportPacketError = '';

 try {
 const response = await fetch(`/api/cases/${caseId}/export/pdf`, {
 method: 'POST',
 signal: AbortSignal.timeout(120_000)
 });

 if (!response.ok) {
 throw new Error('Failed to generate PDF');
 }

 const blob = await response.blob();
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `case_${caseId}_packet_${Date.now()}.html`;
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

<div class="dossier-workspace min-h-screen">
  <!-- YoRHa Celestial Command Bar + Crystarium Telemetry Ribbon -->
  <header class="hud-command-bar">
    <div class="hud-command-gold-rule" aria-hidden="true"></div>
    <!-- Subtle Crystarium Astrolabe + Celestial Starlight Watermark -->
    <svg class="hud-astrolabe-watermark" viewBox="0 0 260 260" fill="none" aria-hidden="true">
      <circle cx="170" cy="90" r="108" stroke="currentColor" stroke-width="0.75" stroke-dasharray="3 4" />
      <circle cx="170" cy="90" r="82" stroke="currentColor" stroke-width="1" />
      <circle cx="170" cy="90" r="52" stroke="currentColor" stroke-width="0.75" opacity="0.7" />
      <line x1="48" y1="90" x2="292" y2="90" stroke="currentColor" stroke-width="0.6" opacity="0.55" />
      <line x1="170" y1="-32" x2="170" y2="212" stroke="currentColor" stroke-width="0.6" opacity="0.55" />
      <path d="M170 68 L175 85 L192 90 L175 95 L170 112 L165 95 L148 90 L165 85 Z" fill="currentColor" opacity="0.45" />
      <circle cx="88" cy="90" r="3" fill="currentColor" />
      <circle cx="252" cy="90" r="3" fill="currentColor" />
      <circle cx="170" cy="8" r="3" fill="currentColor" />
      <circle cx="170" cy="172" r="3" fill="currentColor" />
    </svg>

    <div class="max-w-7xl mx-auto px-5 pt-3.5 pb-3 relative z-10">
      <!-- Top Row: Breadcrumb + Metadata + Skinnier Celestial Action Toolbar -->
      <div class="flex flex-wrap items-center justify-between gap-2.5">
        <div class="flex items-center gap-2.5 min-w-0">
          <a href="/cases" class="hud-back-link">
            <span aria-hidden="true">←</span>
            <span>All Cases</span>
          </a>
          <span class="text-white/15 font-mono text-xs" aria-hidden="true">/</span>
          <span class="hud-meta-pill">
            {caseData?.caseNumber ? caseData.caseNumber : `Docket #${caseId ? caseId.slice(0, 8).toUpperCase() : 'PENDING'}`}
          </span>
          {#if isEditQueryParam || showDescriptionEditor}
            <span class="hud-meta-pill hud-meta-pill-gold">
              ✦ Brief Editable
            </span>
          {/if}
        </div>

        <!-- Unified Compact Celestial Toolbar (28px skinnier controls + Bits UI Tooltips) -->
        <div class="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Case actions">
          <Tooltip.Root delayDuration={180}>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  type="button"
                  onclick={() => (showDescriptionEditor = !showDescriptionEditor)}
                  class={[
                    'hud-toolbar-btn',
                    (showDescriptionEditor || isEditQueryParam) && 'hud-toolbar-btn-active'
                  ]}
                >
                  <Icon name="yorha-law-book" size={13} class="shrink-0" />
                  <span>{showDescriptionEditor ? 'Close Brief' : 'Edit Brief'}</span>
                </button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content side="bottom" sideOffset={6} class="hud-tooltip-pop">
                Toggle case brief &amp; AI editor
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>

          <Tooltip.Root delayDuration={180}>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  type="button"
                  onclick={() => (showNotesPanel = !showNotesPanel)}
                  class={['hud-toolbar-btn', showNotesPanel && 'hud-toolbar-btn-active']}
                >
                  <Icon name="yorha-glossary" size={13} class="shrink-0" />
                  <span>{showNotesPanel ? 'Hide Notes' : 'Case Notes'}</span>
                </button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content side="bottom" sideOffset={6} class="hud-tooltip-pop">
                Open [CASE_NOTES::TERMINAL] scratchpad
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>

          <Tooltip.Root delayDuration={180}>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  type="button"
                  onclick={() => (showYoRHaDetails = true)}
                  class="hud-toolbar-btn"
                >
                  <Icon name="yorha-network" size={13} class="shrink-0" />
                  <span>Intel Hub</span>
                </button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content side="bottom" sideOffset={6} class="hud-tooltip-pop">
                RAG + KAG + Knowledge Base Intelligence Hub
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>

          <Tooltip.Root delayDuration={180}>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  type="button"
                  onclick={() => (showChatModal = true)}
                  class="hud-toolbar-btn"
                >
                  <Icon name="yorha-ai-assistant" size={13} class="shrink-0" />
                  <span>AI Counsel</span>
                </button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content side="bottom" sideOffset={6} class="hud-tooltip-pop">
                Open contextual AI chat with case context
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>

          <Tooltip.Root delayDuration={180}>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  type="button"
                  onclick={() => (showDocumentWriter = true)}
                  class="hud-toolbar-btn"
                >
                  <Icon name="yorha-precedent" size={13} class="shrink-0" />
                  <span>Write Doc</span>
                </button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content side="bottom" sideOffset={6} class="hud-tooltip-pop">
                Draft formal motion, pleading, or legal brief
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>

          <Tooltip.Root delayDuration={180}>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  type="button"
                  onclick={handleExportPacket}
                  disabled={isExportingPacket}
                  class="hud-toolbar-btn hud-toolbar-btn-gold"
                >
                  <Icon name="yorha-regulation" size={13} class="shrink-0" />
                  <span>{isExportingPacket ? 'Exporting…' : 'Export Packet'}</span>
                </button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content side="bottom" sideOffset={6} class="hud-tooltip-pop">
                Compile &amp; export court dossier packet
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </div>
      </div>

      <!-- Title Row (Editorial Georgia Serif + 1-Click Inline Rename) -->
      <div class="mt-2.5 flex items-baseline justify-between gap-4">
        <div class="min-w-0 flex-1">
          {#if isEditingTitle}
            <form
              class="flex flex-wrap items-center gap-2"
              onsubmit={(e) => {
                e.preventDefault();
                void saveCaseTitle();
              }}
            >
              <span class="hud-title-star" aria-hidden="true">✦</span>
              <input
                type="text"
                bind:value={draftCaseTitle}
                placeholder="Enter formal case caption (e.g., Commonwealth v. Sterling)…"
                onkeydown={(e) => {
                  if (e.key === 'Escape') isEditingTitle = false;
                }}
                data-testid="case-title-input"
                class="hud-title-input"
              />
              <button
                type="submit"
                disabled={isSavingTitle}
                class="hud-toolbar-btn hud-toolbar-btn-gold"
                data-testid="case-title-save-btn"
              >
                {isSavingTitle ? 'Saving…' : 'Save Title'}
              </button>
              <button
                type="button"
                onclick={() => (isEditingTitle = false)}
                class="hud-toolbar-btn"
              >
                Cancel
              </button>
            </form>
          {:else}
            <div class="flex flex-wrap items-center gap-3">
              <h1
                class="hud-case-title truncate"
                data-testid="hud-case-title"
                title={caseData?.title && isPlaceholderMash(caseData.title) ? `Draft record key: ${caseData.title}` : undefined}
              >
                {#if isLoading && !caseData}
                  Loading Case Dossier…
                {:else if caseData?.title && !isPlaceholderMash(caseData.title)}
                  {caseData.title}
                {:else}
                  Untitled Case Dossier — Docket #{caseId ? caseId.slice(0, 8).toUpperCase() : 'PENDING'}
                {/if}
              </h1>
              <button
                type="button"
                data-unstyled
                onclick={startTitleEdit}
                class="hud-rename-pill"
                title="Rename formal case caption"
                data-testid="case-title-rename-btn"
              >
                <span>✎ Rename Caption</span>
              </button>
            </div>
          {/if}
          <div class="hud-nier-rule" aria-hidden="true">
            <span class="hud-nier-dot"></span>
            <span class="hud-nier-line"></span>
            <span class="hud-nier-diamond">❖</span>
            <span class="hud-nier-line hud-nier-line-short"></span>
          </div>
        </div>
        {#if caseData?.status || caseData?.jurisdiction}
          <div class="hidden sm:flex items-center gap-2 shrink-0">
            {#if caseData?.jurisdiction}
              <span class="hud-jewel-badge hud-badge-slate">{caseData.jurisdiction}</span>
            {/if}
            {#if caseData?.status}
              <span class="hud-jewel-badge hud-badge-sage">{caseData.status.replace(/_/g, ' ')}</span>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Collapsible Compact Editorial Parchment Brief Drawer -->
      {#if showDescriptionEditor}
        <div class="dossier-card mt-3.5">
          <div class="dossier-arcana-inner" aria-hidden="true"></div>
          <div class="dossier-star dossier-star-tl" aria-hidden="true">✦</div>
          <div class="dossier-star dossier-star-tr" aria-hidden="true">✦</div>
          <div class="dossier-star dossier-star-bl" aria-hidden="true">✦</div>
          <div class="dossier-star dossier-star-br" aria-hidden="true">✦</div>
          <div class="dossier-card-header">
            <div class="flex items-center gap-2">
              <span class="dossier-emblem" aria-hidden="true">
                <Icon name="yorha-law-book" size={13} />
              </span>
              <span class="dossier-card-title">Case Brief &amp; Statement of Facts</span>
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              <button type="button" onclick={() => (editorMode = 'tiptap')} class={['dossier-mini-pill', editorMode === 'tiptap' && 'dossier-mini-pill-active']}>✎ TipTap Editor</button>
              <button type="button" onclick={() => (editorMode = 'ai-tiptap')} class={['dossier-mini-pill', editorMode === 'ai-tiptap' && 'dossier-mini-pill-active']}>✦ AI Legal Assistant</button>
            </div>
          </div>
          <div class="dossier-card-body">
            {#if editorMode === 'wysiwyg'}
              <WysiwygEditor
                content={caseDescription}
                height="220px"
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
              <div style="height: 220px;">
                <NierRichTextEditor bind:value={caseDescription} placeholder="Case description..." caseId={caseId} />
              </div>
            {:else if editorMode === 'inline'}
              <EnhancedInlineEditor
                bind:value={caseDescription}
                placeholder="Type case description — AI suggestions appear as you type..."
                aiModel="ornith-1.5-9b"
                enableAutoComplete={true}
                enableGrammarCheck={true}
                enableSemanticSuggestions={true}
              />
            {:else}
              <TipTapEditor
                content={caseDescription}
                placeholder="Write case description..."
                onChange={(html) => { caseDescription = html; }}
              />
            {/if}

            <HeadlessTypingListener
              bind:text={caseDescription}
              enableContextualPrompts={true}
              enableAnalytics={true}
              oncontextualPrompt={(e) => { typingPrompts = e.detail.prompts; }}
              onstateChange={(e) => {
                if (e.detail.state === 'waiting_user' && caseDescription.length > 30) {
                  showIdleRecommendations = true;
                  idleRecommendationQuery = caseDescription.slice(0, 200);
                } else if (e.detail.state === 'typing') {
                  showIdleRecommendations = false;
                }
              }}
            />
            {#if typingPrompts.length > 0}
              <div class="mt-2.5 flex flex-wrap gap-1.5">
                {#each typingPrompts as prompt}
                  <button
                    type="button"
                    class="dossier-mini-pill"
                    onclick={() => { chatInitialMessage = prompt; typingPrompts = []; showChatModal = true; }}
                  >
                    {prompt}
                  </button>
                {/each}
              </div>
            {/if}
            {#if showIdleRecommendations && idleRecommendationQuery}
              <div class="mt-3">
                <RecommendationWidget query={idleRecommendationQuery} caseId={caseId} limit={3} compact={true} />
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <!-- Crystarium Bottom Architectural Telemetry Strip -->
    <div class="hud-crystarium-ribbon">
      <div class="max-w-7xl mx-auto px-5 h-full flex flex-wrap items-center justify-between gap-x-5 gap-y-1">
        <div class="flex items-center gap-5 overflow-x-auto">
          <span class="hud-ribbon-item">
            <span class="hud-ribbon-key">STAGE</span>
            <span class="hud-ribbon-val text-[#E5C77B]">{caseData?.status?.toUpperCase() ?? (isEditQueryParam ? 'BRIEFING' : 'DISCOVERY')}</span>
          </span>
          <span class="hud-ribbon-sep" aria-hidden="true">◆</span>
          <span class="hud-ribbon-item">
            <span class="hud-ribbon-key">EXHIBITS</span>
            <span class="hud-ribbon-val">{evidence.length} LOGGED</span>
          </span>
          <span class="hud-ribbon-sep" aria-hidden="true">◆</span>
          <span class="hud-ribbon-item">
            <span class="hud-ribbon-key">AUTHORITIES</span>
            <span class="hud-ribbon-val">{citations.length + statutes.length} LINKED</span>
          </span>
        </div>
        <div class="hidden md:flex items-center gap-2">
          <span class="hud-ribbon-key">VECTOR FABRIC</span>
          <span class="hud-ribbon-val text-[#A7F3D0]">PG18 · 768-D COSINE</span>
        </div>
      </div>
    </div>
  </header>

 <!-- Notes Modal (NES-styled) -->
 {#if showNotesPanel}
 <div class="legal-notes-backdrop" onclick={(e) => { if (e.target === e.currentTarget) showNotesPanel = false; }} onkeydown={(e) => e.key === 'Escape' && (showNotesPanel = false)} role="presentation" tabindex="-1">
   <div class="legal-notes-frame" role="dialog" aria-modal="true" aria-label="Case Notes" tabindex="-1">
     <div class="legal-notes-titlebar">
       <span class="legal-notes-label">[CASE_NOTES::TERMINAL]</span>
       <span class="legal-notes-id">{caseId.slice(0, 8)}</span>
       <button type="button" class="legal-icon-action-danger" onclick={() => (showNotesPanel = false)} aria-label="Close notes" title="Close notes">
         <Icon name="x" size={15} class="transition-transform group-hover:rotate-90" />
       </button>
     </div>
     <div class="legal-notes-content">
       <CaseNotesEditor {caseId} onClose={() => showNotesPanel = false} />
     </div>
   </div>
 </div>
 {/if}

 <!-- Export Error Message -->
 {#if exportPacketError}
 <div class="fixed top-4 right-4 bg-red-600 text-black px-4 py-3 rounded-lg shadow-lg z-50">
 <p>{exportPacketError}</p>
 </div>
 {/if}

 <!-- AI Chat Modal (YoRHa Crystal Dialog with Bits UI v2) -->
 <YoRHaModal
   bind:open={showChatModal}
   title="🧠 AI CONTEXTUAL CHAT"
   subtitle="Ornith 1.5 9B · Legal Lens Active"
   size="lg"
   onClose={() => { showChatModal = false; chatInitialMessage = ''; }}
 >
   <ContextualChatModal {caseId} onClose={() => { showChatModal = false; chatInitialMessage = ''; }} initialMessage={chatInitialMessage} />
 </YoRHaModal>

 <!-- Citation Save Modal -->
 <CitationSaveModal
   isOpen={showCitationModal}
   {caseId}
   onsaved={handleCitationSaved}
 />

  <!-- Main Dossier Workspace -->
  <main class="max-w-7xl mx-auto px-5 pt-3 pb-8">
    {#if error && error.trim().length > 0 && !error.includes('Uncommitted')}
      <div class="dossier-archival-notice mb-4">
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="dossier-notice-seal" aria-hidden="true">
            <Icon name="yorha-warning" size={13} />
          </span>
          <p class="text-[11.5px] font-mono tracking-wide text-[#67140F] truncate">{error}</p>
        </div>
        <span class="hidden sm:inline-block text-[10px] font-mono uppercase tracking-[0.16em] text-[#7F7565] shrink-0">ARCHIVAL SEAL</span>
      </div>
    {/if}

    <!-- Full-Width Compact 13-Tab Celestial Arcana Dossier Strip -->
    <div class="dossier-tab-shell mb-5">
      <div class="dossier-arcana-inner" aria-hidden="true"></div>
      <div class="dossier-star dossier-star-tl" aria-hidden="true">✦</div>
      <div class="dossier-star dossier-star-tr" aria-hidden="true">✦</div>
      <div class="dossier-star dossier-star-bl" aria-hidden="true">✦</div>
      <div class="dossier-star dossier-star-br" aria-hidden="true">✦</div>
      <div class="dossier-tab-scroll" role="tablist" aria-label="Case sections">
        {#each caseTabs as tab (tab.id)}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onclick={() => (activeTab = tab.id)}
            class={[
              'dossier-tab-btn',
              activeTab === tab.id ? 'dossier-tab-btn-active' : 'dossier-tab-btn-idle'
            ]}
          >
            <Icon name={tab.icon} size={13} class="shrink-0 opacity-90" />
            <span>{tab.label}</span>
            {#if tab.count !== undefined}
              <span class="dossier-tab-count">[{tab.count}]</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <!-- Left Column (8/12): Active Dossier Section -->
      <div class="lg:col-span-8 space-y-4">
        {#if activeTab === 'evidence'}
          <!-- Celestial Arcana + Editorial Luxury Card: Evidence Ingestion -->
          <section class="dossier-card">
            <div class="dossier-arcana-inner" aria-hidden="true"></div>
            <div class="dossier-star dossier-star-tl" aria-hidden="true">✦</div>
            <div class="dossier-star dossier-star-tr" aria-hidden="true">✦</div>
            <div class="dossier-star dossier-star-bl" aria-hidden="true">✦</div>
            <div class="dossier-star dossier-star-br" aria-hidden="true">✦</div>
            <div class="dossier-sheen" aria-hidden="true"></div>

            <div class="dossier-card-header">
              <div class="flex items-center gap-2.5 flex-wrap min-w-0">
                <div class="dossier-plaque">
                  <Icon name="yorha-evidence" size={13} class="text-[#FFE59A]" />
                  <h2 class="dossier-card-title">Evidence Ingestion</h2>
                </div>
                <span class="dossier-card-sub">PG18 OUTBOX · SHA-256 · 768-D SEMANTIC</span>
              </div>
              <EvidenceUploadButton {caseId} onSuccess={async () => { await cache.delete(`evidence-list-${caseId}`); await loadEvidence(); }} />
            </div>

            <div class="dossier-card-body">
              <label
                class={['dossier-dropzone', isDragOver && 'dossier-dropzone-dragover']}
                ondragover={handleDropzoneDragOver}
                ondragleave={handleDropzoneDragLeave}
                ondrop={handleDropzoneDrop}
              >
                <span class="dz-corner dz-tl" aria-hidden="true"></span>
                <span class="dz-corner dz-tr" aria-hidden="true"></span>
                <span class="dz-corner dz-bl" aria-hidden="true"></span>
                <span class="dz-corner dz-br" aria-hidden="true"></span>

                <div class="dossier-dropzone-medallion" aria-hidden="true">
                  <span class="dossier-medallion-ring"></span>
                  <Icon name="yorha-evidence" size={22} />
                </div>
                <p class="dossier-dropzone-title">
                  {isDragOver ? 'Release to Ingest Legal Artifact' : 'Drop Legal Artifact Here or Click to Browse'}
                </p>
                <p class="dossier-dropzone-meta">PDF · DOCX · JPG · PNG &bull; MIME Magic-Byte Gate Active</p>
                <input
                  type="file"
                  onchange={handleFileUpload}
                  disabled={isUploading}
                  class="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                />
              </label>

              {#if isUploading}
                <div class="mt-2.5 px-3.5 py-2 bg-[#FFF6E5] border border-[#E8CF96] rounded-full text-xs font-medium text-[#5C493F]">
                  ▸ Ingesting &amp; hashing artifact…
                </div>
              {/if}
            </div>
          </section>

          <!-- Soft Bento × RYUO Botanical Silk-Cream Card: Evidence Ledger -->
          <section class="dossier-card">
            <div class="dossier-arcana-inner" aria-hidden="true"></div>
            <div class="dossier-star dossier-star-tl" aria-hidden="true">❖</div>
            <div class="dossier-star dossier-star-tr" aria-hidden="true">❖</div>
            <div class="dossier-star dossier-star-bl" aria-hidden="true">❖</div>
            <div class="dossier-star dossier-star-br" aria-hidden="true">❖</div>

            <div class="dossier-card-header">
              <div class="dossier-plaque">
                <Icon name="yorha-integrity" size={13} class="text-[#FFE59A]" />
                <h2 class="dossier-card-title">Evidence Ledger</h2>
              </div>
              <span class="dossier-mono-chip">{evidence.length} EXHIBITS</span>
            </div>

            <div class="dossier-card-body">
              {#if isLoading}
                <p class="text-xs font-mono text-[#7F7565] py-3">Querying evidence catalog…</p>
              {:else if evidence.length === 0}
                <div class="dossier-empty-ledger">
                  <span class="dossier-empty-star" aria-hidden="true">✦</span>
                  <p class="text-[11.5px] font-mono uppercase tracking-[0.14em] text-[#6B6256]">No exhibits logged in this dossier yet</p>
                  <p class="text-[11px] text-[#7F7565] mt-1">Ingested files automatically register canonical SHA-256 lineage and 768-D semantic vectors.</p>
                </div>
              {:else}
                <div class="space-y-2">
                  {#each evidence as item (item.id)}
                    <button
                      type="button"
                      onclick={() => (selectedEvidence = item)}
                      class={[
                        'dossier-ledger-row',
                        selectedEvidence?.id === item.id && 'dossier-ledger-row-active'
                      ]}
                    >
                      <div class="flex items-center gap-2.5 min-w-0">
                        <span class="dossier-row-icon" aria-hidden="true">
                          <Icon name="yorha-evidence" size={14} />
                        </span>
                        <div class="min-w-0">
                          <p class="text-[13px] font-semibold text-[#141312] truncate">{item.fileName}</p>
                          <p class="text-[11px] font-mono text-[#7F7565] mt-0.5 uppercase tracking-wide">
                            {item.documentType} &bull; {formatInferenceConfidence(item.inferenceConfidence)}
                          </p>
                        </div>
                      </div>
                      <span
                        class={[
                          'dossier-status-pill',
                          item.status === 'pending'
                            ? 'dossier-status-pending'
                            : item.status === 'approved'
                              ? 'dossier-status-approved'
                              : 'dossier-status-rejected'
                        ]}
                      >
                        {item.status}
                      </span>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </section>

        {:else if activeTab === 'organize'}
          <section class="dossier-card">
            <div class="dossier-arcana-inner" aria-hidden="true"></div>
            <div class="dossier-star dossier-star-tl" aria-hidden="true">✦</div>
            <div class="dossier-star dossier-star-tr" aria-hidden="true">✦</div>
            <div class="dossier-star dossier-star-bl" aria-hidden="true">✦</div>
            <div class="dossier-star dossier-star-br" aria-hidden="true">✦</div>
            <div class="dossier-card-body">
              <CaseEvidenceOrganizer
                {caseId}
                initialEvidence={evidence.map(e => ({ id: e.id, title: e.fileName, type: e.documentType, status: e.status, ...(e.inferenceConfidence !== null ? { confidence: e.inferenceConfidence } : {}), createdAt: e.createdAt }))}
                onselectevidence={(data) => { if (data.evidence.length > 0) { const first = data.evidence[0]; selectedEvidence = evidence.find(e => e.id === first.id) ?? null; } activeTab = 'evidence'; }}
              />
            </div>
          </section>

        {:else if activeTab === 'citations'}
          <section class="dossier-card">
            <div class="dossier-arcana-inner" aria-hidden="true"></div>
            <div class="dossier-star dossier-star-tl" aria-hidden="true">✦</div>
            <div class="dossier-star dossier-star-tr" aria-hidden="true">✦</div>
            <div class="dossier-star dossier-star-bl" aria-hidden="true">✦</div>
            <div class="dossier-star dossier-star-br" aria-hidden="true">✦</div>
            <div class="dossier-sheen" aria-hidden="true"></div>

            <div class="dossier-card-header">
              <div class="flex items-center gap-2.5">
                <span class="dossier-emblem" aria-hidden="true">
                  <Icon name="yorha-citation" size={13} />
                </span>
                <h2 class="dossier-card-title">Case Citations</h2>
              </div>
              <button
                type="button"
                onclick={() => (showCitationModal = true)}
                class="dossier-action-btn"
              >
                + Link Citation
              </button>
            </div>

            <div class="dossier-card-body">
              {#if isLoadingCitations}
                <p class="text-xs font-mono text-[#7F7565]">Loading citations…</p>
              {:else if citations.length === 0}
                <p class="text-xs font-mono text-[#7F7565]">No citations linked to this dossier yet.</p>
              {:else}
                <div class="space-y-2.5">
                  {#each citations as cite (cite.id)}
                    <div class="p-3 rounded-md border border-[#B9A699] bg-[#EFEBE5] hover:border-[#C8A24A] transition">
                      <div class="flex items-start justify-between gap-2">
                        <div class="flex-1 min-w-0">
                          <p class="text-[13px] font-semibold text-[#141312]">{cite.citationText || 'Untitled citation'}</p>
                          {#if cite.sourceUrl}
                            <a href={cite.sourceUrl} target="_blank" rel="noopener" class="text-xs font-mono text-[#67140F] hover:underline mt-0.5 block truncate">
                              {cite.sourceUrl}
                            </a>
                          {/if}
                        </div>
                        <span class="dossier-mono-chip shrink-0">{cite.linkType}</span>
                      </div>
                      {#if cite.notes}
                        <p class="text-xs text-[#5A5248] mt-1.5">{cite.notes}</p>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </section>

          <section class="dossier-card">
            <div class="dossier-arcana-inner" aria-hidden="true"></div>
            <div class="dossier-star dossier-star-tl" aria-hidden="true">✦</div>
            <div class="dossier-star dossier-star-tr" aria-hidden="true">✦</div>
            <div class="dossier-star dossier-star-bl" aria-hidden="true">✦</div>
            <div class="dossier-star dossier-star-br" aria-hidden="true">✦</div>
            <div class="dossier-card-header">
              <div class="flex items-center gap-2.5">
                <span class="dossier-emblem" aria-hidden="true">
                  <Icon name="yorha-law-book" size={13} />
                </span>
                <h2 class="dossier-card-title">Applicable Statutes</h2>
              </div>
              <span class="dossier-mono-chip">[{statutes.length}]</span>
            </div>
            <div class="dossier-card-body">
              {#if isLoadingStatutes}
                <p class="text-xs font-mono text-[#7F7565]">Loading statutes…</p>
              {:else if statutes.length === 0}
                <p class="text-xs font-mono text-[#7F7565]">No statutes linked to this dossier yet.</p>
              {:else}
                <div class="space-y-2.5">
                  {#each statutes as statute (statute.id)}
                    <div
                      class="p-3 rounded-md border border-[#B9A699] bg-[#EFEBE5] hover:border-[#C8A24A] transition cursor-pointer"
                      onclick={() => { selectedStatute = { id: statute.statuteId, title: statute.statuteTitle, section: statute.statuteSection, jurisdiction: statute.statuteJurisdiction }; showStatuteModal = true; }}
                      role="button"
                      tabindex="0"
                      onkeydown={(e) => { if (e.key === 'Enter') { selectedStatute = { id: statute.statuteId, title: statute.statuteTitle, section: statute.statuteSection, jurisdiction: statute.statuteJurisdiction }; showStatuteModal = true; } }}
                    >
                      <div class="flex items-start justify-between gap-2">
                        <div class="flex-1 min-w-0">
                          <p class="text-[13px] font-semibold text-[#141312]">{statute.statuteTitle || 'Untitled statute'}</p>
                          {#if statute.statuteSection}
                            <p class="text-xs font-mono text-[#5A5248] mt-0.5">{statute.statuteSection}</p>
                          {/if}
                          {#if statute.statuteJurisdiction}
                            <p class="text-[11px] font-mono text-[#67140F] mt-0.5">{statute.statuteJurisdiction}</p>
                          {/if}
                        </div>
                        <span class="dossier-mono-chip shrink-0">{statute.linkType}</span>
                      </div>
                      {#if statute.notes}
                        <p class="text-xs text-[#5A5248] mt-1.5">{statute.notes}</p>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </section>

        {:else if activeTab === 'theory'}
          <QuickActions actions={theoryQuickActions} title="Theory Actions" compact={true} />
          <div class="mt-4">
            <CaseTheoryConstructor />
          </div>

        {:else if activeTab === 'cross-exam'}
          <CrossExaminationAssistant
            evidence={evidence.map(e => ({ id: e.id, title: e.fileName, description: e.documentType }))}
            caseContext={caseData?.title ?? ''}
          />

        {:else if activeTab === 'prediction'}
          <CaseOutcomePrediction
            caseFacts={caseData?.title ?? ''}
            jurisdiction="general"
          />

        {:else if activeTab === 'timeline'}
          <CaseTimeline
            {caseId}
            caseName={caseData?.title ?? ''}
            events={[]}
            interactive={true}
          />

        {:else if activeTab === 'statutes'}
          <CaseStatuteLinks
            {caseId}
            onview={(link) => { selectedStatute = { id: link.statute_code, title: link.statute_code, section: link.link_type }; showStatuteModal = true; }}
          />

        {:else if activeTab === 'contract'}
          <ContractAnalyzer
            onAnalyze={async (id) => {
              await fetch('/api/agent/investigate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: `Analyze contract ${id} for case ${caseId}: clauses, risks, obligations.`, caseId }), signal: AbortSignal.timeout(120_000) });
            }}
            onExport={(format) => {
              const link = document.createElement('a');
              link.href = `/api/cases/${caseId}/export?format=${encodeURIComponent(format)}`;
              link.download = `contract-${caseId}.${format}`;
              link.click();
            }}
          />

        {:else if activeTab === 'document'}
          <LegalDocumentEditor
            {caseId}
            documentType="brief"
            title={caseData?.title ?? 'Legal Document'}
          />

        {:else if activeTab === 'canvas'}
          <section class="dossier-card">
            <div class="dossier-arcana-inner" aria-hidden="true"></div>
            <div class="dossier-star dossier-star-tl" aria-hidden="true">✦</div>
            <div class="dossier-star dossier-star-tr" aria-hidden="true">✦</div>
            <div class="dossier-star dossier-star-bl" aria-hidden="true">✦</div>
            <div class="dossier-star dossier-star-br" aria-hidden="true">✦</div>
            <div class="dossier-card-body">
              {#if canvasError}
                <div class="mb-3 rounded border border-[#67140F]/35 bg-[#67140F]/8 px-3 py-2 text-xs text-[#67140F]">
                  {canvasError}
                </div>
              {/if}
              {#if isLoadingCanvas}
                <p class="mb-3 text-xs font-mono text-[#7F7565]">Loading saved canvas…</p>
              {/if}
              <CanvasEditor
                {canvasState}
                reportId={caseId}
                evidence={evidence.map(e => ({ id: e.id, title: e.fileName, evidenceType: e.documentType }))}
                citationPoints={citations.map(c => ({ id: c.id, source: c.citationText ?? 'Citation' }))}
                save={saveCanvasState}
              />
            </div>
          </section>

        {:else if activeTab === 'summary'}
          <section class="dossier-card">
            <div class="dossier-arcana-inner" aria-hidden="true"></div>
            <div class="dossier-star dossier-star-tl" aria-hidden="true">✦</div>
            <div class="dossier-star dossier-star-tr" aria-hidden="true">✦</div>
            <div class="dossier-star dossier-star-bl" aria-hidden="true">✦</div>
            <div class="dossier-star dossier-star-br" aria-hidden="true">✦</div>
            <div class="dossier-card-body">
              <ReportToolbar />
              <div class="mt-3">
                <SummaryEditor summary={caseSummary} {caseId} />
              </div>
            </div>
          </section>

        {:else if activeTab === 'collaboration'}
          <section class="dossier-card">
            <div class="dossier-arcana-inner" aria-hidden="true"></div>
            <div class="dossier-star dossier-star-tl" aria-hidden="true">✦</div>
            <div class="dossier-star dossier-star-tr" aria-hidden="true">✦</div>
            <div class="dossier-star dossier-star-bl" aria-hidden="true">✦</div>
            <div class="dossier-star dossier-star-br" aria-hidden="true">✦</div>
            <div class="dossier-card-body">
              <CollaborationPanel
                userId={caseData?.id ?? 'anonymous'}
                evidenceId={selectedEvidence?.id ?? ''}
                onAddAnnotation={async (content, position) => {
                  await fetch('/api/cases/' + caseId + '/annotations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, position, evidenceId: selectedEvidence?.id }), signal: AbortSignal.timeout(30_000) }).catch(() => {});
                }}
              />
            </div>
          </section>
        {/if}
      </div>

      <!-- Right Column (4/12): Celestial Synthesis, Exhibit Inspector & Crystarium Telemetry -->
      <aside class="lg:col-span-4 space-y-4">
        <StreamingAnalysisPanel {caseId} />

        {#if selectedEvidence}
			<button
				type="button"
				onclick={() => (showEvidenceViewer = true)}
				class="w-full px-4 py-2 border border-[#c9b794] text-[#46382e] rounded-lg bg-[#faf7f1] hover:bg-[#f1e9dc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8d6821] font-medium transition"
			>
				Open original evidence
			</button>
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
          <section class="dossier-card">
            <div class="dossier-arcana-inner" aria-hidden="true"></div>
            <div class="dossier-star dossier-star-tl" aria-hidden="true">❖</div>
            <div class="dossier-star dossier-star-tr" aria-hidden="true">❖</div>
            <div class="dossier-star dossier-star-bl" aria-hidden="true">❖</div>
            <div class="dossier-star dossier-star-br" aria-hidden="true">❖</div>
            <div class="dossier-card-header">
              <div class="dossier-plaque">
                <Icon name="yorha-glossary" size={13} class="text-[#FFE59A]" />
                <h3 class="dossier-card-title">Exhibit Inspector</h3>
              </div>
              <span class="dossier-mono-chip">STANDBY</span>
            </div>
            <div class="dossier-card-body pt-2 pb-4 text-center">
              <div class="bento-soft-well">
                <p class="text-[12px] leading-relaxed text-[#6E5A4F]">Select an exhibit from the ledger to inspect metadata, chain-of-custody, and holding summaries.</p>
              </div>
            </div>
          </section>
        {/if}

        <!-- Light Silk-Cream Bento × RYUO Botanical Case Telemetry Card -->
        <section class="dossier-card">
          <div class="dossier-arcana-inner" aria-hidden="true"></div>
          <div class="dossier-star dossier-star-tl" aria-hidden="true">❖</div>
          <div class="dossier-star dossier-star-tr" aria-hidden="true">❖</div>
          <div class="dossier-star dossier-star-bl" aria-hidden="true">❖</div>
          <div class="dossier-star dossier-star-br" aria-hidden="true">❖</div>

          <div class="dossier-card-header">
            <div class="dossier-plaque">
              <Icon name="yorha-network" size={13} class="text-[#FFE59A]" />
              <h3 class="dossier-card-title">Case Telemetry</h3>
            </div>
            <span class="dossier-mono-chip">PG18 · LIVE</span>
          </div>

          <div class="telemetry-bento-list">
            <div class="telemetry-pill-plate">
              <div class="telemetry-row-head">
                <span class="telemetry-label">
                  <span class="telemetry-dot" style="background: #FFE59A; border: 1px solid #DFBE64;"></span>
                  Total Exhibits
                </span>
                <span class="telemetry-val">{evidence.length}</span>
              </div>
              <div class="telemetry-track">
                <div class="telemetry-fill telemetry-fill-butter" style={`width: ${Math.min(100, Math.max(16, evidence.length * 16))}%`}></div>
              </div>
            </div>

            <div class="telemetry-pill-plate">
              <div class="telemetry-row-head">
                <span class="telemetry-label">
                  <span class="telemetry-dot" style="background: #F6C1C8; border: 1px solid #DF95A0;"></span>
                  Pending Review
                </span>
                <span class="telemetry-val">{getPendingCount()}</span>
              </div>
              <div class="telemetry-track">
                <div class="telemetry-fill telemetry-fill-sakura" style={`width: ${evidence.length ? Math.max(16, (getPendingCount() / evidence.length) * 100) : 18}%`}></div>
              </div>
            </div>

            <div class="telemetry-pill-plate">
              <div class="telemetry-row-head">
                <span class="telemetry-label">
                  <span class="telemetry-dot" style="background: #B7E1D1; border: 1px solid #7FC2A9;"></span>
                  Approved
                </span>
                <span class="telemetry-val">{getApprovedCount()}</span>
              </div>
              <div class="telemetry-track">
                <div class="telemetry-fill telemetry-fill-sage" style={`width: ${evidence.length ? Math.max(16, (getApprovedCount() / evidence.length) * 100) : 20}%`}></div>
              </div>
            </div>

            <div class="telemetry-pill-plate">
              <div class="telemetry-row-head">
                <span class="telemetry-label">
                  <span class="telemetry-dot" style="background: #A9D3FF; border: 1px solid #79B4F2;"></span>
                  Linked Citations
                </span>
                <span class="telemetry-val">{citations.length}</span>
              </div>
              <div class="telemetry-track">
                <div class="telemetry-fill telemetry-fill-sky" style={`width: ${Math.min(100, Math.max(16, citations.length * 18))}%`}></div>
              </div>
            </div>

            <div class="telemetry-pill-plate">
              <div class="telemetry-row-head">
                <span class="telemetry-label">
                  <span class="telemetry-dot" style="background: #E4B396; border: 1px solid #B97F62;"></span>
                  Applicable Statutes
                </span>
                <span class="telemetry-val">{statutes.length}</span>
              </div>
              <div class="telemetry-track">
                <div class="telemetry-fill telemetry-fill-mocha" style={`width: ${Math.min(100, Math.max(16, statutes.length * 18))}%`}></div>
              </div>
            </div>
          </div>
        </section>

        <!-- Similar Cases Precedent Widget -->
        {#if isLoadingSimilar}
          <section class="dossier-card">
            <div class="dossier-arcana-inner" aria-hidden="true"></div>
            <div class="dossier-star dossier-star-tl" aria-hidden="true">❖</div>
            <div class="dossier-star dossier-star-tr" aria-hidden="true">❖</div>
            <div class="dossier-star dossier-star-bl" aria-hidden="true">❖</div>
            <div class="dossier-star dossier-star-br" aria-hidden="true">❖</div>
            <div class="dossier-card-header">
              <div class="dossier-plaque">
                <Icon name="yorha-precedent" size={13} class="text-[#FFE59A]" />
                <h3 class="dossier-card-title">Similar Precedents</h3>
              </div>
              <span class="dossier-mono-chip">ANN · SCAN</span>
            </div>
            <div class="dossier-card-body py-3 text-center">
              <p class="text-xs font-medium text-[#7A5A4A]">Scanning 768-D vector corpus…</p>
            </div>
          </section>
        {:else if similarCases.length > 0}
          <SimilarCasesPanel cases={similarCases} />
        {/if}
      </aside>
    </div>
  </main>

	<EvidenceViewModal
		bind:open={showEvidenceViewer}
		evidenceId={selectedEvidence?.id ?? null}
		{caseId}
		onClose={() => (showEvidenceViewer = false)}
	/>

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

<!-- Case Intelligence Hub Modal — RAG + KAG + Evidence Context + Knowledge Base -->
<YoRHaModal open={showYoRHaDetails} title="Case Intelligence Hub" subtitle={caseData?.title ?? caseId} size="xl" type="system" onClose={() => (showYoRHaDetails = false)}>
  {#snippet children()}
    <div class="space-y-5 max-h-[72vh] overflow-y-auto pr-1">
      <!-- Case Meta Census -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-black/40 border border-[#f3d471]/25 rounded">
        <div class="border-r border-white/5 pr-2">
          <span class="text-[10px] font-mono uppercase tracking-widest text-sand/60">Case ID</span>
          <p class="font-mono text-xs font-bold text-[#f3d471] truncate mt-0.5">{caseId}</p>
        </div>
        <div class="border-r border-white/5 pr-2">
          <span class="text-[10px] font-mono uppercase tracking-widest text-sand/60">Created</span>
          <p class="font-mono text-xs text-zinc-300 mt-0.5">{caseData?.createdAt ?? 'N/A'}</p>
        </div>
        <div class="border-r border-white/5 pr-2">
          <span class="text-[10px] font-mono uppercase tracking-widest text-sand/60">Evidence</span>
          <p class="font-mono text-xs font-bold text-white mt-0.5">{evidence.length} items</p>
        </div>
        <div>
          <span class="text-[10px] font-mono uppercase tracking-widest text-sand/60">Citations</span>
          <p class="font-mono text-xs font-bold text-white mt-0.5">{citations.length} <span class="text-zinc-500 font-normal">linked &bull;</span> {statutes.length} <span class="text-zinc-500 font-normal">statutes</span></p>
        </div>
      </div>

      <!-- RAG + KAG Retrieval Section -->
      <div class="bg-black/25 p-4 rounded border border-white/5">
        <h3 class="text-xs font-mono uppercase tracking-widest text-[#f3d471] mb-2.5 flex items-center gap-2">
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-[#f3d471]"></span>
          RAG + KAG Retrieval Lane
        </h3>
        <div class="flex gap-2 mb-3">
          <input
            type="text"
            bind:value={ragQuery}
            placeholder="Search case context via RAG pipeline..."
            class="flex-1 px-3 py-2 bg-black/50 border border-sand/30 focus:border-[#f3d471] focus:outline-none text-sm text-zinc-100 rounded font-mono placeholder:text-zinc-500"
            onkeydown={(e) => { if (e.key === 'Enter') runRAGSearch(ragQuery); }}
          />
          <button
            onclick={() => runRAGSearch(ragQuery)}
            disabled={ragLoading}
            class="px-4 py-2 bg-[#f3d471] hover:bg-[#ffe180] text-black font-bold font-mono text-xs uppercase rounded transition-colors disabled:opacity-50 shadow-[0_0_10px_rgba(243,212,113,0.25)]"
          >
            {ragLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
        {#if ragResults.length > 0}
          <div class="max-h-48 overflow-y-auto space-y-2 border border-white/10 rounded p-2 bg-black/40">
            {#each ragResults as chunk, i}
              <div class="p-2.5 bg-black/30 border border-[#bad0ff]/15 rounded text-xs">
                <div class="flex justify-between items-center text-[10px] font-mono text-sand/60 mb-1">
                  <span>CHUNK #{i + 1}</span>
                  <span class="text-[#f3d471]">Score: {typeof chunk.score === 'number' ? chunk.score.toFixed(3) : 'N/A'}</span>
                  <span>{chunk.confidence ?? chunk.collection ?? ''}</span>
                </div>
                <div class="text-zinc-200 leading-relaxed font-mono">{chunk.text ?? chunk.payload ?? chunk.content ?? JSON.stringify(chunk).slice(0, 200)}</div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Evidence Analysis Context -->
      <div class="bg-black/25 p-4 rounded border border-white/5">
        <div class="flex justify-between items-center mb-2.5">
          <h3 class="text-xs font-mono uppercase tracking-widest text-[#7ee7ff] flex items-center gap-2">
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-[#7ee7ff]"></span>
            Evidence Analysis Context
          </h3>
          <button
            onclick={() => loadEvidenceContext()}
            class="px-3 py-1 bg-black/40 border border-sand/30 hover:border-sand/60 text-sand/80 hover:text-white font-mono text-[11px] uppercase rounded transition-colors"
          >
            Load Context
          </button>
        </div>
        {#if evidenceContext.length > 0}
          <div class="max-h-36 overflow-y-auto space-y-1.5 border border-white/10 rounded p-2 bg-black/40 font-mono text-xs">
            {#each evidenceContext as ctx}
              <div class="p-2 bg-black/20 border-b border-white/5 text-zinc-300">
                {ctx.text ?? ctx.title ?? ctx.content ?? JSON.stringify(ctx).slice(0, 150)}
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-xs font-mono text-zinc-500">Click "Load Context" to fetch semantic evidence matches.</p>
        {/if}
      </div>

      <!-- Knowledge Base / Laws Glossary -->
      <div class="bg-black/25 p-4 rounded border border-white/5">
        <div class="flex justify-between items-center mb-2.5">
          <h3 class="text-xs font-mono uppercase tracking-widest text-[#bad0ff] flex items-center gap-2">
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-[#bad0ff]"></span>
            Knowledge Base / Laws Glossary
          </h3>
          <button
            onclick={() => searchKnowledge(caseData?.title ?? 'legal')}
            class="px-3 py-1 bg-black/40 border border-sand/30 hover:border-sand/60 text-sand/80 hover:text-white font-mono text-[11px] uppercase rounded transition-colors"
          >
            Search KB
          </button>
        </div>
        {#if knowledgeResults.length > 0}
          <div class="max-h-36 overflow-y-auto space-y-1.5 border border-white/10 rounded p-2 bg-black/40 font-mono text-xs">
            {#each knowledgeResults as kbItem, i}
              <div class="p-2 bg-black/20 border-b border-white/5 text-zinc-300">
                <strong class="text-[#f3d471]">{kbItem.title ?? kbItem.name ?? `Result ${i + 1}`}</strong>
                {#if kbItem.content || kbItem.text}
                  <div class="text-zinc-400 mt-1 leading-snug">{(kbItem.content ?? kbItem.text ?? '').slice(0, 120)}...</div>
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-xs font-mono text-zinc-500">Click "Search KB" to query the laws glossary.</p>
        {/if}
      </div>

      <!-- Action Footer -->
      <div class="flex justify-between items-center pt-3 border-t border-white/10">
        <span class="text-[11px] font-mono text-sand/70">RAG + KAG Multi-Modal Synthesis Active</span>
        <button
          type="button"
          onclick={() => { showYoRHaDetails = false; }}
          class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black/40 hover:bg-black/60 border border-sand/40 text-sand font-mono text-xs uppercase tracking-wider rounded transition-colors"
        >
          <span>Close Intel Hub</span>
        </button>
      </div>
    </div>
  {/snippet}
</YoRHaModal>

<!-- Case Document Writer Dialog (Triggered via Top Tactical Toolbar 'Write Doc') -->
<CaseDocumentWriter bind:isOpen={showDocumentWriter} />
</div>

<style>
  /* ── Royal Legal Dossier × NieR: Automata Architectural Surface ────── */
  .dossier-workspace {
    background:
      radial-gradient(circle at 18% 0%, rgba(201, 168, 106, 0.08), transparent 44%),
      linear-gradient(180deg, #ECE7DC 0%, #E6E0D3 280px, #E2DBD0 100%);
    color: #1E1A17;
    font-family: 'Inter', 'InterLocal', system-ui, -apple-system, 'Segoe UI', sans-serif;
  }

  /* ── Deep Prussian Slate Hero Banner + Astrolabe + NieR Hairline ───── */
  .hud-command-bar {
    position: relative;
    overflow: hidden;
    background:
      radial-gradient(circle at 78% 32%, rgba(201, 168, 106, 0.13), transparent 42%),
      radial-gradient(circle at 14% 60%, rgba(46, 76, 109, 0.24), transparent 48%),
      linear-gradient(180deg, #161C25 0%, #1D2531 65%, #161C24 100%);
    border-bottom: 1px solid #C9A86A;
    box-shadow: 0 10px 28px -10px rgba(10, 13, 19, 0.55);
  }

  .hud-astrolabe-watermark {
    position: absolute;
    right: -14px;
    top: -32px;
    width: 248px;
    height: 248px;
    color: #E5C77B;
    opacity: 0.14;
    pointer-events: none;
    z-index: 1;
  }

  .hud-command-gold-rule {
    position: absolute;
    inset: 0 0 auto 0;
    height: 1.5px;
    background: linear-gradient(90deg, transparent 4%, #C9A86A 30%, #F0D78C 50%, #C9A86A 70%, transparent 96%);
    opacity: 0.85;
    pointer-events: none;
    z-index: 3;
  }

  .hud-back-link {
    display: inline-flex;
    align-items: center;
    gap: 0.38rem;
    font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #E5C77B;
    text-decoration: none;
    transition: color 0.15s ease;
  }
  .hud-back-link:hover {
    color: #FFFFFF;
  }

  .hud-meta-pill {
    display: inline-flex;
    align-items: center;
    height: 24px;
    padding: 0 0.72rem;
    border-radius: 9999px;
    background: #FFFFFF;
    border: 1px solid #E2D5C5;
    font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
    font-size: 0.63rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #483D36;
    box-shadow: 0 2px 6px rgba(72, 61, 54, 0.04);
  }

  .hud-meta-pill-gold {
    background: #FFF3CC;
    border-color: #EDD282;
    color: #483D36;
  }

  /* Jewel-Toned Soft Pill Badges */
  .hud-jewel-badge {
    display: inline-flex;
    align-items: center;
    height: 24px;
    padding: 0 0.75rem;
    border-radius: 9999px;
    border: 1px solid #E2D5C5;
    font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
    font-size: 0.63rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #231E1B;
    background: #FFFFFF;
    box-shadow: 0 2px 6px rgba(72, 61, 54, 0.04);
  }
  .hud-badge-slate { background: #EAE6DF; border-color: #D5C7B7; color: #483D36; }
  .hud-badge-sage  { background: #E1F5EC; border-color: #A3DEC8; color: #1B5846; }

  .hud-case-title {
    font-family: 'Cinzel', 'Cormorant Garamond', Georgia, 'Palatino Linotype', serif !important;
    font-style: normal;
    font-size: 1.56rem;
    font-weight: 600;
    letter-spacing: 0.045em;
    text-transform: none !important;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.42) !important;
    border-bottom: none !important;
    padding-bottom: 0 !important;
    color: #F6F2EA;
    margin: 0;
    line-height: 1.2;
  }

  /* NieR: Automata Signature Diamond-Pip Hairline Rule */
  .hud-nier-rule {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin-top: 0.42rem;
    max-width: 460px;
  }
  .hud-nier-dot {
    width: 4px;
    height: 4px;
    border-radius: 9999px;
    background: #C9A86A;
    flex-shrink: 0;
  }
  .hud-nier-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, rgba(201, 168, 106, 0.78), rgba(201, 168, 106, 0.35));
  }
  .hud-nier-line-short {
    max-width: 68px;
  }
  .hud-nier-diamond {
    font-size: 0.6rem;
    line-height: 1;
    color: #E5C77B;
  }

  .hud-case-subtitle {
    margin: 0.32rem 0 0 0;
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 0.96rem;
    font-weight: 500;
    letter-spacing: 0.02em;
    color: #D2C9BA;
  }

  .hud-rename-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    height: 26px;
    padding: 0 0.75rem;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.09);
    border: 1px solid rgba(201, 168, 106, 0.55);
    color: #FFE59A;
    font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    cursor: pointer;
    transition: all 0.14s ease;
  }
  .hud-rename-pill:hover {
    background: #5C493F;
    border-color: #FFE59A;
    color: #FFFFFF;
  }

  .hud-title-input {
    min-width: min(400px, 70vw);
    height: 34px;
    padding: 0 0.85rem;
    border-radius: 9999px;
    background: #FAF8F4;
    border: 1px solid #C9A86A;
    color: #1E1A17;
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 1.05rem;
    font-weight: 600;
    outline: none;
  }

  /* ── Bottom Architectural Telemetry Strip ──────────────────────────── */
  .hud-crystarium-ribbon {
    position: relative;
    z-index: 5;
    min-height: 28px;
    padding: 0.24rem 0;
    background: rgba(12, 16, 22, 0.76);
    border-top: 1px solid rgba(201, 168, 106, 0.28);
  }

  .hud-ribbon-item {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    white-space: nowrap;
  }

  .hud-ribbon-key {
    font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #9A9082;
  }

  .hud-ribbon-val {
    font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
    font-size: 0.66rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #EFEAE0;
  }

  .hud-ribbon-sep {
    font-size: 0.5rem;
    color: rgba(201, 168, 106, 0.65);
  }

  /* ── Soft Full-Pill Toolbar Buttons ────────────────────────────────── */
  .hud-toolbar-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    height: 31px;
    padding: 0 0.85rem;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(201, 168, 106, 0.45);
    color: #FFFDF9;
    font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
    cursor: pointer;
    box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.2);
    transition: all 0.15s ease;
  }
  .hud-toolbar-btn:hover:not(:disabled) {
    background: rgba(201, 168, 106, 0.22);
    border-color: #FFE59A;
    color: #FFFFFF;
    transform: translateY(-1px);
  }
  .hud-toolbar-btn-active {
    background: rgba(201, 168, 106, 0.32);
    border-color: #FFE59A;
    color: #FFFDF9;
  }

  /* Miyama Signature Primary Pill (Export Packet) */
  .hud-toolbar-btn-gold {
    background: #1F1B18;
    border-color: #483D36;
    color: #FFFDF9;
    box-shadow: 0 4px 12px -3px rgba(31, 27, 24, 0.32);
  }
  .hud-toolbar-btn-gold:hover:not(:disabled) {
    background: #332A25;
    border-color: #B97F62;
    color: #FFE59A;
  }
  .hud-toolbar-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  :global(.hud-tooltip-pop) {
    z-index: 9995;
    padding: 0.35rem 0.65rem;
    border-radius: 9999px;
    background: #231E1B;
    border: 1px solid #483D36;
    color: #FFFDF9;
    font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
    font-size: 0.68rem;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
  }

  .dossier-archival-notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.65rem 1.1rem;
    border-radius: 16px;
    background: #FAF3E8;
    border: 1px solid #E6DACB;
    box-shadow: 0 2px 6px rgba(72, 61, 54, 0.04);
  }

  .dossier-notice-seal {
    width: 24px;
    height: 24px;
    border-radius: 9999px;
    background: #5C493F;
    color: #FFE59A;
    height: 22px;
    border-radius: 3px;
    background: #7A1B18;
    color: #F6F3EF;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* ── Double-Filigree Frame & Botanical Corner Ornaments ────────────── */
  .dossier-arcana-inner {
    position: absolute;
    inset: 6px;
    border: 1px solid rgba(185, 127, 98, 0.22);
    border-radius: 16px;
    pointer-events: none;
    z-index: 2;
  }

  .dossier-star {
    position: absolute;
    font-size: 9px;
    line-height: 1;
    color: #B97F62;
    opacity: 0.65;
    pointer-events: none;
    z-index: 4;
  }
  .dossier-star-tl { top: 9px; left: 11px; }
  .dossier-star-tr { top: 9px; right: 11px; }
  .dossier-star-bl { bottom: 9px; left: 11px; }
  .dossier-star-br { bottom: 9px; right: 11px; }

  /* ── Soft Floating Bento Pill Dock (replaces rigid grid) ──────────── */
  .dossier-tab-shell {
    position: relative;
    background: #FAF4EB;
    border: 1px solid #E6DBCF;
    border-radius: 9999px;
    padding: 5px;
    box-shadow: 0 4px 16px -6px rgba(72, 61, 54, 0.08);
    overflow: hidden;
  }

  .dossier-tab-scroll {
    position: relative;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 6px;
    border: none;
    border-radius: 9999px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .dossier-tab-scroll::-webkit-scrollbar {
    display: none;
  }

  .dossier-tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    height: 33px;
    padding: 0 0.95rem;
    border-radius: 9999px;
    border: 1px solid transparent;
    background: transparent;
    color: #5C493F;
    font-family: 'Inter', 'InterLocal', system-ui, -apple-system, sans-serif;
    font-size: 0.71rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.16s ease;
  }
  .dossier-tab-btn-idle:hover {
    background: #FFFFFF;
    border-color: #E2D7C9;
    color: #231E1B;
    transform: translateY(-1px);
  }
  .dossier-tab-btn-active {
    background: #231E1B;
    border-color: #3D342E;
    color: #FFFDF9;
    box-shadow: 0 4px 12px -3px rgba(35, 30, 27, 0.28);
  }

  .dossier-tab-count {
    font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
    font-size: 0.64rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.9;
    color: #FFE59A;
  }

  /* ── Soft Bento × RYUO Botanical Silk-Cream Cards ──────────────────── */
  .dossier-card {
    position: relative;
    background: linear-gradient(180deg, #FFFCF9 0%, #FAF4EC 100%);
    border: 1px solid #E2D7C9;
    border-radius: 22px;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.9) inset,
      0 12px 32px -12px rgba(72, 61, 54, 0.09);
    overflow: hidden;
  }

  .dossier-sheen {
    display: none;
  }

  .dossier-card-header {
    position: relative;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.95rem 1.15rem 0.6rem;
    background: transparent;
    border-bottom: 1px solid rgba(226, 215, 201, 0.65);
  }

  /* RYUOpresents Roasted-Mocha Header Plaque */
  .dossier-plaque {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.28rem 0.85rem;
    border-radius: 9999px;
    background: linear-gradient(180deg, #5C493F 0%, #483D36 100%);
    border: 1px solid #C9BCAB;
    box-shadow: 0 3px 10px -3px rgba(72, 61, 54, 0.28);
    flex-shrink: 0;
  }

  .dossier-emblem {
    width: 24px;
    height: 24px;
    border-radius: 9999px;
    background: #5C493F;
    border: 1px solid #C9BCAB;
    color: #FFE59A;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .dossier-card-title {
    font-family: 'Cinzel', 'Cormorant Garamond', Georgia, serif !important;
    font-style: normal;
    font-size: 0.76rem;
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    text-shadow: none !important;
    border: none !important;
    color: #FFFDF9;
    margin: 0;
    line-height: 1.2;
  }

  .dossier-card-sub {
    font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: #7A5A4A;
    margin: 0;
  }

  .dossier-card-body {
    position: relative;
    z-index: 3;
    padding: 0.95rem 1.15rem;
  }

  .dossier-mono-chip {
    padding: 0.2rem 0.65rem;
    border-radius: 9999px;
    background: #F4ECE1;
    border: 1px solid #E2D5C5;
    font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
    font-size: 0.62rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #7A5A4A;
  }

  .dossier-action-btn {
    height: 33px;
    padding: 0 0.95rem;
    border-radius: 9999px;
    background: #1F1B18;
    border: 1px solid #3D342E;
    color: #FFFDF9;
    font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
    font-size: 0.71rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: 0 4px 12px -3px rgba(31, 27, 24, 0.24);
    transition: all 0.16s ease;
  }
  .dossier-action-btn:hover {
    background: #332A25;
    border-color: #B97F62;
    color: #FFE59A;
  }

  .dossier-mini-pill {
    height: 27px;
    padding: 0 0.72rem;
    border-radius: 9999px;
    background: #FFFFFF;
    border: 1px solid #E2D7C9;
    color: #483D36;
    font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
    font-size: 0.67rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(72, 61, 54, 0.04);
    transition: all 0.14s ease;
  }
  .dossier-mini-pill:hover {
    border-color: #B97F62;
    color: #1F1B18;
  }
  .dossier-mini-pill-active {
    background: #231E1B;
    border-color: #3D342E;
    color: #FFE59A;
  }

  /* ── Soft Botanical Evidentiary Dropzone ────────────────────────────── */
  .dossier-dropzone {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1.6rem 1.2rem;
    border-radius: 18px;
    border: 1.5px dashed #D5C7B7;
    background: linear-gradient(180deg, #FFFDFB 0%, #F9F3EA 100%);
    text-align: center;
    cursor: pointer;
    box-shadow: 0 4px 16px -6px rgba(72, 61, 54, 0.05);
    transition: all 0.18s ease;
  }
  .dossier-dropzone:hover {
    background: #FFFDF9;
    border-color: #B97F62;
    box-shadow: 0 8px 24px -8px rgba(185, 127, 98, 0.18);
  }
  .dossier-dropzone-dragover {
    background: #FFF8EE !important;
    border-color: #B97F62 !important;
    border-style: solid !important;
    transform: scale(1.01);
    box-shadow: 0 12px 32px -6px rgba(185, 127, 98, 0.28) !important;
  }

  .dz-corner {
    position: absolute;
    width: 12px;
    height: 12px;
    pointer-events: none;
  }
  .dz-tl { top: 8px; left: 8px; border-top: 2px solid #C9BCAB; border-left: 2px solid #C9BCAB; border-top-left-radius: 4px; }
  .dz-tr { top: 8px; right: 8px; border-top: 2px solid #C9BCAB; border-right: 2px solid #C9BCAB; border-top-right-radius: 4px; }
  .dz-bl { bottom: 8px; left: 8px; border-bottom: 2px solid #C9BCAB; border-left: 2px solid #C9BCAB; border-bottom-left-radius: 4px; }
  .dz-br { bottom: 8px; right: 8px; border-bottom: 2px solid #C9BCAB; border-right: 2px solid #C9BCAB; border-bottom-right-radius: 4px; }

  .dossier-dropzone-medallion {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 9999px;
    background: linear-gradient(180deg, #5C493F 0%, #483D36 100%);
    border: 1px solid #C9BCAB;
    color: #FFE59A;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 0.75rem;
    box-shadow:
      0 0 0 4px rgba(255, 229, 154, 0.35),
      0 8px 18px -4px rgba(72, 61, 54, 0.22);
  }

  .dossier-medallion-ring {
    position: absolute;
    inset: -6px;
    border-radius: 9999px;
    border: 1px dashed rgba(185, 127, 98, 0.45);
    pointer-events: none;
  }

  .dossier-dropzone-title {
    font-family: 'Cinzel', 'Cormorant Garamond', Georgia, serif;
    font-size: 0.86rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: #2B241F;
    margin: 0;
  }

  .dossier-dropzone-meta {
    font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
    font-size: 0.71rem;
    font-weight: 400;
    letter-spacing: 0.02em;
    color: #7A5A4A;
    margin: 0.35rem 0 0 0;
  }

  .dossier-empty-ledger {
    padding: 1.4rem 1rem;
    text-align: center;
    border: 1px dashed #DFCFC0;
    border-radius: 16px;
    background: #FAF4EB;
  }

  .dossier-empty-star {
    display: inline-block;
    font-size: 0.85rem;
    color: #B97F62;
    margin-bottom: 0.25rem;
  }

  .dossier-ledger-row {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.65rem 0.95rem;
    border-radius: 14px;
    border: 1px solid #E6DBCF;
    background: #FFFFFF;
    text-align: left;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(72, 61, 54, 0.04);
    transition: all 0.15s ease;
  }
  .dossier-ledger-row:hover {
    background: #FFF9F2;
    border-color: #B97F62;
    transform: translateY(-1px);
  }
  .dossier-ledger-row-active {
    background: #FAF2E8;
    border-color: #B97F62;
    box-shadow: inset 3px 0 0 #B97F62, 0 4px 12px -4px rgba(185, 127, 98, 0.16);
  }

  .dossier-row-icon {
    width: 30px;
    height: 30px;
    border-radius: 10px;
    background: linear-gradient(180deg, #5C493F 0%, #483D36 100%);
    border: 1px solid #C9BCAB;
    color: #FFE59A;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .dossier-status-pill {
    padding: 0.22rem 0.65rem;
    border-radius: 9999px;
    font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
    font-size: 0.63rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    flex-shrink: 0;
  }
  .dossier-status-pending { background: #FFF3CC; color: #73510A; border: 1px solid #EDD282; }
  .dossier-status-approved { background: #E1F5EC; color: #1B5846; border: 1px solid #A3DEC8; }
  .dossier-status-rejected { background: #FDE8EA; color: #9E3544; border: 1px solid #F5B0BA; }

  /* ── Soft Bento Case Telemetry List & Pill Plates ───────────────────── */
  .telemetry-bento-list {
    position: relative;
    z-index: 3;
    padding: 0.75rem 1.15rem 1.15rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .telemetry-pill-plate {
    padding: 0.55rem 0.85rem;
    background: #FFFFFF;
    border: 1px solid #E6DCD0;
    border-radius: 14px;
    box-shadow: 0 2px 6px rgba(72, 61, 54, 0.04);
  }

  .telemetry-row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.35rem;
  }

  .telemetry-label {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
    font-size: 0.72rem;
    font-weight: 600;
    color: #483D36;
  }

  .telemetry-dot {
    width: 8px;
    height: 8px;
    border-radius: 9999px;
    flex-shrink: 0;
  }

  .telemetry-val {
    font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
    font-size: 0.76rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #231E1B;
  }

  .telemetry-track {
    width: 100%;
    height: 6px;
    border-radius: 9999px;
    background: #F4EBE0;
    overflow: hidden;
  }

  .telemetry-fill {
    height: 100%;
    border-radius: 9999px;
    transition: width 0.3s ease;
  }
  .telemetry-fill-butter { background: linear-gradient(90deg, #FFE59A, #F5D375); }
  .telemetry-fill-sakura { background: linear-gradient(90deg, #F6C1C8, #E8A7B1); }
  .telemetry-fill-sage   { background: linear-gradient(90deg, #B7E1D1, #8FD4BC); }
  .telemetry-fill-sky    { background: linear-gradient(90deg, #A9D3FF, #7BB7F7); }
  .telemetry-fill-mocha  { background: linear-gradient(90deg, #B97F62, #9E6549); }

  .bento-soft-well {
    padding: 1.1rem 0.85rem;
    border-radius: 16px;
    background: #FAF4EB;
    border: 1px dashed #E2D7C9;
  }
</style>
