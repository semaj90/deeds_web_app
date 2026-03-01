<script lang="ts">
  interface Props {
    variant?: 'text' | 'card' | 'rect' | 'circle';
    width?: string;
    height?: string;
    className?: string;
  }

  let {
    variant = 'text',
    width = '100%',
    height = variant === 'text' ? '1em' : '200px',
    className = ''
  }: Props = $props();
</script>

<div
  class="skeleton skeleton-{variant} {className}"
  style:width
  style:height
></div>

<style>
  .skeleton {
    background: linear-gradient(
      90deg,
      var(--panel) 25%,
      var(--panel-soft) 50%,
      var(--panel) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
  }

  .skeleton-circle {
    border-radius: 50%;
  }

  .skeleton-card {
    border-radius: 8px;
  }

  .skeleton-text {
    border-radius: 4px;
    min-height: 1em;
  }

  .skeleton-rect {
    border-radius: 4px;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
</style>
