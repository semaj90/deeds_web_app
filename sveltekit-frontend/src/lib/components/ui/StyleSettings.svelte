<script lang="ts">
  import { themeStore } from '$lib/stores/theme.svelte.js';
  import { ACCENT_PRESETS, type ThemeId } from '$lib/config/themes.js';
  import Icon from '$lib/components/ui/Icon.svelte';

  let currentAccents = $derived(ACCENT_PRESETS[themeStore.settings.id] ?? ACCENT_PRESETS['yorha-dark']);

  const fontScaleSteps = [
    { label: 'SM', value: 0.875 },
    { label: 'MD', value: 1 },
    { label: 'LG', value: 1.125 },
    { label: 'XL', value: 1.25 },
  ];

  const densityOptions = [
    { label: 'Compact', value: 'compact' as const, icon: 'minimize-2' },
    { label: 'Normal', value: 'normal' as const, icon: 'minus' },
    { label: 'Spacious', value: 'spacious' as const, icon: 'maximize-2' },
  ];

  const borderOptions = [
    { label: 'Sharp', value: 'sharp' as const },
    { label: 'Rounded', value: 'rounded' as const },
    { label: 'Soft', value: 'soft' as const },
  ];
</script>

<div class="style-settings">
  <div class="settings-header">
    <h3 class="settings-title">STYLE_TUNING</h3>
    <button class="reset-btn" onclick={() => themeStore.resetTheme()} title="Reset to defaults">
      <Icon name="rotate-ccw" size={12} />
      RESET
    </button>
  </div>

  <div class="settings-grid">
    <!-- Font Scale -->
    <div class="setting-group">
      <label class="setting-label">TYPEFACE_SCALE</label>
      <div class="toggle-group">
        {#each fontScaleSteps as step}
          <button
            class="toggle-btn"
            class:active={themeStore.settings.fontScale === step.value}
            onclick={() => themeStore.setFontScale(step.value)}
          >
            {step.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Panel Density -->
    <div class="setting-group">
      <label class="setting-label">DENSITY</label>
      <div class="toggle-group">
        {#each densityOptions as opt}
          <button
            class="toggle-btn"
            class:active={themeStore.settings.density === opt.value}
            onclick={() => themeStore.setDensity(opt.value)}
            title={opt.label}
          >
            <Icon name={opt.icon} size={12} />
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Corner Sharpness -->
    <div class="setting-group">
      <label class="setting-label">PANEL_SHARPNESS</label>
      <div class="toggle-group">
        {#each borderOptions as opt}
          <button
            class="toggle-btn"
            class:active={themeStore.settings.borderStyle === opt.value}
            onclick={() => themeStore.setBorderStyle(opt.value)}
          >
            {opt.value === 'sharp' ? '▢' : opt.value === 'rounded' ? '▣' : '●'}
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Glow Intensity -->
    <div class="setting-group">
      <label class="setting-label">
        GLOW_INTENSITY
        <span class="setting-value">{Math.round(themeStore.settings.glowIntensity * 100)}%</span>
      </label>
      <input
        type="range"
        class="slider"
        min="0"
        max="1"
        step="0.05"
        value={themeStore.settings.glowIntensity}
        oninput={(e) => themeStore.setGlowIntensity(Number((e.target as HTMLInputElement).value))}
      />
    </div>

    <!-- Scanline / Grain -->
    <div class="setting-group">
      <label class="setting-label">
        SCANLINE_STRENGTH
        <span class="setting-value">{Math.round(themeStore.settings.scanlineOpacity * 100)}%</span>
      </label>
      <input
        type="range"
        class="slider"
        min="0"
        max="1"
        step="0.05"
        value={themeStore.settings.scanlineOpacity}
        oninput={(e) => themeStore.setScanlineOpacity(Number((e.target as HTMLInputElement).value))}
      />
    </div>

    <!-- Panel Noise -->
    <div class="setting-group">
      <label class="setting-label">
        PAPER_GRAIN
        <span class="setting-value">{Math.round(themeStore.settings.panelNoise * 100)}%</span>
      </label>
      <input
        type="range"
        class="slider"
        min="0"
        max="1"
        step="0.05"
        value={themeStore.settings.panelNoise}
        oninput={(e) => themeStore.setPanelNoise(Number((e.target as HTMLInputElement).value))}
      />
    </div>

    <!-- Accent Color Presets -->
    <div class="setting-group accent-group">
      <label class="setting-label">ACCENT_PROFILE</label>
      <div class="accent-swatches">
        {#each currentAccents as color}
          <button
            class="swatch"
            class:active={themeStore.settings.accentOverride === color}
            style="background: {color}"
            onclick={() => themeStore.setAccentOverride(
              themeStore.settings.accentOverride === color ? null : color
            )}
            title={color}
          ></button>
        {/each}
        {#if themeStore.settings.accentOverride}
          <button
            class="swatch reset-swatch"
            onclick={() => themeStore.setAccentOverride(null)}
            title="Reset to theme default"
          >
            <Icon name="x" size={10} />
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .style-settings {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .settings-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    color: var(--t-text-muted, #94a3b8);
    letter-spacing: 0.15em;
    margin: 0;
    text-transform: uppercase;
  }

  .reset-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    color: var(--t-text-muted, #64748b);
    background: transparent;
    border: 1px solid var(--t-border, #334155);
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius, 0.25rem);
    cursor: pointer;
    transition: all 0.2s;
  }

  .reset-btn:hover {
    color: var(--t-danger, #ef4444);
    border-color: var(--t-danger, #ef4444);
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 1.25rem;
  }

  .setting-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .setting-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    color: var(--t-text-muted, #94a3b8);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .setting-value {
    color: var(--t-accent, #ffd700);
    font-weight: 600;
  }

  /* Toggle button group */
  .toggle-group {
    display: flex;
    gap: 0;
    background: var(--t-bg, #0f172a);
    border: 1px solid var(--t-border, #334155);
    border-radius: var(--radius, 0.25rem);
    overflow: hidden;
  }

  .toggle-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 0.45rem 0.5rem;
    background: transparent;
    border: none;
    border-right: 1px solid var(--t-border, #334155);
    color: var(--t-text-muted, #64748b);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    cursor: pointer;
    transition: all 0.15s;
    letter-spacing: 0.04em;
  }

  .toggle-btn:last-child {
    border-right: none;
  }

  .toggle-btn:hover {
    background: var(--t-panel-2, #1e293b);
    color: var(--t-text, #f1f5f9);
  }

  .toggle-btn.active {
    background: var(--t-accent, #ffd700);
    color: var(--t-bg, #0a0a0a);
    font-weight: 600;
  }

  /* Sliders */
  .slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 4px;
    background: var(--t-border, #334155);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    background: var(--t-accent, #ffd700);
    border-radius: 50%;
    cursor: pointer;
    border: 2px solid var(--t-bg, #0a0a0a);
    box-shadow: 0 0 4px var(--t-shadow, rgba(0,0,0,0.3));
  }

  .slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    background: var(--t-accent, #ffd700);
    border-radius: 50%;
    cursor: pointer;
    border: 2px solid var(--t-bg, #0a0a0a);
  }

  /* Accent swatches */
  .accent-group {
    grid-column: 1 / -1;
  }

  .accent-swatches {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .swatch {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.2s;
    padding: 0;
    position: relative;
  }

  .swatch:hover {
    transform: scale(1.15);
    box-shadow: 0 0 8px currentColor;
  }

  .swatch.active {
    border-color: var(--t-text, #ffffff);
    box-shadow: 0 0 0 2px var(--t-bg, #000), 0 0 0 4px var(--t-text, #fff);
  }

  .reset-swatch {
    background: var(--t-panel, #1e293b) !important;
    border: 1px dashed var(--t-border, #475569);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--t-text-muted, #64748b);
  }
</style>
