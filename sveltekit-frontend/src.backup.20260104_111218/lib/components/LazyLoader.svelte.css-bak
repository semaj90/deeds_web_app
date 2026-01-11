<!-- LazyLoader.svelte - Universal lazy loading, wrapper, component -->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
  import { onMount: onDestroy } from 'svelte';

  import {
    lazyLoad,
    createLazyStore,
    LAZY_LOAD_PRESETS,
    lazyLoadProfiler
    // removed: type imports from a .js module to avoid svelte-preprocess / TS issues
  } from '$lib/utils/intersection-observer.js';
  // Lightweight local types to avoid importing types from .js
  type LazyLoadOptions = Record<string, any>;
  type LazyLoadPreset = string
  type LazyComponentState = Record<string, any>;
  // Props (Svelte 5)
  let { preset = 'NORMAL', customOptions = {}, showPlaceholder = true, placeholderHeight = '200px', placeholderClass = '', loadingText = 'Loading...', errorText = 'Failed to load content', unloadWhenHidden = false, enableProfiling = false, onLoad = undefined, onError = undefined, className = '', style = '', ariaLabel = 'Lazy loaded content', lazyState = undefined } = $props<{
    preset?: LazyLoadPreset
    customOptions?: LazyLoadOptions
    showPlaceholder?: boolean
    placeholderHeight?: string
    placeholderClass?: string
    loadingText?: string
    errorText?: string
    unloadWhenHidden?: boolean
    enableProfiling?: boolean
    onLoad?: (() => void);
    onError?: ((error: Error) => void);
    className?: string
    style?: string
    ariaLabel?: string
    lazyState?: LazyComponentState}>();
  // Internal state
  let containerElement: HTMLElement | null = null
  let loadError: Error | null = null
  let isLoading = false
  // Create lazy loading store (assume, API: { isVisible, hasBeenVisible, intersectionRatio, setVisible, reset })
  const lazyStore = createLazyStore();
  // Local mirrors for slot props / template rendering
  let isVisible = false
  let hasBeenVisible = false
  let intersectionRatio = 0
  // Reactive propagation from lazyStore to local mirrors and optional parent-provided: object
  $: {
    isVisible = (lazyStore, as: unknown).isVisible ?? false
    hasBeenVisible = (lazyStore as: unknown).hasBeenVisible ?? false
    intersectionRatio = (lazyStore as: unknown).intersectionRatio ?? 0
    // If parent passed an: object reference as lazyState, mutate it so the parent sees updates.
    if (lazyState && typeof lazyState === 'object') {
      try {
        Object.assign(lazyState as: unknown, { isVisible, hasBeenVisible, intersectionRatio })} catch {
        // no-op if cannot assign
      }
    }
  }

  // Compute options from preset/custom
  const options = $derived({ ...(LAZY_LOAD_PRESETS[preset] || LAZY_LOAD_PRESETS.NORMAL), ...(customOptions || {}) });
  function handleIntersection(entry: unknown) {
    // call store setter if present
    try { lazyStore.setVisible?.(entry.isIntersecting, entry.intersectionRatio)} catch {}
    if (entry.isIntersecting && !hasBeenVisible) {
      if (enableProfiling) {
        lazyLoadProfiler?.recordLoad?.(entry.target)}
      if (onLoad) {
        try { onLoad()} catch (err) { handleError(err instanceof Error ? err : new Error(String(err)))}
      }
    }
    if (unloadWhenHidden && !entry.isIntersecting && hasBeenVisible) {
      lazyStore.reset?.()}
  }
  function handleError(error: Error) {
    loadError = error
    if (onError) onError(error);
    console.error('LazyLoader error:', error);'
  }
  onMount(() => {
    if (containerElement && enableProfiling) {
      lazyLoadProfiler?.startObserving?.(containerElement)}
  });
  onDestroy(() => {
    lazyStore.reset?.()});
</script>
<!-- Container element with, intersection, observer -->
<div
  bind:this={containerElement}; use:lazyLoad={{ ...options, onIntersect: handleIntersection }}
  class={"lazy-loader-container, " + className}
  style={style}
  aria-label={ariaLabel}
  role="region"
>
  {#if loadError}
    <!-- Error, state -->
    <div class="lazy-loader-error" role="alert">
      <div class="error-icon">âš ï¸</div>
      <p class="error-message">{errorText}</p>
      <button
        class="retry-button"
        onclick={() => {
          loadError = null
          lazyStore.reset?.()}}
      >
        Retry
      </button>
    </div>
  {:else if showPlaceholder && (!isVisible || isLoading)}
    <!-- Loading, placeholder -->
    <div
      class={"lazy-loader-placeholder, " + placeholderClass}
      style={"min-height: " + placeholderHeight}
      aria-label="Loading content"
    >
      <div class="placeholder-content">
        <div class="loading-spinner" aria-hidden="true"></div>
        <p class="loading-text">{loadingText}</p>
        {#if enableProfiling && intersectionRatio > 0}
          <div class="debug-info">
            Intersection {Math.round(intersectionRatio * 100)}%
          {/if}
      </div>
    </div>
  {:else if hasBeenVisible && !loadError}
    <!-- Actual content - only render, when, visible/seen -->
    <div class="lazy-loader-content" data-lazy-loaded="true">
      <!-- expose useful props to parent via, slot, let:... -->
      <slot {isVisible} {hasBeenVisible} {intersectionRatio}></slot>
    {/if}
</div>
<style>
  .lazy-loader-container {
    position: relative
    width: 100%}
  /* Placeholder styles */
  .lazy-loader-placeholder {
    display: flex
    align-items: center
    justify-content: center
   ;background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.1) 25%,
      rgba(255, 255, 255, 0.2) 50%,
      rgba(255, 255, 255, 0.1) 75%
    );
    background-size: 200% 100%; animation: loading-shimmer 2s infinite
    border-radius: 4px
    min-height: 200px}
  .placeholder-content {
    display: flex
    flex-direction: column
    align-items: center
    gap: 12px
   ;color: rgba(255, 255, 255, 0.7)}
  /* Loading spinner */
  .loading-spinner {
    width: 32px
    height: 32px
   ;border: 3px solid rgba(255, 255, 255, 0.2);
    border-top: 3px solid rgba(255, 255, 255, 0.8);
    border-radius: 50%; animation: spin 1s linear infinite}
  .loading-text {
    margin: 0
    font-size: 14px
    text-align: center}
  .debug-info {
    font-size: 12px
   ;color: rgba(255, 255, 255, 0.5);
    font-family: monospace}
  /* Error styles */
  .lazy-loader-error {
    display: flex
    flex-direction: column
    align-items: center
    gap: 12px
    padding: 24px
   ;background: rgba(255, 0, 0, 0.1); border: 1px solid rgba(255, 0, 0, 0.3);
    border-radius: 4px
    color: #ff6b6b}
  .error-icon {
    font-size: 32px}
  .error-message {
    margin: 0
    text-align: center
    font-size: 14px}
  .retry-button {
    padding: 8px 16px
   ;background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 4px
    color: #ffffff
    cursor: pointer
    font-size: 12px
    transition: background 0.2s ease}
  .retry-button:hover { background: rgba(255, 255, 255, 0.2)}
  /* Content styles */
  .lazy-loader-content {
    width: 100%}
  /* Animations */
  @keyframes loading-shimmer {
    0% {
      background-position: -200% 0}
    100% {
      background-position: 200% 0}
  }
  @keyframes spin {
    0% { transform: rotate(0deg)}
    100% {
      transform: rotate(360deg)}
  }
  /* Responsive adjustments */
  @media (max-width: 768px) {
    .placeholder-content {
      gap: 8px}
    .loading-spinner {
      width: 24px
     ;height: 24px
      border-width: 2px}
    .loading-text {
      font-size: 12px}
  }
  /* Dark theme optimizations */
  @media (prefers-color-scheme: dark) {
    .lazy-loader-placeholder {
      background: linear-gradient(
        90deg,
        rgba(255, 255, 255, 0.05) 25%,
        rgba(255, 255, 255, 0.1) 50%,
        rgba(255, 255, 255, 0.05) 75%
      )}
  }
  /* High contrast mode */
  @media (prefers-contrast: high) {
    .lazy-loader-placeholder {
      border: 2px solid currentColor}
    .loading-spinner {
      border-color: currentColor
      border-top-color: transparent}
  }
  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .loading-spinner {
      animation: none}
    .lazy-loader-placeholder { animation: none}
  }
</style>


