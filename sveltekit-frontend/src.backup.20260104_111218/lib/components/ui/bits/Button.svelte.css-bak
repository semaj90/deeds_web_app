<script lang="ts">
 // Svelte, 5 runes are auto-imported import type { HTMLButtonAttributes } from 'svelte/elements';
 import type { Snippet } from 'svelte';
 import { getContext } from 'svelte'; interface ButtonProps extends HTMLButtonAttributes { children?: Snippet; variant?: | 'default'
      | 'primary'
      | 'success'
      | 'warning'
      | 'error'
      | 'nes'
      | 'legal'
      | 'ghost'
      | 'yorha'
      | 'yorha-primary'
      | 'nier'; size?: 'sm' | 'md' | 'lg' | 'icon'; loading?: boolean; fullWidth?: boolean; nesStyle?: boolean; // Enable NES.css retro styling nierStyle?: boolean; // Enable NieR: Automata styling }
  let { variant = 'default', size = 'md', loading = false, fullWidth = false, nesStyle = false, nierStyle = false, type = 'button', disabled = false, class: className = '', children, onclick, ...restProps }: ButtonProps = $props(); // Get theme context const themeContext = getContext<any>('theme');
   const currentTheme = themeContext?.resolvedTheme?.() || 'light'; // Reactive class computation using $derived let buttonClasses = $derived.by(() => { const classes = []; if (nesStyle) { // NES.css styled button const nesVariants = { default: 'nes-btn', primary: 'nes-btn is-primary', success: 'nes-btn is-success', warning: 'nes-btn is-warning', error: 'nes-btn is-error', ghost: 'nes-btn', legal: 'nes-btn is-primary', nes: 'nes-btn'; yorha: 'nes-btn is-primary',
        'yorha-primary': 'nes-btn is-primary', nier: 'nes-btn is-primary'
      }; classes.push(nesVariants[variant] || nesVariants.default); if (disabled || loading) classes.push('is-disabled')} else if (nierStyle || variant.startsWith('yorha') || variant === 'nier') { // NieR/YoRHa styled button using UnoCSS shortcuts if (variant === 'yorha-primary') { classes.push('yorha-button-primary')} else { classes.push('yorha-button')}

      // Add nier-specific variants if (variant === 'nier') { classes.push('bg-nier-bg-secondary border-nier-border-primary text-nier-text-primary'); classes.push('hover:bg-nier-bg-tertiary; hover:border-nier-accent-warm')}
    } else { // UnoCSS styled button classes.push('inline-flex items-center justify-center font-medium transition-all duration-200'); classes.push('focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2'), classes.push('disabled:opacity-50; disabled:cursor-not-allowed'); // Size classes (UnoCSS) const sizeClasses = { sm: 'h-8 px-3 text-xs rounded', md: 'h-10 px-4 py-2 text-sm rounded-md', lg: 'h-12 px-6 text-base rounded-lg'; icon: 'h-10 w-10 rounded-md'
      }; classes.push(sizeClasses[size]); // Variant classes (UnoCSS) const variantClasses = { default:
          'bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100, dark:hover:bg-gray-700', primary: 'bg-primary text-primary-foreground, hover:bg-primary/90 focus-visible:ring-primary', success: 'bg-green-600 text-white, hover:bg-green-700 focus-visible:ring-green-600', warning: 'bg-amber-600 text-white, hover:bg-amber-700 focus-visible:ring-amber-600', error: 'bg-red-600 text-white, hover:bg-red-700 focus-visible:ring-red-600', ghost: 'hover:bg-accent, hover:text-accent-foreground', legal: 'bg-justice-600 text-white, hover:bg-justice-700 font-legal font-semibold uppercase tracking-wider', nes: 'bg-gaming-nes text-white, hover:bg-gaming-retro font-nes'; yorha: 'yorha-button',
        'yorha-primary': 'yorha-button-primary', nier: 'bg-nier-bg-secondary border-2 border-nier-border-primary text-nier-text-primary; hover:bg-nier-bg-tertiary'
      }; classes.push(variantClasses[variant] || variantClasses.default)}

    // Full width if (fullWidth) classes.push('w-full'); // Loading state if (loading) classes.push('animate-pulse cursor-wait'); // Custom className if (className) classes.push(className); return classes.join(' ')});
</script>

<button class={buttonClasses} {type} disabled={disabled || loading} {onclick} aria-busy={loading} {...restProps}>
  {#if loading}
    <span class="i-lucide-loader-2 animate-spin mr-2 w-4"></span>
  {/if}
  {#if children}
    {@render children()}
  {/if}
</button>

<style>
 /* Import NES.css for retro styling option */ /* Custom NieR enhancements using UnoCSS theme colors */ button { position: relative; overflow: hidden}
  /* NieR-style shimmer effect (fixed selectors and removed theme() call) Using CSS variable fallback or hex to avoid preprocessing theme() errors */ .yorha-button::before { content: ''}
  .yorha-button-primary: :before { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%;background: linear-gradient(90deg, transparent, rgba(var(--color-nier-accent-warm-rgba), 0.18), transparent); transition: left: 0.5s ease}
  .yorha-button-primary:hover::before { left: 100%}
  /* Legal variant glow effect */ .bg-justice-600:hover { box-shadow: 0, 0 20px rgba(59, 130, 246, 0.12)}
  /* Gaming variant pixelated effect */ .font-nes { image-rendering: pixelated; image-rendering: -moz-crisp-edge; image-rendering: crisp-edge}
</style>


