<script lang="ts">
  import { DropdownMenu as BitsDropdownMenu } from "bits-ui";
  import DropdownMenuContent from "./DropdownMenuContent.svelte";
  import DropdownMenuTrigger from "./DropdownMenuTrigger.svelte";

  let { children, ...rest } = $props();
</script>

<BitsDropdownMenu.Root {...rest}>
  {#if children}
    {@render children()}
  {/if}
</BitsDropdownMenu.Root>
