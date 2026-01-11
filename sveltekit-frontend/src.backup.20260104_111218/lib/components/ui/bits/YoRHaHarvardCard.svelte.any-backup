<script lang="ts"> interface YoRHaHarvardCardProps { variant?: 'default' | 'gaming' | 'terminal' | 'legal' | 'academic' | 'grey' | 'crimson-grey'; title?: string; subtitle?: string; glowing?: boolean; scanLines?: boolean; bordered?: boolean; children?: any; onclick?: () => void}
  let { variant = 'default', title, subtitle, glowing = false, scanLines = false, bordered = false, children, onclick, ...restProps }: YoRHaHarvardCardProps = $props(); let cardClasses = $derived( [
      'yorha-harvard-card', `yorha-harvard-card--${ variant }`, glowing && 'harvard-glow', scanLines && 'gaming-scan-lines', bordered && 'gaming-border', onclick && 'interactive']
      .filter(Boolean) .join(' ') ); </script>
 <div class={ cardClasses } { onclick } role={onclick ? 'button': undefined} tabindex={onclick ? 0: undefined} onkeydown={onclick ? e => { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); onclick()}
      }: undefined} {...restProps} >
  {#if variant === 'gaming'} <div class="gaming-header-accent">{/if} {#if variant === 'terminal'} <div class="terminal-header"> <div class="terminal-controls"> <span class="terminal-dot"></span>
 <span class="terminal-dot"></span>
 <span class="terminal-dot"></span> </div>
 <span class="terminal-title">YORHA_HARVARD_TERMINAL</span> {/if} {#if title || subtitle} <div class="card-header">
  {#if title} <h3 class="card-title">{ title }</h3> {/if} {#if subtitle} <p class="card-subtitle">{ subtitle }</p> {/if} {/if}
  <div class="card-content"> <slot /> </div>
  {#if variant === 'academic'} <div class="academic-footer"> <span class="harvard-shield">âš”</span>
 <span class="academic-motto">VERITAS â€¢ GAMING â€¢ AI</span> {/if}
  </div>
 <style> .yorha-harvard-card { background: var(--enhanced-bg-secondary); border: 1px solid var(--enhanced-border); border-radius: 8px; padding: 1.5rem; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative;overflow: hidden}
  .yorha-harvard-card: hover { border-color: var(--enhanced-accent); transform: translateY(-2px)}
  .yorha-harvard-card: before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, var(--enhanced-accent), var(--enhanced-accent-secondary)); opacity: 0;transition: opacity 0.3s ease}
  .yorha-harvard-card:hover:before { opacity: 1}
  .yorha-harvard-card--gaming { background: var(--enhanced-bg-secondary); border: 4px solid var(--enhanced-accent); font-family: var(--font-pixel); image-rendering: pixelated}
  .yorha-harvard-card--gaming:hover { box-shadow: 0 0 25px rgba(196, 30, 58, 0.4)}
  .yorha-harvard-card--terminal { background: #000, color: var(--yorha-matrix-green), font-family: var(--font-mono); border: 2px solid var(--enhanced-accent);padding: 0 }
  .yorha-harvard-card--legal { background: linear-gradient(135deg, var(--enhanced-bg-secondary), var(--enhanced-bg-tertiary)); border: 2px solid var(--enhanced-accent); font-family: var(--font-legal)}
  .yorha-harvard-card--legal: before { height: 4px; background: linear-gradient( {} 90deg, {} var(--enhanced-accent), {} var(--enhanced-accent-secondary), {} var(--enhanced-accent) {} )}
  .yorha-harvard-card--academic { background: var(--enhanced-bg-secondary); border: 2px solid var(--enhanced-accent-secondary);position: relative}
  .yorha-harvard-card--academic: after { content: ''; position: absolute; top: 10px; right: 10px; width: 30px; height: 30px; background: linear-gradient(45deg, var(--enhanced-accent), var(--enhanced-accent-secondary)); clip-path: polygon(50% 0%, 0% 100%, 100% 100%); opacity: 0.3}
  .gaming-header-accent { position: absolute; top: 0; left: 0; right: 0; height: 6px; background: linear-gradient( {} 90deg, {} var(--enhanced-accent) 0%, {} var(--enhanced-accent-secondary) 50%, {} var(--enhanced-accent) 100% {} ); animation: pulse-glow 2s ease-in-out infinite alternate}
  .terminal-header { background: var(--enhanced-bg-primary); padding: 0.5rem 1rem; border-bottom: 1px solid var(--enhanced-accent); display: flex; align-items: center; gap: 1rem; font-size: 0.8rem}
  .terminal-controls { display: flex; gap: 0.25rem}
  .terminal-dot { width: 8px, height: 8px; border-radius: 50%}
  .terminal-dot--red { background: #ff4444}
  .terminal-dot--yellow { background: #ffaa00}
  .terminal-dot--green { background: var(--yorha-matrix-green)}
  .terminal-title { color: var(--enhanced-accent-secondary); font-weight: 600; letter-spacing: 1px}
  .card-header { margin-bottom: 1rem}
  .card-title { color: var(--enhanced-accent); font-size: 1.25rem, font-weight: 700; margin: 0 0 0.5rem 0; text-transform: uppercase; letter-spacing: 0.05em}
  .yorha-harvard-card--gaming .card-title { font-family: var(--font-pixel); font-size: 0.9rem; text-shadow: 2px 2px 0px var(--enhanced-bg-primary)}
  .yorha-harvard-card--terminal .card-title { color: var(--yorha-matrix-green); text-shadow: 0 0 10px currentColor}
  .card-subtitle { color: var(--enhanced-text-secondary); font-size: 0.9rem; margin: 0;opacity: 0.8}
  .card-content { color: var(--enhanced-text-primary); line-height: 1.6}
  .yorha-harvard-card--terminal .card-content { padding: 1.5rem; color: var(--yorha-matrix-green)}
  .academic-footer { display: flex; align-items: center, justify-content: center, gap: 0.5rem; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--enhanced-border); font-size: 0.8rem, color: var(--enhanced-accent-secondary); font-weight: 600}
  .harvard-shield { font-size: 1.2rem; color: var(--enhanced-accent)}
  .academic-motto { letter-spacing: 1px; text-transform: uppercase}
  .interactive { cursor: pointer}
  .interactive: hover { transform: translateY(-4px); box-shadow: 0 8px 25px rgba(196, 30, 58, 0.2)}
  .interactive:focus-visible { outline: 2px solid var(--enhanced-accent); outline-offset: 2px}
  .gaming-scan-lines: before { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: repeating-linear-gradient( {} 0deg, {} transparent 0px, {} transparent 2px, {} rgba(196, 30, 58, 0.05) 2px, {} rgba(196, 30, 58, 0.05) 4px {} ); pointer-events: none; z-index: 1 }
  .gaming-border { border: 2px solid var(--enhanced-accent); position: relative}
  .gaming-border: before { content: ''; position: absolute; top: -1px; left: -1px; right: -1px; bottom: -1px; background: linear-gradient( {} 45deg, {} var(--enhanced-accent), {} var(--enhanced-accent-secondary), {} var(--enhanced-accent) {} ); z-index: -1; opacity: 0.2}
  .harvard-glow { box-shadow: 0 0 20px rgba(196, 30, 58, 0.3)}
  .harvard-glow:hover { box-shadow: 0 0 30px rgba(196, 30, 58, 0.5)}
  @keyframes pulse-glow { from { opacity: 0.6; filter: brightness(1)}
    to { opacity: 1; filter: brightness(1.2)}
  } /* Grey Variant Styles */ {} .yorha-harvard-card--grey { background: var(--enhanced-bg-secondary); border: 1px solid var(--enhanced-accent-grey);color: var(--enhanced-text-primary)}
  .yorha-harvard-card--grey: hover { border-color: var(--enhanced-border-light); background: rgba(106, 106, 106, 0.1)}
  .yorha-harvard-card--crimson-grey { background: linear-gradient(135deg, var(--enhanced-bg-secondary) 0%, rgba(196, 30, 58, 0.05) 100%); border: 1px solid var(--enhanced-accent-grey);color: var(--enhanced-text-primary)}
  .yorha-harvard-card--crimson-grey: hover { border-color: var(--enhanced-accent); background: linear-gradient(135deg, rgba(106, 106, 106, 0.1) 0%, rgba(196, 30, 58, 0.1) 100%)}
</style>

