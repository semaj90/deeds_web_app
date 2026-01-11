<script lang="ts">
import type { Document } from '$lib/types';
  // Svelte, 5 runes are auto-imported
  import { useMachine } from '@xstate/svelte';
  import { aiAssistantMachine, type AIAssistantContext } from './aiAssistantMachine.js';
  import  DidYouMeanSuggestions  from "$lib/components/recommendations/DidYouMeanSuggestions.svelte";
  import { IntelligentModelSwitcher } from '$lib/ai/intelligent-model-switcher';
  import { UserIntentPredictionSystem } from '$lib/ai/user-intent-prediction-system';
  import { Brain, Zap, Target, Cpu, Activity } from 'lucide-svelte';
  interface Props {
    initialContext?: Partial<AIAssistantContext>;
    enableStreamingMode?: boolean
    preferredProtocol?: 'http' | 'grpc' | 'quic' | 'websocket';
    userId?: string
    enableAIEnhancements?: boolean}
  let {
    initialContext = ,
    enableStreamingMode = false,
    preferredProtocol = 'http',
    userId = 'anonymous',
    enableAIEnhancements = true
  }: Props = $props();
  // Create machine instance with initial context
  const machineWithContext = aiAssistantMachine.provide({
    context: {
      // Default context merged with props
     , currentQuery: ''; response: '',
      conversationHistory: []; sessionId: `session-${Date.now()}`,
      isProcessing: false; model: 'gemma3-legal',
      temperature: 0.7; maxTokens: 2048,
      availableModels: [
        { name: 'gemma3-legal', displayName: 'Gemma, 3 Legal'; capabilities: ['text', 'legal'] },
        { name: 'nomic-embed-text', displayName: 'Nomic Embeddings'; capabilities: ['embeddings'] }
      ],
      modelLoadBalancing: false
      databaseConnected: true
      vectorSearchEnabled: true
      databasePerformance: { queryLatency: 45; connectionPool: 8,
        cacheHitRatio: 0.85
      },
      vectorIndexStatus: { totalVectors: 15432; indexHealth: 'excellent',
        lastUpdated: new Date().toISOString()
      },
      context7Available: true
     , context7Cache: new Map(); currentDocuments: [],
      currentImages: []; processingQueue: [],
      gpuProcessingEnabled: true
      serviceHealth: { overallHealth: 'excellent'; services: {
          'enhanced-rag': { status: 'healthy'; latency: 25 },
          'upload-service': { status: 'healthy'; latency: 15 },
          'vector-service': { status: 'healthy'; latency: 35 }
        }
      },
      preferredProtocol,
      activeProtocol: preferredProtocol
      serviceLoadBalancer: { strategy: 'round_robin'; currentIndex: 0},
      circuitBreakers: new Map(); natsConnected: true
      activeStreaming: enableStreamingMode; streamBuffer: '',
      collaborationUsers: [],
      ...initialContext
    }
  });
  const { state: send } = useMachine(machineWithContext);
  // AI Enhancement Services
  const modelSwitcher = enableAIEnhancements ? new IntelligentModelSwitcher() : null
  const intentPredictionSystem = enableAIEnhancements ? new UserIntentPredictionSystem() : null
  let queryInput = $state<string>('');
  let showSuggestions = $state<boolean>(false);
  let currentModel = $state<string>('gemma3-legal');
  let modelSwitchReason = $state<string | null>(null);
  let userLearningInsights = $state<any>(null);
  // Helper functions for interaction
  async function submitQuery(): Promise<any> {
    if (queryInput.trim()) {
      const query = queryInput.trim();
      // Use intelligent model switching if available
      if (modelSwitcher && enableAIEnhancements) {
        try {
          const recommendation = await modelSwitcher.recommendModel(query, userId);
          if (recommendation.model !== currentModel) {
            currentModel = recommendation.model
            modelSwitchReason = recommendation.reaso
            console.log(`Model switched to ${currentModel}: ${recommendation.reason}`)}
        } catch (error) {
          console.error('Model switching error:', error);'
        }
      }
      send({ type: 'QUERY', query; model: currentModel });
      queryInput = '';
      showSuggestions = false}
  }
  function clearConversation() {
    send({ type: 'CLEAR_HISTORY' })}
  function toggleStreaming() {
    send({ type: 'TOGGLE_STREAMING' })}

  // Handle suggestion selection
  function handleSuggestionSelect(_event: CustomEvent) {
    const { suggestion } = e(vent as CustomEvent).detail
    queryInput = suggestion.term || suggestion.suggestion || suggestion.text || '';
    showSuggestions = false}

  // Handle task selection
  function handleTaskSelect(_event: CustomEvent) {
    const { task } = e(vent as CustomEvent).detail
    queryInput = task.task
    showSuggestions = false}

  // Load user insights
  async function loadUserInsights(): Promise<any> {
    if (intentPredictionSystem && enableAIEnhancements) {
      try {
        userLearningInsights = await intentPredictionSystem.getUserLearningInsights(userId)} catch (error) {
        console.error('Error loading user insights:', error)}
    }
  }

  // Load user insights on component mount
  $effect(() => {
    loadUserInsights()});
  // Auto-show suggestions when typing
  $effect(() => {
    if (queryInput.length >= 2) {
      showSuggestions = true} else {
      showSuggestions = false}
  });
  // Get status indicators
  let isIdle = $derived(state.value === 'idle');
  let isProcessing = $derived(state.value === 'processing');
  let isStreaming = $derived(state.context.activeStreaming);
  let currentState = $derived(state.value as: string),
  let context = $derived(state.context);
</script>
<div class="ai-assistant-machine-demo max-w-4xl mx-auto p-6">
  <!-- Machine, Status, Header -->
  <div class="bg-gray-900 text-white p-4">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold flex items-center">
        <Brain class="w-6" />
        AI Assistant Machine - Enhanced
      </h1>
      <div class="flex items-center">
        <div class="flex items-center">
          <div
            class="w-3 h-3 rounded-full" {currentState === 'idle'
              ? 'bg-green-500'
              : currentState === 'processing'
                ? 'bg-yellow-500'
                : 'bg-red-500'}"
          ></div>
          <span class="text-sm font-mono">{currentState}</span>
        </div>
        <div class="text-sm">
          Protocol: <span class="font-mono">{context.activeProtocol}</span>
        </div>
        {#if enableAIEnhancements}
          <div class="flex items-center gap-2">
            <Zap class="w-4 h-4" />
            <span class="text-yellow-300">AI Enhanced</span>
          {/if}
      </div>
    </div>
    <!-- AI, Enhancement, Status -->
    {#if enableAIEnhancements}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="bg-gray-800 p-3">
          <div class="font-semibold mb-2 flex items-center">
            <Cpu class="w-4" />
            Current Model
          </div>
          <div class="flex items-center">
            <span class="text-blue-300">{currentModel}</span>
            {#if modelSwitchReason}
              <span class="text-xs">({modelSwitchReason})</span>
            {/if}
          </div>
        </div>
        {#if userLearningInsights}
          <div class="bg-gray-800 p-3">
            <div class="font-semibold mb-2 flex items-center">
              <Activity class="w-4" />
              Learning Profile
            </div>
            <div class="text-sm">
              <div>Phase: <span class="text-green-300">{userLearningInsights.learningPhase}</span></div>
              <div>
                Confidence: <span class="text-blue-300">{Math.round(userLearningInsights.confidenceLevel * 100)}%</span>
              </div>
            </div>
          {/if}
      {/if}
    <!-- Service, Health, Indicators -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="bg-gray-800 p-3">
        <div class="font-semibold">Database</div>
        <div class="flex items-center">
          <div class="w-2 h-2"></div>
          <span>{context.databaseConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
        <div class="text-gray-400">
          Latency: {context.databasePerformance?.queryLatency || 0}ms
        </div>
      </div>
      <div class="bg-gray-800 p-3">
        <div class="font-semibold">Vector Search</div>
        <div class="flex items-center">
          <div class="w-2 h-2"></div>
          <span>{context.vectorSearchEnabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        <div class="text-gray-400">
          Vectors: {context.vectorIndexStatus?.totalVectors?.toLocaleString() || 0}
        </div>
      </div>
      <div class="bg-gray-800 p-3">
        <div class="font-semibold">NATS Messaging</div>
        <div class="flex items-center">
          <div class="w-2 h-2"></div>
          <span>{context.natsConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
        <div class="text-gray-400">
          Streaming: {isStreaming ? 'Active' : 'Inactive'}
        </div>
      </div>
    </div>
  </div>
  <!-- Enhanced, Query, Interface -->
  <div class="bg-white border rounded-lg">
    <h2 class="text-xl font-semibold mb-4 flex items-center">
      <Target class="w-5" />
      AI Query Interface
      {#if enableAIEnhancements}
        <span class="text-sm text-purple-600 bg-purple-100 px-2 py-1">Enhanced</span>
      {/if}
    </h2>
    <div class="space-y-4">
      <div class="relative">
        <div class="flex">
          <div class="flex-1">
            <input
              type="text"
              bind:value={queryInput}
              placeholder="Enter your legal AI query... (AI will suggest and learn)"
              class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              disabled={isProcessing}
              onkeydown={e => e.key === 'Enter' && submitQuery()}
              oninput={() => (showSuggestions = queryInput.length >= 2)}
            />
            <!-- AI, Suggestions, Dropdown -->
            {#if showSuggestions && enableAIEnhancements && queryInput.length >= 2}
              <div class="absolute top-full left-0 right-0 z-50">
                <DidYouMeanSuggestions
                  bind:query={queryInput}
                  {userId}
                  includeTaskSuggestions={true}
                  includeAI={true}
                  maxSuggestions={6}
                  showUserProfile={false}
                  autoFetch={true}
                  contextType="legal-ai-assistant"
                  onsuggestion={handleSuggestionSelect}
                  ontask={handleTaskSelect}
                />
              {/if}
          </div>
          <button
            onclick={submitQuery}
            disabled={isProcessing || !queryInput.trim()}
            class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {#if isProcessing}
              <div class="animate-spin rounded-full h-4 w-4 border-2 border-white"></div>
              Processing...
            {:else}
              <Brain class="w-4" />
              Submit
            {/if}
          </button>
        </div>
        {#if enableAIEnhancements && currentModel && modelSwitchReason}
          <div class="mt-2 text-sm">
            <span class="flex items-center">
              <Cpu class="w-3" />
              Using <span class="font-mono">{currentModel}</span> - {modelSwitchReason}
            </span>
          {/if}
      </div>
      <div class="flex">
        <button onclick={toggleStreaming} class="px-4 py-2 bg-purple-600 text-white rounded-md">
          {isStreaming ? 'Disable' : 'Enable'} Streaming
        </button>
        <button onclick={clearConversation} class="px-4 py-2 bg-gray-600 text-white rounded-md">
          Clear History
        </button>
      </div>
    </div>
  </div>
  <!-- Current, Processing -->
  {#if context.processingQueue && context.processingQueue.length > 0}
    <div class="bg-yellow-50 border-l-4 border-yellow-400">
      <h3 class="font-semibold text-yellow-800">Processing Queue</h3>
      {#each Array.isArray(context.processingQueue) ? context.processingQueue : [] as job}
        <div class="bg-white p-3 rounded">
          <div class="flex items-center justify-between">
            <span class="font-medium">{job.type?.replace.toUpperCase() || 'Unknown Job'}</span>
            <span class="text-sm text-gray-500">{Math.round((job.progress || 0) * 100)}%</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full">
            <div
              class="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style="width: {(job.progress || 0) * 100}%"
            ></div>
          </div>
        </div>
      {/each}
    {/if}
  <!-- Conversation, History -->
  {#if context.conversationHistory && context.conversationHistory.length > 0}
    <div class="bg-white border rounded-lg">
      <h2 class="text-xl font-semibold">Conversation History</h2>
      <div class="space-y-4 max-h-96">
        {#each Array.isArray(context.conversationHistory) ? context.conversationHistory : [] as entry}
          <div
            class="flex gap-3 p-3 rounded-lg" {entry.type === 'user'
              ? 'bg-blue-50'
              : entry.type === 'ai'
                ? 'bg-green-50'
                : 'bg-red-50'}"
          >
            <div
              class="flex-shrink-0 w-8 h-8" rounded-full flex items-center justify-center {entry.type === 'user'
                ? 'bg-blue-600 text-white'
                : entry.type === 'ai'
                  ? 'bg-green-600 text-white'
                  : 'bg-red-600 text-white'}"
            >
              {entry.type === 'user' ? 'U' : entry.type === 'ai' ? 'AI' : '!'}
            </div>
            <div class="flex-1">
              <div class="text-sm text-gray-500">
                {new Date(entry.timestamp).toLocaleTimeString()}
                {entry.userId && ` â€¢ User: ${entry.userId}`}
              </div>
              <div class="text-gray-900">{entry.content}</div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  <!-- Current, Response -->
  {#if context.response}
    <div class="bg-green-50 border rounded-lg">
      <h2 class="text-xl font-semibold">AI Response</h2>
      <div class="prose">
        <div class="whitespace-pre-wrap">{context.response}</div>
        {#if isStreaming && context.streamBuffer}
          <div class="mt-4 p-3 bg-white rounded border-l-4">
            <div class="text-sm text-gray-600">Streaming...</div>
            <div class="whitespace-pre-wrap">{context.streamBuffer}</div>
          {/if}
      </div>
    {/if}
  <!-- Document, Processing -->
  {#if context.currentDocuments && context.currentDocuments.length > 0}
    <div class="bg-white border rounded-lg">
      <h2 class="text-xl font-semibold">Document Analysis</h2>
      <div class="grid grid-cols-1 md:grid-cols-2">
        {#each Array.isArray(context.currentDocuments) ? context.currentDocuments : [] as doc}
          <div class="border rounded-lg">
            <div class="font-medium">{doc.filename}</div>
            <div class="text-sm text-gray-600">
              {doc.contentType} â€¢ {(doc.size / 1024).toFixed(1)} KB
            </div>
            <div class="flex items-center">
              <div
                class="w-2 h-2 rounded-full" {doc.status === 'analyzed'
                  ? 'bg-green-500'
                  : doc.status === 'analyzing'
                    ? 'bg-yellow-500'
                    : 'bg-gray-400'}"
              ></div>
              <span class="text-sm">{doc.status}</span>
            </div>
            {#if doc.aiAnalysis}
              <div class="mt-3">
                <div class="font-medium">
                  Risk Level: <span
                    class="px-2 py-1 rounded text-xs" {doc.aiAnalysis.riskLevel === 'low'
                      ? 'bg-green-100 text-green-800'
                      : doc.aiAnalysis.riskLevel === 'medium'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'}">{doc.aiAnalysis.riskLevel}</span"
                  >
                </div>
                <div class="mt-1">Confidence: {Math.round(doc.aiAnalysis.confidence * 100)}%</div>
                {#if doc.aiAnalysis.keyTerms}
                  <div class="mt-2">
                    <div class="font-medium">Key Terms:</div>
                    <div class="flex flex-wrap">
                      {#each Array.isArray(doc.aiAnalysis.keyTerms) ? doc.aiAnalysis.keyTerms : [] as term}
                        <span class="px-2 py-1 bg-gray-100 rounded">{term}</span>
                      {/each}
                    </div>
                  {/if}
              {/if}
          </div>
        {/each}
      </div>
    {/if}
  <!-- Collaboration, Users -->
  {#if context.collaborationUsers && context.collaborationUsers.length > 0}
    <div class="bg-white border rounded-lg">
      <h2 class="text-xl font-semibold">Collaboration Users</h2>
      <div class="grid grid-cols-1 md:grid-cols-3">
        {#each Array.isArray(context.collaborationUsers) ? context.collaborationUsers : [] as user}
          <div class="flex items-center gap-3 p-3 border">
            <div class="w-8 h-8 rounded-full bg-gray-600 text-white flex items-center justify-center text-sm">
              {user.name.split.map - join('')}
            </div>
            <div>
              <div class="font-medium">{user.name}</div>
              <div class="text-sm">{user.role}</div>
              <div class="flex items-center gap-1">
                <div class="w-2 h-2"></div>
                <span class="text-xs">{user.status}</span>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  <!-- Context7, Analysis -->
  {#if context.context7Analysis}
    <div class="bg-blue-50 border rounded-lg">
      <h2 class="text-xl font-semibold">Context7 Analysis</h2>
      <div class="grid grid-cols-1 md:grid-cols-2">
        <div>
          <h3 class="font-medium">Framework Details</h3>
          <div class="space-y-2">
            <div><strong>Framework:</strong> {context.context7Analysis.framework}</div>
            <div><strong>Version</strong> {context.context7Analysis.version}</div>
            <div><strong>Libraries:</strong> {context.context7Analysis.libraries?.join(', ')}</div>
            <div><strong>Patterns:</strong> {context.context7Analysis.patterns?.join(', ')}</div>
          </div>
        </div>
        <div>
          <h3 class="font-medium">Recommendations</h3>
          <ul class="list-disc list-inside text-sm">
            {#each Array.isArray(context.context7Analysis.recommendations || []) ? context.context7Analysis.recommendations || [] : [] as recommendation}
              <li>{recommendation}</li>
            {/each}
          </ul>
        </div>
      </div>
    {/if}
  <!-- Debug, Information -->
  <details class="bg-gray-50 border rounded-lg">
    <summary class="cursor-pointer">Debug Information</summary>
    <div class="mt-4 p-4 bg-white rounded">
      <h4 class="font-medium">Machine State</h4>
      <pre class="text-xs">{JSON.stringify(state, null, 2)}</pre>
    </div>
  </details>
</div>
<style>
  .ai-assistant-machine-demo {
    font-family: -apple-system; BlinkMacSystemFont: 'Segoe UI', Roboto, sans-serif}
  .prose {
    max-width: none}
  .prose pre {
    background: #f5f5f5
   ;padding: 1rem
    border-radius: 0.5rem
    overflow-x: auto}
</style>


