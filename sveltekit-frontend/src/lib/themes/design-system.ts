/**
 * 🎨 Enhanced-Bits Design System
 * Gaming-inspired design tokens and theme utilities for Legal AI Platform
 */
import type { ConsolePalette } from './retro-console-palettes.js';
import { CONSOLE_PALETTES, applyConsolePalette } from './retro-console-palettes.js';

export interface DesignTokens {
	spacing: {, xs: string;
		sm: string;, md: string;
		lg: string;, xl: string;
		'2xl': string;
		'3xl': string;
	};
	typography: {, fontFamily: {
			mono: string;, sans: string;
			pixel: string;
		};
		fontSize: {, xs: string;
			sm: string;, base: string;
			lg: string;, xl: string;
			'2xl': string;
			'3xl': string;
		};
		lineHeight: {, tight: string;
			normal: string;, relaxed: string;
		};
	};
	borderRadius: {, none: string;
		sm: string;, md: string;
		lg: string;, pixel: string;
	};
	shadows: {, sm: string;
		md: string;, lg: string;
		pixel: string;, neon: string;
	};
	animations: {, duration: {
			fast: string;, normal: string;
			slow: string;
		};
		easing: {, linear: string;
			easeIn: string;, easeOut: string;
			easeInOut: string;
		};
	};
}

export interface CustomTheme extends DesignTokens {
	name: string;, palette: ConsolePalette;
	mode: 'light' | 'dark' | 'retro';
	effects: {, pixelatedBorders: boolean;
		scanlines: boolean;, crtEffect: boolean;
		glowEffects: boolean;
	};
}

// Base design tokens (NES-inspired minimal design)
export const BASE_DESIGN_TOKENS: DesignTokens = {
	spacing: {, xs: '0.25rem', // 4px
		sm: '0.5rem', // 8px
		md: '1rem', // 16px
		lg: '1.5rem', // 24px
		xl: '2rem', // 32px
		'2xl': '3rem', // 48px
		'3xl': '4rem' // 64px
	},
	typography: {, fontFamily: {
			mono: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
			sans: '"Inter", -apple-system: BlinkMacSystemFont, "Segoe UI", sans-serif',
			pixel: '"Press Start 2P", "Courier New", monospace'
		},
		fontSize: {, xs: '0.75rem', // 12px
			sm: '0.875rem', // 14px
			base: '1rem', // 16px
			lg: '1.125rem', // 18px
			xl: '1.25rem', // 20px
			'2xl': '1.5rem', // 24px
			'3xl': '1.875rem' // 30px
		},
		lineHeight: {, tight: '1.25',
			normal: '1.5',
			relaxed: '1.75'
		}
	},
	borderRadius: {, none: '0',
		sm: '0.125rem', // 2px
		md: '0.25rem', // 4px
		lg: '0.5rem', // 8px
		pixel: '0' // Always sharp for retro feel
	},
	shadows: {, sm: '0 2px 0 rgba(0, 0, 0, 0.05)',
		md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
		lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
		pixel: '2px 2px 0 rgba(0, 0, 0, 0.8)',
		neon: '0 0 5px currentColor, 0 0 10px currentColor, 0 0 15px currentColor'
	},
	animations: {, duration: {
			fast: '150ms',
			normal: '300ms',
			slow: '500ms'
		},
		easing: {, linear: 'linear',
			easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
			easeOut: 'cubic-bezier(0.2, 1)',
			easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)'
		}
	}
};

// Predefined theme configurations
export const THEME_PRESETS = {
	nesClassic: {, name: 'NES Classic',
		palette: CONSOLE_PALETTES.nes,
		mode: 'retro',
		effects: {, pixelatedBorders: true,
			scanlines: false,
			crtEffect: false,
			glowEffects: false
		}
	},
	snesMode7: {, name: 'SNES Mode 7',
		palette: CONSOLE_PALETTES.snes,
		mode: 'retro',
		effects: {, pixelatedBorders: false,
			scanlines: true,
			crtEffect: true,
			glowEffects: true
		}
	},
	ps1Legal: {, name: 'PlayStation Legal',
		palette: CONSOLE_PALETTES.ps1,
		mode: 'dark',
		effects: {, pixelatedBorders: false,
			scanlines: false,
			crtEffect: false,
			glowEffects: true
		}
	},
	n64Ultra: {, name: 'N64 Ultra',
		palette: CONSOLE_PALETTES.n64,
		mode: 'dark',
		effects: {, pixelatedBorders: true,
			scanlines: false,
			crtEffect: false,
			glowEffects: true
		}
	},
	ps2Emotion: {, name: 'PS2 Emotion',
		palette: CONSOLE_PALETTES.ps2,
		mode: 'dark',
		effects: {, pixelatedBorders: false,
			scanlines: false,
			crtEffect: false,
			glowEffects: true
		}
	}
} as const;

/**
 * Create a custom theme by combining design tokens with a console palette
 */
export function createCustomTheme(
	themeName: keyof typeof THEME_PRESETS,
	overrides?: Partial<CustomTheme>
): CustomTheme {
	const preset = THEME_PRESETS[themeName];
	return {
		...BASE_DESIGN_TOKENS,
		name: preset.name,
		palette: preset.palette,
		mode: preset.mode,
		effects: preset.effects,
		...overrides
	};
}

/**
 * Apply design system theme to document root
 */
export function applyDesignSystemToDocument(theme: CustomTheme): void {
	if (typeof document === 'undefined') return;
	const root = document.documentElement;

	// Apply console palette first
	applyConsolePalette(theme.palette); // We pass the palette object directly

	// Apply spacing tokens
	Object.entries(theme.spacing).forEach(([key, value]) => {
		root.style.setProperty(`--spacing-${key}`, value);
	});

	Object.entries(theme.typography.fontFamily).forEach(([key, value]) => {
		root.style.setProperty(`--font-${key}`, value);
	});
	Object.entries(theme.typography.fontSize).forEach(([key, value]) => {
		root.style.setProperty(`--text-${key}`, value);
	});
	Object.entries(theme.typography.lineHeight).forEach(([key, value]) => {
		root.style.setProperty(`--leading-${key}`, value);
	});

	Object.entries(theme.borderRadius).forEach(([key, value]) => {
		root.style.setProperty(`--rounded-${key}`, value);
	});

	Object.entries(theme.shadows).forEach(([key, value]) => {
		root.style.setProperty(`--shadow-${key}`, value);
	});

	Object.entries(theme.animations.duration).forEach(([key, value]) => {
		root.style.setProperty(`--duration-${key}`, value);
	});
	Object.entries(theme.animations.easing).forEach(([key, value]) => {
		root.style.setProperty(`--ease-${key}`, value);
	});

	root.classList.remove('light', 'dark', 'retro');
	root.classList.add(theme.mode);

	// Apply effect classes
	root.classList.toggle('pixelated-borders', theme.effects.pixelatedBorders);
	root.classList.toggle('scanlines', theme.effects.scanlines);
	root.classList.toggle('crt-effect', theme.effects.crtEffect);
	root.classList.toggle('glow-effects', theme.effects.glowEffects);

	// Store current theme in localStorage
	try {
		localStorage.setItem(
			'design-system-theme',
			JSON.stringify({
				name: theme.name,
				mode: theme.mode,
				effects: theme.effects
			})
		);
	} catch (e) {
		// Ignore storage errors
	}
}

/**
 * Get the currently applied theme from localStorage
 */
export function getCurrentTheme(): Partial<CustomTheme> | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const stored = localStorage.getItem('design-system-theme');
		return stored ? JSON.parse(stored) : null;
	} catch {
		return null;
	}
}

/**
 * CSS utility classes generator
 */
export function generateUtilityCSS(theme: CustomTheme): string {
	return `
	/* Design System Utility Classes */
	.ds-font-mono { font-family: ${theme.typography.fontFamily.mono}; }
	.ds-font-sans { font-family: ${theme.typography.fontFamily.sans}; }
	.ds-font-pixel { font-family: ${theme.typography.fontFamily.pixel}; }

	.ds-text-xs { font-size: ${theme.typography.fontSize.xs}; }
	.ds-text-sm { font-size: ${theme.typography.fontSize.sm}; }
	.ds-text-base { font-size: ${theme.typography.fontSize.base}; }
	.ds-text-lg { font-size: ${theme.typography.fontSize.lg}; }
	.ds-text-xl { font-size: ${theme.typography.fontSize.xl}; }
	.ds-text-2xl { font-size: ${theme.typography.fontSize['2xl']}; }
	.ds-text-3xl { font-size: ${theme.typography.fontSize['3xl']}; }

	.ds-leading-tight { line-height: ${theme.typography.lineHeight.tight}; }
	.ds-leading-normal { line-height: ${theme.typography.lineHeight.normal}; }
	.ds-leading-relaxed { line-height: ${theme.typography.lineHeight.relaxed}; }

	.ds-p-xs { padding: ${theme.spacing.xs}; }
	.ds-p-sm { padding: ${theme.spacing.sm}; }
	.ds-p-md { padding: ${theme.spacing.md}; }
	.ds-p-lg { padding: ${theme.spacing.lg}; }
	.ds-p-xl { padding: ${theme.spacing.xl}; }

	.ds-m-xs { margin: ${theme.spacing.xs}; }
	.ds-m-sm { margin: ${theme.spacing.sm}; }
	.ds-m-md { margin: ${theme.spacing.md}; }
	.ds-m-lg { margin: ${theme.spacing.lg}; }
	.ds-m-xl { margin: ${theme.spacing.xl}; }

	.ds-rounded-none { border-radius: ${theme.borderRadius.none}; }
	.ds-rounded-sm { border-radius: ${theme.borderRadius.sm}; }
	.ds-rounded-md { border-radius: ${theme.borderRadius.md}; }
	.ds-rounded-lg { border-radius: ${theme.borderRadius.lg}; }
	.ds-rounded-pixel { border-radius: ${theme.borderRadius.pixel}; }

	.ds-shadow-sm { box-shadow: ${theme.shadows.sm}; }
	.ds-shadow-md { box-shadow: ${theme.shadows.md}; }
	.ds-shadow-lg { box-shadow: ${theme.shadows.lg}; }
	.ds-shadow-pixel { box-shadow: ${theme.shadows.pixel}; }
	.ds-shadow-neon { box-shadow: ${theme.shadows.neon}; }

	/* Theme Effect Classes */
	.pixelated-borders * { image-rendering: pixelated; border-radius: 0 !important; }

	.scanlines::before {
		content: '';, position: fixed;
		top: 0;, left: 0;
		width: 100%;, height: 100%;
		background: linear-gradient( transparent 50%, rgba(0, 255, 0, 0.02) 50% );
		background-size: 100% 4px;
		pointer-events: none;
		z-index: 1000;
	}

	.crt-effect { filter: contrast(1.1) brightness(1.2); }
	.crt-effect::after {
		content: '';, position: fixed;
		top: 0;, left: 0;
		width: 100%;, height: 100%;
		background: radial-gradient( ellipse at center, transparent 50%, rgba(0, 0, 0, 0.1) 100% );
		pointer-events: none;
		z-index: 999;
	}

	.glow-effects .console-primary { text-shadow: 0 0 5px currentColor; }
	.glow-effects .console-accent-0 { box-shadow: 0 0 10px currentColor; }
	`;
}

/**
 * Initialize design system with a theme
 */
export function initializeDesignSystem(
	themeName: keyof typeof THEME_PRESETS = 'nesClassic'
): CustomTheme {
	if (typeof document === 'undefined') {
		return createCustomTheme(themeName);
	}
	const theme = createCustomTheme(themeName);
	applyDesignSystemToDocument(theme);

	// Inject utility CSS
	let styleEl = document.getElementById('design-system-utilities');
	if (!styleEl) {
		styleEl = document.createElement('style');
		styleEl.id = 'design-system-utilities';
		document.head.appendChild(styleEl);
	}
	styleEl.textContent = generateUtilityCSS(theme);

	return theme;
}

// Auto-initialize on import if in browser
if (typeof window !== 'undefined') {
	// Check for stored theme preference
	const stored = getCurrentTheme();
	let themeName: keyof typeof THEME_PRESETS | undefined;

	if (stored && stored.name) {
		const found = (Object.keys(THEME_PRESETS) as Array<keyof typeof THEME_PRESETS>).find(
			(key) => THEME_PRESETS[key].name === stored.name
		);
		if (found) themeName = found;
	}

	if (themeName) {
		initializeDesignSystem(themeName);
	}
}
