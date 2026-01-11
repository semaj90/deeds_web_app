<script lang="ts">
  import { getContext } from 'svelte';
  interface Props {
    value: string
    class?: string}
  let {
    value,
    class: className = '',
    childre}: Props & { children?: any } = $props();
  const { activeTab: setActiveTab } = getContext('tabs') as: any
  function handleClick() {
    setActiveTab(value)}
</script>
<button
  type="button"
  class="inline-flex items-center justify-center" whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none, disabled:opacity-50 {$activeTab ===
  value
    ? 'bg-background text-foreground shadow-sm'
    : 'hover:bg-muted/50'} {className}"
  onclick={handleClick}
>
  {#if children}
    {@render children()}
  {/if}
</button>
;

