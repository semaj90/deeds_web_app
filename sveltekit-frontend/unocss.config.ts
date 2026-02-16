import { defineConfig, presetUno, presetAttributify, presetIcons } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      collections: {
        heroicons: () => import('@iconify-json/heroicons/icons.json').then(i => i.default),
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
  ],
})
