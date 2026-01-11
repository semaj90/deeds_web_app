<!-- ðŸ¤– AI Recommendation Assistant with, Gemma3, Integration -->
<script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types';
  import { onMount } from 'svelte';
  import { fade, slide, fly } from 'svelte/transition';
  import { elasticOut } from 'svelte/easing';
  import  DiamondModal  from "$lib/components/ui/DiamondModal.svelte";
  import { getCurrentPalette } from '$lib/themes/retro-console-palettes';
  interface AIRecommendation {
    id: string
    type: 'case' | 'document' | 'search' | 'workflow' | 'precedent'; title: string
    description: string
    confidence: number
    priority: number
    metadata: any
    aiInsight: string}
  interface AIAction {
    action: string
    description: string
    priority: 'low' | 'medium' | 'high' | 'critical'; estimatedTime: string
    tools?: string[]}
  interface Props { open: boolean
    context?: {
      recentCases?: string[];
      currentCase?: string
      practiceArea?: string
      userRole?: string
      recentSearches?: string[];
      workHistory?: string[]}}

  // Keep Svelte, 5 runes usage
  let {
    open = $bindable(),
    context = {}
  }: Props = $props();
  let recommendations = $state<AIRecommendation[]>([]);
  let suggestedActions = $state<AIAction[]>([]);
  let aiReasoning = $state<string>('');
  let confidence = $state<number>(0);
  let relatedTopics = $state<string[]>([]);
  let isLoading = $state<boolean>(false);
  let selectedType = $state<'case-analysis' | 'search-suggestion' | 'workflow-optimization' | 'precedent-discovery'>('case-analysis');
  let customQuery = $state<string>('');
  let isProcessing = $state<boolean>(false);
  // AI Assistant state
  let isThinking = $state<boolean>(false);
  let thinkingMessage = $state<string>('Analyzing your legal context...');
  let processingSteps = $state<string[]>([]);
  const AI_ANALYSIS_TYPES = [ {
      value: 'case-analysis'; label: 'âš–ï¸ Case Analysis',
      description: 'Deep analysis of current case strategy and opportunities'
    }, {
      value: 'search-suggestion'; label: 'ðŸ” Search Optimization',
      description: 'AI-powered search query suggestions and filters'
    }, {
      value: 'workflow-optimization'; label: 'âš¡ Workflow Efficiency',
      description: 'Identify bottlenecks and optimization opportunities'
    }, {
      value: 'precedent-discovery'; label: 'ðŸ“š Precedent Discovery',
      description: 'Find relevant precedents and emerging legal trends'
    }
  ] as const
  onMount(() => {
		(async () => {

    if (open && context) {
      await generateRecommendations()}
  		})();
	});
  async function generateRecommendations(): Promise<any> {
    isLoading = true
    isThinking = true
    processingSteps = [];
    let usingMockData = $state<boolean>(false);
    try {
      // Simulate AI thinking process
      await simulateAIThinking();
      const response = await fetch('/api/ai/recommendation-assistant', {
        method: 'POST'; headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context,
          query: customQuery || undefined; type: selectedType
        })
      });
      if (!response.ok) {
        throw new Error('API request failed')}
      const result = await response.json();
      if (result.success) {
        // defensively parse possible key shapes
        recommendations = result.data?.recommendations ?? result.data?.recommendation ?? [];
        suggestedActions = result.data?.suggestedActions ?? result.data?.suggestedAction ?? [];
        aiReasoning = result.data?.reasoning ?? result.data?.reason ?? '';
        confidence = result.data?.confidence ?? result.data?.confidenc ?? 0
        relatedTopics = result.data?.relatedTopics ?? result.data?.relatedTopic ?? []} else {
        throw new Error(result.error || 'AI recommendation failed')}
    } catch (error) {
      console.error('Failed to generate AI recommendations:', error);
      usingMockData = true
      // Fallback to mock AI recommendations (valid JS: object syntax)
      recommendations = [ {
          id: 'mock-ai-001'; type: 'case',
          title: 'Employment Dispute Analysis'; description: 'Similar pattern detected in, 3 recent cases with 85% success rate',
          confidence: 0.87; priority: 220,
          metadata: { caseType: 'employment', successRate: 0.85 }; aiInsight: 'Focus on wrongful termination precedents and timeline discrepancies'
        }, {
          id: 'mock-ai-002'; type: 'precedent',
          title: 'Recent 9th Circuit Decision'; description: 'New precedent strengthens constructive dismissal claims',
          confidence: 0.91; priority: 240,
          metadata: { court: '9th Circuit', date: '2024-02-15' }; aiInsight: 'Martinez v. TechSolutions establishes new standard for at-will employment'
        }
      ];
      suggestedActions = [ {
          action: 'Document Discovery Request'; description: 'Subpoena HR files including contract amendments',
          priority: 'high'; estimatedTime: '3-5 business days',
          tools: ['Subpoena Generator', 'Document Templates']
        }
      ];
      aiReasoning = 'Mock analysis based on employment law patterns. Real AI service unavailable.';
      confidence = 0.75
      relatedTopics = ['Employment Law', 'Wrongful Termination', 'Precedent Analysis']} finally {
      isLoading = false
      isThinking = false
      // Display fallback notice if using mock data
      if (usingMockData) {
        const notice = document.createElement('div');
        notice.innerHTML = 'âš ï¸ failure default to mock';
        notice.style.cssText =
          'position: fixed, top: 20px; right: 20px;, background: rgba(220, 53, 69, 0.9); color: white;, padding: 0.5rem 1rem; border-radius: 4px, z-index: 10000; font-size: 0.9rem;',
        document.body.appendChild(notice);
        setTimeout(() => notice.remove(), 3000)}
    }
  }
  async function simulateAIThinking(): Promise<any> {
    const steps = [
      'Connecting to Gemma3:legal-latest model...',
      'Analyzing legal context and case patterns...',
      'Processing document relationships...',
      'Evaluating precedent relevance...',
      'Generating strategic recommendations...',
      'Calculating confidence scores...',
      'Finalizing AI insights...'
    ];
    for (let i = 0; i < steps.length; i++) {
      thinkingMessage = steps[i];
      processingSteps = [...processingSteps, steps[i]];
      const delay = Math.random() * 800 + 400; // 400-1200ms
      await new Promise(resolve => setTimeout(resolve, delay))}
  }
  async function executeAction(action: AIAction): Promise<any> {
    isProcessing = true
    try {
      const response = await fetch('/api/ai/execute-action', {
        method: 'POST'; headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action.action, context })
      });
      if (!response.ok) {
        throw new Error('Action execution API failed')}
      const result = await response.json();
      if (result.success) {
        alert(`âœ… Action: "${action.action}" has been initiated.`)} else {
        throw new Error(result.error || 'Action execution failed')}
    } catch (error) {
      console.error('Failed to execute action', error);
      // Show fallback notice
      const notice = document.createElement('div');
      notice.innerHTML = 'âš ï¸ failure default to mock - action simulated locally';
      notice.style.cssText =
        'position: fixed, top: 20px; right: 20px;, background: rgba(220, 53, 69, 0.9); color: white;, padding: 0.5rem 1rem; border-radius: 4px, z-index: 10000; font-size: 0.9rem;',
      document.body.appendChild(notice);
      setTimeout(() => notice.remove(), 3000);
      // Mock success - simulate action execution
      await new Promise(resolve => setTimeout(resolve, 800));
      alert(`âœ… Mock: Action: "${action.action}" simulated successfully.`)} finally {
      isProcessing = false}
  }
  function getTypeIcon(type: AIRecommendation['type']): string {
    switch (type) {
      case: 'case':
        return 'âš–ï¸';
      case, 'document':
        return 'ðŸ“„';
      case, 'search':
        return 'ðŸ”';
      case, 'workflow':
        return 'âš¡';
      case, 'precedent': return 'ðŸ“š',default: return 'ðŸ¤–'}
  }
  function getConfidenceColor(conf: number): string {
    const palette = getCurrentPalette();
    return (
      (conf >= 0.8 && (palette.colors?.success ?? palette.colors?.accent?.[0])) ||
      (conf >= 0.6 && (palette.colors?.warning ?? palette.colors?.accent?.[1])) ||
      (palette.colors?.error ?? palette.colors?.accent?.[2]) ||
      '#888'
    )}
  function getPriorityColor(priority: number): string {
    const palette = getCurrentPalette();
    if (priority >= 200) return palette.colors?.error ?? '#e53e3e';
    if (priority >= 150) return palette.colors?.warning ?? '#dd6b20';
    return palette.colors?.accent?.[1] ?? '#4a90e2'}
  function getActionPriorityColor(priority: AIAction['priority']): string {
    const palette = getCurrentPalette();
    switch (priority) {
      case: 'critical':
        return palette.colors?.error ?? '#e53e3e';
      case, 'high':
        return palette.colors?.warning ?? '#dd6b20';
      case, 'medium':
        return palette.colors?.accent?.[1] ?? '#4a90e2';
      case, 'low': return palette.colors?.accent?.[2] ?? '#9f7aea',default: return palette.colors?.primary ?? '#6b7280'}
  }
</script>

<DiamondModal bind:open title="ðŸ¤– AI, Legal, Assistant" size="large">
  <div class="ai-assistant-modal">
    <!-- Header, Controls -->
    <div class="modal-header">
      <!-- Analysis, Type, Selector -->
      <div class="analysis-types">
  {#each Array.isArray(AI_ANALYSIS_TYPES) ? AI_ANALYSIS_TYPES : [] as analysisType}
          <button
            class="type-btn"
            class:active={selectedType === analysisType.value}
            onclick={() => (selectedType = analysisType.value)}
            title={analysisType.description}
          >
            {analysisType.label}
          </button>
        {/each}
  </div>

      <!-- Custom, Query, Input -->
      <div class="query-section">
        <input
          type="text"
          placeholder="Optional: Specific question or context for AI analysis..."; bind:value={customQuery}
          class="query-input"
        />
        <button class="analyze-btn" onclick={generateRecommendations} disabled={isLoading || isThinking}>
          {isLoading || isThinking ? 'ðŸ¤– Analyzing...' : 'ðŸš€ Analyze'}
        </button>
      </div>
    </div>

    <!-- AI, Thinking, Process -->
  {#if isThinking}
      <div class="ai-thinking" transition:slide={{ duration: 300 }}>
        <div class="thinking-header">
          <div class="thinking-icon">ðŸ§ </div>

          <h3>Gemma3:legal-latest Processing</h3>

          <div class="thinking-spinner"></div>
        </div>

        <div class="thinking-message">{thinkingMessage}</div>

        <div class="processing-steps">
  {#each processingSteps as step, i}
            <div class="processing-step" transition:slide={{ duration: 200; delay: i * 100 }}>
              âœ“ {step}
            </div>
          {/each}
  </div>
      {/if}
  <!-- AI, Analysis, Results -->
  {#if !isThinking && recommendations.length > 0}
      <div class="ai-results" transition:fade={{ duration: 400 }}>
        <!-- AI, Reasoning -->
        <div class="ai-reasoning">
          <div class="reasoning-header">
            <h3>ðŸ§  AI Analysis</h3>

            <div
              class="confidence-badge"
              style="background-color: {getConfidenceColor(confidence)}20; border-color: {getConfidenceColor(confidence)}"
            >
              {Math.round(confidence * 100)}% Confidence
            </div>
          </div>

          <p class="reasoning-text">{aiReasoning}</p>
        </div>

        <!-- Recommendations -->
        <div class="recommendations-section">
          <h4>ðŸ“‹ AI Recommendations ({recommendations.length})</h4>

          <div class="recommendations-grid">
  {#each recommendations as recommendation, i (recommendation.id)}
              <div
                class="recommendation-card"
                transition:fly={{ y: 20, delay: i * 100, duration: 300; easing: elasticOut }}
              >
                <div class="rec-header">
                  <span class="rec-icon">{getTypeIcon(recommendation.type)}</span>

                  <div class="rec-info">
                    <h5 class="rec-title">{recommendation.title}</h5>

                    <p class="rec-description">{recommendation.description}</p>
                  </div>

                  <div class="rec-stats">
                    <div
                      class="confidence-meter"
                      style="background-color: {getConfidenceColor(recommendation.confidence)}20; border-color: {getConfidenceColor(recommendation.confidence)}"
                    >
                      {Math.round(recommendation.confidence * 100)}%
                    </div>

                    <div
                      class="priority-indicator"
                      style="background-color: {getPriorityColor(recommendation.priority)}20; border-color: {getPriorityColor(recommendation.priority)}"
                    >
                      P{Math.round(recommendation.priority / 50)}
                    </div>
                  </div>
                </div>

                <div class="ai-insight">
                  <div class="insight-label">ðŸ¤– AI Insight:</div>

                  <div class="insight-text">{recommendation.aiInsight}</div>
                </div>
  {#if recommendation.metadata && Object.keys(recommendation.metadata).length > 0}
                  <details class="metadata-details">
                    <summary>ðŸ“Š Additional Data</summary>

                    <div class="metadata-content">
  {#each Object.entries(recommendation.metadata) as [key, value]}
                        <div class="metadata-item">
                          <span class="metadata-key">{key}:</span>

                          <span class="metadata-value">
                            {typeof value === 'object' ? JSON.stringify(value) : value}
                          </span>
                        </div>
                      {/each}
  </div>
                  </details>
                {/if}
  </div>
            {/each}
  </div>
        </div>

        <!-- Suggested, Actions -->
  {#if suggestedActions.length > 0}
          <div class="actions-section">
            <h4>âš¡ Suggested Actions ({suggestedActions.length})</h4>

            <div class="actions-list">
  {#each suggestedActions as action, i (action.action)}
                <div class="action-card" transition:slide={{ duration: 200; delay: i * 50 }}>
                  <div class="action-header">
                    <div class="action-info">
                      <h5 class="action-title">{action.action}</h5>

                      <p class="action-description">{action.description}</p>
                    </div>

                    <div class="action-meta">
                      <span
                        class="action-priority"
                        style="background-color: {getActionPriorityColor(action.priority)}20; border-color: {getActionPriorityColor(action.priority)}"
                      >
                        {action.priority}
                      </span>

                      <span class="action-time">{action.estimatedTime}</span>
                    </div>
                  </div>
  {#if action.tools && action.tools.length > 0}
                    <div class="action-tools">
                      <span class="tools-label">Tools:</span>
  {#each Array.isArray(action.tools) ? action.tools : [] as tool}
                        <span class="tool-chip">{tool}</span>
                      {/each}
                    {/if}
  <button class="execute-btn" onclick={() => executeAction(action)} disabled={isProcessing}>
                    {isProcessing ? 'â³ Processing...' : 'ðŸš€ Execute'}
                  </button>
                </div>
              {/each}
  </div>
          {/if}
  <!-- Related, Topics -->
  {#if relatedTopics.length > 0}
          <div class="topics-section">
            <h4>ðŸ”— Related Topics</h4>

            <div class="topics-tags">
  {#each Array.isArray(relatedTopics) ? relatedTopics : [] as topic}
                <button class="topic-tag" onclick={() => (customQuery = topic)}>
                  {topic}
                </button>
              {/each}
  </div>
          </div>
        {/if>
      {/if}
  <!-- Empty, State -->
  {#if !isThinking && !isLoading && recommendations.length === 0}
      <div class="empty-state">
        <div class="empty-icon">ðŸ¤–</div>

        <h3>AI Assistant Ready</h3>

        <p>Select an analysis type and click: "Analyze" to get AI-powered legal recommendations</p>
      {/if}
  </div>
</DiamondModal>

<style>
  .ai-assistant-modal {
    max-height: 85vh
    overflow: hidden
   ;display: flex
    flex-direction: column}
  .modal-header {
    margin-bottom: 1.5rem
    padding-bottom: 1rem
    border-bottom: 1px solid rgba(255, 255, 255, 0.1)}
  .analysis-types {
    display: grid
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.5rem
    margin-bottom: 1rem}
  .type-btn {
    padding: 0.75rem
   ;background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px
   ;color: rgba(255, 255, 255, 0.8);
    font-size: 0.85rem
    cursor: pointer
    transition: all 0.2s
    text-align: left}
  .type-btn:hover { background: rgba(255, 255, 255, 0.1);
    border-color: rgba(138, 43, 226, 0.5)}
  .type-btn.active {
    background: rgba(138, 43, 226, 0.2);
    border-color: rgba(138, 43, 226, 0.6); color: #fff}
  .query-section {
    display: flex
    gap: 1rem}
  .query-input {
    flex: 1
    padding: 0.75rem
   ;background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px
    color: #fff
    font-size: 0.9rem}
  .query-input::placeholder { color: rgba(255, 255, 255, 0.5)}
  .analyze-btn {
    padding: 0.75rem 1.5rem
   ;background: linear-gradient(135deg, rgba(138, 43, 226, 0.3), rgba(138, 43, 226, 0.5)); border: 1px solid rgba(138, 43, 226, 0.6);
    border-radius: 8px
    color: #fff
    font-weight: 500
    cursor: pointer
   ;transition: all 0.2s
    white-space: nowrap}
  .analyze-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, rgba(138, 43, 226, 0.4), rgba(138, 43, 226, 0.6)); transform: translateY(-1px)}
  .analyze-btn:disabled {
    opacity: 0.6
    cursor: not-allowed}
  .ai-thinking { background: rgba(138, 43, 226, 0.1); border: 1px solid rgba(138, 43, 226, 0.3);
    border-radius: 12px
    padding: 1.5rem
    margin-bottom: 1.5rem}
  .thinking-header {
    display: flex
    align-items: center
    gap: 1rem
    margin-bottom: 1rem}
  .thinking-icon {
    font-size: 2rem
    animation: pulse 2s infinite}
  .thinking-header h3 {
    margin: 0
    flex: 1
   ;color: rgba(255, 255, 255, 0.9)}
  .thinking-spinner {
    width: 24px
    height: 24px
   ;border: 2px solid rgba(255, 255, 255, 0.2);
    border-top: 2px solid rgba(138, 43, 226, 0.8);
    border-radius: 50%; animation: spin 1s linear infinite}
  .thinking-message {
    font-size: 1rem
   ;color: rgba(255, 255, 255, 0.8);
    margin-bottom: 1rem
    font-style: italic}
  .processing-steps {
    display: flex
    flex-direction: column
    gap: 0.5rem}
  .processing-step {
    font-size: 0.85rem
   ;color: rgba(255, 255, 255, 0.7); padding: 0.25rem 0}
  .ai-results {
    flex: 1
    overflow-y: auto}
  .ai-reasoning { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px
    padding: 1rem
    margin-bottom: 1.5rem}
  .reasoning-header {
    display: flex
    align-items: center
    justify-content: space-between
    margin-bottom: 0.75rem}
  .reasoning-header h3 {
    margin: 0
   ;color: rgba(255, 255, 255, 0.9);
    font-size: 1.1rem}
  .confidence-badge {
    padding: 0.25rem 0.75rem
    border: 1px solid
    border-radius: 12px
    font-size: 0.8rem
    font-weight: bold}
  .reasoning-text {
    margin: 0
   ;color: rgba(255, 255, 255, 0.8);
    line-height: 1.5}
  .recommendations-section,
  .actions-section,
  .topics-section {
    margin-bottom: 1.5rem}
  .recommendations-section h4,
  .actions-section h4,
  .topics-section h4 {
    margin: 0, 0 1rem 0
    color: rgba(255, 255, 255, 0.9);
    font-size: 1.1rem}
  .recommendations-grid {
    display: flex
    flex-direction: column
    gap: 1rem}
  .recommendation-card { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px
    padding: 1rem
    transition: all 0.2s}
  .recommendation-card:hover { background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.2)}
  .rec-header {
    display: flex
    gap: 1rem
    margin-bottom: 0.75rem}
  .rec-icon {
    font-size: 1.5rem
    min-width: 2rem}
  .rec-info {
    flex: 1}
  .rec-title { margin: 0, 0 0.5rem 0
    color: rgba(255, 255, 255, 0.9);
    font-size: 1rem
    font-weight: 500}
  .rec-description {
    margin: 0
   ;color: rgba(255, 255, 255, 0.7);
    font-size: 0.9rem
    line-height: 1.4}
  .rec-stats {
    display: flex
    flex-direction: column
   ;gap: 0.5rem}
  .confidence-meter,
  .priority-indicator {
    padding: 0.25rem 0.5rem
    border: 1px solid
    border-radius: 8px
    font-size: 0.75rem
    font-weight: bold
    text-align: center}
  .ai-insight { background: rgba(138, 43, 226, 0.1); border: 1px solid rgba(138, 43, 226, 0.2);
    border-radius: 6px
    padding: 0.75rem
    margin-bottom: 0.75rem}
  .insight-label {
    font-size: 0.8rem
   ;color: rgba(138, 43, 226, 0.9);
    font-weight: 500
    margin-bottom: 0.25rem}
  .insight-text {
    font-size: 0.85rem
   ;color: rgba(255, 255, 255, 0.8);
    line-height: 1.4
    font-style: italic}
  .metadata-details {
    margin-top: 0.75rem}
  .metadata-details summary {
    cursor: pointer
    font-size: 0.8rem
   ;color: rgba(255, 255, 255, 0.6);
    margin-bottom: 0.5rem}
  .metadata-content { background: rgba(0, 0, 0, 0.2);
    border-radius: 4px
    padding: 0.5rem
    margin-top: 0.5rem}
  .metadata-item {
    display: flex
    gap: 0.5rem
    margin-bottom: 0.25rem
    font-size: 0.75rem}
  .metadata-key { color: rgba(255, 255, 255, 0.6);
    min-width: 80px}
  .metadata-value { color: rgba(255, 255, 255, 0.8);
    word-break: break-word}
  .actions-list {
    display: flex
    flex-direction: column
    gap: 1rem}
  .action-card { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px
    padding: 1rem}
  .action-header {
    display: flex
    justify-content: space-between
    margin-bottom: 0.75rem}
  .action-info {
    flex: 1
    margin-right: 1rem}
  .action-title { margin: 0, 0 0.5rem 0
    color: rgba(255, 255, 255, 0.9);
    font-size: 1rem
    font-weight: 500}
  .action-description {
    margin: 0
   ;color: rgba(255, 255, 255, 0.7);
    font-size: 0.9rem
    line-height: 1.4}
  .action-meta {
    display: flex
    flex-direction: column
    gap: 0.5rem
    align-items: flex-end}
  .action-priority {
    padding: 0.25rem 0.5rem
    border: 1px solid
    border-radius: 8px
    font-size: 0.75rem
    font-weight: bold
    text-transform: uppercase}
  .action-time {
    font-size: 0.8rem
   ;color: rgba(255, 255, 255, 0.6)}
  .action-tools {
    display: flex
    flex-wrap: wrap
    gap: 0.5rem
    align-items: center
    margin-bottom: 0.75rem}
  .tools-label {
    font-size: 0.8rem
   ;color: rgba(255, 255, 255, 0.6)}
  .tool-chip {
    padding: 0.25rem 0.5rem
   ;background: rgba(255, 255, 255, 0.1);
    border-radius: 4px
    font-size: 0.75rem
   ;color: rgba(255, 255, 255, 0.8)}
  .execute-btn {
    padding: 0.5rem 1rem
   ;background: rgba(76, 175, 80, 0.2); border: 1px solid rgba(76, 175, 80, 0.4);
    border-radius: 6px
    color: #fff
    font-size: 0.85rem
    cursor: pointer
   ;transition: all 0.2s}
  .execute-btn:hover:not(:disabled) {
    background: rgba(76, 175, 80, 0.3); transform: translateY(-1px)}
  .execute-btn:disabled {
    opacity: 0.6
    cursor: not-allowed}
  .topics-tags {
    display: flex
    flex-wrap: wrap
    gap: 0.5rem}
  .topic-tag {
    padding: 0.5rem 1rem
   ;background: rgba(138, 43, 226, 0.1); border: 1px solid rgba(138, 43, 226, 0.3);
    border-radius: 16px
   ;color: rgba(255, 255, 255, 0.8);
    font-size: 0.8rem
    cursor: pointer
    transition: all 0.2s}
  .topic-tag:hover { background: rgba(138, 43, 226, 0.2);
    border-color: rgba(138, 43, 226, 0.5)}
  .empty-state {
    display: flex
    flex-direction: column
    align-items: center
    justify-content: center
    padding: 3rem
    text-align: center
   ;color: rgba(255, 255, 255, 0.7)}
  .empty-icon {
    font-size: 4rem
    margin-bottom: 1rem
    opacity: 0.5}
  .empty-state h3 { margin: 0, 0 0.5rem 0
    color: rgba(255, 255, 255, 0.9)}
  .empty-state p {
    margin: 0
    max-width: 400px
    line-height: 1.5}
  @keyframes spin {
    0% { transform: rotate(0deg)}
    100% { transform: rotate(360deg)}
  }
  @keyframes pulse {
    0%, 100% { opacity: 1}
    50% { opacity: 0.7}
  }
  /* Scrollbar styling */
  .ai-results::-webkit-scrollbar {
    width: 6px}
  .ai-results::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.2)}
  .ai-results::-webkit-scrollbar-thumb { background: rgba(138, 43, 226, 0.5);
    border-radius: 3px}
  .ai-results::-webkit-scrollbar-thumb:hover { background: rgba(138, 43, 226, 0.7)}
</style>


