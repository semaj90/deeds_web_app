<!-- Contextual Detective Board Component
     Integrates XState typing behavior with detective connection mapping
     for real-time contextual prompting. Uses Gemma embeddings pipeline
     for enhanced semantic understanding during evidence analysis. -->
<script lang="ts">
  import HeadlessTypingListener from '$lib/components/HeadlessTypingListener.svelte';
  import type { TypingContext, TypingState } from '$lib/machines/userTypingStateMachine';
  // WebSocket collaboration removed — was dead code (no WS server at port 3003)
  // Migrated to $effect

  // Props interface
  interface Props {
    caseId: string;
    initialEvidence?: unknown[];
    enableContextualPrompts?: boolean;
    enableAnalytics?: boolean;
  }

  let {
    caseId,
    initialEvidence = [],
    enableContextualPrompts = true,
    enableAnalytics = true
  }: Props = $props();

  // State
  let userInput = $state<string>('');
  let connectionMap = $state<{
    nodes?: { type: string; label: string; color: string }[];
    edges?: unknown[];
    clusters?: unknown[];
  } | null>(null);
  let isGeneratingMap = $state<boolean>(false);
  let isAnalyzing = $state<boolean>(false);
  let analysisProgress = $state<number>(0);
  let analysisMessage = $state<string>('');
  let streamingTokens = $state<string>('');
  let currentTypingState = $state<TypingState>('idle');
  let typingContext = $state<TypingContext | undefined>(undefined);
  let contextualPrompts = $state<string[]>([]);
  let detectiveAnalysis = $state<{
    keyEntities?: { name: string, type: string }[];
    suggestedConnections?: { description: string, confidence: number }[];
    anomalies?: unknown[];
    timelineGaps?: unknown[];
  } | null>(null);
  let evidenceList = $state<unknown[]>([]);
  $effect(() => { evidenceList = initialEvidence; });

  // Collaboration state (placeholder for future SSE collaboration)
  let isConnectedToCollaboration = $state<boolean>(false);
  let collaborationStats = $state({
    connectedUsers: 0,
    typingUsers: 0,
    focusDistribution: { evidence: 0, connections: 0, analysis: 0 }
  });

  // Typing behavior element binding
  let typingElement: HTMLTextAreaElement | undefined = $state(undefined);

  // Reactive derived values
  const userEngagement = $derived(typingContext?.analytics?.userEngagement ?? 'medium');
  const isTypingActive = $derived(['typing', 'contextual_processing'].includes(currentTypingState));
  const hasContextualPrompts = $derived(contextualPrompts.length > 0);

  /**
   * Initialize the component
   */
  $effect(() => {
    (async () => {
      // Load initial evidence if caseId provided
      if (caseId && evidenceList.length === 0) {
        await loadCaseEvidence();
      }

      // Initialize WebSocket collaboration
      await initializeCollaboration();
      console.log('[ContextualDetectiveBoard] Initialized for case:', caseId);
    })();

    return () => {
      // cleanup placeholder
    };
  });

  /**
   * Load case evidence from API
   */
  async function loadCaseEvidence(): Promise<void> {
    try {
      const response = await fetch(`/api/cases/${caseId}/evidence`);
      if (response.ok) {
        const data = await response.json();
        evidenceList = data.evidence || [];
      }
    } catch (error) {
      console.error('Failed to load case evidence:', error);
    }
  }

  /** Parse SSE stream from a fetch Response */
  async function readSSE(
    response: Response,
    handlers: {
      onProgress?: (d: { step: string; percentage: number; message: string }) => void;
      onToken?: (d: { token: string }) => void;
      onComplete?: (d: any) => void;
      onError?: (d: { message: string }) => void;
    }
  ): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        let event = 'message';
        let data = '';
        for (const line of part.split('\n')) {
          if (line.startsWith('event: ')) event = line.slice(7);
          else if (line.startsWith('data: ')) data = line.slice(6);
        }
        if (!data) continue;
        try {
          const parsed = JSON.parse(data);
          if (event === 'progress') handlers.onProgress?.(parsed);
          else if (event === 'token') handlers.onToken?.(parsed);
          else if (event === 'complete') handlers.onComplete?.(parsed);
          else if (event === 'error') handlers.onError?.(parsed);
        } catch { /* skip malformed */ }
      }
    }
  }

  /**
   * Initialize WebSocket collaboration (disabled — no WS server)
   */
  async function initializeCollaboration(): Promise<void> {
    console.warn('[Collaboration] WebSocket disabled — using SSE for real-time');
  }

  /**
   * Update collaboration statistics
   */
  function updateCollaborationStats() {
    // No-op: WS collaboration disabled
  }

  /**
   * Handle typing state changes from the headless listener
   */
  function handleTypingStateChange(event: CustomEvent<{ state: TypingState, context: TypingContext }>) {
    currentTypingState = event.detail.state;
    typingContext = event.detail.context;

    // Send typing updates to collaborators
    // (placeholder for future SSE collaboration)

    // Trigger detective analysis when user stops typing with substantial content
    if (currentTypingState === 'waiting_user' && userInput.length > 100) {
      triggerDetectiveAnalysis();
    }
  }

  /**
   * Handle contextual prompts from typing behavior
   */
  function handleContextualPrompt(event: CustomEvent<{ prompts: string[], context: TypingContext }>) {
    contextualPrompts = [...event.detail.prompts];

    // Add detective-specific contextual prompts
    if (userInput.toLowerCase().includes('evidence')) {
      contextualPrompts.push('Analyze evidence connections?');
    }
    if (userInput.toLowerCase().includes('suspect') || userInput.toLowerCase().includes('person')) {
      contextualPrompts.push('Map person relationships?');
    }
    if (userInput.toLowerCase().includes('location') || userInput.toLowerCase().includes('place')) {
      contextualPrompts.push('Generate location timeline?');
    }
  }

  /**
   * Handle analytics updates from typing behavior
   */
  function handleAnalyticsUpdate(event: CustomEvent<{ data: any }>) {
    if (enableAnalytics) {
      console.log('[ContextualDetectiveBoard] Analytics update:', event.detail.data);
    }
  }

  /**
   * Trigger detective analysis via SSE streaming endpoint
   */
  async function triggerDetectiveAnalysis(): Promise<void> {
    if (!userInput.trim() || isAnalyzing) return;

    isAnalyzing = true;
    analysisProgress = 0;
    analysisMessage = 'Starting analysis...';
    streamingTokens = '';

    try {
      const response = await fetch('/api/detective/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          text: userInput,
          evidence: evidenceList
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      await readSSE(response, {
        onProgress(d) {
          analysisProgress = d.percentage;
          analysisMessage = d.message;
        },
        onToken(d) {
          streamingTokens += d.token;
        },
        onComplete(d) {
          detectiveAnalysis = d;
          analysisProgress = 100;
          analysisMessage = 'Analysis complete';
          const enhancedPrompts = generateEnhancedPrompts(detectiveAnalysis);
          contextualPrompts = [...contextualPrompts, ...enhancedPrompts];
        },
        onError(d) {
          console.error('Detective analysis error:', d.message);
          analysisMessage = `Error: ${d.message}`;
        }
      });
    } catch (error) {
      console.error('Detective analysis failed:', error);
      analysisMessage = 'Analysis failed — check server connection';
    } finally {
      isAnalyzing = false;
    }
  }

  /**
   * Generate detective connection map via SSE streaming endpoint
   */
  async function generateConnectionMap(): Promise<void> {
    if (!caseId || isGeneratingMap) return;

    isGeneratingMap = true;
    analysisProgress = 0;
    analysisMessage = 'Generating connection map...';

    try {
      const response = await fetch('/api/detective/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          focusTypes: ['people', 'evidence', 'locations', 'events'],
          connectionStrength: 0.4,
          maxDepth: 3,
          context: userInput || undefined
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      await readSSE(response, {
        onProgress(d) {
          analysisProgress = d.percentage;
          analysisMessage = d.message;
        },
        onComplete(d) {
          connectionMap = d.connectionMap;
          analysisProgress = 100;
          analysisMessage = `Map complete: ${d.metadata?.nodeCount ?? 0} nodes, ${d.metadata?.edgeCount ?? 0} edges`;
        },
        onError(d) {
          console.error('Connection map error:', d.message);
          analysisMessage = `Error: ${d.message}`;
        }
      });
    } catch (error) {
      console.error('Failed to generate connection map:', error);
      analysisMessage = 'Connection map failed — check server connection';
    } finally {
      isGeneratingMap = false;
    }
  }

  /**
   * Generate enhanced prompts based on detective analysis
   */
  function generateEnhancedPrompts(analysis: typeof detectiveAnalysis): string[] {
    const prompts: string[] = [];

    if (analysis?.keyEntities && analysis.keyEntities.length > 0) {
      prompts.push(`Found ${analysis.keyEntities.length} key entities - explore connections?`);
    }
    if (analysis?.suggestedConnections && analysis.suggestedConnections.length > 0) {
      prompts.push('New connection patterns detected - visualize them?');
    }
    if (analysis?.anomalies && analysis.anomalies.length > 0) {
      prompts.push(`${analysis.anomalies.length} anomalies detected - investigate?`);
    }
    if (analysis?.timelineGaps && analysis.timelineGaps.length > 0) {
      prompts.push('Timeline gaps found - fill missing evidence?');
    }

    return prompts;
  }

  /**
   * Handle contextual prompt selection
   */
  async function selectContextualPrompt(prompt: string): Promise<void> {
    // Clear current prompts
    contextualPrompts = [];

    // Execute the selected prompt action
    if (prompt.includes('connection')) {
      await generateConnectionMap();
    } else if (prompt.includes('evidence')) {
      await loadCaseEvidence();
    } else if (prompt.includes('analyze')) {
      await triggerDetectiveAnalysis();
    }

    // Add the prompt as user input for continuity
    userInput += `\n\n[Selected: ${prompt}]`;
  }

  /**
   * Clear user input and reset state
   */
  function clearInput() {
    userInput = '';
    contextualPrompts = [];
    detectiveAnalysis = null;
  }
</script>

<!-- Headless typing listener for behavior tracking -->
<HeadlessTypingListener
  bind:text={userInput}
  bind:element={typingElement}
  {enableContextualPrompts}
  {enableAnalytics}
  onstateChange={handleTypingStateChange}
  oncontextualPrompt={handleContextualPrompt}
  onanalyticsUpdate={handleAnalyticsUpdate}
/>

<div class="contextual-detective-board">
  <!-- Header with case info and analytics -->
  <header class="board-header">
    <div class="case-info">
      <h1>Detective Analysis Board</h1>
      <p class="case-id">Case {caseId}</p>
    </div>

    {#if enableAnalytics && typingContext}
      <div class="analytics-panel">
        <div class="metric">
          <span class="label">State:</span>
          <span class="value">{currentTypingState}</span>
        </div>
        <div class="metric">
          <span class="label">Engagement:</span>
          <span class="value">{userEngagement}</span>
        </div>
        <div class="metric">
          <span class="label">Evidence:</span>
          <span class="value">{evidenceList.length}</span>
        </div>

        <!-- Collaboration status -->
        {#if isConnectedToCollaboration}
          <div class="metric">
            <span class="label">Live:</span>
            <span class="value">{collaborationStats.connectedUsers} users</span>
          </div>
          {#if collaborationStats.typingUsers > 0}
            <div class="metric">
              <span class="label">Typing:</span>
              <span class="value">{collaborationStats.typingUsers}</span>
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  </header>

  <!-- Main analysis area -->
  <main class="analysis-area">
    <!-- User input area with typing behavior tracking -->
    <section class="input-section">
      <div class="input-header">
        <h2>Analysis Input</h2>
        <div class="typing-indicator" class:active={isTypingActive}>
          {isTypingActive ? 'Analyzing...' : 'Ready'}
        </div>
      </div>

      <textarea
        bind:this={typingElement}
        bind:value={userInput}
        placeholder="Describe evidence, observations, or questions about this case..."
        class="analysis-input"
        rows="8"
      ></textarea>

      <div class="input-actions">
        <button type="button" onclick={triggerDetectiveAnalysis} disabled={isAnalyzing || !userInput.trim()}>
          {isAnalyzing ? 'Analyzing...' : 'Analyze'}
        </button>
        <button type="button" onclick={generateConnectionMap} disabled={isGeneratingMap}>
          {isGeneratingMap ? 'Generating...' : 'Connection Map'}
        </button>
        <button type="button" onclick={clearInput}>Clear</button>
      </div>

      <!-- Progress bar -->
      {#if analysisProgress > 0 && analysisProgress < 100}
        <div class="progress-bar-container">
          <div class="progress-bar" style="width: {analysisProgress}%"></div>
          <span class="progress-label">{analysisMessage}</span>
        </div>
      {/if}
    </section>

    <!-- Contextual prompts display -->
    {#if hasContextualPrompts}
      <section class="contextual-prompts">
        <h3>Contextual Suggestions</h3>
        <div class="prompts-list">
          {#each contextualPrompts as prompt}
            <button type="button" class="prompt-button" onclick={() => selectContextualPrompt(prompt)}>
              {prompt}
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Connection map visualization -->
    {#if connectionMap}
      <section class="connection-map">
        <h3>Connection Map</h3>
        <div class="map-stats">
          <span>Nodes: {connectionMap.nodes?.length ?? 0}</span>
          <span>Edges: {connectionMap.edges?.length ?? 0}</span>
          <span>Clusters: {connectionMap.clusters?.length ?? 0}</span>
        </div>
        <div class="map-visualization">
          <!-- Simple visualization - replace with actual graph library -->
          <div class="nodes-preview">
            {#each (connectionMap.nodes || []).slice(0, 10) as node}
              <div class="node-item" style="background-color: {node.color}">
                <span class="node-type">{node.type}</span>
                <span class="node-label">{node.label}</span>
              </div>
            {/each}
          </div>
        </div>
      </section>
    {/if}

    <!-- Detective analysis results -->
    {#if detectiveAnalysis}
      <section class="detective-analysis">
        <h3>Analysis Results</h3>
        <div class="analysis-content">
          {#if detectiveAnalysis.keyEntities}
            <div class="entities">
              <h4>Key Entities</h4>
              <ul>
                {#each detectiveAnalysis.keyEntities as entity}
                  <li>{entity.name} ({entity.type})</li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if detectiveAnalysis.suggestedConnections}
            <div class="connections">
              <h4>Suggested Connections</h4>
              <ul>
                {#each detectiveAnalysis.suggestedConnections as connection}
                  <li>{connection.description} (confidence: {connection.confidence})</li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      </section>
    {/if}
  </main>
</div>


<style>
  .contextual-detective-board {
    display: flex;
    flex-direction: column;
	height: 100vh;
    background: #f8fafc;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .board-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
	padding: 1rem 2rem;
    background: white;
    border-bottom: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .case-info h1 {
    margin: 0;
    font-size: 1.5rem;
	color: #1e293b;
  }

  .case-id {
    margin: 0.25rem 0 0 0;
    color: #64748b;
    font-size: 0.875rem;
  }

  .analytics-panel { display: flex;
		gap: 1.5rem;
  }

  .metric {
    display: flex;
    flex-direction: column;
    align-items: center;
	gap: 0.25rem;
  }

  .metric .label {
    font-size: 0.75rem;
	color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .metric .value {
    font-weight: 600;
    font-size: 0.875rem;
  }

  .analysis-area { flex: 1;
		padding: 2rem;
    overflow-y: auto;
	display: flex;
    flex-direction: column;
	gap: 2rem;
  }

  .input-section {
    background: white;
    border-radius: 0.5rem;
	padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .progress-bar-container {
    position: relative;
    margin-top: 0.75rem;
    height: 1.5rem;
    background: #f1f5f9;
    border-radius: 0.375rem;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background: #3b82f6;
    border-radius: 0.375rem;
    transition: width 0.3s ease;
  }

  .progress-label {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 500;
    color: #1e293b;
    pointer-events: none;
  }

  .input-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .input-header h2 {
    margin: 0;
    font-size: 1.25rem;
	color: #1e293b;
  }

  .typing-indicator {
    padding: 0.25rem 0.75rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 500;
	color: #64748b;
    background: #f1f5f9;
	transition:all 0.2s;
  }

  .typing-indicator.active { color: #059669;
		background: #dcfce7;
  }

  .analysis-input { width: 100%;
		padding: 1rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 1rem;
    line-height: 1.5;
	resize: vertical;
    font-family: inherit;
  }

  .analysis-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .input-actions { display: flex;
		gap: 1rem;
    margin-top: 1rem;
  }

  .input-actions button {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.375rem;
    font-weight: 500;
	cursor: pointer;
    transition:all 0.2s;
  }

  .input-actions button:first-child { background: #3b82f6;
		color: white;
  }

  .input-actions button:first-child:hover:not(:disabled) {
    background: #2563eb;
  }

  .input-actions button:first-child:disabled { background: #9ca3af;
		cursor: not-allowed;
  }

  .input-actions button:last-child { background: #f3f4f6;
		color: #374151;
  }

  .input-actions button:last-child:hover {
    background: #e5e7eb;
  }

  .contextual-prompts {
    background: white;
    border-radius: 0.5rem;
	padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .contextual-prompts h3 {
    margin: 0 0 1rem 0;
    font-size: 1.125rem;
	color: #1e293b;
  }

  .prompts-list {
    display: flex;
    flex-wrap: wrap;
	gap: 0.5rem;
  }

  .prompt-button {
    padding: 0.5rem 1rem;
    background: #f0f9ff;
	color: #0369a1;
    border: 1px solid #0ea5e9;
    border-radius: 1rem;
    font-size: 0.875rem;
	cursor: pointer;
    transition:all 0.2s;
  }

  .prompt-button:hover { background: #0ea5e9;
		color: white;
  }

  .connection-map,
  .detective-analysis {
    background: white;
    border-radius: 0.5rem;
	padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .connection-map h3,
  .detective-analysis h3 {
    margin: 0 0 1rem 0;
    font-size: 1.125rem;
	color: #1e293b;
  }

  .map-stats { display: flex;
		gap: 1rem;
    margin-bottom: 1rem;
    font-size: 0.875rem;
	color: #64748b;
  }

  .nodes-preview {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .node-item {
    padding: 0.75rem;
    border-radius: 0.375rem;
	color: white;
    font-size: 0.875rem;
  }

  .node-type {
    display: block;
    font-weight: 600;
    text-transform: uppercase;
    font-size: 0.75rem;
	opacity: 0.9;
  }

  .node-label {
    display: block;
    margin-top: 0.25rem;
  }

  .analysis-content {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
  }

  .entities h4,
  .connections h4 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
	color: #374151;
  }

  .entities ul,
  .connections ul {
    margin: 0;
    padding-left: 1.25rem;
  }

  .entities li,
  .connections li {
    margin-bottom: 0.25rem;
	color: #4b5563;
  }
</style>
