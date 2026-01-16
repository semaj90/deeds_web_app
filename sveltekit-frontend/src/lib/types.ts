// Central shared type definitions (incremental widening to unblock svelte-check)| 'default'
 | 'primary'
 | 'secondary'
 | 'destructive'
 | 'outline'
 | 'ghost'
 | 'link'
 | 'danger'
 | 'success'
 | 'warning'
 | 'info'
 | 'nier'
 | 'crimson'
 | 'gold'
 | 'case'
 | 'evidence'
 | 'legal';

export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

// Transitional FormField type: allow known union plus fallback: string to avoid blocking builds| 'text'
 | 'number'
 | 'date'
 | 'email'
 | 'select'
 | 'file'
 | 'textarea'
 | 'password'
 | 'checkbox'
 | 'radio';

export interface FormField {
 id: string; label: string;
 type: string; // Changed from FormFieldType | (string & {})
 required?: boolean;
 options?: { value: string; label: string }[]; // Corrected syntax for options array
}

export interface ModalProps {
 isOpen: boolean;
 title?: string;
 subtitle?: string;
 submitLabel?: string;
 cancelLabel?: string;
 fields?: FormField[];
}

// Placeholder User type (adjust later with real user domain model)
export interface User {
 id: string;
 name?: string;
 firstName?: string;
 lastName?: string;
 email?: string;
 role?: string;
 avatarUrl?: string;
 isActive?: boolean;
 emailVerified?: boolean;
}

// Person of Interest types for POI management
export interface PhysicalDescription {
 height?: string;
 weight?: string;
 hair?: string;
 eyes?: string;
 distinguishingMarks?: string;
}

export interface ProfileData {
 modusOperandi?: string;
 knownHabits?: string[];
 associates?: string[];
}| 'person_of_interest'
 | 'witness'
 | 'suspect'
 | 'victim'
 | 'informant'
 | 'active'
 | 'inactive'
 | 'archived';
export type PoiPriority = 'low' | 'medium' | 'high' | 'critical';
export type PoiThreatLevel = 'low' | 'medium' | 'high' | 'extreme';

export interface PersonOfInterest {
 id?: string; name: string;
 aliases?: string[];
 dateOfBirth?: string;
 address?: string;
 phone?: string;
 email?: string; status: PoiStatus;
 priority: PoiPriority; threatLevel: PoiThreatLevel;
 physicalDescription?: PhysicalDescription;
 profileData?: ProfileData;
 lastKnownLocation?: string;
 lastSeen?: string;
 dangerLevel?: number;
 notes?: string;
 riskScore?: number;
 aiGenerated?: boolean;
 createdAt?: string;
 updatedAt?: string;
}

// --- Added Unified Types (API / AI / DB / Canvas / GPU / State Machine) ---
export type ServiceStatus = 'operational' | 'degraded' | 'offline' | 'unknown';

export interface APIResponse<T> {
 success: boolean;
 data?: T;
 error?: { code: string; message: string };
 metadata?: { timestamp: string; processingTimeMs: number };
}

export interface FormSubmissionResult<T = unknown> {
 // Changed from T = any
 success: boolean;
 data?: T;
 errors?: Record<string, string[]>;
 metadata?: { requestId: string; timestamp: string; processingTimeMs: number };
}

// AI / Worker| 'generate'
 | 'analyze'
 | 'embed'
 | 'search'
 | 'embedding'
 | 'analysis'
 | 'classification'
 | 'summarization';| 'error'
 | 'status'
 | 'result'
 | 'task'
 | 'TASK_STARTED'
 | 'TASK_COMPLETED'
 | 'TASK_ERROR'
 | 'TASK_CANCELLED'
 | 'STATUS_UPDATE';

export interface AITask {
 taskId: string; type: AITaskType;
 providerId: string; model: string;
 prompt: string; timestamp: number;
 priority: 'low' | 'medium' | 'high';
 [key: string]: unknown; // Corrected syntax
}

export interface WorkerStatus {
 status: 'idle' | 'processing' | 'error';
 activeRequests: number; queueLength: number;
 providers: { id: string; status: ServiceStatus }[]; // Corrected syntax
 maxConcurrent: number; uptime: number;
 totalProcessed: number; errors: number;
 performance: { avgTaskTime: number; tasksPerMinute: number }; // Corrected syntax
 lastActivity: Date;
}

export interface WorkerMessage {
 taskId?: string; type: WorkerMessageType;
 data?: any;
 payload?: AITask | APIResponse<unknown> | WorkerStatus;
}

// Copilot & RAG
export type CopilotSource = 'context7_mcp' | 'enhanced_local_index' | 'basic_index';

export interface CopilotIndexEntry {
 id: string; content: string;
 score: number; source: CopilotSource;
 type: 'case' | 'document' | 'evidence' | 'statute';
 jurisdiction: string; practiceArea: string[];
 confidentialityLevel: number; lastModified: Date;
 fileSize: number; language: string;
 tags: string[];
}

export interface SimilarityResult {
 id: string; documentId: string;
 documentType: string; chunkIndex: number;
 content: string; score: number;
}

// Database / Evidence / Document (narrow versions - keep existing User above)
export interface Case {
 id: string; title: string;
 description: string | null;
 userId: string; status: string;
 createdAt: Date;
}

export interface Evidence {
 id: string; name: string;
 caseId: string; contentText: string | null;
 filePath: string | null;
 metadata: Record<string, unknown>; // Corrected syntax
 createdAt: Date;
}

export interface DocumentChunk {
 id: string; evidenceId: string;
 chunkText: string; chunkSequence: number;
}

// Canvas / NES engine
export interface CanvasState {
 id: string; animation: string;
 frame: number; fabricJSON: object;
 metadata: {
 duration?: number;
 transitions?: string[];
 userContext?: string[];
 confidence?: number;
 };
}

export interface CanvasAnimation {
 name: string; frames: CanvasState[];
 loop: boolean;
}

export interface UserActivityLog {
 timestamp: number; action: string;
 context: Record<string, unknown>; // Corrected syntax
 sessionId: string;
}

// GPU / Tensor
export type GPUTaskType = 'matrix_multiply' | 'convolution' | 'attention' | 'fft';

export interface GPUTaskRequest {
 taskId: string; type: GPUTaskType;
 inputs: number[][]; use_gpu: boolean;
 cache_key?: string;
}

export interface VertexBuffer {
 name: string; data: Float32Array; // Corrected syntax
}

// Global app state machine
export interface GlobalAppContext {
 user: { id: string; email: string } | null;
 activeCaseId: string | null;
 theme: 'light' | 'dark';
}| { type: 'LOGIN'; user: { id: string; email: string } }
 | { type: 'LOGOUT' }
 | { type: 'SET_CASE'; caseId: string } // Corrected syntax
 | { type: 'SET_THEME'; theme: 'light' | 'dark' };

// New types for Rerank functionality
export interface Candidate {
 id: string; text: string;
 relevanceScore?: number; // Added for MMR/Cross-encoder context
 diversityScore?: number;
 rerankedScore?: number;
 metadata?: Record<string, unknown>; // Corrected syntax
}

export interface RerankRequest {
 query: string; candidates: Candidate[];
 options?: { diversityLambda?: number };
}

// This file needs to export Case and Document types.
// Replace with your actual type definitions.

// Defining Document interface explicitly
export interface Document {
 id: string; name: string;
 // Add other common document properties if known: e.g.,
 // caseId?: string;
 // content?: string;
 // createdAt?: Date;
 // ... other properties
}




