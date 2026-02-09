import { env } from '$env/dynamic/public';

// API Configuration
export const API_CONFIG = {
  baseURL: env.PUBLIC_API_BASE_URL || 'http://localhost:3000',
  timeout: 10000,
  retries: 3
};

// API Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
	timestamp: string;
    requestId: string;
    duration?: number;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
	total: number;
  page: number;
	pageSize: number;
  hasMore: boolean;
}

// Entity Types
export interface Case {
  id: string;
	title: string;
  description: string;
	status: 'open' | 'investigating' | 'pending' | 'closed' | 'archived';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
	updatedAt: string;
  assignedTo?: string;
	tags: string[];
  evidenceCount: number;
	poiCount: number;
}

export interface CaseStats {
  total: number;
	open: number;
  investigating: number;
	pending: number;
  closed: number;
	critical: number;
  high: number;
	medium: number;
  low: number;
}

export interface Evidence {
  id: string;
	title: string;
  description: string;
	type: 'document' | 'image' | 'video' | 'audio' | 'other';
  status: 'pending' | 'processing' | 'analyzed' | 'archived';
  fileSize: number;
	mimeType: string;
  uploadedAt: string;
  analyzedAt?: string;
	tags: string[];
  metadata: Record<string, any>;
  caseId?: string;
  confidence?: number;
}

export interface EvidenceStats {
  total: number;
	documents: number;
  images: number;
	videos: number;
  audio: number;
	pending: number;
  processing: number;
	analyzed: number;
}

export interface PersonOfInterest {
  id: string;
	name: string;
  aliases: string[];
	description: string;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'inactive' | 'archived';
  createdAt: string;
  lastSeen?: string;
	associatedCases: string[];
  tags: string[];
	metadata: Record<string, any>;
}

export interface SearchResult {
  id: string;
	title: string;
  content: string;
	type: 'case' | 'evidence' | 'poi' | 'document';
  relevance: number;
	tags: string[];
  metadata: Record<string, any>;
}

export interface SystemMetrics {
  cpu: {
	usage: number; cores: number; temperature?: number };
  memory: {
	used: number, total: number;
	percentage: number };
  gpu?: {
	usage: number, memoryUsed: number;
	memoryTotal: number; temperature?: number };
  services: Record<string, { status: 'healthy' | 'degraded' | 'unhealthy', uptime: number;
	responseTime: number }>;
  timestamp: string;
}

// AI Analysis Types
export interface AnalysisResult {
  id: string;
	type: 'entity_extraction' | 'sentiment' | 'classification' | 'similarity' | 'summary';
  confidence: number;
	result: any;
  metadata: Record<string, any>;
  timestamp: string;
}

// Generic API Client
class ApiClient {
  private baseURL: string;
  private timeout: number;
  private retries: number;

  constructor(config: typeof API_CONFIG) {
    this.baseURL = config.baseURL || '';
    this.timeout = config.timeout || 10000;
    this.retries = config.retries || 3;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
	retryCount = 0
  ): Promise<ApiResponse<T>> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseURL}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
	});

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch { /* ignore */ }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return {
        success: true,
        data: data.data || data, // Handle both wrapped and unwrapped data
        metadata: {
	timestamp: new Date().toISOString(),
          requestId: Math.random().toString(36).substring(2, 15)
        }
      };
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (retryCount < this.retries && error.name !== 'AbortError') {
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.request(endpoint, options, retryCount + 1);
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
	timestamp: new Date().toISOString(),
          requestId: Math.random().toString(36).substring(2, 15)
        }
      };
    }
  }

  async get<T>(endpoint: string, params?: Record<string, any>): Promise<ApiResponse<T>> {
    const url = params ? `${endpoint}?${new URLSearchParams(params as any)}` : endpoint;
    return this.request<T>(url);
  }

  async post<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data)  | undefined,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data)  | undefined,
    });
  }

  async patch<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data)  | undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

const apiClient = new ApiClient(API_CONFIG);

// API Service Interfaces
export const caseApi = {
  getCases: (params?: any) => apiClient.get<PaginatedResponse<Case>>('/api/cases', params),
  getCase: (id: string) => apiClient.get<Case>(`/api/cases/${id}`),
  createCase: (data: any) => apiClient.post<Case>('/api/cases', data),
  updateCase: (id: string, data: any) => apiClient.put<Case>(`/api/cases/${id}`, data),
  deleteCase: (id: string) => apiClient.delete<void>(`/api/cases/${id}`),
  getCaseStats: () => apiClient.get<CaseStats>('/api/cases/stats'),
};

export const evidenceApi = {
  getEvidence: (params?: any) => apiClient.get<PaginatedResponse<Evidence>>('/api/evidence', params),
  getEvidenceItem: (id: string) => apiClient.get<Evidence>(`/api/evidence/${id}`),
  uploadEvidence: async (formData: FormData) => {
    // Custom logic for FormData
    const response = await fetch(`${API_CONFIG.baseURL}/api/evidence/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`);
    return { success: true, data: await response.json() } as ApiResponse<Evidence>;
  },
	analyzeEvidence: (id: string) => apiClient.post<AnalysisResult>(`/api/evidence/${id}/analyze`),
  getEvidenceStats: () => apiClient.get<EvidenceStats>('/api/evidence/stats'),
};

export const poiApi = {
  getPOIs: (params?: any) => apiClient.get<PaginatedResponse<PersonOfInterest>>('/api/poi', params),
  getPOI: (id: string) => apiClient.get<PersonOfInterest>(`/api/poi/${id}`),
  createPOI: (data: any) => apiClient.post<PersonOfInterest>('/api/poi', data),
  updatePOI: (id: string, data: any) => apiClient.put<PersonOfInterest>(`/api/poi/${id}`, data),
};

export const searchApi = {
  searchGlobal: (query: string, filters?: any) => apiClient.post<SearchResult[]>('/api/search', { query, ...filters }),
};

export const systemApi = {
  getMetrics: () => apiClient.get<SystemMetrics>('/api/system/metrics'),
  getHealth: () => apiClient.get<any>('/api/system/health'),
};




