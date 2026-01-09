<script lang="ts">
  import * as Switch from "bits-ui";

  interface Props {
    checked?: boolean;
    disabled?: boolean;
    name?: string;
    required?: boolean;
    value?: string;
    class?: string;
    onCheckedChange?: (checked: boolean) => void;
  }

  let {
    checked = $bindable(false),
    disabled = false,
    name,
    required = false,
    value = "on",
    class: className = "",
    onCheckedChange,
  }: Props = $props();
</script>

<Switch.Root
  bind:checked
  {disabled}
  {name}
  {required}
  {value}
  {onCheckedChange}
  class="peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input {className}"
>
  <Switch.Thumb
    class="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
  />
</Switch.Root>
