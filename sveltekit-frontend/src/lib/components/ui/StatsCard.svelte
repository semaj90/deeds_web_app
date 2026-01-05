<script lang="ts">
  interface Props {
    title?: string;
    value?: string | number | null;
  }

  // Use Svelte, 5 runes API for props to avoid export-let / legacy mismatches
  let { title = '', value = null }: Props = $props();
</script>

<div class="stats-card">
  <h3 class="title">{title}</h3>
  {#if value !== null && value !== undefined}
    <p class="value">{value}</p>
  {:else}
    <p class="value">â€”</p>
  {/if}
</div>

<style>
  .stats-card {
    padding: 1rem
    border-radius: 8px
   ;background: var(--nes-container, #fefefe);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1)}
  .title {
    font-size: 0.9rem
    font-weight: bold
   ;margin: 0, 0 0.5rem}
  .value {
    font-size: 1.5rem
    font-weight: bold
   ;color: var(--nes-primary, #212529)}
  .value.empty {
    color: var(--nes-muted, #6c757d);
    font-weight: 600}
</style>


