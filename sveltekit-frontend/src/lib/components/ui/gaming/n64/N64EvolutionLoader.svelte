<!--
  N64 Evolution Loader
  Multi-stage loader
-->
<script lang="ts">
  import ProgressBar from './ProgressBar.svelte';

  interface Props {
    stage?: 'nes' | 'snes' | 'n64' | 'modern';
    autoEvolution?: boolean;
    evolutionSpeed?: number;
    ragIntegration?: boolean;
    yorhaMode?: boolean;
    headless?: boolean;
    class?: string;
  }

  let {
    stage = $bindable('n64'),
    autoEvolution = true,
    evolutionSpeed = 3000,
    ragIntegration = false,
    yorhaMode = false,
    headless = false,
    class: className = ''
  }: Props = $props();

  let progress = $state(0);

  $effect(() => {
      if (autoEvolution) {
          const interval = setInterval(() => {
              progress = (progress + 1) % 100;
          }, 50);
          return () => clearInterval(interval);
      }
  });

</script>

<div class="n64-evolution-loader {className}">
  <div class="loader-content">
    <div class="stage-display">STAGE: {stage.toUpperCase()}</div>

    <ProgressBar
        value={progress}
        max={100}
        label="LOADING..."
        showPercentage={true}
        enableTextureStreaming={true}
        variant={yorhaMode ? 'secondary' : 'primary'}
    />

    {#if ragIntegration}
        <div class="integration-status">RAG INTEGRATION ACTIVE</div>
    {/if}
  </div>
</div>

<style>
  .n64-evolution-loader {
    width: 100%;
    max-width: 400px;
    background: rgba(0,0,0,0.8);
    padding: 20px;
    border-radius: 8px;
    color: white;
    font-family: 'Rajdhani', sans-serif;
  }

  .stage-display {
      font-size: 1.2em;
      font-weight: bold;
      margin-bottom: 10px;
      text-align: center;
      color: #ffc107;
  }

  .integration-status {
      margin-top: 10px;
      font-size: 0.8em;
      text-align: center;
      color: #28a745;
  }
</style>
