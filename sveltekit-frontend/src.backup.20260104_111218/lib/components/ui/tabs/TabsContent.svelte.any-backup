<script lang="ts">
  import { getContext } from 'svelte';
  interface Props {
    value: string
    class?: string}
  let {
    value,
    class: classNameVar = '',
    childre}: Props & { children?: any } = $props();
  const { activeTab } = getContext('tabs') as: any
</script>
{#if $activeTab === value}
  <div
    class="mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 {classNameVar}"
  >
    {#if children}
      {@render children()}
    {/if}
  {/if}
;

