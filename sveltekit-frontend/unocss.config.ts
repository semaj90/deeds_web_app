import { defineConfig, presetUno, presetAttributify, presetIcons } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      collections: {
        heroicons: () => import('@iconify-json/heroicons/icons.json').then(i => i.default),
        lucide: () => import('@iconify-json/lucide/icons.json').then(i => i.default),
      }
    }),
  ],
  theme: {
    colors: {
      sand: '#d4c7a3',
      sandDark: '#b9aa86',
      panel: '#24211b',
      panelSoft: '#2f2a22',
      accent: '#4ade80',
      accentSoft: '#a3e635',
      danger: '#ef4444',
      warning: '#facc15',
      info: '#38bdf8',
    },
    fontFamily: {
      ui: '"IBM Plex Sans", system-ui, sans-serif',
      mono: '"Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    },
  },
  shortcuts: {
    // Layout
    'app-bg': 'bg-sand text-black font-ui',
    'panel': 'bg-panel text-sand rounded-lg border border-black/40 shadow-[0_0_0_2px_#000]',
    'panel-soft': 'bg-panelSoft text-sand rounded-lg border border-black/30 shadow-[0_0_0_1px_#00000080]',
    'panel-outline': 'border border-black/50 shadow-[0_0_0_2px_#000]',

    // Buttons
    'btn-base':
      'inline-flex items-center justify-center rounded border border-black/60 ' +
      'px-3 py-2 text-xs uppercase tracking-[0.18em] font-mono ' +
      'shadow-[0_2px_0_0_#000] active:translate-y-0.5 active:shadow-[0_0_0_0_#000] ' +
      'disabled:opacity-50 disabled:pointer-events-none transition-all',
    'btn-primary': 'btn-base bg-accent text-black hover:bg-accentSoft',
    'btn-secondary': 'btn-base bg-panelSoft text-sand hover:bg-panel',
    'btn-danger': 'btn-base bg-danger text-white hover:bg-red-600',

    // Tags / Pills
    'tag':
      'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] ' +
      'uppercase tracking-[0.16em] font-mono border border-black/40 bg-sandDark text-black',
    'pill-green': 'tag bg-green-500 text-black',
    'pill-red': 'tag bg-danger text-white',
    'pill-yellow': 'tag bg-warning text-black',
    'pill-blue': 'tag bg-info text-black',

    // Text
    'heading-main': 'font-mono text-2xl tracking-[0.3em] uppercase',
    'heading-sub': 'font-mono text-sm tracking-[0.2em] uppercase text-black/70',

    // Scroll panel
    'scroll-panel': 'panel-soft overflow-auto custom-scrollbar',
  },
  safelist: [
    // Layout utilities — safelisted because UnoCSS extraction misses them
    // inside dynamic Svelte class expressions (template literals, ternaries)
    'flex', 'inline-flex', 'flex-col', 'flex-wrap', 'flex-1',
    'items-center', 'items-start', 'items-end',
    'justify-between', 'justify-center', 'justify-start',
    'gap-1', 'gap-2', 'gap-3', 'gap-4', 'gap-6',
    'px-2', 'px-3', 'px-4', 'px-6',
    'py-1', 'py-2', 'py-3', 'py-4',
    'p-2', 'p-3', 'p-4',
    'rounded', 'rounded-md', 'rounded-lg', 'rounded-xl',
    'overflow-auto', 'overflow-hidden', 'overflow-x-auto',
    'min-h-screen', 'min-w-0',
    'space-y-2', 'space-y-3', 'space-y-4',
    'grid', 'grid-cols-2', 'grid-cols-3',
    'md:grid-cols-2', 'md:grid-cols-3',
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
    // Lucide icons — all 128 used across codebase (enables dynamic i-lucide-{name})
    'i-lucide-activity', 'i-lucide-alert-circle', 'i-lucide-alert-triangle', 'i-lucide-archive',
    'i-lucide-arrow-left', 'i-lucide-bar-chart', 'i-lucide-bar-chart-3', 'i-lucide-bell',
    'i-lucide-bold', 'i-lucide-book-open', 'i-lucide-bot', 'i-lucide-brain',
    'i-lucide-briefcase', 'i-lucide-bug', 'i-lucide-calendar', 'i-lucide-camera',
    'i-lucide-check', 'i-lucide-check-circle', 'i-lucide-chevron-down', 'i-lucide-chevron-left',
    'i-lucide-chevron-right', 'i-lucide-chevron-up', 'i-lucide-circle', 'i-lucide-circle-check',
    'i-lucide-circle-x', 'i-lucide-clock', 'i-lucide-code', 'i-lucide-command',
    'i-lucide-copy', 'i-lucide-cpu', 'i-lucide-database', 'i-lucide-dollar-sign',
    'i-lucide-download', 'i-lucide-edit', 'i-lucide-external-link', 'i-lucide-eye',
    'i-lucide-eye-off', 'i-lucide-file', 'i-lucide-file-check', 'i-lucide-file-code',
    'i-lucide-file-image', 'i-lucide-file-json', 'i-lucide-file-spreadsheet', 'i-lucide-file-text',
    'i-lucide-file-up', 'i-lucide-filter', 'i-lucide-folder-tree', 'i-lucide-gavel',
    'i-lucide-git-branch', 'i-lucide-git-compare', 'i-lucide-grid-2x2', 'i-lucide-hard-drive', 'i-lucide-hash',
    'i-lucide-heading-1', 'i-lucide-heading-2', 'i-lucide-headphones', 'i-lucide-heart',
    'i-lucide-home', 'i-lucide-image', 'i-lucide-info', 'i-lucide-italic',
    'i-lucide-keyboard', 'i-lucide-layers', 'i-lucide-layout', 'i-lucide-library',
    'i-lucide-lightbulb', 'i-lucide-link', 'i-lucide-link-2', 'i-lucide-list',
    'i-lucide-list-ordered', 'i-lucide-loader', 'i-lucide-loader-2', 'i-lucide-lock',
    'i-lucide-mail', 'i-lucide-map-pin', 'i-lucide-maximize', 'i-lucide-message-circle',
    'i-lucide-message-square', 'i-lucide-mic', 'i-lucide-mic-off', 'i-lucide-minimize',
    'i-lucide-moon', 'i-lucide-more-vertical', 'i-lucide-move', 'i-lucide-music',
    'i-lucide-network', 'i-lucide-panel-left', 'i-lucide-paperclip', 'i-lucide-pause',
    'i-lucide-percent', 'i-lucide-phone', 'i-lucide-play', 'i-lucide-plus',
    'i-lucide-quote', 'i-lucide-radio', 'i-lucide-redo', 'i-lucide-refresh-cw',
    'i-lucide-replace', 'i-lucide-rotate-ccw', 'i-lucide-save', 'i-lucide-scale',
    'i-lucide-scan', 'i-lucide-search', 'i-lucide-send', 'i-lucide-settings',
    'i-lucide-share-2', 'i-lucide-shield', 'i-lucide-skip-back', 'i-lucide-skip-forward',
    'i-lucide-sort-asc', 'i-lucide-sort-desc', 'i-lucide-sparkles', 'i-lucide-square',
    'i-lucide-star', 'i-lucide-star-off', 'i-lucide-sun', 'i-lucide-tag',
    'i-lucide-target', 'i-lucide-terminal', 'i-lucide-thumbs-down', 'i-lucide-thumbs-up',
    'i-lucide-trash-2', 'i-lucide-trending-down', 'i-lucide-trending-up', 'i-lucide-triangle-alert',
    'i-lucide-type', 'i-lucide-undo', 'i-lucide-upload', 'i-lucide-user',
    'i-lucide-users', 'i-lucide-video', 'i-lucide-wand-2', 'i-lucide-wifi',
    'i-lucide-wifi-off', 'i-lucide-x', 'i-lucide-x-circle', 'i-lucide-zap',
    'i-lucide-zoom-in', 'i-lucide-zoom-out',
    'i-lucide-user-cog', 'i-lucide-globe', 'i-lucide-pause-circle',
    'i-lucide-undo-2', 'i-lucide-redo-2', 'i-lucide-maximize-2', 'i-lucide-map',
  ],
})
