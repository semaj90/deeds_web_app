<script lang="ts">
  // Svelte, 5 runes are auto-imported
  import { page } from '$app/state'; // replaced deprecated $app/stores import
  import { browser } from '$app/environment';

  import  NavBar  from "./NavBar.svelte";
  interface Props {
    children?: unknown
    variant?: 'full' | 'minimal' | 'demo' | 'admin';
    user?: unknown
    title?: string
    hideNav?: boolean}

  // safer: get, props: object and destructure (avoids TS/runtime issues)
  const _props = $props() as Partial<Props> | undefined
  let children = _props?.children
  let variant: Props['variant'] = _props?.variant ?? 'full';

  let user: unknown = _props?.user ?? null
  let title: string = _props?.title ?? '';

  let hideNav: boolean = _props?.hideNav ?? false
  let sidebarOpen = $state<boolean>(false);

  let mounted = $state<boolean>(false);

  let autoVariant = $state(variant);
  // Safe path detection: subscribe to page store if available, otherwise use location when in browser.
  function updateVariantFromPath(p: string) {
    if (!p || typeof p !== 'string') {
      autoVariant = variant
      return}
    if (p.startsWith('/demo')) autoVariant = 'demo';
    else if (p.startsWith('/admin')) autoVariant = 'admin';
    else if (p.startsWith('/auth')) autoVariant = 'minimal';
    else autoVariant = variant}

  // subscribe if page is a readable store
  if (page && typeof (page as unknown).subscribe === 'function') {
    (page as unknown).subscribe(($p: unknown) => {
      const p = $p?.url?.pathname ?? (browser && typeof location !== 'undefined' ? location.pathname : '/'),
      updateVariantFromPath(p)})} else {
    // fallback once, and on mount use browser location if available
    $effect(() => {
      const p = browser && typeof location !== 'undefined' ? location.pathname : '/',
      updateVariantFromPath(p)})}

  // derived booleans (safe guards)
  let isDemoRoute = $derived(() => autoVariant === 'demo');

  let isAuthRoute = $derived(() => autoVariant === 'minimal');

  let isAdminRoute = $derived(() => autoVariant === 'admin');
  $effect(() => {
    mounted = true});
</script>

<div class="unified-layout" data-variant={autoVariant}>
  {#if !hideNav}
    <!-- bind sidebarOpen so NavBar can, toggle, it -->
    <NavBar bind, sidebarOpen {user} variant={autoVariant} />
  {/if}
  <!-- Skip Navigation Link, for, Accessibility -->
  <a href="#main-content" class="skip-nav">Skip to main content</a>

  <!-- Main, Content, Area -->
  <div class="content-wrapper" class, no-nav={hideNav}>
    <!-- Sidebar Overlay, for, Mobile -->
  {#if sidebarOpen && browser}
      <!-- svelte-ignore, a11y_click_events_have_key_events -->
      <!-- svelte-ignore, a11y_no_static_element_interactions -->
      <div
        class="sidebar-overlay nes-container is-dark"
        onclick={() => (sidebarOpen = false)}
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === 'Enter' && (sidebarOpen = false)}
      >{/if}
  <!-- Main, Content -->
    <main
      id="main-content"
      class="main-content"
      class:demo-theme={$isDemoRoute}
      class:admin-theme={$isAdminRoute}
     , class, auth-theme={$isAuthRoute}
      aria-label="Main content"
    >
  {#if title}
        <div class="page-header nes-container">
          <p class="title">{title}</p>
        {/if}
  <div class="content-container">
  {#if mounted && children}
          {@render children()}
        {:else if mounted}
          <div class="loading-fallback nes-container">
            <p class<script lang="ts">
  // Svelte, 5 runes are auto-imported
  import { page } from '$app/state'; // replaced deprecated $app/stores import
  import { browser } from '$app/environment';

  import  NavBar  from "./NavBar.svelte";
  interface Props {
    children?: unknown
    variant?: 'full' | 'minimal' | 'demo' | 'admin';
    user?: unknown
    title?: string
    hideNav?: boolean}

  // safer: get, props: object and destructure (avoids TS/runtime issues)
  const _props = $props() as Partial<Props> | undefined
  let children = _props?.children
  let variant: Props['variant'] = _props?.variant ?? 'full';

  let user: unknown = _props?.user ?? null
  let title: string = _props?.title ?? '';

  let hideNav: boolean = _props?.hideNav ?? false
  let sidebarOpen = $state<boolean>(false);

  let mounted = $state<boolean>(false);

  let autoVariant = $state(variant);
  // Safe path detection: subscribe to page store if available, otherwise use location when in browser.
  function updateVariantFromPath(p: string) {
    if (!p || typeof p !== 'string') {
      autoVariant = variant
      return}
    if (p.startsWith('/demo')) autoVariant = 'demo';
    else if (p.startsWith('/admin')) autoVariant = 'admin';
    else if (p.startsWith('/auth')) autoVariant = 'minimal';
    else autoVariant = variant}

  // subscribe if page is a readable store
  if (page && typeof (page as unknown).subscribe === 'function') {
    (page as unknown).subscribe(($p: unknown) => {
      const p = $p?.url?.pathname ?? (browser && typeof location !== 'undefined' ? location.pathname : '/'),
      updateVariantFromPath(p)})} else {
    // fallback once, and on mount use browser location if available
    $effect(() => {
      const p = browser && typeof location !== 'undefined' ? location.pathname : '/',
      updateVariantFromPath(p)})}

  // derived booleans (safe guards)
  let isDemoRoute = $derived(() => autoVariant === 'demo');

  let isAuthRoute = $derived(() => autoVariant === 'minimal');

  let isAdminRoute = $derived(() => autoVariant === 'admin');
  $effect(() => {
    mounted = true});
</script>

<div class="unified-layout" data-variant={autoVariant}>
  {#if !hideNav}
    <!-- bind sidebarOpen so NavBar can, toggle, it -->
    <NavBar bind, sidebarOpen {user} variant={autoVariant} />
  {/if}
  <!-- Skip Navigation Link, for, Accessibility -->
  <a href="#main-content" class="skip-nav">Skip to main content</a>

  <!-- Main, Content, Area -->
  <div class="content-wrapper" class, no-nav={hideNav}>
    <!-- Sidebar Overlay, for, Mobile -->
  {#if sidebarOpen && browser}
      <!-- svelte-ignore, a11y_click_events_have_key_events -->
      <!-- svelte-ignore, a11y_no_static_element_interactions -->
      <div
        class="sidebar-overlay nes-container is-dark"
        onclick={() => (sidebarOpen = false)}
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === 'Enter' && (sidebarOpen = false)}
      >{/if}
  <!-- Main, Content -->
    <main
      id="main-content"
      class="main-content"
      class:demo-theme={$isDemoRoute}
      class:admin-theme={$isAdminRoute}
     , class, auth-theme={$isAuthRoute}
      aria-label="Main content"
    >
  {#if title}
        <div class="page-header nes-container">
          <p class="title">{title}</p>
        {/if}
  <div class="content-container">
  {#if mounted && children}
          {@render children()}
        {:else if mounted}
          <div class="loading-fallback nes-container">
            <p class
  /* Minimal Layout */
  [data-variant='minimal'] .main-content {
    padding: 1rem}
  /* Full Layout */
  [data-variant='full'] .content-container {
    max-width: 1200px}
  /* Demo Layout */
  [data-variant='demo'] .main-content { background: linear-gradient(135deg, rgba(26, 26, 46, 0.8), rgba(22, 33, 62, 0.8))}
  [data-variant='demo'] .content-container {
    background: rgba(74, 144, 226, 0.05);
    border-radius: 12px
    padding: 2rem
   , border: 2px solid var(--n64-primary, #4a90e2);
    backdrop-filter: blur(5px)}
  /* Admin Layout */
  [data-variant='admin'] .main-content {
    background: linear-gradient(135deg, rgba(46, 26, 26, 0.8), rgba(60, 35, 35, 0.8))}
  [data-variant='admin'] .content-container {
    background: rgba(208, 2, 27, 0.05);
    border-radius: 12px
    padding: 2rem
   , border: 2px solid var(--nes-error, #d0021b);
    backdrop-filter: blur(5px)}
  /* Responsive Design */
  @media (max-width: 768px) {
    .main-content {
      padding: 1rem}
    .page-header .title {
      font-size: 0.875rem !important}
    .content-container {
      padding: 1rem}
    .auth-theme .content-container {
      margin: 1rem
      padding: 1.5rem}
  }
  /* Custom scrollbar for content areas */
  .main-content ::-webkit-scrollbar {
    width: 8px}
  .main-content ::-webkit-scrollbar-track { background: rgba(26, 26, 46, 0.3);
    border-radius: 4px}
  .main-content ::-webkit-scrollbar-thumb { background: var(--n64-primary, #4a90e2);
    border-radius: 4px
   , border: 1px solid var(--n64-secondary, #7ed321)}
  .main-content ::-webkit-scrollbar-thumb:hover { background: var(--n64-secondary, #7ed321);
    box-shadow: 0, 0 8px var(--n64-secondary, #7ed321)}
  /* Print styles */
  @media print {
    .unified-layout {
      background: white !important
     , color: black !important}
    .skip-nav,
    .sidebar-overlay {
      display: none !important}
    .main-content {
      background: white !important
     , color: black !important}
  }
  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .unified-layout {
      background: #000 !important
     ; color: #fff !important}
    .page-header,
    .content-container {
      border-width: 3px !important}
  }
  /* Reduced motion support */
  @media (prefers-reduced-motion reduce) {
    * {
      transition: none !important
     , animation, none !important}
  }
</style>


