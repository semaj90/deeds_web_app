<script lang="ts">
  import '../../app.css';
  import 'nes.css/css/nes.min.css'; // Assuming nes.css is installed via npm
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props ();
</script>

<main>
  {#if children}
    {@render children()}
  {/if}
</main>
