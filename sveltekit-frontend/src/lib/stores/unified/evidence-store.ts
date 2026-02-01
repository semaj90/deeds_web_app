import { derived, writable } from 'svelte/store';

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

interface EvidenceStoreState {
    evidence: EvidenceFile[];
	filteredEvidence: EvidenceFile[];
    activeCaseId: string | null;
    selectedEvidenceId: string | null;
    uploadProgress: Map<string, number>;
    uploadingFiles: File[];
	isUploading: boolean;
    analysisResults: Map<string, AnalysisResult>;
    analysisStatus: Map<string, AnalysisStatus>;
    isAnalyzing: boolean;
	chainOfCustody: Map<string, ChainOfCustodyEntry[]>;
    typeFilter: EvidenceType[];
	searchQuery: string;
    totalEvidence: number;
	isLoading: boolean;
    error: string | null;
    lastUpdated: number;
}

const initialState: EvidenceStoreState = {
    evidence: [],
    filteredEvidence: [],
    activeCaseId: null,
    selectedEvidenceId: null,
    uploadProgress: new Map(),
    uploadingFiles: [],
    isUploading: false,
    analysisResults: new Map(),
    analysisStatus: new Map(),
    isAnalyzing: false,
    chainOfCustody: new Map(),
    typeFilter: [],
    searchQuery: '',
    totalEvidence: 0,
    isLoading: false,
    error: null,
    lastUpdated: 0
};

function createEvidenceStore() {
    const { subscribe, update } = writable<EvidenceStoreState>(initialState);

    return {
        subscribe,
        loadEvidence: async (caseId: string) => {
            update(s => ({ ...s, activeCaseId: caseId, isLoading: true }));
            try {
                const response = await fetch(`/api/cases/${caseId}/evidence`);
                if (response.ok) {
                    const data = await response.json();
                    const evidence: EvidenceFile[] = data?.evidence || [];
                    update(s => ({
                        ...s,
                        evidence,
                        filteredEvidence: evidence,
                        totalEvidence: evidence.length,
                        lastUpdated: Date.now(),
                        isLoading: false
                    }));
                } else {
                    throw new Error('Failed to load evidence');
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Failed to load evidence';
                update(s => ({ ...s, error: errorMsg, isLoading: false }));
            }
        },
	uploadEvidence: async (file: File, metadata: {
	caseId: string; type: EvidenceType; tags?: string[]; description?: string }) => {
            const fileId = `ev-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            update(s => ({
                ...s,
                uploadingFiles: [...s.uploadingFiles, file],
                uploadProgress: new Map(s.uploadProgress).set(fileId, 0),
                isUploading: true
            }));
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
                    update(s => ({
                        ...s,
                        evidence: [evidenceFile, ...s.evidence],
                        filteredEvidence: [evidenceFile, ...s.filteredEvidence],
                        totalEvidence: s.totalEvidence + 1,
                        uploadingFiles: s.uploadingFiles.filter(f => f !== file),
                        isUploading: s.uploadingFiles.length > 1
                    }));
                    return evidenceFile;
                } else {
                    throw new Error('Upload failed');
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Upload failed';
                update(s => ({ ...s, error: errorMsg, isUploading: false }));
                throw new Error(errorMsg);
            }
        },
	searchEvidence: (query: string) => {
            update(s => {
                const lowerQuery = query.toLowerCase();
                const filtered = s.evidence.filter(e =>
                    e.name.toLowerCase().includes(lowerQuery) ||
                    e.description?.toLowerCase().includes(lowerQuery) ||
                    e.tags?.some(t => t.toLowerCase().includes(lowerQuery))
                );
                return { ...s, searchQuery: query, filteredEvidence: filtered };
            });
        },
	clearFilters: () => {
            update(s => ({ ...s, typeFilter: [], searchQuery: '', filteredEvidence: s.evidence }));
        }
    };
}

export const evidenceStore = createEvidenceStore();
export const evidence = derived(evidenceStore, $store => $store.evidence);
export const filteredEvidence = derived(evidenceStore, $store => $store.filteredEvidence);






