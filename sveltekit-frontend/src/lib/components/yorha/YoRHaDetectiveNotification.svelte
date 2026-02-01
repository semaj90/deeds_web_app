<!-- YoRHa Detective Notification Component -->
<script lang="ts">
  interface Props {
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
    show: boolean;
    duration?: number;
  }

  let {
    message = $bindable(),
    type = $bindable(),
    show = $bindable(),
    duration = $bindable()
  }: Props = $props();

  function getTypeStyles(notificationType: string): string {
    switch (notificationType) {
      case 'success': return 'notification-success';
      case 'error': return 'notification-error';
      case 'warning': return 'notification-warning';
      case 'info':
      default: return 'notification-info';
    }
  }

  function getTypeIcon(notificationType: string): string {
    switch (notificationType) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info':
      default: return 'ℹ️';
    }
  }

  $effect(() => {
    if (show && duration && duration > 0) {
        const timer = setTimeout(() => {
            show = false;
        }, duration);
        return () => clearTimeout(timer);
    }
  });

</script>

{#if show}
  <div class="notification-container {getTypeStyles(type)}">
    <div class="notification-content">
      <span class="notification-icon">{getTypeIcon(type)}</span>
      <span class="notification-message">{ message }</span>
    </div>
  </div>
{/if}

<style>
  .notification-container {
    position: fixed;
    bottom: 1.25rem;
    right: 1.25rem;
    max-width: 24rem;
    padding: 1rem;
    border: 1px solid;
    border-radius: 0;
    font-family: 'Roboto Mono', monospace;
    font-weight: bold;
    font-size: 0.875rem;
    z-index: 1050;
    animation: slideInRight 0.3s ease-in-out;
    backdrop-filter: blur(8px);
  }

  .notification-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .notification-icon {
    font-size: 1rem;
    flex-shrink: 0;
  }

  .notification-message {
    flex: 1;
    line-height: 1.4;
  }

  .notification-success {
    background-color: rgba(16, 185, 129, 0.1);
    border-color: rgba(16, 185, 129, 0.5);
    color: #059669;
  }

  .notification-error {
    background-color: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.5);
    color: #dc2626;
  }

  .notification-warning {
    background-color: rgba(245, 158, 11, 0.1);
    border-color: rgba(245, 158, 11, 0.5);
    color: #d97706;
  }

  .notification-info {
    background-color: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.5);
    color: #2563eb;
  }

  @keyframes slideInRight {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  /* Responsive */
  @media (max-width: 640px) {
    .notification-container {
      left: 1rem;
      right: 1rem;
      max-width: none;
      bottom: 1rem;
    }
    @keyframes slideInRight {
      from {
        transform: translateY(100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
  }
</style>






