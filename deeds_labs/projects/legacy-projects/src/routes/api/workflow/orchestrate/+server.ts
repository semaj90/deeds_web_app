/**
 * SvelteKit API Endpoint: Workflow Orchestration
 * Automated workflow orchestration with error handling and retries
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { autoDocumentFetcher } from '../../../../lib/services/auto-document-fetcher.js';
import { documentProcessor } from '../../../../lib/services/document-processor.js';
import { gemmaEmbeddingService } from '../../../../lib/services/gemma-embedding-service.js';
import { ragRankingSystem } from '../../../../lib/services/rag-ranking-system.js';
import { postgresqlVectorStorage } from '../../../../lib/services/postgresql-vector-storage.js';

interface WorkflowStep {
  id: string;
  name: string;
  service: string;
  method: string;
  params: any;
  retry_count: number;
  max_retries: number;
  timeout_ms: number;
  dependencies: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  start_time?: number;
  end_time?: number;
  error?: string;
  result?: any;
}

interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  error_handling: {
    continue_on_error: boolean;
    retry_failed_steps: boolean;
    max_workflow_retries: number;
  };
  notifications: {
    on_success?: string[];
    on_failure?: string[];
    on_progress?: string[];
  };
}

interface WorkflowExecution {
  workflow_id: string;
  execution_id: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  current_step: string;
  progress: {
    completed_steps: number;
    total_steps: number;
    percentage: number;
  };
  start_time: number;
  end_time?: number;
  duration_ms?: number;
  results: Record<string, any>;
  errors: Array<{ step_id: string; error: string; timestamp: number }>;
}

interface OrchestrationRequest {
  workflow?: WorkflowDefinition;
  workflow_type?: 'full_pipeline' | 'search_only' | 'training_export' | 'health_check';
  parameters?: any;
  options?: {
    parallel_execution?: boolean;
    error_handling?: 'strict' | 'continue' | 'retry';
    notifications?: boolean;
  };
}

interface OrchestrationResponse {
  success: boolean;
  execution_id: string;
  workflow_id: string;
  status: string;
  progress?: any;
  results?: any;
  errors?: any[];
}

// In-memory execution tracking (in production, use Redis or database)
const activeExecutions = new Map<string, WorkflowExecution>();

// Predefined workflow templates
const workflowTemplates: Record<string, WorkflowDefinition> = {
  full_pipeline: {
    id: 'full_pipeline',
    name: 'Full Document Processing Pipeline',
    description: 'Complete workflow: Fetch → Process → Vectorize → Store → Index',
    steps: [
      {
        id: 'initialize_services',
        name: 'Initialize Services',
        service: 'orchestrator',
        method: 'initializeAllServices',
        params: {},
        retry_count: 0,
        max_retries: 3,
        timeout_ms: 30000,
        dependencies: [],
        status: 'pending',
      },
      {
        id: 'fetch_documents',
        name: 'Fetch Documents',
        service: 'autoDocumentFetcher',
        method: 'fetchFromSources',
        params: { sources: [], maxDocuments: 50 },
        retry_count: 0,
        max_retries: 2,
        timeout_ms: 60000,
        dependencies: ['initialize_services'],
        status: 'pending',
      },
      {
        id: 'process_documents',
        name: 'Process Documents',
        service: 'documentProcessor',
        method: 'processDocuments',
        params: { extractEntities: true, calculateComplexity: true },
        retry_count: 0,
        max_retries: 2,
        timeout_ms: 120000,
        dependencies: ['fetch_documents'],
        status: 'pending',
      },
      {
        id: 'generate_embeddings',
        name: 'Generate Embeddings',
        service: 'gemmaEmbeddingService',
        method: 'vectorizeDocuments',
        params: { includeDocumentEmbedding: true, includeChunkEmbeddings: true },
        retry_count: 0,
        max_retries: 2,
        timeout_ms: 300000,
        dependencies: ['process_documents'],
        status: 'pending',
      },
      {
        id: 'store_documents',
        name: 'Store Documents',
        service: 'postgresqlVectorStorage',
        method: 'storeDocuments',
        params: { includeChunks: true },
        retry_count: 0,
        max_retries: 3,
        timeout_ms: 180000,
        dependencies: ['generate_embeddings'],
        status: 'pending',
      },
      {
        id: 'generate_statistics',
        name: 'Generate Statistics',
        service: 'postgresqlVectorStorage',
        method: 'getStorageStatistics',
        params: {},
        retry_count: 0,
        max_retries: 1,
        timeout_ms: 30000,
        dependencies: ['store_documents'],
        status: 'pending',
      },
    ],
    error_handling: {
      continue_on_error: false,
      retry_failed_steps: true,
      max_workflow_retries: 2,
    },
    notifications: {
      on_success: ['console', 'log'],
      on_failure: ['console', 'log'],
      on_progress: ['console'],
    },
  },

  search_only: {
    id: 'search_only',
    name: 'Search and Ranking Pipeline',
    description: 'Search workflow: Query → Embed → Search → Rank → Return',
    steps: [
      {
        id: 'initialize_search_services',
        name: 'Initialize Search Services',
        service: 'orchestrator',
        method: 'initializeSearchServices',
        params: {},
        retry_count: 0,
        max_retries: 2,
        timeout_ms: 15000,
        dependencies: [],
        status: 'pending',
      },
      {
        id: 'generate_query_embedding',
        name: 'Generate Query Embedding',
        service: 'gemmaEmbeddingService',
        method: 'generateEmbedding',
        params: { query: '' },
        retry_count: 0,
        max_retries: 2,
        timeout_ms: 30000,
        dependencies: ['initialize_search_services'],
        status: 'pending',
      },
      {
        id: 'perform_vector_search',
        name: 'Perform Vector Search',
        service: 'postgresqlVectorStorage',
        method: 'semanticSearch',
        params: { limit: 20, threshold: 0.5 },
        retry_count: 0,
        max_retries: 2,
        timeout_ms: 60000,
        dependencies: ['generate_query_embedding'],
        status: 'pending',
      },
      {
        id: 'rank_results',
        name: 'Rank Results',
        service: 'ragRankingSystem',
        method: 'rankResults',
        params: {},
        retry_count: 0,
        max_retries: 1,
        timeout_ms: 30000,
        dependencies: ['perform_vector_search'],
        status: 'pending',
      },
    ],
    error_handling: {
      continue_on_error: false,
      retry_failed_steps: true,
      max_workflow_retries: 1,
    },
    notifications: {
      on_success: ['console'],
      on_failure: ['console'],
      on_progress: ['console'],
    },
  },

  health_check: {
    id: 'health_check',
    name: 'System Health Check',
    description: 'Comprehensive health check of all services',
    steps: [
      {
        id: 'check_document_fetcher',
        name: 'Check Document Fetcher',
        service: 'autoDocumentFetcher',
        method: 'healthCheck',
        params: {},
        retry_count: 0,
        max_retries: 1,
        timeout_ms: 10000,
        dependencies: [],
        status: 'pending',
      },
      {
        id: 'check_document_processor',
        name: 'Check Document Processor',
        service: 'documentProcessor',
        method: 'healthCheck',
        params: {},
        retry_count: 0,
        max_retries: 1,
        timeout_ms: 10000,
        dependencies: [],
        status: 'pending',
      },
      {
        id: 'check_embedding_service',
        name: 'Check Embedding Service',
        service: 'gemmaEmbeddingService',
        method: 'healthCheck',
        params: {},
        retry_count: 0,
        max_retries: 1,
        timeout_ms: 15000,
        dependencies: [],
        status: 'pending',
      },
      {
        id: 'check_ranking_system',
        name: 'Check Ranking System',
        service: 'ragRankingSystem',
        method: 'healthCheck',
        params: {},
        retry_count: 0,
        max_retries: 1,
        timeout_ms: 10000,
        dependencies: [],
        status: 'pending',
      },
      {
        id: 'check_vector_storage',
        name: 'Check Vector Storage',
        service: 'postgresqlVectorStorage',
        method: 'healthCheck',
        params: {},
        retry_count: 0,
        max_retries: 1,
        timeout_ms: 15000,
        dependencies: [],
        status: 'pending',
      },
    ],
    error_handling: {
      continue_on_error: true,
      retry_failed_steps: false,
      max_workflow_retries: 0,
    },
    notifications: {
      on_success: ['console'],
      on_failure: ['console'],
    },
  },
};

/**
 * POST: Start workflow orchestration
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body: OrchestrationRequest = await request.json();

    const workflowDef = body.workflow || workflowTemplates[body.workflow_type || 'full_pipeline'];

    if (!workflowDef) {
      throw error(400, 'Invalid workflow definition or type');
    }

    const executionId = generateExecutionId();

    console.log(`🎭 Starting workflow orchestration: ${workflowDef.name} (${executionId})`);

    // Create execution tracking
    const execution: WorkflowExecution = {
      workflow_id: workflowDef.id,
      execution_id: executionId,
      status: 'running',
      current_step: workflowDef.steps[0]?.id || '',
      progress: {
        completed_steps: 0,
        total_steps: workflowDef.steps.length,
        percentage: 0,
      },
      start_time: Date.now(),
      results: {},
      errors: [],
    };

    activeExecutions.set(executionId, execution);

    // Start async workflow execution
    executeWorkflow(workflowDef, execution, body.parameters || {}, body.options || {}).catch(
      (error) => {
        console.error(`❌ Workflow ${executionId} failed:`, error);
        const exec = activeExecutions.get(executionId);
        if (exec) {
          exec.status = 'failed';
          exec.end_time = Date.now();
          exec.duration_ms = exec.end_time - exec.start_time;
          activeExecutions.set(executionId, exec);
        }
      }
    );

    return json<OrchestrationResponse>({
      success: true,
      execution_id: executionId,
      workflow_id: workflowDef.id,
      status: 'running',
      progress: execution.progress,
    });
  } catch (err) {
    console.error('❌ Failed to start workflow orchestration:', err);
    throw error(400, {
      message: 'Invalid orchestration request',
      details: err instanceof Error ? err.message : 'Unknown error',
    });
  }
};

/**
 * GET: Check workflow execution status
 */
export const GET: RequestHandler = async ({ url }) => {
  const executionId = url.searchParams.get('executionId');
  const action = url.searchParams.get('action') || 'status';

  if (action === 'templates') {
    return json({
      success: true,
      templates: Object.keys(workflowTemplates),
      definitions: workflowTemplates,
    });
  }

  if (!executionId) {
    throw error(400, 'Execution ID is required');
  }

  const execution = activeExecutions.get(executionId);

  if (!execution) {
    throw error(404, 'Execution not found');
  }

  const response: OrchestrationResponse = {
    success: execution.status !== 'failed',
    execution_id: execution.execution_id,
    workflow_id: execution.workflow_id,
    status: execution.status,
    progress: execution.progress,
    results: execution.results,
    errors: execution.errors,
  };

  return json(response);
};

/**
 * Execute workflow with error handling and retries
 */
async function executeWorkflow(
  workflow: WorkflowDefinition,
  execution: WorkflowExecution,
  parameters: any,
  options: any
): Promise<void> {
  console.log(`🔄 Executing workflow: ${workflow.name}`);

  try {
    // Update workflow steps with parameters
    const updatedSteps = workflow.steps.map((step) => ({
      ...step,
      params: { ...step.params, ...parameters[step.id] },
    }));

    // Execute steps based on dependencies
    for (const step of updatedSteps) {
      await executeStep(step, execution, updatedSteps, workflow.error_handling);

      // Update progress
      execution.progress.completed_steps++;
      execution.progress.percentage = Math.round(
        (execution.progress.completed_steps / execution.progress.total_steps) * 100
      );
      execution.current_step = step.id;

      activeExecutions.set(execution.execution_id, execution);
    }

    // Mark as completed
    execution.status = 'completed';
    execution.end_time = Date.now();
    execution.duration_ms = execution.end_time - execution.start_time;

    activeExecutions.set(execution.execution_id, execution);

    console.log(`✅ Workflow ${execution.execution_id} completed in ${execution.duration_ms}ms`);
  } catch (err) {
    console.error(`❌ Workflow ${execution.execution_id} failed:`, err);

    execution.status = 'failed';
    execution.end_time = Date.now();
    execution.duration_ms = execution.end_time - execution.start_time;
    execution.errors.push(<any>(<any>{
      step_id: execution.current_step,
      error: err instanceof Error ? err.message : 'Unknown error',
      timestamp: Date.now(),
    }));

    activeExecutions.set(execution.execution_id, execution);

    throw err;
  }
}

/**
 * Execute individual workflow step
 */
async function executeStep(
  step: WorkflowStep,
  execution: WorkflowExecution,
  allSteps: WorkflowStep[],
  errorHandling: WorkflowDefinition['error_handling']
): Promise<void> {
  console.log(`▶️ Executing step: ${step.name}`);

  // Check dependencies
  for (const depId of step.dependencies) {
    const depStep = allSteps.find((s) => s.id === depId);
    if (!depStep || depStep.status !== 'completed') {
      throw new Error(`Dependency ${depId} not satisfied for step ${step.id}`);
    }
  }

  step.status = 'running';
  step.start_time = Date.now();

  let attempts = 0;
  let lastError: Error | null = null;

  while (attempts <= step.max_retries) {
    try {
      const result = await executeStepMethod(step, execution.results);

      step.status = 'completed';
      step.end_time = Date.now();
      step.result = result;

      execution.results[step.id] = result;

      console.log(`✅ Step completed: ${step.name}`);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Unknown error');
      attempts++;

      console.error(
        `❌ Step ${step.name} failed (attempt ${attempts}/${step.max_retries + 1}):`,
        lastError.message
      );

      if (attempts <= step.max_retries) {
        console.log(`🔄 Retrying step: ${step.name}`);
        await delay(1000 * attempts); // Exponential backoff
      }
    }
  }

  // Step failed after all retries
  step.status = 'failed';
  step.end_time = Date.now();
  step.error = lastError?.message;

  execution.errors.push(<any>(<any>{
    step_id: step.id,
    error: lastError?.message || 'Unknown error',
    timestamp: Date.now(),
  }));

  if (!errorHandling.continue_on_error) {
    throw lastError;
  }

  console.log(`⏭️ Continuing despite step failure: ${step.name}`);
}

/**
 * Execute the actual step method
 */
async function executeStepMethod(
  step: WorkflowStep,
  previousResults: Record<string, any>
): Promise<any> {
  const services: Record<string, any> = {
    autoDocumentFetcher,
    documentProcessor,
    gemmaEmbeddingService,
    ragRankingSystem,
    postgresqlVectorStorage,
    orchestrator: {
      initializeAllServices: async () => {
        await autoDocumentFetcher.initialize();
        await documentProcessor.initialize();
        await gemmaEmbeddingService.initialize();
        await postgresqlVectorStorage.initialize();
        return { initialized: true };
      },
      initializeSearchServices: async () => {
        await gemmaEmbeddingService.initialize();
        await postgresqlVectorStorage.initialize();
        return { initialized: true };
      },
    },
  };

  const service = services[step.service];
  if (!service) {
    throw new Error(`Service not found: ${step.service}`);
  }

  const method = service[step.method];
  if (!method || typeof method !== 'function') {
    throw new Error(`Method not found: ${step.service}.${step.method}`);
  }

  // Prepare parameters with results from previous steps
  const params = { ...step.params };

  // Inject results from previous steps
  if (step.dependencies.length > 0) {
    for (const depId of step.dependencies) {
      if (previousResults[depId]) {
        params[`${depId}_result`] = previousResults[depId];
      }
    }
  }

  // Execute with timeout
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Step timeout: ${step.name}`)), step.timeout_ms);
  });

  const methodPromise = method.call(service, params);

  return Promise.race([methodPromise, timeoutPromise]);
}

/**
 * Helper functions
 */
function generateExecutionId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cleanup old executions periodically
 */
setInterval(
  () => {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour

    for (const [executionId, execution] of activeExecutions.entries()) {
      if (now - execution.start_time > maxAge) {
        activeExecutions.delete(executionId);
        console.log(`🧹 Cleaned up old execution: ${executionId}`);
      }
    }
  },
  10 * 60 * 1000
); // Clean every 10 minutes
