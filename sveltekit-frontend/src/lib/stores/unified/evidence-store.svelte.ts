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

type EvidenceUploadResponse = Partial<EvidenceFile> & {
  evidence?: Partial<EvidenceFile>;
  data?: Record<string, unknown>;
  id?: string;
  fileName?: string;
  originalName?: string;
  fileSize?: number;
  mimeType?: string;
  hash?: string;
  uploadedBy?: string;
  uploadedAt?: number;
  caseId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  jobId?: string;
  minioKey?: string;
  status?: string;
};

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
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q) ||
          e.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (this.typeFilter.length > 0) {
      result = result.filter((e) => this.typeFilter.includes(e.type));
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

  async uploadEvidence(
    file: File,
    metadata: { caseId: string; type: EvidenceType; tags?: string[]; description?: string }
  ) {
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
        const data = (await response.json()) as EvidenceUploadResponse;
        const payload = data.evidence ?? (data.data as Partial<EvidenceFile> | undefined) ?? data;
        const evidenceFile: EvidenceFile = {
          id: String(payload.id ?? data.id ?? crypto.randomUUID()),
          name: String(payload.name ?? data.originalName ?? data.fileName ?? file.name),
          type: (payload.type ?? metadata.type ?? 'document') as EvidenceType,
          mimeType: String(
            payload.mimeType ?? data.mimeType ?? file.type ?? 'application/octet-stream'
          ),
          size: Number(payload.size ?? data.fileSize ?? file.size),
          caseId: String(payload.caseId ?? data.caseId ?? metadata.caseId),
          hash: String(payload.hash ?? data.hash ?? ''),
          uploadedBy: String(payload.uploadedBy ?? data.uploadedBy ?? ''),
          uploadedAt: Number(payload.uploadedAt ?? data.uploadedAt ?? Date.now()),
          tags: payload.tags ?? metadata.tags ?? [],
          description: String(
            payload.description ?? data.description ?? metadata.description ?? ''
          ),
          metadata: {
            ...(payload.metadata ?? {}),
            evidenceType: payload.type ?? metadata.type,
            uploadedAt: Number(payload.uploadedAt ?? data.uploadedAt ?? Date.now()),
            jobId: data.jobId,
            status: data.status,
            minioKey: data.minioKey,
          },
        };
        this.evidence = [evidenceFile, ...this.evidence];
        this.totalEvidence = this.totalEvidence + 1;
        const nextProgress = new Map(this.uploadProgress);
        nextProgress.delete(fileId);
        this.uploadProgress = nextProgress;
        this.uploadingFiles = this.uploadingFiles.filter((f) => f !== file);
        this.isUploading = this.uploadingFiles.length > 0;
        return {
          ...data,
          ...evidenceFile,
          fileName: data.fileName ?? file.name,
          originalName: data.originalName ?? file.name,
          fileSize: data.fileSize ?? file.size,
          evidence: evidenceFile,
        };
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
