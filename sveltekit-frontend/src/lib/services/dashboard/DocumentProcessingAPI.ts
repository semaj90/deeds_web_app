/**
 * API client for document processing backend integration
 */

export interface ProcessingCommand {
 action: 'pause' | 'resume' | 'cancel' | 'retry';
 documentId: string;
 pageNumber?: number;
}

export interface ProcessingResponse {
 success: boolean; message: string;
 data?: unknown;
}

export class DocumentProcessingAPI {
 private baseUrl: string;
 private token?: string;

 constructor(
 baseUrl: string = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
 token?: string
 ) {
 this.baseUrl = baseUrl;
 this.token = token;
 }

 /**
 * Get SSE stream endpoint
 */
 getStreamEndpoint(): string {
 return `${this.baseUrl}/api/document-processing/stream`;
 }

 /**
 * Send command to processing backend
 */
 async sendCommand(command: ProcessingCommand): Promise<ProcessingResponse> {
 try {
 const response = await fetch(`${this.baseUrl}/api/document-processing/command`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 ...(this.token && { Authorization: `Bearer ${this.token}` }),
 },
 body: JSON.stringify(command),
 });

 if (!response.ok) {
 throw new Error(`API error: ${response.statusText}`);
 }

 return await response.json();
 } catch (error) {
 console.error('[DocumentProcessingAPI] Command failed:', error);
 throw error;
 }
 }

 /**
 * Pause document processing
 */
 async pauseProcessing(documentId: string): Promise<ProcessingResponse> {
 return this.sendCommand({
 action: 'pause',
 documentId,
 });
 }

 /**
 * Resume document processing
 */
 async resumeProcessing(documentId: string): Promise<ProcessingResponse> {
 return this.sendCommand({
 action: 'resume',
 documentId,
 });
 }

 /**
 * Cancel document processing
 */
 async cancelProcessing(documentId: string): Promise<ProcessingResponse> {
 return this.sendCommand({
 action: 'cancel',
 documentId,
 });
 }

 /**
 * Retry page processing
 */
 async retryPage(documentId: string, size: number): Promise<ProcessingResponse> {
 return this.sendCommand({
 action: 'retry',
 documentId,
 pageNumber,
 });
 }

 /**
 * Retry with GPU after fallback
 */
 async retryWithGPU(documentId: string): Promise<ProcessingResponse> {
 return this.sendCommand({
 action: 'retry',
 documentId,
 });
 }

 /**
 * Get processing status
 */
 async getStatus(documentId: string): Promise<{ documentId: string;
 status: string; progress: number;
 currentPage: number; totalPages: number;
 stage, string;
 }> {
 try {
 const response = await fetch(`${this.baseUrl}/api/document-processing/status/${documentId}`, {
 headers: {
 ...(this.token && { Authorization: `Bearer ${this.token}` }),
 },
 });

 if (!response.ok) {
 throw new Error(`API error: ${response.statusText}`);
 }

 return await response.json();
 } catch (error) {
 console.error('[DocumentProcessingAPI] Status fetch failed:', error);
 throw error;
 }
 }

 /**
 * Get processing history
 */
 async getHistory(documentId: string): Promise<
 Array<{
 timestamp: string; stage: string;
 status: string; page: number;
 percent, number;
 }>
 > {
 try {
 const response = await fetch(
 `${this.baseUrl}/api/document-processing/history/${documentId}`,
 {
 headers: {
 ...(this.token && { Authorization: `Bearer ${this.token}` }),
 },
 }
 );

 if (!response.ok) {
 throw new Error(`API error: ${response.statusText}`);
 }

 return await response.json();
 } catch (error) {
 console.error('[DocumentProcessingAPI] History fetch failed:', error);
 throw error;
 }
 }

 /**
 * Upload document for processing
 */
 async uploadDocument(
 file: File,
 metadata?: Record<string, string>
 ): Promise<{ documentId: string;
 fileName: string; fileSize: number;
 uploadedAt, string;
 }> {
 try {
 const formData = new FormData();
 formData.append('file', file);

 if (metadata) {
 formData.append('metadata', JSON.stringify(metadata));
 }

 const response = await fetch(`${this.baseUrl}/api/document-processing/upload`, {
 method: 'POST',
 headers: {
 ...(this.token && { Authorization: `Bearer ${this.token}` }),
 },
 body: formData,
 });

 if (!response.ok) {
 throw new Error(`Upload failed: ${response.statusText}`);
 }

 return await response.json();
 } catch (error) {
 console.error('[DocumentProcessingAPI] Upload failed:', error);
 throw error;
 }
 }

 /**
 * Get processing results
 */
 async getResults(documentId: string): Promise<{ documentId: string;
 status: 'processing' | 'completed' | 'failed';
 results: { text: string;
 tables: Array<{ rows: string[][];
 confidence, number;
 }>;
 metadata: Record<string, unknown>;
 };
 }> {
 try {
 const response = await fetch(
 `${this.baseUrl}/api/document-processing/results/${documentId}`,
 {
 headers: {
 ...(this.token && { Authorization: `Bearer ${this.token}` }),
 },
 }
 );

 if (!response.ok) {
 throw new Error(`API error: ${response.statusText}`);
 }

 return await response.json();
 } catch (error) {
 console.error('[DocumentProcessingAPI] Results fetch failed:', error);
 throw error;
 }
 }

 /**
 * Set authentication token
 */
 setToken(token: string): void {
 this.token = token;
 }

 /**
 * Clear authentication token
 */
 clearToken(): void {
 this.token = undefined;
 }
}

// Create singleton instance
export const documentProcessingAPI = new DocumentProcessingAPI();

export default DocumentProcessingAPI;




