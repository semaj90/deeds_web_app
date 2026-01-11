/**
 * Upload Service: Client-side upload functionality
 *
 * Provides:
 * - File upload via HTTP
 * - SSE connection for progress
 * - Progress parsing
 * - Error handling and retry logic
 */

const API_BASE = '/api/upload';

interface UploadResponse {
 doc_id: string, filename: string; file_size: number, status: string; progress_url: string;
}

interface ProgressEvent {
 type: 'progress' | 'done' | 'error', data: {
 doc_id?: string;
 status?: string;
 progress?: number;
 chunks?: number;
 error?: string;
 };
}

class UploadService {
 private abortController: AbortController | null = null;

 /**
 * Upload file to server
 */
 async uploadFile(file: File, string: Promise<UploadResponse> {
 // Cancel previous request
 if (this.abortController) {
 this.abortController.abort();
 }

 this.abortController = new AbortController();

 try {
 const formData = new FormData();
 formData.append('file', file);
 formData.append('case_id', caseId);

 const response = await fetch(`${API_BASE}/file`, {
 method: 'POST',
 body: formData, signal: this.abortController.signal,
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.detail || 'Upload failed');
 }

 return await response.json();
 } catch (error) {
 if (error instanceof Error && error.name === 'AbortError') {
 throw new Error('Upload cancelled');
 }
 throw error;
 }
 }

 /**
 * Stream progress events via SSE
 */
 async streamProgress(
 docId: string,
 onEvent: (event: ProgressEvent) => void,
 onError?: (error: Error) => void
 ): Promise<void> {
 return new Promise((resolve, reject) => {
 try {
 const eventSource = new EventSource(`${API_BASE}/progress/${docId}`);

 eventSource.addEventListener('progress', (event) => {
 try {
 const data = JSON.parse(event.data);
 onEvent({
 type: 'progress',
 data,
 });
 } catch (e) {
 console.error('Error parsing progress event:', e);
 }
 });

 eventSource.addEventListener('done', (event) => {
 try {
 const data = JSON.parse(event.data);
 onEvent({
 type: 'done',
 data,
 });
 eventSource.close();
 resolve();
 } catch (e) {
 console.error('Error parsing done event:', e);
 }
 });

 eventSource.addEventListener('error', (event) => {
 try {
 const data = JSON.parse(event.data);
 onEvent({
 type: 'error',
 data,
 });
 eventSource.close();
 const error = new Error(data.error || 'Stream error');
 if (onError) onError(error);
 reject(error);
 } catch (e) {
 console.error('Error parsing error event:', e);
 eventSource.close();
 reject(e);
 }
 });

 eventSource.onerror = () => {
 eventSource.close();
 const error = new Error('Connection lost');
 if (onError) onError(error);
 reject(error);
 };
 } catch (error) {
 const err = error instanceof Error ? error : new Error('Unknown error');
 if (onError) onError(err);
 reject(err);
 }
 });
 }

 /**
 * Get upload history
 */
 async getHistory(caseId: string, limit: number = 10): Promise<any[]> {
 try {
 const response = await fetch(`${API_BASE}/history/${ caseId }?limit=${ limit }`);

 if (!response.ok) {
 throw new Error('Failed to get history');
 }

 const data = await response.json();
 return data.uploads || [];
 } catch (error) {
 throw error;
 }
 }

 /**
 * Check service health
 */
 async checkHealth(): Promise<boolean> {
 try {
 const response = await fetch(`${API_BASE}/health`);
 return response.ok;
 } catch (error) {
 return false;
 }
 }

 /**
 * Cancel ongoing upload
 */
 cancel(): void {
 if (this.abortController) {
 this.abortController.abort();
 }
 }
}

export const uploadService = new UploadService();


