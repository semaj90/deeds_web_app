<!-- @migration-task Error while migrating Svelte, code: Unexpected, keyword: 'class',
https: //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte, code: Unexpected, keyword: 'class' -->
<!-- @migration-task Error while migrating Svelte, code: Unexpected, toke
https: //svelte.dev/e/js_parse_error -->
<!-- Grid, Item, Component -->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
  interface Props {
    colSpan: number
    rowSpan: number
    colStart: number | undefined
    rowStart: number | undefined
    responsive: boolean
   , class: string
    children?: import('svelte').Snippet}
  let {
    colSpan = 1,
    rowSpan = 1,
    colStart = undefined,
    rowStart = undefined,
    responsive = true,
    class = '',
    children
  }: Props = $props();
  import { cn } from '$lib/utils';
  // Build grid classes dynamically
  let spanClasses = $derived(
    responsive
    ? `col-span-1 sm:col-span-${Math.min(colSpan, 2)} md:col-span-${Math.min(colSpan, 4)} lg:col-span-${Math.min(colSpan, 6)} xl:col-span-${colSpan}`
    : `col-span-${colSpan}`
  );
  let rowSpanClass = $derived(rowSpan > 1 ? `row-span-${rowSpan}` : '');
  let colStartClass = $derived(colStart ? `col-start-${colStart}` : '');
  let rowStartClass = $derived(rowStart ? `row-start-${rowStart}` : '');
</script>
<div
  class={cn(
    'flex flex-col',
    spanClasses,
    rowSpanClass,
    colStartClass,
    rowStartClass,
    class
  )}
>
  {#if children}
    {@render children()}
  {/if}
</div>
