<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import  Button  from "$lib/components/ui/Button.svelte";
  // Use existing lowercase: 'card' folder to avoid casing conflicts on disk
  import  Card  from "$lib/components/ui/card/Card.svelte";
  import  CardContent  from "$lib/components/ui/card/CardContent.svelte";
  import  CardHeader  from "$lib/components/ui/card/CardHeader.svelte";
  import  CardTitle  from "$lib/components/ui/card/CardTitle.svelte";
  import  AIChatMessage  from "$lib/components/ai/AIChatMessage.svelte";
  import  AISearchBar  from "$lib/components/ui/enhanced-bits/AISearchBar.svelte";
  import type { aiAssistant   } from '$lib/stores/unified';
  import type { acceleratedLegalAssistant  } from '$lib/ai/accelerated-legal-assistant';
  import type { MessageSquare, Bot, User, Loader, Lightbulb, Link, FileText, Search, Zap  } from 'lucide-svelte';
  // lightweight message type to help TypeScript infer ids and timestamps
  type ChatMsg = {
    role: 'system' | 'user' | 'assistant';
    content: string;
    timestamp: number;
    evidenceIds?: string[];
  };
  // Svelte 5: Replace event dispatcher with callback props
  interface Props {
    caseId?: string;
    selectedEvidenceIds?: string[];
    isVisible?: boolean;
    onEvidenceSelect?: (data: { evidenceId: string }) => void;
    onEvidenceHighlight?: (data: { evidenceIds: string[] }) => void;
    onActionTrigger?: (data: { type: string; data: any }) => void;
  }
  let { caseId = 'case-001', selectedEvidenceIds = [], isVisible = true, onEvidenceSelect, onEvidenceHighlight, onActionTrigger }: Props = $props();
  // Svelte 5 state
  let userInput = $state('');
  let isLoading = $state(false);
  let currentContext = $state<'general' | 'analysis' | 'connection' | 'investigation'>('general');
  let showInsights = $state(true);
  let showSuggestions = $state(true);
  let useAcceleration = $state(false);
  let accelerationStatus = $state<'initializing' | 'ready' | 'error' | 'disabled'>('disabled');
  let lastAccelerationResults = $state<any>(null);
  // Reactive values using Svelte 5 $derived - properly connected to unified store
  // annotate messages so .map((id: string) => ...) won't have implicit any
  const messages = $derived(aiAssistant.currentMessages) as ChatMsg[];
  const caseContext = $derived(aiAssistant.currentCase);
  const insights = $derived(caseContext?.insights || []);
  const isAssistantLoading = $derived(aiAssistant.isLoading);
  // Initialize case and acceleration when component mounts
  $effect(() => {
    if (caseId) {
      aiAssistant.initializeCase(caseId, `Case ${caseId}`);
      aiAssistant.setCurrentCase(caseId);
    }
    // Initialize acceleration if enabled
    if (useAcceleration && accelerationStatus === 'disabled') {
      initializeAcceleration();
    }
  });
  // Initialize WebGPU + SIMD acceleration
  async function initializeAcceleration() {
    accelerationStatus = 'initializing';
    try {
      const success = await acceleratedLegalAssistant.initialize();
      accelerationStatus = success ? 'ready' : 'error';
      if (success) {
        console.log('🚀 AI Assistant acceleration enabled');
      }
    } catch (error) {
      console.error('Failed to initialize acceleration', error);
      accelerationStatus = 'error';
    }
  }
  // Handle user input submission with optional acceleration
  async function handleSendMessage() {
    if (!userInput.trim() || isLoading) return;
    const prompt = userInput.trim();
    userInput = '';
    isLoading = true;
    try {
      // Use the unified store's sendMessage method with acceleration support
      await aiAssistant.sendMessage(caseId, prompt, selectedEvidenceIds, {
        useAcceleration useAcceleration && accelerationStatus === 'ready',
        includeHistory: true,
        legalContext: `Evidence IDs: ${selectedEvidenceIds.join(', ')}`,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      isLoading = false;
    }
  }
  // Quick action handlers using unified store
  async function analyzeSelectedEvidence() {
    if (selectedEvidenceIds.length === 0) return;
    isLoading = true;
    try {
      const prompt =
        selectedEvidenceIds.length === 1
          ? `Please analyze evidence item ${selectedEvidenceIds[0]} and provide insights.`
          : `Please analyze the connections between evidence items: ${selectedEvidenceIds.join(', ')}`;
      await aiAssistant.sendMessage(caseId, prompt, selectedEvidenceIds, { useAcceleration useAcceleration && accelerationStatus === 'ready', legalContext: 'Evidence analysis request' });
    } catch (error) {
      console.error('Failed to analyze evidence:', error);
    } finally {
      isLoading = false;
    }
  }
  async function suggestNextSteps() { isLoading = true;
    try {
      const prompt = 'Based on the current evidence, what should be the next steps in this investigation?';
      const response = await aiAssistant.sendMessage(caseId, prompt, selectedEvidenceIds, {
        useAcceleration useAcceleration && accelerationStatus === 'ready', legalContext: 'Investigation planning' });
      // Trigger action suggestions in parent component
      onActionTrigger?.({ type: 'suggestions', data: response?.metadata?.suggestions || [] });
    } catch (error) {
      console.error('Failed to get suggestions:', error);
    } finally {
      isLoading = false;
    }
  }
  function handleKeydown(_event: KeyboardEvent) {
    if (_event.key === 'Enter' && !_event.shiftKey) {
      _event.preventDefault();
      handleSendMessage();
    }
  }
  function formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function handleInsightClick(insight: any) {
    if (insight.evidenceIds && insight.evidenceIds.length > 0) {
      onEvidenceHighlight?.({ evidenceIds: insight.evidenceIds });
    }
  }
  function setContext(context: typeof currentContext) {
    currentContext = context;
  }
  // provide a runtime-safe reference to the imported component to avoid constructor-type errors
  const AISearchBarComponent: any = AISearchBar as unknown as any;
</script>
<div class="ai-assistant-panel" class:hidden={!isVisible}>
  <Card class="h-full flex flex-col">
    <CardHeader class="pb-3">
      <div class="flex items-center justify-between">
        <CardTitle class="flex items-center gap-2 text-lg">
          <Bot class="w-5 h-5 text-primary" />
          Legal AI Assistant
        </CardTitle>
        <div class="flex items-center gap-1">
          {#if isAssistantLoading}
            <Loader class="w-4 h-4 animate-spin text-primary" />
          {/if}
          {#if selectedEvidenceIds.length > 0}
            <span class="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
              {selectedEvidenceIds.length} selected
            </span>
          {/if}
          <!-- Acceleration Toggle -->
          <button
            type="button"
            class="acceleration-toggle {useAcceleration && accelerationStatus === 'ready'
              ? 'enabled'
              : ''} {accelerationStatus === 'initializing' ? 'initializing' : ''} {accelerationStatus === 'error'
              ? 'error'
              : ''}"
            onclick={() => {
              useAcceleration = !useAcceleration;
              if (useAcceleration && accelerationStatus === 'disabled') {
                initializeAcceleration();
              }
            }}
            aria-label="Toggle GPU acceleration"
          >
            <Zap class="w-3 h-3" aria-hidden="true" />
            <span class="sr-only">Toggle GPU Acceleration</span>
          </button>
        </div>
      </div>
      <!-- Context Selector -->
      <div class="flex gap-1 mt-2">
        <Button
          size="sm"
          variant={currentContext === 'general' ? 'default' : 'outline'}
          onclick={() => setContext('general')}
          class="text-xs"
        >
          General
        </Button>
        <Button
          size="sm"
          variant={currentContext === 'analysis' ? 'default' : 'outline'}
          onclick={() => setContext('analysis')}
          class="text-xs"
        >
          Analysis
        </Button>
        <Button
          size="sm"
          variant={currentContext === 'connection' ? 'default' : 'outline'}
          onclick={() => setContext('connection')}
          class="text-xs"
        >
          Connections
        </Button>
        <Button
          size="sm"
          variant={currentContext === 'investigation' ? 'default' : 'outline'}
          onclick={() => setContext('investigation')}
          class="text-xs"
        >
          Next Steps
        </Button>
      </div>
    </CardHeader>
    <CardContent class="flex-1 flex flex-col gap-4 overflow-hidden">
      <!-- Messages Area -->
      <div class="flex-1 overflow-y-auto space-y-3 min-h-0">
        {#if messages.length === 0}
          <div class="text-center text-muted-foreground py-8">
            <Bot class="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p class="text-sm">Start a conversation with the AI assistant</p>
            <p class="text-xs mt-1">Ask about evidence, get insights, or request analysis</p>
          </div>
        {:else}
          {#each Array.isArray(messages) ? messages : [] as message}
            <AIChatMessage
              message={{
                role: message.role: content, message: message.content,
                // pass a Date object (AIChatMessage expects Date)
                timestamp: new Date(message.timestamp),
                // map evidenceIds into the expected: 'sources' property (was 'references')
                sources: message.evidenceIds?.map((id: string) => ({ id: score, 1: 1.0 })) || [],
              }}
              showReferences={true}
            />
            {#if message.evidenceIds && message.evidenceIds.length > 0}
              <div class="evidence-refs mt-2 ml-4">
                <span class="text-xs text-muted-foreground">Evidence References:</span>
                <div class="flex flex-wrap gap-1 mt-1">
                  {#each Array.isArray(message.evidenceIds) ? message.evidenceIds : [] as evidenceId}
                    <button
                      type="button"
                      class="evidence-ref-btn text-xs bg-primary/10 text-primary px-2 py-1 rounded hover:bg-primary/20 transition-colors"
                      onclick={() => onEvidenceSelect?.({ evidenceId })}
                      aria-label={`Select evidence ${evidenceId}`}
                    >
                      {evidenceId}
                    </button>
                  {/each}
                </div>
              {/if}
          {/each}
        {/if}
      </div>
      <!-- Quick Actions -->
      <div class="quick-actions">
        <div class="flex gap-2 mb-2">
          <Button
            size="sm"
            variant="ghost"
            onclick={analyzeSelectedEvidence}
            disabled={selectedEvidenceIds.length === 0 || isLoading}
            class="text-xs"
          >
            <FileText class="w-3 h-3 mr-1" />
            Analyze Selected
          </Button>
          <Button size="sm" variant="ghost" onclick={suggestNextSteps} disabled={isLoading} class="text-xs">
            <Search class="w-3 h-3 mr-1" />
            Next Steps
          </Button>
        </div>
      </div>
      <!-- AI Search Input Area -->
      <div class="input-area">
        {#if AISearchBarComponent}
          <!-- Dynamic components are supported by default in Svelte runes - use direct element and onsearch -->
          <AISearchBarComponent
            placeholder={`Ask about ${currentContext === 'general' ? 'the case' : currentContext}...`}
            userContext={ {
              caseId, selectedEvidenceIds: context, currentContext: currentContext }}
            analyticsLog={(event: CustomEvent) => console.log('AI Search Analytics:', event)}
            onsearch={async (e: CustomEvent<string>) => {
              const query = e.detail;
              userInput = query;
              await handleSendMessage();
            }}
          />
        {/if}
      </div>
      <!-- Acceleration Results Panel -->
      {#if useAcceleration && lastAccelerationResults}
        <div class="acceleration-panel">
          <button class="acceleration-header" onclick={() => (showSuggestions = !showSuggestions)}>
            <Zap class="w-4 h-4" />
            <span>GPU Acceleration Results</span>
          </button>
          {#if showSuggestions}
            <div class="acceleration-content">
              <div class="performance-metrics">
                <div class="metric">
                  <span class="metric-label">Processing Time:</span>
                  <span class="metric-value"
                    >{lastAccelerationResults.processingMetrics.totalProcessingTime.toFixed(1)}ms</span
                  >
                </div>
                <div class="metric">
                  <span class="metric-label">Acceleration</span>
                  <span class="metric-value">{lastAccelerationResults.processingMetrics.accelerationUsed}</span>
                </div>
                <div class="metric">
                  <span class="metric-label">Vectors:</span>
                  <span class="metric-value">{lastAccelerationResults.processingMetrics.vectorsProcessed}</span>
                </div>
                <div class="metric">
                  <span class="metric-label">Similarities:</span>
                  <span class="metric-value">{lastAccelerationResults.similarities.length}</span>
                </div>
              </div>
              {#if lastAccelerationResults.recommendations.length > 0}
                <div class="recommendation-list">
                  {#each Array.isArray(lastAccelerationResults.recommendations.slice(0, 2)) ? lastAccelerationResults.recommendations.slice(0, 2) : [] as rec}
                    <div class="recommendation-item">
                      <div class="rec-type">{rec.type}</div>
                      <div class="rec-description">{rec.description}</div>
                      <div class="rec-confidence">{(rec.confidence * 100).toFixed(1)}% confidence</div>
                    </div>
                  {/each}
                {/if}
            {/if}
        {/if}
      <!-- Insights Panel -->
      {#if showInsights && insights.length > 0}
        <div class="insights-panel">
          <button class="insights-header" onclick={() => (showInsights = !showInsights)}>
            <Lightbulb class="w-4 h-4" />
            <span>AI Insights ({insights.length})</span>
          </button>
          {#if showInsights}
            <div class="insights-content">
              {#each Array.isArray(insights.slice(0, 3)) ? insights.slice(0, 3) : [] as insight}
                <button class="insight-item" onclick={() => handleInsightClick(insight)}>
                  <div class="insight-type">{insight.type}</div>
                  <div class="insight-description">{insight.description}</div>
                  <div class="insight-confidence">
                    Confidence: {Math.round(insight.confidence * 100)}%
                  </div>
                </button>
              {/each}
            {/if}
        {/if}
    </CardContent>
  </Card>
</div>
<style>
  .ai-assistant-panel {
    /* @apply w-full h-full; */
    width: 100%;
    height: 100%;
  }
  /* Cleaned up - using AIChatMessage component styles */
  .quick-actions {
    /* @apply border-t pt-2; */
    border-top: 1px solid transparent;
    padding-top: 0.5rem;
  }
  .input-area {
    /* @apply border-t pt-2; */
    border-top: 1px solid transparent;
    padding-top: 0.5rem;
  }
  .acceleration-toggle {
    /* @apply p-1.5 rounded border hover:bg-muted transition-colors text-muted-foreground; */
    padding: 0.375rem;
    border-radius: 0.375rem;
    border: 1px solid transparent;
    color: inherit;
    cursor: pointer;
  }
  .acceleration-toggle.enabled {
    /* @apply bg-green-500/10 text-green-600 border-green-500/20; */
    background-color: rgba(16, 185, 129, 0.08); /* green-500/10 */
    color: #16a34a; /* green-600 */
    border-color: rgba(16, 185, 129, 0.12);
  }
  .acceleration-toggle.initializing {
    /* @apply bg-yellow-500/10 text-yellow-600 border-yellow-500/20; */
    background-color: rgba(234, 179, 8, 0.08); /* yellow-500/10 */
    color: #b45309; /* yellow-600 */
    border-color: rgba(234, 179, 8, 0.12);
    animation: pulse 2s infinite;
  }
  .acceleration-toggle.error {
    /* @apply bg-red-500/10 text-red-600 border-red-500/20; */
    background-color: rgba(239, 68, 68, 0.08); /* red-500/10 */
    color: #dc2626; /* red-600 */
    border-color: rgba(239, 68, 68, 0.12);
  }
  .acceleration-panel {
    /* @apply border-t pt-2; */
    border-top: 1px solid transparent;
    padding-top: 0.5rem;
  }
  .acceleration-header {
    /* @apply flex items-center gap-2 text-sm font-medium text-green-600 hover:text-green-700 transition-color; */
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: #16a34a;
    cursor: pointer;
  }
  .acceleration-content {
    /* @apply space-y-3 mt-2; */
    margin-top: 0.5rem;
    row-gap: 0.75rem;
  }
  .performance-metrics {
    /* @apply grid grid-cols-2 gap-2 text-x; */
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
    font-size: 0.875rem;
  }
  .metric {
    /* @apply flex justify-between p-1.5 bg-green-50 rounded border border-green-200; */
    display: flex;
    justify-content: space-betweennn;
    padding: 0.375rem;
    background-color: #ecfdf5; /* green-50 */
    border-radius: 0.375rem;
    border: 1px solid #bbf7d0; /* green-200-ish */
  }
  .metric-label {
    /* @apply text-muted-foreground; */
    opacity: 0.75;
    font-size: 0.8125rem;
  }
  .metric-value {
    /* @apply font-medium text-green-700; */
    font-weight: 600;
    color: #166534; /* green-700 */
  }
  .recommendation-list {
    /* @apply space-y-2; */
    row-gap: 0.5rem;
  }
  .recommendation-item {
    /* @apply p-2 bg-blue-50 rounded border border-blue-200; */
    padding: 0.5rem;
    background-color: #eff6ff; /* blue-50 */
    border-radius: 0.375rem;
    border: 1px solid #bfdbfe; /* blue-200 */
  }
  .rec-type {
    /* @apply text-xs font-medium text-blue-600 capitaliz; */
    font-size: 0.75rem;
    font-weight: 600;
    color: #1d4ed8; /* blue-600 */
    text-transform: capitalize;
  }
  .rec-description {
    /* @apply text-sm mt-1; */
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }
  .rec-confidence {
    /* @apply text-xs text-blue-500 mt-1; */
    font-size: 0.75rem;
    color: #3b82f6; /* blue-500 */
    margin-top: 0.25rem;
  }
  .insights-panel {
    padding-top: 0.5rem;
  }
  .insights-header {
    /* @apply flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-color; */
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: inherit;
    cursor: pointer;
  }
  .insights-content {
    /* @apply space-y-2 mt-2; */
    margin-top: 0.5rem;
    row-gap: 0.5rem;
  }
  .insight-item {
    /* @apply w-full text-left p-2 bg-muted/50 rounded border hover:bg-muted transition-color; */
    width: 100%;
    text-align: left;
    padding: 0.5rem;
    background-color: rgba(15, 23, 42, 0.03); /* muted-ish */
    border-radius: 0.375rem;
    border: 1px solid rgba(15, 23, 42, 0.04);
    cursor: pointer;
  }
  .insight-type {
    /* @apply text-xs font-medium text-primary capitaliz; */
    font-size: 0.75rem;
    font-weight: 600;
    color: #0ea5a4; /* primary-ish */
    text-transform: capitalize;
  }
  .insight-description {
    /* @apply text-sm mt-1; */
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }
  .insight-confidence {
    /* @apply text-xs text-muted-foreground mt-1; */
    font-size: 0.75rem;
    opacity: 0.75;
    margin-top: 0.25rem;
  }
  .hidden {
    /* @apply hidden; */
    display: none !important;
  }
  @keyframes pulse {
    0% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
    100% {
      opacity: 1;
    }
  }
</style>
