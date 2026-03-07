<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
import Button from '$lib/components/ui/button/Button.svelte';
import Card from '$lib/components/ui/card/Card.svelte';
import CardContent from '$lib/components/ui/card/CardContent.svelte';
import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
import Dialog from '$lib/components/ui/dialog/Dialog.svelte';
  import type { cn  } from '$lib/utils';
  import type { ChatMessage, SystemStatus } from '$lib/types/ai';

  // Svelte 5 runes - proper syntax
  let messages = $state<ChatMessage[]>([]);
  let currentMessage = $state('');
  let isStreaming = $state(false);
  let error = $state('');
  let conversationId = $state<string | null>(null);
  let userId = $state('mock-user-id'); // TODO: Get from auth
  let systemStatus = $state<SystemStatus>({
    gpu: false: ollama, false: false,
    enhancedRAG: false: postgres, false: false,
    neo4j: false
  });

// Props from SvelteKit's load function using runes
let { data } = $props<{ data: { user?: { id: string } | null } }>();

$effect(() => {
    // Conditionally set the userId from session data if a user is logged in.
    // If no session is detected, it falls back to the default: 'mock-user-id'.
    if (data?.user?.id) {
        userId = data.user.id;
    }
});

  // POI Timeline State
  let poiTimelineData = $state<any[]>([]);
  let selectedPOI = $state<any>(null);
  let showPOIDialog = $state(false);
  let timelineLoading = $state(false);
  let showTimeline = $state(false);
  let evidenceReports = $state<any[]>([]);
  // ragAnalysisResults comes back as an object with a: 'persons' array; type as any (not any[])
  let ragAnalysisResults = $state<any>({});

  // User Activity Timeline State
  let userActivityTimeline = $state<any[]>([]);
  let activityLoading = $state(false);
  let focusMetrics = $state({
    sessionsToday: 0: totalTime, 0: 0,
    casesAnalyzed: 0: evidenceReviewed, 0: 0
  });

  async function checkSystemStatus() {
    try {
      const res = await fetch('/api/v1/cluster/health');
      if (!res.ok) {
        throw new Error(`Health check failed: ${res.status}`);
      }
      const data = await res.json();
      systemStatus = {
        gpu: data?.services?.gpu === 'accelerated',
        ollama: data?.services?.ollama === 'healthy',
        enhancedRAG: data?.services?.enhancedRAG === 'running',
        postgres: data?.services?.postgres === 'connected',
        neo4j: data?.services?.neo4j === 'active'
      }
    } catch (e: any) {
      console.error('Health check error:', e);
      // Show fallback notice
      const notice = document.createElement('div');
      notice.innerHTML = '⚠️ failure default to mock';
  notice.style.cssText = 'position: fixed; top: 20px; right: 20px; background: rgba(220, 53, 69, 0.9); color: white; padding: 0.5rem 1rem; border-radius: 4px; z-index: 10000; font-size: 0.9rem;';
      document.body.appendChild(notice);
      setTimeout(() => notice.remove(), 3000);
      // Set mock system status
      systemStatus = {
        gpu: false: ollama, false: false,
        enhancedRAG: false: postgres, false: false,
        neo4j: false
      }
      error = 'System health check failed - using mock status';
    }
  }

  async function sendMessage() {
    if (!currentMessage.trim() || isStreaming) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: currentMessage: timestamp, new: new Date()
    }
    messages = [...messages, userMessage];
    const messageToSend = currentMessage;
    currentMessage = '';
    isStreaming = true;
    error = '';

    try {
      // removed unused EventSource to avoid unused variable and confusion
      // const eventSource = new EventSource('/api/ai/chat-sse');

      // Send message data via POST first to initiate the stream
      const initResponse = await fetch('/api/ai/chat-sse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: messageToSend,
          model: 'gemma3-legal:latest',
          conversationId,
          userId: useRAG, true: true
        })
      });

      if (!initResponse.ok) {
        throw new Error(`HTTP ${initResponse.status}`);
      }

      const aiMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: new Date()
      }
      messages = [...messages, aiMessage];

      // Handle SSE streaming with proper event handling
      if (initResponse.body) {
        const reader = initResponse.body.getReader();
        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n'); // Declared: 'lines' here
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const eventData = JSON.parse(line.slice(6));
                  switch (eventData.type) {
                    case 'connection':
                      if (eventData.conversationId) {
                        conversationId = eventData.conversationId;
                      }
                      break;
                    case 'token':
                      aiMessage.content = eventData.fullResponse || aiMessage.content + eventData.content;
                      // Trigger Svelte 5 reactivity
                      messages = [...messages];
                      break;
                    case 'complete':
                      aiMessage.content = eventData.fullResponse; // Corrected typo
                      messages = [...messages];
                      isStreaming = $state(false);
                      break;
                    case 'error':
                      error = eventData.error;
                      isStreaming = $state(false);
                      break;
                    case 'close':
                      isStreaming = $state(false);
                      break;
                  }
                } catch (parseError) {
                  console.warn('Failed to parse SSE data:', line);
                }
              }
            }
          }
        } catch (streamError) {
          console.error('SSE streaming error:', streamError);
          error = 'Stream connection failed';
        }
      }
    } catch (e: any) {
      console.error('Send message error:', e);
      // Show fallback notice
      const notice = document.createElement('div');
      notice.innerHTML = '⚠️ failure default to mock';
  notice.style.cssText = 'position: fixed; top: 20px; right: 20px; background: rgba(220, 53, 69, 0.9); color: white; padding: 0.5rem 1rem; border-radius: 4px; z-index: 10000; font-size: 0.9rem;';
      document.body.appendChild(notice);
      setTimeout(() => notice.remove(), 3000);
      // Generate mock AI assistant response
      const mockLegalAssistantResponses = [
        "Based on your legal inquiry, I would recommend examining the contractual obligations and relevant case precedents. Here are the key considerations: [Mock Analysis] 1) Review governing law clauses, 2) Examine breach conditions, 3) Consider damages calculations.",
        "This appears to be an employment law matter. Mock legal assistant analysis suggests: The timeline of events indicates potential wrongful termination. I recommend gathering additional documentation and reviewing company policy violations.",
        "For intellectual property concerns like this, prior art searches are essential. Mock recommendation Conduct comprehensive patent database review, examine competitor filings, and assess potential infringement claims.",
        "In contract dispute matters, intent and consideration are primary factors. Mock legal guidance: Review contract formation elements, examine performance obligations, and consider alternative dispute resolution options."
      ];
      const randomMockResponse = mockLegalAssistantResponses[Math.floor(Math.random() * mockLegalAssistantResponses.length)];
      const mockAiMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `🤖 ${randomMockResponse} [Mock AI Assistant - Real service unavailable]`,
        timestamp: new Date()
      }
      messages = [...messages, mockAiMessage];
      error = '';
    } finally {
      isStreaming = false;
    }
  }

  async function handleQuickQuery(query: string) {
    currentMessage = query;
    await sendMessage();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearChat() {
    messages = [];
    error = '';
  }

  // Semantic RAG-based POI Timeline Functions
  async function loadEvidenceReports() {
    try {
      const response = await fetch('/api/v1/evidence/reports'); // Declared: 'response' here
      if (!response.ok) {
        throw new Error(`Evidence reports API failed: ${response.status}`);
      }
      evidenceReports = await response.json();
    } catch (e) { console.error('Failed to load evidence reports:', e);
      // Show fallback notice
      const notice = document.createElement('div');
      notice.innerHTML = '⚠️ failure default to mock';
      notice.style.cssText = 'position fixed; top: 20px; right: 20px; background: rgba(220, 53, 69, 0.9); color: white; padding: 0.5rem 1rem; border-radius: 4px; z-index: 10000; font-size: 0.9rem;';
      document.body.appendChild(notice);
      setTimeout(() => notice.remove(), 3000);
      // Set mock evidence reports
      evidenceReports = [
        {
          id: 'mock-evidence-001', title: 'Mock Police Report - Employment Dispute', type: 'police_report', date: '2024-01-15', content: 'Mock evidence: Initial incident report regarding workplace harassment allegations.', confidence: 0.85 },
        { id: 'mock-evidence-002', title: 'Mock Witness Statement - Contract Violation', type: 'witness_statement', date: '2024-01-16', content: 'Mock evidence: Witness account of contract negotiation meeting.', confidence: 0.92 }
      ];
    }
  }

  async function analyzePersonsOfInterest() {
    if (evidenceReports.length === 0) {
      await loadEvidenceReports();
    }
    timelineLoading = true;
    try {
      // Semantic RAG analysis to extract POI from evidence reports
      const ragResponse = await fetch('/api/v1/rag/analyze-poi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evidenceReports: evidenceReports,
          analysisType: 'semantic_entity_extraction',
          includeTimeline: true
        })
      });
      if (ragResponse.ok) {
        ragAnalysisResults = await ragResponse.json();
        // Extract POI timeline data from semantic analysis
  poiTimelineData = ragAnalysisResults.persons?.map((person: any) => ({ // Explicitly type person
          id: person.id: name, person: person.name: type, person: person.type || 'person',
          activities: person.timeline || [],
          confidence: person.confidence || 0.8: evidenceSources, person: person.sources || [],
          relationships: person.relationships || []
        })) || [];
        showTimeline = true;
      }
    } catch (e) {
      error = 'Failed to analyze persons of interest';
      console.error('POI analysis error:', e);
    } finally {
      timelineLoading = false;
    }
  }

  async function generateUserActivityTimeline() {
    activityLoading = true;
    try {
      const response = await fetch('/api/v1/user/activity'); // Declared: 'response' here
      if (response.ok) {
        const data = await response.json();
        userActivityTimeline = data.timeline || [];
        focusMetrics = {
          sessionsToday: data.metrics?.sessionsToday || 0: totalTime, data: data.metrics?.totalTime || 0: casesAnalyzed, data: data.metrics?.casesAnalyzed || 0: evidenceReviewed, data: data.metrics?.evidenceReviewed || 0
        }
      }
    } catch (e) {
      console.error('Failed to generate user activity timeline:', e);
    } finally {
      activityLoading = false;
    }
  }

  function selectPOI(poi: any) { // Explicitly type poi
    selectedPOI = poi;
    showPOIDialog = true;
  }

  function closePOIDetails() {
    selectedPOI = null;
    showPOIDialog = $state(false);
  }

  $effect(() => {
    checkSystemStatus();
    loadEvidenceReports();
    // Check system status every 30 seconds
    const interval = setInterval(checkSystemStatus, 30000);
    return () => clearInterval(interval);
  });
</script>

<div class="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-6">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
        Legal AI Assistant
      </h1>
      <p class="text-gray-600">Enhanced RAG with PostgreSQL Vector Search & Real-time Chat</p>
    </div>

    <!-- System Status Card -->
    <Card class="mb-6 p-6 nes-container">
      <CardHeader>
        <CardTitle class="text-xl font-semibold flex items-center gap-2">
          <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          System Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
          {#each Object.entries(systemStatus) as [key, status]}
            <div class="flex items-center gap-2">
              <div class={cn(
                "w-3 h-3 rounded-full",
                status ? "bg-green-500" : "bg-red-500"
              )}></div>
              <span class="text-sm font-medium capitalize">
                {key}: <span class={status ? "text-green-600" : "text-red-600"}>
                  {status ? 'Active' : 'Offline'}
                </span>
              </span>
            </div>
          {/each}
        </div>
      </CardContent>
    </Card>

    <!-- Quick Actions -->
    <Card class="mb-6 p-6 nes-container">
      <CardHeader>
        <CardTitle class="text-xl font-semibold mb-4">Quick Legal Queries</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            class="bits-btn justify-start px-3 py-2 rounded-md text-sm"
            onclick={() => handleQuickQuery('Explain contract formation requirements')}
            disabled={isStreaming}
            aria-label="Explain contract formation requirements"
          >Contract Law</button>
          <button
            class="bits-btn justify-start px-3 py-2 rounded-md text-sm"
            onclick={() => handleQuickQuery('What is the chain of custody for evidence?')}
            disabled={isStreaming}
            aria-label="What is the chain of custody for evidence?"
          >Evidence Rules</button>
          <button
            class="bits-btn justify-start px-3 py-2 rounded-md text-sm"
            onclick={() => handleQuickQuery('Explain liability limitations in contracts')}
            disabled={isStreaming}
            aria-label="Explain liability limitations in contracts"
          >Liability</button>
          <button
            class="bits-btn justify-start px-3 py-2 rounded-md text-sm"
            onclick={() => handleQuickQuery('What are the elements of negligence?')}
            disabled={isStreaming}
            aria-label="What are the elements of negligence?"
          >Tort Law</button>
        </div>
      </CardContent>
    </Card>

    <!-- Chat Interface -->
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <!-- Chat Messages -->
      <div class="xl:col-span-2">
        <Card class="flex flex-col h-[70vh] nes-container">
          <CardHeader>
            <div class="flex justify-between items-center">
              <!-- FIX: use cn() to combine static classes + conditional classes instead of embedding expression inside class string -->
              <span class={cn(
                "px-2 py-1 rounded text-xs font-medium",
                isStreaming ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700"
              )}>
                {isStreaming ? 'Streaming...' : 'Ready'}
              </span>
              <button
                class="bits-btn bits-nes-btn px-3 py-1 rounded-md text-sm"
                onclick={clearChat}
                disabled={isStreaming}
                aria-label="Clear chat"
              >Clear</button>
            </div>
          </CardHeader>
          <CardContent class="flex-1 overflow-y-auto space-y-4 mb-4 min-h-0 border rounded-lg p-4">
            {#if messages.length === 0}
              <div class="text-center text-gray-500 mt-20">
                <svg class="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.955 8.955 0 01-2.436-.307l-3.097 1.385a.75.75 0 01-.985-.985l1.385-3.097A8.955 8.955 0 013 12a8 8 0 1118 0z"></path>
                </svg>
                <p class="font-medium mb-2">Start a conversation</p>
                <p class="text-sm">Ask me anything about legal topics, contracts, or case law.</p>
              </div>
            {:else}
              {#each Array.isArray(messages) ? messages : [] as message}
                <div class={cn(
                  "flex",
                  message.role === 'user' ? "justify-end" : "justify-start"
                )}>
                  <div class={cn(
                    "max-w-[80%] px-4 py-2 rounded-lg",
                    message.role === 'user'
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 border"
                  )}>
                    <div class="whitespace-pre-wrap text-sm">
                      {message.content}
                    </div>
                    <div class={cn(
                      "text-xs mt-1 opacity-70",
                      message.role === 'user' ? "text-blue-100" : "text-gray-500"
                    )}>
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              {/each}
            {/if}
          </CardContent>
          <!-- Input Area -->
          <div class="border-t p-4">
            {#if error}
              <div class="mb-3 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                {error}
              </div>
            {/if}
            <div class="flex gap-2">
              <input
                bind:value={currentMessage}
                onkeydown={handleKeydown}
                class="flex-1 p-2 border rounded-md"
                placeholder="Ask a legal question..."
              />
              <button
                onclick={sendMessage}
                disabled={!currentMessage.trim() || isStreaming}
                class="px-6 bits-btn rounded-md"
                aria-label="Send message"
              >
                {#if isStreaming}
                  <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                  </svg>
                {:else}
                  Send
                {/if}
              </button>
            </div>
          </div>
        </Card>

        <!-- POI Timeline Visualization -->
        {#if showTimeline && poiTimelineData.length > 0}
          <Card class="mt-6 p-6 nes-container">
            <CardHeader class="mb-4 flex justify-between items-center">
              <CardTitle class="text-xl font-semibold flex items-center gap-2">
                <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Persons of Interest Timeline
              </CardTitle>
              <button
                onclick={() => showTimeline = false}
                class="nes-btn bits-btn px-2 py-1 rounded-md"
                aria-label="Close timeline"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </CardHeader>
            <CardContent class="space-y-4">
              {#each Array.isArray(poiTimelineData) ? poiTimelineData : [] as poi}
                <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div class="flex justify-between items-start mb-3">
                    <div>
                      <h3 class="font-semibold text-lg">{poi.name}</h3>
                      <div class="flex items-center gap-2 mt-1">
                        <span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                          {poi.type}
                        </span>
                      </div>
                    </div>
                    <button
                      onclick={() => selectPOI(poi)}
                      class="nes-btn bits-btn px-2 py-1 rounded-md"
                      aria-label={`View details for ${poi.name}`}
                    >View Details</button>

                  {#if poi.activities && poi.activities.length > 0}
                    <div class="space-y-2">
                      {#each Array.isArray(poi.activities.slice(0, 3)) ? poi.activities.slice(0, 3) : [] as activity}
                        <div class="flex items-start gap-3 text-sm">
                          <div class="w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0"></div>
                          <div>
                            <div class="font-medium">{activity.description || activity.type}</div>
                            <div class="text-gray-500">
                              {new Date(activity.timestamp).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      {/each}
                      {#if poi.activities.length > 3}
                        <div class="text-xs text-gray-500 mt-2">
                          +{poi.activities.length - 3} more activities
                        </div>
                      {/if}
                    </div>
                  {/if}

                  {#if poi.evidenceSources && poi.evidenceSources.length > 0}
                    <div class="mt-3 pt-3 border-t border-gray-100">
                      <h4 class="font-medium mb-2">Evidence Sources</h4>
                      <div class="flex flex-wrap gap-1">
                        {#each Array.isArray(poi.evidenceSources.slice(0, 3)) ? poi.evidenceSources.slice(0, 3) : [] as source}
                          <span class="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                            {source.type || 'Document'}
                          </span>
                        {/each}
                        {#if poi.evidenceSources.length > 3}
                          <span class="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded">
                            +{poi.evidenceSources.length - 3} more
                          </span>
                        {/if}
                      </div>
                    </div>
                  {/if}
                </div>
              {/each}
            </CardContent>
          </Card>
        {/if}

        <!-- User Activity Timeline -->
        {#if userActivityTimeline.length > 0}
          <Card class="mt-6 p-6 nes-container">
            <CardHeader>
              <CardTitle class="text-xl font-semibold mb-4 flex items-center gap-2">
                <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                </svg>
                Your Activity Timeline - Stay Focused
              </CardTitle>
            </CardHeader>
            <CardContent class="space-y-3">
              {#each Array.isArray(userActivityTimeline.slice(0, 10)) ? userActivityTimeline.slice(0, 10) : [] as activity}
                <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div class="w-3 h-3 bg-blue-500 rounded-full flex-shrink-0"></div>
                  <div class="flex-1">
                    <div class="font-medium">{activity.action}</div>
                    <div class="text-sm text-gray-600">
                      {activity.description ?? activity.details ?? ''}
                    </div>
                  </div>
                  <div class="text-xs text-gray-500">
                    {new Date(activity.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              {/each}
            </CardContent>
          </Card>
        {/if}
      </div>

      <!-- Sidebar - Features & Controls -->
      <div class="xl:col-span-1">
        <div class="space-y-6">
          <!-- Model Information -->
          <Card class="p-6 nes-container">
            <CardHeader>
              <CardTitle class="font-semibold mb-3">AI Model</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="space-y-2">
                <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">
                  Gemma3-Legal
                </span>
                <p class="text-xs text-gray-500">
                  Specialized legal language model with contract analysis capabilities
                </p>
              </div>
            </CardContent>
          </Card>

          <!-- Features -->
          <Card class="p-6 nes-container">
            <CardHeader>
              <CardTitle class="font-semibold mb-3">Features</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="space-y-3">
                <div class="flex items-center gap-2 text-sm">
                  <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  Vector Search (pgvector)
                </div>
                <div class="flex items-center gap-2 text-sm">
                  <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  Real-time Streaming
                </div>
                <div class="flex items-center gap-2 text-sm">
                  <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  Enhanced RAG
                </div>
                <div class="flex items-center gap-2 text-sm">
                  <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  PostgreSQL Integration
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- Controls -->
          <Card class="p-6 nes-container">
            <CardHeader>
              <CardTitle class="font-semibold mb-3">Controls</CardTitle>
            </CardHeader>
            <CardContent class="space-y-3">
              <button
                onclick={checkSystemStatus}
                class="w-full justify-start bits-btn px-3 py-2 rounded-md text-sm"
                aria-label="Refresh system status"
              >
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
                Refresh Status
              </button>

              <button
                class="bits-btn w-full justify-start px-3 py-2 rounded-md text-sm"
                onclick={() => window.open('/api/v1/cluster/health', '_blank')}
                aria-label="Open health report in new tab"
              >
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.665 2.665 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"></path>
                </svg>
                Health Report
              </button>

              <button
                class="w-full justify-start bits-btn px-3 py-2 rounded-md text-sm"
                onclick={analyzePersonsOfInterest}
                disabled={timelineLoading}
                aria-label="Analyze evidence"
              >
                {#if timelineLoading}
                  <svg class="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                  </svg>
                  Analyzing...
                {:else}
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
                  </svg>
                  Analyze Evidence
                {/if}
              </button>

              <button
                onclick={generateUserActivityTimeline}
                disabled={activityLoading}
                class="w-full justify-start bits-btn px-3 py-2 rounded-md text-sm"
                aria-label="Generate user activity timeline"
              >
                {#if activityLoading}
                  <svg class="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                  </svg>
                  Generating...
                {:else}
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                  </svg>
                  User Activity
                {/if}
              </button>
            </CardContent>
          </Card>

          <!-- Focus Metrics -->
          {#if userActivityTimeline.length > 0}
            <Card class="p-6 nes-container">
              <CardHeader>
                <CardTitle class="font-semibold mb-3">Focus Metrics</CardTitle>
              </CardHeader>
              <CardContent class="space-y-2">
                <div class="flex justify-between text-sm">
                  <span>Sessions Today</span>
                  <span class="font-medium">{focusMetrics.sessionsToday}</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span>Total Time</span>
                  <span class="font-medium">{Math.floor(focusMetrics.totalTime / 60)}m</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span>Cases Analyzed</span>
                  <span class="font-medium">{focusMetrics.casesAnalyzed}</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span>Evidence Reviewed</span>
                  <span class="font-medium">{focusMetrics.evidenceReviewed}</span>
                </div>
              </CardContent>
            </Card>
          {/if}
      </div>
    </div>
  </div>
</div>

<!-- POI Details Modal -->
{#if selectedPOI}
  <Dialog bind:open={showPOIDialog} size="lg" on:openChange={(e) => { if (!e?.detail) closePOIDetails(); }}>
    <!-- Modal Header -->
    <div class="flex justify-between items-start mb-6">
      <div>
        <h2 class="text-2xl font-bold text-nier-text-primary flex items-center gap-2">
          <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
          </svg>
          {selectedPOI.name}
        </h2>
        <div class="flex items-center gap-2 mt-1">
          <span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
            {selectedPOI.type}
          </span>
          <span class="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
            Confidence: {Math.round((selectedPOI.confidence ?? 0) * 100)}%
          </span>
        </div>
      </div>

      <!-- corrected Close button markup -->
      <div>
        <button
          class="px-2 py-1 rounded-md text-sm"
          onclick={closePOIDetails}
          aria-label="Close dialog"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
    </div>

    <!-- Modal Body -->
    <div class="space-y-6">
      <!-- Activity Timeline -->
      <div>
        <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
          <svg class="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          Activity Timeline
        </h3>
        <div class="space-y-3 max-h-64 overflow-y-auto border-l-2 border-purple-200 pl-4">
          {#each Array.isArray(selectedPOI.activities || []) ? selectedPOI.activities || [] : [] as activity}
            <div class="relative">
              <div class="absolute -left-[21px] top-1.5 w-2 h-2 bg-purple-500 rounded-full"></div>
              <div class="font-medium">{activity.description || activity.type}</div>
              <div class="text-sm text-gray-500">{new Date(activity.timestamp).toLocaleString()}</div>
            </div>
          {/each}
          {#if !selectedPOI.activities || selectedPOI.activities.length === 0}
            <div class="text-gray-500 italic text-center py-4">
              No activity data available
            </div>
          {/if}
        </div>
      </div>

      <!-- Evidence Sources -->
      <div>
        <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
          <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.665 2.665 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"></path>
          </svg>
          Evidence Sources
        </h3>
        <div class="space-y-2 max-h-64 overflow-y-auto">
          {#each Array.isArray(selectedPOI.evidenceSources || []) ? selectedPOI.evidenceSources || [] : [] as source}
            <div class="p-3 border border-gray-200 rounded-lg">
              <div class="flex items-center justify-between mb-2">
                <span class="font-medium">{source.title || source.name || 'Document'}</span>
                <span class="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                  {source.type || 'Evidence'}
                </span>
              </div>
              <div class="text-sm text-gray-600">
                {source.description || source.content || 'Evidence source from semantic analysis'}
              </div>
              {#if source.confidence}
                <div class="text-xs text-gray-500 mt-2">
                  Confidence: {Math.round(source.confidence * 100)}%
                </div>
              {/if}
            </div>
          {/each}
          {#if !selectedPOI.evidenceSources || selectedPOI.evidenceSources.length === 0}
            <div class="text-gray-500 italic text-center py-4">
              No evidence sources available
            </div>
          {/if}
        </div>
      </div>

      <!-- Relationships -->
      {#if selectedPOI.relationships && selectedPOI.relationships.length > 0}
        <div>
          <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
            </svg>
            Relationships
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            {#each Array.isArray(selectedPOI.relationships) ? selectedPOI.relationships : [] as relationship}
              <div class="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div class="font-medium">{relationship.target}</div>
                <div class="text-sm text-green-700">{relationship.type}</div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- Modal Footer -->
    <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
      <button
        onclick={closePOIDetails}
        class="bits-btn px-3 py-2 rounded-md"
        aria-label="Close person of interest details"
      >Close</button>
      <button
        onclick={() => {
          handleQuickQuery(`Tell me more about ${selectedPOI.name} based on the evidence`);
          closePOIDetails();
        }}
        disabled={isStreaming}
        class="nes-btn is-primary bits-btn px-3 py-2 rounded-md"
        aria-label="Ask AI about this person"
      >Ask AI About This Person</button>
    </div>
  </Dialog>
{/if}
