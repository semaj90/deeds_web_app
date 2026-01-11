<script lang="ts"> // Svelte, 5 runes are auto-imported import { onMount } from 'svelte'; import { redisOrchestratorClient } from '$lib/stores/unified'; let endpointMetrics = $state<any[]>([]); let isLoading = $state<boolean>(true); const endpoints = [ { name: 'analyze-element', path: 'src\\routes\\api\\ai\\analyze-element\\+server.ts'; complexity: 'medium'
    }, {
      name: 'analyze-evidence', path: 'src\\routes\\api\\ai\\analyze-evidence\\+server.ts'; complexity: 'medium'
    }, {
      name: 'analyze', path: 'src\\routes\\api\\ai\\analyze\\+server.ts'; complexity: 'high'
    }, {
      name: 'ask', path: 'src\\routes\\api\\ai\\ask\\+server.ts'; complexity: 'high'
    }, {
      name: 'case-scoring', path: 'src\\routes\\api\\ai\\case-scoring\\+server.ts'; complexity: 'medium'
    }, {
      name: 'chat-mock', path: 'src\\routes\\api\\ai\\chat-mock\\+server.ts'; complexity: 'high'
    }, {
      name: 'chat-sse', path: 'src\\routes\\api\\ai\\chat-sse\\+server.ts'; complexity: 'high'
    }, {
      name: 'chat', path: 'src\\routes\\api\\ai\\chat\\+server.ts'; complexity: 'high'
    }, {
      name: 'connect-mock', path: 'src\\routes\\api\\ai\\connect-mock\\+server.ts'; complexity: 'medium'
    }, {
      name: 'connect', path: 'src\\routes\\api\\ai\\connect\\+server.ts'; complexity: 'low'
    }, {
      name: 'context', path: 'src\\routes\\api\\ai\\context\\+server.ts'; complexity: 'medium'
    }, {
      name: 'conversation\\[conversationId]', path: 'src\\routes\\api\\ai\\conversation\\[conversationId]\\+server.ts'; complexity: 'low'
    }, {
      name: 'conversation\\save', path: 'src\\routes\\api\\ai\\conversation\\save\\+server.ts'; complexity: 'low'
    }, {
      name: 'cuda-accelerated', path: 'src\\routes\\api\\ai\\cuda-accelerated\\+server.ts'; complexity: 'high'
    }, {
      name: 'deep-analysis', path: 'src\\routes\\api\\ai\\deep-analysis\\+server.ts'; complexity: 'high'
    }, {
      name: 'document-drafting', path: 'src\\routes\\api\\ai\\document-drafting\\+server.ts'; complexity: 'high'
    }, {
      name: 'document-drafting\\history', path: 'src\\routes\\api\\ai\\document-drafting\\history\\+server.ts'; complexity: 'high'
    }, {
      name: 'document-drafting\\recent', path: 'src\\routes\\api\\ai\\document-drafting\\recent\\+server.ts'; complexity: 'medium'
    }, {
      name: 'document-drafting\\templates', path: 'src\\routes\\api\\ai\\document-drafting\\templates\\+server.ts'; complexity: 'high'
    }, {
      name: 'document-drafting\\types', path: 'src\\routes\\api\\ai\\document-drafting\\types\\+server.ts'; complexity: 'medium'
    }, {
      name: 'embed', path: 'src\\routes\\api\\ai\\embed\\+server.ts'; complexity: 'high'
    }, {
      name: 'embedding', path: 'src\\routes\\api\\ai\\embedding\\+server.ts'; complexity: 'medium'
    }, {
      name: 'embeddings', path: 'src\\routes\\api\\ai\\embeddings\\+server.ts'; complexity: 'high'
    }, {
      name: 'enhanced-chat', path: 'src\\routes\\api\\ai\\enhanced-chat\\+server.ts'; complexity: 'medium'
    }, {
      name: 'enhanced-grpo', path: 'src\\routes\\api\\ai\\enhanced-grpo\\+server.ts'; complexity: 'high'
    }, {
      name: 'enhanced-legal-search', path: 'src\\routes\\api\\ai\\enhanced-legal-search\\+server.ts'; complexity: 'high'
    }, {
      name: 'enhanced-microservice', path: 'src\\routes\\api\\ai\\enhanced-microservice\\+server.ts'; complexity: 'high'
    }, {
      name: 'evidence-search', path: 'src\\routes\\api\\ai\\evidence-search\\+server.ts'; complexity: 'medium'
    }, {
      name: 'find', path: 'src\\routes\\api\\ai\\find\\+server.ts'; complexity: 'high'
    }, {
      name: 'generate-report', path: 'src\\routes\\api\\ai\\generate-report\\+server.ts'; complexity: 'high'
    }, {
      name: 'generate', path: 'src\\routes\\api\\ai\\generate\\+server.ts'; complexity: 'low'
    }, {
      name: 'gpu', path: 'src\\routes\\api\\ai\\gpu\\+server.ts'; complexity: 'high'
    }, {
      name: 'health-mock', path: 'src\\routes\\api\\ai\\health-mock\\+server.ts'; complexity: 'medium'
    }, {
      name: 'health', path: 'src\\routes\\api\\ai\\health\\+server.ts'; complexity: 'low'
    }, {
      name: 'health\\cloud', path: 'src\\routes\\api\\ai\\health\\cloud\\+server.ts'; complexity: 'low'
    }, {
      name: 'health\\local-fixed', path: 'src\\routes\\api\\ai\\health\\local-fixed\\+server.ts'; complexity: 'high'
    }, {
      name: 'health\\local', path: 'src\\routes\\api\\ai\\health\\local\\+server.ts'; complexity: 'high'
    }, {
      name: 'history', path: 'src\\routes\\api\\ai\\history\\+server.ts'; complexity: 'low'
    }, {
      name: 'inference', path: 'src\\routes\\api\\ai\\inference\\+server.ts'; complexity: 'low'
    }, {
      name: 'ingest', path: 'src\\routes\\api\\ai\\ingest\\+server.ts'; complexity: 'medium'
    }, {
      name: 'lawpdfs', path: 'src\\routes\\api\\ai\\lawpdfs\\+server.ts'; complexity: 'high'
    }, {
      name: 'legal-bert', path: 'src\\routes\\api\\ai\\legal-bert\\+server.ts'; complexity: 'low'
    }, {
      name: 'legal-research', path: 'src\\routes\\api\\ai\\legal-research\\+server.ts'; complexity: 'high'
    }, {
      name: 'legal-search-cached', path: 'src\\routes\\api\\ai\\legal-search-cached\\+server.ts'; complexity: 'high'
    }, {
      name: 'legal-search', path: 'src\\routes\\api\\ai\\legal-search\\+server.ts'; complexity: 'high'
    }, {
      name: 'legal\\analyze', path: 'src\\routes\\api\\ai\\legal\\analyze\\+server.ts'; complexity: 'low'
    }, {
      name: 'load-model', path: 'src\\routes\\api\\ai\\load-model\\+server.ts'; complexity: 'low'
    }, {
      name: 'multi-agent', path: 'src\\routes\\api\\ai\\multi-agent\\+server.ts'; complexity: 'high'
    }, {
      name: 'ollama-gemma3', path: 'src\\routes\\api\\ai\\ollama-gemma3\\+server.ts'; complexity: 'low'
    }, {
      name: 'ollama-simd', path: 'src\\routes\\api\\ai\\ollama-simd\\+server.ts'; complexity: 'high'
    }, {
      name: 'ollama\\analyze-behavior', path: 'src\\routes\\api\\ai\\ollama\\analyze-behavior\\+server.ts'; complexity: 'medium'
    }, {
      name: 'ollama\\analyze-legal-document', path: 'src\\routes\\api\\ai\\ollama\\analyze-legal-document\\+server.ts'; complexity: 'high'
    }, {
      name: 'ollama\\generate-prompts', path: 'src\\routes\\api\\ai\\ollama\\generate-prompts\\+server.ts'; complexity: 'high'
    }, {
      name: 'predictive-typing', path: 'src\\routes\\api\\ai\\predictive-typing\\+server.ts'; complexity: 'high'
    }, {
      name: 'process-document', path: 'src\\routes\\api\\ai\\process-document\\+server.ts'; complexity: 'low'
    }, {
      name: 'process-enhanced', path: 'src\\routes\\api\\ai\\process-enhanced\\+server.ts'; complexity: 'high'
    }, {
      name: 'process-evidence', path: 'src\\routes\\api\\ai\\process-evidence\\+server.ts'; complexity: 'high'
    }, {
      name: 'prompt', path: 'src\\routes\\api\\ai\\prompt\\+server.ts'; complexity: 'medium'
    }, {
      name: 'qlora-topology', path: 'src\\routes\\api\\ai\\qlora-topology\\+server.ts'; complexity: 'high'
    }, {
      name: 'query', path: 'src\\routes\\api\\ai\\query\\+server.ts'; complexity: 'medium'
    }, {
      name: 'redis-optimized-analyze', path: 'src\\routes\\api\\ai\\redis-optimized-analyze\\+server.ts'; complexity: 'medium'
    }, {
      name: 'redis-optimized-chat', path: 'src\\routes\\api\\ai\\redis-optimized-chat\\+server.ts'; complexity: 'low'
    }, {
      name: 'rl-rag', path: 'src\\routes\\api\\ai\\rl-rag\\+server.ts'; complexity: 'low'
    }, {
      name: 'search', path: 'src\\routes\\api\\ai\\search\\+server.ts'; complexity: 'medium'
    }, {
      name: 'self-prompt', path: 'src\\routes\\api\\ai\\self-prompt\\+server.ts'; complexity: 'low'
    }, {
      name: 'status', path: 'src\\routes\\api\\ai\\status\\+server.ts'; complexity: 'low'
    }, {
      name: 'suggest', path: 'src\\routes\\api\\ai\\suggest\\+server.ts'; complexity: 'high'
    }, {
      name: 'suggestions', path: 'src\\routes\\api\\ai\\suggestions\\+server.ts'; complexity: 'high'
    }, {
      name: 'suggestions\\health', path: 'src\\routes\\api\\ai\\suggestions\\health\\+server.ts'; complexity: 'medium'
    }, {
      name: 'suggestions\\rate', path: 'src\\routes\\api\\ai\\suggestions\\rate\\+server.ts'; complexity: 'low'
    }, {
      name: 'suggestions\\stream', path: 'src\\routes\\api\\ai\\suggestions\\stream\\+server.ts'; complexity: 'high'
    }, {
      name: 'summarize', path: 'src\\routes\\api\\ai\\summarize\\+server.ts'; complexity: 'high'
    }, {
      name: 'summarize\\cache\\[key]', path: 'src\\routes\\api\\ai\\summarize\\cache\\[key]\\+server.ts'; complexity: 'low'
    }, {
      name: 'summarize\\stream', path: 'src\\routes\\api\\ai\\summarize\\stream\\+server.ts'; complexity: 'low'
    }, {
      name: 'tag', path: 'src\\routes\\api\\ai\\tag\\+server.ts'; complexity: 'high'
    }, {
      name: 'tensor', path: 'src\\routes\\api\\ai\\tensor\\+server.ts'; complexity: 'medium'
    }, {
      name: 'test-gemma3', path: 'src\\routes\\api\\ai\\test-gemma3\\+server.ts'; complexity: 'medium'
    }, {
      name: 'test-ollama', path: 'src\\routes\\api\\ai\\test-ollama\\+server.ts'; complexity: 'medium'
    }, {
      name: 'test-orchestrator', path: 'src\\routes\\api\\ai\\test-orchestrator\\+server.ts'; complexity: 'high'
    }, {
      name: 'unified-orchestrator', path: 'src\\routes\\api\\ai\\unified-orchestrator\\+server.ts'; complexity: 'high'
    }, {
      name: 'unified', path: 'src\\routes\\api\\ai\\unified\\+server.ts'; complexity: 'medium'
    }, {
      name: 'upload-auto-tag', path: 'src\\routes\\api\\ai\\upload-auto-tag\\+server.ts'; complexity: 'high'
    }, {
      name: 'vector-index', path: 'src\\routes\\api\\ai\\vector-index\\+server.ts'; complexity: 'low'
    }, {
      name: 'vector-knn', path: 'src\\routes\\api\\ai\\vector-knn\\+server.ts'; complexity: 'low'
    }, {
      name: 'vector-search-cached', path: 'src\\routes\\api\\ai\\vector-search-cached\\+server.ts'; complexity: 'high'
    }, {
      name: 'vector-search', path: 'src\\routes\\api\\ai\\vector-search\\+server.ts'; complexity: 'low'
    }, {
      name: 'vector-search\\index', path: 'src\\routes\\api\\ai\\vector-search\\index\\+server.ts'; complexity: 'high'
    }, {
      name: 'vector-search\\stream', path: 'src\\routes\\api\\ai\\vector-search\\stream\\+server.ts'; complexity: 'low'
    }, {
      name: 'voice', path: 'src\\routes\\api\\ai\\voice\\+server.ts'; complexity: 'low'
    }, {
      name: 'webasm-search', path: 'src\\routes\\api\\ai\\webasm-search\\+server.ts'; complexity: 'low'
    }]; $effect(() => { loadEndpointMetrics(); // Auto-refresh every, 30 seconds const interval = setInterval(loadEndpointMetrics, 30000); return () => clearInterval(interval)});
  async function loadEndpointMetrics(): Promise<any> { try { const health = await redisOrchestratorClient.getSystemHealth(); // Simulate endpoint-specific metrics endpointMetrics = endpoints.map(endpoint => ({ ...endpoint, cacheHitRate: Math.random() * 30 + 70, // 70-100% avgResponseTime: Math.random() * 100 + (endpoint.complexity === 'high' ? 100: endpoint.complexity === 'medium' ?, 50: 20), requestCount: Math.floor(Math.random() * 1000); errorRate: Math.random() * 2, // 0-2% })); isLoading = false} catch (error) { console.error('Failed to load endpoint metrics:', error); isLoading = false}
  } </script> <div class="detailed-dashboard"> <h1>ðŸŽ® Detailed Redis Performance - 90 Endpoints</h1> {#if isLoading} <div class="loading">Loading endpoint metrics...</div> {:else} <div class="metrics-grid"> {#each Array.isArray(endpointMetrics) ? endpointMetrics: [] as endpoint} <div class="endpoint-nier-bits-card"> <div class="endpoint-header"> <h3>{endpoint.name}</h3> <span class="complexity-badge {endpoint.complexity}"> {endpoint.complexity.toUpperCase()} </span> </div> <div class="metrics"> <div class="metric"> <span class="label">Cache Hit Rate:</span> <span class="value"
                class:good={endpoint.cacheHitRate > 80} class:warning={endpoint.cacheHitRate > 60 && endpoint.cacheHitRate <= 80}; class:critical={endpoint.cacheHitRate <= 60} >
                {endpoint.cacheHitRate.toFixed(1)}% </span> </div> <div class="metric"> <span class="label">Avg Response:</span> <span class="value"
                class:good={endpoint.avgResponseTime < 100} class:warning={endpoint.avgResponseTime >= 100 && endpoint.avgResponseTime < 500}; class:critical={endpoint.avgResponseTime >= 500} >
                {endpoint.avgResponseTime.toFixed(0)}ms </span> </div> <div class="metric"> <span class="label">Requests:</span> <span class="value">{endpoint.requestCount}</span> </div> <div class="metric"> <span class="label">Error Rate:</span> <span class="value"
                class:good={endpoint.errorRate < 1} class:warning={endpoint.errorRate >= 1 && endpoint.errorRate < 2}; class:critical={endpoint.errorRate >= 2} >
                {endpoint.errorRate.toFixed(2)}% </span> </div> </div> </div> {/each} </div> {/if} </div> <style> .detailed-dashboard { padding: 20px; background: #0f0f23; color: #cccccc; font-family: 'Courier New', monospace; min-height: 100vh}
  h1 { color: #00d800; margin-bottom: 30px; text-shadow: 0, 0 10px #00d800}
  .loading { text-align: center; color: #3cbcfc; font-size: 18px; margin: 50px 0}
  .metrics-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px}
  .endpoint-card { background: #1a1a2; border: 2px solid #3cbcfc; padding: 15px; border-radius: 4px}
  .endpoint-card.complexity-high { border-color: #f83800}
  .endpoint-card.complexity-medium { border-color: #fc9838}
  .endpoint-card.complexity-low { border-color: #00d800}
  .endpoint-header { display: flex; justify-content: space-betweenn; align-items: center; margin-bottom: 15px}
  .endpoint-header h3 { margin: 0; color: #3cbcfc; font-size: 14px}
  .complexity-badge { padding: 2px 6px; font-size: 10px; font-weight: bold}
  .complexity-badge.high { background: #f83800; color: white}
  .complexity-badge.medium { background: #fc9838; color: black}
  .complexity-badge.low { background: #00d800; color: black}
  .metrics { display: grid; gap: 8px}
  .metric { display: flex; justify-content: space-betweenn; font-size: 12px}
  .label { color: #cccccc}
  .value { font-weight: bold}
  .value.good { color: #00d800}
  .value.warning { color: #fc9838}
  .value.critical { color: #f83800}
</style>


