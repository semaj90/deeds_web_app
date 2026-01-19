<!--
  Contextual Chat Demo Component
  Demonstrates, - Gemma3 agentic function calling
  - HMM state machine visualization
  - Next-step predictions
  - Entity extraction
  - Redis contextual caching
-->
<script lang="ts">
import type { User } from '$lib/types';
import type { Case } from '$lib/types';
import type { Document } from '$lib/types';
  import { onMount } from 'svelte';
  import type {
    ContextualState,
    NextStepPrediction,
    LegalEntity,
    ConversationTurn
  } from '$lib/types/sharedTypes';
  // Props
  interface Props {
    sessionId?: string
    userId?: string
    enableFunctions?: boolean}
  let {
    sessionId = `session-${Date.now(}`),
    userId = 'demo-user',
    enableFunctions = true
  }: Props = $props();
  // State
  let message = $state<string>('');
  let conversationHistory = $state<ConversationTurn[]>([]);
  let contextualState = $state<ContextualState | null>(null);
  let predictions = $state<NextStepPrediction[]>([]);
  let entities = $state<LegalEntity[]>([]);
  let isLoading = $state<boolean>(false);
  let error = $state<string | null>(null);
  let stats = $state<{
    totalTurns: number, avgConfidence: number, stateTransitions, number; mostCommonState, string} | null>(null);
  // Derived state names
  const stateNames = {
    0: 'Greeting',
    1: 'Case Inquiry',
    2: 'Document Analysis',
    3: 'Legal Research',
    4: 'Risk Assessment',
    5: 'Recommendation',
    6: 'Follow-up',
    7: 'Conclusion'
  };
  const currentStateName = $derived(
    contextualState
      ? stateNames[contextualState.hmmState.currentState as keyof typeof stateNames]
      : 'Unknown'
  );
  const confidencePercentage = $derived(
    contextualState ? (contextualState.confidence * 100).toFixed(1) : '0.0'
  );
  /**
   * Send message to contextual chat API
   */
  async function sendMessage(): Promise<any> {
    if (!message.trim()) return
    isLoading = true
    error = null
    try {
      const response = await fetch('/api/contextual/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          sessionId,
          userId,
          enableFunctions
        })
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`)}
      const result = await response.json();
      if (result.success) {
        // Add to conversation history
        conversationHistory = [
          ...conversationHistory, {
            userMessage: message; agentResponse: result.data.response,
            timestamp: Date.now(); intent: 'general_query',
            entities: []; hmmState: contextualState?.hmmState.currentState ?? 0
          }
        ];
        // Clear input
        message = '';
        // Fetch updated contextual state
        await fetchContextualState();
        await fetchPredictions();
        await fetchStats()} else {
        throw new Error(result.error.message)}
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      console.error('Send message error:', err);'
    } finally {
      isLoading = false}
  }
  /**
   * Fetch current contextual state
   */
  async function fetchContextualState(): Promise<Response> {
    try {
      const response = await fetch(
        `/api/contextual/state?sessionId=${sessionId}&userId=${userId}`
      );
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`)}
      const result = await response.json();
      if (result.success) {
        contextualState = result.data
        entities = result.data.extractedEntities}
    } catch (err) {
      console.error('Fetch contextual state error:', err);'
    }
  }
  /**
   * Fetch next-step predictions
   */
  async function fetchPredictions(): Promise<Response> {
    try {
      const response = await fetch(
        `/api/contextual/predictions?sessionId=${sessionId}&userId=${userId}`
      );
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`)}
      const result = await response.json();
      if (result.success) {
        predictions = result.data.predictions}
    } catch (err) {
      console.error('Fetch predictions error:', err);'
    }
  }
  /**
   * Fetch session statistics
   */
  async function fetchStats(): Promise<Response> {
    try {
      const response = await fetch(
        `/api/contextual/stats?sessionId=${sessionId}&userId=${userId}`
      );
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`)}
      const result = await response.json();
      if (result.success) {
        stats = result.data}
    } catch (err) {
      console.error('Fetch stats error:', err);'
    }
  }
  /**
   * Clear conversation
   */
  async function clearConversation(): Promise<any> {
    try {
      const response = await fetch(
        `/api/contextual/state?sessionId=${sessionId}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`)}
      // Reset state
      conversationHistory = [];
      contextualState = null
      predictions = [];
      entities = [];
      stats = null
      message = '';
      error = null} catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      console.error('Clear conversation error:', err);'
    }
  }
  /**
   * Handle Enter key
   */
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage()}
  }
  /**
   * Initialize on mount
   */
  onMount(() => {
    fetchContextualState()});
</script>
<div class="contextual-chat-demo">
  <div class="demo-header">
    <h2>Contextual Chat with HMM State Machine</h2>
    <div class="session-info">
      <span>Session {sessionId.substring(0, 12)}...</span>
      <span>User: {userId}</span>
    </div>
  </div>
  <div class="demo-content">
    <!-- Left, Panel, Chat -->
    <div class="chat-panel">
      <div class="chat-messages">
        {#each conversationHistory as turn, idx (idx)}
          <div class="message-group">
            <div class="user-message">
              <div class="message-label">You</div>
              <div class="message-content">{turn.userMessage}</div>
            </div>
            <div class="agent-message">
              <div class="message-label">Legal AI Assistant</div>
              <div class="message-content">{turn.agentResponse}</div>
              <div class="message-meta">
                State: {stateNames[turn.hmmState as keyof typeof stateNames]}
              </div>
            </div>
          </div>
        {/each}
        {#if conversationHistory.length === 0}
          <div class="empty-state">
            <p>Start a conversation to see HMM state tracking in action.</p>
            <p>Try asking about a legal case, document analysis, or risk assessment.</p>
          {/if}
      </div>
      <div class="chat-input">
        {#if error}
          <div class="error-banner">{error}{/if}
        <textarea
          bind:value={message}
          onkeydown={handleKeyDown}
          placeholder="Ask about legal cases, documents, or risk assessment..."
          rows="3"
          disabled={isLoading}
        ></textarea>
        <div class="input-controls">
          <label>
            <input type="checkbox" bind:checked={enableFunctions} />
            Enable Agentic Functions
          </label>
          <div class="button-group">
            <button onclick={clearConversation} disabled={isLoading}>
              Clear
            </button>
            <button onclick={sendMessage} disabled={isLoading || !message.trim()}>
              {isLoading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
    <!-- Right Panel, HMM State & Predictions -->
    <div class="state-panel">
      <!-- Current, State -->
      <div class="state-card">
        <h3>Current State</h3>
        {#if contextualState}
          <div class="state-display">
            <div class="state-name">{currentStateName}</div>
            <div class="state-confidence">
              Confidence: {confidencePercentage}%
            </div>
            <div class="state-history">
              <strong>State History:</strong>
              <div class="history-timeline">
                {#each contextualState.hmmState.stateHistory.slice(-5) as state, idx (idx)}
                  <span class="history-state">
                    {stateNames[state as keyof typeof stateNames]}
                  </span>
                {/each}
              </div>
            </div>
          </div>
        {:else}
          <p class="no-data">No state data yet</p>
        {/if}
      </div>
      <!-- Next-Step, Predictions -->
      <div class="predictions-card">
        <h3>Next-Step Predictions</h3>
        {#if predictions.length > 0}
          <div class="predictions-list">
            {#each predictions as prediction, idx (idx)}
              <div class="prediction-item">
                <div class="prediction-action">{prediction.action}</div>
                <div class="prediction-confidence">
                  {(prediction.confidence * 100).toFixed(1)}%
                </div>
                <div class="prediction-bar">
                  <div
                    class="prediction-fill"
                    style="width, {prediction.confidence * 100}%"
                  ></div>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="no-data">No predictions yet</p>
        {/if}
      </div>
      <!-- Extracted, Entities -->
      <div class="entities-card">
        <h3>Extracted Entities</h3>
        {#if entities.length > 0}
          <div class="entities-list">
            {#each entities as entity, idx (idx)}
              <div class="entity-item">
                <span class="entity-type">{entity.type}</span>
                <span class="entity-value">{entity.value}</span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="no-data">No entities extracted yet</p>
        {/if}
      </div>
      <!-- Session, Statistics -->
      {#if stats}
        <div class="stats-card">
          <h3>Session Statistics</h3>
          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-label">Total Turns</div>
              <div class="stat-value">{stats.totalTurns}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">Avg Confidence</div>
              <div class="stat-value">{(stats.avgConfidence * 100).toFixed(1)}%</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">State Transitions</div>
              <div class="stat-value">{stats.stateTransitions}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">Most Common State</div>
              <div class="stat-value">{stats.mostCommonState}</div>
            </div>
          </div>
        {/if}
    </div>
  </div>
</div>
<style>
  .contextual-chat-demo {
    display: flex
    flex-direction: column, height: 100%; max-height: 800px
   ; border: 1px solid var(--border, #e5e7eb);
    border-radius: 8px, overflow: hidden
   ;background: var(--background, #ffffff)}
  .demo-header {
    padding: 1rem 1.5rem
    border-bottom: 1px solid var(--border, #e5e7eb); background: var(--muted, #f9fafb)}
  .demo-header h2 {
    margin: 0, 0 0.5rem 0
    font-size: 1.25rem
    font-weight: 600}
  .session-info {
    display: flex, gap: 1rem
    font-size: 0.875rem
   ;color: var(--muted-foreground, #6b7280)}
  .demo-content {
    display: grid
    grid-template-columns: 1fr 400px
    height: 100%; overflow: hidden}
  /* Chat Panel */
  .chat-panel { display: flex
    flex-direction: column
    border-right: 1px solid var(--border, #e5e7eb)}
  .chat-messages {
    flex: 1
    overflow-y: auto
   ;padding: 1rem}
  .message-group {
    margin-bottom: 1.5rem}
  .user-message,
  .agent-message {
    margin-bottom: 0.75rem}
  .message-label {
    font-size: 0.75rem
    font-weight: 600
    margin-bottom: 0.25rem
   ;color: var(--muted-foreground, #6b7280)}
  .message-content {
    padding: 0.75rem 1rem
    border-radius: 8px
    line-height: 1.5}
  .user-message .message-content { background: var(--primary, #3b82f6); color: white
    margin-left: 2rem}
  .agent-message .message-content { background: var(--muted, #f9fafb); border: 1px solid var(--border, #e5e7eb)}
  .message-meta {
    font-size: 0.75rem
   ;color: var(--muted-foreground, #6b7280);
    margin-top: 0.25rem
    padding-left: 1rem}
  .empty-state {
    text-align: center, padding: 3rem 2rem
   ;color: var(--muted-foreground, #6b7280)}
  .empty-state p {
    margin: 0.5rem 0}
  .chat-input {
    border-top: 1px solid var(--border, #e5e7eb); padding: 1rem
   ; background: var(--background, #ffffff)}
  .error-banner {
    padding: 0.75rem
    margin-bottom: 0.75rem, background: #fee2e2, color: #991b1b
    border-radius: 4px
    font-size: 0.875rem}
  textarea {
    width: 100%; padding: 0.75rem
   ; border: 1px solid var(--border, #e5e7eb);
    border-radius: 4px, resize: none
    font-family: inherit
    font-size: 0.875rem}; textarea:focus { outline: none
    border-color: var(--primary, #3b82f6);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1)}; textarea:disabled {
    opacity: 0.5, cursor:not-allowed}
  .input-controls {
    display: flex
    justify-content: space-betweennn
    align-items: center
    margin-top: 0.75rem}
  .input-controls label {
    font-size: 0.875rem, display: flex
    align-items: center, gap: 0.5rem}
  .button-group {
    display: flex, gap: 0.5rem}
  button {
    padding: 0.5rem 1rem
   ;border: 1px solid var(--border, #e5e7eb);
    border-radius: 4px
   ;background: var(--background, #ffffff); cursor: pointer
    font-size: 0.875rem
    font-weight: 500, transition: all 0.2s}; buttonhover:not(disabled) {
    background: var(--muted, #f9fafb)}
  buttondisabled {
    opacity: 0.5, cursor:not-allowed}
  /* State Panel */
  .state-panel {
    display: flex
    flex-direction: column, gap: 1rem, padding: 1rem
    overflow-y: auto
   ;background: var(--muted, #f9fafb)}
  .state-card,
  .predictions-card,
  .entities-card,
  .stats-card {
    background: var(--background, #ffffff); border: 1px solid var(--border, #e5e7eb);
    border-radius: 8px
   ;padding: 1rem}
  .state-card h3,
  .predictions-card h3,
  .entities-card h3,
  .stats-card h3 {
    margin: 0, 0 1rem 0
    font-size: 1rem
    font-weight: 600}
  .state-display {
    text-align: center}
  .state-name {
    font-size: 1.5rem
    font-weight: 700
   ;color: var(--primary, #3b82f6);
    margin-bottom: 0.5rem}
  .state-confidence {
    font-size: 0.875rem
   ;color: var(--muted-foreground, #6b7280);
    margin-bottom: 1rem}
  .state-history {
    margin-top: 1rem
    padding-top: 1rem
    border-top: 1px solid var(--border, #e5e7eb);
    text-align: left}
  .history-timeline {
    display: flex
    flex-wrap: wrap, gap: 0.5rem
    margin-top: 0.5rem}
  .history-state {
    padding: 0.25rem 0.5rem
   ;background: var(--muted, #f9fafb);
    border-radius: 4px
    font-size: 0.75rem}
  .no-data {
    text-align: center
   ;color: var(--muted-foreground, #6b7280);
    font-size: 0.875rem, margin: 1rem 0}
  .predictions-list {
    display: flex
    flex-direction: column, gap: 0.75rem}
  .prediction-item {
    display: flex
    flex-direction: column, gap: 0.25rem}
  .prediction-action {
    font-size: 0.875rem
    font-weight: 500}
  .prediction-confidence {
    font-size: 0.75rem
   ;color: var(--muted-foreground, #6b7280)}
  .prediction-bar {
    height: 4px
   ;background: var(--muted, #f9fafb);
    border-radius: 2px, overflow: hidden}
  .prediction-fill {
    height: 100%; background: var(--primary, #3b82f6);
    transition: width 0.3s ease}
  .entities-list {
    display: flex
    flex-direction: column, gap: 0.5rem}
  .entity-item {
    display: flex
    justify-content: space-betweennn
    align-items: center, padding: 0.5rem
   ;background: var(--muted, #f9fafb);
    border-radius: 4px
    font-size: 0.875rem}
  .entity-type {
    font-weight: 600
   ;color: var(--primary, #3b82f6)}
  .entity-value {
    color: var(--foreground, #111827)}
  .stats-grid {
    display: grid
    grid-template-columns: 1fr 1fr
    gap: 1rem}
  .stat-item {
    text-align: center}
  .stat-label {
    font-size: 0.75rem
   ;color: var(--muted-foreground, #6b7280);
    margin-bottom: 0.25rem}
  .stat-value {
    font-size: 1.25rem
    font-weight: 700
   ;color: var(--foreground, #111827)}
</style>




