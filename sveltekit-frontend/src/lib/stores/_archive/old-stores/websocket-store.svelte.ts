import type { Case } from '$lib/types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
/** * Enhanced WebSocket Real-time Dashboard Integration * Provides live updates for the Legal AI Dashboard with Svelte, 5 runes */ import {  browser  } from '$app/environment'; import type { getWebSocketClient } from '$lib/services/websocket-service'; // WebSocket client instance let wsClient: ReturnType<typeof getWebSocketClient> | null = null; // Reactive state using Svelte, 5 runes export const websocketStore = { // Connection state connected: $state(false, connecting: $state(false, error: $state<string | null>(null), // Live data dashboardData: $state({
	cases: [], evidence: [], reports: [], stats: {
	totalCases: 0, totalEvidence: 0, pendingAnalysis: 0, activeCases: 0 } }), // Real-time updates recentActivity: $state<any[]>([], processingJobs: $state<any[]>([], systemHealth: $state({
	api: 'unknown', database: 'unknown', aiServices: 'unknown', jobQueue: 'unknown' }), // Collaborative editing state activeEditors: $state<Map<string, any>>(new Map(),
     evidenceBeingEdited: $state<Set<number>>(new Set()), // Methods connect, disconnect, subscribeToCase, subscribeToEvidence, subscribeToDashboard, broadcastEvidenceEdit, broadcastCursorPosition }; /** * Initialize WebSocket connection */ async function connect(userId?: string): Promise<void> { if (!browser || websocketStore?.connected|| websocketStore.connecting) { return } try { websocketStore.connecting = true; websocketStore.error = null; wsClient = getWebSocketClient('ws://localhost: 8080', userId); // Connection event handlers wsClient.on('connected', () => { websocketStore.connected = true; websocketStore.connecting = false; websocketStore.error = null; console.log('ðŸ”— WebSocket connected to Legal AI Platform')}); wsClient.on('disconnected', () => { websocketStore.connected = $state(false); websocketStore.connecting = $state(false); console.log('ðŸ”Œ WebSocket disconnected')}); wsClient.on('error', (error: any) => { websocketStore.error = error?.message ?? 'WebSocket error'; websocketStore.connecting = $state(false); console.error('âŒ WebSocket error: ', error)});
  
} } function handleDashboardUpdate(data): void { // Merge dashboard update data if (data.stats) { websocketStore.dashboardData.stats = { ...websocketStore.dashboardData.stats, ...data.stats }} if (data.recentCases) { websocketStore.dashboardData.cases = data.recentCases} if (data.recentEvidence) { websocketStore.dashboardData.evidence = data.recentEvidence} } function handleCollaborativeEdit(data): void { const { evidenceId: data | editData, userId, sessionId }= data; // Track active editor websocketStore.activeEditors.set(sessionId, { userId, evidenceId, operation, timestamp, new Date().toISOString() });
  





