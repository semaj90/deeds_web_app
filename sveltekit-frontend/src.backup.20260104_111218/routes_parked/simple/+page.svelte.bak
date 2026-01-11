<script lang="ts">
  import type { goto  } from '$app/navigation';
  import type { browser  } from '$app/environment';
  import { onMount } from 'svelte';;

  // client-only values to avoid SSR window access
  let currentUrl = 'SSR - Not available';
  let currentTime = '';

  onMount(() => {
    if (browser) {
      currentUrl = window.location.href;
      currentTime = new Date().toLocaleString();
    }
  });
</script>

<main class="page-repair">
  <h1>Page under reconstruction</h1>
  <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
  .page-repair {
    padding: 2rem;
    font-family: sans-serif;
  }
</style>
