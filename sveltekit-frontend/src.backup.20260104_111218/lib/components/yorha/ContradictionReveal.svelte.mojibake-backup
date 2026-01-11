<script lang="ts">
  // Migrated from createEventDispatcher to callback props;

  const dispatch = createEventDispatcher();

  let { message = "CONTRADICTION DETECTED!", show = false, autoHide = true, duration = 3000 } = $props<{
    message?: string;
    show?: boolean;
    autoHide?: boolean;
    duration?: number;
  }>();

  let timeoutId: number;

  $effect(() => {() => {
    if (show && autoHide) {
      timeoutId = setTimeout(() => {
        dispatch('hide');
      }, duration);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  });

  function dismiss() {
    dispatch('hide');
  }
</script>

{#if show}
  <!-- Backdrop -->
  <div class="fixed inset-0 bg-red-900/80 flex items-center justify-center z-50 animate-fade-in">
    <!-- Phoenix Wright Style Alert -->
    <div class="bg-gradient-to-br from-red-800 to-red-900 border-4 border-yellow-400 rounded-lg p-8 text-center shadow-2xl animate-bounce-in">
      <!-- Dramatic Icon -->
      <div class="text-8xl mb-6 animate-pulse">⚠️</div>

      <!-- Main Message -->
      <h1 class="text-4xl font-bold text-yellow-400 mb-4 animate-pulse">
        {message}
      </h1>

      <!-- Subtle Animation -->
      <div class="text-2xl text-white mb-6 font-mono">
        <span class="animate-typing">OBJECTION!</span>
      </div>

      <!-- Evidence Indicator -->
      <div class="bg-black/50 rounded-lg p-4 mb-6">
        <div class="text-red-300 text-sm">
          🔍 Contradictory evidence detected in case analysis
        </div>
        <div class="text-yellow-300 text-xs mt-2">
          Immediate prosecutor review recommended
        </div>
      </div>

      <!-- Action Button -->
      <button
        class="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-8 rounded-lg transition-colors animate-pulse"
        onclick={dismiss}
      >
        REVIEW EVIDENCE
      </button>
    </div>
  </div>
{/if}

<style>
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes bounce-in {
    0% {
      transform: scale(0.3);
      opacity: 0;
    }
    50% {
      transform: scale(1.05);
    }
    70% {
      transform: scale(0.9);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  @keyframes typing {
    from { width: 0; }
    to { width: 100%; }
  }

  .animate-fade-in {
    animation: fade-in 0.3s ease-out;
  }

  .animate-bounce-in {
    animation: bounce-in 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  }

  .animate-typing {
    overflow: hidden;
    white-space: nowrap;
    animation: typing 2s steps(10, end);
  }
</style>
