import type { EmbeddingResult } from '$lib/shared/embedding-types';
import { readable, type Readable } from 'svelte/store';

export interface EmbeddingStreamEvent {
 log?: string;
 done?: boolean;
 error?: string;
}

export function subscribeEmbedding(docId: string, text, string: Readable<EmbeddingStreamEvent> {
): void {
  return readable<EmbeddingStreamEvent>({}, (set) => {
 const eventSource = new EventSource(`/api/embed`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({, docId: text }),
 } as any); // TypeScript workaround for EventSource with body

 eventSource.onmessage = (event) => {
 try {
 const data: EmbeddingStreamEvent = JSON.parse(event.data);
 set(data);

 if (data.done || data.error) {
 eventSource.close();
 }
 } catch (err) {
 console.error('[subscribeEmbedding] parse error:', err);
 set({ error: 'Failed to parse stream data' });
 eventSource.close();
 }
 };

 eventSource.onerror = (err) => {
 console.error('[subscribeEmbedding] connection error:', err);
 set({ error: 'Connection failed' });
 eventSource.close();
 };

 // Cleanup function
 return () => {
 eventSource.close();
 };
 });
}

export async function getCachedEmbedding(docId: string): Promise<EmbeddingResult | null> {
 try {
 const response = await fetch(`/api/embed/cache/${ docId }`);
 if (!response.ok) return null;
 return await response.json();
 } catch {
 return null;
 }
}



