import extractorSvelte from '@unocss/extractor-svelte';
import { defineConfig, presetUno, presetIcons, presetTypography, presetWebFonts } from 'unocss';

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons(),
    presetTypography(),
    presetWebFonts({
      fonts: {
        sans: 'Inter:400,500,600,700',
        mono: 'JetBrains Mono:400,500,600',
      },
    }),
  ],
  extractors: [extractorSvelte()],
  theme: {
    colors: {
      accent: '#5ea0ff',
      legal: '#f0b35a',
      sand: '#f4f4f5',
      'app-bg': '#0b0e12',
      panel: '#11161d',
      panelSoft: '#161c24',

      // YoRHa theme
      'yorha-primary': '#e0e0e0',
      'yorha-secondary': '#b0b0b0',
      'yorha-background': '#0a0a0a',
      'yorha-surface': '#1a1a1a',
      'yorha-text': '#e0e0e0',
      'yorha-border': '#606060',
      'yorha-accent': '#ffd700',

      // NES Command Center theme (beige/noir aesthetic)
      'nes-bg': '#212529',
      'nes-panel': '#2c3035',
      'nes-accent': '#f8f4e3',
      'nes-accent2': '#ffcc66',
      'nes-danger': '#ff5c5c',
      'nes-success': '#4ade80',
      'nes-warning': '#fbbf24',
      'nes-text': '#f8f4e3',
      'nes-border': '#f8f4e3',
      'nes-muted': '#6b7280',

      // YoRHa Detective beige variant
      'yorha-beige': '#c4b998',
      'yorha-beige-dark': '#a89f7c',
      'yorha-noir': '#1a1a1a',
      'yorha-noir-light': '#2d2d2d',
    },
    fontFamily: {
      sans: ['Inter', 'system-ui', 'sans-serif'],
      nes: ['"Press Start 2P"', 'system-ui', 'monospace'],
      mono: ['JetBrains Mono', 'Consolas', 'monospace'],
    },
  },
  shortcuts: {
    'app-shell': 'min-h-screen bg-[#0b0e12] text-zinc-100',
    'app-bg': 'bg-[#0b0e12] text-zinc-100',
    panel: 'rounded-2xl border border-white/8 bg-panel shadow-lg shadow-black/20',
    'panel-header': 'flex items-center justify-between gap-3 px-4 py-3 border-b border-white/8',
    'panel-body': 'p-4',
    muted: 'text-zinc-400',
    badge:
      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border border-white/10 bg-white/6',
    btn: 'inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition',
    'btn-primary': 'btn bg-blue-500 text-white hover:bg-blue-400',
    'btn-ghost': 'btn bg-white/6 hover:bg-white/10',
    input:
      'w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-blue-400',

    // ═══════════════════════════════════════════════════════════════════════
    // NES COMMAND CENTER SCREEN
    // ═══════════════════════════════════════════════════════════════════════
    'screen-nes':
      'min-h-screen p-4 flex flex-col gap-4 bg-nes-bg text-nes-text font-mono text-xs sm:text-sm',
    'screen-nes-header': 'flex items-center justify-between gap-4 flex-wrap',
    'screen-nes-title': 'text-base sm:text-lg tracking-[0.1em] uppercase font-bold',
    'screen-nes-subtitle': 'text-[10px] sm:text-xs text-nes-muted',
    'screen-nes-controls': 'flex flex-wrap items-center gap-3',
    'screen-nes-meta': 'ml-auto text-[10px] text-nes-muted',

    // ═══════════════════════════════════════════════════════════════════════
    // NES PANELS
    // ═══════════════════════════════════════════════════════════════════════
    'nes-panel':
      'border-4 border-nes-border bg-nes-panel shadow-[0_0_0_1px_rgba(0,0,0,0.8)] rounded-none',
    'nes-panel-scroll': 'flex-1 overflow-hidden flex flex-col',
    'nes-panel-header':
      'grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] px-3 py-2 border-b-4 border-nes-border bg-nes-bg text-[10px] uppercase tracking-wide',
    'nes-panel-body': 'h-[calc(100vh-220px)] overflow-auto text-[11px]',
    'nes-panel-dark': 'border-4 border-nes-muted bg-nes-bg/80',

    // ═══════════════════════════════════════════════════════════════════════
    // NES ROWS & GRID
    // ═══════════════════════════════════════════════════════════════════════
    'nes-row':
      'grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center px-3 py-2 border-b border-black/60 hover:bg-black/30 transition-colors',
    'nes-path': 'font-mono truncate text-nes-accent2',
    'nes-files': 'text-[10px] text-nes-muted leading-snug truncate',
    'nes-tags': 'flex flex-wrap gap-1',
    'nes-actions': 'flex justify-end gap-2',

    // ═══════════════════════════════════════════════════════════════════════
    // NES BADGES
    // ═══════════════════════════════════════════════════════════════════════
    'nes-badge':
      'px-2 py-0.5 border-2 border-nes-border bg-nes-bg text-[9px] uppercase tracking-wide',
    'nes-badge-api':
      'px-2 py-0.5 border-2 border-nes-accent2 bg-nes-accent2/20 text-nes-accent2 text-[9px] uppercase',
    'nes-badge-ace':
      'px-2 py-0.5 border-2 border-cyan-400 bg-cyan-400/20 text-cyan-400 text-[9px] uppercase',
    'nes-badge-success':
      'px-2 py-0.5 border-2 border-nes-success bg-nes-success/20 text-nes-success text-[9px] uppercase',
    'nes-badge-danger':
      'px-2 py-0.5 border-2 border-nes-danger bg-nes-danger/20 text-nes-danger text-[9px] uppercase',
    'nes-badge-warning':
      'px-2 py-0.5 border-2 border-nes-warning bg-nes-warning/20 text-nes-warning text-[9px] uppercase',

    // ═══════════════════════════════════════════════════════════════════════
    // NES INPUTS
    // ═══════════════════════════════════════════════════════════════════════
    'nes-input':
      'px-3 py-2 border-4 border-nes-border bg-nes-panel text-nes-text font-mono text-[10px] focus:outline-none focus:border-nes-accent2 placeholder:text-nes-muted',
    'nes-select':
      'px-3 py-2 border-4 border-nes-border bg-nes-panel text-nes-text font-mono text-[10px] focus:outline-none cursor-pointer',
    'nes-textarea':
      'px-3 py-2 border-4 border-nes-border bg-nes-panel text-nes-text font-mono text-[10px] focus:outline-none focus:border-nes-accent2 resize-none',

    // ═══════════════════════════════════════════════════════════════════════
    // NES BUTTONS
    // ═══════════════════════════════════════════════════════════════════════
    'nes-btn':
      'inline-flex items-center justify-center px-3 py-2 border-4 border-black bg-nes-accent text-black font-mono text-[10px] tracking-wide active:translate-y-[1px] transition-transform cursor-pointer',
    'nes-btn-primary': 'bg-nes-accent2 hover:bg-yellow-300 border-black',
    'nes-btn-danger': 'bg-nes-danger hover:bg-red-400 border-black text-white',
    'nes-btn-success': 'bg-nes-success hover:bg-green-400 border-black text-black',
    'nes-btn-ghost': 'bg-transparent border-nes-border text-nes-text hover:bg-nes-border/20',
    'nes-btn-sm': 'px-2 py-1 text-[9px]',
    'nes-btn-lg': 'px-4 py-3 text-[12px]',

    // ═══════════════════════════════════════════════════════════════════════
    // NES STATUS INDICATORS
    // ═══════════════════════════════════════════════════════════════════════
    'nes-status': 'flex items-center gap-2 text-[10px]',
    'nes-status-dot': 'w-2 h-2 rounded-full',
    'nes-status-online': 'bg-nes-success animate-pulse',
    'nes-status-offline': 'bg-nes-danger',
    'nes-status-pending': 'bg-nes-warning animate-pulse',

    // ═══════════════════════════════════════════════════════════════════════
    // NES DIALOG/MODAL
    // ═══════════════════════════════════════════════════════════════════════
    'nes-dialog': 'fixed inset-0 z-50 flex items-center justify-center bg-black/80',
    'nes-dialog-content': 'nes-panel p-6 max-w-2xl w-full max-h-[80vh] overflow-auto',
    'nes-dialog-title': 'text-lg font-bold text-nes-accent2 mb-4 uppercase tracking-wide',
    'nes-dialog-close': 'absolute top-4 right-4 nes-btn nes-btn-ghost p-2',

    // ═══════════════════════════════════════════════════════════════════════
    // NES SIDEBAR (YoRHa Detective style)
    // ═══════════════════════════════════════════════════════════════════════
    'nes-sidebar': 'w-48 bg-yorha-beige-dark border-r-4 border-nes-border flex flex-col',
    'nes-sidebar-header': 'p-4 border-b-4 border-nes-border',
    'nes-sidebar-title': 'text-sm font-bold uppercase tracking-wider text-nes-bg',
    'nes-sidebar-nav': 'flex-1 p-2 space-y-1',
    'nes-sidebar-item':
      'w-full px-3 py-2 text-left text-[10px] uppercase tracking-wide text-nes-bg hover:bg-nes-bg/20 transition-colors',
    'nes-sidebar-item-active': 'bg-nes-bg text-nes-accent',

    // ═══════════════════════════════════════════════════════════════════════
    // NES CARDS (for route items)
    // ═══════════════════════════════════════════════════════════════════════
    'nes-card': 'nes-panel p-4 hover:border-nes-accent2 transition-colors',
    'nes-card-header': 'flex items-start justify-between mb-2',
    'nes-card-title': 'font-bold text-nes-accent truncate',
    'nes-card-subtitle': 'text-[10px] text-nes-muted',
    'nes-card-body': 'text-[11px] text-nes-text/80',
    'nes-card-footer': 'mt-3 pt-3 border-t border-nes-border/30 flex gap-2',

    // ═══════════════════════════════════════════════════════════════════════
    // NES PROGRESS BAR
    // ═══════════════════════════════════════════════════════════════════════
    'nes-progress': 'h-4 bg-nes-bg border-4 border-nes-border overflow-hidden',
    'nes-progress-bar': 'h-full bg-nes-accent2 transition-all',
    'nes-progress-bar-success': 'bg-nes-success',
    'nes-progress-bar-danger': 'bg-nes-danger',

    // ═══════════════════════════════════════════════════════════════════════
    // NES STATS BOXES
    // ═══════════════════════════════════════════════════════════════════════
    'nes-stat': 'nes-panel p-4 text-center',
    'nes-stat-value': 'text-2xl font-bold text-nes-accent2',
    'nes-stat-label': 'text-[10px] text-nes-muted uppercase tracking-wide mt-1',

    // ═══════════════════════════════════════════════════════════════════════
    // YORHA DETECTIVE BEIGE THEME OVERRIDES
    // ═══════════════════════════════════════════════════════════════════════
    'yorha-screen': 'min-h-screen bg-yorha-beige text-yorha-noir font-mono',
    'yorha-panel': 'bg-yorha-noir border-4 border-yorha-noir text-yorha-beige',
    'yorha-panel-beige': 'bg-yorha-beige-dark border-4 border-yorha-noir text-yorha-noir',

    // ═══════════════════════════════════════════════════════════════════════
    // POKÉMON WATERCOLOR FRAME (for modals)
    // ═══════════════════════════════════════════════════════════════════════
    // Outer frame: watercolor-ish RGB corners like Red / Blue / Green
    'pkmn-water-frame':
      'relative max-w-xl w-full mx-auto p-[3px] rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.5)] ' +
      'bg-[radial-gradient(circle_at_0_0,#ff4d4d_0,#ff4d4d_20%,transparent_60%),' +
      'radial-gradient(circle_at_100%_0,#4dd0ff_0,#4dd0ff_20%,transparent_60%),' +
      'radial-gradient(circle_at_0_100%,#4dff7a_0,#4dff7a_20%,transparent_60%)]',

    // Inner NES panel inside the watercolor border
    'pkmn-water-inner':
      'nes-panel rounded-lg border-4 border-nes-border bg-nes-panel/95 backdrop-blur-sm',

    // Modal header / body styling
    'pkmn-modal-header':
      'flex items-center justify-between gap-3 mb-3 pb-2 border-b border-nes-border/60',
    'pkmn-modal-title': 'screen-nes-title text-xs sm:text-sm',
    'pkmn-modal-subtitle': 'screen-nes-subtitle',
    'pkmn-modal-body': 'space-y-2 text-[10px] sm:text-[11px] leading-relaxed',
    'pkmn-modal-grid':
      'mt-2 grid grid-cols-[minmax(0,2.2fr)_minmax(0,2.4fr)_minmax(0,2fr)] gap-y-1 gap-x-3 text-[10px]',
    'pkmn-modal-heading-row': 'font-bold uppercase tracking-[0.12em] text-[9px] opacity-80',
  },
});
