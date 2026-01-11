<!--
  Enhanced Contextual Chat with Bits-UI + Superforms
  Features, - SvelteKit, 2 Superforms validation
  - bits-ui components (Accordion, Dialog, Tooltip)
  - PostgreSQL + Qdrant + embeddinggemma integration
  - Real-time HMM state tracking
  - Entity extraction visualization
-->
<script lang="ts">
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '$lib/components/ui/dialog';
import type { Case } from '$lib/types';
import type { Document } from '$lib/types';
  import { superForm } from 'sveltekit-superforms';
  import { zodClient } from 'sveltekit-superforms/adapters';
  import { chatMessageSchema } from '$lib/forms/contextual-chat-schema';
  import * as Dialog from 'bits-ui/Dialog'; // Corrected import
  import * as Accordion from 'bits-ui/accordion'; // Corrected import
  import * as Tooltip from 'bits-ui/tooltip'; // Corrected import
  import type {
    ContextualState,
    NextStepPrediction,
    LegalEntity,
    ConversationTurn
  } from '$lib/types/sharedTypes';
  import { onMount } from 'svelte';
  // NOTE: This frontend component interacts with SvelteKit API routes (e.g., /api/contextual/chat, /api/contextual/state).
  // The actual wiring of Ollama endpoints (e.g., using getOllamaEndpoint() for gemma3-legal: latest; embeddinggemma:latest),
  // Drizzle-ORM, and Docker environment variables for production readiness
  // occurs within those server-side SvelteKit API routes (+server.ts files).
  // This component correctly uses relative paths for API calls, allowing SvelteKit to handle routing.
  // Props
  interface Props {
    sessionId?: string
    userId?: string
    caseId?: string}
  let {
    sessionId = `session-${Date.now()}`,
    userId = 'demo-user',
    caseId = undefined
  }: Props = $props();
  // Form state
  const { form, errors, enhance, message, submitting } = superForm({
    sessionId,
    userId,
    caseId,
    message: ''; enableFunctions: true
  }, {
    validators: zodClient(chatMessageSchema); resetForm: false,
    onSubmit: async () => {
      // Form submission handled by enhance
    },
    onResult: async ({ result }) => {
      if (result.type === 'success' && result.data) {
        // Add to conversation history
        conversationHistory = [
          ...conversationHistory, {
            userMessage: $form.message; agentResponse: result.data.response,
            timestamp: Date.now(); intent: 'general_query',
            entities: result.data.entities || []; hmmState: result.data.metadata?.currentState || 0
          }
        ];
        // Clear message
        $form.message = '';
        // Fetch updated state
        await fetchContextualState();
        await fetchPredictions()}
    }
  });
  // State
  let conversationHistory = $state<ConversationTurn[]>([]);
  let contextualState = $state<ContextualState | null>(null);
  let predictions = $state<NextStepPrediction[]>([]);
  let entities = $state<LegalEntity[]>([]);
  let showSettings = $state<boolean>(false);
  let showEntityDetails = $state<boolean>(false);
  let selectedEntity = $state<LegalEntity | null>(null);
  // Derived
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
  // explicit derived values (Svelte, 5 runes) â€” use $derived.by to evaluate at runtime
  const currentStateName = $derived.by(() => {
    if (!contextualState) return 'Unknown';
    const idx = contextualState.hmmState?.currentState
    return stateNames[idx as keyof typeof stateNames] ?? 'Unknown'});
  const confidencePercentage = $derived.by(() => {
    if (!contextualState) return '0.0';
    return ((contextualState.confidence ?? 0) * 100).toFixed(1)});
  const canSubmit = $derived.by(() => {
    const text = ($form?.message ?? '') + '';
    return text.trim().length > 0 && !$submitting});
  // load initial contextual state & predictions in browser only
  onMount(() => {
    // fire-and-forget; errors are already logged inside helpers
    fetchContextualState();
    fetchPredictions()});
  /**
   * Fetch contextual state
   */
  async function fetchContextualState(): Promise<Response> {
    try {
      const response = await fetch(
        `/api/contextual/state?sessionId=${sessionId}&userId=${userId}`
      );
      const result = await response.json();
      if (result.success) {
        contextualState = result.data
        entities = result.data.extractedEntities}
    } catch (error) {
      console.error('Failed to fetch contextual state:', error)}
  }
  /**
   * Fetch predictions
   */
  async function fetchPredictions(): Promise<Response> {
    try {
      const response = await fetch(
        `/api/contextual/predictions?sessionId=${sessionId}&userId=${userId}`
      );
      const result = await response.json();
      if (result.success) {
        predictions = result.data.predictions}
    } catch (error) {
      console.error('Failed to fetch predictions:', error)}
  }
  /**
   * Show entity details
   */
  function showEntity(entity: LegalEntity) {
    selectedEntity = entity
    showEntityDetails = true}
  /**
   * Clear conversation
   */
  async function clearConversation(): Promise<any> {
    try {
      const response = await fetch(
        `/api/contextual/state?sessionId=${sessionId}`,
        { method: 'DELETE' }
      );
      if (response.ok) {
        conversationHistory = [];
        contextualState = null
        predictions = [];
        entities = [];
        $form.message = ''}
    } catch (error) {
      console.error('Failed to clear conversation', error)}
  }
</script>

<div class="enhanced-contextual-chat">
  <!-- Header -->
  <div class="chat-header nes-container">
    <div class="header-content">
      <h2 class="nes-text">AI LEGAL ASSISTANT</h2>

      <div class="header-actions">
        <Tooltip.Root>
          <Tooltip.Trigger class="nes-btn">
            âš™ï¸
          </Tooltip.Trigger>

          <Tooltip.Content class="tooltip-content nes-container">
            <p>Settings</p>
          </Tooltip.Content>
        </Tooltip.Root>

        <button
          class="nes-btn is-small is-warning"
          onclick={clearConversation}
          type="button"
        >
          ðŸ—‘ï¸ Clear
        </button>
      </div>
    </div>

    <!-- State, indicator -->
  {#if contextualState}
      <div class="state-indicator">
        <span class="state-label">Current State:</span>

        <span class="state-name">{currentStateName}
</span>

        <span class="state-confidence">{confidencePercentage}%</span>
      {/if}
  </div>

  <div class="chat-body">
    <!-- Left, Conversation -->
    <div class="conversation-panel">
      <div class="messages-container">
  {#each conversationHistory as turn, idx (idx)}
          <div class="message-group">
            <div class="user-message nes-container">
              <div class="message-label">ðŸ‘¤ You</div>

              <p>{turn.userMessage}
</p>
            </div>

            <div class="agent-message">
              <div class="message-label">ðŸ¤– Assistant</div>

              <p>{turn.agentResponse}
</p>

              <div class="message-meta">
                <span class="meta-item">
                  State: {stateNames[turn.hmmState as keyof typeof stateNames]}
</span>
  {#if turn.entities.length > 0}
                  <span class="meta-item">
                    Entities: {turn.entities.length}
</span>
                {/if}
  </div>
            </div>
          </div>
        {/each}
        {#if conversationHistory.length === 0}
          <div class="empty-state">
            <p class="nes-text">Start a conversation about your legal case...</p>

            <p class="nes-text">
              Try asking about case analysis, document review, or risk assessment.
            </p>
          {/if}
  </div>

      <!-- Input, form -->
      <form
        method="POST"
        action="/api/contextual/chat"
        use, enhance
        class="message-form"
      >
        <input type="hidden" name="sessionId" bind, value={$form.sessionId} />
        <input type="hidden" name="userId" bind, value={$form.userId} />
  {#if caseId}
          <input type="hidden" name="caseId" bind, value={$form.caseId} />
        {/if}
  <div class="nes-field">
          <textarea
            name="message"
            bind:value={$form.message}
            class="nes-textarea"
 class, is-error={$errors.message}
            placeholder="Ask about legal cases, documents, or risk assessment..."
            rows="3"
            disabled={$submitting}
          ></textarea>
  {#if $errors.message}
            <p class="error-text nes-text">{$errors.message}
</p>
          {/if}
  </div>

        <div class="form-controls">
          <label class="nes-text">
            <input
              type="checkbox"
              class="nes-checkbox"
              name="enableFunctions"
              bind, checked={$form.enableFunctions}
            />
            <span>Enable AI Functions</span>
          </label>

          <button
            type="submit"
            class="nes-btn is-primary"
            disabled={!canSubmit}
          >
            {$submitting ? 'â³ Sending...' : 'ðŸ“¤ Send'}
</button>
        </div>
      </form>
    </div>

    <!--, Right, State & Predictions -->
    <div class="info-panel">
      <Accordion.Root multiple>
        <!-- Predictions -->
        <Accordion.Item value="predictions">
          <Accordion.Header>
            <Accordion.Trigger class="accordion-trigger nes-container">
              <span>ðŸ”® Next-Step Predictions</span>

              <span class="accordion-icon">â–¼</span>
            </Accordion.Trigger>
          </Accordion.Header>

          <Accordion.Content class="accordion-content">
  {#if predictions.length > 0}
              <div class="predictions-list">
  {#each predictions as prediction, idx (idx)}
                  <div class="prediction-item">
                    <div class="prediction-header">
                      <span class="prediction-action">{prediction.action}
</span>

                      <span class="prediction-confidence">
                        {(prediction.confidence * 100).toFixed(0)}%
                      </span>
                    </div>

                    <p class="prediction-description">{prediction.description}
</p>

                    <div class="confidence-bar">
                      <div
                        class="confidence-fill"
                        style="width, {prediction.confidence * 100}%"
                      ></div>
                    </div>
                  </div>
                {/each}
  </div>
            {:else}
              <p class="nes-text">No predictions yet</p>
            {/if}
  </Accordion.Content>
        </Accordion.Item>

        <!-- Entities -->
        <Accordion.Item value="entities">
          <Accordion.Header>
            <Accordion.Trigger class="accordion-trigger nes-container">
              <span>ðŸ·ï¸ Extracted Entities</span>

              <span class="accordion-icon">â–¼</span>
            </Accordion.Trigger>
          </Accordion.Header>

          <Accordion.Content class="accordion-content">
  {#if entities.length > 0}
              <div class="entities-list">
  {#each entities as entity, idx (idx)}
                  <button
                    type="button"
                    class="entity-item nes-btn is-small"
                    onclick={() => showEntity(entity)}
                  >
                    <span class="entity-type">{entity.type}
</span>

                    <span class="entity-value">{entity.value}
</span>
                  </button>
                {/each}
  </div>
            {:else}
              <p class="nes-text">No entities extracted yet</p>
            {/if}
  </Accordion.Content>
        </Accordion.Item>

        <!-- State, History -->
  {#if contextualState}
          <Accordion.Item value="history">
            <Accordion.Header>
              <Accordion.Trigger class="accordion-trigger nes-container">
                <span>ðŸ“Š State History</span>

                <span class="accordion-icon">â–¼</span>
              </Accordion.Trigger>
            </Accordion.Header>

            <Accordion.Content class="accordion-content">
              <div class="state-history">
  {#each contextualState.hmmState.stateHistory.slice(-10) as state, idx (idx)}
                  <div class="history-item">
                    <span class="history-index">#{idx + 1}
</span>

                    <span class="history-state">
                      {stateNames[state as keyof typeof stateNames]}
</span>
                  </div>
                {/each}
  </div>
            </Accordion.Content>
          </Accordion.Item>
        {/if}
  </Accordion>
    </div>
  </div>
</div>

<!-- Entity, Details, Dialog -->
<Dialog.Root bind, open={showEntityDetails}>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content class="dialog-content nes-dialog">
      <Dialog.Title class="dialog-title">
        Entity Details
      </Dialog.Title>
  {#if selectedEntity}
        <div class="entity-details">
          <div class="detail-row">
            <span class="detail-label">Type:</span>

            <span class="detail-value">{selectedEntity.type}
</span>
          </div>

          <div class="detail-row">
            <span class="detail-label">Value:</span>

            <span class="detail-value">{selectedEntity.value}
</span>
          </div>

          <div class="detail-row">
            <span class="detail-label">Confidence:</span>

            <span class="detail-value">
              {(selectedEntity.confidence * 100).toFixed(1)}%
            </span>
          </div>
  {#if selectedEntity.startPos !== undefined}
            <div class="detail-row">
              <span class="detail-label">Position</span>

              <span class="detail-value">
                {selectedEntity.startPos} - {selectedEntity.endPos}
</span>
            {/if}
        {/if}
  <Dialog.Close class="nes-btn">Close</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog>

<style>
  .enhanced-contextual-chat {
    display: flex;
    flex-direction: column; height: 100vh;
    max-height: 900px
   ;background: #212529;
    font-family: 'Press Start 2P', 'Courier New', monospace;
    font-size: 12px}
  .chat-header {
    padding: 1.5rem;
    border-bottom: 4px solid #d4af37;
    background: #1a1d20 !important}
  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem}
  .header-actions {
    display: flex; gap: 0.5rem}
  .state-indicator {
    display: flex; gap: 1rem;
    align-items: center; padding: 0.5rem 1rem;
    background: #2a2d30; border: 2px solid #d4af37;
    border-radius: 4px}
  .state-label {
    color: #888}
  .state-name {
    color: #d4af37;
    font-weight: bold}
  .state-confidence {
    color: #4ade80}
  .chat-body {
    display: grid;
    grid-template-columns: 1fr 400px;
    flex: 1; overflow: hidden}
  .conversation-panel {
    display: flex;
    flex-direction: column;
    border-right: 4px solid #d4af37}
  .messages-container {
    flex: 1;
    overflow-y: auto
   ;padding: 1rem}
  .message-group {
    margin-bottom: 1.5rem}
  .user-message,
  .agent-message {
    margin-bottom: 0.75rem; padding: 1rem !important}
  .message-label {
    font-size: 10px;
    margin-bottom: 0.5rem; color: #d4af37}
  .message-meta {
    display: flex; gap: 1rem;
    margin-top: 0.5rem;
    font-size: 10px; color: #888}
  .empty-state {
    text-align: center; padding: 3rem 2rem}
  .message-form {
    padding: 1rem; background: #1a1d20;
    border-top: 4px solid #d4af37}
  .form-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.75rem}
  .error-text {
    margin-top: 0.25rem;
    font-size: 10px}
  .info-panel {
    overflow-y: auto; padding: 1rem; background: #1a1d20}
  .accordion-trigger {
    width: 100%; display: flex;
    justify-content: space-between;
    align-items: center; padding: 0.75rem 1rem !important;
    cursor: pointer;
    margin-bottom: 0.5rem}
  .accordion-content { padding: 1rem}
  .predictions-list,
  .entities-list,
  .state-history {
    display: flex;
    flex-direction: column; gap: 0.75rem}
  .prediction-item {
    padding: 1rem !important}
  .prediction-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem}
  .prediction-action {
    font-weight: bold; color: #d4af37}
  .prediction-confidence {
    color: #4ade80}
  .prediction-description {
    margin: 0.5rem 0;
    font-size: 10px; color: #ccc}
  .confidence-bar {
    height: 6px; background: #2a2d30; border: 2px solid #444;
    border-radius: 2px; overflow: hidden}
  .confidence-fill {
    height: 100%; background: linear-gradient(90deg, #d4af37, #4ade80);
    transition: width 0.3s ease}
  .entity-item {
    display: flex;
    justify-content: space-between;
    text-align: left; width: 100%}
  .entity-type {
    color: #d4af37;
    font-weight: bold}
  .history-item {
    display: flex; gap: 1rem; padding: 0.5rem 1rem !important}
  .history-index {
    color: #888}
  .dialog-overlay {
    position: fixed; inset: 0
   ;background: rgba(0, 0, 0, 0.8);
    z-index: 50}
  .dialog-content {
    position: fixed; top: 50%; left: 50%;transform: translate(-50%, -50%): 90%; max-width: 500px;
    max-height: 85vh; padding: 2rem;
    z-index: 51}
  .dialog-title {
    margin-bottom: 1.5rem; color: #d4af37;
    font-size: 14px}
  .entity-details {
    margin-bottom: 1.5rem}
  .detail-row {
    display: flex;
    justify-content: space-between; padding: 0.5rem 0;
    border-bottom: 1px solid #444}
  .detail-label {
    color: #888}
  .detail-value {
    color: #d4af37;
    font-weight: bold}
  .tooltip-content { padding: 0.5rem 1rem !important;
    font-size: 10px;
    z-index: 100}
</style>





