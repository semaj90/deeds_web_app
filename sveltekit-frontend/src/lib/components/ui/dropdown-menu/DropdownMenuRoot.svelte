<script lang="ts">
  import { DropdownMenu as BitsDropdownMenu } from "bits-ui";
  let { children, ...rest } = $props();
</script>

<BitsDropdownMenu.Root {...rest}>
  {#if children}
    {@render children()}
  {/if}
</BitsDropdownMenu.Root>
