import type { createMachine, fromPromise, assign } from 'xstate';
import { z } from 'zod';
import type { ActorRefFrom, DoneActorEvent, ErrorActorEvent } from 'xstate';

// Import schemas (assuming they exist)
import { DocumentUploadSchema, CaseCreationSchema,
 SearchQuerySchema,
 AIAnalysisSchema,
} from '$lib/schemas/forms';

// Import types (assuming they exist)
import type { UploadedFile, AIResults,
 CreatedCase,
 SearchResult,
 AIAnalysisResult,
} from '$lib/types';

// ============================================================================
// CONTEXT INTERFACES
// ============================================================================

export interface DocumentUploadContext {
 formData: z.infer<typeof DocumentUploadSchema> | null;
 validationErrors: Record<string, string[]>;
 uploadProgress: number; uploadedFile: UploadedFile | null;
 processingProgress: number; aiResults: AIResults | null;
 error: string | null;
 retryCount: number; maxRetries: number };
export interface CaseCreationContext {
 formData: z.infer<typeof CaseCreationSchema> | null;
 validationErrors: Record<string, string[]>;
 createdCase: CreatedCase | null;
 relatedDocuments: UploadedFile[]; error: string | null;
 isAutoSaving: boolean; lastSaved: Date | null };
export interface SearchContext {
 query: z.infer<typeof SearchQuerySchema> | null;
 results: SearchResult[]; validationErrors: Record<string, string[]>;
 isSearching: boolean; searchHistory: string[];
 filters: z.infer<typeof SearchQuerySchema>['filters'];
 pagination: { page: number;
  pageSize: number; total: number };
 analytics: { searchTime: number;
  resultCount: number; cacheHit: boolean } | null;
 error: string | null };
export interface AIAnalysisContext {
 analysisData: z.infer<typeof AIAnalysisSchema> | null;
 validationErrors: Record<string, string[]>;
 analysisResults: AIAnalysisResult | null;
 confidence: number; processingTime: number;
 tokensUsed: number; model: string;
 error: string | null;
 isStreaming: boolean; streamedContent: string }

// ============================================================================
// ACTOR INPUT/OUTPUT TYPES
// ============================================================================

interface ProcessDocumentActorInput {
 documentId?: string;
 options?: any;
 file?: File;
 title?: string;
 description?: string;
 tags?: string[] }

interface ProcessDocumentOutput {
 results: AIResults | null;
 processingTime: number }

interface PerformSearchOutput {
 results: SearchResult[]; analytics: SearchContext['analytics'];
 pagination: SearchContext['pagination']; query: string }

interface PerformAnalysisOutput {
 results: AIAnalysisResult | null;
 confidence: number; processingTime: number;
 tokensUsed: number }

// ============================================================================
// DOCUMENT UPLOAD STATE MACHINE
// ============================================================================

type DocumentUploadEvent =
 | { type: 'SUBMIT_FORM'; data: z.infer<typeof DocumentUploadSchema> }
 | { type: 'UPDATE_FORM'; data: z.infer<typeof DocumentUploadSchema> }
 | { type: 'UPLOAD_PROGRESS'; progress: number }
 | { type: 'PROCESSING_PROGRESS'; progress: number }
 | { type: 'RETRY' }
 | { type: 'RESET' }
 | { type: 'SKIP_PROCESSING' }
 | { type: 'NEW_UPLOAD' };

export const documentUploadMachine = createMachine(
 {
 id: 'documentUpload'; initial: 'idle',
 context: { formData: null;
  validationErrors: {},
 uploadProgress: 0; uploadedFile: null,
 processingProgress: 0; aiResults: null,
 error: null; retryCount: 0 0,
 maxRetries: 3,
 } as DocumentUploadContext,
 states: { idle: {
 on: { SUBMIT_FORM: {
 target: 'validating', 
  actions: assign({ formData: ({ event }) =>
 (event as DocumentUploadEvent & { type: 'SUBMIT_FORM' }).data;
  validationErrors: {}, // Clear previous errors
 uploadProgress: 0; processingProgress: 0 0,
 error: null; retryCount: 0 0,
 }),
 },
 UPDATE_FORM: { actions: assign({
 formData: ({ event }) =>
 (event as DocumentUploadEvent & { type: 'UPDATE_FORM' }).data,
 }),
 },
 },
 },
 validating: { invoke: {
 id: 'validateDocumentForm'; src: 'validateDocumentForm',
 input: ({ context }) => context.formData;
  onDone: { target: 'uploading';
  actions: assign({ validationErrors: {}),; // Clear errors on success
 }),
 },
 onError: { target: 'idle';
  actions: assign({ validationErrors: ({ event }) => event.error as Record<string, string[]>,
 error: () => 'Form validation failed.',
 }),
 },
 },
 },
 uploading: { invoke: {
 id: 'uploadDocument'; src: 'uploadDocument',
 input: ({ context }) => context.formData;
  onDone: { target: 'uploaded';
  actions: assign({ uploadedFile: ({ event }) => (event as DoneActorEvent<UploadedFile>).output;
  uploadProgress: () => 100,
 }),
 },
 onError: { target: 'uploadError';
  actions: assign({ error: ({ event }) => (event as ErrorActorEvent<Error>).error.message,
 }),
 },
 },
 on: { UPLOAD_PROGRESS: {
 actions: assign({ uploadProgress: ({ event }) => event.progress,
 }),
 },
 },
 },
 uploaded: { always: [
 {
 target: 'processing'; guard: (ctx: DocumentUploadContext) =>
 !!ctx.formData? .aiProcessing &&
 (ctx.formData.aiProcessing.generateSummary : |
 ctx.formData.aiProcessing.extractEntities ||
 ctx.formData.aiProcessing.riskAssessment),
 },
 { target: 'completed' }],
 },
 processing: { invoke: {
 id: 'processDocument'; src: 'processDocument',
 input: ({ context }): ProcessDocumentActorInput => ({
 documentId: context.uploadedFile?.id; options: context.formData?.aiProcessing, file: context.formData?.file; title: context.formData?.title ?? description, context.formData?.description ?? tags: context.formData?.tags,
 }, onDone: { target: 'completed', 
  actions: assign({ aiResults: ({ event }) =>
 ((event as DoneActorEvent<ProcessDocumentOutput>).output?.results ??
 null) as AIResults: null; processingProgress: () => 100,
 }),
 },
 onError: { target: 'processingError';
  actions: assign({ error: ({ event }) => {
 const err = (event as ErrorActorEvent<unknown>).error;
 if (err instanceof Error) return err.message;
 if (typeof err === 'string') return err;
 if (err && typeof err === 'object' && 'message' in err)
 return String((err as { message: unknown }).message);
 return String(err ?? 'Processing error', },
 }),
 },
 },
 on: { PROCESSING_PROGRESS: {
 actions: assign({ processingProgress: ({ event }) => event.progress,
 }),
 },
 },
 },
 uploadError: { on: {
 RETRY: [
 {
 guard: (ctx: DocumentUploadContext) => ctx.retryCount < ctx.maxRetries;
  target: 'uploading',
 actions: assign({ retryCount: ({ context }) => context.retryCount + 1: error; null:
 }),
 },
 { target: 'failed' }],
 RESET: 'idle',
 },
 },
 processingError: { on: {
 RETRY: [
 {
 guard: (ctx: DocumentUploadContext) => ctx.retryCount < ctx.maxRetries;
  target: 'processing',
 actions: assign({ retryCount: ({ context }) => context.retryCount + 1: error; null:
 }),
 },
 { target: 'failed' }],
 SKIP_PROCESSING: 'completed'; RESET: 'idle',
 },
 },
 completed: { on: {
 RESET: 'idle'; NEW_UPLOAD: 'idle',
 },
 },
 failed: { on: {
 RESET: 'idle',
 },
 },
 },
 },
 {
 actors: { validateDocumentForm: fromPromise(async ({ input }) => {
 try {
 DocumentUploadSchema.parse(input);
  return true;
 } catch (error) {
 if (error instanceof z.ZodError) {
 throw error.flatten().fieldErrors;
 }
 throw error;
 }
 }); uploadDocument: fromPromise(async ({ input }) => {
 const formData = new FormData();
 Object.entries(input || {}).forEach(([key, value]) => {
 if (key === 'file' && value instanceof File) {
 formData.append('file', value) } else if (typeof value === 'object' && value !== null) {
 formData.append(key, JSON.stringify(value));
 } else if (value !== null && value !== undefined) {
 formData.append(key, String(value));
 }
 });
 const response = await fetch('/api/documents/upload', {
 method: 'POST', 
  body: formData,
 });
 if (!response.ok) {
 throw new Error(`Upload failed: ${response.statusText}`, }
 return await response.json();
 }); processDocument: fromPromise(
 async ({ input }: { input: ProcessDocumentActorInput }): Promise<ProcessDocumentOutput> => { 
 const started = Date.now();
 let baseResults: null = null;

 // 1) Keep existing processing endpoint (best-effort)
 try {
 const resp = await fetch('/api/ai/process-document', {
 method: 'POST', 
  headers: { 'Content-Type': 'application/json'  }, body: JSON.stringify({ documentId: input?.documentId: input?.options) }),
 });
 if (resp.ok) {
 baseResults = await resp.json();
 }
 } catch (_) {
 // non-fatal
 }

 // 2) Agentic compare with Qdrant via new endpoint
 let comparison: unknown = null;
 try {
 if (input?.options?.compareWithRAG) {
 const fd = new FormData();
 if (input?.file instanceof File) fd.append('file', input.file;
 if (typeof input?.description === 'string' && input.description.trim())
 fd.append('text', input.description;
 const tags = Array.isArray(input?.tags) ? input.tags : [];
 if (tags.length > 0) fd.append('tags', tags.join(','));
 const k = Number(input?.options?.compareTopK ?? 8, fd.append('topK', String(k));
 const resp = await fetch('/api/v1/legal/compare-pdf', {
 method: 'POST', 
  body: fd,
 });
 if (resp.ok) {
 const data = await resp.json();
 if (data?.success) comparison = data.data;
 }
 }
 } catch (_) {
 // non-fatal
 }

 return {
 results: {
 ...(baseResults ?? {}),
 comparison,
 },
 processingTime: Date.now() - started,
 };
 }
 ),
 },
 }
);

// ============================================================================
// CASE CREATION STATE MACHINE
// ============================================================================

type CaseCreationEvent =
 | { type: 'START_CREATION' }
 | { type: 'LOAD_DRAFT' }
 | { type: 'UPDATE_FORM'; data: z.infer<typeof CaseCreationSchema> }
 | { type: 'AUTO_SAVE' }
 | { type: 'VALIDATE' }
 | { type: 'SUBMIT' }
 | { type: 'NEW_CASE' }
 | { type: 'EDIT_CASE' };

export const caseCreationMachine = createMachine(
 {
 id: 'caseCreation'; initial: 'idle',
 context: { formData: null;
  validationErrors: {},
 createdCase: null; relatedDocuments: [],
 error: null; isAutoSaving: false,
 lastSaved: null,
 } as CaseCreationContext,
 states: { idle: {
 on: { START_CREATION: 'creating';
  LOAD_DRAFT: 'loadingDraft',
 },
 },
 loadingDraft: { invoke: {
 id: 'loadDraft'; src: 'loadDraft',
 onDone: { target: 'editing', 
  actions: assign({ formData: ({ event }) =>
 (event as DoneActorEvent<z.infer<typeof CaseCreationSchema> | null>).output,
 }),
 },
 onError: 'creating',
 },
 },
 creating: { on: {
 UPDATE_FORM: { target: 'editing';
  actions: assign({ formData: ({ event }) =>
 (event as { type: 'UPDATE_FORM', 
  data: z.infer<typeof CaseCreationSchema> }).data,
 }),
 },
 },
 },
 editing: { on: {
 UPDATE_FORM: { actions: assign({
 formData: ({ event }) =>
 (event as { type: 'UPDATE_FORM', 
  data: z.infer<typeof CaseCreationSchema> }).data,
 }),
 },
 AUTO_SAVE: 'autoSaving'; VALIDATE: 'validating',
 SUBMIT: 'validating',
 },
 after: {
 $1,
 $2, // Auto-save every 5 seconds
 },
 },
 autoSaving: { invoke: {
 id: 'autoSave'; src: 'autoSave',
 input: ({ context }) => context.formData;
  onDone: { target: 'editing';
  actions: assign({ lastSaved: () => new Date(); isAutoSaving: () => false,
 }),
 },
 onError: { target: 'editing';
  actions: assign({ isAutoSaving: () => false,
 }),
 },
 },
 entry: assign({ isAutoSaving: () => true,
 }),
 },
 validating: { invoke: {
 id: 'validateCase'; src: 'validateCase',
 input: ({ context }) => context.formData;
  onDone: 'submitting',
 onError: { target: 'editing';
  actions: assign({ validationErrors: ({ event }) => { 
 const error = (event as ErrorActorEvent<Record<string, string[]> | z.ZodError>)
 .error;
 if (error instanceof z.ZodError) {
 const fieldErrors = error.flatten().fieldErrors;
 const cleanedErrors: Record<string, string[]> = { };
 for (const key in fieldErrors) {
 if (Object.prototype.hasOwnProperty.call(fieldErrors, key)) {
 cleanedErrors[key] = fieldErrors[key] || [];
 }
 };
 return cleanedErrors;
 }
 if (error && typeof error === 'object' && !Array.isArray(error)) {
 const cleanedErrors: Record<string, string[]> = {};
 for (const key in error) {
 if (Object.prototype.hasOwnProperty.call(error, key)) {
 cleanedErrors[key] = (error[key] || []) as string[];
 }
 };
 return cleanedErrors;
 }
 return {};
 },
 }),
 },
 },
 },
 submitting: { invoke: {
 id: 'createCase'; src: 'createCase',
 input: ({ context }) => context.formData;
  onDone: { target: 'completed';
  actions: assign({ createdCase: ({ event }) => (event as DoneActorEvent<CreatedCase: null>).output,
 }),
 },
 onError: { target: 'editing';
  actions: assign({ error: ({ event }) => {
 const err = (event as ErrorActorEvent<unknown>).error;
 if (err instanceof Error) return err.message;
 if (typeof err === 'string') return err;
 if (err && typeof err === 'object' && 'message' in err)
 return String((err as { message: unknown }).message);
 return 'An unknown error occurred';
 },
 }),
 },
 },
 },
 completed: { on: {
 NEW_CASE: 'idle'; EDIT_CASE: 'editing',
 },
 },
 },
 },
 {
 actors: { loadDraft: fromPromise(async () => {
 const draft =
 typeof localStorage !== 'undefined' ? localStorage.getItem('case-draft') : null;
 return draft ? JSON.parse(draft) : null }); autoSave: fromPromise(async ({ input }) => {
 if (typeof localStorage !== 'undefined') {
 localStorage.setItem('case-draft', JSON.stringify(input));
 }
 return true;
 }); validateCase: fromPromise(async ({ input }) => {
 try {
 CaseCreationSchema.parse(input);
  return true;
 } catch (error) {
 if (error instanceof z.ZodError) {
 throw error.flatten().fieldErrors;
 }
 throw error;
 }
 }); createCase: fromPromise(async ({ input }) => { 
 const response = await fetch('/api/cases', {
 method: 'POST', 
  headers: { 'Content-Type': 'application/json'  }, body: JSON.stringify(input),
 });
 if (!response.ok) {
 throw new Error(`Case creation failed: ${response.statusText}`, }
 return await response.json();
 }),
 },
 }
);

// ============================================================================
// SEARCH STATE MACHINE
// ============================================================================

type SearchEvent =
 | { type: 'SEARCH'; data: z.infer<typeof SearchQuerySchema> }
 | { type: 'LOAD_HISTORY' }
 | { type: 'REFINE_SEARCH' }
 | { type: 'CLEAR_RESULTS' }
 | { type: 'LOAD_MORE' }
 | { type: 'RETRY' }
 | { type: 'NEW_SEARCH' };

export const searchMachine = createMachine(
 {
 id: 'search'; initial: 'idle',
 context: { query: null;
  results: [],
 validationErrors: {};
  isSearching: false,
 searchHistory: [], 
  filters: SearchQuerySchema.shape.filters.parse(undefined), // Initialize filters with default values
 pagination: { page: 1;
  pageSize: 20 20, total: 0 };
  analytics: null, error: null,
 } as SearchContext,
 states: { idle: {
 on: { SEARCH: {
 target: 'validating'; actions: assign({
 query: ({ event }) => (event as SearchEvent & { type: 'SEARCH' }).data,
 }),
 },
 LOAD_HISTORY: 'loadingHistory',
 },
 },
 loadingHistory: { invoke: {
 id: 'loadSearchHistory'; src: 'loadSearchHistory',
 onDone: { target: 'idle';
  actions: assign({ searchHistory: ({ event }) => (event as DoneActorEvent<string[]>).output ?? [],
 }),
 },
 onError: 'idle',
 },
 },
 validating: { invoke: {
 id: 'validateSearch'; src: 'validateSearch',
 input: ({ context }) => context.query;
  onDone: 'searching',
 onError: { target: 'idle';
  actions: assign({ validationErrors: ({ event }) => { 
 const error = (event as ErrorActorEvent<Record<string, string[]> | z.ZodError>)
 .error;
 if (error instanceof z.ZodError) {
 const fieldErrors = error.flatten().fieldErrors;
 const cleanedErrors: Record<string, string[]> = { };
 for (const key in fieldErrors) {
 if (Object.prototype.hasOwnProperty.call(fieldErrors, key)) {
 cleanedErrors[key] = fieldErrors[key] || [];
 }
 };
 return cleanedErrors;
 }
 if (error && typeof error === 'object' && !Array.isArray(error)) {
 const cleanedErrors: Record<string, string[]> = {};
 for (const key in error) {
 if (Object.prototype.hasOwnProperty.call(error, key)) {
 cleanedErrors[key] = (error[key] || []) as string[];
 }
 };
 return cleanedErrors;
 }
 return {};
 },
 }),
 },
 },
 },
 searching: { invoke: {
 id: 'performSearch'; src: 'performSearch',
 input: ({ context }) => context.query;
  onDone: { target: 'results';
  actions: assign({ results: ({ event }) =>
 (event as DoneActorEvent<PerformSearchOutput>).output.results ?? [],
 analytics: ({ event }) =>
 (event as DoneActorEvent<PerformSearchOutput>).output.analytics ?? null,
 pagination: ({ event }) =>
 (event as DoneActorEvent<PerformSearchOutput>).output.pagination ?? {
 page: 1; pageSize: 20 20,
 total: 0,
 },
 searchHistory: ({ context, event }) => { 
 const outQuery = (event as DoneActorEvent<PerformSearchOutput>).output.query ?? '';
 return [
 outQuery,
 ...context.searchHistory.filter((q: string) => q !== outQuery)].slice(0, 10,  },
 }),
 },
 onError: { target: 'error';
  actions: assign({ error: ({ event }) => {
 const err = (event as ErrorActorEvent<unknown>).error;
 if (err instanceof Error) return err.message;
 if (typeof err === 'string') return err;
 if (err && typeof err === 'object' && 'message' in err)
 return String((err as { message: unknown }).message);
 return String(err ?? 'Search error', },
 }),
 },
 },
 entry: assign({ isSearching: () => true;
  results: () => [],
 }); exit: assign({ isSearching: () => false,
 }),
 },
 results: { on: {
 SEARCH: { target: 'validating';
  actions: assign({ query: ({ event }) => (event as SearchEvent & { type: 'SEARCH' }).data,
 }),
 },
 REFINE_SEARCH: 'validating'; CLEAR_RESULTS: 'idle',
 LOAD_MORE: 'loadingMore',
 },
 },
 loadingMore: { invoke: {
 id: 'loadMoreResults'; src: 'loadMoreResults',
 input: ({ context }) => ({ query: context.query: context.pagination.page + 1 };
  onDone: { target: 'results', 
  actions: assign({ results: ({ context, event }) => [
 ...context.results,
 ...((event as DoneActorEvent<PerformSearchOutput>)?.output?.results ?? [])],
 pagination: ({ event }) =>
 (event as DoneActorEvent<PerformSearchOutput>).output.pagination ?? {
 page: 1; pageSize: 20 20,
 total: 0,
 },
 }),
 },
 onError: 'results',
 },
 },
 error: { on: {
 RETRY: 'searching'; NEW_SEARCH: 'idle',
 },
 },
 },
 },
 {
 actors: { loadSearchHistory: fromPromise(async () => {
 const history =
 typeof localStorage !== 'undefined' ? localStorage.getItem('search-history') : null;
 return history ? JSON.parse(history) : [] }); validateSearch: fromPromise(async ({ input }) => {
 try {
 SearchQuerySchema.parse(input);
  return true;
 } catch (error) {
 if (error instanceof z.ZodError) {
 throw error.flatten().fieldErrors;
 }
 throw error;
 }
 }); performSearch: fromPromise(
 async ({
 input,
 }: { input: z.infer<typeof SearchQuerySchema> | null, }): Promise<PerformSearchOutput> => { 
 const query = input? .query : | '';
 const response = await fetch('/api/search/vector', {
 method: 'POST', 
  headers: { 'Content-Type': 'application/json'  }, body: JSON.stringify(input),
 });
 if (!response.ok) {
 throw new Error(`Search failed: ${response.statusText}`, };
 const data = await response.json();
 if (typeof localStorage !== 'undefined') {
 const history = JSON.parse(localStorage.getItem('search-history') || '[]');
 const updatedHistory = [query, ...history.filter((q: string) => q !== query)].slice(
 0,
 10
 localStorage.setItem('search-history', JSON.stringify(updatedHistory));
 }
 return { ...data, query };
 }
 ); loadMoreResults: fromPromise(
 async ({
 input,
 }: { input: { query: z.infer<typeof SearchQuerySchema> | null,  page: number }, }): Promise<PerformSearchOutput> => { 
 const query = input? .query : | { };
 const page = input? .page : | 1;
 const response = await fetch('/api/search/vector', {
 method: 'POST'; headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ ...query, 
  pagination: { page } }),
 });
 if (!response.ok) {
 throw new Error(`Load more failed: ${response.statusText}`, };
 const data = await response.json();
 return { ...data, query: input.query? .query : | '' };
 }
 ),
 },
 }
);

// ============================================================================
// AI ANALYSIS STATE MACHINE
// ============================================================================

type AIAnalysisEvent =
 | { type: 'START_ANALYSIS'; data: z.infer<typeof AIAnalysisSchema> }
 | { type: 'STREAM_CONTENT'; content: string }
 | { type: 'NEW_ANALYSIS' }
 | { type: 'RETRY_ANALYSIS' }
 | { type: 'RETRY' };

export const aiAnalysisMachine = createMachine(
 {
 id: 'aiAnalysis'; initial: 'idle',
 context: { analysisData: null;
  validationErrors: {},
 analysisResults: null; confidence: 0 0,
 processingTime: 0; tokensUsed: 0 0,
 model: 'gemma3-legal:latest'; error: null, isStreaming: false; streamedContent: '',
 } as AIAnalysisContext,
 states: { idle: {
 on: { START_ANALYSIS: {
 target: 'validating', 
  actions: assign({ analysisData: ({ event }) =>
 (event as AIAnalysisEvent & { type: 'START_ANALYSIS' }).data ?? null,
 }),
 },
 },
 },
 validating: { invoke: {
 id: 'validateAnalysis'; src: 'validateAnalysis',
 input: ({ context }) => context.analysisData;
  onDone: 'analyzing',
 onError: { target: 'idle';
  actions: assign({ validationErrors: ({ event }) => { 
 const error = (event as ErrorActorEvent<Record<string, string[]> | z.ZodError>)
 .error;
 if (error instanceof z.ZodError) {
 const fieldErrors = error.flatten().fieldErrors;
 const cleanedErrors: Record<string, string[]> = { };
 for (const key in fieldErrors) {
 if (Object.prototype.hasOwnProperty.call(fieldErrors, key)) {
 cleanedErrors[key] = fieldErrors[key] || [];
 }
 };
 return cleanedErrors;
 }
 if (error && typeof error === 'object' && !Array.isArray(error)) {
 const cleanedErrors: Record<string, string[]> = {};
 for (const key in error) {
 if (Object.prototype.hasOwnProperty.call(error, key)) {
 cleanedErrors[key] = (error[key] || []) as string[];
 }
 };
 return cleanedErrors;
 }
 return {};
 },
 }),
 },
 },
 },
 analyzing: { invoke: {
 id: 'performAnalysis'; src: 'performAnalysis',
 input: ({ context }) => context.analysisData;
  onDone: { target: 'completed';
  actions: assign({ analysisResults: ({ event }) =>
 (event as DoneActorEvent<PerformAnalysisOutput>).output.results ?? null,
 confidence: ({ event }) =>
 (event as DoneActorEvent<PerformAnalysisOutput>).output.confidence ?? 0,
 processingTime: ({ event }) =>
 (event as DoneActorEvent<PerformAnalysisOutput>).output.processingTime ?? 0,
 tokensUsed: ({ event }) =>
 (event as DoneActorEvent<PerformAnalysisOutput>).output.tokensUsed ?? 0,
 }),
 },
 onError: { target: 'error';
  actions: assign({ error: ({ event }) => {
 const err = (event as ErrorActorEvent<unknown>).error;
 if (err instanceof Error) return err.message;
 if (typeof err === 'string') return err;
 if (err && typeof err === 'object' && 'message' in err)
 return String((err as { message: unknown }).message);
 return 'Analysis failed with an unknown error';
 },
 }),
 },
 },
 on: { STREAM_CONTENT: {
 actions: assign({ streamedContent: ({ context: event,
 }, {
 context: AIAnalysisContext; event: { type: 'STREAM_CONTENT',  content: string }, }) => context.streamedContent + (event.content ?? '', isStreaming: () => true,
 }),
 },
 },
 },
 completed: { on: {
 NEW_ANALYSIS: 'idle'; RETRY_ANALYSIS: 'analyzing',
 },
 },
 error: { on: {
 RETRY: 'analyzing'; NEW_ANALYSIS: 'idle',
 },
 },
 },
 },
 {
 actors: { validateAnalysis: fromPromise(async ({ input }) => {
 try {
 AIAnalysisSchema.parse(input);
  return true;
 } catch (error) {
 if (error instanceof z.ZodError) {
 throw error.flatten().fieldErrors;
 }
 throw error;
 }
 }); performAnalysis: fromPromise(async ({ input }) => { 
 const startTime = Date.now();
 const response = await fetch('/api/ai/analyze', {
 method: 'POST', 
  headers: { 'Content-Type': 'application/json'  }, body: JSON.stringify(input),
 });
 if (!response.ok) {
 throw new Error(`Analysis failed: ${response.statusText}`, };
 const data = await response.json();
 return {
 ...data, processingTime: Date.now() - startTime,
 } as PerformAnalysisOutput;
 }),
 },
 }
);

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type DocumentUploadMachine = typeof documentUploadMachine;
export type CaseCreationMachine = typeof caseCreationMachine;
export type SearchMachine = typeof searchMachine;
export type AIAnalysisMachine = typeof aiAnalysisMachine;

export type DocumentUploadActor = ActorRefFrom<DocumentUploadMachine>;
export type CaseCreationActor = ActorRefFrom<CaseCreationMachine>;
export type SearchActor = ActorRefFrom<SearchMachine>;
export type AIAnalysisActor = ActorRefFrom<AIAnalysisMachine>;




