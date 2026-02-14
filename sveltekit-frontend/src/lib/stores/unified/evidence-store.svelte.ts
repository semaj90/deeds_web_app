/**
 * Evidence Store — Svelte 5 Runes (Session 27)
 */

export type EvidenceType = 'document' | 'image' | 'video' | 'audio' | 'email' | 'forensic' | 'physical' | 'digital' | 'testimony' | 'other';
export type AnalysisStatus = 'pending' | 'processing' | 'complete' | 'error';

export interface EvidenceFile {
  id: string;
  name: string;
  type: EvidenceType;
  mimeType: string;
  size: number;
  caseId: string;
  hash: string;
  uploadedBy: string;
  uploadedAt: number;
  tags?: string[];
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface ChainOfCustodyEntry {
  id: string;
  evidenceId: string;
  handledBy: string;
  receivedAt: number;
  releasedAt?: number;
  location?: string;
  action: string;
  notes?: string;
}

export interface AnalysisResult {
  id: string;
  evidenceId: string;
  analysisType: string;
  status: AnalysisStatus;
  result?: unknown;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

class EvidenceStore {
  evidence = $state<EvidenceFile[]>([]);
  activeCaseId = $state<string | null>(null);
  selectedEvidenceId = $state<string | null>(null);
  uploadProgress = $state<Map<string, number>>(new Map());
  uploadingFiles = $state<File[]>([]);
  isUploading = $state(false);
  analysisResults = $state<Map<string, AnalysisResult>>(new Map());
  analysisStatus = $state<Map<string, AnalysisStatus>>(new Map());
  isAnalyzing = $state(false);
  chainOfCustody = $state<Map<string, ChainOfCustodyEntry[]>>(new Map());
  typeFilter = $state<EvidenceType[]>([]);
  searchQuery = $state('');
  totalEvidence = $state(0);
  isLoading = $state(false);
  error = $state<string | null>(null);
  lastUpdated = $state(0);

  filteredEvidence = $derived.by(() => {
    let result = this.evidence;
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q) ||
        e.tags?.some(t => t.toLowerCase().includes(q))
      );
    }
    if (this.typeFilter.length > 0) {
      result = result.filter(e => this.typeFilter.includes(e.type));
    }
    return result;
  });

  async loadEvidence(caseId: string) {
    this.activeCaseId = caseId;
    this.isLoading = true;
    try {
      const response = await fetch(`/api/cases/${caseId}/evidence`);
      if (response.ok) {
        const data = await response.json();
        this.evidence = data?.evidence || [];
        this.totalEvidence = this.evidence.length;
        this.lastUpdated = Date.now();
      } else {
        throw new Error('Failed to load evidence');
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load evidence';
    } finally {
      this.isLoading = false;
    }
  }

  async uploadEvidence(file: File, metadata: { caseId: string; type: EvidenceType; tags?: string[]; description?: string }) {
    const fileId = `ev-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.uploadingFiles = [...this.uploadingFiles, file];
    this.uploadProgress = new Map(this.uploadProgress).set(fileId, 0);
    this.isUploading = true;
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('caseId', metadata.caseId);
      formData.append('type', metadata.type);
      if (metadata.tags) formData.append('tags', JSON.stringify(metadata.tags));
      if (metadata.description) formData.append('description', metadata.description);

      const response = await fetch('/api/evidence/upload', { method: 'POST', body: formData });
      if (response.ok) {
        const data = await response.json();
        const evidenceFile: EvidenceFile = data.evidence;
        this.evidence = [evidenceFile, ...this.evidence];
        this.totalEvidence = this.totalEvidence + 1;
        this.uploadingFiles = this.uploadingFiles.filter(f => f !== file);
        this.isUploading = this.uploadingFiles.length > 0;
        return evidenceFile;
      } else {
        throw new Error('Upload failed');
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Upload failed';
      this.isUploading = false;
      throw err;
    }
  }

  searchEvidence(query: string) {
    this.searchQuery = query;
  }

  clearFilters() {
    this.typeFilter = [];
    this.searchQuery = '';
  }
}

export const evidenceStore = new EvidenceStore();
