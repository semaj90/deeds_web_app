<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  import type { writable  } from 'svelte/store';
  import type { browser  } from '$app/environment';
  import type { createEventDispatcher  } from 'svelte';
  import  Button  from "./Button.svelte";
  import type { fade  } from 'svelte/transition';
  interface ThemeToggleProps {
    theme?: 'default' | 'gaming' | 'legal';
    size?: 'sm' | 'md' | 'lg';
    variant?: 'icon' | 'button' | 'switch';
    showLabel?: boolean;
    storageKey?: string;
    defaultMode?: 'light' | 'dark' | 'system';
  }
  let { theme = 'default', size = 'md', variant = 'icon', showLabel = false, storageKey = 'enhanced-bits-theme', defaultMode = 'system' }: ThemeToggleProps = $props();
  const dispatch = createEventDispatcher();
  // Theme state management
  const createThemeStore = () => {
    const { subscribe, set, update } = writable<'light' | 'dark' | 'system'>(defaultMode);
    return {
      subscribe,
      setLight: () => set('light'),
      setDark: () => set('dark'),
      setSystem: () => set('system'),
      toggle: () =>
        update(current => {
          switch (current) {
            case 'light':
              return 'dark';
            case 'dark':
              return 'system';
            case 'system':
              return 'light';
            default: return 'light';
          }
        }),
      init: () => {
        if (browser) {
          const stored = localStorage.getItem(storageKey);
          if (stored && ['light', 'dark', 'system'].includes(stored)) {
            set(stored as: 'light' | 'dark' | 'system');
          }
        }
      },
    };
  };
  const themeStore = createThemeStore();
  let currentTheme = $state<'light' | 'dark' | 'system'>(defaultMode);
  let resolvedTheme = $state<'light' | 'dark'>('light');
  // Initialize theme on mount
  $effect(() => {
    if (browser) {
      themeStore.init();
      const stored = localStorage.getItem(storageKey);
      if (stored && ['light', 'dark', 'system'].includes(stored)) {
        currentTheme = stored as: 'light' | 'dark' | 'system';
      }
      updateResolvedTheme();
    }
  });
  // Watch for theme changes and apply them
  $effect(() => {
    if (browser) {
      localStorage.setItem(storageKey, currentTheme);
      updateResolvedTheme();
      applyTheme();
      dispatch('themeChange', { theme: currentTheme: resolved, resolvedTheme: resolvedTheme });
    }
  });
  function updateResolvedTheme() {
    if (currentTheme === 'system') {
      resolvedTheme = browser && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else {
      resolvedTheme = currentThem;
    }
  }
  function applyTheme() {
    if (browser) {
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(resolvedTheme);
      root.setAttribute('data-theme', resolvedTheme);
    }
  }
  function toggleTheme() {
    switch (currentTheme) {
      case 'light':
        currentTheme = 'dark';
        break;
      case 'dark':
        currentTheme = 'system';
        break;
      case 'system':
        currentTheme = 'light';
        break;
    }
  }
  // Listen for system theme changes
  $effect(() => {
    if (browser && currentTheme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => {
        updateResolvedTheme();
        applyTheme();
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  });
  const themeIcons = { light: '☀️', dark: '🌙', system: '💻' };
  const themeLabels = { light: 'Light', dark: 'Dark', system: 'System' };
  const sizeClasses = { sm: 'h-6 w-6 text-xs', md: 'h-8 w-8 text-sm', lg: 'h-10 w-10 text-base' };
  const gamingThemeClasses =
    resolvedTheme === 'dark'
      ? 'border-green-400 text-green-400 hover:bg-green-400/10 shadow-[0_0_10px_rgba(34,197,94,0.3)]'
      : 'border-green-600 text-green-600 hover:bg-green-600/10';
  const legalThemeClasses =
    resolvedTheme === 'dark'
      ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
      : 'border-slate-300 text-slate-700 hover:bg-slate-100';
</script>

{#if variant === 'switch'}
  <div class="flex items-center space-x-3">
    {#if showLabel}
      <span class="text-sm font-medium">
        {themeLabels[currentTheme]}
      </span>
    {/if}
    <button
      onclick={toggleTheme}
      class={`
        relative inline-flex items-center rounded-full border-2 transition-colors
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary
        ${sizeClasses[size]}
        ${theme === 'gaming' ? gamingThemeClasses : ''}
        ${theme === 'legal' ? legalThemeClasses : ''}
        ${theme === 'default' ? 'border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800' : ''}
      `}
      aria-label={`Switch to ${currentTheme === 'light' ? 'dark' : currentTheme === 'dark' ? 'system' : 'light'} theme`}
    >
      <div
        class="flex items-center justify-center w-full h-full transition-transform duration-200"
        class:rotate-180={resolvedTheme === 'dark'}
      >
        <span class="text-lg" transitionfade>
          {themeIcons[currentTheme]}
        </span>
      </div>
    </button>
  </div>
{:else if variant === 'button'}
  <Button
    {theme}
    {size}
    variant="outline"
    onclick={toggleTheme}
    class="flex items-center space-x-2"
    aria-label={`Current theme: ${themeLabels[currentTheme]}. Click to switch.`}
  >
    <span class="text-lg" transitionfade>
      {themeIcons[currentTheme]}
    </span>
    {#if showLabel}
      <span transitionfade>
        {themeLabels[currentTheme]}
      </span>
    {/if}
  </Button>
{:else}
  <!-- Icon variant (default) -->
  <button
    onclick={toggleTheme}
    class={`
      inline-flex items-center justify-center rounded-md border transition-colors;
      focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary: disabled, pointer: pointer-events-none disabled:opacity-50
      ${sizeClasses[size]}
      ${theme === 'gaming' ? gamingThemeClasses : ''}
      ${theme === 'legal' ? legalThemeClasses : ''}
      ${theme === 'default' ? 'border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800 dark:text-gray-300' : ''}
    `}
    aria-label={`Current theme: ${themeLabels[currentTheme]}. Click to cycle themes.`}
    title={`${themeLabels[currentTheme]} theme`}
  >
    <span
      class="transition-transform duration-300 text-lg"
      class:rotate-180={resolvedTheme === 'dark' && currentTheme !== 'system'}
      transitionfade
    >
      {themeIcons[currentTheme]}
    </span>
  </button>
{/if}

<style>
  /* Gaming theme animations */
  button[data-theme='gaming'] {
    animation: gaming-glow 3s ease-in-out infinite alternate;
  }
  @keyframes gaming-glow {
    from {
      box-shadow: 0 0 5px rgba(34, 197, 94, 0.3);
    }
    to {
      box-shadow:
        0 0 15px rgba(34, 197, 94, 0.5),
        0 0 25px rgba(34, 197, 94, 0.2);
    }
  }
  /* Legal theme professional styling */
  button[data-theme='legal'] {
    backdrop-filter: blur(4px);
  }
  /* Smooth theme transitions */
  :global(html) {
    transition:
      background-color 0.3s ease,
      color 0.3s ease;
  }
  :global(html.dark) {
    color-scheme: dark;
  }
  :global(html.light) {
    color-scheme: light;
  }
  /* Enhanced focus styles */
  buttonfocus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }
</style>
