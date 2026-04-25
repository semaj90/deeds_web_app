<!-- Main Dashboard - Evidence Management System -->
<script lang="ts">
  import { currentUser, userPermissions } from '$lib/stores/authStore';
  import { currentCase, currentEvidence, caseStats } from '$lib/stores/caseStore';
  import { quicClient } from '$lib/services/quicClient';
  import { onMount } from 'svelte';

  // Dashboard state
  let systemHealth = $state<{ [service: string]: boolean }>({});
  let isLoadingHealth = $state(true);

  // Load dashboard data
  onMount(async () => {
    // Check system health
    try {
      systemHealth = await quicClient.healthCheck();
    } catch (error) {
      console.error('Health check failed:', error);
      systemHealth = {
        quicServer: false,
        gpuInference: false,
        fastApiTensor: false
      };
    } finally {
      isLoadingHealth = false;
    }
  });

  // Get health status indicators
  let healthStatus = $derived({
    allHealthy: Object.values(systemHealth).every(status => status),
    healthyCount: Object.values(systemHealth).filter(status => status).length,
    totalServices: Object.keys(systemHealth).length
  });
</script>

<style>
  .dashboard {
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .dashboard-header {
    margin-bottom: 2rem;
    text-align: center;
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .status-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: 4px;
  }

  .status-healthy {
    background: rgba(0, 255, 0, 0.1);
    border: 1px solid #00ff00;
  }

  .status-unhealthy {
    background: rgba(255, 0, 0, 0.1);
    border: 1px solid #ff0000;
  }

  .quick-actions {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 2rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }

  .stat-item {
    text-align: center;
    padding: 1rem;
  }

  .stat-number {
    font-size: 2rem;
    font-weight: bold;
    color: #00ff00;
  }

  .stat-label {
    font-size: 0.9rem;
    color: #ccc;
  }
</style>

<div class="dashboard">
  <!-- Header -->
  <div class="dashboard-header">
    <h1 class="nes-text is-primary">🕵️ YoRHa Detective Command Center</h1>
    {#if $currentUser}
      <p class="nes-text">
        Welcome back, Detective {$currentUser.name}. Neural Network Active.
      </p>
    {/if}
  </div>

  <!-- Main dashboard grid -->
  <div class="dashboard-grid">
    <!-- System Status -->
    <div class="nes-container is-dark with-title">
      <p class="title">🔧 System Status</p>

      {#if isLoadingHealth}
        <p class="nes-text is-disabled">Checking system health...</p>
      {:else}
        <div class="status-grid">
          <div class="status-indicator" class:status-healthy={systemHealth.quicServer} class:status-unhealthy={!systemHealth.quicServer}>
            <span>{systemHealth.quicServer ? '✅' : '❌'}</span>
            <span>QUIC Server</span>
          </div>

          <div class="status-indicator" class:status-healthy={systemHealth.gpuInference} class:status-unhealthy={!systemHealth.gpuInference}>
            <span>{systemHealth.gpuInference ? '✅' : '❌'}</span>
            <span>GPU Inference</span>
          </div>

          <div class="status-indicator" class:status-healthy={systemHealth.fastApiTensor} class:status-unhealthy={!systemHealth.fastApiTensor}>
            <span>{systemHealth.fastApiTensor ? '✅' : '❌'}</span>
            <span>Tensor Service</span>
          </div>
        </div>

        <div style="margin-top: 1rem;">
          <p class="nes-text" class:is-success={healthStatus.allHealthy} class:is-error={!healthStatus.allHealthy}>
            {healthStatus.healthyCount}/{healthStatus.totalServices} services operational
          </p>
        </div>
      {/if}
    </div>

    <!-- Case Statistics -->
    <div class="nes-container is-dark with-title">
      <p class="title">📊 Investigation Stats</p>

      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-number">{$caseStats.evidenceCount}</div>
          <div class="stat-label">Evidence Items</div>
        </div>

        <div class="stat-item">
          <div class="stat-number">{$caseStats.imageCount}</div>
          <div class="stat-label">Images</div>
        </div>

        <div class="stat-item">
          <div class="stat-number">{$caseStats.documentCount}</div>
          <div class="stat-label">Documents</div>
        </div>

        <div class="stat-item">
          <div class="stat-number">{$caseStats.audioCount + $caseStats.videoCount}</div>
          <div class="stat-label">Media</div>
        </div>
      </div>
    </div>

    <!-- Current Case -->
    <div class="nes-container is-dark with-title">
      <p class="title">📁 Active Case</p>

      {#if $currentCase}
        <div>
          <h4 class="nes-text is-success">{$currentCase.title}</h4>
          <p class="nes-text is-disabled">{$currentCase.description || 'No description'}</p>
          <div style="margin-top: 1rem;">
            <span class="nes-badge is-{$currentCase.priority === 'high' ? 'error' : $currentCase.priority === 'medium' ? 'warning' : 'normal'}">
              {$currentCase.priority} priority
            </span>
            <span class="nes-badge" style="margin-left: 0.5rem;">
              {$currentCase.status}
            </span>
          </div>
        </div>
      {:else}
        <div>
          <p class="nes-text is-disabled">No active case selected</p>
          <a href="/cases" class="nes-btn is-primary">
            📁 Browse Cases
          </a>
        </div>
      {/if}
    </div>

    <!-- User Permissions -->
    <div class="nes-container is-dark with-title">
      <p class="title">🔐 Access Level</p>

      {#if $currentUser}
        <div>
          <p class="nes-text">Role: <span class="nes-text is-primary">{$currentUser.role}</span></p>
          <div style="margin-top: 1rem;">
            <div class="nes-text is-disabled" style="font-size: 0.9rem;">
              <div>✅ View Evidence: {$userPermissions.canAnalyzeEvidence ? 'Yes' : 'No'}</div>
              <div>✅ Create Cases: {$userPermissions.canCreateCases ? 'Yes' : 'No'}</div>
              <div>✅ AI Access: {$userPermissions.canAccessAI ? 'Yes' : 'No'}</div>
              <div>✅ Admin: {$userPermissions.canManageUsers ? 'Yes' : 'No'}</div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- Quick Actions -->
  <div class="quick-actions">
    {#if $userPermissions.canCreateCases}
      <a href="/cases/new" class="nes-btn is-success">
        ➕ New Case
      </a>
    {/if}

    <a href="/evidence" class="nes-btn is-primary">
      🔍 View Evidence
    </a>

    <a href="/board" class="nes-btn is-normal">
      📌 Investigation Board
    </a>

    {#if $userPermissions.canAccessAI}
      <a href="/ai-chat" class="nes-btn is-warning">
        🤖 AI Assistant
      </a>
    {/if}
  </div>

  <!-- YoRHa Theme Footer -->
  <div style="text-align: center; margin-top: 3rem; color: #666;">
    <p class="nes-text is-disabled">
      🤖 YoRHa Detective System v2.0 | Neural Network Status: ACTIVE
    </p>
  </div>
</div>