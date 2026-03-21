/**
 * Unified Theme Store — Single Source of Truth
 * All theme state flows through here. No other component should
 * independently read/write localStorage('theme') or set data-theme.
 */

import {
  type ThemeId,
  type ThemeSettings,
  type Density,
  type BorderStyle,
  DEFAULT_THEME_SETTINGS,
  getTheme,
} from '$lib/config/themes.js';

const STORAGE_KEY = 'theme-config';

function loadSettings(): ThemeSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_THEME_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ThemeSettings>;
      return { ...DEFAULT_THEME_SETTINGS, ...parsed };
    }
  } catch {
    // corrupt storage — fall through
  }
  // Migrate from old 'theme' key if present
  try {
    const legacy = localStorage.getItem('theme');
    if (legacy) {
      const mapped = migrateLegacyTheme(legacy);
      if (mapped) return { ...DEFAULT_THEME_SETTINGS, id: mapped };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_THEME_SETTINGS };
}

function migrateLegacyTheme(value: string): ThemeId | null {
  const map: Record<string, ThemeId> = {
    dark: 'yorha-dark',
    light: 'research-light',
    yorha: 'yorha-dark',
    nier: 'investigation',
    'yorha-bw': 'yorha-bw',
    'high-contrast': 'high-contrast',
    system: 'yorha-dark',
  };
  return map[value] ?? null;
}

function persistSettings(s: ThemeSettings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    // Clean up legacy key
    localStorage.removeItem('theme');
  } catch {
    // quota exceeded or private mode
  }
}

function applyToDOM(s: ThemeSettings) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  el.setAttribute('data-theme', s.id);
  el.setAttribute('data-density', s.density);
  el.setAttribute('data-border', s.borderStyle);
  el.style.setProperty('--base-font-size', `${s.fontScale}rem`);
  el.style.setProperty('--glow-intensity', String(s.glowIntensity));
  el.style.setProperty('--scanline-opacity', String(s.scanlineOpacity));
  el.style.setProperty('--panel-noise', String(s.panelNoise));
  if (s.accentOverride) {
    el.style.setProperty('--accent-override', s.accentOverride);
  } else {
    el.style.removeProperty('--accent-override');
  }
}

class ThemeStore {
  settings = $state<ThemeSettings>(loadSettings());

  /** Reactive derived: current theme definition */
  definition = $derived(getTheme(this.settings.id));

  constructor() {
    // Apply initial settings on client (no $effect — avoids effect_orphan at module level)
    if (typeof window !== 'undefined') {
      applyToDOM(this.settings);
    }
  }

  /** Internal: sync DOM + localStorage after any mutation */
  private _sync() {
    applyToDOM(this.settings);
    persistSettings(this.settings);
  }

  /** Switch to a different theme (resets style overrides) */
  setTheme(id: ThemeId) {
    this.settings = {
      ...DEFAULT_THEME_SETTINGS,
      id,
      // Preserve user's style tuning preferences
      density: this.settings.density,
      fontScale: this.settings.fontScale,
      borderStyle: this.settings.borderStyle,
    };
    this._sync();
  }

  /** Update individual style settings without changing theme */
  updateSettings(partial: Partial<ThemeSettings>) {
    this.settings = { ...this.settings, ...partial };
    this._sync();
  }

  /** Reset everything to defaults */
  resetTheme() {
    this.settings = { ...DEFAULT_THEME_SETTINGS };
    this._sync();
  }

  /** Convenience setters */
  setDensity(d: Density) {
    this.settings = { ...this.settings, density: d };
    this._sync();
  }
  setBorderStyle(b: BorderStyle) {
    this.settings = { ...this.settings, borderStyle: b };
    this._sync();
  }
  setFontScale(s: number) {
    this.settings = { ...this.settings, fontScale: Math.max(0.75, Math.min(1.5, s)) };
    this._sync();
  }
  setGlowIntensity(v: number) {
    this.settings = { ...this.settings, glowIntensity: Math.max(0, Math.min(1, v)) };
    this._sync();
  }
  setScanlineOpacity(v: number) {
    this.settings = { ...this.settings, scanlineOpacity: Math.max(0, Math.min(1, v)) };
    this._sync();
  }
  setPanelNoise(v: number) {
    this.settings = { ...this.settings, panelNoise: Math.max(0, Math.min(1, v)) };
    this._sync();
  }
  setAccentOverride(color: string | null) {
    this.settings = { ...this.settings, accentOverride: color };
    this._sync();
  }
}

export const themeStore = new ThemeStore();
