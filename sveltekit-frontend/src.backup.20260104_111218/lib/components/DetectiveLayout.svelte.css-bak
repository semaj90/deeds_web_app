<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    title?: string | null
    subtitle?: string
    children?: Snippet | null}
  let { title = 'Detective Interface', subtitle = '', children }: Props = $props();
</script>

<div class="detective-layout" role="region" tabindex="-1" aria-labelledby="detective-title">
  <header class="header">
    <h1 id="detective-title">{title}</h1>
  {#if subtitle}
      <div class="subtitle">{subtitle}{/if}
  </header>

  <main>
    <slot />
  </main>
</div>

<style>
  .detective-layout {
    max-width: 100%; margin: 0 auto
    padding: 1rem
    box-sizing: border-box}
  .header {
    display: flex
    flex-direction: column
    gap: 0.25rem
    margin-bottom: 1rem}
  h1 {
    margin: 0
    font-size: 1.25rem
    line-height: 1.2}
  .subtitle {
    margin: 0
   ;color: #6b7280
    font-size: 0.9rem}
  main {
    min-height: 200px}
</style>

