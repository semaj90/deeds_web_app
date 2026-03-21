/**
 * Theme Definitions Registry — Single Source of Truth
 * Every theme the app supports is defined here.
 */

export type ThemeId =
  | 'yorha-dark'
  | 'yorha-bw'
  | 'parchment'
  | 'investigation'
  | 'research-light'
  | 'nes-retro'
  | 'high-contrast';

export type ThemeCategory = 'TACTICAL' | 'ARCHIVE' | 'RETRO' | 'ACCESSIBLE';
export type ThemeMode = 'dark' | 'light';
export type Density = 'compact' | 'normal' | 'spacious';
export type BorderStyle = 'sharp' | 'rounded' | 'soft';

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  description: string;
  category: ThemeCategory;
  mode: ThemeMode;
  bestFor: string;
  previewColors: {
    bg: string;
    panel: string;
    text: string;
    accent: string;
    accent2: string;
  };
  flags: {
    readingOptimized: boolean;
    tactical: boolean;
    accessibility: boolean;
  };
}

export interface ThemeSettings {
  id: ThemeId;
  density: Density;
  fontScale: number;
  borderStyle: BorderStyle;
  glowIntensity: number;
  scanlineOpacity: number;
  panelNoise: number;
  accentOverride: string | null;
}

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  id: 'yorha-dark',
  density: 'normal',
  fontScale: 1,
  borderStyle: 'rounded',
  glowIntensity: 0.5,
  scanlineOpacity: 0.3,
  panelNoise: 0.2,
  accentOverride: null,
};

export const THEMES: ThemeDefinition[] = [
  {
    id: 'yorha-dark',
    name: 'YoRHa Dark',
    description: 'Black / charcoal / warm gold. Thin borders, mono-condensed type, subtle glow.',
    category: 'TACTICAL',
    mode: 'dark',
    bestFor: 'LOW-LIGHT DESKTOP USE',
    previewColors: {
      bg: '#0a0a0a',
      panel: '#1a1a1a',
      text: '#e0e0e0',
      accent: '#ffd700',
      accent2: '#00ff41',
    },
    flags: { readingOptimized: false, tactical: true, accessibility: false },
  },
  {
    id: 'yorha-bw',
    name: 'YoRHa Monochrome',
    description: 'Pure black & white. Stark contrast, no color distractions.',
    category: 'TACTICAL',
    mode: 'dark',
    bestFor: 'FOCUSED ANALYSIS',
    previewColors: {
      bg: '#000000',
      panel: '#0a0a0a',
      text: '#ffffff',
      accent: '#ffffff',
      accent2: '#cccccc',
    },
    flags: { readingOptimized: false, tactical: true, accessibility: false },
  },
  {
    id: 'parchment',
    name: 'Parchment Archive',
    description: 'Beige / paper / muted brass. Less glow, legal research mode.',
    category: 'ARCHIVE',
    mode: 'light',
    bestFor: 'LEGAL RESEARCH',
    previewColors: {
      bg: '#f5f0e8',
      panel: '#faf7f0',
      text: '#2a2520',
      accent: '#c4752b',
      accent2: '#b9aa86',
    },
    flags: { readingOptimized: true, tactical: false, accessibility: false },
  },
  {
    id: 'investigation',
    name: 'Investigation Tactical',
    description: 'Navy / graphite / amber / teal. Stronger edge highlights, evidence graph mode.',
    category: 'TACTICAL',
    mode: 'dark',
    bestFor: 'EVIDENCE REVIEW',
    previewColors: {
      bg: '#0d1117',
      panel: '#161b22',
      text: '#e8e0cc',
      accent: '#c4a35a',
      accent2: '#3b82a0',
    },
    flags: { readingOptimized: false, tactical: true, accessibility: false },
  },
  {
    id: 'research-light',
    name: 'Research Light',
    description: 'Light background, restrained contrast. For long document reading sessions.',
    category: 'ARCHIVE',
    mode: 'light',
    bestFor: 'DOCUMENT READING',
    previewColors: {
      bg: '#faf9f6',
      panel: '#ffffff',
      text: '#1a1a1a',
      accent: '#d97706',
      accent2: '#2563eb',
    },
    flags: { readingOptimized: true, tactical: false, accessibility: false },
  },
  {
    id: 'nes-retro',
    name: 'NES Retro',
    description: 'Hard borders, pixel vibe, 8-bit nostalgia. Fun demo theme.',
    category: 'RETRO',
    mode: 'dark',
    bestFor: 'DEMO / FUN',
    previewColors: {
      bg: '#212529',
      panel: '#2c3035',
      text: '#f8f4e3',
      accent: '#ffcc66',
      accent2: '#ff5c5c',
    },
    flags: { readingOptimized: false, tactical: false, accessibility: false },
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    description: 'Accessibility-first. Maximum contrast, thick borders, no glow or grain.',
    category: 'ACCESSIBLE',
    mode: 'dark',
    bestFor: 'ACCESSIBILITY',
    previewColors: {
      bg: '#000000',
      panel: '#1a1a1a',
      text: '#ffffff',
      accent: '#ffff00',
      accent2: '#00ffff',
    },
    flags: { readingOptimized: false, tactical: false, accessibility: true },
  },
];

export const THEME_MAP = new Map(THEMES.map((t) => [t.id, t]));

export function getTheme(id: ThemeId): ThemeDefinition {
  return THEME_MAP.get(id) ?? THEMES[0];
}

/** Accent color presets per theme */
export const ACCENT_PRESETS: Record<ThemeId, string[]> = {
  'yorha-dark': ['#ffd700', '#00ff41', '#ff6b6b', '#7ee7ff', '#c084fc'],
  'yorha-bw': ['#ffffff', '#cccccc', '#aaaaaa'],
  parchment: ['#c4752b', '#8b6914', '#6b4c2a', '#2563eb', '#059669'],
  investigation: ['#c4a35a', '#3b82a0', '#f59e0b', '#10b981', '#ef4444'],
  'research-light': ['#d97706', '#2563eb', '#059669', '#dc2626', '#7c3aed'],
  'nes-retro': ['#ffcc66', '#ff5c5c', '#4ade80', '#0084ff', '#e52521'],
  'high-contrast': ['#ffff00', '#00ffff', '#ff00ff', '#00ff00', '#ff8800'],
};
