<script lang="ts">
  import { DropdownMenu } from "bits-ui";
  let { children, ...rest } = $props();
</script>

<DropdownMenu.Root {...rest}>
  {#if children}
    {@render children()}
  {/if}
</DropdownMenu.Root>


