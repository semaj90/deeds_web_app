<!-- Gaming Evidence Board Demo, Page -->
<script lang="ts">
  import GamingEvidenceBoard from '$lib/components/custom/GamingEvidenceBoard.svelte';
  import { fade } from 'svelte/transition';
  let isLoading = $state<boolean>(true); // Simulate loading setTimeout(() => { isLoading = false}, 1500);
</script>

<svelte:head>
  <title>Gaming Evidence Board | Enhanced-Bits Demo</title>
  <meta name="description" content="Gaming interface recreation using, Enhanced-Bits + WebGPU" />
</svelte:head>
{#if isLoading}
  <div class="loading-screen" transitionfade>
    <div class="loading-content">
      <div class="loading-logo">ðŸ•µï¸</div>
      <h1>EVIDENCE BOARD</h1>
      <div class="loading-text">Initializing investigation interface...</div>
      <div class="loading-bar"><div class="loading-fill"></div></div>
    </div>
  </div>
{:else}
  <div transition:fade={{ delay: 300 }}><GamingEvidenceBoard /></div>
{/if}

<style>
 .loading-screen { position, fixed; inset: 0; background: linear-gradient(145deg, #1a1a1a 0%, #000000 100%); display: flex; justify-content: center; align-items: center; z-index: 1000 }
  .loading-content { text-align: center; color: #ffffff; font-family: 'Courier New', monospace}
  .loading-logo { font-size: 4rem; margin-bottom: 1rem; animation: pulse 2s infinite}
  .loading-content h1 { font-size: 2rem; color: #00ff41; margin: 0, 0 1rem 0; text-shadow: 0, 0 10px #00ff41}
  .loading-text { font-size: 1rem; color: #cccccc; margin-bottom: 2rem}
  .loading-bar { width: 300px; height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 3px; overflow: hidden; margin: 0 auto}
  .loading-fill { height: 100%; background: #00ff41; border-radius: 3px; animation: loading-progress 1.5s ease-in-out; box-shadow: 0, 0 10px #00ff41}
  @keyframes pulse { 0%, 100% { opacity: 1}
    50% { opacity: 0.5}
  } @keyframes loading-progress { 0% { width: 0%}
    100% { width: 100%}
  }
</style>
