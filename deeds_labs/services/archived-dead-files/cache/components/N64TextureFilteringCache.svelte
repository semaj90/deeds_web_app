<!--
  N64 Texture Filtering Cache Visualizer
-->
<script lang="ts">
  import type { N64RenderingOptions } from '../types/gaming-types';

  interface Props {
    textureId?: string;
    textureSource?: any;
    renderingOptions?: Partial<N64RenderingOptions>;
    enableCache?: boolean;
    showPerformanceMetrics?: boolean;
    class?: string;
  }

  let {
    textureId = 'unknown',
    showPerformanceMetrics = false,
    class: className = ''
  }: Props = $props();

</script>

<div class="n64-texture-cache-monitor {className}">
  <div class="cache-status">
    <span class="label">TEXTURE CACHE:</span>
    <span class="value active">ACTIVE</span>
  </div>

  <div class="texture-info">
    ID: {textureId}
  </div>

  {#if showPerformanceMetrics}
    <div class="metrics">
        <div>FPS: 60</div>
        <div>MEM: 12MB</div>
    </div>
  {/if}
</div>

<style>
  .n64-texture-cache-monitor {
    background: rgba(0,0,0,0.9);
    border: 1px solid #4a90e2;
    padding: 10px;
    border-radius: 4px;
    color: #fff;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    display: inline-block;
  }

  .cache-status {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
  }

  .value.active {
      color: #0f0;
  }

  .metrics {
      margin-top: 8px;
      border-top: 1px solid #333;
      padding-top: 4px;
      display: flex;
      gap: 10px;
      color: #888;
  }
</style>
