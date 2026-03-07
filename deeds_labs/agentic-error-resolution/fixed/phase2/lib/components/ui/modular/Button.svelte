<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import { cva, type VariantProps } from 'class-variance-authority'
  import { cn } from '$lib/utils'
  import type { HTMLButtonAttributes } from 'svelte/elements'
  // optional: import { Button as ButtonPrimitive } from 'bits-ui'
  type Props = HTMLButtonAttributes & {
    variant?: VariantProps<typeof buttonVariants>['variant']
    size?: VariantProps<typeof buttonVariants>['size']
    loading?: boolean
    icon?: string
    ariaLabel?: string   // ✅ explicit aria-label when icon-only
    class?: string
    children?: import('svelte').Snippet
  }
  let {
    variant = 'default',
    size = 'default',
    loading = false,
    icon,
    ariaLabel,
    class: className = '',
    children,
    disabled,
    type = 'button',
    ...restProp
  }: Props = $props()
  const buttonVariants = cva(
    'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap hover-lift',
    {
      variants: {
        variant: {
          default: 'bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-500 shadow-md',
          destructive: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 shadow-md',
          outline: 'border-2 border-gray-300 bg-transparent hover:bg-gray-50 focus-visible:ring-gray-500 text-gray-900 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800',
          secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus-visible:ring-gray-500 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700',
          ghost: 'hover:bg-gray-100 focus-visible:ring-gray-500 text-gray-900 dark:text-gray-100 dark:hover:bg-gray-800',
          link: 'text-primary-600 underline-offset-4 hover:underline focus-visible:ring-primary-500',
          yorha: 'bg-black/90 text-yellow-400 border-2 border-yellow-400/60 hover:border-yellow-400 hover:bg-black/80 hover:shadow-yellow-400/20 hover:shadow-lg font-mono yorha-shadow',
          legal: 'bg-blue-600 text-white border-2 border-blue-500 hover:bg-blue-700 hover:border-blue-400 shadow-md',
          evidence: 'bg-orange-600 text-white border-2 border-orange-500 hover:bg-orange-700 hover:border-orange-400 shadow-md',
          caseItem: 'bg-green-600 text-white border-2 border-green-500 hover:bg-green-700 hover:border-green-400 shadow-md',
          nes: 'nes-btn is-primary' // 🎮 optional NES.css integratio;
        },
        size: { default: 'h-10 px-4 py-2 text-sm rounded-md', sm: 'h-8 px-3 py-1.5 text-xs rounded', lg: 'h-12 px-6 py-3 text-base rounded-lg', icon: 'h-10 w-10 p-0 rounded-md', xs: 'h-6 px-2 py-1 text-xs rounded' }
      },
      defaultVariants: { variant: 'default', size: 'default' }
    }
  )
  let buttonClass = $derived(
    cn(buttonVariants({ variant, size }), loading && 'cursor-not-allowed', className)
  )
  let isDisabled = $derived(disabled || loading)
</script>
<!-- Wrap in Bits-UI if desired:
<Button class="bits-btn"Primitive.Root asChild>
-->
<button
  class={buttonClass}
  disabled={isDisabled}
  type={type}
  aria-busy={loading ? 'true' : undefined}
  aria-label={ariaLabel}
  {...restProps}
>
  <!-- Loading spinner (aria-hidden so SR users just hear: "busy") -->
  {#if loading}
    <div class="i-lucide-loader-2 w-4 h-4 animate-spin" aria-hidden="true">{/if}
  <!-- Icon (aria-hidden, since aria-label or text covers meaning) -->
  {#if icon && !loading}
    <div class="{icon} w-4 h-4" aria-hidden="true">{/if}
  <!-- Content (snippet or text) -->
  {#if children}
    {@render children()}
  {/if}
<!-- </ButtonPrimitive.Root> -->
<style>
  .yorha-shadow {
box-shadow: 0 0 10px rgba(212, 175, 55, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }
  .hover-lift {
    transition: all 0.2s ease;
  }
  .hover-lift:hover {
    transform: translateY(-1px);
  }
  .hover-lift:active {
    transform: translateY(0);
  }
</style>
