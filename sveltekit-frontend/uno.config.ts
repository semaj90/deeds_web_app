import extractorSvelte from '@unocss/extractor-svelte';
import { defineConfig, presetUno, presetIcons, presetTypography } from 'unocss';

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons(),
    presetTypography(),
    // Web fonts loaded via app.html <link> + static/fonts/ — no need for presetWebFonts
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

      // ═══ Yorha-Legal Parchment Theme (Legal Corpus reader) ═══
      parchment: '#f5f0e8',
      bone: '#faf7f0',
      ash: '#e8e2d6',
      ink: '#2a2520',
      inkSoft: '#4a4238',
      amber: { DEFAULT: '#c4752b' }, // Preserves built-in amber scale (amber-400 etc.)
      amberSoft: '#d4934b',
      sandDark: '#b9aa86',
      danger: '#ef4444',
      warning: '#facc15',
      info: '#38bdf8',

      // ═══ Research Shell (Legal Corpus / Reader mode) ═══
      'research-bg': '#faf9f6',
      'research-surface': '#ffffff',
      'research-surface-alt': '#f5f3ef',
      'research-border': '#e5e2da',
      'research-border-strong': '#c8c3b8',
      'research-text': '#1a1a1a',
      'research-text-secondary': '#5a5a5a',
      'research-text-muted': '#8a8a8a',
      'research-accent': '#d97706',
      'research-accent-soft': '#fef3c7',
      'research-accent-hover': '#b45309',
      'research-link': '#2563eb',
      'research-success': '#16a34a',
      'research-warning': '#d97706',
      'research-danger': '#dc2626',

      // ═══ Investigation Shell (Evidence / Tactical mode) ═══
      'inv-bg': '#d4c9a9',
      'inv-surface': '#1a1a1a',
      'inv-surface-alt': '#242424',
      'inv-border': '#333333',
      'inv-border-strong': '#555555',
      'inv-text': '#e8e0cc',
      'inv-text-muted': '#8a8272',
      'inv-label': '#a89f7c',
      'inv-accent': '#c4a35a',
      'inv-accent-hover': '#d4b36a',
      'inv-node': '#2a2a2a',
      'inv-node-selected': '#3a3520',
      'inv-connector': '#555544',
      'inv-timeline': '#4a4535',
    },
    fontFamily: {
      sans: ['Inter', 'system-ui', 'sans-serif'],
      ui: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      nes: ['"Press Start 2P"', 'system-ui', 'monospace'],
      mono: ['"Fira Code"', 'JetBrains Mono', 'Consolas', 'monospace'],
      serif: ['"Iowan Old Style"', '"Palatino Linotype"', 'Palatino', 'Georgia', 'serif'],
    },
  },
  shortcuts: {
    'app-shell': 'min-h-screen bg-[#0b0e12] text-zinc-100',
    'app-bg': 'bg-[#0b0e12] text-zinc-100',
    panel: 'rounded-2xl bg-white/4 shadow-lg shadow-black/20 backdrop-blur-xl',
    'glass-panel': 'rounded-2xl bg-white/5 shadow-xl shadow-black/30 backdrop-blur-2xl',
    'panel-header': 'flex items-center justify-between gap-3 px-4 py-3 border-b border-white/5',
    'panel-body': 'p-4',
    muted: 'text-zinc-400',
    badge: 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-white/6',
    btn: 'inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition',
    'btn-primary': 'btn bg-blue-500 text-white hover:bg-blue-400',
    'btn-ghost': 'btn bg-white/6 hover:bg-white/10',
    input:
      'w-full rounded-xl bg-black/20 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400/30',

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
    'yorha-noir-panel': 'bg-yorha-noir border-4 border-yorha-noir text-yorha-beige',
    'yorha-panel-beige': 'bg-yorha-beige-dark border-4 border-yorha-noir text-yorha-noir',

    // ═══════════════════════════════════════════════════════════════════════
    // YORHA-LEGAL PARCHMENT THEME (warm parchment + black frames + muted amber)
    // ═══════════════════════════════════════════════════════════════════════
    'yorha-page': 'bg-parchment text-ink font-ui min-h-screen',
    'yorha-panel': 'bg-bone border border-ink/15 rounded-lg shadow-sm',
    'yorha-card': 'bg-bone border border-ink/20 rounded-lg p-5 shadow-sm',
    'yorha-frame': 'bg-bone border-2 border-ink/25 rounded-lg p-5',
    'yorha-label': 'font-mono text-[10px] uppercase tracking-widest text-inkSoft/60 font-semibold',
    'yorha-reader':
      'bg-[#fdfbf5] border border-ink/12 rounded-lg shadow-[inset_0_1px_4px_rgba(42,37,32,0.06)] p-6 font-serif text-ink/85 leading-relaxed',
    'yorha-sidebar': 'bg-bone/80 border-r border-ink/10',
    'yorha-divider': 'border-ink/10',
    'yorha-pill':
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-ash/60 border border-ink/10 text-inkSoft/70',
    'yorha-tab':
      'inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 border-transparent text-inkSoft/50 hover:text-ink/80 transition-colors',
    'yorha-tab-active': 'border-amber text-amber',
    'yorha-btn':
      'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono uppercase tracking-wider bg-ink text-bone hover:bg-inkSoft transition-colors',
    'yorha-btn-amber':
      'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono uppercase tracking-wider bg-amber text-white hover:bg-amberSoft transition-colors',
    'yorha-btn-ghost':
      'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-inkSoft/60 hover:bg-ink/5 hover:text-ink/90 transition-colors',
    'yorha-input':
      'bg-white/80 border border-ink/15 rounded-lg px-3 py-2 text-sm text-ink/80 placeholder-ink/30 outline-none focus:border-amber/50 font-ui',

    // Glassmorphism — dark overlays (CitedSourcesDrawer, etc.)
    glass: 'bg-white/5 backdrop-blur-md border border-white/10 rounded-xl',
    'glass-card': 'bg-white/5 backdrop-blur-md border border-white/10 rounded-xl shadow-lg p-5',
    'glass-soft': 'bg-white/3 backdrop-blur-sm border border-white/8 rounded-lg',
    'glass-sidebar': 'bg-white/4 backdrop-blur-sm border-r border-white/8',
    'glass-pill':
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs bg-white/8 border border-white/12 text-white/70',
    'glass-input':
      'bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 placeholder-white/30 outline-none focus:border-orange-400/40',
    'btn-orange':
      'inline-flex items-center justify-center rounded border border-orange-600 px-3 py-2 text-xs uppercase tracking-[0.18em] font-mono bg-orange-500 text-white hover:bg-orange-400',

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

    // ═══════════════════════════════════════════════════════════════════════
    // RESEARCH SHELL (Legal Corpus / Reader mode)
    // ═══════════════════════════════════════════════════════════════════════
    'rs-screen': 'min-h-screen bg-research-bg text-research-text font-sans',
    'rs-panel': 'bg-research-surface rounded-xl border border-research-border shadow-sm',
    'rs-panel-header':
      'px-5 py-3.5 border-b border-research-border flex items-center justify-between',
    'rs-panel-body': 'p-5',
    'rs-card':
      'bg-research-surface rounded-lg border border-research-border p-4 hover:border-research-accent/40 hover:shadow-md transition-all',
    'rs-sidebar': 'w-60 bg-research-surface border-r border-research-border flex flex-col',
    'rs-sidebar-item':
      'px-4 py-2.5 text-sm text-research-text-secondary hover:bg-research-surface-alt hover:text-research-text transition-colors',
    'rs-sidebar-active':
      'bg-research-accent-soft text-research-accent font-medium border-r-2 border-research-accent',
    'rs-heading': 'text-lg font-semibold text-research-text tracking-tight',
    'rs-subheading': 'text-sm text-research-text-secondary',
    'rs-badge': 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
    'rs-badge-statute': 'bg-blue-50 text-blue-700 border border-blue-200',
    'rs-badge-case': 'bg-amber-50 text-amber-700 border border-amber-200',
    'rs-badge-regulation': 'bg-green-50 text-green-700 border border-green-200',
    'rs-badge-bill': 'bg-purple-50 text-purple-700 border border-purple-200',
    'rs-tab':
      'px-4 py-2 text-sm font-medium text-research-text-muted hover:text-research-text border-b-2 border-transparent transition-colors',
    'rs-tab-active': 'text-research-accent border-research-accent',
    'rs-btn':
      'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors',
    'rs-btn-primary': 'bg-research-accent text-white hover:bg-research-accent-hover',
    'rs-btn-ghost':
      'text-research-text-secondary hover:bg-research-surface-alt hover:text-research-text',
    'rs-input':
      'w-full px-3 py-2 rounded-lg border border-research-border bg-research-surface text-sm text-research-text placeholder:text-research-text-muted focus:outline-none focus:border-research-accent focus:ring-1 focus:ring-research-accent/30',
    'rs-divider': 'border-t border-research-border',
    'rs-label': 'text-[10px] uppercase tracking-wider text-research-text-muted font-semibold',
    'rs-pill':
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-research-surface-alt border border-research-border text-research-text-secondary',
    'rs-reader':
      'prose prose-sm max-w-none text-research-text leading-relaxed [&_p]:mb-3 [&_ul]:pl-5 [&_li]:mb-1',
    'rs-citation': 'text-sm text-research-link hover:underline cursor-pointer',
    'rs-stat': 'text-center p-3',
    'rs-stat-value': 'text-2xl font-bold text-research-text',
    'rs-stat-label': 'text-xs text-research-text-muted uppercase tracking-wide mt-0.5',

    // ═══════════════════════════════════════════════════════════════════════
    // INVESTIGATION SHELL (Evidence / Tactical mode)
    // ═══════════════════════════════════════════════════════════════════════
    'inv-screen': 'min-h-screen bg-inv-bg font-mono text-inv-text',
    'inv-panel': 'bg-inv-surface border-2 border-inv-border',
    'inv-panel-header':
      'px-3 py-2 border-b border-inv-border flex items-center justify-between text-xs uppercase tracking-wider text-inv-label',
    'inv-panel-body': 'p-3',
    'inv-card':
      'bg-inv-node border border-inv-border p-3 hover:border-inv-accent/60 transition-colors',
    'inv-inspector':
      'w-80 bg-inv-surface border-l-2 border-inv-border flex flex-col overflow-y-auto',
    'inv-inspector-header':
      'px-4 py-3 border-b border-inv-border text-xs uppercase tracking-wider text-inv-label',
    'inv-inspector-body': 'p-4 space-y-3 text-sm',
    'inv-label-text': 'text-[10px] uppercase tracking-wider text-inv-label',
    'inv-node-card':
      'bg-inv-node border border-inv-border rounded-sm p-2.5 cursor-pointer hover:border-inv-accent transition-colors',
    'inv-node-selected': 'bg-inv-node-selected border-inv-accent',
    'inv-timeline': 'h-12 bg-inv-timeline border-t border-inv-border flex items-center px-3 gap-2',
    'inv-connector': 'absolute bg-inv-connector',
    'inv-heading': 'text-sm font-bold uppercase tracking-wider text-inv-text',
    'inv-subheading': 'text-[11px] text-inv-text-muted',
    'inv-badge': 'inline-flex items-center px-1.5 py-0.5 text-[9px] uppercase tracking-wide border',
    'inv-badge-evidence': 'border-inv-accent bg-inv-accent/10 text-inv-accent',
    'inv-badge-forensic': 'border-red-500 bg-red-500/10 text-red-400',
    'inv-badge-linked': 'border-blue-400 bg-blue-400/10 text-blue-400',
    'inv-btn':
      'inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] uppercase tracking-wide font-mono border transition-colors',
    'inv-btn-primary': 'border-inv-accent bg-inv-accent/20 text-inv-accent hover:bg-inv-accent/30',
    'inv-btn-ghost':
      'border-inv-border text-inv-text-muted hover:text-inv-text hover:border-inv-border-strong',
    'inv-btn-action': 'border-inv-accent bg-inv-surface text-inv-accent hover:bg-inv-accent/10',
    'inv-input':
      'w-full px-2.5 py-1.5 bg-inv-node border border-inv-border text-sm font-mono text-inv-text placeholder:text-inv-text-muted focus:outline-none focus:border-inv-accent',
    'inv-divider': 'border-t border-inv-border',
    'inv-workspace': 'flex-1 relative overflow-hidden',
  },
  safelist: [
    // Layout utilities — safelisted for dynamic Svelte class expressions
    'flex',
    'inline-flex',
    'flex-col',
    'flex-wrap',
    'flex-1',
    'items-center',
    'items-start',
    'items-end',
    'justify-between',
    'justify-center',
    'justify-start',
    'gap-1',
    'gap-2',
    'gap-3',
    'gap-4',
    'gap-6',
    'px-2',
    'px-3',
    'px-4',
    'px-6',
    'py-1',
    'py-2',
    'py-3',
    'py-4',
    'p-2',
    'p-3',
    'p-4',
    'rounded',
    'rounded-md',
    'rounded-lg',
    'rounded-xl',
    'overflow-auto',
    'overflow-hidden',
    'overflow-x-auto',
    'min-h-screen',
    'min-w-0',
    'space-y-2',
    'space-y-3',
    'space-y-4',
    'grid',
    'grid-cols-2',
    'grid-cols-3',
    'md:grid-cols-2',
    'md:grid-cols-3',

    // Heroicons
    'i-heroicons-magnifying-glass-20-solid',
    'i-heroicons-plus-20-solid',
    'i-heroicons-exclamation-triangle',
    'i-heroicons-chat-bubble-left-right',
    'i-heroicons-check-circle',
    'i-heroicons-information-circle',
    'i-heroicons-arrow-path',
    'i-heroicons-check',
    'i-heroicons-document-text',
    'i-heroicons-calculator',
    'i-heroicons-link',
    'i-heroicons-check-badge',
    'i-heroicons-user-group',
    'i-heroicons-user-plus',
    'i-heroicons-map',
    'i-heroicons-clock',
    'i-heroicons-document-chart-bar',

    // Lucide icons — all icons used across codebase (enables dynamic i-lucide-{name})
    'i-lucide-accessibility',
    'i-lucide-activity',
    'i-lucide-alert-circle',
    'i-lucide-alert-triangle',
    'i-lucide-align-left',
    'i-lucide-archive',
    'i-lucide-arrow-down-left',
    'i-lucide-arrow-down-right',
    'i-lucide-arrow-down-wide-narrow',
    'i-lucide-arrow-left-right',
    'i-lucide-arrow-left',
    'i-lucide-arrow-right',
    'i-lucide-arrow-up-left',
    'i-lucide-arrow-up-right',
    'i-lucide-arrow-up-narrow-wide',
    'i-lucide-bar-chart-2',
    'i-lucide-bar-chart-3',
    'i-lucide-badge-check',
    'i-lucide-bell',
    'i-lucide-bold',
    'i-lucide-book-open',
    'i-lucide-book-open-text',
    'i-lucide-book-text',
    'i-lucide-bookmark',
    'i-lucide-bot',
    'i-lucide-braces',
    'i-lucide-brain',
    'i-lucide-brain-circuit',
    'i-lucide-briefcase',
    'i-lucide-bug',
    'i-lucide-cable',
    'i-lucide-calendar',
    'i-lucide-camera',
    'i-lucide-chart-bar',
    'i-lucide-check',
    'i-lucide-check-circle',
    'i-lucide-chevron-down',
    'i-lucide-chevron-left',
    'i-lucide-chevron-right',
    'i-lucide-chevron-up',
    'i-lucide-circle',
    'i-lucide-circle-alert',
    'i-lucide-circle-check',
    'i-lucide-circle-dot',
    'i-lucide-circle-help',
    'i-lucide-circle-pause',
    'i-lucide-circle-x',
    'i-lucide-clipboard-check',
    'i-lucide-clipboard-list',
    'i-lucide-clock',
    'i-lucide-clock-3',
    'i-lucide-cloud-upload',
    'i-lucide-code',
    'i-lucide-columns',
    'i-lucide-command',
    'i-lucide-construction',
    'i-lucide-copy',
    'i-lucide-cpu',
    'i-lucide-crosshair',
    'i-lucide-crown',
    'i-lucide-database',
    'i-lucide-dna',
    'i-lucide-dollar-sign',
    'i-lucide-download',
    'i-lucide-edit',
    'i-lucide-ellipsis-vertical',
    'i-lucide-eraser',
    'i-lucide-external-link',
    'i-lucide-eye',
    'i-lucide-eye-off',
    'i-lucide-file',
    'i-lucide-file-check',
    'i-lucide-file-code',
    'i-lucide-file-image',
    'i-lucide-file-json',
    'i-lucide-file-plus',
    'i-lucide-file-question',
    'i-lucide-file-search',
    'i-lucide-file-spreadsheet',
    'i-lucide-file-stack',
    'i-lucide-file-text',
    'i-lucide-file-up',
    'i-lucide-file-x',
    'i-lucide-files',
    'i-lucide-filter',
    'i-lucide-filter-x',
    'i-lucide-fingerprint',
    'i-lucide-fingerprint-pattern',
    'i-lucide-flag',
    'i-lucide-flame',
    'i-lucide-flask-conical',
    'i-lucide-focus',
    'i-lucide-folder',
    'i-lucide-folder-open',
    'i-lucide-folder-search',
    'i-lucide-folder-tree',
    'i-lucide-folders',
    'i-lucide-gallery-horizontal-end',
    'i-lucide-gamepad-2',
    'i-lucide-gavel',
    'i-lucide-git-branch',
    'i-lucide-git-compare',
    'i-lucide-git-compare-arrows',
    'i-lucide-git-merge',
    'i-lucide-globe',
    'i-lucide-grid-2x2',
    'i-lucide-grid-3x3',
    'i-lucide-hard-drive',
    'i-lucide-hash',
    'i-lucide-heading',
    'i-lucide-heading-1',
    'i-lucide-heading-2',
    'i-lucide-headphones',
    'i-lucide-heart',
    'i-lucide-help-circle',
    'i-lucide-history',
    'i-lucide-home',
    'i-lucide-house',
    'i-lucide-image',
    'i-lucide-image-off',
    'i-lucide-image-plus',
    'i-lucide-inbox',
    'i-lucide-info',
    'i-lucide-italic',
    'i-lucide-keyboard',
    'i-lucide-landmark',
    'i-lucide-layers',
    'i-lucide-layout',
    'i-lucide-layout-dashboard',
    'i-lucide-layout-grid',
    'i-lucide-layout-template',
    'i-lucide-library',
    'i-lucide-library-big',
    'i-lucide-life-buoy',
    'i-lucide-lightbulb',
    'i-lucide-link',
    'i-lucide-link-2',
    'i-lucide-list',
    'i-lucide-list-ordered',
    'i-lucide-list-tree',
    'i-lucide-loader',
    'i-lucide-loader-2',
    'i-lucide-loader-circle',
    'i-lucide-lock',
    'i-lucide-magnet',
    'i-lucide-mail',
    'i-lucide-map',
    'i-lucide-map-pin',
    'i-lucide-maximize',
    'i-lucide-maximize-2',
    'i-lucide-message-circle',
    'i-lucide-message-square',
    'i-lucide-message-square-dashed',
    'i-lucide-mic',
    'i-lucide-mic-off',
    'i-lucide-microscope',
    'i-lucide-minimize',
    'i-lucide-minus',
    'i-lucide-monitor',
    'i-lucide-monitor-off',
    'i-lucide-moon',
    'i-lucide-more-vertical',
    'i-lucide-mouse-pointer-2',
    'i-lucide-mouse-pointer-click',
    'i-lucide-move',
    'i-lucide-music',
    'i-lucide-network',
    'i-lucide-notebook-pen',
    'i-lucide-option',
    'i-lucide-palette',
    'i-lucide-panel-left',
    'i-lucide-paperclip',
    'i-lucide-pause',
    'i-lucide-pen-tool',
    'i-lucide-pencil',
    'i-lucide-percent',
    'i-lucide-phone',
    'i-lucide-pin',
    'i-lucide-play',
    'i-lucide-play-circle',
    'i-lucide-plus',
    'i-lucide-plus-circle',
    'i-lucide-quote',
    'i-lucide-radar',
    'i-lucide-radio',
    'i-lucide-redo',
    'i-lucide-redo-2',
    'i-lucide-refresh-cw',
    'i-lucide-replace',
    'i-lucide-rotate-ccw',
    'i-lucide-rotate-cw',
    'i-lucide-route',
    'i-lucide-save',
    'i-lucide-scale',
    'i-lucide-scan',
    'i-lucide-scan-face',
    'i-lucide-scan-search',
    'i-lucide-scroll',
    'i-lucide-scroll-text',
    'i-lucide-search',
    'i-lucide-search-code',
    'i-lucide-search-x',
    'i-lucide-send',
    'i-lucide-server',
    'i-lucide-settings',
    'i-lucide-share-2',
    'i-lucide-shield',
    'i-lucide-shield-alert',
    'i-lucide-shield-check',
    'i-lucide-skip-back',
    'i-lucide-skip-forward',
    'i-lucide-sliders',
    'i-lucide-sliders-horizontal',
    'i-lucide-sparkles',
    'i-lucide-split',
    'i-lucide-split-square-horizontal',
    'i-lucide-square',
    'i-lucide-star',
    'i-lucide-star-off',
    'i-lucide-sticky-note',
    'i-lucide-strikethrough',
    'i-lucide-sun',
    'i-lucide-sun-moon',
    'i-lucide-tag',
    'i-lucide-tags',
    'i-lucide-target',
    'i-lucide-terminal',
    'i-lucide-thumbs-down',
    'i-lucide-thumbs-up',
    'i-lucide-timer',
    'i-lucide-trash-2',
    'i-lucide-trending-down',
    'i-lucide-trending-up',
    'i-lucide-triangle-alert',
    'i-lucide-trophy',
    'i-lucide-type',
    'i-lucide-underline',
    'i-lucide-undo',
    'i-lucide-undo-2',
    'i-lucide-unlock',
    'i-lucide-upload',
    'i-lucide-user',
    'i-lucide-user-cog',
    'i-lucide-user-plus',
    'i-lucide-user-x',
    'i-lucide-users',
    'i-lucide-video',
    'i-lucide-volume-2',
    'i-lucide-volume-x',
    'i-lucide-wand-2',
    'i-lucide-wand-sparkles',
    'i-lucide-wifi',
    'i-lucide-wifi-off',
    'i-lucide-wrench',
    'i-lucide-x',
    'i-lucide-zap',
    'i-lucide-zap-off',
    'i-lucide-zoom-in',
    'i-lucide-zoom-out',
  ],
});
