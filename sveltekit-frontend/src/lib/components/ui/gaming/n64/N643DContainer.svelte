<script lang="ts">
  import Card from './Card.svelte';

  let { children, ...rest } = $props();
</script>

<Card
  variant="container"
  padding="medium"
  elevation={8}
  {...rest}
>
    {#if children}
        {@render children()}
    {/if}
</Card>
