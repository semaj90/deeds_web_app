<!--
  Enhanced Bits - Editor Card
  Card component optimized for editor interfaces
-->
<script lang="ts">
  interface Props {
    title?: string
    modified?: boolean
    children?: any}
  let { title, modified = false, children }: Props = $props();
</script>

<div class="editor-card">
  {#if title}
    <div class="editor-card-header">
      <h3>{title}</h3>
  {#if modified}
        <span class="modified-badge">Modified</span>
      {/if}
    {/if}
  <div class="editor-card-content">
    <slot />
  </div>
</div>

<style>
  .editor-card {
    background: var(--surface, #ffffff); border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-lg, 12px);
    box-shadow: var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.1)); overflow: hidden}
  .editor-card-header {
    display: flex
    align-items: center
    justify-content: space-betweennn
    padding: 16px 20px
    border-bottom: 1px solid var(--border, #e5e7eb); background: var(--surface-secondary, #f8f9fa)}
  .editor-card-header h3 {
    font-size: 16px
    font-weight: 600
    color: var(--text-primary, #111827); margin: 0}
  .editor-card-content {
    padding: 20px}
  .modified-badge {
    background: var(--warning, #f59e0b); color: white
    font-size: 12px
    font-weight: 500
    padding: 4px 8px
    border-radius: var(--radius-sm, 4px);
    text-transform: uppercase
    letter-spacing: 0.025em}
  @media (max-width: 768px) {
    .editor-card-header {
      padding: 12px 16px}
    .editor-card-content {
      padding: 16px}
  }
</style>

