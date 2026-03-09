<!--
Main Case Page - Loads evidence board + sidebar + timeline
Route: /cases/[caseId]
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import EvidenceBoard from '$lib/components/EvidenceBoard.svelte';
  import EvidenceSidebar from '$lib/components/EvidenceSidebar.svelte';
  import ReportEditor from '$lib/components/ReportEditor.svelte';
  import DemoChat from '$lib/components/DemoChat.svelte';
  import {
    currentCase,
    currentEvidence,
    timelineItems,
    caseActions,
    caseStats,
    recentActivity
  } from '$lib/stores/caseStore';
  import { boardObjects, boardStats } from '$lib/stores/boardStore';

  // Get case ID from route params using Svelte 5 $derived
  let caseId = $derived($page.params.caseId);

  // Component state using Svelte 5 $state
  let activeTab = $state('board'); // 'board', 'timeline', 'reports', 'chat'
  let showReportEditor = $state(false);

  // Load case data when component mounts
  onMount(() => {
    if (caseId) {
      loadCase();
    }
  });

  // React to caseId changes using Svelte 5 $effect
  $effect(() => {
    if (caseId) {
      loadCase();
    }
  });

  async function loadCase() {
    try {
      await caseActions.loadCase(caseId);
    } catch (error) {
      console.error('Failed to load case:', error);
    }
  }

  function handleTabChange(tab: string) {
    activeTab = tab;
  }

  function toggleReportEditor() {
    showReportEditor = !showReportEditor;
  }
</script>

<svelte:head>
  <title>Case {$currentCase?.title || caseId} - Evidence Board</title>
</svelte:head>

<div class="case-page">
  <!-- Header -->
  <header class="case-header nes-container is-dark">
    <div class="case-title">
      <h1 class="nes-text is-primary">
        🏛️ {$currentCase?.title || `Case ${caseId}`}
      </h1>
      {#if $currentCase}
        <p class="case-description nes-text is-disabled">
          {$currentCase.description}
        </p>
        <div class="case-meta">
          <span class="nes-badge is-{$currentCase.status === 'open' ? 'success' : 'warning'}">
            {$currentCase.status.toUpperCase()}
          </span>
          <span class="nes-text is-disabled">
            Created: {new Date($currentCase.createdAt).toLocaleDateString()}
          </span>
        </div>
      {/if}
    </div>

    <!-- Quick Stats -->
    <div class="quick-stats">
      <div class="stat-item">
        <span class="nes-text is-primary">Evidence:</span>
        <span class="nes-text">{$caseStats.evidenceCount}</span>
      </div>
      <div class="stat-item">
        <span class="nes-text is-success">Board Objects:</span>
        <span class="nes-text">{$boardStats.totalObjects}</span>
      </div>
      <div class="stat-item">
        <span class="nes-text is-warning">Timeline:</span>
        <span class="nes-text">{$timelineItems.length}</span>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <nav class="case-nav">
      <button
        class="nes-btn {activeTab === 'board' ? 'is-primary' : ''}"
        onclick={() => handleTabChange('board')}
      >
        🎯 Evidence Board
      </button>
      <button
        class="nes-btn {activeTab === 'timeline' ? 'is-primary' : ''}"
        onclick={() => handleTabChange('timeline')}
      >
        ⏱️ Timeline
      </button>
      <button
        class="nes-btn {activeTab === 'reports' ? 'is-primary' : ''}"
        onclick={() => handleTabChange('reports')}
      >
        📝 Reports
      </button>
      <button
        class="nes-btn {activeTab === 'chat' ? 'is-primary' : ''}"
        onclick={() => handleTabChange('chat')}
      >
        💬 AI Chat
      </button>
    </nav>
  </header>

  <!-- Main Content -->
  <main class="case-main">
    {#if activeTab === 'board'}
      <!-- Evidence Board View -->
      <div class="board-layout">
        <EvidenceSidebar {caseId} />
        <div class="board-container">
          <EvidenceBoard {caseId} />
        </div>
      </div>

    {:else if activeTab === 'timeline'}
      <!-- Timeline View -->
      <div class="timeline-view nes-container is-dark">
        <div class="timeline-header">
          <h2 class="nes-text is-primary">📅 Case Timeline</h2>
          <p class="nes-text is-disabled">Chronological view of case activities</p>
        </div>

        <div class="timeline-content">
          {#each $timelineItems as item (item.id)}
            <div class="timeline-item nes-container">
              <div class="timeline-marker">
                {#if item.type === 'evidence_added'}
                  📄
                {:else if item.type === 'crime_logged'}
                  🚨
                {:else if item.type === 'report_created'}
                  📝
                {:else}
                  📌
                {/if}
              </div>
              <div class="timeline-content-item">
                <h4 class="timeline-title">{item.title}</h4>
                <p class="timeline-description">{item.description}</p>
                <div class="timeline-meta">
                  <span class="nes-text is-disabled">
                    {new Date(item.timestamp).toLocaleString()}
                  </span>
                  <span class="nes-text is-disabled">by {item.createdBy}</span>
                </div>
              </div>
            </div>
          {/each}

          {#if $timelineItems.length === 0}
            <div class="empty-timeline nes-container is-centered">
              <p class="nes-text">No timeline activities yet</p>
              <p class="nes-text is-disabled">Upload evidence or create reports to see timeline updates</p>
            </div>
          {/if}
        </div>
      </div>

    {:else if activeTab === 'reports'}
      <!-- Reports View -->
      <div class="reports-view nes-container is-dark">
        <div class="reports-header">
          <h2 class="nes-text is-primary">📝 Case Reports</h2>
          <button class="nes-btn is-success" onclick={() => toggleReportEditor()}>
            + New Report
          </button>
        </div>

        {#if showReportEditor}
          <ReportEditor {caseId} onclose={() => toggleReportEditor()} />
        {/if}

        <div class="reports-list">
          <!-- TODO: Display existing reports -->
          <div class="empty-reports nes-container is-centered">
            <p class="nes-text">No reports created yet</p>
            <p class="nes-text is-disabled">Create your first report to document findings</p>
          </div>
        </div>
      </div>

    {:else if activeTab === 'chat'}
      <!-- AI Chat View -->
      <div class="chat-view nes-container is-dark">
        <div class="chat-header">
          <h2 class="nes-text is-primary">💬 AI Case Analysis</h2>
          <p class="nes-text is-disabled">Ask questions about this case using natural language</p>
        </div>

        <div class="chat-content">
          <DemoChat />
        </div>
      </div>
    {/if}
  </main>

  <!-- Recent Activity Sidebar (Optional) -->
  <aside class="activity-sidebar nes-container is-dark">
    <h3 class="nes-text is-primary">📈 Recent Activity</h3>
    <div class="activity-list">
      {#each $recentActivity as activity (activity.id)}
        <div class="activity-item">
          <div class="activity-icon">
            {#if activity.type === 'evidence_added'}
              📄
            {:else if activity.type === 'crime_logged'}
              🚨
            {:else if activity.type === 'report_created'}
              📝
            {:else}
              📌
            {/if}
          </div>
          <div class="activity-details">
            <p class="activity-title">{activity.title}</p>
            <p class="activity-time nes-text is-disabled">
              {new Date(activity.timestamp).toLocaleTimeString()}
            </p>
          </div>
        </div>
      {/each}

      {#if $recentActivity.length === 0}
        <p class="nes-text is-disabled">No recent activity</p>
      {/if}
    </div>
  </aside>
</div>

<style>
  .case-page {
    display: grid;
    grid-template-rows: auto 1fr;
    grid-template-columns: 1fr 250px;
    grid-template-areas:
      "header header"
      "main sidebar";
    height: 100vh;
    gap: 1rem;
    padding: 1rem;
    background: #0a0a0a;
  }

  .case-header {
    grid-area: header;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 1rem;
    gap: 2rem;
  }

  .case-title h1 {
    margin: 0 0 0.5rem 0;
  }

  .case-description {
    margin: 0 0 0.5rem 0;
    max-width: 600px;
  }

  .case-meta {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .quick-stats {
    display: flex;
    gap: 2rem;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .case-nav {
    display: flex;
    gap: 0.5rem;
  }

  .case-main {
    grid-area: main;
    overflow: hidden;
  }

  .board-layout {
    display: flex;
    height: 100%;
    gap: 1rem;
  }

  .board-container {
    flex: 1;
  }

  .timeline-view, .reports-view, .chat-view {
    height: 100%;
    overflow-y: auto;
  }

  .timeline-header, .reports-header, .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #495057;
  }

  .timeline-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .timeline-item {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem;
  }

  .timeline-marker {
    font-size: 1.5em;
    flex-shrink: 0;
  }

  .timeline-content-item {
    flex: 1;
  }

  .timeline-title {
    margin: 0 0 0.5rem 0;
    color: #fff;
  }

  .timeline-description {
    margin: 0 0 0.5rem 0;
    color: #ccc;
  }

  .timeline-meta {
    display: flex;
    gap: 1rem;
    font-size: 0.9em;
  }

  .empty-timeline, .empty-reports {
    text-align: center;
    padding: 3rem 2rem;
  }

  .reports-header {
    margin-bottom: 2rem;
  }

  .reports-list {
    margin-top: 2rem;
  }

  .activity-sidebar {
    grid-area: sidebar;
    padding: 1rem;
    overflow-y: auto;
  }

  .activity-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 1rem;
  }

  .activity-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
  }

  .activity-icon {
    font-size: 1.2em;
    flex-shrink: 0;
  }

  .activity-details {
    flex: 1;
    min-width: 0;
  }

  .activity-title {
    margin: 0 0 0.25rem 0;
    font-size: 0.9em;
    font-weight: bold;
    color: #fff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .activity-time {
    margin: 0;
    font-size: 0.8em;
  }

  /* Responsive adjustments */
  @media (max-width: 1200px) {
    .case-page {
      grid-template-columns: 1fr;
      grid-template-areas:
        "header"
        "main";
    }

    .activity-sidebar {
      display: none;
    }
  }

  @media (max-width: 768px) {
    .case-header {
      flex-direction: column;
      gap: 1rem;
    }

    .quick-stats {
      flex-direction: column;
      gap: 0.5rem;
    }

    .case-nav {
      flex-wrap: wrap;
    }
  }
</style>