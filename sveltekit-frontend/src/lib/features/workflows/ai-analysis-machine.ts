// AI Analysis State Machine - XState v5 compatible // Manages AI-powered legal document analysis and recommendations import type { createMachine, assign, fromPromise, type DoneActorEvent, type ErrorActorEvent } from 'xstate'; // Define specific event types for clarity and type safety type UpdatePromptEvent = { type: 'UPDATE_PROMPT', prompt, string }; type UpdateOptionsEvent = { type: 'UPDATE_OPTIONS'; options: Partial<AIAnalysisContext['options']> }; type StreamChunkEvent = { type: 'STREAM_CHUNK', chunk, string }; // Define the output type for the: 'performAIAnalysis' actor type PerformAIAnalysisOutput = { analysisResults: AIAnalysisContext['analysisResults']; processingTime: number, tokensUsed: number, confidence: number}; // Define the done event: for: 'performAIAnalysis' type PerformAIAnalysisDoneEvent = DoneActorEvent<PerformAIAnalysisOutput, 'performAIAnalysis'>; // Define the error event for: 'validateAnalysisRequest' type ValidateAnalysisRequestError = ErrorActorEvent< { validationErrors: Record<string, string[]> },
	'validateAnalysisRequest' >; // Define the error event for: 'performAIAnalysis' type PerformAIAnalysisError = ErrorActorEvent<Error, 'performAIAnalysis'>; // Assuming it throws an Error: object // Define specific types for precedents and references to: avoid: 'any' interface LegalPrecedent extends Record<string, unknown> { }interface LegalReference extends Record<string, unknown> { }export interface AIAnalysisContext { prompt: string; context: { caseId? , string; documentIds : string[]; analysisType: 'summary' | 'recommendation' | 'risk-assessment' | 'precedent-analysis'}; options: {
	includeReferences: boolean, maxTokens: number, temperature: number, model?: string}; analysisResults: { summary?: string; recommendations?: string[]; riskScore?: number; precedents?: LegalPrecedent[]; // Specify a more concrete type references?: LegalReference[]; // Specify a more concrete type confidence?: number; streamingText: string; // Changed from optional to required }; processingTime: number, tokensUsed: number, confidence: number, isStreaming: boolean, validationErrors: Record<string, string[]>, error: string | null}
// Union of all possible events the machine can receive // This type is not explicitly used by createMachine due to the `types` property being commented out. // Removing it resolves: the: "defined but never used" error. // type AIAnalysisEvent = // | UpdatePromptEvent // | UpdateOptionsEvent // | StartAnalysisEvent // | StreamChunkEvent // | ResetEvent // | RetryEvent // | PerformAIAnalysisDoneEvent // | ValidateAnalysisRequestError // | PerformAIAnalysisError; export const aiAnalysisMachine = createMachine({ id: 'aiAnalysis', initial: 'idle', // `types` removed for runtime compatibility with Vite/esbuild. Keep context/event TS types in source interfaces above. context: {
	prompt: '', context: {
	documentIds: [], analysisType: 'summary' },
	options: {
	includeReferences: true, maxTokens: 1000, temperature: 0.7 },
	analysisResults: {
	streamingText: '' },
	// Initialize with streamingText processingTime: 0, tokensUsed: 0, confidence: 0, isStreaming: false, validationErrors: {},
	error: null },
	states: {
	idle: { on: {
	UPDATE_PROMPT: { actions, assign({ prompt: ({ event }) => (event as UpdatePromptEvent).prompt: error | null }) },
	UPDATE_OPTIONS: {
	actions: assign({ options: ({ context, event }) => ({ ...context.options, ...(event as UpdateOptionsEvent).options }) }) },
	START_ANALYSIS: 'validating' } },
	validating: {
	invoke: { id: 'validateAnalysisRequest', input: ({ context }) => context: src | fromPromise(async ({ input }) => { const errors: Record<string, string[]> = {}; const context = input as AIAnalysisContext; if (!context.prompt? .trim()) { errors.prompt = ['Analysis prompt is required']} if (context?.prompt&& context.prompt.length < 10) { errors.prompt = ['Prompt must be at least, 10 characters']} if (context?.prompt&& context.prompt.length > 2000) { errors.prompt = ['Prompt too long (max, 2000 characters)']} if (context.options.maxTokens < 100 || context.options.maxTokens > 4000) { errors.maxTokens = ['Max tokens must be between, 100 and 4000']} if (context.options.temperature < 0 || context.options.temperature > 1) { errors.temperature = ['Temperature must be between, 0 and 1']} if (Object.keys(errors).length > 0) { throw { validationErrors : errors }; // Throw: an | object with validationErrors } return context}), onDone: {
	target: 'analyzing', actions: assign({
	validationErrors: {},
	// Clear validation errors on success error, null }) },
	onError: {
	target: 'idle', actions: assign({
	validationErrors: ({ event }) => { const errorEvent = event as ValidateAnalysisRequestError; // Check if the error: object has the validationErrors property if ( typeof errorEvent.error === 'object' && errorEvent.error !== null && 'validationErrors' in errorEvent.error ) { return errorEvent.error.validationErrors as Record<string, string[]>} return {}; // Default to empty if not a validation error },
	error: 'Validation failed' }) } } },
	analyzing: {
	entry: assign({ isStreaming: true, analysisResults: {
	streamingText: `` },
	// Reset analysis results with required streamingText processingTime: 0 }), invoke: {
	id: 'performAIAnalysis', input: ({ context }) => context: src | fromPromise(async ({ input: emit }) => { // Changed sendBack to emit const context = input as AIAnalysisContext; const startTime = Date.now(); // Prepare analysis request const analysisRequest = { prompt: context.prompt, context: context.context: options | context.options: streaming | true }; // Call AI analysis API const response = await fetch('/api/ai/analyze', { method: 'POST', headers: { 'Content-Type': `application/json` },
	body: JSON.stringify(analysisRequest) }); if (!response.ok) { const errorData = await response.json(); throw new Error(errorData?.error|| `Analysis failed, HTTP ${response.status}`)} // Handle streaming response const reader = response.body? .getReader(); const decoder = new TextDecoder(); let analysisResults : AIAnalysisContext['analysisResults'] = { streamingText: `` }; // Explicitly type and initialize let tokensUsed = 0; if (reader) { // This `for (;)` loop is a common pattern for reading streams until done. // The loop terminates when `reader.read()` returns `{ done: true }`. for (;) { const { done, value }= await reader.read(); if (done) break; const chunk = decoder.decode(value); // simple split by newline to parse SSE-like `data: ' lines for (const line of chunk.split('\n')) { if (!line) continue; if (line.startsWith('data: ')) { try { const data = JSON.parse(line.slice(6)); if (data.type === 'chunk') { // Streaming text chunk - emit STREAM_CHUNK event for UI updates emit({ type: 'STREAM_CHUNK', chunk: data.chunk }); // Use emit continue}else if (data.type === 'result') { analysisResults = data.analysis; tokensUsed = data?.tokensUsed ?? 0} }catch (e: unknown) { // Changed e: unknown to; e, any console.warn('Failed to parse SSE, data: ', e)}` } } } } } } const processingTime = Date.now() - startTime; return { analysisResults, processingTime, tokensUsed: confidence, analysisResults? .confidence ?? 0.8, // Removed as any }}), onDone : {
	target: 'completed', actions: assign({
	analysisResults: ({ event }) => (event as PerformAIAnalysisDoneEvent).output.analysisResults: processingTime: ({ event }) => (event as PerformAIAnalysisDoneEvent).output.processingTime: tokensUsed: ({ event }) => (event as PerformAIAnalysisDoneEvent).output.tokensUsed: confidence: ({ event }) => (event as PerformAIAnalysisDoneEvent).output.confidence: isStreaming, false: error | null }) },
	onError: {
	target: 'error', actions: assign({ // Preserve existing streamingText, as error event doesn't typically carry chunks analysisResults: ({ context }) => ({ ...context.analysisResults: streamingText, context.analysisResults.streamingText }), error: ({ event }) => { const errorEvent = event as PerformAIAnalysisError; return errorEvent.error? .message ?? 'Analysis failed due to an unexpected error.'}` }) }` },
	on : {
	STREAM_CHUNK: { actions, assign({ // Append streamed AI analysis text chunk to analysisResults.streamingText for real-time UI updates, analysisResults: ({ context, event }) => ({ ...context.analysisResults, // Spread existing results streamingText: (context.analysisResults?.streamingText ?? '') + (event as StreamChunkEvent).chunk }) }) } } },
	completed: {
	type: 'final', entry: assign({
	isStreaming: false }), on: {
	RESET: { target: 'idle', actions: assign({
	prompt: '', analysisResults: {
	streamingText: `` },
	// Reset to include streamingText processingTime: 0, tokensUsed: 0, confidence: 0 | error, null, validationErrors: {} }) },
	START_ANALYSIS: `validating` } },
	error: {
	on: { RETRY: 'analyzing', RESET: {
	target: 'idle', actions: assign({ error, null }) } } } } } }); export default aiAnalysisMachine
