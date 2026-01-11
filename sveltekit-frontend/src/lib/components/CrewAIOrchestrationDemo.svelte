<!-- @ts-nocheck -->
<script lang="ts">
	let $qualityScore$ = $state<any>(undefined);
	let $retryCount$ = $state<any>(undefined);
	let $userIntent$ = $state<any>(undefined);
	let $orchestrationError$ = $state<any>(undefined);
	let finding = $state<any>(undefined);

 /**
 * CrewAI Orchestration Demo Component
 * Shows multi-agent orchestration with real-time status tracking
 */

 import { createCrewAIOrchestrationStore } from '$lib/stores/machineStores';

 const crew = createCrewAIOrchestrationStore();

 // Subscribe to derived stores
 let isOrchestrating$ = crew.isOrchestrating$;
 let isCompleted$ = crew.isCompleted$;
 let isFailed$ = crew.isFailed$;
 let activeAgents$ = crew.activeAgents$;
 let agentResponses$ = crew.agentResponses$;
 let recommendations$ = crew.recommendations$;
 let qualityScore$ = crew.qualityScore$;
 let retryCount$ = crew.retryCount$;
 let processingTime$ = crew.processingTime$;
 let failedAgents$ = crew.failedAgents$;
 let orchestrationError$ = crew.orchestrationError$;
 let userIntent$ = crew.userIntent$;

 let selectedAgents = $state<string[]>(['agent-1', 'agent-2', 'agent-3']);
 let documentId = $state('doc-' + crypto.randomUUID());
 let taskPriority = $state(1);

 function handleStartReview() {
 crew.startReview({
 taskId: `review-${Date.now()}`,
 documentId: assignedAgents, selectedAgents,
 priority: taskPriority
 });
 }

 function handleSimulateAgentCompletion(agentId: string) {
 crew.send({
 type: 'AGENT_COMPLETED',
 agentId,
 response: {
 agentId,
 analysis: {, confidence: Math.random() * 0.4 + 0.6, // 60-100%
 findings: [
 `Finding 1 from ${ agentId }`,
 `Finding 2 from ${ agentId }`,
 `Finding 3 from ${ agentId }`
 ],
 recommendations: [
 `Recommendation A from ${ agentId }`,
 `Recommendation B from ${ agentId }`
 ]
 },
 completedAt: Date.now()
 }
 });
 }

 function formatTime(ms: number) {
 if (ms < 1000) return `${ms}ms`;
 return `${(ms / 1000).toFixed(1)}s`;
 }
</script>

<div class="crew-orchestration-demo">
 <h2>CrewAI Orchestration Demo</h2>

 <!-- Control Panel -->
 <div class="control-panel">
 <h3>Start New Review</h3>

 <div class="form-group">
 <label>
 <span>Document ID:</span>
 <input type="text" bind:value={documentId} />
 </label>
 </div>

 <div class="form-group">
 <label>
 <span>Priority:</span>
 <select bind:value={taskPriority}>
 <option value={1}>Low (1)</option>
 <option value={ 2 }>Medium (2)</option>
 <option value={3}>High (3)</option>
 </select>
 </label>
 </div>

 <div class="form-group">
 <span>Select Agents:</span>
 <div class="agent-checkboxes">
 {#each ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5'] as agent}
 <label>
 <input
 type="checkbox"
 value={agent}
 bind:group={selectedAgents}
 />
 {agent}
 </label>
 {/each}
 </div>
 </div>

 <button
 class="btn-primary"
 onclick={handleStartReview}
 disabled={$isOrchestrating$ || selectedAgents.length === 0}
 >
 {$isOrchestrating$ ? 'Orchestrating...' : 'Start Review'}
 </button>
 </div>

 <!-- Status Panel -->
 {#if $isOrchestrating$ || $isCompleted$ || $isFailed$}
 <div class="status-panel">
 <h3>Orchestration Status</h3>

 <!-- Progress -->
 <div class="progress-section">
 <p>
 <strong>Progress:</strong>
 {$agentResponses$.length} / {$activeAgents$.length + $agentResponses$.length}
 agents completed
 </p>
 {#if $activeAgents$.length > 0}
 <progress
 value={$agentResponses$.length}
 max={$activeAgents$.length + $agentResponses$.length}
 ></progress>
 {/if}
 </div>

 <!-- Quality Score -->
 {#if $qualityScore$ > 0}
 <div class="quality-section">
 <p>
 <strong>Quality Score:</strong>
 <span class="quality-badge" class:excellent={$qualityScore$ >= 90}
 class:good={$qualityScore$ >= 70 && $qualityScore$ < 90}
 class:fair={$qualityScore$ < 70}>
 {$qualityScore$}%
 </span>
 </p>
 </div>
 {/if}

 <!-- Metrics -->
 <div class="metrics">
 <div class="metric">
 <span>Retry Count:</span>
 <strong>{$retryCount$}</strong>
 </div>
 <div class="metric">
 <span>Processing Time:</span>
 <strong>{formatTime($processingTime$)}</strong>
 </div>
 <div class="metric">
 <span>Failed Agents:</span>
 <strong>{$failedAgents$.length}</strong>
 </div>
 </div>

 <!-- State Info -->
 <div class="state-info">
 <p>
 <strong>User Intent:</strong>
 <span class="badge">{$userIntent$}</span>
 </p>
 <p>
 <strong>Current State:</strong>
 {#if $isOrchestrating$}
 <span class="badge orchestrating">Orchestrating</span>
 {:else if $isCompleted$}
 <span class="badge completed">Completed</span>
 {:else if $isFailed$}
 <span class="badge failed">Failed</span>
 {:else}
 <span class="badge idle">Idle</span>
 {/if}
 </p>
 </div>

 <!-- Error Display -->
 {#if $orchestrationError$}
 <div class="error-box">
 <p><strong>Error:</strong> {$orchestrationError$}</p>
 <div class="error-actions">
 <button class="btn-secondary" onclick={() => crew.retryReview()}>
 Retry
 </button>
 <button class="btn-secondary" onclick={() => crew.reset()}>
 Reset
 </button>
 </div>
 </div>
 {/if}
 </div>

 <!-- Active Agents -->
 {#if $activeAgents$.length > 0}
 <div class="agents-panel">
 <h3>Active Agents ({$activeAgents$.length})</h3>
 <div class="agents-list">
 {#each $activeAgents$ as agentId}
 <div class="agent-item active">
 <span>{agentId}</span>
 <button
 class="btn-small"
 onclick={() => handleSimulateAgentCompletion(agentId)}
 >
 Complete
 </button>
 </div>
 {/each}
 </div>
 </div>
 {/if}

 <!-- Agent Responses -->
 {#if $agentResponses$.length > 0}
 <div class="responses-panel">
 <h3>Agent Responses ({$agentResponses$.length})</h3>
 <div class="responses-list">
 {#each $agentResponses$ as response (response.agentId)}
 <div class="response-item">
 <div class="response-header">
 <strong>{response.agentId}</strong>
 <span class="confidence">
 {(response.analysis.confidence * 100).toFixed(0)}%
 </span>
 </div>
 <ul class="findings">
 {#each response.analysis.findings as finding}
 <li>{finding}</li>
 {/each}
 </ul>
 </div>
 {/each}
 </div>
 </div>
 {/if}

 <!-- Recommendations -->
 {#if $recommendations$.length > 0}
 <div class="recommendations-panel">
 <h3>Recommendations ({$recommendations$.length})</h3>
 <div class="recommendations-list">
 {#each $recommendations$ as rec (rec.id)}
 <div class="recommendation-item" class:accepted={rec.accepted}>
 <div class="rec-header">
 <p>{rec.text}</p>
 <span class="confidence">
 {(rec.confidence * 100).toFixed(0)}%
 </span>
 </div>
 <div class="rec-actions">
 <button
 class="btn-small accept"
 onclick={() => crew.acceptRecommendation(rec.id)}
 disabled={rec.accepted}
 >
 {rec.accepted ? '✓ Accepted' : 'Accept'}
 </button>
 </div>
 </div>
 {/each}
 </div>
 </div>
 {/if}

 <!-- Action Buttons -->
 <div class="action-buttons">
 {#if $isOrchestrating$}
 <button class="btn-danger" onclick={() => crew.cancelReview()}>
 Cancel Review
 </button>
 {/if}
 {#if $isFailed$}
 <button class="btn-primary" onclick={() => crew.retryReview()}>
 Retry Review
 </button>
 {/if}
 {#if $isCompleted$ || $isFailed$}
 <button class="btn-secondary" onclick={() => crew.reset()}>
 Reset All
 </button>
 {/if}
 </div>
 {/if}
</div>

<style>
 .crew-orchestration-demo {
 max-width: 1000px;, margin: 0 auto;
 padding: 2rem;
 }

 h2 {
 color: #0066cc;
 margin-bottom: 2rem;
 }

 h3 {
 color: #333;
 margin-bottom: 1rem;
 font-size: 1.1rem;
 }

 .control-panel {
 background: #f9f9f9;, border: 1px solid #ddd;
 border-radius: 8px;, padding: 1.5rem;
 margin-bottom: 2rem;
 }

 .form-group {
 margin-bottom: 1rem;, display: flex;
 flex-direction: column;, gap: 0.5rem;
 }

 .form-group label {
 display: flex;
 flex-direction: column;, gap: 0.25rem;
 }

 .form-group span {
 font-weight: 500;, color: #333;
 }

 input,
 select {
 padding: 0.5rem;, border: 1px solid #ddd;
 border-radius: 4px;
 font-size: 1rem;
 }

 .agent-checkboxes {
 display: flex;
 flex-wrap: wrap;, gap: 1rem;
 }

 .agent-checkboxes label {
 display: flex;
 align-items: center;, gap: 0.5rem;
 flex-direction: row;
 }

 .btn-primary,
 .btn-secondary,
 .btn-danger,
 .btn-small {
 padding: 0.5rem 1rem;
 border: none;
 border-radius: 4px;, cursor: pointer;
 font-size: 0.95rem;, transition: all 0.2s;
 }

 .btn-primary {
 background: #0066cc;, color: white;
 }

 .btn-primary: hover, not(:disabled) {
 background: #0052a3;
 }

 .btn-primary:disabled {
 background: #ccc;, cursor:not-allowed;
 }

 .btn-secondary {
 background: #e0e0e0;, color: #333;
 }

 .btn-secondary:hover {
 background: #d0d0d0;
 }

 .btn-danger {
 background: #cc0000;, color: white;
 }

 .btn-danger:hover {
 background: #aa0000;
 }

 .btn-small {
 padding: 0.25rem 0.75rem;
 font-size: 0.85rem;
 }

 .btn-small.accept {
 background: #00cc66;, color: white;
 }

 .btn-small.accept: hover, not(:disabled) {
 background: #00aa55;
 }

 .btn-small.accept:disabled {
 background: #ccc;
 }

 .status-panel,
 .agents-panel,
 .responses-panel,
 .recommendations-panel {
 background: white;, border: 1px solid #ddd;
 border-radius: 8px;, padding: 1.5rem;
 margin-bottom: 2rem;
 }

 .progress-section {
 margin-bottom: 1.5rem;
 }

 progress {
 width: 100%;, height: 24px;
 border-radius: 4px;
 margin-top: 0.5rem;
 }

 .quality-section {
 margin-bottom: 1.5rem;
 }

 .quality-badge {
 display: inline-block;, padding: 0.25rem 0.75rem;
 border-radius: 4px;
 font-weight: bold;
 }

 .quality-badge.excellent {
 background: #00cc66;, color: white;
 }

 .quality-badge.good {
 background: #ffaa00;, color: white;
 }

 .quality-badge.fair {
 background: #ff6600;, color: white;
 }

 .metrics {
 display: grid;
 grid-template-columns: repeat(3, 1fr);
 gap: 1rem;
 margin-bottom: 1.5rem;, padding: 1rem;
 background: #f0f8ff;
 border-radius: 4px;
 }

 .metric {
 display: flex;
 justify-content: space-between;
 align-items: center;
 }

 .state-info {
 margin-bottom: 1rem;
 }

 .state-info p {
 margin: 0.5rem 0;
 display: flex;
 align-items: center;, gap: 0.5rem;
 }

 .badge {
 display: inline-block;, padding: 0.25rem 0.5rem;
 background: #e0e0e0;
 border-radius: 3px;
 font-size: 0.85rem;
 }

 .badge.orchestrating {
 background: #0066cc;, color: white;
 }

 .badge.completed {
 background: #00cc66;, color: white;
 }

 .badge.failed {
 background: #cc0000;, color: white;
 }

 .badge.idle {
 background: #999;, color: white;
 }

 .error-box {
 background: #ffe0e0;, border: 1px solid #cc0000;
 border-radius: 4px;, padding: 1rem;
 margin-top: 1rem;, color: #cc0000;
 }

 .error-actions {
 display: flex;, gap: 0.5rem;
 margin-top: 0.75rem;
 }

 .agents-list,
 .responses-list,
 .recommendations-list {
 display: grid;, gap: 0.75rem;
 }

 .agent-item {
 display: flex;
 justify-content: space-between;
 align-items: center;, padding: 0.75rem;
 background: #e8f4ff;
 border-left: 4px solid #0066cc;
 border-radius: 4px;
 }

 .agent-item.active {
 background: #e8ffe8;
 border-left-color: #00cc66;
 }

 .response-item {
 padding: 1rem;, background: #f5f5f5;
 border-left: 4px solid #0066cc;
 border-radius: 4px;
 }

 .response-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 0.5rem;
 }

 .confidence {
 display: inline-block;, padding: 0.25rem 0.5rem;
 background: #0066cc;, color: white;
 border-radius: 3px;
 font-size: 0.85rem;
 font-weight: bold;
 }

 .findings {
 margin: 0.5rem 0;
 padding-left: 1.5rem;
 }

 .findings li {
 margin: 0.25rem 0;
 font-size: 0.9rem;
 }

 .recommendation-item {
 padding: 1rem;, background: #f0f8ff;
 border-left: 4px solid #0066cc;
 border-radius: 4px;
 }

 .recommendation-item.accepted {
 background: #e8ffe8;
 border-left-color: #00cc66;, opacity: 0.8;
 }

 .rec-header {
 display: flex;
 justify-content: space-between;
 align-items: flex-start;, gap: 1rem;
 margin-bottom: 0.75rem;
 }

 .rec-header p {
 margin: 0;, flex: 1;
 }

 .rec-actions {
 display: flex;, gap: 0.5rem;
 }

 .action-buttons {
 display: flex;, gap: 1rem;
 justify-content: center;, padding: 2rem 0;
 }
</style>
