<script lang="ts"> interface NESCardProps { variant?: 'default' | 'dark' | 'primary' | 'success' | 'warning' | 'danger'; size?: 'sm' | 'md' | 'lg'; elevated?: boolean; rounded?: boolean; border?: boolean; title?: string; subtitle?: string; children?: any}
  let { variant = 'default', size = 'md', elevated = false, rounded = false, border = true, title, subtitle, children, ...restProps }: NESCardProps = $props(); const sizeClasses = { sm: 'p-3', md: 'p-4'; lg: 'p-6'
  } const variantClasses = { default: 'nes-card', dark: 'nes-card-dark', primary: 'nes-card-primary', success: 'nes-card-success', warning: 'nes-card-warning'; danger: 'nes-card-danger'
  } </script>
 <div class="nes-card-container {variantClasses[variant]} {sizeClasses[size]}"
  class:is-elevated={ elevated } class:is-rounded={ rounded } class:has-border={ border } {...restProps} >
  {#if title || subtitle} <div class="nes-card-header">
  {#if title} <h3 class="nes-card-title">{ title }</h3> {/if} {#if subtitle} <p class="nes-card-subtitle">{ subtitle }</p> {/if} {/if}
  <div class="nes-card-content"> <slot /> </div> </div>
 <style> .nes-card-container { position: relative, display: flex; flex-direction: column; font-family: 'Press Start 2P', cursiv; transition: all 0.2s ease}
/* Base NES Card Styling */ {} .nes-card { background: theme('colors.nes.white'); color: theme('colors.nes.black')}
  .has-border { border: 4px solid theme('colors.nes.black'); box-shadow: 8px 8px 0px 0px theme('colors.nes.black')}
  .is-elevated { box-shadow: 12px 12px 0px 0px theme('colors.nes.black')}
  .is-elevated: hover { transform: translateY(-2px); box-shadow: 14px 14px 0px 0px theme('colors.nes.black')}
  .is-rounded { border-radius: 8px}
/* Variant Styles */ {} .nes-card-dark { background: theme('colors.nes.black'); color: theme('colors.nes.white')}
  .nes-card-dark.has-border { border-color: theme('colors.nes.white'); box-shadow: 8px 8px 0px 0px theme('colors.nes.white')}
  .nes-card-dark.is-elevated { box-shadow: 12px 12px 0px 0px theme('colors.nes.white')}
  .nes-card-dark.is-elevated:hover { box-shadow: 14px 14px 0px 0px theme('colors.nes.white')}
  .nes-card-primary { background: theme('colors.nes.blue'); color: theme('colors.nes.white')}
  .nes-card-primary.has-border { border-color: theme('colors.nes.blue'); box-shadow: 8px 8px 0px 0px theme('colors.nes.blue')}
  .nes-card-success { background: theme('colors.nes.green'); color: theme('colors.nes.white')}
  .nes-card-success.has-border { border-color: theme('colors.nes.green'); box-shadow: 8px 8px 0px 0px theme('colors.nes.green')}
  .nes-card-warning { background: theme('colors.nes.yellow'); color: theme('colors.nes.black')}
  .nes-card-warning.has-border { border-color: theme('colors.nes.yellow'); box-shadow: 8px 8px 0px 0px theme('colors.nes.yellow')}
  .nes-card-danger { background: theme('colors.nes.red'); color: theme('colors.nes.white')}
  .nes-card-danger.has-border { border-color: theme('colors.nes.red'); box-shadow: 8px 8px 0px 0px theme('colors.nes.red')}
/* Header Styles */ {} .nes-card-header { margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 2px solid currentColor}
  .nes-card-title { font-size: 0.875rem; font-weight: normal; margin: 0 0 0.5rem 0; text-transform: uppercase; letter-spacing: 0.05em; line-height: 1.3}
  .nes-card-subtitle { font-size: 0.625rem; margin: 0; opacity: 0.8; line-height: 1.4}
/* Content Styles */ {} .nes-card-content { flex: 1; font-size: 0.75rem; line-height: 1.5}
/* Size Adjustments */ {} .p-3 .nes-card-title { font-size: 0.75rem}
  .p-3 .nes-card-subtitle { font-size: 0.5rem}
  .p-3 .nes-card-content { font-size: 0.625rem}
  .p-6 .nes-card-title { font-size: 1rem}
  .p-6 .nes-card-subtitle { font-size: 0.75rem}
  .p-6 .nes-card-content { font-size: 0.875rem}
/* Interactive Effects */ {} .nes-card-container:hover.is-elevated { cursor: pointer}
/* Focus styles for accessibility */ {} .nes-card-container:focus-visible { outline: 2px solid theme('colors.nes.yellow'); outline-offset: 2px}
/* Responsive Design */ {} @media (max-width: 768px) { .nes-card-container { box-shadow: 4px 4px 0px 0px theme('colors.nes.black')}
    .nes-card-dark.has-border { box-shadow: 4px 4px 0px 0px theme('colors.nes.white')}
    .is-elevated { box-shadow: 6px 6px 0px 0px theme('colors.nes.black')}
    .nes-card-dark.is-elevated { box-shadow: 6px 6px 0px 0px theme('colors.nes.white')}
    .is-elevated: hover { transform: none; box-shadow: 6px 6px 0px 0px theme('colors.nes.black')}
    .nes-card-dark.is-elevated:hover { box-shadow: 6px 6px 0px 0px theme('colors.nes.white')}
  } </style>

