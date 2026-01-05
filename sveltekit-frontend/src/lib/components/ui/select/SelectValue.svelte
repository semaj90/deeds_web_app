<script lang="ts">
  import { Select as BitsSelect } from "bits-ui";
  import { cn } from "$lib/utils/cn";

  interface Props {
    placeholder?: string;
    class?: string;
    [key: string]: any;
  }

  let { placeholder = "Select...", class: className = "", ...rest }: Props = $props();
</script>

<BitsSelect.Value
  class={cn("text-sm", className)}
  {placeholder}
  {...rest}
/>
