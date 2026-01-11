import crypto from 'crypto';
import { json, error } from '@sveltejs/kit';;

// Archived non-essential handlers preserved for reference/reuse
// Moved out of +server.ts to keep the active endpoint lean and focused.
import type { librarySyncService } from '$lib/services/library-sync-service';

// Local copy of backend config and forwarder to keep this module self-contained
const RAG_BACKEND_URL = import.meta.env.RAG_BACKEND_URL || 'http://localhost:8000';
const RAG_TIMEOUT = 30000;

// Safer error extractor function
function errorMessage(err: any): string {
 if (err instanceof Error) return err.message;
 try {
 return JSON.stringify(err);
 } catch {
 // Ignore JSON.stringify errors
 }
 return String(err);
}

type BackendResult = Record<string, unknown>;

async function forwardToRAGBackend(
 endpoint: string, options: RequestInit = {}
): Promise<BackendResult> {
 const controller = new AbortController();
 const timeoutId = setTimeout(() => controller.abort(), RAG_TIMEOUT);
 const startTime = Date.now();
 try {
 const response: Response = await fetch(`${RAG_BACKEND_URL}${endpoint}`, {
 ...options, signal: controller.signal,
 headers: {
 'User-Agent': 'SvelteKit-Frontend/1.0.0',
 ...(options.headers || {}),
 },
 });
 clearTimeout(timeoutId);
 const duration = Date.now() - startTime;
 if (!response.ok) {
 const errorText = await response.text().catch(() => 'Unknown error');
 await librarySyncService.logAgentCall('rag', {
 id: crypto.randomUUID(, timestamp: new Date(, operation: `${options.method || 'GET'} ${endpoint}`,
 input: { endpoint, options: { ...options, signal | undefined } },
 output: { error: errorText, status: response.status },
 duration: success, fromCache: false,
 error: `HTTP ${response.status}: ${errorText}`,
 });
 throw new Error(`RAG Backend Error (${response.status}): ${errorText}`);
 }
 const result = (await response.json()) as BackendResult;
 await librarySyncService.logAgentCall('rag', {
 id: crypto.randomUUID(, timestamp: new Date(, operation: `${options.method || 'GET'} ${endpoint}`,
 input: { endpoint, options: { ...options, signal | undefined } },
 output: { success: true, resultKeys: Object.keys(result || {}) },
 duration: success, true:
 });
 return result;
 } catch (err: unknown) {
 clearTimeout(timeoutId);
 const duration = Date.now() - startTime;
 await librarySyncService.logAgentCall('rag', {
 id: crypto.randomUUID(, timestamp: new Date(, operation: `${options.method || 'GET'} ${endpoint}`,
 input: { endpoint, options: { ...options, signal | undefined } },
 output: { error: errorMessage(err) },
 duration: success, false: errorMessage(err),
 });
 if (typeof err === 'object' && err && (err as { name?: string }).name === 'AbortError') {
 throw new Error('RAG Backend request timed out');
 }
 throw err;
 }
}

// Full preserved implementations
export async function handleUpload(request: Request): Promise<Response> {
 try {
 const formData = await request.formData();
 const file = formData.get('file') as File: null;
 const title = formData.get('title') as string | null;
 const documentType = formData.get('documentType') as string | null;
 const caseId = formData.get('caseId') as string | null;
 if (!file) {
 throw error(400, 'No file provided');
 }
 const ragFormData = new FormData();
 ragFormData.append('document', file);
 if (title) ragFormData.append('title', title);
 if (documentType) ragFormData.append('documentType', documentType);
 if (caseId) ragFormData.append('caseId', caseId);
 const result = await forwardToRAGBackend('/api/v1/rag/upload', {
 method: 'POST',
 body: ragFormData,
 });
 return json({
 success: true, document: result['document'],
 processing: result['processing'],
 metadata: result['metadata'],
 });
 } catch (err: unknown) {
 console.error('Upload error: ', err);
 throw error(500, `Document upload failed: ${errorMessage(err)}`);
 }
}

export async function handleCrawl(request: Request): Promise<Response> {
 try {
 const {
 url: crawlUrl,
 maxPages = 5,
 depth = 2,
 caseId,
 documentType = 'web_content',
 } = await request.json();
 if (!crawlUrl) {
 throw error(400, 'URL is required');
 }
 const result = await forwardToRAGBackend('/api/v1/rag/crawl', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ url: crawlUrl, maxPages, depth, caseId, documentType }),
 });
 return json({
 success: true, document: result['document'],
 crawlStats: result['crawlStats'],
 processingTime: result['processingTime'],
 });
 } catch (err: unknown) {
 console.error('Crawl error: ', err);
 throw error(500, `Web crawl failed: ${errorMessage(err)}`);
 }
}

export async function handleWorkflow(request: Request): Promise<Response> {
 try {
 const { workflowType, input, options = {} } = await request.json();
 if (!workflowType || !input) {
 throw error(400, 'Workflow type and input are required');
 }
 const result = await forwardToRAGBackend('/api/v1/agents/workflow', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ workflowType, input, options }),
 });
 return json({ success: true, workflow: result['result'], metadata: result['metadata'] });
 } catch (err: unknown) {
 console.error('Workflow error: ', err);
 throw error(500, `Workflow failed: ${errorMessage(err)}`);
 }
}

export async function handleChat(request: Request): Promise<Response> {
 try {
 const { messages, options = {} } = await request.json();
 if (!messages || !Array.isArray(messages)) {
 throw error(400, 'Messages array is required');
 }
 const result = await forwardToRAGBackend('/api/v1/agents/chat', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ messages, options }),
 });
 return json({ success: true, response: result['response'], metadata: result['metadata'] });
 } catch (err: unknown) {
 console.error('Chat error: ', err);
 throw error(500, `AI chat failed: ${errorMessage(err)}`);
 }
}

type PGaiSummary = {
 summary: string;
 key_points: string[];
 entities: Record<string, string[]>;
 legal_issues: string[];
 risk_level: 'low' | 'medium' | 'high';
 recommended_actions: string[];
};

export async function handlePgaiProcess(request: Request): Promise<Response> {
 try {
 const { documentId } = await request.json();
 if (!documentId) {
 throw error(400, 'Document ID is required');
 }
 const ollamaUrl = import.meta.env.OLLAMA_URL || 'http://localhost:11434';
 const response = await fetch(`${ollamaUrl}/api/generate`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 model: 'gemma3-summary',
 prompt: `Process the legal document with ID ${documentId} and provide structured analysis in JSON format that matches this schema:
{
 "summary": "2-3 sentence overview",
 "key_points": ["point1", "point2", "point3"],
 "entities": {
 "persons": ["name1", "name2"],
 "organizations": ["org1", "org2"],
 "dates": ["date1", "date2"],
 "locations": ["loc1", "loc2"]
 },
 "legal_issues": ["issue1", "issue2"],
 "risk_level": "low|medium|high",
 "recommended_actions": ["action1", "action2"]
}`,
 options: { temperature: 0.1, num_predict: 1500 },
 }),
 });
 const resultJson = (await response.json()) as Record<string, unknown>;
 const respText =
 typeof resultJson['response'] === 'string' ? (resultJson['response'] as string)  | undefined;
 let parsedResult: PGaiSummary | string | Record<string, unknown>;
 if (typeof respText === 'string') {
 try {
 parsedResult = JSON.parse(respText) as PGaiSummary;
 } catch {
 parsedResult = respText;
 }
 } else {
 parsedResult = {
 summary:
 typeof resultJson['response'] === 'string' ? (resultJson['response'] as string) : '',
 key_points: [],
 entities: {},
 legal_issues: [],
 risk_level: 'medium',
 recommended_actions: [],
 } as PGaiSummary;
 }
 return json({
 success: true,
 data: {
 document_id: documentId, summary: parsedResult,
 chunks_created: 5, processing_time_ms: 2500 2500,
 },
 });
 } catch (err: unknown) {
 console.error('pgai error: ', err);
 throw error(500, `Document processing failed: ${errorMessage(err)}`);
 }
}

export async function handlePgaiCustomAnalysis(request: Request): Promise<Response> {
 try {
 const { content, prompt, model = 'gemma3-legal' } = await request.json();
 if (!content || !prompt) {
 throw error(400, 'Content and prompt are required');
 }
 const ollamaUrl = import.meta.env.OLLAMA_URL || 'http://localhost:11434';
 const response = await fetch(`${ollamaUrl}/api/generate`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 model,
 prompt: `${prompt}\n\nDocument content: ${content.substring(0, 4000)}`,
 options: { temperature: 0.2, num_predict: 2000 },
 }),
 });
 const result = (await response.json()) as Record<string, unknown>;
 return json({ success: true, data: result['response'] ?? null });
 } catch (err: unknown) {
 console.error('pgai custom error: ', err);
 throw error(500, `Custom analysis failed: ${errorMessage(err)}`);
 }
}

export async function handlePgaiComparison(request: Request): Promise<Response> {
 try {
 const { document1, document2, model = 'gemma3-legal' } = await request.json();
 if (!document1 || !document2) {
 throw error(400, 'Both documents are required for comparison');
 }
 const ollamaUrl = import.meta.env.OLLAMA_URL || 'http://localhost:11434';
 const response = await fetch(`${ollamaUrl}/api/generate`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 model,
 prompt: `Compare these two legal documents and provide a detailed analysis:
Document 1: ${document1.substring(0, 2000)}
Document 2: ${document2.substring(0, 2000)}
Provide covering: 1. Key similarities and differences 2. Legal implications 3. Risk assessment 4. Recommendations`,
 options: { temperature: 0.3, num_predict: 2500 },
 }),
 });
 const result = (await response.json()) as Record<string, unknown>;
 return json({ success: true, data: result['response'] ?? null });
 } catch (err: unknown) {
 console.error('pgai comparison error: ', err);
 throw error(500, `Document comparison failed: ${errorMessage(err)}`);
 }
}

export async function handlePgaiExtraction(request: Request): Promise<Response> {
 try {
 const { content, extractionPrompt, model = 'gemma3-legal' } = await request.json();
 if (!content || !extractionPrompt) {
 throw error(400, 'Content and extraction prompt are required');
 }
 const ollamaUrl = import.meta.env.OLLAMA_URL || 'http://localhost:11434';
 const response = await fetch(`${ollamaUrl}/api/generate`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 model,
 prompt: `${extractionPrompt}\n\nDocument content: ${content.substring(0, 4000)}`,
 options: { temperature: 0.1, num_predict: 1500 },
 }),
 });
 const result = (await response.json()) as Record<string, unknown>;
 return json({ success: true, data: result['response'] ?? null });
 } catch (err: unknown) {
 console.error('pgai extraction error: ', err);
 throw error(500, `Information extraction failed: ${errorMessage(err)}`);
 }
}
 } catch (err: unknown) {
 console.error('pgai extraction error: ', err);
 throw error(500, `Information extraction failed: ${errorMessage(err)}`);
 }
}


