<script lang="ts">
  import type { PageData } from './$types';

  export let data: PageData;

  const events = data.timeline.events.map((event) => ({
    ...event,
    date: event.timestamp ? new Date(event.timestamp) : null
  }));

  const colorMap: Record<string, string> = {
    high: '#f97316',
    critical: '#f43f5e',
    medium: '#0ea5e9',
    low: '#a3e635'
  };

  const iconMap: Record<string, string> = {
    case_created: '🚀',
    evidence_added: '📁',
    evidence_analyzed: '🧪',
    hearing_scheduled: '📅',
    document_filed: '📄',
    meeting_held: '👥',
    deadline_set: '⏰',
    status_changed: '🔄',
    note_added: '📝',
    assignment_changed: '🧭',
    custom_event: '✨',
    event: '🔹'
  };
</script>

<section class="timeline-layout">
  <aside class="sidebar nes-container is-dark">
    <p class="title">Case Timeline</p>
    <p class="muted">
      {#if data.caseId}
        Showing timeline for case <strong>{data.caseId}</strong>.
      {:else}
        Showing global timeline across all cases.
      {/if}
    </p>
    {#if !data.timeline.success}
      <p class="error-text">{data.timeline.error ?? 'Failed to load timeline events.'}</p>
    {/if}
    <div class="legend">
      <p class="legend-title">Legend</p>
      <ul>
        {#each Object.entries(colorMap) as [level, color]}
          <li>
            <span class="dot" style={`background:${color}`}></span>
            {level}
          </li>
        {/each}
      </ul>
    </div>
  </aside>

  <div class="timeline nes-container is-dark">
    {#if events.length === 0}
      <div class="empty-state">
        <p>No timeline events available yet.</p>
      </div>
    {:else}
      <div class="timeline-line"></div>
      <div class="timeline-events">
        {#each events as event}
          <article class="timeline-card">
            <div class="timeline-marker">
              <div
                class="marker-icon"
                style={`background:${colorMap[event.importance] ?? '#67e8f9'}`}
              >
                {iconMap[event.type] ?? iconMap.event}
              </div>
              <span class="marker-line"></span>
            </div>
            <div class="timeline-content">
              <div class="timeline-head">
                <p class="event-title">{event.title}</p>
                {#if event.date}
                  <p class="event-date">{event.date.toLocaleString()}</p>
                {/if}
              </div>
              <p class="event-meta">
                <span class="tag">{event.type}</span>
                <span class="tag">{event.importance}</span>
                {#if event.automated}
                  <span class="tag">auto</span>
                {/if}
                {#if event.caseId}
                  <span class="tag">Case {event.caseId}</span>
                {/if}
              </p>
              <p class="event-description">{event.description || '—'}</p>
              <div class="event-actions">
                {#if event.evidenceId}
                  <a class="nes-btn is-warning" href={`/yorha/evidence?id=${event.evidenceId}`}>
                    Open Evidence
                  </a>
                {/if}
                <a class="nes-btn is-primary" href={`/yorha/analysis?focus=${event.id}`}>
                  Analyze
                </a>
              </div>
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </div>
</section>

<style>
  .timeline-layout {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 1.5rem;
    padding: 1.5rem;
    min-height: 100vh;
    background: radial-gradient(circle at top, #0f172a, #020617);
    color: #f8fafc;
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    border-radius: 1rem;
    background: rgba(2, 6, 23, 0.85);
    border: 2px solid rgba(103, 232, 249, 0.3);
  }

  .timeline {
    position: relative;
    padding: 2rem;
    border-radius: 1rem;
    background: rgba(2, 6, 23, 0.95);
    border: 2px solid rgba(103, 232, 249, 0.25);
  }

  .timeline-line {
    position: absolute;
    top: 2rem;
    bottom: 2rem;
    left: 3.5rem;
    width: 4px;
    background: linear-gradient(180deg, rgba(103, 232, 249, 0.35), transparent);
  }

  .timeline-events {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .timeline-card {
    display: flex;
    gap: 1rem;
  }

  .timeline-marker {
    position: relative;
    width: 4rem;
    display: flex;
    justify-content: center;
  }

  .marker-icon {
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 9999px;
    display: grid;
    place-items: center;
    font-size: 1.4rem;
    box-shadow: 0 0 12px rgba(103, 232, 249, 0.4);
  }

  .marker-line {
    position: absolute;
    top: 2.5rem;
    bottom: -2rem;
    width: 2px;
    background: rgba(103, 232, 249, 0.4);
  }

  .timeline-content {
    flex: 1;
    padding: 1.2rem;
    border-radius: 0.8rem;
    background: rgba(15, 23, 42, 0.85);
    border: 1px solid rgba(103, 232, 249, 0.25);
  }

  .timeline-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .event-title {
    font-size: 1.1rem;
    font-weight: 600;
  }

  .event-date {
    font-size: 0.85rem;
    color: #94a3b8;
  }

  .event-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0.5rem 0;
  }

  .tag {
    padding: 0.1rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.5);
  }

  .event-description {
    margin: 0.5rem 0 1rem;
    color: #cbd5f5;
  }

  .event-actions {
    display: flex;
    gap: 0.5rem;
  }

  .muted {
    font-size: 0.85rem;
    color: #94a3b8;
  }

  .legend {
    margin-top: 1rem;
  }

  .legend-title {
    text-transform: uppercase;
    font-size: 0.85rem;
    color: #94a3b8;
  }

  .legend ul {
    margin: 0.5rem 0 0;
    padding-left: 1rem;
    list-style: none;
  }

  .legend li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.9rem;
  }

  .dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 9999px;
    display: inline-block;
  }

  .error-text {
    color: #f87171;
    font-size: 0.9rem;
  }

  .empty-state {
    text-align: center;
    padding: 2rem;
    color: #9ca3af;
  }

  @media (max-width: 1100px) {
    .timeline-layout {
      grid-template-columns: 1fr;
    }

    .timeline-line {
      left: 2.2rem;
    }
  }
</style>
