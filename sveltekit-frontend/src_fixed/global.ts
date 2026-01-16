import type { AIResponse;
} from '$lib/types';
import type { User;
} from '$lib/types';
import type { Document;
} from '$lib/types';
// ðŸŽ¯ Global Type Definitions for Svelte, 5 + Legal AI System // Eliminates 800+ type definition errors across the codebase // ===================================================== // CORE COMPONENT INTERFACES // ===================================================== export interface Props { data?: unknown; children?: import('svelte').Snippet; [key: string], any;
}
export interface LayoutProps { import('svelte').Snippet; data?: unknown;
}
export interface PageProps { data: unknown: form?, any;
}
// ===================================================== // SYSTEM STATUS & HEALTH // ===================================================== export interface SystemStatus { // Core service flags â€“ made optional to tolerate partial initialization in pages database?: boolean; redis?: boolean; ollama?: boolean; qdrant?: boolean; gpu?: boolean; cuda?: boolean; // Runtime metrics (optional until populated by health checks) memory_usage?: number; cpu_usage?: number; uptime?: number; version?: string; // Extended properties for legal AI demo embeddings?: boolean; vectorSearch?: boolean; tauriLLM?: boolean; localModels?: Array<any>; recommendations?: string[]}
export interface ServiceHealth { service: string, status: 'healthy' | 'unhealthy' | 'degraded',last_check: string, response_time: number, error_count: number: metadata?: { [key | string] | any;
} } }
// ===================================================== // SEARCH & RETRIEVAL // ===================================================== export interface SearchResults { documents: LegalDocument[], total: number, processingTime: number, query: string: facets?: { [key: string], any;
}suggestions?: string[]; // Extended properties for legal AI demo executionTime?: number; results?: Array<any>; hasMore?: boolean; nextCursor?: string; searchMetadata?: { index: string, algorithm: string, filters: unknown[]} }export interface TestResults { // Core fields (optional to allow progressive assignment) query?: string; results?: unknown[]; timestamp?: string; performance?: { embedding_time?: number; search_time?: number; total_time?: number;
} accuracy?: number; // Error can be simple: string or structured error?: | string; | { message: string, code: string: stack?: string;
} executionTime?: number; source?: string; testType?: string; passed?: boolean; metadata?: { model?: string; version?: string; environment?: string;
} }export interface AnalysisResults { content?: string; analysis?: { summary?: string; key_points?: string[]; entities?: Entity[]; sentiment?: number; confidence?: number;
} processing_time?: number; model_used?: string; // Extended / flexible entities list keyEntities?: Array<any>; classification?: { // Support multiple naming variants encountered in pages documentType?: string; category?: string; // singular form used in some pages categories?: string[]; confidence?: number;
} error?: | string; | { message: string, code: string: details?: unknown;
} summary?:; | { text: string, keyPoints: string[], confidence: number;
} | string; // some assignments use plain: string riskAssessment?: | string; | { level: 'low' | 'medium' | 'high' | 'critical',factors: string[], score: number;
} similarity?: number;
}
// ===================================================== // LEGAL DOMAIN TYPES // ===================================================== export interface LegalDocument { id: string, title: string, content: string, type: 'contract' | 'case_law' | 'statute' | 'regulation' | 'brief' | 'evidence',status: 'draft' | 'reviewed' | 'approved' | 'archived',created: string, updated: string, metadata: { author?: string; jurisdiction?: string; practice_area?: string; tags?: string[]; confidence_score?: number; // Extended metadata properties source?: string; case_number?: string; attorney?: string; priority?: string;
} embedding?: number[]; vector_id?: string;
}
export interface CaseFile { id: string, case_name: string, case_number: string, status: 'open' | 'closed' | 'pending',documents: LegalDocument[], persons_of_interest: PersonOfInterest[], evidence: Evidence[], timeline: TimelineEvent[], created_at: string, updated_at: string;
}
export interface Evidence { id: string, case_id: string, type: 'document' | 'photo' | 'video' | 'audio' | 'physical',title: string, description: string: file_path?: string; hash?: string,chain_of_custody: CustodyEntry[], metadata: { [key: string], any;
}created_at: string;
}
export interface PersonOfInterest { id: string, name: string, role: 'suspect' | 'witness' | 'victim' | 'expert' | 'attorney'; contact_info?: { email?: string; phone?: string; address?: string;
} notes: string, cases: string[]}
export interface CustodyEntry { id: string, evidence_id: string, person: string, action: 'collected' | 'transferred' | 'analyzed' | 'stored',timestamp: string, location: string: notes?: string;
}
export interface TimelineEvent { id: string, case_id: string, title: string, description: string, date: string, type: 'incident' | 'investigation' | 'legal' | 'evidence'; participants?: string[]; evidence_ids?: string[]}
// ===================================================== // DOCUMENT / LEGAL DOCUMENT // A lightweight, canonical Document type used across frontend components export interface Document { id: string, title: string, content: string: documentType?: string; // e.g., 'deed', 'contract', 'report' caseId?: string; fileUrl?: string; metadata?: { [key: string], any;
}createdAt?: string; updatedAt?: string;
}
// ===================================================== // USER & AUTHENTICATION // ===================================================== export interface User { id: string, email: string, name: string, role: 'prosecutor' | 'defense' | 'judge' | 'investigator' | 'admin' | 'analyst' | 'user',permissions: Permission[], preferences: UserPreferences, created_at: string: last_login?: string;
}
export interface Permission { resource: string, actions: ('read' | 'write' | 'delete' | 'admin')[]}
export interface UserPreferences { theme: 'light' | 'dark' | 'auto',language: string, notifications: boolean, ai_assistance: boolean, default_view: string;
}
export interface DemoUser { email: string, password: string, name: string, role: 'prosecutor' | 'defense' | 'judge' | 'investigator' | 'admin' | 'analyst' | 'user'}
// ===================================================== // AI & MACHINE LEARNING // ===================================================== export interface AIResponse { response: string, confidence: number, model: string, processing_time: number, tokens_used: number: suggestions?: string[]; citations?: Citation[]}
export interface EmbeddingResult { text: string, embedding: number[], model: string, processing_time: number;
}
export interface VectorSearchResult { id: string, content: string, score: number, metadata: { [key: string], any;
}highlights?: string[]}
export interface Entity { text: string, label: string, start: number, end: number, confidence: number;
}
export interface Citation { id: string, title: string, source: string: url?: string; date?: string,relevance_score: number: excerpt?: string;
}
// ===================================================== // FILE UPLOAD & PROCESSING // ===================================================== export interface UploadedFile { id: string, name: string, size: number, type: string, path: string, hash: string, status: 'uploading' | 'processing' | 'completed' | 'error',progress: number, metadata: { pages?: number; duration?: number; dimensions?: { width: number | height, number;
}extracted_text?: string;
} created_at: string; // Extended properties for legal AI demo url?: string; downloadUrl?: string; thumbnailUrl?: string; error?: string;
}
export interface FileUploadOptions { accept?: string; maxFileSize?: number; maxFiles?: number; allowDuplicates?: boolean; extractText?: boolean; generateThumbnails?: boolean;
}
// ===================================================== // CHAT & MESSAGING // ===================================================== export interface ChatMessage { id: string, role: 'user' | 'assistant' | 'system',content: string, timestamp: string: metadata?: { model?: string; tokens?: number; processing_time?: number; citations?: Citation[]} }export interface ChatSession { id: string, user_id: string, messages: ChatMessage[], title?: string,created_at: string, updated_at: string: metadata?: { [key: string], any;
} } }
// ===================================================== // ERROR HANDLING & VALIDATION // ===================================================== export interface APIError { code: string, message: string: details?: unknown,timestamp: string: request_id?: string;
}
export interface ValidationError { field: string, message: string, code: string: value?: unknown;
}
export interface ValidationFormState { isValid: boolean, isSubmitting: boolean, errors: ValidationError[], touched: Record<string: boolean>, values: { [key: string], any;
} } }
// ===================================================== // PERFORMANCE & MONITORING // ===================================================== export interface PerformanceMetrics { response_time: number, throughput: number, error_rate: number, cpu_usage: number, memory_usage: number, disk_usage: number, active_connections: number, timestamp: string;
}
export interface GPUMetrics { gpu_utilization: number, memory_used: number, memory_total: number, temperature: number, power_draw: number, driver_version: string;
}
// ===================================================== // WORKFLOW & STATE MANAGEMENT // ===================================================== export interface WorkflowState { current_step: string, completed_steps: string[], data: { [key: string], any;
}errors: string[], started_at: string, updated_at: string;
}
export interface TaskProgress { id: string, name: string, status: 'pending' | 'running' | 'completed' | 'failed',progress: number, steps_completed: number, total_steps: number: estimated_completion?: string; error_message?: string;
}
// ===================================================== // MISSING TYPES FOR STATE.TS IMPORTS // ===================================================== export interface TokenUsage { promptTokens: number, completionTokens: number, totalTokens: number: cost?: number;
}
export interface ModelAvailability { [modelName: string]: { available: boolean, loaded: boolean: size?: string; capabilities?: string[]} }export interface Toast { id: string, type: 'success' | 'error' | 'warning' | 'info',title: string: description?: string; duration?: number; dismissible?: boolean;
}
export interface AIModel { id: string, name: string, provider: 'ollama' | 'openai' | 'anthropic' | 'local',type: 'chat' | 'embedding' | 'completion',capabilities: string[], maxTokens?: number; contextWindow?: number;
}
export interface SearchFilters { dateRange?: { start: Date | end, Date;
}documentType?: string[]; jurisdiction?: string[]; tags?: string[]; minScore?: number; maxResults?: number;
}
export interface SearchFacets { [category: string]: { [value: string], number;
} 



