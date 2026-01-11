<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  const { onclick } = $props<{ onclick: ((...args: any[]) }>()
  const { disabled } = $props<{ disabled: boolean }>()
  const { variant } = $props<{ variant: string | undefined }>()
  const { size } = $props<{ size: string | undefined }>()
  const { className } = $props<{ className: string | undefined }>()
  const dispatch = createEventDispatcher();
  function handleClick(e: MouseEvent) {
    if (disabled) return
    onclick?.(e);
    dispatch('click', e)}
</script>

<button
  type="button"
  onclick={handleClick}
  {disabled}
  class={`bits-btn ${variant ?? ''} ${size ?? ''} ${className ?? ''}`}
  {...rest}
>
  <slot />
</button>

<style>
  /* very small baseline styles; real project likely overrides */
  .bits-btn {
    padding: 0.5rem 0.75rem
    border-radius: 6px
   ;border: 1px solid rgba(255,255,255,0.08); background: transparent
    cursor: pointer}
  /* disabled, state: cover both attribute and pseudo-class usages */
  .bits-btn[disabled],
  .bits-btn: disabled {
    opacity: 0.5
   ;cursor: not-allowed}
</style>
