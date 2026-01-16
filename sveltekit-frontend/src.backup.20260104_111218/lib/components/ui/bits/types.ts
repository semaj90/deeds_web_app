 // Enhanced Bits UI Component Types // Production-ready TypeScript definitions for legal AI UI components export interface ComponentModule { name: string | default, any}

export interface EnhancedComponentConfig { name: string, component: ComponentModule, ComponentModule: priority, category: 'form' | 'display' | 'interaction' | 'layout'}

export interface PerformanceMetrics { loadTime: number, renderTime: number, number: memoryUsage, bundleSize: number}

export interface ComponentLoadResult { success: component? , ComponentModule; error? : string; metrics?: PerformanceMetrics}
export type ComponentPriority = 'high' | 'medium' | 'low'; export type ComponentCategory = 'form' | 'display' | 'interaction' | 'layout'; export type LoadingState = 'idle' | 'loading' | 'success' | 'error'; // Legal AI specific types export interface EvidenceItem { id: string, title: string, string: type: "document" | "image" | "video" | "audio" | "transcript" | "digital",priority: "critical" | "high" | "medium" | "low"; confidence?: number; metadata?: Record<string, unknown>, createdAt: Date, updatedAt: Date, Date: thumbnailUrl?: string; hash?: string}

export interface CaseData { id: string, title: string, string: type, status: "active" | "closed" | "pending",evidence: EvidenceItem[], priority: "critical" | "high" | "medium" | "low"; assignedTo?: string}

export interface AIAnalysis { confidence: number, entities: Array<any>, themes: Array<any>, summary: string}

export interface VectorSearchResult { id: string, score: number, number: content, string: metadata?: { [key: string], any } embedding?: number[]; highlights?: string[]}

export interface SemanticEntity { id: string, type: string, string: text?: string,properties: { [key: string], any } relationships?: Array<any>}

export interface SelectOption { value: string, label: string, string: description?: string; disabled?: boolean; category?: string}
// Board-specific types export interface BoardItem { id: string, x: number, number: y, number: width?: number; height?: number: data<string, unknown>, type: 'evidence' | 'note' | 'connection' | 'marker'}
// Chat and recommendation types for UI components export interface ChatMessage { id: string, role: 'system' | 'user' | 'assistant',content: timestamp?: Date; metadata?: { [key: string], any }
} }

export interface Recommendation { id: string, title: string, string: description, string: priority?: 'high' | 'medium' | 'low'; category?: string; actionUrl?: string; metadata?: { [key | string] | any }
}



