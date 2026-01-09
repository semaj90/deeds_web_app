<script lang="ts" module>
  export { default as Content } from "./SelectContent.svelte";
  export { default as Group } from "./SelectGroup.svelte";
  export { default as Item } from "./SelectItem.svelte";
  export { default as Label } from "./SelectLabel.svelte";
  export { default as Root } from "./SelectRoot.svelte";
  export { default as Separator } from "./SelectSeparator.svelte";
  export { default as Trigger } from "./SelectTrigger.svelte";
  export { default as Value } from "./SelectValue.svelte";
</script>

<script lang="ts">
  import { Select as BitsSelect } from "bits-ui";
  import type { Snippet } from "svelte";
  import Content from "./SelectContent.svelte";
  import Item from "./SelectItem.svelte";
  import Root from "./SelectRoot.svelte";
  import Trigger from "./SelectTrigger.svelte";
  import Value from "./SelectValue.svelte";

  interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
  }

  interface Props {
    value?: string;
    onValueChange?: (value: string) => void;
    disabled?: boolean;
    name?: string;
    required?: boolean;
    class?: string;
    placeholder?: string;
    options?: SelectOption[];
    children?: Snippet;
  }

  let {
    value = $bindable(""),
    onValueChange,
    disabled = false,
    name,
    required = false,
    class: className = "",
    placeholder = "Select...",
    options = [],
    children,
  }: Props = $props();

  const selectedLabel = $derived(
    options.find((opt) => opt.value === value)?.label
  );
</script>

<Root bind:value {disabled} {name} {required} {onValueChange}>
  <Trigger class={className}>
    <Value {placeholder} />
  </Trigger>
  <Select.Portal>
    <Content>
      {#if options.length > 0}
        {#each options as option (option.value)}
          <Item value={option.value} label={option.label} disabled={option.disabled} />
        {/each}
      {/if}
      {#if children}
        {@render children()}
      {/if}
    </Content>
  </Select.Portal>
</Root>

