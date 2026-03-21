<script lang="ts">
  import { THEMES, type ThemeDefinition, type ThemeId } from '$lib/config/themes.js';
  import { themeStore } from '$lib/stores/theme.svelte.js';
  import Icon from '$lib/components/ui/Icon.svelte';

  let hoveredId = $state<ThemeId | null>(null);

  const categoryIcons: Record<string, string> = {
    TACTICAL: 'crosshair',
    ARCHIVE: 'book-open',
    RETRO: 'gamepad-2',
    ACCESSIBLE: 'accessibility',
  };

  function applyTheme(id: ThemeId) {
    themeStore.setTheme(id);
  }
</script>

<div class="gallery">
  <div class="gallery-header">
    <h3 class="gallery-title">INTERFACE_PROFILES</h3>
    <p class="gallery-subtitle">Select a visual loadout for your workspace</p>
  </div>

  <div class="theme-grid">
    {#each THEMES as theme (theme.id)}
      {@const isActive = themeStore.settings.id === theme.id}
      {@const isHovered = hoveredId === theme.id}
      <button
        class="theme-card"
        class:active={isActive}
        class:hovered={isHovered}
        onmouseenter={() => hoveredId = theme.id}
        onmouseleave={() => hoveredId = null}
        onclick={() => applyTheme(theme.id)}
        aria-pressed={isActive}
        title={theme.description}
      >
        <!-- Mini mock screen -->
        <div class="card-preview" style="background: {theme.previewColors.bg}">
          <div class="preview-header" style="background: {theme.previewColors.panel}; border-color: {theme.previewColors.accent};">
            <div class="preview-dots">
              <span class="dot" style="background: {theme.previewColors.accent}"></span>
              <span class="dot" style="background: {theme.previewColors.accent2}"></span>
              <span class="dot" style="background: {theme.previewColors.text}; opacity: 0.3"></span>
            </div>
            <span class="preview-title" style="color: {theme.previewColors.text}; opacity: 0.7; font-size: 0.5rem;">SYSTEM</span>
          </div>
          <div class="preview-body">
            <div class="preview-sidebar" style="background: {theme.previewColors.panel}">
              <div class="preview-nav-item" style="background: {theme.previewColors.accent}; opacity: 0.8"></div>
              <div class="preview-nav-item" style="background: {theme.previewColors.text}; opacity: 0.15"></div>
              <div class="preview-nav-item" style="background: {theme.previewColors.text}; opacity: 0.15"></div>
            </div>
            <div class="preview-content">
              <div class="preview-line" style="background: {theme.previewColors.text}; opacity: 0.6; width: 70%"></div>
              <div class="preview-line" style="background: {theme.previewColors.text}; opacity: 0.3; width: 90%"></div>
              <div class="preview-line" style="background: {theme.previewColors.text}; opacity: 0.3; width: 50%"></div>
              <div class="preview-accent-bar" style="background: {theme.previewColors.accent}"></div>
            </div>
          </div>
        </div>

        <!-- Card info -->
        <div class="card-info">
          <div class="card-top-row">
            <span class="category-badge" class:tactical={theme.category === 'TACTICAL'} class:archive={theme.category === 'ARCHIVE'} class:retro={theme.category === 'RETRO'} class:accessible={theme.category === 'ACCESSIBLE'}>
              <Icon name={categoryIcons[theme.category] ?? 'palette'} size={10} />
              {theme.category}
            </span>
            {#if isActive}
              <span class="active-badge">
                <Icon name="check" size={10} />
                ACTIVE
              </span>
            {/if}
          </div>
          <h4 class="card-name">{theme.name}</h4>
          <p class="card-best-for">BEST FOR {theme.bestFor}</p>
        </div>
      </button>
    {/each}
  </div>
</div>

<style>
  .gallery {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .gallery-header {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .gallery-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    color: var(--t-text-muted, #94a3b8);
    letter-spacing: 0.15em;
    margin: 0;
    text-transform: uppercase;
  }

  .gallery-subtitle {
    font-size: 0.85rem;
    color: var(--t-text-muted, #64748b);
    margin: 0;
  }

  .theme-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 1rem;
  }

  .theme-card {
    display: flex;
    flex-direction: column;
    background: var(--t-panel, #1e293b);
    border: 1px solid var(--t-border, #334155);
    border-radius: var(--radius, 0.25rem);
    overflow: hidden;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    text-align: left;
    padding: 0;
    color: inherit;
  }

  .theme-card:hover {
    border-color: var(--t-accent, #ffd700);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px var(--t-shadow, rgba(0,0,0,0.3)),
                0 0 0 1px var(--t-accent, #ffd700);
  }

  .theme-card.active {
    border-color: var(--t-accent, #ffd700);
    box-shadow: 0 0 0 2px var(--t-accent, #ffd700),
                0 4px 16px var(--t-shadow, rgba(0,0,0,0.3));
  }

  /* Mini mock screen */
  .card-preview {
    height: 120px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    position: relative;
    overflow: hidden;
  }

  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 6px;
    border-radius: 2px;
    border-bottom: 1px solid;
    flex-shrink: 0;
  }

  .preview-dots {
    display: flex;
    gap: 3px;
  }

  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
  }

  .preview-title {
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.1em;
  }

  .preview-body {
    flex: 1;
    display: flex;
    gap: 4px;
    min-height: 0;
  }

  .preview-sidebar {
    width: 28%;
    border-radius: 2px;
    padding: 4px 3px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .preview-nav-item {
    height: 4px;
    border-radius: 1px;
  }

  .preview-content {
    flex: 1;
    padding: 6px 4px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .preview-line {
    height: 3px;
    border-radius: 1px;
  }

  .preview-accent-bar {
    height: 4px;
    width: 40%;
    border-radius: 1px;
    margin-top: auto;
  }

  /* Card info */
  .card-info {
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .card-top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .category-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    letter-spacing: 0.1em;
    padding: 0.15rem 0.4rem;
    border-radius: 2px;
    border: 1px solid;
    text-transform: uppercase;
  }

  .category-badge.tactical {
    color: #7ee7ff;
    border-color: rgba(126, 231, 255, 0.3);
    background: rgba(126, 231, 255, 0.08);
  }
  .category-badge.archive {
    color: #d97706;
    border-color: rgba(217, 119, 6, 0.3);
    background: rgba(217, 119, 6, 0.08);
  }
  .category-badge.retro {
    color: #a78bfa;
    border-color: rgba(167, 139, 250, 0.3);
    background: rgba(167, 139, 250, 0.08);
  }
  .category-badge.accessible {
    color: #4ade80;
    border-color: rgba(74, 222, 128, 0.3);
    background: rgba(74, 222, 128, 0.08);
  }

  .active-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    letter-spacing: 0.08em;
    padding: 0.15rem 0.4rem;
    border-radius: 2px;
    background: var(--t-accent, #ffd700);
    color: var(--t-bg, #0a0a0a);
    font-weight: 600;
  }

  .card-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--t-text, #f8fafc);
    margin: 0;
  }

  .card-best-for {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    color: var(--t-text-muted, #64748b);
    margin: 0;
    text-transform: uppercase;
  }
</style>
