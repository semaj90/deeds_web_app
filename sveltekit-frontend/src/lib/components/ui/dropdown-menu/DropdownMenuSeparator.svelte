<script lang="ts">
  import { DropdownMenu as BitsDropdownMenu } from "bits-ui";
  import { cn } from "$lib/utils/cn";
  let { class: className = "", ...rest } = $props();
</script>

<BitsDropdownMenu.Separator
  class={cn("-mx-1 my-1 h-px bg-muted", className)}
  {...rest}
/>
