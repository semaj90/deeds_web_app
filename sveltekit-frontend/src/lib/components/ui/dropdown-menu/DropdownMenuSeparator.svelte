<script lang="ts">
  import { cn } from "$lib";
  import * as DropdownMenu from "bits-ui";
  let { class: className = "", ...rest } = $props();
</script>

<DropdownMenu.Separator
  class={cn("-mx-1 my-1 h-px bg-muted", className)}
  {...rest}
/>

