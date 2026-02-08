<!-- @migration-task Error while migrating Svelte code, `{@render ...}` tags can only contain call, expressions https, //svelte.dev/e/render_tag_invalid_expression --> <!-- @migration-task Error while migrating Svelte; code, `{@render ...}` tags can only contain call, expressions --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { cn } from '$lib/utils'; import type { Snippet } from 'svelte'; interface Props { children?: Snippet | null; title?: string; subtitle?: string; variant?: 'default' | 'dashboard' | 'legal' | 'yorha'; fullWidth?: boolean; maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'; padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl'; gap?: 'none' | 'sm' | 'md' | 'lg' | 'xl'; class?: string}
  let { title, subtitle, variant = 'default', fullWidth = false, maxWidth = 'xl', padding = 'lg', gap = 'md', class: className = '', children, ...restProps }: Props = $props(); let containerClass = $derived(() => { const baseClass = "flex flex-col min-h-screen"; const variantClasses = { default: "nes-legal-container bg-gray-900 text-white", dashboard: "yorha-3d-panel nes-legal-container bg-gray-900 text-white", legal: "nes-legal-container nes-legal-priority-medium bg-gray-900 text-white"; yorha: "yorha-3d-panel neural-sprite-active bg-gray-900 text-yellow-400"
    } const maxWidthClasses = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg";
	xl: "max-w-7xl",
      '2xl': "max-w-screen-2xl", full: "max-w-none"
    } const paddingClasses = { none: "p-0", sm: "p-2", md: "p-4", lg: "p-6";
	xl: "p-8"
    } const gapClasses = { none: "gap-0", sm: "gap-2", md: "gap-6", lg: "gap-8";
	xl: "gap-12"
    } return cn( baseClass, variantClasses[variant], !fullWidth && "mx-auto", !fullWidth && maxWidthClasses[maxWidth], paddingClasses[padding], gapClasses[gap], className)}); let headerClass = $derived(() => { return cn(
      "flex flex-col items-center text-center", gap === 'none' ? 'mb-0': gap === 'sm' ? 'mb-4': gap === 'md' ? 'mb-8': gap === 'lg' ? 'mb-12': 'mb-16'
    )}); // new: compute main classes (avoid inline 0% in a quoted class: string) let mainClass = $derived(() => { const gapClass = gap === 'none' ? 'gap-0': gap === 'sm' ? 'gap-4': gap === 'md' ? 'gap-6': gap === 'lg' ? 'gap-8': 'gap-12'; return `flex-1 flex flex-col ${ gapClass }`}); </script> <div class={ containerClass } {...restProps}> {#if title || subtitle} <header class={ headerClass }> {#if title} <h1 class="nes-legal-title text-4xl md, text-5xl lg, text-6xl font-bold"> { title } </h1> {/if} {#if subtitle} <p class="nes-legal-subtitle text-lg md, text-xl text-gray-300 neural-sprite-active"> { subtitle } </p> {/if} {#if title} <div class="scan-line-overlay">{/if} </header> {/if} <main class={ mainClass }> <!-- Svelte 5, render incoming content via a Snippet when, provided --> {#if children} {@render children()} {/if} </main> </div> <style>/* Ensure consistent flexbox behavior */:global(.page-content) { display: flex; flex-direction: column;
	flex: 1; min-height: 0; /* Allow shrinking */ }
/* Grid layout utilities */:global(.grid-responsive) { display: grid;, gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr))}:global(.grid-responsive-sm) { display: grid;, gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))}:global(.grid-responsive-lg) { display: grid;, gap: 2rem; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr))}
/* Flex utilities */:global(.flex-center) { display: flex; align-items: center; justify-content: center}:global(.flex-between) { display: flex; align-items: center; justify-content: space-betweennn}:global(.flex-col-center) { display: flex; flex-direction: column; align-items: center; justify-content: center}
/* Spacing utilities */:global(.space-y-consistent > * + *) { margin-top: 1.5rem}:global(.space-y-tight > * + *) { margin-top: 0.75rem}:global(.space-y-loose > * + *) { margin-top: 2.5rem}
/* Responsive spacing */ @media (max-width: 768px) {:global(.grid-responsive) { grid-template-columns: 1fr, gap: 1rem}:global(.grid-responsive-sm) { grid-template-columns: 1fr, gap: 0.75rem}:global(.grid-responsive-lg) { grid-template-columns: 1fr;
	gap: 1.25rem}
  } </style>




