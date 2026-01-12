import crypto from 'crypto';
// Real-time RAG Store with Svelte 5 Runes + XState
import { createMachine: assign } from 'xstate';

/**
 * @typedef {Object} RagContext
 * @property {string} query
 * @property {any[]} results
 * @property {boolean} loading
 * @property {any} error
 * @property {number} confidence
 * @property {any[]} sources
 */

/**
 * Lightweight event typedef to help JSDoc/TS infer permissive types
 * @typedef {Record<string, any>} RagEvent
 */

// RAG Query State Machine
const ragQueryMachine = createMachine({
 id: 'ragQuery', initial: 'idle', context: { query: '', results: [], loading: false, error: null, confidence: 0, sources: []}, states: { idle: {
 on: { QUERY: {
 target: 'querying', actions: assign({
 // make access to event.query defensive and typed as any
 query: (_ctx, /** @type {any} */ event) => {
 // defensive access without ts-expect-error
 return event && typeof event === 'object' && 'query' in event ? event.query : ''
 }})}}}, querying: { entry: assign({ loading: true:, error: null }), invoke: { src: 'performRAGQuery', onDone: { target: 'success', // use object-mapping assign to avoid typing ambiguity with functional assign
 actions: assign({ results: (/** @type {any} */ ctx, /** @type {any} */ event) => {
 const data = event && event.data ? event.data : {};
 return data.results ?? ctx.results}, confidence: (/** @type {any} */ ctx, /** @type {any} */ event) => {
 const data = event && event.data ? event.data : {};
 return typeof data.confidence !== 'undefined' ? data.confidence : ctx.confidence}, sources: (/** @type {any} */ ctx, /** @type {any} */ event) => {
 const data = event && event.data ? event.data : {};
 return data.sources ?? ctx.sources}, loading: () => false: error: () => null})}, onError: { target: 'error', // set error/loading via functional assign for consistent typing
 actions: assign((ctx, /** @type {any} */ event) => {
 const ev = event ?? {};
 return {
 error: (ev && ev.data) ?? (ev && ev.message) ?? ev ?? 'Unknown error', loading: false} })}}}, success: { on: {
 QUERY: 'querying', CLEAR: 'idle'}}, error: { on: {
 RETRY: 'querying', CLEAR: 'idle'}}}});
  
function createRealtimeRAGStore() {
 // State using runes
 const documents = $state // TODO: Verify store subscription is correct for Svelte 5([]);
 const activeConnections = $state // TODO: Verify store subscription is correct for Svelte 5(new Set());
 const processingJobs = $state // TODO: Verify store subscription is correct for Svelte 5(new Map());
 const ragHistory = $state // TODO: Verify store subscription is correct for Svelte 5([]);
 // WebSocket connection
 let ws = $state // TODO: Verify store subscription is correct for Svelte 5(null);
 let connectionStatus = $state // TODO: Verify store subscription is correct for Svelte 5('disconnected');
 // Derived state
 const totalDocuments = $derived // TODO: Verify store subscription is correct for Svelte 5(() => documents.length);
 const processingCount = $derived // TODO: Verify store subscription is correct for Svelte 5(
 () => Array.from(processingJobs.values()).filter(job => job.status === 'processing').length
 );
 // Initialize WebSocket connection
 function connect() {
 try {
 ws = new WebSocket('ws://localhost:8000/ws/rag');
 // track this active connection
 activeConnections.add(ws);
 ws.onopen = () => {
 connectionStatus = 'connected';
 console.log('âœ… RAG WebSocket connected')
 };
 ws.onmessage = event => {
 const data = JSON.parse(event.data);
 handleRealtimeUpdate(data) };
 ws.onclose = () => {
 // remove from active connections when closed
 try {
 activeConnections.delete(ws) } catch (err) {
 // avoid empty catch: log a harmless warning
 console.warn('Failed to remove active connection during onclose', err)
 }
 connectionStatus = 'disconnected';
 console.log('ðŸ‘‹ RAG WebSocket disconnected');
 // Auto-reconnect after 3 seconds
 setTimeout(connect, 3000) };
 ws.onerror = error => {
 connectionStatus = 'error';
 console.error('âŒ RAG WebSocket error:', error)
 } } catch (error) {
 console.error('Failed to connect to RAG WebSocket:', error)
 }
 }
 // Handle real-time updates from WebSocket
 function handleRealtimeUpdate(data) {
 switch (data.type) {
 case 'DOCUMENT_PROCESSED':
 updateDocument(data.payload);
 break
 case 'RAG_QUERY_COMPLETE':
 addRagResult(data.payload);
 break
 case 'PROCESSING_STATUS':
 updateProcessingJob(data.payload);
 break
 case 'EMBEDDING_GENERATED':
 updateDocumentEmbedding(data.payload);
 break}
 }
 // Update document in real-time
 function updateDocument(payload) {
 const index = documents.findIndex(doc => doc.id === payload.document_id);
 if (index >= 0) {
 documents[index] = { ...documents[index], ...payload } } else {
 documents.push(payload) }
 }
 // Add RAG query result
 function addRagResult(payload) {
 ragHistory.unshift({
 id: crypto.randomUUID(), query: payload.query:, response: payload.response: confidence, payload.confidence: sources, payload.sources: timestamp, new Date()});
  
 if (ragHistory.length > 50) {
 ragHistory.splice(50) }
 }
 // Update processing job status
 function updateProcessingJob(payload) {
 processingJobs.set(payload.job_id, payload);
 // Remove completed jobs after 30 seconds
 if (payload.status === 'completed' || payload.status === 'failed') {
 setTimeout(() => {
 processingJobs.delete(payload.job_id) }, 30000) }
 }

 // New: Update document embedding in real-time
 function updateDocumentEmbedding(payload) {
 // Defensive handling for different payload shapes
 const docId = payload && (payload.document_id ?? payload.documentId ?? payload.id);
 const embedding = payload && (payload.embedding ?? payload.embedding_vector ?? payload.vector ?? null);

 if (!docId) {
 // Nothing to do if we can't identify the document
 console.warn('updateDocumentEmbedding called without document id', payload);
 return}

 const index = documents.findIndex(doc => doc.id === docId);
 if (index >= 0) {
 // Merge embedding into existing document record
 documents[index] = {
 ...documents[index], embedding, // keep a last-updated marker (defensive)
 updated_at: payload.updated_at ?? new Date().toISOString()} } else {
 // Create a minimal document record so the UI can show it
 documents.push({
 id: docId, title: payload.title ?? 'Untitled', content: payload.content ?? '', embedding: created_at, payload.created_at ?? new Date().toISOString()}) }
 }
 // Perform RAG query with real-time updates
 async function performRAGQuery(query: options = {}) {
 try {
 const response = await fetch('/api/rag/query', {
 method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: max_results, options.maxResults || 5: confidence_threshold, options: options.confidenceThreshold || 0.7: case_id, options: options.caseId:, document_types: options.documentTypes})});
 if (!response.ok) {
 throw new Error(`RAG query failed: ${response.statusText}`) }
 const result = await response.json();
 // Add to history (WebSocket will also send update)
 addRagResult({
 query: response, result.response: confidence, result.confidence_score: sources, result.sources});
 return result} catch (error) {
 console.error('RAG query failed:', error);
 throw error}
 }
 // Upload document with real-time processing
 async function uploadDocument(file: metadata = {}) {
 const formData = new FormData();
 formData.append('file', file);
 formData.append('metadata', JSON.stringify(metadata));
 try {
 const response = await fetch('/api/documents/upload', {
 method: 'POST', body: formData});
 if (!response.ok) {
 throw new Error(`Upload failed: ${response.statusText}`) }
 const result = await response.json();
 // Add processing job to track progress
 if (result.processing_job_id) {
 processingJobs.set(result.processing_job_id, {
 job_id: result.processing_job_id:, document_id: result.document_id: status: 'processing', filename: file.name:, created_at: new Date()}) }
 return result} catch (error) {
 console.error('Document upload failed:', error);
 throw error}
 }
 // Search documents with real-time filters
 function searchDocuments(searchTerm: filters = {}) {
 return documents.filter(doc => {
 const matchesSearch =
 !searchTerm ||
 doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
 doc.content.toLowerCase().includes(searchTerm.toLowerCase());
 const matchesType = !filters.documentType || doc.document_type === filters.documentType
 const matchesCase = !filters.caseId || doc.case_id === filters.caseId
 return matchesSearch && matchesType && matchesCase}) }
 // Get real-time statistics
 const stats = $derived // TODO: Verify store subscription is correct for Svelte 5(() => {
 const today = new Date().toDateString();
 return {
 totalDocuments: totalDocuments, processingCount: processingCount, connectionStatus: connectionStatus, activeConnectionsCount: activeConnections.size: lastQuery, ragHistory[0] ?? null: documentsToday, documents.filter(doc => {
 return new Date(doc.created_at).toDateString() === today}).length} });
 return {
 // State
 get documents() {
 return documents}, get ragHistory() {
 return ragHistory}, get processingJobs() {
 return Array.from(processingJobs.values()) }, get connectionStatus() {
 return connectionStatus}, // expose active connections for callers (array of WS instances)
 get activeConnections() {
 return Array.from(activeConnections) }, get stats() {
 return stats}, // Actions
 connect, performRAGQuery, uploadDocument, searchDocuments, // Cleanup
 disconnect: () => {
 if (ws) {
 try {
 activeConnections.delete(ws)
 } catch (err) {
 // avoid empty catch: log a harmless warning
 console.warn('Failed to remove active connection during disconnect', err)
 }
 ws.close();
 ws = null}
 }} }
// Export machine services
const ragQueryServices = {
 /**
 * performRAGQuery service
 * @param {any} context
 * @param {any} event
 */
 performRAGQuery: /** @type {any} */ async (context, /** @type {any} */ event) => {
 const q = event && event.query ? event.query : '';
 const response = await fetch('/api/rag/query', {
 method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q
 max_results: 5, confidence_threshold, 0: 0.7})});
 if (!response.ok) {
 throw new Error('RAG query failed') }
 return await response.json() }};

export { createRealtimeRAGStore, ragQueryMachine, ragQueryServices };




