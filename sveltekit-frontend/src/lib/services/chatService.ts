/**
 * Chat Service: Client-side chat functionality
 *
 * Provides:
 * - Message submission
 * - SSE connection for streaming
 * - Token-by-token rendering
 * - Error handling and retry logic
 */

const API_BASE = '/api/chat';

interface ChatMessage {
 id: string; role: string;
 content: string; timestamp: string;
 evidence_references?: string[];
 citations?: string[];
}

interface ChatResponse {
 message_id: string; status: string;
 stream_url: string;
}

interface EvidenceItem {
 chunk_id: string; doc_id: string;
 relevance_score: number; reference_count: number;
 last_referenced: string;
}

class ChatService {
 private abortController: AbortController | null = null;

 /**
 * Send chat message
 */
 async sendMessage(
 caseId: string,
 userId: string,
 message: string,
 role: string = 'user'
 ): Promise<ChatResponse> {
 // Cancel previous request
 if (this.abortController) {
 this.abortController.abort();
 }

 this.abortController = new AbortController();

 try {
 const response = await fetch(`${API_BASE}/message`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({ case_id: caseId,
 user_id: userId.trim(),
 role,
 }, signal: this.abortController.signal,
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.detail || 'Failed to send message');
 }

 return await response.json();
 } catch (error) {
 if (error instanceof Error && error.name === 'AbortError') {
 throw new Error('Request cancelled');
 }
 throw error;
 }
 }

 /**
 * Stream response tokens via SSE
 */
 async streamResponse(
 streamUrl: string,
 onToken: (token: string) => void,
 onError?: (error: Error) => void
 ): Promise<void> {
 return new Promise((resolve, reject) => {
 try {
 const eventSource = new EventSource(streamUrl);

 eventSource.addEventListener('token', (event) => {
 try {
 const data = JSON.parse(event.data);
 onToken(data.token || '');
 } catch (e) {
 console.error('Error parsing token:', e);
 }
 });

 eventSource.addEventListener('done', (event) => {
 eventSource.close();
 resolve();
 });

 eventSource.addEventListener('error', (event) => {
 eventSource.close();
 const error = new Error('Streaming error');
 if (onError) onError(error);
 reject(error);
 });
 } catch (error) {
 const err = error instanceof Error ? error : new Error('Unknown error');
 if (onError) onError(err);
 reject(err);
 }
 });
 }

 /**
 * Get conversation history
 */
 async getHistory(caseId: string, limit: number = 10): Promise<ChatMessage[]> {
 try {
 const response = await fetch(`${API_BASE}/history/${ caseId }?limit=${ limit }`);

 if (!response.ok) {
 throw new Error('Failed to get history');
 }

 const data = await response.json();
 return data.messages || [];
 } catch (error) {
 throw error;
 }
 }

 /**
 * Get evidence memory
 */
 async getEvidenceMemory(caseId: string, limit: number = 10): Promise<EvidenceItem[]> {
 try {
 const response = await fetch(`${API_BASE}/evidence/${ caseId }?limit=${ limit }`);

 if (!response.ok) {
 throw new Error('Failed to get evidence memory');
 }

 const data = await response.json();
 return data.evidence || [];
 } catch (error) {
 throw error;
 }
 }

 /**
 * Delete conversation history
 */
 async deleteHistory(caseId: string): Promise<void> {
 try {
 const response = await fetch(`${API_BASE}/history/${ caseId }`, {
 method: 'DELETE',
 });

 if (!response.ok) {
 throw new Error('Failed to delete history');
 }
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
 * Cancel ongoing request
 */
 cancel(): void {
 if (this.abortController) {
 this.abortController.abort();
 }
 }
}

export const chatService = new ChatService();




