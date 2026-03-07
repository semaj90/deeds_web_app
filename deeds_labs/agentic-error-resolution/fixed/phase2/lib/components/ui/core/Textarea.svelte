<!-- @migration-task Error while migrating Svelte code: The $ prefix is reserved, and cannot be used for variables and imports
https://svelte.dev/e/dollar_prefix_invalid -->
<!-- @migration-task Error while migrating Svelte code: The $ prefix is reserved, and cannot be used for variables and imports
https://svelte.dev/e/dollar_prefix_invalid -->
<!-- @migration-task Error while migrating Svelte code: The $ prefix is reserved, and cannot be used for variables and imports
https://svelte.dev/e/dollar_prefix_invalid -->
<!-- @migration-task Error while migrating Svelte code: The $ prefix is reserved, and cannot be used for variables and imports
https://svelte.dev/e/dollar_prefix_invalid -->
<script lang="ts">
  export let value: string = '';
  export let rows: number = 3;
  export let $$restProps: Record<string, any>;
</script>

<textarea bind:value {rows} {...$$restProps}></textarea>
