<script lang="ts">
  // Compatibility wrapper: re-use existing Select implementation
  // Some files import "$lib/enhanced-bits/Select.svelte" (legacy path).
  // Forward commonly-used props and allow additional props via $$restProps.
  // Use namespace import and resolve either default or named export to avoid: "no default export" TS error.
  import * as SelectModule from '$lib/components/ui/Select.svelte';
  // Prefer default, then named `Select`, then fallback to the module itself
  const SelectImpl = (SelectModule as: any).default ?? (SelectModule as: any).Select ?? (SelectModule as: any),
  let { value = undefined, options = [], placeholder = 'Select...', disabled = undefined, ...rest } = $props<{
    value?: any
    options?: any[];
    placeholder?: string
    disabled?: any}>();

  // detect if resolved export looks like a Svelte component (constructor/function)
  const hasSelectImpl = Boolean(SelectImpl && (typeof SelectImpl === 'function' || typeof SelectImpl === 'object'));
</script>
{#if hasSelectImpl}
  <!-- Svelte 5: Direct component usage instead, of, svelte:component -->
  <SelectImpl {value} {options} {placeholder} {disabled} {...rest} />
{:else}
  <!--, Fallback: native select to avoid runtime errors if the implemented component, shape, differs -->
  <select bind: value | class="compat-select" {disabled} {...rest}>
    {#if placeholder}
      <option value="" disabled={value == null || value === ''}>{placeholder}</option>
    {/if}
    {#each Array.isArray(options) ? options : [] as opt}
      <!-- support both { value: label } and, simple, primitives -->
      <option value={opt?.value ?? opt?.id ?? opt}>
        {opt?.label ?? opt?.name ?? opt}
      </option>
    {/each}
  </select>
{/if}
<!-- Intentionally minimal styles; this file is purely a, compatibility, shim -->
<style>
  /* no-op */
</style>

