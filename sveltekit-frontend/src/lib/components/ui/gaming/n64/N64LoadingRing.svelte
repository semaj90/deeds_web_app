<!--
  N64 Loading Ring Component
-->
<script lang="ts">
  interface Props {
    size?: 'sm' | 'md' | 'lg' | 'xl';
    speed?: 'slow' | 'medium' | 'fast';
    theme?: string; // keeping prop for compat
    showPercentage?: boolean;
    percentage?: number;
    class?: string;
  }

  let {
    size = 'md',
    speed = 'medium',
    showPercentage = false,
    percentage = 0,
    class: className = ''
  }: Props = $props();

  const sizeMap = {
      sm: '24px',
      md: '48px',
      lg: '64px',
      xl: '96px'
  };

  const speedMap = {
      slow: '2s',
      medium: '1s',
      fast: '0.5s'
  };

</script>

<div
  class="n64-loading-ring {className}"
  style="
    width: {sizeMap[size]};
    height: {sizeMap[size]};
    --animation-speed: {speedMap[speed]};
  "
>
  <div class="ring"></div>
  {#if showPercentage}
    <div class="percentage">{Math.round(percentage)}%</div>
  {/if}
</div>

<style>
  .n64-loading-ring {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .ring {
    position: absolute;
    inset: 0;
    border: 4px solid rgba(255,255,255,0.1);
    border-top-color: #4a90e2;
    border-radius: 50%;
    animation: spin var(--animation-speed) linear infinite;
  }

  .percentage {
      font-size: 0.8em;
      color: #fff;
      font-family: 'Rajdhani', sans-serif;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
