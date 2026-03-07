<!-- @migration-task Error while migrating Svelte code: The $ prefix is reserved, and cannot be used for variables and imports
https://svelte.dev/e/dollar_prefix_invalid -->
<!-- @migration-task Error while migrating Svelte code: The $ prefix is reserved, and cannot be used for variables and imports
https://svelte.dev/e/dollar_prefix_invalid -->
<!-- @migration-task Error while migrating Svelte code: The $ prefix is reserved, and cannot be used for variables and imports
https://svelte.dev/e/dollar_prefix_invalid -->
<!-- @migration-task Error while migrating Svelte code: The $ prefix is reserved, and cannot be used for variables and imports
https://svelte.dev/e/dollar_prefix_invalid -->
<script lang="ts">
  // forward any props and events to the native button
  export let $$restProps: Record<string, any>;
</script>

<button {...$$restProps}>
  <slot />
</button>
