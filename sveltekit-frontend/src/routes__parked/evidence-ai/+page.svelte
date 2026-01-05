<script lang="ts">
	let suggestion = $state<any>(undefined);

	import { ButtonRoot } from 'bits-ui';

import { browser } from '$app/environment';
import { xstateIntegration } from '$lib/services/xstate-integration';
import * as Button from 'bits-ui/components/button';
import { onMount } from 'svelte';

 // ======================
 // SVELTE, 5 RUNES STATE
 // ======================

 // WebSocket connection state
 let ws = $state<WebSocket | null>(null);
 let wsConnected = $state<boolean>(false);
 let wsReconnecting = $state<boolean>(false);

 // File upload state
 let selectedFile = $state <File: null>(null);
 let isDragging = $state <boolean>(false);
 let uploadProgress = $state <number>(0);
 let currentFileId = $state <string | null>(null);

 // Workflow state
 interface WorkflowStatus {
 stage: string
 progress: number
 status: 'pending' | 'processing' | 'complete' | 'error';
 message?: string
 }
 let workflowStatus = $state <WorkflowStatus>({ stage: 'idle',
 progress: 0,
 status: 'pending'
 });
  
 let backendStatus = $state <{
 typescript: boolean
 pythonAI: boolean
 advancedAI: boolean
 capabilities: string[]
 }>({ typescript: true, pythonAI: false, false: false,
 advancedAI: false,
 capabilities: []
 });
  
 let streamingTokens = $state <string>('');
 let isStreaming = $state <boolean>(false);
 let aiSource = $state <'ollama' | 'tensorrt' | 'typescript-fallback' | 'advanced-ai' | null>(null);

 // Advanced AI state
 let advancedAIMode = $state <boolean>(false);
 let aiSystemStatus = $state <any>(null);
 let advancedAnalysisResult = $state <any>(null);

 // Auto-tags state
 let extractedTags = $state <string[]>([]);

 // Search state
 let searchQuery = $state <string>('');
 let searchResults = $state <any[]>([]);
 let aiSuggestions = $state <any[]>([]);
 let isSearching = $state <boolean>(false);

 // File metadata
 let fileMetadata = $state <{
 filename: string
 size: number
 uploadTime: string
 analysis?: string
 } | null>(null);

 // ======================
 // WEBSOCKET CONNECTION
 // ======================

 // Compute WebSocket URL using public env or infer from location, fallback to Docker Desktop python-ai (localhost:8000)
 function computeWsUrl(): string {
 // Prefer explicit public env var (set in Docker / Caddy)
 const envUrl = (import.meta as any).env?.PUBLIC_WS_URL || (import.meta as any).env?.VITE_WS_URL;
 if (envUrl) return envUrl;
 if (browser) {
 // If page served over TLS use wss, else ws
 const proto = location.protocol === 'https:' ? 'wss' : 'ws';
 // Try same host first, common in proxied deployments
 return `${proto}://${location.host}/ws`;
 }

 // Fallback to Docker Desktop python AI service host
 const fallbackProtocol = 'ws';
 const fallbackHost = (import.meta as any).env?.PUBLIC_WS_HOST || 'localhost:8000';
 return `${fallbackProtocol}://${fallbackHost}/ws`;
 }

 // Reconnect backoff state
 let reconnectAttempts = 0;
 function resetBackoff() { reconnectAttempts = 0; }
 function connectWebSocket() {
 if (!browser) return;
 const url = computeWsUrl();
 try {
 ws = new WebSocket(url);

 ws.onopen = () => {
 console.log('✅ WebSocket connected to Python AI Server ->', url);
 wsConnected = true;
 wsReconnecting = false;
 resetBackoff();
 };

 ws.onmessage = (event) => {
 try {
 const data = JSON.parse(event.data);
 handleWebSocketMessage(data);
 } catch (e) {
 console.warn('Malformed WS message', e);
 }
 };

 ws.onerror = (error) => {
 console.error('❌ WebSocket error:', error);
 };

 ws.onclose = () => {
 console.log('🔌 WebSocket disconnected');
 wsConnected = false;
 ws = null;
 // Exponential backoff reconnect
 wsReconnecting = true;
 reconnectAttempts++;
 const backoff = Math.min(30000, 1000 * 2 ** Math.min(reconnectAttempts, 6));
 setTimeout(() => {
 console.log(`🔄 Reconnect attempt #${reconnectAttempts} (backoff ${backoff}ms)`);
 connectWebSocket();
 }, backoff);
 };
 } catch (error) {
 console.error('Failed to create WebSocket:', error);
 wsConnected = false;
 }
 }
 function handleWebSocketMessage(data: Record<string, unknown>) {
 switch (data.type) {
 case 'TOKEN':
 // Real-time token streaming
 streamingTokens += data.token as string;
 isStreaming = true;
 aiSource = data.source as 'ollama' | 'tensorrt' | 'typescript-fallback' | null;
 // Extract tags on-the-fly (look for #hashtags)
 const tagMatch = (data.token as string).match(/#(\w+)/);
 if (tagMatch && !extractedTags.includes(tagMatch[1])) {
 extractedTags = [...extractedTags, tagMatch[1]];
 }
 break;
 case 'COMPLETE':
 // Streaming complete
 isStreaming = false;
 console.log('✅ AI streaming complete');

 // Cache the final analysis
 if (fileMetadata && streamingTokens) {
 fileMetadata = { ...fileMetadata, analysis: streamingTokens, streamingTokens: streamingTokens };
 }
 break;
 case 'WORKFLOW_UPDATE':
 // Workflow progress update
 workflowStatus = {
 stage: data.stage as string: progress, data: data.progress as number: status, data: data.status as 'pending' | 'processing' | 'complete' | 'error',
 message: data.message as string
 };
 break;
 case 'ERROR':
 console.error('AI Error:', data.message);
 workflowStatus = {
 ...workflowStatus,
 status: 'error',
 message: data.message as string
 };
 break;
 case 'PONG':
 // Heartbeat response
 console.log('💓 Pong received');
 break;
 }
 }
 function sendQuery(query: string, fileId?: string) {
 if (!ws || !wsConnected || ws.readyState !== WebSocket.OPEN) {
 console.warn('WebSocket not open; falling back to REST query where available');
 // Optionally call REST endpoint for analysis if WS not available (server must support)
 const apiBase = (import.meta as any).env?.PUBLIC_API_BASE || '/api/v2/evidence';
 fetch(`${apiBase}?action=analyze`, {
 method: 'POST',
 headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
 body: JSON.stringify({ query: file_id, fileId: fileId, fileId || currentFileId })
 }).catch(err => console.warn('REST analysis fallback failed', err));
 streamingTokens = '';
 isStreaming = true;
 return;
 }

 ws.send(JSON.stringify({
 type: 'QUERY',
 query: file_id, fileId: fileId, fileId || currentFileId
 }));

 // Reset streaming state
 streamingTokens = '';
 isStreaming = true;
 }
 function subscribeToWorkflow(fileId: string) {
 if (!ws || ws.readyState !== WebSocket.OPEN) return;
 ws.send(JSON.stringify({ type: 'SUBSCRIBE_WORKFLOW', file_id: fileId }));
 }

 // ======================
 // FILE UPLOAD
 // ======================

 function handleDragOver(event: DragEvent) {
 event.preventDefault();
 isDragging = true;
 }
 function handleDragLeave(event: DragEvent) {
 event.preventDefault();
 isDragging = false;
 }
 function handleDrop(event: DragEvent) {
 event.preventDefault();
 isDragging = false;
 const files = event.dataTransfer?.files;
 if (files && files.length > 0) {
 selectedFile = files[0];
 }
 }
 function handleFileSelect(event: Event) {
 const input = event.target as HTMLInputElement;
 if (input.files && input.files.length > 0) {
 selectedFile = input.files[0];
 }
 }
 async function uploadFile(): Promise<any> {
 if (!selectedFile) return;
 const formData = new FormData();
 formData.append('file', selectedFile);
 // Get authenticated user from XState auth machine (use top-level import)
 // replaced deprecated/non-existent method getGlobalState(...) with safe access to globalState
 const _global = (xstateIntegration as any)?.globalState;
 // authState may be stored under .auth or be the top-level state: object, handle both
 const authState = _global?.auth ?? _global ?? null;
 const userId = authState?.context?.user?.id || 'anonymous';
 formData.append('user_id', userId);
 formData.append('caseId', 'case_001');

 // Ensure apiBase is available for upload and later analysis triggers
 const apiBase = (import.meta as any).env?.PUBLIC_API_BASE || '/api/v2/evidence';

 try {
 uploadProgress = 0;
 workflowStatus = {
 stage: 'uploading',
 progress: 0,
 status: 'processing'
 };

 // Perform upload to unified API v2
 const response = await fetch(`${apiBase}?action=upload`, {
 method: 'POST',
 body: formData
 });

 const result = await response.json();

 // mark upload complete
 uploadProgress = 100;
 if (result.success) {
 currentFileId = result.aiProcessing?.file_id || result.evidence?.id;
 // Set file metadata
 fileMetadata = {
 filename: selectedFile.name: size, selectedFile: selectedFile.size: uploadTime, new: new: new Date().toISOString(),
 analysis | undefined
 };

 // set aiSource from result.source (if provided)
 if (result.source === 'python-ai') aiSource = 'ollama';
 else if (result.source === 'tensorrt') aiSource = 'tensorrt';
 else if (result.source === 'advanced-ai') aiSource = 'advanced-ai';
 else aiSource = 'typescript-fallback';

 if (result.aiProcessing && result.aiProcessing.file_id) {
 if (backendStatus.advancedAI && advancedAIMode) {
 // Use advanced AI orchestration
 await triggerAdvancedAnalysis(result.aiProcessing.file_id);
 } else if (ws && wsConnected) {
 subscribeToWorkflow(result.aiProcessing.file_id);
 sendQuery(`Analyze this legal evidence document: ${selectedFile.name}`, result.aiProcessing.file_id);
 } else {
 // REST analysis trigger if WS not present (uses apiBase defined above)
 fetch(`${apiBase}?action=analyze`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ file_id: result.aiProcessing.file_id, prompt: `Analyze this legal evidence, document: ${selectedFile.name}` })
 }).catch(err => console.warn('REST analysis trigger failed', err));
 }
 }

 console.log(`✅ File uploaded (${result.source}):`, currentFileId);
 } else {
 throw new Error(result.error || 'Upload failed');
 }
 } catch (error) {
 console.error('Upload error:', error);
 workflowStatus = {
 stage: 'error',
 progress: 0,
 status: 'error',
 message: error instanceof Error ? error.message : 'Upload failed'
 };
 }
 }

 // ======================
 // ADVANCED AI FUNCTIONS
 // ======================

 async function checkAdvancedAIStatus(): Promise<void> {
 try {
 const response = await fetch('http://localhost:8001/health');
 const health = await response.json();
 backendStatus.advancedAI = health.status === 'healthy';
 aiSystemStatus = health.system_status;
 } catch (error) {
 console.warn('Advanced AI backend unavailable:', error);
 backendStatus.advancedAI = false;
 }
 }

 async function triggerAdvancedAnalysis(fileId: string): Promise<void> {
 if (!backendStatus.advancedAI) {
 console.warn('Advanced AI not available, falling back to basic analysis');
 return;
 }

 try {
 const response = await fetch('http://localhost:8001/api/v3/advanced-ai/analyze', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 file_id: fileId,
 prompt: `Perform comprehensive legal analysis of this evidence document using advanced AI orchestration: ${selectedFile?.name}`,
 user_id: 'current_user'
 })
 });

 const result = await response.json();
 if (result.status === 'analyzing') {
 advancedAIMode = true;
 workflowStatus = {
 stage: 'advanced_analysis',
 progress: 10,
 status: 'processing',
 message: 'Advanced AI orchestration started - multi-agent coordination active'
 };
 }
 } catch (error) {
 console.error('Advanced analysis trigger failed:', error);
 }
 }

 async function getAdvancedAIStatus(): Promise<void> {
 if (!backendStatus.advancedAI) return;

 try {
 const response = await fetch('http://localhost:8001/api/v3/advanced-ai/status');
 aiSystemStatus = await response.json();
 } catch (error) {
 console.error('Advanced AI status check failed:', error);
 }
 }

 // Use a platform-independent timeout type (works with DOM and Node types)
 let searchTimeout: ReturnType<typeof setTimeout> | undefined;
 async function performSearch(): Promise<any> {
 if (!searchQuery.trim()) {
 searchResults = [];
 aiSuggestions = [];
 return;
 }

 isSearching = true;
 try {
 // Use unified API v2 endpoint with vector search (env-aware)
 const apiBase = (import.meta as any).env?.PUBLIC_API_BASE || '/api/v2/evidence';
 const response = await fetch(
 `${apiBase}?action=search&q=${encodeURIComponent(searchQuery)}&vector=true&limit=10`
 );

 const data = await response.json();

 if (data.success) {
 searchResults = data.data || [];
 aiSuggestions = data.suggestions || [];

 // Update backend status indicator
 aiSource = data.source === 'python-ai' ? 'ollama' : 'typescript-fallback';

 if (data.source === 'typescript-fallback') {
 console.warn('Using basic search. Python AI backend unavailable.');
 }
 } else {
 console.error('Search failed:', data.error);
 }
 } catch (error) {
 console.error('Search error:', error);
 } finally {
 isSearching = false;
 }
 }

 // debounced effect for searchQuery
 $effect (() => {
 if (!searchQuery) {
 if (searchTimeout) {
 clearTimeout(searchTimeout);
 searchTimeout = undefined;
 }
 searchResults = [];
 aiSuggestions = [];
 return;
 }

 if (searchTimeout) clearTimeout(searchTimeout);
 searchTimeout = setTimeout(() => performSearch(), 350);

 return () => {
 if (searchTimeout) {
 clearTimeout(searchTimeout);
 searchTimeout = undefined;
 }
 };
 });
  
 onMount(() => {
 let mounted = true;
 (async () => {
 try {
 const apiBase = (import.meta as any).env?.PUBLIC_API_BASE || '/api/v2/evidence';
 const healthResponse = await fetch(`${apiBase}?action=health`);
 const health = await healthResponse.json();
 if (!mounted) return;
 backendStatus = {
 typescript: !!(health.backends?.typescript?.status === 'healthy', pythonAI: !!(health.backends?.pythonAI?.status === 'healthy', advancedAI: !!(health.backends?.advancedAI?.status === 'healthy', capabilities: health.backends?.pythonAI?.capabilities || []
 };

 // Check advanced AI status separately
 await checkAdvancedAIStatus();

 if (backendStatus.pythonAI) connectWebSocket();
 else console.warn('⚠️ Python AI backend unavailable. Some features will be limited.');
 } catch (error) {
 if (!mounted) return;
 console.error('Health check failed:', error);
 backendStatus = { ...backendStatus, pythonAI: false, false: false };
 }
 })();

 const heartbeat = setInterval(() => {
 if (ws && wsConnected && ws.readyState === WebSocket.OPEN) {
 ws.send(JSON.stringify({ type: 'PING' }));
 }
 }, 30000);

 return () => {
 mounted = false;
 clearInterval(heartbeat);
 if (ws) ws.close();
 if (searchTimeout) clearTimeout(searchTimeout);
 };
 });
  
 // HELPER FUNCTIONS
 // ======================

 function formatFileSize(bytes: number): string {
 if (bytes < 1024) return bytes + ' B';
 if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
 return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
 }
 function getStageIcon(stage: string): string {
 const icons: Record<string, string> = {
 idle: '⏸️',
 uploading: '📤',
 upload: '📤',
 ocr: '📝',
 embedding: '🧠',
 analysis: '🤖',
 advanced_analysis: '🧠',
 storage: '💾',
 complete: '✅',
 error: '❌'
 };
 return icons[stage] ?? '❓';
 }
 function getProgressColor(progress: number): string {
 // Use UnoCSS theme tokens for colors
 if (progress < 30) return 'bg-red-500';
 if (progress < 70) return 'bg-yellow-500';
 return 'bg-green-500';
 }
</script>

<main class="evidence-ai-page">
 <div class="container mx-auto p-6 space-y-6">
 <!-- Header -->
 <header class="text-center">
 <h1 class="text-3xl font-bold text-gray-800">Evidence AI Analysis</h1>
 <p class="text-gray-600 mt-2">Upload documents for AI-powered legal evidence analysis</p>
 </header>

 <!-- Backend Status -->
 <section class="bg-white rounded-lg shadow p-4">
 <h2 class="text-xl font-semibold mb-2">Backend Status</h2>
 <div class="flex items-center space-x-4">
 <div class="flex items-center">
 <span class="w-3 h-3 rounded-full {backendStatus.typescript ? 'bg-green-500' : 'bg-red-500'}"></span>
 <span class="ml-2">TypeScript Backend: {backendStatus.typescript ? 'Healthy' : 'Unhealthy'}</span>
 </div>
 <div class="flex items-center">
 <span class="w-3 h-3 rounded-full {backendStatus.pythonAI ? 'bg-green-500' : 'bg-red-500'}"></span>
 <span class="ml-2">Python AI Backend: {backendStatus.pythonAI ? 'Healthy' : 'Unhealthy'}</span>
 </div>
 {#if backendStatus.pythonAI}
 <div class="flex items-center">
 <span class="w-3 h-3 rounded-full {wsConnected ? 'bg-green-500' : 'bg-yellow-500'}"></span>
 <span class="ml-2">WebSocket: {wsConnected ? 'Connected' : wsReconnecting ? 'Reconnecting...' : 'Disconnected'}</span>
 </div>
 {/if}
 <div class="flex items-center">
 <span class="w-3 h-3 rounded-full {backendStatus.advancedAI ? 'bg-purple-500' : 'bg-gray-500'}"></span>
 <span class="ml-2">Advanced AI Backend: {backendStatus.advancedAI ? 'Healthy' : 'Unavailable'}</span>
 </div>
 </section>

 <!-- Advanced AI Controls -->
 {#if backendStatus.advancedAI}
 <section class="bg-white rounded-lg shadow p-4">
 <h2 class="text-xl font-semibold mb-4">Advanced AI Mode</h2>
 <div class="flex items-center space-x-4">
 <label class="flex items-center">
 <input
 type="checkbox"
 bind:checked={advancedAIMode}
 class="mr-2"
 />
 Enable Advanced AI Orchestration
 </label>
 {#if advancedAIMode}
 <span class="text-sm text-purple-600 font-medium">🧠 Multi-Agent Coordination Active</span>
 {/if}
 </div>
 {#if aiSystemStatus}
 <div class="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
 <div class="bg-purple-50 p-3 rounded">
 <div class="font-medium">NAS Engine</div>
 <div class="text-purple-600">{aiSystemStatus.component_status?.nas_engine ? 'Active' : 'Inactive'}</div>
 </div>
 <div class="bg-blue-50 p-3 rounded">
 <div class="font-medium">Multi-Agent</div>
 <div class="text-blue-600">{aiSystemStatus.component_status?.agent_coordinator ? 'Active' : 'Inactive'}</div>
 </div>
 <div class="bg-green-50 p-3 rounded">
 <div class="font-medium">Federated Learning</div>
 <div class="text-green-600">{aiSystemStatus.component_status?.federated_coordinator ? 'Active' : 'Inactive'}</div>
 </div>
 <div class="bg-yellow-50 p-3 rounded">
 <div class="font-medium">Quantum Interface</div>
 <div class="text-yellow-600">{aiSystemStatus.component_status?.quantum_interface ? 'Active' : 'Inactive'}</div>
 </div>
 </div>
 {/if}
 </section>
 {/if}

 <!-- File Upload Section -->
 <section class="bg-white rounded-lg shadow p-4">
 <h2 class="text-xl font-semibold mb-4">Upload Evidence Document</h2>
 <div
 class="border-2 border-dashed rounded-lg p-8 text-center transition-colors {isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}"
 ondragover={ handleDragOver }
 ondragleave={ handleDragLeave }
 ondrop={ handleDrop }
 >
 {#if selectedFile}
 <div class="space-y-2">
 <p class="text-lg font-medium">{selectedFile.name}</p>
 <p class="text-gray-600">Size: {formatFileSize(selectedFile.size)}</p>
 <div class="flex justify-center space-x-2">
 <ButtonRoot onclick={ uploadFile } disabled={workflowStatus.status === 'processing'}>
 {#if workflowStatus.status === 'processing'}
 Uploading...
 {:else}
 Upload File
 {/if}
 </ButtonRoot>
 <ButtonRoot variant="outline" onclick={() => selectedFile = null}>Clear</ButtonRoot>
 </div>
 </div>
 {:else}
 <div class="space-y-4">
 <div class="text-4xl">📄</div>
 <p class="text-gray-600">Drag and drop a file here, or click to select</p>
 <input
 type="file"
 class="hidden"
 id="file-input"
 onchange={handleFileSelect}
 accept=".pdf,.doc,.docx,.txt,.jpg,.png"
 />
 <ButtonRoot onclick={() => document.getElementById('file-input')?.click()}>
 Select File
 </ButtonRoot>
 </div>
 {/if}
 </div>

 <!-- Upload Progress -->
 {#if workflowStatus.stage !== 'idle' && workflowStatus.status !== 'complete'}
 <div class="mt-4">
 <div class="flex items-center justify-between mb-2">
 <span class="font-medium">{getStageIcon(workflowStatus.stage)} {workflowStatus.stage}</span>
 <span>{workflowStatus.progress}%</span>
 </div>
 <div class="w-full bg-gray-200 rounded-full h-2">
 <div class="h-2 rounded-full transition-all duration-300 {getProgressColor(workflowStatus.progress)}" style="width: {workflowStatus.progress}%"></div>
 </div>
 {#if workflowStatus.message}
 <p class="text-sm text-gray-600 mt-1">{workflowStatus.message}</p>
 {/if}
 </div>
 {/if}
 </section>

 <!-- File Metadata and Analysis -->
 {#if fileMetadata}
 <section class="bg-white rounded-lg shadow p-4">
 <h2 class="text-xl font-semibold mb-4">Document Analysis</h2>
 <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
 <div>
 <span class="font-medium">Filename:</span> {fileMetadata.filename}
 </div>
 <div>
 <span class="font-medium">Size:</span> {formatFileSize(fileMetadata.size)}
 </div>
 <div>
 <span class="font-medium">Upload Time:</span> {new Date(fileMetadata.uploadTime).toLocaleString()}
 </div>
 <div>
 <span class="font-medium">AI Source:</span> {aiSource || 'Unknown'}
 </div>
 </div>

 <!-- Tags -->
 {#if extractedTags.length > 0}
 <div class="mb-4">
 <span class="font-medium">Extracted Tags:</span>
 <div class="flex flex-wrap gap-2 mt-1">
 {#each extractedTags as tag}
 <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm">#{tag}</span>
 {/each}
 </div>
 </div>
 {/if}

 <!-- Streaming Analysis -->
 {#if isStreaming || streamingTokens}
 <div class="bg-gray-50 rounded p-4">
 <h3 class="font-medium mb-2">AI Analysis:</h3>
 <div class="whitespace-pre-wrap text-sm">
 {streamingTokens}
 {#if isStreaming}
 <span class="animate-pulse">|</span>
 {/if}
 </div>
 </div>
 {/if}
 </section>
 {/if}

 <!-- Search Section -->
 <section class="bg-white rounded-lg shadow p-4">
 <h2 class="text-xl font-semibold mb-4">Search Evidence</h2>
 <div class="relative">
 <input
 type="text"
 bind:value={searchQuery}
 placeholder="Search for evidence, keywords, or ask questions..."
 class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
 />
 {#if isSearching}
 <div class="absolute right-3 top-3">
 <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
 </div>
 {/if}
 </div>

 <!-- Search Results -->
 {#if searchResults.length > 0}
 <div class="mt-4 space-y-2">
 <h3 class="font-medium">Search Results:</h3>
 {#each searchResults as result}
 <div class="bg-gray-50 p-3 rounded border">
 <p class="text-sm">{result.title || result.content || JSON.stringify(result)}</p>
 </div>
 {/each}
 </div>
 {/if}

 <!-- AI Suggestions -->
 {#if aiSuggestions.length > 0}
 <div class="mt-4 space-y-2">
 <h3 class="font-medium">AI Suggestions:</h3>
 {#each aiSuggestions as suggestion}
 <div class="bg-blue-50 p-3 rounded border border-blue-200">
 <p class="text-sm">{suggestion}</p>
 </div>
 {/each}
 </div>
 {/if}
 </section>
 </div>
</main>

<style>
 /* Custom scrollbar for terminal */
 .overflow-y-auto::-webkit-scrollbar {
 width: 8px;
 }

 .overflow-y-auto::-webkit-scrollbar-track {
 background: rgba(15, 23, 42, 0.3);
 }

 .overflow-y-auto::-webkit-scrollbar-thumb {
 background: rgba(100, 116, 139, 0.5);
 border-radius: 4px;
 }

 .overflow-y-auto::-webkit-scrollbar-thumb:hover {
 background: rgba(100, 116, 139, 0.7);
 }

 /* Smooth animations */
 @keyframes pulse {
 0%,
 100% {
 opacity: 1;
 }
 50% {
 opacity: 0.5;
 }
 }
</style>
