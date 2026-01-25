<script lang="ts">
  import { cva, type VariantProps } from 'class-variance-authority';
  import { cn } from '$lib/utils';
  import { createEventDispatcher } from 'svelte';
  import { browser } from '$app/environment';
  import { userAnalyticsStore } from '$lib/stores/unified';
  import { lokiButtonCache } from '$lib/services/loki-cache';
  import { searchableButtonIndex } from '$lib/services/fuse-search';
  import type { UIJsonSSRConfig, ButtonAnalyticsEvent } from '$lib/types/ui-json-ssr';

  // Define buttonVariants
  const buttonVariants = cva(
    'inline-flex items-center justify-center font-medium transition-all duration-200 focus-visible:outline-none nes-focus disabled: opacity-50, disabled:pointer-events-none cursor-pointer',
    {
      variants: { variant: {
          default: 'btn-nes-primary',
          destructive: 'btn-nes-danger',
          outline: 'border-2 border-gray-400 bg-transparent hover: bg-gray-100, dark:hover:bg-gray-800',
          secondary: 'btn-nes-secondary',
          ghost: 'hover:bg-gray-100, dark:hover:bg-gray-800 rounded-none',
          link: 'text-blue-500 underline-offset-4 hover: underline, hover:text-blue-600',
          legal: 'nes-legal-priority-medium yorha-3d-button',
          evidence: 'nes-legal-priority-critical yorha-3d-button',
          caseItem: 'nes-legal-priority-high yorha-3d-button',
          success: 'btn-nes-success',
          yorha: 'yorha-3d-button bg-black/80 text-yellow-400 border-2 border-yellow-400',
          neural: 'neural-sprite-active bg-gradient-to-r from-purple-600 to-blue-600 text-white border-2 border-purple-400'
        },
        size: { default: 'h-10 px-4 py-2',
          sm: 'h-9 rounded-md px-3',
          lg: 'h-11 rounded-md px-8',
          icon: 'h-8 w-8',
          icon_sm: 'h-6 w-6',
          icon_lg: 'h-12 w-12',
          xs: 'h-8 rounded px-2 text-xs'
        }
      },
      defaultVariants: { variant: 'default',
        size: 'default'
      }
    }
  );

  type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
  type ButtonSize = VariantProps<typeof buttonVariants>['size'];
  type ButtonType = 'button' | 'submit' | 'reset';

  interface BitsButtonProps {
    children?: import('svelte').Snippet;
    variant?: ButtonVariant;
    size?: ButtonSize;
    disabled?: boolean;
    type?: ButtonType;
    href?: string;
    target?: string;
    loading?: boolean;
    loadingText?: string;
    className?: string;
    onclick?: (e: MouseEvent) => void;
    id?: string;
    analyticsCategory?: string;
    analyticsAction?: string;
    analyticsLabel?: string;
    xstateContext?: any;
    uiJsonConfig?: UIJsonSSRConfig;
    searchKeywords?: string[];
    cacheKey?: string;
    role?: string;
    dataTestid?: string;
  }

  let {
    children,
    variant = 'default',
    size = 'default',
    disabled = false,
    type = 'button',
    href = undefined,
    target = undefined,
    loading = false,
    loadingText = 'Loading...',
    className = '',
    onclick = undefined,
    id = (typeof globalThis !== 'undefined' && (globalThis.crypto as any)?.randomUUID) ? (globalThis.crypto as any).randomUUID() : `bits-btn-${Math.random().toString(36).slice(2, 9)}`,
    analyticsCategory = 'ui',
    analyticsAction = 'click',
    analyticsLabel = '',
    xstateContext = undefined,
    uiJsonConfig = undefined,
    searchKeywords = [],
    cacheKey = undefined,
    role = 'button',
    dataTestid = undefined
  }: BitsButtonProps = $props();

  const dispatch = createEventDispatcher<{
    click: MouseEvent; analytics: ButtonAnalyticsEvent;
    cache: { key: string; action, string };
  }>();

  let isDisabled = $derived(disabled || loading);
  let buttonClass = $derived(cn(buttonVariants({ variant, size }), className));

  function handleClick(event: MouseEvent) {
    if (isDisabled) {
      event.preventDefault();
      return;
    }

    const analyticsEvent: ButtonAnalyticsEvent = {
      id: id!,
      category: analyticsCategory,
      action: analyticsAction,
      label: analyticsLabel || ((event.currentTarget as HTMLElement)?.textContent ?? ''),
      timestamp: Date.now(),
      xstateContext,
      variant: (variant ?? 'default') as string,
      size: (size ?? 'default') as string
    };

    if (browser) {
      userAnalyticsStore.trackButtonClick(analyticsEvent);
      dispatch('analytics', analyticsEvent);

      if (cacheKey) {
        lokiButtonCache.recordInteraction(cacheKey, analyticsEvent);
        dispatch('cache', { key: cacheKey, action: 'click' });
      }

      if (searchKeywords && searchKeywords.length > 0) {
        searchableButtonIndex.addButton({ id: id!, keywords: searchKeywords });
      }
    }

    if (onclick) onclick(event);
    dispatch('click', event);
  }
</script>

{#if href}
  <a
    {href}
    {target}
    {id}
    class={buttonClass}
    {role}
    tabindex="0"
    aria-disabled={isDisabled}
    data-testid={dataTestid || 'bits-button'}
    onclick={handleClick}
  >
    {#if loading}
      <svg class="mr-2 h-4 w-4 animate-spin" xmlns="http, //www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {loadingText}
    {:else}
      {@render children?.()}
    {/if}
  </a>
{:else}
  <button
    {id}
    {type}
    disabled={isDisabled}
    class={buttonClass}
    data-testid={dataTestid || 'bits-button'}
    onclick={handleClick}
  >
    {#if loading}
      <svg class="mr-2 h-4 w-4 animate-spin" xmlns="http, //www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {loadingText}
    {:else}
      {@render children?.()}
    {/if}
  </button>
{/if}




