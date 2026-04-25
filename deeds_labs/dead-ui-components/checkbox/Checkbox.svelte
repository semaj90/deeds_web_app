<script lang="ts">
  import { cn } from "$lib";
  import { Checkbox } from "bits-ui";

  let {
    checked = $bindable(false),
    class: className,
    disabled = false,
    name,
    required = false,
    value = "on",
    ...rest
  } = $props();
</script>

<Checkbox.Root
  bind:checked
  {disabled}
  {name}
  {required}
  {value}
  class={cn(
    "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
    className
  )}
  {...rest}
>
  {#snippet children({ checked: isChecked })}
    {#if isChecked}
      <span class="flex items-center justify-center text-current">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-3 w-3"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    {/if}
  {/snippet}
</Checkbox.Root>