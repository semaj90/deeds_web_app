<script lang="ts">
  import { onMount } from 'svelte';

  interface ErrorEvent {
    code: string;
    count: number;
    severity: number;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    affectedFiles: number;
    samples: string[];
  }

  interface Summary {
    totalErrors: number;
    errorTypes: number;
    highPriority: number;
    mediumPriority: number;
    lowPriority: number;
  }

  let errors: Map<string, ErrorEvent> = new Map();
  let summary: Summary | null = null;
  let connected = false;
  let error: string | null = null;

  onMount(() => {
    connect();

    return () => {
      // Cleanup on unmount
      if (eventSource) {
        eventSource.close();
      }
    };
  });

  let eventSource: EventSource | null = null;

  function connect() {
    try {
      eventSource = new EventSource('/api/errors/stream');

      eventSource.addEventListener('error', (event) => {
        const data = JSON.parse(event.data);
        error = data.message;
        connected = false;
        console.error('Stream error:', data);

        // Retry after 5 seconds
        setTimeout(connect, 5000);
      });

      eventSource.addEventListener('status', (event) => {
        const data = JSON.parse(event.data);
        if (data.status === 'connected') {
          connected = true;
          error = null;
        }
      });

      eventSource.addEventListener('error', (event) => {
        const data = JSON.parse(event.data);
        if (data.code) {
          errors.set(data.code, data);
          errors = errors; // Trigger reactivity
        }
      });

      eventSource.addEventListener('summary', (event) => {
        summary = JSON.parse(event.data);
      });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Connection failed';
      setTimeout(connect, 5000);
    }
  }

  function getPriorityColor(priority: string): string {
    return {
      HIGH: 'bg-red-100 text-red-900 border-red-300',
      MEDIUM: 'bg-yellow-100 text-yellow-900 border-yellow-300',
      LOW: 'bg-blue-100 text-blue-900 border-blue-300'
    }[priority] || 'bg-gray-100';
  }

  function getSeverityBar(severity: number): number {
    return Math.round((severity / 100) * 100);
  }
</script>

<div class="error-stream-container">
  <!-- Status Bar -->
  <div class="status-bar">
    <div class="status-indicator" class:connected class:disconnected={!connected}>
      {connected ? '🟢 Connected' : '🔴 Disconnected'}
    </div>
    {#if error}
      <div class="error-message">{error}</div>
    {/if}
  </div>

  <!-- Summary Card -->
  {#if summary}
    <div class="summary-card">
      <h3>Error Summary</h3>
      <div class="summary-grid">
        <div class="stat">
          <div class="label">Total Errors</div>
          <div class="value">{summary.totalErrors}</div>
        </div>
        <div class="stat high">
          <div class="label">High Priority</div>
          <div class="value">{summary.highPriority}</div>
        </div>
        <div class="stat medium">
          <div class="label">Medium Priority</div>
          <div class="value">{summary.mediumPriority}</div>
        </div>
        <div class="stat low">
          <div class="label">Low Priority</div>
          <div class="value">{summary.lowPriority}</div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Error Stream -->
  <div class="error-list">
    <h3>Real-Time Errors</h3>
    {#if errors.size === 0}
      <p class="empty-state">Waiting for errors...</p>
    {:else}
      {#each Array.from(errors.values()).sort((a, b) => b.severity - a.severity) as error (error.code)}
        <div class="error-card {getPriorityColor(error.priority)} border-l-4">
          <div class="error-header">
            <div class="error-code">{error.code}</div>
            <div class="error-priority">{error.priority}</div>
            <div class="error-count">{error.count} occurrences</div>
          </div>

          <div class="severity-bar-container">
            <div class="severity-bar">
              <div class="bar-fill" style="width: {getSeverityBar(error.severity)}%"></div>
            </div>
            <span class="severity-label">{error.severity}/100</span>
          </div>

          <div class="affected-files">
            <span class="file-count">🗂️ {error.affectedFiles} files affected</span>
            {#if error.samples.length > 0}
              <div class="samples">
                {#each error.samples as file}
                  <code class="sample-file">{file}</code>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .error-stream-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.5rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .status-bar {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background: #f5f5f5;
    border-radius: 0.5rem;
  }

  .status-indicator {
    font-weight: 600;
    padding: 0.25rem 0.75rem;
    border-radius: 0.25rem;
    transition: all 0.2s;
  }

  .status-indicator.connected {
    background: #d1fae5;
    color: #065f46;
  }

  .status-indicator.disconnected {
    background: #fee2e2;
    color: #991b1b;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .error-message {
    color: #dc2626;
    font-size: 0.875rem;
    margin-left: auto;
  }

  .summary-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 1.5rem;
  }

  .summary-card h3 {
    margin: 0 0 1rem 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
  }

  .stat {
    background: #f9fafb;
    padding: 1rem;
    border-radius: 0.5rem;
    border-left: 4px solid #d1d5db;
  }

  .stat.high {
    border-left-color: #dc2626;
  }

  .stat.medium {
    border-left-color: #f59e0b;
  }

  .stat.low {
    border-left-color: #3b82f6;
  }

  .stat .label {
    font-size: 0.875rem;
    color: #6b7280;
    margin-bottom: 0.25rem;
  }

  .stat .value {
    font-size: 1.875rem;
    font-weight: 700;
    color: #1f2937;
  }

  .error-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .error-list h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .empty-state {
    text-align: center;
    color: #9ca3af;
    padding: 2rem 1rem;
  }

  .error-card {
    padding: 1rem;
    border-radius: 0.5rem;
    border: 1px solid;
    background: white;
  }

  .error-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  .error-code {
    font-family: 'Courier New', monospace;
    font-weight: 700;
    font-size: 0.95rem;
  }

  .error-priority {
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
  }

  .error-count {
    margin-left: auto;
    font-size: 0.875rem;
    opacity: 0.8;
  }

  .severity-bar-container {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .severity-bar {
    flex: 1;
    height: 6px;
    background: rgba(0, 0, 0, 0.1);
    border-radius: 3px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #3b82f6, #dc2626);
    transition: width 0.3s ease;
  }

  .severity-label {
    font-size: 0.75rem;
    font-weight: 600;
    min-width: 50px;
  }

  .affected-files {
    font-size: 0.875rem;
  }

  .file-count {
    display: block;
    margin-bottom: 0.5rem;
  }

  .samples {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .sample-file {
    font-size: 0.75rem;
    background: rgba(0, 0, 0, 0.05);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    word-break: break-all;
  }
</style>
