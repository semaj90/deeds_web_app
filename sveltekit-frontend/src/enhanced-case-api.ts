// Enhanced Case API Client
// Integrates REST architecture with PostgreSQL-first workers and clustering
import { restClient, type APIResponse } from './enhanced-rest-architecture.js';

export interface CaseCreationRequest {
  // Core case fields from CaseForm
  caseNumber: string; title: string;
  description?: string; priority: 'low' | 'medium' | 'high';
  status?: 'draft' | 'active' | 'pending' | 'closed';
  assignedTo?: string;
  dueDate?: string;
  tags?: string[];
  isConfidential?: boolean;
  notifyAssignee?: boolean;
  // Additional metadata
  metadata?: {
    createdVia?: string;
    formVersion?: string;
    workflowStep?: string;
    timestamp?: string;
    userId?: string;
    sessionId?: string;
  };
}

export interface CaseResponse {
  id: string; caseNumber: string; title: string;
  description?: string; priority: string; status: string;
  location?: string;
  jurisdiction?: string;
  caseType?: string;
  createdBy?: string; createdAt: string; updatedAt: string;
}

export interface WorkerTriggerResponse {
  success: boolean; data: { streamId: string; correlationId: string; triggerType: string; action: string;
    caseId?: string;
  };
  metadata: { timestamp: string; worker: string; version: string;
  };
}

export class EnhancedCaseAPI {
  /**
   * Create a new legal case with full workflow integration
   */
  async createCase(data: CaseCreationRequest): Promise<APIResponse<CaseResponse>> {
    try {
      console.log('🚀 Creating case with enhanced API:', data);

      // Step 1: Create the case via REST API
      const caseResponse = await restClient.post<CaseResponse>('/cases', {
        ...data,
        metadata: { createdVia: 'yorha-command-center',
          formVersion: '2.0',
          workflowStep: 'case-creation',
          timestamp: new Date().toISOString(),
          ...data.metadata,
        },
      });

      if (!caseResponse.success) {
        throw new Error(caseResponse.error || 'Failed to create case');
      }

      const createdCase = caseResponse.data;
      console.log('✅ Case created successfully:', createdCase);

      // Step 2: Trigger PostgreSQL-first worker for auto-tagging
      if (createdCase && createdCase.id) {
        try {
          await this.triggerWorkerProcessing(createdCase.id, data);
        } catch (workerError) {
          console.warn('⚠️ Worker trigger failed (non-blocking):', workerError);
          // Don't fail the whole operation if worker trigger fails
        }
      }

      return caseResponse;
    } catch (error: unknown) {
      console.error('❌ Enhanced case creation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        data: undefined as unknown as CaseResponse,
      };
    }
  }

  /**
   * Trigger PostgreSQL-first worker processing
   */
  async triggerWorkerProcessing(
    caseId: string,
    formData: CaseCreationRequest
  ): Promise<APIResponse<WorkerTriggerResponse>> {
    try {
      console.log('📡 Triggering worker processing for case:', caseId);

      const workerResponse = await restClient.post<WorkerTriggerResponse>(
        '/worker/autotag/trigger',
        {
          type: 'case_created',
          caseId,
          action: 'process',
          metadata: { priority: formData.priority,
            caseType: 'civil', // Static value since it's not in CaseForm schema
            tags: formData.tags || [],
            trigger: 'yorha-case-form',
            userId: formData.metadata?.userId,
            sessionId: formData.metadata?.sessionId,
            timestamp: new Date().toISOString(),
            formMetadata: {
              // These fields are not in the CaseForm schema, using defaults
              location: 'not_specified',
              jurisdiction: 'not_specified',
              clientName: 'not_specified',
              assignedTo: formData.assignedTo,
            },
          },
        }
      );

      if (workerResponse.success) {
        console.log('✅ Worker processing triggered successfully:', workerResponse.data);
      } else {
        console.warn('⚠️ Worker trigger response not successful:', workerResponse.error);
      }

      return workerResponse;
    } catch (error: unknown) {
      console.error('❌ Worker trigger failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        data: undefined as unknown as WorkerTriggerResponse,
      };
    }
  }

  /**
   * Get case by ID with enhanced data
   */
  async getCaseById(caseId: string): Promise<APIResponse<CaseResponse>> {
    return restClient.get<CaseResponse>(`/cases/${caseId}`);
  }

  /**
   * Search cases with enhanced filtering
   */
  async searchCases(params: {
    query?: string;
    status?: string[];
    priority?: string[];
    caseType?: string[];
    page?: number;
    limit?: number;
    useVectorSearch?: boolean;
  }): Promise<APIResponse<CaseResponse[]>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          searchParams.append(key, value.join(','));
        } else {
          searchParams.append(key, String(value));
        }
      }
    });
    return restClient.get<CaseResponse[]>(`/cases?${searchParams}`);
  }

  /**
   * Update case with workflow integration
   */
  async updateCase(
    caseId: string,
    updates: Partial<CaseCreationRequest>
  ): Promise<APIResponse<CaseResponse>> {
    return restClient.post<CaseResponse>(`/cases/${caseId}`, {
      ...updates,
      metadata: { updatedVia: 'yorha-command-center',
        workflowStep: 'case-update',
        timestamp: new Date().toISOString(),
        ...updates.metadata,
      },
    });
  }

  /**
   * Get worker processing status for a case
   */
  async getWorkerStatus(caseId?: string): Promise<APIResponse<WorkerTriggerResponse>> {
    const url = caseId ? `/worker/autotag/trigger?caseId=${caseId}` : '/worker/autotag/trigger';
    return restClient.get<WorkerTriggerResponse>(url);
  }

  /**
   * Get case analytics with clustering data
   */
  async getCaseAnalytics(
    params: {
      dateRange?: { start: string; end: string };
      caseType?: string[];
      priority?: string[];
      includeClusterData?: boolean;
    } = {}
  ): Promise<APIResponse<{ daily: Array<unknown>; weekly: Array<unknown> }>> {
    const searchParams = new URLSearchParams();
    if (params.dateRange) {
      searchParams.append('dateStart', params.dateRange.start);
      searchParams.append('dateEnd', params.dateRange.end);
    }
    if (params.caseType?.length) {
      searchParams.append('caseType', params.caseType.join(','));
    }
    if (params.priority?.length) {
      searchParams.append('priority', params.priority.join(','));
    }
    if (params.includeClusterData) {
      searchParams.append('includeClusters', 'true');
    }
    return restClient.get(`/cases/analytics?${searchParams}`);
  }

  /**
   * Cluster similar cases using enhanced REST architecture
   */
  async clusterSimilarCases(params: {
    caseId?: string;
    algorithm?: 'kmeans' | 'som' | 'hierarchical';
    k?: number;
    includeEmbeddings?: boolean;
  }): Promise<APIResponse<{ clusters: Array<unknown>; silhouetteScore: number; totalCases: number }>> {
    return restClient.post('/cases/cluster', {
      ...params,
      algorithm: params.algorithm || 'kmeans',
      k: params.k || 5,
    });
  }
}

// Singleton instance
export const enhancedCaseAPI = new EnhancedCaseAPI();

// Export for use in components
export default enhancedCaseAPI;




