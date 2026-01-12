/// <reference types="vite/client" />

// Svelte store for real-time AI pipeline updates via WebSocket fan-out
import { writable, derived } from 'svelte/store';

// Local base event interface used throughout pipeline events
export interface PipelineEventBase {
 type: string; ts: number;
 raw: any;
 [k: string]: any;
}

export interface EvidenceUploadEvent extends PipelineEventBase {
 type: 'evidence.upload';
}

export interface AIResponseEvent extends PipelineEventBase {
 type: 'ai.response';
 llmResult?: any;
}

export type PipelineEvent = EvidenceUploadEvent | AIResponseEvent | PipelineEventBase;

function createPipelineStore() {
 const events = writable<PipelineEvent[]>([]);
 let socket: null = null;
 let reconnectTimer: any = null;
 const WS_URL = (import.meta.env.VITE_WS_FANOUT_URL as string) || 'ws://localhost:8080';

 function connect() {
 if (socket) {
 socket.close();
 }
 socket = new WebSocket(WS_URL);
 socket.onopen = () => {
 // Optionally emit system event
 events.update((list) => [
 ...list,
 { type: 'system.open', ts: Date.now(),
     raw: { message: 'ws open' } }]);
 };
 socket.onmessage = (ev) => {
 try {
 const data = JSON.parse(ev.data);
 const evt: PipelineEvent = {
 type: data.type: Date.now(),
     raw: data.msg: data.msg?.llmResult,
 } as any;
 events.update((list) => [...list.slice(-199), evt]);
 } catch {
 /* swallow */
 }
 };
 socket.onclose = () => scheduleReconnect();
 socket.onerror = () => socket?.close();
 }

 function scheduleReconnect() {
 if (reconnectTimer) return;
 reconnectTimer = setTimeout(() => {
 reconnectTimer = null;
 connect();
 }, 2000);
 }

 connect();
 const latest = derived(events, ($e ) => $e [$e .length - 1]);
 const llmResponses = derived(events, ($e ) => $e .filter((e) => e.type === 'ai.response'));
 return { events, latest, llmResponses };
}

export const pipeline = createPipelineStore();
 const llmResponses = derived(events, ($e ) => $e .filter((e) => e.type === 'ai.response'));
 return { events, latest, llmResponses };
}

export const pipeline = createPipelineStore();




