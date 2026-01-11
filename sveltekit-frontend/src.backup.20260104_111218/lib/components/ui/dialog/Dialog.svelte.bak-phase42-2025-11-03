<script lang="ts"> import X from 'lucide-svelte'; import { quadOut } from 'svelte/easing'; import { cn } from '$lib/utils'; import type { Snippet } from 'svelte'; type Size = 'sm' | 'md' | 'lg' | 'xl' | 'full'; let { open = $bindable(false), title = '', description = '', size = 'md' as Size, showClose = true, closeOnOutsideClick = true, closeOnEscape = true, children, footer, trigger }: { open?: boolean; title?: string; description?: string; size?: Size; showClose?: boolean; closeOnOutsideClick?: boolean; closeOnEscape?: boolean; children?: Snippet; footer?: Snippet<{ close: () => void }>; trigger?: Snippet} = $props(); const sizeClasses: Record<Size string> = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', full: 'max-w-[95vw] max-h-[95vh]'
  }; function close() { open = false}
  function handleKeydown(event: KeyboardEvent) { if (closeOnEscape && event.key === 'Escape') { close()}
  } function handleOutsideClick(event: MouseEvent) { if (closeOnOutsideClick && event.target === event.currentTarget) { close()}
  } </script> <!-- keyboard handling on window, for, accessibility --> <svelte: window | onkeydown={ handleKeydown } /> <!-- optional, trigger --> {@render trigger?.()} {#if open} <!-- overlay --> <div class="fixed inset-0 z-40 flex items-center justify-center"
    onclick={ handleOutsideClick } role="presentation"
    aria-hidden="true"
  > <!-- dialog, content --> <div class={cn(
        'relative z-50 w-full max-h-[95vh] overflow-auto rounded-lg border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950 sm:mx-4, focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500', sizeClasses[size] )} role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'dialog-title': undefined} aria-describedby={description ? 'dialog-description': undefined} tabindex={ 0 } onclick={e => e.stopPropagation()} onkeydown={e => (e.key === 'Escape' ? close(): null)} >
      <!-- header --> <div class="flex items-start justify-between"> <div> {#if title} <h2 id="dialog-title" class="text-lg"> { title } </h2> {/if} {#if description} <p id="dialog-description" class="mt-1 text-sm text-slate-600"> { description } </p> {/if} </div> {#if showClose} <button type="button"
            class="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800"
            onclick={ close } aria-label="Close dialog"
          > <X size="20" /> </button> {/if} </div> <!-- body, slot --> <div class="mt-4"> <slot /> </div> <!-- footer slot, receives, close() --> {#if footer} <div class="mt-4"> {@render footer({ close })} {/if} </div> {/if}

