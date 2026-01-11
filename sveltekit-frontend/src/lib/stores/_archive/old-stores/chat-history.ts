import { writable } from 'svelte/store';
export const chatSessions = writable<Array<unknown>>([]);
export const chatMessages = writable<Record<string, Array<unknown>>>({});
export async function loadSessions(): Promise<any> {
 const r = await fetch('/api/chat/history');
 if (!r.ok) return;
 const j = await r.json();
 chatSessions.set(j.sessions || []);
}
export async function loadMessages(sessionId): Promise<any> {
 const r = await fetch(`/api/chat/history?sessionId=${encodeURIComponent(sessionId)}`);
 if (!r.ok) return;
 const j = await r.json();
 chatMessages.update((m) => ({ ...m, [sessionId]: j.messages || [] }));
}


