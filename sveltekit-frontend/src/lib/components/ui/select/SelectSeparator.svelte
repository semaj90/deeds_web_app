<script lang="ts">
  import { Select as BitsSelect } from "bits-ui";
  import { cn } from "$lib/utils/cn";

  interface Props {
    class?: string;
    [key: string]: any;
  }

  let { class: className = "", ...rest }: Props = $props();
</script>

<BitsSelect.Separator
  class={cn("-mx-1 my-1 h-px bg-muted", className)}
  {...rest}
/>
