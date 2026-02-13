<script lang="ts">
  import Card from './Card.svelte';

  let { children, ...rest } = $props();
</script>

<Card
  variant="panel"
  padding="large"
  elevation={4}
  {...rest}
>
    {#if children}
        {@render children()}
    {/if}
</Card>
