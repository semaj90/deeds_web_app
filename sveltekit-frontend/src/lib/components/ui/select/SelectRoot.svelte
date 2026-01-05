<script lang="ts">
  import { Select as BitsSelect } from "bits-ui";
  import type { Snippet } from "svelte";

  interface Props {
    value?: string;
    onValueChange?: (value: string) => void;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    disabled?: boolean;
    name?: string;
    required?: boolean;
    children?: Snippet;
    type?: "single" | "multiple";
  }

  let {
    value = $bindable(""),
    open = $bindable(false),
    onValueChange,
    onOpenChange,
    disabled = false,
    name,
    required = false,
    children,
    type = "single",
  }: Props = $props();
</script>

<BitsSelect.Root
  {value}
  {open}
  {onValueChange}
  {onOpenChange}
  {disabled}
  {name}
  {required}
  {type}
>
  {#if children}
    {@render children()}
  {/if}
</BitsSelect.Root>
