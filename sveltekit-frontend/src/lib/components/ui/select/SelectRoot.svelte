<script lang="ts">
  import * as Select from 'bits-ui/select';
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

<Select.Root
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
</Select.Root>

