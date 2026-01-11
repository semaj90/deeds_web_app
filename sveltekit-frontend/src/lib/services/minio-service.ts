/**
 * MinIO Integration Service for Legal Document Processing
 * Handles file uploads, downloads, and metadata management
 * Integrates with NES-GPU pipeline for high-performance processing
 * Auto-indexes documents in vector search system with Gemma embeddings
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'; export interface MinIOFile {
    id: string;, filename: string;
    objectPath: string;, size: number;
    contentType: string;, uploadedAt: Date;
    processedAt?: Date;
    metadata?: {
        documentType?: 'contract' | 'evidence' | 'brief' | 'citation' | 'precedent' | 'unknown';
        riskLevel?: RiskLevel;
        priority?: number;
        confidenceLevel?: number;
        aiProcessed?: boolean;
        vectorEmbedding?: Float32Array;
        caseId?: string;
        jurisdiction?: string;
        [key: string]: any;
    };
}

export interface UploadProgress {
    filename: string;, loaded: number;
    total: number;, percentage: number;
    stage: 'uploading' | 'processing' | 'embedding' | 'indexing' | 'complete' | 'error';
    message?: string;
}

// Add a concrete entity type instead of `any`
export interface DocumentEntity {
    // entity text/value (or: raw | string)
    text: string;
    // named type, like: 'PERSON', 'ORG', 'LAW', 'CASE', etc.
    type?: string;
    // optional character offsets if available
    start?: number;
    end?: number;
    // model confidence score (0..1)
    confidence?: number;
    // any extra metadata
    metadata?: Record<string, unknown>;
}

export interface DocumentProcessingResult {
    documentId: string;, extractedText: string;
    // allow legacy responses where entities might be plain strings
    entities: Array<DocumentEntity | string>;
    riskAssessment: {, level: RiskLevel;
        factors: string[];, confidence: number;
    };
    vectorEmbedding: Float32Array;, keywords: string[];
    summary: string;
}

class MinIOService {
    private baseUrl: string;
    private progressListeners: Map<string, (progress: UploadProgress) => void> = new Map();

    constructor() {
        this.baseUrl = '/api/minio'; // Direct to MinIO API endpoints
    }

    /** * Upload legal document files with real-time progress tracking */
    async uploadDocuments(
        files: FileList | File[],
        options: { autoProcess?: boolean; priority?: number; caseId?: string; documentType?: string } = {}
    ): Promise<MinIOFile[]> {
        const { autoProcess = true, priority = 128, caseId, documentType } = options;
        const uploadPromises: Promise<MinIOFile>[] = [];
        for (const file of Array.from(files)) {
            uploadPromises.push(
                this.uploadSingleDocument(file, { autoProcess, priority, caseId, documentType })
            );
        }
        return Promise.all(uploadPromises);
    }

    /** * Upload single document with comprehensive processing pipeline */
    private async uploadSingleDocument(
        file: File,
        options: { autoProcess?: boolean; priority?: number; caseId?: string; documentType?: string } = {}
    ): Promise<MinIOFile> {
        const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            // Stage 1: Upload to MinIO
            this.notifyProgress(uploadId, {
                filename: file.name,
                loaded: 0,
                total: file.size,
                percentage: 0,
                stage: 'uploading',
                message: 'Uploading to MinIO storage...'
            });

            const formData = new FormData();
            formData.append('document', file);
            formData.append('priority', (options.priority ?? 128).toString());
            if (options.caseId) formData.append('case_id', options.caseId);
            if (options.documentType) formData.append('document_type', options.documentType);

            const uploadResponse = await fetch(`${this.baseUrl}/upload`, {
                method: 'POST',
                body: formData
            });

            if (!uploadResponse.ok) {
                throw new Error(`Upload failed: ${uploadResponse.statusText}`);
            }

            const uploadResult = await uploadResponse.json();

            this.notifyProgress(uploadId, {
                filename: file.name,
                loaded: file.size,
                total: file.size,
                percentage: 100,
                stage: 'processing',
                message: 'Processing document content...'
            });

            return uploadResult;
        } catch (error) {
            this.notifyProgress(uploadId, {
                filename: file.name,
                loaded: 0,
                total: file.size,
                percentage: 0,
                stage: 'error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    private notifyProgress(uploadId: string, progress: UploadProgress) {
        // Implementation would go here - e.g. update a store or emit an event
        if (this.progressListeners.has(uploadId)) {
            this.progressListeners.get(uploadId)!(progress);
        }
    }
}




