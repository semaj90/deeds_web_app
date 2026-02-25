import { z } from 'zod';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

/**
 * File Upload Schemas with Zod Validation
 * Cleaned and consistent Zod schemas for frontend use
 */

// File type enumeration
export const fileTypeEnum = z.enum([
    'document',
    'image',
    'video',
    'audio',
    'physical',
    'digital',
    'testimony',
    'contract',
    'evidence'
]);
export type FileType = z.infer<typeof fileTypeEnum>;

// Evidence type classification
export const evidenceTypeEnum = z.enum([
    'physical_evidence',
    'digital_evidence',
    'witness_testimony',
    'expert_opinion',
    'documents',
    'photographs',
    'video_recording',
    'audio_recording',
    'forensic_analysis',
    'chain_of_custody'
]);

// Confidentiality levels
export const confidentialityLevelEnum = z.enum([
    'public',
    'standard',
    'confidential',
    'classified',
    'restricted'
]);

// Case priority levels
export const casePriorityEnum = z.enum([
    'low',
    'medium',
    'high',
    'urgent',
    'critical'
]);

// Common allowed MIME types
export const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'video/mp4',
    'video/avi',
    'video/quicktime',
    'video/mov',
    'video/wmv',
    'video/webm',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/m4a',
    'audio/aac',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'application/json',
    'application/zip',
    'application/x-rar-compressed'
];

// Chain of custody entry schema
export const chainOfCustodyEntrySchema = z.object({
    timestamp: z.string().datetime(),
    officer: z.string().min(1, 'Officer name is required'),
    action: z.enum(['collected', 'transferred', 'analyzed', 'stored', 'returned']),
    location: z.string().min(1, 'Location is required'),
    notes: z.string().optional(),
    signature: z.string().optional()
});

export const validateFileType = (file: File, allowedTypes: string[] = allowedMimeTypes): boolean => {
    if (!file || typeof file.type !== 'string') return false;
    return allowedTypes.includes(file.type);
}

export const getFileCategory = (mimeType: string): FileType => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return 'document';
    return 'digital';
}

export const formatFileSize = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(Math.round(bytes / Math.pow(1024, i) * 100) / 100).toFixed(2)} ${sizes[i]}`;
}

export interface FileUpload {
    title: string;
	description: string;
    evidenceType: z.infer<typeof evidenceTypeEnum>;
    fileType: FileType;
	tags: string[];
    confidentialityLevel: z.infer<typeof confidentialityLevelEnum>;
    isAdmissible: boolean;
	enableAiAnalysis: boolean;
    enableOcr: boolean;
	enableEmbeddings: boolean;
    enableSummarization: boolean;
	chainOfCustody: z.infer<typeof chainOfCustodyEntrySchema>[];
    metadata: Record<string, unknown>;
}

// Default form values
export const defaultFileUploadValues: Partial<FileUpload> = {
    title: '',
    description: '',
    evidenceType: 'documents',
    fileType: 'document',
    tags: [],
    confidentialityLevel: 'standard',
    isAdmissible: true,
    enableAiAnalysis: true,
    enableOcr: true,
    enableEmbeddings: true,
    enableSummarization: true,
    chainOfCustody: [],
    metadata: {}
};

// Assuming CaseWithFiles interface needs to be defined or is meant to be exported
export interface CaseWithFiles {
    title: string;
	caseNumber: string;
    description: string;
	category: string;
    priority: z.infer<typeof casePriorityEnum>;
    assignedTeam: string[];
	tags: string[];
    files: File[];
	fileDescriptions: string[];
    fileTitles: string[];
	fileTypes: string[];
    fileEvidenceTypes: string[];
}

export const defaultCaseWithFilesValues: Partial<CaseWithFiles> = {
    title: '',
    caseNumber: '',
    description: '',
    category: '',
    priority: 'medium',
    assignedTeam: [],
    tags: [],
    files: [],
    fileDescriptions: [],
    fileTitles: [],
    fileTypes: [],
    fileEvidenceTypes: []
};




