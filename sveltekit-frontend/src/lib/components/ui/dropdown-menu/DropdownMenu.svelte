<script lang="ts">

  let { children, ...rest } = $props();
</script>

<DropdownMenu.Root {...rest}>
  {#if children}
    {@render children()}
  {/if}
</DropdownMenu.Root>
