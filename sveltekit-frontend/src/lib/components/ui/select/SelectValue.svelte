<script lang="ts">
  import { cn } from "$lib/utils/cn.js";
  import { Select } from "bits-ui";

  interface Props {
    placeholder?: string;
    class?: string;
    [key: string]: any;
  }

  let { placeholder = "Select...", class: className = "", ...rest }: Props = $props();
</script>

<Select.Value
  class={cn("text-sm", className)}
  {placeholder}
  {...rest}
/>


