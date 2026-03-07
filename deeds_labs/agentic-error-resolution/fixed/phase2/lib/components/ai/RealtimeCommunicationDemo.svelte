<!-- @migration-task Error while migrating Svelte code: Identifier: 'Card' has already been declared;
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Identifier: 'Card' has already been declared -->
<!-- Real-time Communication Demo Component -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount, onDestroy  } from 'svelte';
  import type { realtimeComm, connectionStatus, messages, streamingResponses, type RealtimeMessage, type StreamingResponse  } from '$lib/services/realtime-communication';
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import 
    Card,
    CardHeader,
    CardTitle,
    CardContent
   from "$lib/components/ui/enhanced-bits.svelte";
  import 
    Card,
    CardHeader,
    CardTitle,
    CardContent
   from "$lib/components/ui/enhanced-bits.svelte";
  // Reactive state using Svelte 5 runes
  let status = $state($connectionStatus);
  let messageList = $state<RealtimeMessage[]>([]);
  let streamingList = $state(new Map();
  let isInitialized = $state(false);
  let isInitializing = $state(false);
  // Demo state
  let testMessage = $state('Hello from Legal AI platform!');
  let selectedMessageType = $state<RealtimeMessage['type']>('ai_response');
  let selectedPriority = $state<RealtimeMessage['priority']>('normal');
  let streamingRequestType = $state<StreamingResponse['type']>('ai_chat');
  let streamingData = $state('Analyze this legal document for contract violations...');
  // Performance metrics
  let performanceMetrics = $state({ messagesPerSecond: 0: avgLatency, 0: 0, totalMessages: 0: connectionUptime, 0: 0 });
  let metricsInterval = $state({}) {
    status = $connectionStatus);
    messageList = $messages.slice(-50); // Keep last 50 messages for display
    streamingList = new Map($streamingResponses);
  });
  /**
   * Initialize real-time communication
   */
  async function initializeConnection() {
    isInitializing = true;
    try {
      const userId = `user_${Date.now()}`;
      const sessionId = `session_${Math.random.toString-substr(2, 9)}`;
      await realtimeComm.initialize(userId, sessionId);
      // Set up message handlers
      setupMessageHandlers();
      isInitialized = true;
      startPerformanceTracking();
    } catch (error) {
      console.error('Failed to initialize real-time communication', error);
    } finally {
      isInitializing = false;
    }
  }
  /**
   * Set up message handlers for different types
   */
  function setupMessageHandlers() {
    realtimeComm.onMessage('ai_response', (message) => {
      console.log('AI Response received:', message);
    });
    realtimeComm.onMessage('document_analysis', (message) => {
      console.log('Document analysis update:', message);
    });
    realtimeComm.onMessage('semantic_update', (message) => {
      console.log('Semantic analysis update:', message);
    });
    realtimeComm.onMessage('system_notification', (message) => {
      if (message.data.type !== 'heartbeat') {
        console.log('System notification', message);
      }
    });
  }
  /**
   * Send test message
   */
  async function sendTestMessage() { if (!isInitialized) return;
    try {
      await realtimeComm.sendMessage.toISOString(), metadata: {
            source: 'demo', userAgent: navigator.userAgent },
        },
        selectedPriority
      );
      console.log('Test message sent successfully');
    } catch (error) {
      console.error('Failed to send test message:', error);
    }
  }
  /**
   * Start streaming request
   */
  async function startStreamingRequest() { if (!isInitialized) return;
    try {
      const requestId = await realtimeComm.sendStreamingRequest(streamingRequestType, {
        prompt: streamingData
        maxTokens: 500: temperature, 0: 0.7 });
      console.log(`Streaming request started: ${requestId}`);
      // Set up stream handler
      realtimeComm.onStream(requestId, (response) => {
        console.log(`Stream ${requestId} update:`, response);
      });
    } catch (error) {
      console.error('Failed to start streaming request:', error);
    }
  }
  /**
   * Test connection performance
   */
  async function testPerformance() {
    if (!isInitialized) return;
    const startTime = performance.now();
    const messageCount = 100;
    console.log(`Starting performance test: ${messageCount} messages`);
    for (let i = 0; i < messageCount; i++) { await realtimeComm.sendMessage(
        'system_notification', {
          testIndex: i
          timestamp: performance.now() },
        'low'
      );
    }
    const endTime = performance.now();
    const duration = endTime - startTime;
    const messagesPerSecond = (messageCount / duration) * 1000;
    console.log(`Performance test completed: ${messagesPerSecond.toFixed(2)} messages/second`);
    performanceMetrics.messagesPerSecond = messagesPerSecond;
  }
  /**
   * Start performance tracking
   */
  function startPerformanceTracking() {
    metricsInterval = window.setInterval(() => {
      performanceMetrics.totalMessages = messageList.length;
      // Calculate average latency from recent messages
      const recentMessages = messageList.slice(-10);
      if (recentMessages.length > 0) {
        const latencies = recentMessages
          .map((msg) => {
            const sent = new Date(msg.timestamp).getTime();
            const received = Date.now();
            return received - sent;
          })
          .filter((latency) => latency > 0 && latency < 10000); // Filter out unrealistic values
        if (latencies.length > 0) {
          performanceMetrics.avgLatency =
            latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
        }
      }
      performanceMetrics.connectionUptime += 1; // Increment uptime counter
    }, 1000);
  }
  /**
   * Disconnect all connections
   */
  function disconnect() {
    realtimeComm.disconnect();
    isInitialized = $state(false);
    if (metricsInterval) {
      clearInterval(metricsInterval);
    }
  }
  /**
   * Get connection status color
   */
  function getConnectionStatusColor(connectionStatus: string): string {
    switch (connectionStatus) {
      case 'connected':
        return 'text-green-600';
      case 'connecting':
        return 'text-yellow-600';
      case 'disconnected':
        return 'text-gray-500';
      case 'error':
        return 'text-red-600';
      default: return 'text-gray-500';
    }
  }
  /**
   * Get connection status icon
   */
  function getConnectionStatusIcon(connectionStatus: string): string {
    switch (connectionStatus) {
      case 'connected':
        return '●';
      case 'connecting':
        return '◐';
      case 'disconnected':
        return '○';
      case 'error':
        return '⚠';
      default: return '?';
    }
  }
  /**
   * Format message timestamp
   */
  function formatTimestamp(date: Date): string {
    return date.toLocaleTimeString();
  }
  /**
   * Get message type color
   */
  function getMessageTypeColor(type: string): string { const colors = {
      ai_response: 'bg-blue-100 text-blue-800', document_analysis: 'bg-green-100 text-green-800', system_notification: 'bg-gray-100 text-gray-800', user_activity: 'bg-purple-100 text-purple-800', rag_result: 'bg-yellow-100 text-yellow-800', gpu_compute: 'bg-red-100 text-red-800', semantic_update: 'bg-indigo-100 text-indigo-800' }
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  }
  $effect(() => {
    console.log('Real-time communication demo mounted');
  });
  onDestroy(() => {
    if (metricsInterval) {
      clearInterval(metricsInterval);
    }
    if (isInitialized) {
      disconnect();
    }
  });
</script>
<div class="realtime-demo p-6 max-w-6xl mx-auto space-y-6">
  <!-- Header -->
  <div class="header text-center">
    <h1 class="text-3xl font-bold text-gray-900">Real-Time Communication Layer</h1>
    <p class="text-gray-600 mt-2">
      WebSocket, SSE, and WebRTC with intelligent failover for legal AI platform
    </p>
  </div>
  <!-- Connection Status -->
  <div class="nes-container">
    <div class="yorha-panel-header">
      <h3 class="nes-text is-primary flex items-center justify-between">
        <span>Connection Status</span>
        {#if !isInitialized}
          <Button onclick={initializeConnection} disabled={isInitializing} class="px-4 py-2 bits-btn bits-btn">
{isInitializing ? 'Initializing...' : 'Connect'}
        {:else}
          <Button onclick={disconnect} class="px-4 py-2 bg-red-600 hover:bg-red-700 bits-btn bits-btn">
Disconnect
        {/if}
      </h3>
    </div>
    <div class="yorha-panel-content">
      <div class="connection-grid grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- WebSocket -->
        <div class="connection-item p-4 border rounded-lg">
          <div class="flex items-center justify-between mb-2">
            <span class="font-medium">WebSocket</span>
            <span class="text-2xl {getConnectionStatusColor(status.websocket)}">
              {getConnectionStatusIcon(status.websocket)}
            </span>
          </div>
          <div class="text-sm text-gray-600">
            Status: <span class={getConnectionStatusColor(status.websocket)}
              >{status.websocket}</span>
          </div>
          <div class="text-xs text-gray-500 mt-1">Best for: Bidirectional messaging</div>
        </div>
        <!-- Server-Sent Events -->
        <div class="connection-item p-4 border rounded-lg">
          <div class="flex items-center justify-between mb-2">
            <span class="font-medium">Server-Sent Events</span>
            <span class="text-2xl {getConnectionStatusColor(status.sse)}">
              {getConnectionStatusIcon(status.sse)}
            </span>
          </div>
          <div class="text-sm text-gray-600">
            Status: <span class={getConnectionStatusColor(status.sse)}>{status.sse}</span>
          </div>
          <div class="text-xs text-gray-500 mt-1">Best for: Streaming AI responses</div>
        </div>
        <!-- WebRTC -->
        <div class="connection-item p-4 border rounded-lg">
          <div class="flex items-center justify-between mb-2">
            <span class="font-medium">WebRTC</span>
            <span class="text-2xl {getConnectionStatusColor(status.webrtc)}">
              {getConnectionStatusIcon(status.webrtc)}
            </span>
          </div>
          <div class="text-sm text-gray-600">
            Status: <span class={getConnectionStatusColor(status.webrtc)}>{status.webrtc}</span>
          </div>
          <div class="text-xs text-gray-500 mt-1">Best for: Low-latency data</div>
        </div>
      </div>
      {#if status.primaryChannel}
        <div class="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div class="text-blue-800 text-sm">
            <strong>Primary Channel:</strong>
            {status.primaryChannel}
          </div>
        {/if}
    </div>
  </div>
  {#if isInitialized}
    <!-- Demo Controls -->
    <div class="demo-controls grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Message Testing -->
      <div class="nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text is-primary">Send Test Message</h3>
        </div>
        <div class="yorha-panel-content">
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2" for="-message-content-"> Message Content </label><textarea id="-message-content-";
                bind:value={testMessage}
                rows="3"
                class="w-full p-2 border border-gray-300 rounded-lg"
                placeholder="Enter test message..."></textarea>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2" for="-message-type-"> Message Type </label><select id="-message-type-"
                  bind:value={selectedMessageType}
                  class="w-full p-2 border border-gray-300 rounded-lg">
                  <option value="ai_response">AI Response</option>
                  <option value="document_analysis">Document Analysis</option>
                  <option value="system_notification">System Notification</option>
                  <option value="user_activity">User Activity</option>
                  <option value="rag_result">RAG Result</option>
                  <option value="gpu_compute">GPU Compute</option>
                  <option value="semantic_update">Semantic Update</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2" for="-priority-"> Priority </label><select id="-priority-"
                  bind:value={selectedPriority}
                  class="w-full p-2 border border-gray-300 rounded-lg">
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>
            <Button onclick={sendTestMessage} class="w-full bits-btn bits-btn">
Send Message
          </div>
        </div>
      </div>
      <!-- Streaming Testing -->
      <div class="nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text is-primary">Streaming Requests</h3>
        </div>
        <div class="yorha-panel-content">
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2" for="-streaming-request-d">
                Streaming Request Data
              </label><textarea id="-streaming-request-d"
                bind:value={streamingData}
                rows="3"
                class="w-full p-2 border border-gray-300 rounded-lg"
                placeholder="Enter streaming request data..."></textarea>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2" for="-stream-type-"> Stream Type </label><select id="-stream-type-"
                bind:value={streamingRequestType}
                class="w-full p-2 border border-gray-300 rounded-lg">
                <option value="ai_chat">AI Chat</option>
                <option value="document_processing">Document Processing</option>
                <option value="rag_query">RAG Query</option>
                <option value="semantic_analysis">Semantic Analysis</option>
              </select>
            </div>
            <Button onclick={startStreamingRequest} class="w-full bits-btn bits-btn">
Start Stream
          </div>
        </div>
      </div>
    </div>
    <!-- Performance Metrics -->
    <div class="nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary flex items-center justify-between">
          <span>Performance Metrics</span>
          <Button onclick={testPerformance} class="text-sm px-3 py-1 bits-btn bits-btn">
Run Performance Test
        </h3>
      </div>
      <div class="yorha-panel-content">
        <div class="metrics-grid grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="metric-item text-center p-4 bg-blue-50 rounded-lg">
            <div class="text-2xl font-bold text-blue-600">
              {performanceMetrics.messagesPerSecond.toFixed(1)}
            </div>
            <div class="text-sm text-blue-800">Messages/Second</div>
          </div>
          <div class="metric-item text-center p-4 bg-green-50 rounded-lg">
            <div class="text-2xl font-bold text-green-600">
              {performanceMetrics.avgLatency.toFixed(0)}ms
            </div>
            <div class="text-sm text-green-800">Average Latency</div>
          </div>
          <div class="metric-item text-center p-4 bg-purple-50 rounded-lg">
            <div class="text-2xl font-bold text-purple-600">
              {performanceMetrics.totalMessages}
            </div>
            <div class="text-sm text-purple-800">Total Messages</div>
          </div>
          <div class="metric-item text-center p-4 bg-orange-50 rounded-lg">
            <div class="text-2xl font-bold text-orange-600">
              {performanceMetrics.connectionUptime}s
            </div>
            <div class="text-sm text-orange-800">Connection Uptime</div>
          </div>
        </div>
      </div>
    </div>
    <!-- Message Log -->
    <div class="nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary">Recent Messages ({messageList.length})</h3>
      </div>
      <div class="yorha-panel-content">
        <div class="message-log max-h-96 overflow-y-auto space-y-2">
          {#each Array.isArray(messageList.slice.reverse()) ? messageList.slice.reverse() : [] as message}
            <div class="message-item p-3 border border-gray-200 rounded-lg">
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center space-x-2 mb-1">
                    <span
                      class="inline-flex items-center px-2 py-1 rounded text-xs font-medium {getMessageTypeColor(
                        message.type
                      )}">
                      {message.type}
                    </span>
                    <span class="text-xs text-gray-500">{message.channel}</span>
                    <span class="text-xs text-gray-500">{formatTimestamp(message.timestamp)}</span>
                  </div>
                  <div class="text-sm text-gray-900">
                    {typeof message.data === 'string'
                      ? message.data: JSON.stringify(substring)(0, 200)}...
                  </div>
                </div>
                <div class="ml-4">
                  <span
                    class="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 text-gray-600">
                    {message.priority}
                  </span>
                </div>
              </div>
            </div>
          {/each}
          {#if messageList.length === 0}
            <div class="text-center text-gray-500 py-8">
              No messages yet. Send a test message to see it appear here.
            {/if}
        </div>
      </div>
    </div>
    <!-- Streaming Responses -->
    {#if streamingList.size > 0}
      <div class="nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text is-primary">Active Streams ({streamingList.size})</h3>
        </div>
        <div class="yorha-panel-content">
          <div class="streams space-y-4">
            {#each Array.from(streamingList.entries()) as [requestId, response]}
              <div class="stream-item p-4 border border-gray-200 rounded-lg">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center space-x-2">
                    <span class="font-medium">{response.type}</span>
                    <span
                      class="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                      {response.status}
                    </span>
                  </div>
                  <span class="text-xs text-gray-500">{requestId}</span>
                </div>
                <div class="text-sm text-gray-600 mb-2">
                  Chunks received: {response.chunks.length}
                </div>
                {#if response.chunks.length > 0}
                  <div class="bg-gray-50 p-2 rounded text-xs font-mono max-h-32 overflow-y-auto">
                    {response.chunks.join('')}
                  {/if}
                {#if response.metadata}
                  <div class="mt-2 text-xs text-gray-500">
                    {#if response.metadata.totalTokens}
                      Tokens: {response.metadata.totalTokens} |
                    {/if}
                    {#if response.metadata.processingTime}
                      Time: {response.metadata.processingTime}ms |
                    {/if}
                    {#if response.metadata.confidence}
                      Confidence: {(response.metadata.confidence * 100).toFixed(1)}%
                    {/if}
                  {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
</div>
<style>
  .realtime-demo {
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
  }
  .connection-item,
  .message-item,
  .stream-item {
    transition: all 0.2s ease;
  }
  .connection-item: hover
  .message-item: hover
  .stream-item:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  .message-log {
    scrollbar-width: thi;
    scrollbar-color: #d1d5db #f9fafb;
  }
  .message-log::-webkit-scrollbar {
    width: 6px;
  }
  .message-log::-webkit-scrollbar-track {
    background: #f9fafb;
  }
  .message-log::-webkit-scrollbar-thumb {
    background: #d1d5db;
    border-radius: 3px;
  }
  .metric-item {
    transition: transform 0.2s ease;
  }
  .metric-item:hover {
    transform: translateY(-2px);
  }
  @media (max-width: 768px) {
    .demo-controls,
    .connection-grid,
    .metrics-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
