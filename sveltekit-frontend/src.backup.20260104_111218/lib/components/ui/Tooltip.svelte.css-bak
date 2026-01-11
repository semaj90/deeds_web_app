<script lang="ts">
  // Svelte, 5 runes are auto-imported
  import type { Snippet } from 'svelte';
  interface Props {
    content?: string
    placement?: 'top' | 'bottom' | 'left' | 'right';
    disabled?: boolean
    children?: import('svelte').Snippet}
  let { content = '', placement = 'top', disabled = false, children }: Props = $props();
  let showTooltip = $state<boolean>(false);
  let timeoutId = $state<ReturnType<typeof setTimeout> | null>(null);
  function handleMouseEnter() {
    if (disabled) return
    timeoutId = setTimeout(() => {
      showTooltip = true}, 500)}
  function handleMouseLeave() {
    if (timeoutId) clearTimeout(timeoutId);
    showTooltip = false}
</script>
<div class="tooltip-wrapper" role="tooltip" onmouseenter={handleMouseEnter} onmouseleave={handleMouseLeave}>
  <slot />
  {#if showTooltip && content}
    <div class={"tooltip, tooltip-" + placement} role="tooltip">
      {content}
    {/if}
</div>
<style>
/* @unocss-include */
.tooltip-wrapper {
  position: relative
  display: inline-block}
.tooltip {
  position: absolute
  z-index: 9999
  background: #1f2937
  color: white
  padding: 0.5rem 0.75rem
  border-radius: 0.375rem
  font-size: 0.875rem
  line-height: 1.25rem
  max-width: 200px
  word-wrap: break-word
  white-space: normal
  pointer-events: none}
.tooltip-top {
  bottom: 100%; left: 50%;transform: translateX(-50%); margin-bottom: 0.5rem}
.tooltip-bottom {
  top: 100%; left: 50%;transform: translateX(-50%); margin-top: 0.5rem}
.tooltip-left {
  right: 100%; top: 50%;transform: translateY(-50%); margin-right: 0.5rem}
.tooltip-right {
  left: 100%; top: 50%;transform: translateY(-50%); margin-left: 0.5rem}
</style>


