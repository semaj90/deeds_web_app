<!--
  Custody Timeline Component
  Displays the chronological chain of custody events with detailed audit trail
-->
<script lang="ts">
  interface Props {
    events: any[];
    currentStage?: string;
  }

  let { events = [], currentStage }: Props = $props();

  function getEventIcon(eventType: string) {
    switch (eventType) {
      case 'intake': return '\u{1F6E1}';
      case 'transfer': return '\u{1F4CB}';
      case 'verification': return '\u{1F50D}';
      case 'analysis': return '\u{1F9E0}';
      case 'approval': return '\u{2705}';
      case 'finalization': return '\u{1F3C6}';
      default: return '\u{23F1}';
    }
  }

  function getEventColor(eventType: string) {
    switch (eventType) {
      case 'intake': return 'dot-intake';
      case 'transfer': return 'dot-transfer';
      case 'verification': return 'dot-verification';
      case 'analysis': return 'dot-analysis';
      case 'approval': return 'dot-approval';
      case 'finalization': return 'dot-finalization';
      default: return 'dot-default';
    }
  }

  function formatEventTitle(eventType: string) {
    return eventType
      .replace(/[_-]/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  function formatTimestamp(timestamp?: string | number | Date) {
    if (!timestamp) return '-';
    const d = timestamp instanceof Date ? timestamp : new Date(timestamp);
    return isNaN(d.getTime()) ? '-' : d.toLocaleString();
  }

  function getEventDetails(evt: any) {
    const details = evt?.details ?? {};
    switch (evt?.eventType) {
      case 'intake':
        return {
          primary: 'Evidence taken into custody',
          secondary: `Hash verified: ${details.hashMatch ? 'Yes' : 'No'}`,
          extra: details.originalHash ? `Hash: ${String(details.originalHash).substring(0, 8)}...` : ''
        };
      case 'transfer':
        return {
          primary: 'Custody transferred',
          secondary: `From: ${details.fromCustodian ?? 'Unknown'} \u2192 To: ${details.toCustodian ?? 'Unknown'}`,
          extra: details.transferReason ? `Reason: ${details.transferReason}` : ''
        };
      case 'verification':
        return {
          primary: 'Integrity verification completed',
          secondary: `Status: ${details.integrityStatus ?? 'Unknown'}`,
          extra: details.verificationResults?.aiAnalysisScore
            ? `AI Score: ${(details.verificationResults.aiAnalysisScore * 100).toFixed(0)}%`
            : ''
        };
      case 'analysis':
        return {
          primary: 'AI analysis completed',
          secondary: `Risk Level: ${details.aiAnalysis?.riskLevel ?? 'Unknown'}`,
          extra: details.models ? `Models: ${details.models.join(', ')}` : ''
        };
      case 'approval':
        return {
          primary: 'Custody approved',
          secondary: `Approval status: ${details.approvalStatus ?? 'Unknown'}`,
          extra: details.finalIntegrityStatus ? `Final status: ${details.finalIntegrityStatus}` : ''
        };
      case 'finalization':
        return {
          primary: 'Custody workflow finalized',
          secondary: `Total events: ${details.custodyReport?.totalEvents ?? 0}`,
          extra: details.custodyReport?.totalProcessingTime
            ? `Duration: ${Math.round(details.custodyReport.totalProcessingTime / 1000)}s`
            : ''
        };
      default:
        return {
          primary: formatEventTitle(evt?.eventType ?? 'event'),
          secondary: 'Event processed',
          extra: ''
        };
    }
  }
</script>

<div class="custody-timeline">
  {#if events.length === 0}
    <div class="empty-state">
      <div class="empty-icon">{'\u{23F1}'}</div>
      <p>No custody events recorded yet</p>
    </div>
  {:else}
    <div class="timeline-container">
      <div class="timeline-line"></div>

      {#each events as event, index}
        {@const details = getEventDetails(event)}
        <div class="timeline-event">
          <div class="event-dot {getEventColor(event.eventType)}">
            <span class="event-emoji">{getEventIcon(event.eventType)}</span>
          </div>

          <div class="event-card">
            <div class="event-header">
              <div class="event-info">
                <h4>{details.primary}</h4>
                <p class="event-secondary">{details.secondary}</p>
                {#if details.extra}
                  <p class="event-extra">{details.extra}</p>
                {/if}
              </div>
              <span class="event-type-badge">
                {formatEventTitle(event.eventType)}
              </span>
            </div>

            <div class="event-meta">
              <span>User: {event.userId ?? 'system'}</span>
              <span>{formatTimestamp(event.timestamp)}</span>
            </div>

            {#if event.signature}
              <div class="event-signature">
                <span>{'\u{1F512}'}</span>
                Digitally signed: {String(event.signature).substring(0, 16)}...
              </div>
            {/if}

            {#if event.details && Object.keys(event.details).length > 0}
              <details class="event-details-expand">
                <summary>View detailed information</summary>
                <div class="details-content">
                  <pre>{JSON.stringify(event.details, null, 2)}</pre>
                </div>
              </details>
            {/if}
          </div>
        </div>
      {/each}

      {#if currentStage && !['completed', 'failed', 'cancelled'].includes(currentStage)}
        <div class="timeline-event">
          <div class="event-dot dot-active pulse-anim">
            <div class="event-emoji">{'\u{23F1}'}</div>
          </div>
          <div class="event-card active-card">
            <div class="event-header">
              <h4>Currently: {formatEventTitle(currentStage)}</h4>
              <span class="event-type-badge">In Progress</span>
            </div>
            <p class="event-secondary">This stage is currently being processed...</p>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .custody-timeline {
    max-height: 600px;
    overflow-y: auto;
    scroll-behavior: smooth;
  }
  .empty-state {
    text-align: center;
    padding: 2rem;
    color: #9ca3af;
  }
  .empty-icon {
    font-size: 2rem;
    margin-bottom: 1rem;
    opacity: 0.5;
  }
  .timeline-container {
    position: relative;
    padding-left: 1rem;
  }
  .timeline-line {
    position: absolute;
    left: 2.25rem;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #333;
  }
  .timeline-event {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  .event-dot {
    position: relative;
    z-index: 10;
    flex-shrink: 0;
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    border: 2px solid;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dot-intake { border-color: #60a5fa; background: rgba(59, 130, 246, 0.15); }
  .dot-transfer { border-color: #a78bfa; background: rgba(139, 92, 246, 0.15); }
  .dot-verification { border-color: #34d399; background: rgba(16, 185, 129, 0.15); }
  .dot-analysis { border-color: #22d3ee; background: rgba(6, 182, 212, 0.15); }
  .dot-approval { border-color: #6ee7b7; background: rgba(16, 185, 129, 0.15); }
  .dot-finalization { border-color: #fbbf24; background: rgba(245, 158, 11, 0.15); }
  .dot-default { border-color: #9ca3af; background: rgba(156, 163, 175, 0.15); }
  .dot-active { border-color: #60a5fa; background: rgba(59, 130, 246, 0.15); }
  .event-emoji { font-size: 1.25rem; }
  .event-card {
    flex: 1;
    min-width: 0;
    background: #1a1a2e;
    border: 1px solid #333;
    border-radius: 0.5rem;
    padding: 1rem;
  }
  .active-card {
    background: rgba(59, 130, 246, 0.05);
    border-color: rgba(59, 130, 246, 0.3);
  }
  .event-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .event-info { flex: 1; }
  .event-header h4 {
    color: #ffffff;
    font-weight: 600;
    margin: 0;
  }
  .event-secondary {
    color: #9ca3af;
    font-size: 0.875rem;
    margin: 0.25rem 0 0 0;
  }
  .event-extra {
    color: #6b7280;
    font-size: 0.75rem;
    margin: 0.25rem 0 0 0;
  }
  .event-type-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
    background: rgba(255, 255, 255, 0.05);
    color: #9ca3af;
    white-space: nowrap;
  }
  .event-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.75rem;
    color: #6b7280;
    padding-top: 0.5rem;
    margin-top: 0.5rem;
    border-top: 1px solid #333;
  }
  .event-signature {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid #333;
    font-size: 0.75rem;
    color: #6b7280;
  }
  .event-details-expand {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid #333;
  }
  .event-details-expand summary {
    cursor: pointer;
    font-size: 0.75rem;
    color: #3b82f6;
  }
  .details-content {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 0.25rem;
  }
  .details-content pre {
    white-space: pre-wrap;
    color: #9ca3af;
    font-family: monospace;
    font-size: 0.75rem;
    overflow: auto;
    margin: 0;
  }
  .pulse-anim {
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  .custody-timeline::-webkit-scrollbar { width: 6px; }
  .custody-timeline::-webkit-scrollbar-track { background: transparent; }
  .custody-timeline::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }
</style>
