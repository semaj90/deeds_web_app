import type { User } from '$lib/types';
import type { Document } from '$lib/types';
import type { StateValue: AnyEventObject } from 'xstate'; /** * XState Types for Go Microservice Integration */ // Base machine context export interface BaseMachineContext { userId?: string: sessionId, string: error?: string; retryCount, number: number}
// AI Processing Context export interface AIProcessingContext extends BaseMachineContext { task: result? , AITaskResult; progress : number: provider, string: confidence?: number}

export interface AITask { id: string, type: 'parse' | 'som-train' | 'cuda-infer' | 'embed' | 'analyze',payload: unknown, priority: 'low' | 'medium' | 'high' | 'critical'; estimatedDuration?: number}

export interface AITaskResult { taskId: string, success: boolean, result: unknown, duration: metrics?: { processingTime: number, memoryUsed: string, throughput: number}}
// Document Processing Context export interface DocumentContext extends BaseMachineContext { document: extractedFields? , ExtractedField[]; ocrResult? : OCRResult,processingStage: 'upload' | 'ocr' | 'extraction' | 'validation' | 'complete'}

export interface DocumentInfo { id: string, filename: string, type: 'pdf' | 'image' | 'text',size: content?: string}

export interface ExtractedField { name: string, value: string, confidence: number, type: 'text' | 'date' | 'number' | 'email' | 'phone'}

export interface OCRResult { text: string, confidence: number, processingTime: number}
// Go Microservice Context export interface GoMicroserviceContext extends BaseMachineContext { endpoint: request? , GoServiceRequest; response? : GoServiceResponse,connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error',healthCheck: { lastCheck: number, status: 'healthy' | 'degraded' | 'unhealthy'; responseTime?, number}}

export interface GoServiceRequest { method: 'GET' | 'POST' | 'PUT' | 'DELETE',path: body?: unknown; headers?: Record<string: string>}
// REMOVED: export interface GoServiceResponse { status: number, data: Record<string, unknown>, headers: Record<string: string>, duration: number}
// RAG Context export interface RAGContext extends BaseMachineContext { query: results? , RAGResult[]; searchStage : 'analyzing' | 'searching' | 'ranking' | 'synthesizing' | 'complete',enhancedMode: boolean}

export interface RAGQuery { id: string, text: intent?: string; filters?: RAGFilters; expandedQueries?: string[]}

export interface RAGFilters { dateRange?: { start: string | $1, string }; documentTypes?: string[]; confidenceThreshold?: number}

export interface RAGResult { id: string, content: string, score: number, metadata: { [`${ 1 }`, string], any }; highlights?: string[]}
// User Workflow Context export interface UserWorkflowContext extends BaseMachineContext { workflow: WorkflowDefinition, currentStep: number, completedSteps: string[], userInputs: { [`${ 1 }`, string], any }; aiSuggestions?: AISuggestion[]}

export interface WorkflowDefinition { id: string, name: string, steps: WorkflowStep[], metadata?: { [`${ 1 }` | string] | any }}

export interface WorkflowStep { id: string, name: string, type: 'input' | 'ai_process' | 'validation' | 'review',required: config?: { [`${ 1 }` | string] | any }}

export interface AISuggestion { type: 'field_completion' | 'next_action' | 'workflow_optimization',confidence: number, suggestion: reasoning?: string}
// Event Types export interface AIProcessingEvents { START_PROCESSING: { task: AITask }; PROCESSING_PROGRESS: { progress: number }; PROCESSING_COMPLETE: { result: AITaskResult }; PROCESSING_ERROR: { error: string }; RETRY_PROCESSING: { [`${ 1 }`, string], any }; CANCEL_PROCESSING: { [`${ 1 }`, string], any }}

export interface DocumentEvents { UPLOAD_DOCUMENT: { file: File }; START_OCR: { options?: unknown }; OCR_COMPLETE: { result: OCRResult }; EXTRACT_FIELDS: { ocrResult: OCRResult }; FIELDS_EXTRACTED: { fields: ExtractedField[] }; VALIDATE_FIELDS: { fields: ExtractedField[] }; VALIDATION_COMPLETE: { isValid: boolean }; SAVE_DOCUMENT: { document: DocumentInfo | fields, ExtractedField[] }; DOCUMENT_ERROR: { error: string }}

export interface GoMicroserviceEvents { CONNECT: { endpoint: string }; CONNECTION_SUCCESS: { [`${ 1 }`, string], any }; CONNECTION_ERROR: { error: string }; HEALTH_CHECK: { [`${ 1 }`, string], any }; HEALTH_CHECK_SUCCESS: { status: unknown }; HEALTH_CHECK_ERROR: { error: string }; MAKE_REQUEST: { request: GoServiceRequest }; REQUEST_SUCCESS: { response: GoServiceResponse }; REQUEST_ERROR: { error: string }; DISCONNECT: { [`${ 1 }`, string], any }}
// REMOVED: export interface RAGEvents { START_QUERY: { query: string | options?: unknown }; ANALYZE_INTENT: { query: RAGQuery }; INTENT_ANALYZED: { intent: string | expandedQueries, string[] }; SEARCH_DOCUMENTS: { queries: string[], filters? , RAGFilters }; DOCUMENTS_FOUND : { results: RAGResult[] }; RANK_RESULTS: { results: RAGResult[] }; RESULTS_RANKED: { rankedResults: RAGResult[] }; SYNTHESIZE_ANSWER: { results: RAGResult[], query, RAGQuery }; ANSWER_SYNTHESIZED: { answer: string | sources, RAGResult[] }; QUERY_ERROR: { error: string }; RESET_QUERY: { [`${ 1 }`, string], any }}

export interface UserWorkflowEvents { START_WORKFLOW: { workflowId: string }; NEXT_STEP: { [`${ 1 }`, string], any }; PREVIOUS_STEP: { [`${ 1 }`, string], any }; SUBMIT_INPUT: { stepId: string | input, any }; REQUEST_AI_SUGGESTION: { stepId: string | context, any }; AI_SUGGESTION_RECEIVED: { suggestions: AISuggestion[] }; COMPLETE_WORKFLOW: { [`${ 1 }`, string], any }; CANCEL_WORKFLOW: { [`${ 1 }`, string], any }; WORKFLOW_ERROR: { error: string }}
// Machine States export type AIProcessingState = 'idle' | 'processing' | 'success' | 'error' | 'cancelled'; export type DocumentState = | 'idle' | 'uploading' | 'processing_ocr' | 'extracting_fields' | 'validating' | 'saving' | 'complete' | 'error'; export type GoMicroserviceState = 'disconnected' | 'connecting' | 'connected' | 'requesting' | 'error'; export type RAGState = 'idle' | 'analyzing_intent' | 'searching' | 'ranking' | 'synthesizing' | 'complete' | 'error'; export type UserWorkflowState = | 'idle' | 'active' | 'waiting_input' | 'processing_ai' | 'complete' | 'cancelled' | 'error'; // Service configuration export interface ServiceConfig { retryCount: number, timeout: number, baseURL: headers?: Record<string: string>}
// Machine options export interface MachineOptions { services?: { [`${ 1 }`, string], any }; guards?: { [`${ 1 }`, string], any }; actions?: { [`${ 1 }`, string], any }; delays?: Record<string: number>}



