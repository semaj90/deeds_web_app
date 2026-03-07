<script lang="ts">
  // Svelte 5 runes are auto-imported
  import EnhancedEvidenceBoard from '$lib/components/evidence/EnhancedEvidenceBoard.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/enhanced-bits.svelte';

  let pageLoaded = $state(false);
  let showWelcome = $state(true);
  $effect(() => {
    pageLoaded = true;
    // Auto-hide welcome after 3 seconds
    setTimeout(() => (showWelcome = false), 3000);
  });
</script>

<svelte:head>
  <title>Evidence Board - Legal AI Assistant</title>
  <meta name="description" content="AI-powered evidence management with Ollama integration" />
</svelte:head>
<div class="evidence-page-container">
  {#if showWelcome && pageLoaded}
    <div class="welcome-banner animate-fade-in">
      <Card variant="evidence" hoverable fullWidth class="nes-container">
        <div class="nier-bits-yorha-panel-header">
          <h3 class="nier-bits-nes-text is-primary">🎯 Evidence Board Ready</h3>
          <p class="nier-bits-nes-text">
            AI-powered evidence management with RTX 3060 Ti acceleration
          </p>
        </div>
        <div class="nier-bits-yorha-panel-content">
          <div class="welcome-stats">
            <div class="stat">
              <span class="stat-label">GPU</span>
              <span class="stat-value">Active</span>
            </div>
            <div class="stat">
              <span class="stat-label">WebGPU</span>
              <span class="stat-value">Ready</span>
            </div>
            <div class="stat">
              <span class="stat-label">pgvector</span>
              <span class="stat-value">Connected</span>
            </div>
          </div>
        </div>
        <div class="nier-bits-yorha-panel-content">
          <Button class="nes-btn" variant="ghost" size="sm" onclick={() => (showWelcome = false)}
            >Get Started →</Button
          >
        </div>
      </Card>
    </div>
  {/if}
  {#if pageLoaded}
    <EnhancedEvidenceBoard />
  {:else}
    <div class="loading-screen">
      <div class="loading-spinner"></div>
      <p>Initializing Legal AI Platform...</p>
      <small>Loading GPU acceleration, vector search, and fabric.js canvas...</small>
    </div>
  {/if}
</div>

<style>
  .evidence-page-container {
    min-height: 100vh;
    position relative;
  }
  .welcome-banner {
    position fixed;
    top: 20px;
    right: 20px;
    z-index: 1000; width: 320px;
    background: rgba(0, 0, 0, 0.9);
    border: 2px solid #00ff41;
    box-shadow: 0 0 20px rgba(0, 255, 65, 0.3);
  }
  .animate-fade-in {
    animation: fadeInSlide 0.5s ease-out;
  }
  @keyframes fadeInSlide {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  .welcome-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin: 8px 0;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px;
    background: rgba(0, 255, 65, 0.1);
    border: 1px solid rgba(0, 255, 65, 0.3);
    border-radius: 4px;
  }
  .stat-label {
    font-size: 10px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .stat-value {
    font-size: 12px;
    font-weight: bold;
    color: #00ff41;
    margin-top: 2px;
  }
  .loading-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: #f5f5f5;
    color: #666;
  }
  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #e5e5e5;
    border-top: 4px solid #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 16px;
  }
  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
</style>
