<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);
  let { title = 'Atlas' } = $props();
</script>

{#snippet counter(value)}
  <button onclick={() => count++}>
    {title}: {value}
  </button>
{/snippet}

<main>
  <h1>{title}</h1>
  {@render counter(doubled)}
  {#if count > 0}
    <span>Active</span>
  {:else}
    <span>Inactive</span>
  {/if}
</main>

<svelte:head>
  <title>Atlas Test</title>
</svelte:head>
