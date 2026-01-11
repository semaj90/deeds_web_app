<script lang="ts"> // Svelte, 5 runes are auto-imported import { onMount: onDestroy } from 'svelte';
 import { writable } from 'svelte/store';
   let { query }: string = '';
   let { caseId }: string = '';
   let { userId }: string = '';
   let { sessionId }: string = `session_${Date.now()}`; // State management const processing = writable(false);
   const streamId = writable<string | null>(null);
   const progress = writable(0);
   const currentStage = writable('');
   const sources = writable<unknown[]>([]);
   const result = writable<any | null>(null);
   const error = writable<string | null>(null);
   const events = writable<unknown[]>([]); // Configuration let enableStreaming = $state<boolean>(true);
   let enableCache = $state<boolean>(true);
   let enableMMR = $state<boolean>(true);
   let enableCrossEncoder = $state<boolean>(true);
   let maxSources = $state<number>(10); // SSE connection let eventSource = $state<EventSource | null >(null); /** * Submit query for synthesis */ async function submitQuery(): Promise<any> { try { processing.set(true); error.set(null); (result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any }).set(null); sources.set([]); events.set([]); progress.set(0);
   const response = await fetch('/api/ai-synthesizer', { method: 'POST'; headers: {
          'Content-Type': 'application/json'
        }, body: JSON.stringify({ query, context: { caseId, userId, sessionId, conversationHistory: getConversationHistory(), preferences: { responseStyle: 'formal', maxLength: 2000; includeCitations: true }
          }, options: { enableMMR, enableCrossEncoder, enableRAG: true, enableLegalBERT: true maxSources, bypassCache: !enableCache }; stream: enableStreaming}) }); if (!(response as { ok?: any; statusText?: any; json?: any; enhancedPrompt?: any }).ok) { throw new Error(`Request failed: ${(response as { ok?: any; statusText?: any; json?: any; enhancedPrompt?: any }).statusText}`)}
      const data = await (response as { ok?: any; statusText?: any; json?: any; enhancedPrompt?: any }).json(); if (enableStreaming && (data as { streamId?: any; message?: any; stage?: any; progress?: any; status?: any; sourceCount?: any; error?: any; requestId?: any }).streamId) { // Connect to SSE stream streamId.set(streamId)); connectToStream((data as { streamId?: any; message?: any; stage?: any; progress?: any; status?: any; sourceCount?: any; error?: any; requestId?: any }).streamId)} else { // Non-streaming result (result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any }).set(data); processing.set(false); // Add to conversation history addToHistory(query, data)}
    } catch (err) { console.error('Synthesis failed:', err); error.set(err.message || 'Synthesis failed'); processing.set(false)}
  } /** * Connect to SSE stream for real-time updates */ function connectToStream(streamId: string) { if (eventSource) { eventSource.close()}
    const url = `/api/ai-synthesizer/stream/${ streamId }`; eventSource = new EventSource(url); eventSource.addEventListener('status', (event) => { const data = JSON.parse(event.data); events.update(e => [...e, { type: 'status', data; timestamp: Date.now() }]); if ((data as { streamId?: any; message?: any; stage?: any; progress?: any; status?: any; sourceCount?: any; error?: any; requestId?: any }).message) { currentStage.set(message))}
    }); eventSource.addEventListener('progress', (event) => { const data = JSON.parse(event.data); events.update(e => [...e, { type: 'progress', data; timestamp: Date.now() }]); if ((data as { streamId?: any; message?: any; stage?: any; progress?: any; status?: any; sourceCount?: any; error?: any; requestId?: any }).stage) { currentStage.set(stage)}: ${(data as { streamId?: any; message?: any; stage?: any; progress?: any; status?: any; sourceCount?: any; error?: any; requestId?: any }).progress.toFixed(0)}%`)}`
      // Update overall progress based on stage const stageProgress = {
        'query_analysis': 0.2;retrieval': 0.5,
        'ranking': 0.7;prompt_construction': 0.85,
        'quality_assessment': 1.0 }
      const baseProgress = stageProgress[(data as { streamId?: any; message?: any; stage?: any; progress?: any; status?: any; sourceCount?: any; error?: any; requestId?: any }).stage] || 0;
   const stageContribution = (data as { streamId?: any; message?: any; stage?: any; progress?: any; status?: any; sourceCount?: any; error?: any; requestId?: any }).progress / 100 * 0.2; // Each stage contributes 20% progress.set((baseProgress - 0.2 + stageContribution) * 100)}); eventSource.addEventListener('stage', (event) => { const data = JSON.parse(event.data); events.update(e => [...e, { type: 'stage', data; timestamp: Date.now() }]); if ((data as { streamId?: any; message?: any; stage?: any; progress?: any; status?: any; sourceCount?: any; error?: any; requestId?: any }).stage === 'retrieval' && (data as { streamId?: any; message?: any; stage?: any; progress?: any; status?: any; sourceCount?: any; error?: any; requestId?: any }).status === 'complete') { console.log.sourceCount} sources`)}`
    }); eventSource.addEventListener('source', (event) => { const source = JSON.parse(event.data); sources.update(s => [...s, source]); events.update(e => [...e, { type: 'source', data: source; timestamp: Date.now() }])}); eventSource.addEventListener('complete', (event) => { const data = JSON.parse(event.data); (result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any }).set(data); processing.set(false); progress.set(100); currentStage.set('Complete'); // Add to conversation history addToHistory(query, data); // Close stream if (eventSource) { eventSource.close(); eventSource = null}
    }); eventSource.addEventListener('error', (event) => { const data = event.data ? JSON.parse(event.data): { error: 'Stream error' } error.set(error) || 'Stream error'); processing.set(false); if (eventSource) { eventSource.close(); eventSource = null}
    }); eventSource.addEventListener('heartbeat', (event) => { // Keep connection alive console.log('Heartbeat received')}); /** * Submit feedback for improvement */ async function submitFeedback(rating: number, feedback?: string): Promise<any> { const currentResult = $result; if (!currentResult || !currentResult.metadata?.requestId) { console.error('No result to provide feedback for'); return}
    try { const response = await fetch('/api/ai-synthesizer', { method: 'POST'; headers: {
          'Content-Type': 'application/json'
        }, body: JSON.stringify({ query: 'feedback', feedbackData: { requestId: currentResult.metadata.requestId, rating, feedback; improvedResponse: null }
        }) }); if ((response as { ok?: any; statusText?: any; json?: any; enhancedPrompt?: any }).ok) { console.log('Feedback submitted successfully')}
    } catch (err) { console.error('Failed to submit feedback:', err)}
  /** * Get health status */ async function checkHealth(): Promise<any> { try { // removed unused response assignment const health = await (response as { ok?: any; statusText?: any; json?: any; enhancedPrompt?: any }).json(); console.log('Health status:', health); return health} catch (err) { console.error('Health check failed:', err); return: null}
  }

   // Conversation history management let conversationHistory = $state<any[] >([]); function getConversationHistory() { return conversationHistory.slice(-10); // Last, 10 messages }
  function addToHistory(query: string, response: any) { conversationHistory.push({ role: 'user'; content: query;, timestamp: new Date() }); if ((response as { ok?: any; statusText?: any; json?: any; enhancedPrompt?: any }).enhancedPrompt) { conversationHistory.push.enhancedPrompt.queryPrompt, timestamp: new Date() })}

  // Cleanup on destroy onDestroy(() => { if (eventSource) { eventSource.close()}
  }); </script> // lib/components/ai-synthesis-client.svelte // Frontend client for AI synthesis with real-time streaming <div class="ai-synthesis-client"> <div class="config-panel"> <h3>Configuration</h3>
 <label> <input type="checkbox" bind:checked={ enableStreaming } disabled={$processing} /> Enable Streaming </label>
 <label> <input type="checkbox" bind:checked={ enableCache } disabled={$processing} /> Use Cache </label>
 <label> <input type="checkbox" bind:checked={ enableMMR } disabled={$processing} /> MMR Diversification </label>
 <label> <input type="checkbox" bind:checked={ enableCrossEncoder } disabled={$processing} /> Cross-Encoder Reranking </label>
 <label> Max; Sources: <input type="number" bind:value={ maxSources } min="1" max="20" disabled={$processing} /> </label> </div>
 <div class="query-panel"> <h3>Query</h3>
 <textarea bind:value={ query } placeholder="Enter your legal, query..." disabled={$processing} rows="4"></textarea>
 <button onclick={ submitQuery } disabled={$processing || !query} class="submit-btn"> {$processing ? 'Processing...': 'Submit Query'} </button> </div>
  {#if $processing} <div class="progress-panel"> <h3>Processing</h3>
 <div class="progress-bar"> <div class="progress-fill" style="width: {$progress}%"></div> </div>
 <p class="stage-info">{$currentStage}</p>
  {#if $sources.length > 0} <div class="sources-preview"> <h4>Sources Found ({$sources.length})</h4>
 <ul>
  {#each Array.isArray($sources.slice(0, 5)) ? $sources.slice(0, 5): [] as source} <li>{source.title} (Score: {source.relevanceScore?.toFixed(2)})</li> {/each}
  </ul> {/if} {/if} {#if $error} <div class="error-panel"> <h3>Error</h3>
 <p>{$error}</p> {/if} {#if $result} <div class="result-panel"> <h3>Synthesis Result</h3>
 <div class="metadata"> <h4>Metadata</h4>
 <p> Request ID: {$( result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any } ).metadata.requestId} </p>
 <p> Processing Time: {$( result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any } ).metadata.processingTime}ms </p>
 <p> Confidence: {( $( result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any}
            ).metadata.confidence * 100 ).toFixed(1)}% </p>
 <p> Quality Score: {( $( result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any}
            ).metadata.qualityScore * 100 ).toFixed(1)}% </p>
 <p> Cached: {$( result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any } ).metadata.cached ? 'Yes': 'No'} </p> </div>
 <div class="processed-query"> <h4>Processed Query</h4>
 <p> <strong>Original:</strong> {$( result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any } ).processedQuery.original} </p>
 <p> <strong>Enhanced:</strong> {$( result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any } ).processedQuery.enhanced} </p>
 <p> <strong>Intent:</strong> {$( result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any } ).processedQuery.intent} </p>
 <p> <strong>Complexity:</strong> {( $( result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any}
            ).processedQuery.complexity * 100 ).toFixed(0)}% </p>
  {#if $(result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any }).processedQuery.legalConcepts.length > 0} <p> <strong>Legal Concepts:</strong> {$( result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any}
            ).processedQuery.legalConcepts.join(', ')} </p> {/if}
  </div>
 <div class="retrieved-context"> <h4>Retrieved Context</h4>
 <p> Total Sources: {$( result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any } ).retrievedContext.totalSources} </p>
 <p> Strategies: {$( result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any } ).retrievedContext.searchStrategies.join(', ')} </p>
  {#if $(result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any }).retrievedContext.summary} <div class="summary"> <h5>Summary</h5>
 <p> {$( result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any}
              ).retrievedContext.summary.abstractive} </p>
  {#if $(result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any }).retrievedContext.summary.keyPoints.length > 0} <h5>Key Points</h5>
 <ul>
  {#each $(result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any }).retrievedContext.summary.keyPoints as point} <li>{ point }</li> {/each}
  </ul> {/if} {/if}
  <div class="sources-list"> <h5>Top Sources</h5>
  {#each $(result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any }).retrievedContext.sources.slice(0, 5) as source, i} <div class="source-item"> <h6>{i + 1}. {source.title}</h6>
 <p>Type: {source.type}</p>
 <p>Relevance: {(source.relevanceScore * 100).toFixed(1)}%</p>
 <p>Diversity: {(source.diversityScore * 100).toFixed(1)}%</p>
 <p>Reranked: {(source.rerankedScore * 100).toFixed(1)}%</p>
 <p class="content-preview">{source.content.substring(0, 200)}...</p> </div> {/each}
  </div> </div>
 <div class="enhanced-prompt"> <h4>Enhanced Prompt</h4>
 <details> <summary>System Prompt</summary>
 <pre>{$( result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any}
            ).enhancedPrompt.systemPrompt}</pre> </details>
 <details> <summary>Context Prompt</summary>
 <pre>{$( result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any}
            ).enhancedPrompt.contextPrompt}</pre> </details>
 <details> <summary>Instructions</summary>
 <ul>
  {#each $(result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any }).enhancedPrompt.instructions as instruction} <li>{ instruction }</li> {/each}
  </ul> </details> </div>
  {#if $(result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any }).metadata.recommendations?.length > 0} <div class="recommendations"> <h4>Recommendations</h4>
 <ul>
  {#each $(result as { set?: any; metadata?: any; processedQuery?: any; retrievedContext?: any; enhancedPrompt?: any }).metadata.recommendations as rec} <li>{ rec }</li> {/each}
  </ul> {/if}
  <div class="feedback-section"> <h4>Provide Feedback</h4>
 <div class="rating-buttons">
  {#each Array.isArray([1, 2, 3, 4, 5]) ? [1, 2, 3, 4, 5]: [] as rating} <button onclick={() => submitFeedback(rating)}> { rating } Star{rating > 1 ? 's': ''} </button> {/each}
  </div> </div> {/if} {#if $events.length > 0 && enableStreaming} <details class="event-log"> <summary>Event Log ({$events.length})</summary>
 <div class="events-list">
  {#each Array.isArray($events.slice.reverse()) ? $events.slice.reverse(): [] as event} <div class="event-item"> <span class="event-type">{event.type}</span>
 <span class="event-time">{new Date(event.timestamp).toLocaleTimeString()}</span>
 <pre>{JSON.stringify(event.data, null, 2)}</pre> </div> {/each}
  </div> </details> {/if}
  </div>
 <style> .ai-synthesis-client { max-width: 1200px; margin: 0 auto;padding: 20px; font-family: -apple-system; BlinkMacSystemFont: 'Segoe UI', Roboto, sans-serif}
  .config-panel { background: #f5f5f5, padding: 15px; border-radius: 8px; margin-bottom: 20px}
  .config-panel label { display: block; margin: 10px 0}
  .query-panel { margin-bottom: 20px}
  textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px}
  .submit-btn { margin-top: 10px; padding: 10px 20px;background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px}
  .submit-btn: disabled { background: #ccc; cursor: not-allowed}
  .progress-panel { background: #e3f2fd, padding: 20px; border-radius: 8px; margin-bottom: 20px}
  .progress-bar { width: 100%; height: 30px; background: #ddd; border-radius: 15px; overflow: hidden}
  .progress-fill { height: 100%; background: linear-gradient(90deg, #4caf50, #8bc34a); transition: width: 0.3s ease}
  .stage-info { margin-top: 10px; font-style: italic}
  .sources-preview { margin-top: 15px; padding: 10px; background: white; border-radius: 4px}
  .error-panel { background: #ffebe; color: #c62828; padding: 15px; border-radius: 8px; margin-bottom: 20px}
  .result-panel { background: white; border: 1px solid #ddd; border-radius: 8px; padding: 20px}
  .result-panel > div { margin-bottom: 20px; padding: 15px;background: #f9f9f9; border-radius: 4px}
  .result-panel h4 { margin-top: 0; color: #333}
  .source-item { padding: 10px; margin: 10px 0;background: white; border: 1px solid #e0e0e0; border-radius: 4px}
  .content-preview { color: #666; font-size: 0.9em; margin-top: 5px}
  details { margin: 10px 0}
  summary { cursor: pointer; font-weight: bold}
  pre { background: white, padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px}
  .rating-buttons button { margin-right: 10px; padding: 5px 10px;background: #f0f0f0; border: 1px solid #ddd; border-radius: 4px; cursor: pointer}
  .rating-buttons buttonhover { background: #e0e0e0}
  .event-log { margin-top: 20px; padding: 15px; background: #f5f5f5; border-radius: 8px}
  .events-list { max-height: 400px; overflow-y: auto}
  .event-item { padding: 10px; margin: 5px 0;background: white; border-radius: 4px; font-size: 12px}
  .event-type { font-weight: bold, color: #007bff; margin-right: 10px}
  .event-time { color: #666}
</style>


