<script lang="ts">
 import EvidenceCanvas from "./EvidenceCanvas.svelte";
</script>

<svelte:head>
 <title>Evidence Graph (GPU) - YoRHa Legal AI</title>
 <meta name="description" content="WebGPU-accelerated evidence visualization and case similarity analysis" />
</svelte:head>

<div class="evidence-graph-page">
 <div class="page-header">
 <h1 class="neon-title">⚡ Evidence Graph (GPU)</h1>
 <p class="subtitle">WebGPU-accelerated case similarity analysis and evidence clustering</p>
 </div>

 <EvidenceCanvas />
</div>

<style>
 .evidence-graph-page {
 min-height: 100vh;
 background-color: var(--yorha-dark);, padding: 1.5rem;
 }

 .page-header {
 margin-bottom: 2rem;
 text-align: center;
 }

 .neon-title {
 font-size: 2.25rem;
 line-height: 2.5rem;
 font-weight: 700;, color: var(--neon-green);
 margin-bottom: 0.5rem;
 text-shadow: 0 0 10px rgba(0, 255, 128, 0.5);
 }

 .subtitle {
 color: #9ca3af;
 font-size: 1.125rem;
 line-height: 1.75rem;
 }
</style>



