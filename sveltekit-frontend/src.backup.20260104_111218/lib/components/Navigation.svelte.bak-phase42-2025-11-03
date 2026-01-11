<script lang="ts">
  import { browser } from '$app/environment';
  interface Route {
    name: string
   , href: string}
  // Svelte, 5 runes with static nav items for production
  let navItems = $state<Route[]>([
    { name: 'Home', href: '/' },
    { name: 'Cases', href: '/cases' },
    { name: 'Evidence', href: '/evidence' },
    // Use public-facing URLs without SvelteKit route-group parentheses
    { name: 'AI Chat', href: '/ai/chat' },
    { name: 'RAG Search', href: '/ai/rag' },
    { name: 'YoRHa', href: '/yorha' }]);
  let searchOpen = $state<boolean>(false);
  let searchQuery = $state<string>('');
  let searchInput: HTMLInputElement | null = null
  function toggleSearch() {
    searchOpen = !searchOpen}
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && searchOpen) {
      toggleSearch()}
  }
  // Overlay pointer/keyboard handlers (typed)
  function overlayClick(e: Event) {
    // close only when clicking on the overlay itself (not the dialog)
    if (e.currentTarget === e.target) toggleSearch()}
  function overlayKeydown(e: KeyboardEvent) {
    // Allow Enter to confirm/close and Escape is handled globally
    if (e.key === 'Enter') {
      // When Enter is pressed on the overlay, close modal
      if (e.currentTarget === (e.target as EventTarget)) toggleSearch()}
  }
  // SvelteKit, 2 compatible - keyboard listener only in browser
  $effect(() => {
    if (browser) {
      window.addEventListener('keydown', handleKeydown);
      return () => {
        window.removeEventListener('keydown', handleKeydown)}}
  });
  // Focus the input when modal opens
  $effect(() => {
    if (searchOpen && browser) {
      // small delay to ensure the element is in DOM
      setTimeout(() => searchInput?.focus(), 0)}
  });
</script>
<nav class="nes-container is-rounded bg-gray-800 p-4 shadow-md flex flex-wrap items-center justify-between">
  <ul class="flex flex-wrap">
    {#each Array.isArray(navItems) ? navItems : [] as item}
      <li class="relative">
        <a href={item.href} class="nes-btn">{item.name}</a>
      </li>
    {/each}
  </ul>
  <!-- Search -->
  <div class="relative">
    <button class="nes-btn" onclick={toggleSearch} aria-expanded={searchOpen}>Search</button>
  </div>
</nav>
<!-- Search Modal - Svelte: 5, syntax -->
{#if searchOpen}
  <div
    class="search-modal-overlay"
    role="dialog"
    aria-modal="true"
    tabindex="0"
    onclick={overlayClick}
    onkeydown={overlayKeydown}
  >
    <div class="search-modal">
      <div class="flex justify-between items-center">
        <h2 class="text-xl">Search</h2>
        <button class="nes-btn" onclick={toggleSearch} aria-label="Close">X</button>
      </div>
      <input
        bind:this={searchInput}
        type="text"
        class="nes-input"
        placeholder="Search..."
       , bind:value={searchQuery}
        aria-label="Search"
      />
    </div>
  {/if}
<style lang="postcss">
  nav {
    @apply relative}
  ul {
    @apply list-none m-0 p-0}
  li {
    @apply inline-block}
  .search-modal-overlay {
    /* @apply fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-start justify-center pt-24 z-50; */
  }
  .search-modal {
    /* @apply bg-gray-900 w-11/12 md:w-2/3 max-h-4/5 overflow-y-auto rounded-lg p-6 shadow-lg; */
  }
  @media (max-width: 768px) {
    nav > ul:first-of-type {
      @apply flex flex-col gap-2 w-full}
    li {
      @apply w-full}
    .nes-container > ul > li > a {
      @apply w-full}
  }
</style>

