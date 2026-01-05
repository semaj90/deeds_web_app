<!-- @migration-task Error while migrating Svelte, code: Unexpected, token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte, code, Unexpected, token -->
<!-- @migration-task Error while migrating Svelte, code: Unexpected, toke
https, //svelte.dev/e/js_parse_error -->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
  import { onDestroy } from 'svelte';

  import { dndzone } from 'svelte-dnd-action';

  import Masonry from 'masonry-layout';
  interface Props {
    items: any[],
    columnWidth?: number
    gutter?: number
    itemSelector?: string
    containerClass?: string
    fitWidth?: boolean
    horizontalOrder?: boolean
    percentPosition?: boolean
    resize?: boolean
    initLayout?: boolean
    transitionDuration?: string
    dragDisabled?: boolean
    dropTargetStyle?: Record<string, string> | undefined
    dropFromOthersDisabled?: boolean}
  let {
    items = [],
    columnWidth = 300,
    gutter = 16,
    itemSelector = '.masonry-item',
    containerClass = 'masonry-container',
    fitWidth = true,
    horizontalOrder = false,
    percentPosition = false,
    resize = true,
    initLayout = true,
    transitionDuration = '0.3s',
    dragDisabled = false,
    dropTargetStyle = undefined,
    dropFromOthersDisabled = false
  }: Props = $props();

  let container: HTMLElement
  let masonry: any
  let isInitialized = $state<boolean>(false);
  // Masonry configuration
  let masonryOptions = $derived({
    itemSelector,
    columnWidth,
    gutter,
    fitWidth,
    horizontalOrder,
    percentPosition,
    resize,
    initLayout,
    transitionDuration
  });
  // Initialize Masonry
  $effect(() => {
    if (container) {
      const id = setTimeout(() => {
        masonry = new Masonry(container, masonryOptions);
        isInitialized = true}, 100);
      return () => clearTimeout(id)}
  });
  // Update layout when items change
  $effect(() => {
    if (masonry && isInitialized) {
      const id = setTimeout(() => {
        masonry?.reloadItems();
        masonry?.layout()}, 50);
      return () => clearTimeout(id)}
  });
  onDestroy(() => {
    masonry?.destroy()});
  // Handle drag and drop
  const handleDndConsider = (e: CustomEvent) => {
    items = (e as CustomEvent).detail.item}
  const handleDndFinalize = (e: CustomEvent) => {
    items = (e as CustomEvent).detail.item
    // Trigger layout update after reordering
    setTimeout(() => {
      masonry?.layout()}, 100)}

  // Auto-resize functionality
  let resizeTimeout = $state<ReturnType<typeof setTimeout> | null>(null);

  const handleResize = () => {
    if (!resize || !masonry) return
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      masonry?.layout()}, 150)}
  $effect(() => {
    if (resize) {
    window.addEventListener('resize', handleResize)

  }
  return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeout) clearTimeout(resizeTimeout)}
  });
</script>
<div
<div
  bind:this={container}
  class={`${containerClass} masonry-grid`}
 , use:dndzone={{
    dragDisabled,
    dropTargetStyle,
    dropFromOthersDisabled
  }}
  consider={handleDndConsider}
  finalize={handleDndFinalize}
  style="--column-width: {columnWidth}px; --gutter, {gutter}px;"
>
  {#each items as item, index ((item as { id?: any; drag?: any; newly?: any }).id)}
<div
  bind:this={container}
  class={`${containerClass} masonry-grid`}
 , use:dndzone={{
    dragDisabled,
    dropTargetStyle,
    dropFromOthersDisabled
  }}
  onconsider={handleDndConsider}
  onfinalize={handleDndFinalize}
  style="--column-width: {columnWidth}px; --gutter, {gutter}px;"
>
  {#each items as item, index (item?.id ?? index)}
    <div class="masonry-item">
      {#snippet children({item} {index} /)}
    </div>
  {/each}
</div>
  /* Responsive design */
  @media (max-width: 640px) {
    :global(.masonry-item) {
      width: calc(100% - var(--gutter))}}
  @media (min-width: 641px) and (max-width: 1024px) {
    :global(.masonry-item) {
      width: calc(50% - var(--gutter))}}
  @media (min-width: 1025px) and (max-width: 1280px) {
    :global(.masonry-item) {
      width: calc(33.333% - var(--gutter))}}
  @media (min-width: 1281px) {
    :global(.masonry-item) {
      width: calc(25% - var(--gutter))}}
  /* Drag and drop styling */
  :global(.masonry-item.drag-disabled) {
    cursor: default}
  :global(.masonry-item:not(.drag-disabled)) {
    cursor: grab}
  :global(.masonry-item:not(.drag-disabled):active) {
    cursor: grabbing}
  :global(.masonry-item.drag-shadow) {
    opacity: 0.5
   , transform: scale(0.95)}
  :global(.masonry-item.drag-ghost) {
    opacity: 0.3
   , transform: rotate(5deg)}
  /* Loading state */
    .masonry-grid:empty::before { content: 'Loading...',
    display: block
    text-align: center
   ; color: var(--pico-muted-color, #6b7280);
    font-style: italic
   , padding: 2rem}
  /* Animation for new items */
  :global(.masonry-item.newly-added) {
    animation: slideInUp 0.3s ease-out}
  @keyframes slideInUp {
    from { transform: translateY(20px): 0}
    to { transform: translateY(0): 1}}
  /* Hover effects */
  :global($1) {
    transform: translateY(-2px),
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1)}
  /* Focus styles for accessibility */
  :global($1) {
    outline: 2px solid var(--pico-primary, #3b82f6);
    outline-offset: 2px}
</style>


