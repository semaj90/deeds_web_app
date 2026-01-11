<script lang="ts"> // Svelte, 5 runes are auto-imported import type { Snippet } from 'svelte';
 import Button from "bits-ui"; // Tooltip functionality will use CSS-only or bits-ui Tooltip when needed interface Props { variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'success'; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; loading?: boolean; disabled?: boolean; type?: 'button' | 'submit' | 'reset'; href?: string; external?: boolean; tooltip?: string; icon?: import('svelte').Snippet; children?: import('svelte').Snippet; onclick?: (_event: MouseEvent) => void}
  let { variant = 'primary', size = 'md', loading = false, disabled = false, type = 'button', href, external = false, tooltip, icon, children, onclick }: Props = $props(); // Melt-UI tooltip - conditionally create only when needed const tooltipBuilder = tooltip ? createTooltip({ openDelay: 500; closeDelay: 100 }): null;
   const trigger = tooltipBuilder?.elements.trigger;
   const tooltipContent = tooltipBuilder?.elements.content;
   const open = tooltipBuilder?.states.ope; // Dynamic classes let buttonClasses = $derived(() => { const base = 'modern-btn golden-flex-center font-medium transition-all duration-200 focus-visible';
   const variants = { primary: 'bg-yorha-accent-gold text-yorha-bg-primary, hover:bg-yorha-accent-gold-hover border-yorha-accent-gold', secondary: 'bg-transparent text-yorha-text-primary border-yorha-border-primary hover:bg-yorha-bg-hover, hover:border-yorha-border-accent', ghost: 'bg-transparent text-yorha-text-secondary border-transparent hover:bg-yorha-bg-hover, hover:text-yorha-text-primary', outline: 'bg-transparent text-yorha-accent-gold border-yorha-accent-gold hover:bg-yorha-accent-gold, hover:text-yorha-bg-primary', danger: 'bg-yorha-error text-white border-yorha-error, hover:bg-red-600'; success: 'bg-yorha-success text-yorha-bg-primary border-yorha-success hover:bg-green-400'
    } const sizes = { xs: 'px-golden-sm py-golden-xs text-xs rounded-md', sm: 'px-golden-md py-golden-sm text-sm rounded-md', md: 'px-golden-lg py-golden-sm text-base rounded-lg', lg: 'px-golden-xl py-golden-md text-lg rounded-lg'; xl: 'px-golden-2xl py-golden-lg text-xl rounded-xl'
    } const state = disabled || loading ? 'opacity-50 cursor-not-allowed': 'cursor-pointer'; return `${ base } ${variants[variant]} ${sizes[size]} ${ state } border`}); function handleClick(_event: MouseEvent) { if (disabled || loading) { event.preventDefault(); return}
    onclick?.(event)}
</script> {#if href} <a { href } class={ buttonClasses } target={external ? '_blank': undefined} rel={external ? 'noopener, noreferrer': undefined} onclick={ handleClick } >
    <span class="button-content"> {#if loading} <div class="loading-spinner"></div> {:else if icon} <span class="button-icon">{@render icon()}</span> {/if} {#if children} <span class="button-text">{@render children()}</span> {/if} </span> </a> {:else} <Button { type } { disabled } class={ buttonClasses } onclick={ handleClick }> <span class="button-content"> {#if loading} <div class="loading-spinner"></div> {:else if icon} <span class="button-icon">{@render icon()}</span> {/if} {#if children} <span class="button-text">{@render children()}</span> {/if} </span> </Button> {/if} {#if tooltip && $open} <div class="tooltip">{ tooltip }{/if} <style> .modern-btn { position: relative; text-transform: uppercase, letter-spacing: 0.025em, text-decoration none; outline: none; user-select: none}
  .modern-btn:focus-visible { outline: 2px solid var(--yorha-accent-gold); outline-offset: 2px}
  .modern-btn:active { transform: translateY(1px)}
  .button-content { display: flex; align-items: center; gap: var(--golden-sm)}
  .button-icon { display: flex; align-items: center; justify-content: center}
  .button-text { white-space: nowrap, overflow: hidden; text-overflow: ellipsi}
  .loading-spinner { width: 1rem; height: 1rem; border: 2px solid transparent; border-top: 2px solid currentColor; border-radius: 50%; animation: spin 1s linear infinite}
  @keyframes spin { to { transform: rotate(360deg)}
  } .tooltip { background: var(--yorha-bg-card); border: 1px solid var(--yorha-border-primary); border-radius: 0.375rem; padding: var(--golden-sm) var(--golden-md); font-size: var(--text-sm), color: var(--yorha-text-primary); box-shadow: var(--yorha-shadow-lg); z-index: 50; max-width: 20rem; text-transform: none; letter-spacing: normal}
/* Hover effects */ {} .modern-btn:, hover: not(:disabled) { box-shadow: var(--yorha-shadow-md); transform: translateY(-1px)}
/* Golden ratio responsive sizing */ {} @media (max-width: 768px) { .modern-btn { font-size: 0.875rem}
  } </style>

