<script lang="ts">
 import { onDestroy, onMount } from 'svelte';;

 interface PhoenixEvent {
 type: string;
 evidenceId?: string;
 fileName?: string;
 caseId?: string; message: string;
 timestamp?: string;
 [key: string]: any;
 }

 let { show = true } = $props<{
 show?: boolean;
 }>();

 let events: PhoenixEvent[] = $state([]);
 let eventSource: EventSource | null = null;
 let isConnected = $state(false);

 onMount(() => {
 if (show) {
 connectToEvents();
 }
 });

 onDestroy(() => {
 disconnectFromEvents();
 });

 function connectToEvents() {
 try {
 eventSource = new EventSource('/agentic/events');

 eventSource.onopen = () => {
 isConnected = true;
 addEvent({
 type: 'connection',
 message: 'Connected to Phoenix AI event stream',
 timestamp: new Date().toISOString()
 });
 };

 eventSource.onmessage = (event) => {
 try {
 const data: PhoenixEvent = JSON.parse(event.data);
 addEvent(data);
 } catch (err) {
 console.error('Failed to parse event:', err);
 }
 };

 eventSource.onerror = (error) => {
 console.error('EventSource error:', error);
 isConnected = false;
 addEvent({
 type: 'error',
 message: 'Lost connection to Phoenix AI events',
 timestamp: new Date().toISOString()
 });
 };
 } catch (err) {
 console.error('Failed to connect to events:', err);
 }
 }

 function disconnectFromEvents() {
 if (eventSource) {
 eventSource.close();
 eventSource = null;
 isConnected = false;
 }
 }

 function addEvent(event: PhoenixEvent) {
 events = [event, ...events].slice(0, 50); // Keep last 50 events
 }

 function clearEvents() {
 events = [];
 }

 function getEventIcon(type: string): string {
 switch (type) {
 case 'evidence_uploaded': return '📄';
 case 'ocr_complete': return '👁️';
 case 'embedding_complete': return '🧠';
 case 'graph_update': return '🕸️';
 case 'ai_summary_ready': return '🤖';
 case 'case_recommendations_ready': return '🔍';
 case 'contradiction_detected': return '⚠️';
 case 'connection': return '🔗';
 case 'error': return '❌';
 default: return '📢';
 }
 }

 function getEventColor(type: string): string {
 switch (type) {
 case 'evidence_uploaded': return 'text-blue-400';
 case 'ocr_complete': return 'text-green-400';
 case 'embedding_complete': return 'text-purple-400';
 case 'graph_update': return 'text-cyan-400';
 case 'ai_summary_ready': return 'text-yellow-400';
 case 'case_recommendations_ready': return 'text-orange-400';
 case 'contradiction_detected': return 'text-red-400';
 case 'connection': return 'text-green-400';
 case 'error': return 'text-red-400';
 default: return 'text-slate-400';
 }
 }
</script>

{#if show}
 <div class="fixed bottom-4 right-4 w-96 max-h-96 bg-slate-900/95 border border-slate-700 rounded-lg shadow-2xl z-50 overflow-hidden">
 <!-- Header -->
 <div class="bg-gradient-to-r from-cyan-600 to-purple-600 p-3 flex items-center justify-between">
 <div class="flex items-center gap-2">
 <div class="w-2 h-2 rounded-full {isConnected ? 'bg-green-400' : 'bg-red-400'} animate-pulse"></div>
 <h3 class="text-white font-bold text-sm">Phoenix AI Monitor</h3>
 </div>
 <div class="flex gap-1">
 <button
 onclick={clearEvents}
 class="text-white/70 hover:text-white text-xs px-2 py-1 rounded"
 title="Clear events"
 >
 🗑️
 </button>
 <button
 onclick={() => show = false}
 class="text-white/70 hover:text-white text-xs px-2 py-1 rounded"
 title="Hide monitor"
 >
 ✕
 </button>
 </div>
 </div>

 <!-- Events List -->
 <div class="max-h-80 overflow-y-auto p-2 space-y-2">
 {#each events as event (event.timestamp || Math.random())}
 <div class="bg-slate-800/50 rounded p-2 border-l-2 {getEventColor(event.type).replace('text-', 'border-')}">
 <div class="flex items-start gap-2">
 <span class="text-lg" title={event.type}>{getEventIcon(event.type)}</span>
 <div class="flex-1 min-w-0">
 <div class="text-xs text-slate-300 font-medium truncate">
 {event.fileName || event.evidenceId || event.type}
 </div>
 <div class="text-xs text-slate-400 mt-1">
 {event.message}
 </div>
 {#if event.caseId}
 <div class="text-xs text-slate-500 mt-1">
 Case: {event.caseId}
 </div>
 {/if}
 </div>
 </div>
 {#if event.timestamp}
 <div class="text-xs text-slate-500 mt-1">
 {new Date(event.timestamp).toLocaleTimeString()}
 </div>
 {/if}
 </div>
 {/each}

 {#if events.length === 0}
 <div class="text-center text-slate-500 py-8">
 <div class="text-2xl mb-2">🔍</div>
 <div class="text-sm">Waiting for Phoenix AI events...</div>
 </div>
 {/if}
 </div>
 </div>
{/if}

<style>
 .animate-pulse {
 animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
 }

 @keyframes pulse {
 0%, 100% {
 opacity: 1;
 }
 50% {
 opacity: .5;
 }
 }
</style>


