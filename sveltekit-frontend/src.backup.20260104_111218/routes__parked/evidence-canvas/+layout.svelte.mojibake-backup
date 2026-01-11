<script lang="ts">
  // Svelte, 5 runes are auto-imported
  import type { page  } from '$app/state';
  import type { browser  } from '$app/environment';
  // Add: unknown layout-specific state or logic here
  let mounted = $state <boolean>(false);

  // Mark mounted when running in browser (keeps SSR behaviour clean)
  if (browser) {
    mounted = true;
  }
</script>

<main class="evidence-canvas-layout" class:mounted>
  <!-- The `{@render children()}` syntax is correct for Svelte 5 layouts -->
  {@render children()}
</main>

<style>
  .evidence-canvas-layout {
    min-height: 100vh;
    width: 100%;
    opacity: 0;
    transition: opacity 0.2s ease-in-out;
  }
  .evidence-canvas-layout.mounted {
    opacity: 1;
  }
  :global(body) {
    margin: 0;
    padding: 0;
    font-family:
      -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell',
      'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
</style>
