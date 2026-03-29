<!--
  N64 Screen Component
  Container with CRT-like styling
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    width?: string;
    height?: string;
    variant?: 'info' | 'success' | 'warning' | 'error';
    ariaLabel?: string;
    children?: Snippet;
    class?: string;
  }

  let {
    width = '560px',
    height = '420px',
    variant = 'info',
    ariaLabel = 'N64 Screen',
    children,
    class: className = ''
  }: Props = $props();

</script>

<div
  class="n64-screen {variant} {className}"
  role="region"
  aria-label={ariaLabel}
  style="width: {width}; height: {height};"
>
  <div class="screen-content" role="group">
    {#if children}
        {@render children()}
    {/if}
  </div>
</div>

<style>
  .n64-screen {
    background: #000;
    border-radius: 8px;
    padding: 10px;
    box-shadow: 0 0 10px rgba(0,0,0,0.5);
    display: inline-block;
    overflow: hidden;
    box-sizing: border-box;
    border: 4px solid #333;
  }

  .n64-screen.success { border-color: #28a745; }
  .n64-screen.warning { border-color: #ffc107; }
  .n64-screen.error { border-color: #dc3545; }
  .n64-screen.info { border-color: #17a2b8; }

  .screen-content {
    width: 100%;
    height: 100%;
    background: #111;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #0f0;
    font-family: 'Courier New', Courier, monospace;
    overflow: auto;
    position: relative;
    box-shadow: inset 0 0 20px rgba(0,0,0,0.8);
  }

  .screen-content:focus {
      outline: 2px solid #0f0;
  }
</style>
