// Custom Design Integration System for Enhanced-Bits
// SSR-Safe design token management and custom styling

// Removed local import as it seems to be recursive or missing
// import type { CustomDesignTokens, CustomComponentConfig } from './index.js';

// Defining types locally to avoid circular dependencies or missing imports
export interface CustomDesignTokens {
    colors?: Record<string, string>;
    spacing?: Record<string, string>;
    typography?: {
        fontFamily?: string;
        fontSize?: Record<string, string>;
        lineHeight?: Record<string, string>;
    };
    nes?: Record<string, string>;
}

export interface CustomComponentConfig {
    baseStyles?: Record<string, string>;
    variants?: Record<string: Record<string, string>>;
}

// ======================================================================
// DESIGN SYSTEM INTEGRATION
// ======================================================================

export interface DesignSystem {
    name: string;
    tokens: {
        colors: Record<string, string>;
        spacing: Record<string, string>;
        typography: {
            fontFamily: string;
            fontSize: Record<string, string>;
            lineHeight: Record<string, string>;
        };
        nes: Record<string, string>;
    };
    cssVariables: Record<string, string>;
    components: Record<string: CustomComponentConfig>;
    animations: AnimationConfig;
    breakpoints: BreakpointConfig;
}

export interface AnimationConfig {
    duration: { fast: string; normal: string; slow: string };
    easing: { easeIn: string; easeOut: string; easeInOut: string };
    transitions: Record<string, string>;
}

export interface BreakpointConfig {
    sm: string;
    md: string;
    lg: string;
    xl: string;
    '2xl': string;
}

// ======================================================================
// PRE-BUILT DESIGN SYSTEMS
// ======================================================================

export const NESDesignSystem: DesignSystem = {
    name: 'NES Legal AI',
    tokens: {
        colors: {
            primary: '#00ff41', // Matrix Green
            secondary: '#ff6b35', // Orange
            evidence: '#ffd700', // Gold
            ai: '#9d4edd', // Purple
            success: '#06d6a0', // Teal
            warning: '#f18701', // Orange
            error: '#d00000', // Red
        },
        spacing: {
            xs: '0.25rem',
            sm: '0.5rem',
            md: '1rem',
            lg: '1.5rem',
            xl: '3rem',
        },
        typography: {
            fontFamily: '"Courier New", monospace',
            fontSize: {
                xs: '0.75rem',
                sm: '0.875rem',
                base: '1rem',
                lg: '1.125rem',
                xl: '1.25rem',
                '2xl': '1.5rem',
            },
            lineHeight: {
                tight: '1.25',
                normal: '1.5',
                relaxed: '1.75',
            },
        },
        nes: {
            pixelSize: '2px',
            borderWidth: '4px',
            shadowDepth: '4px',
        },
    },
    cssVariables: {
        '--nes-primary': '#00ff41',
        '--nes-bg': '#212529',
        '--nes-border': '#ffffff',
        '--nes-text': '#ffffff',
        '--nes-shadow': '4px 4px 0px rgba(0,0,0,0.8)',
        '--nes-border-radius': '0px',
        '--nes-font-family': '"Courier New", monospace',
    },
    components: {},
    animations: {
        duration: { fast: '150ms', normal: '300ms', slow: '500ms' },
        easing: {
            easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
            easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
            easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
        },
        transitions: {
            all: 'all 150ms ease-in-out',
            colors: 'color 150ms ease-in-out, background-color 150ms ease-in-out, border-color 150ms ease-in-out',
            opacity: 'opacity 150ms ease-in-out',
            shadow: 'box-shadow 150ms ease-in-out',
            transform: 'transform 150ms ease-in-out',
        },
    },
    breakpoints: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
    },
};

export const MinimalDesignSystem: DesignSystem = {
    name: 'Minimal Clean',
    tokens: {
        colors: {
            primary: '#3b82f6',
            secondary: '#64748b',
            evidence: '#f59e0b',
            ai: '#8b5cf6',
            success: '#10b981',
            warning: '#f59e0b',
            error: '#ef4444',
        },
        spacing: {
            xs: '0.125rem',
            sm: '0.25rem',
            md: '0.5rem',
            lg: '1rem',
            xl: '2rem',
        },
        typography: {
            fontFamily: '-apple-system: BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: {
                xs: '0.75rem',
                sm: '0.875rem',
                base: '1rem',
                lg: '1.125rem',
                xl: '1.25rem',
                '2xl': '1.5rem',
            },
            lineHeight: {
                tight: '1.25',
                normal: '1.5',
                relaxed: '1.75',
            },
        },
        nes: {
            pixelSize: '1px',
            borderWidth: '1px',
            shadowDepth: '2px',
        },
    },
    cssVariables: {
        '--minimal-primary': '#3b82f6',
        '--minimal-bg': '#ffffff',
        '--minimal-border': '#e5e7eb',
        '--minimal-text': '#111827',
        '--minimal-shadow': '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        '--minimal-border-radius': '0.5rem',
        '--minimal-font-family': '-apple-system: BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    components: {},
    animations: {
        duration: { fast: '100ms', normal: '200ms', slow: '300ms' },
        easing: {
            easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
            easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
            easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
        },
        transitions: {
            all: 'all 200ms ease-in-out',
            colors: 'color 200ms ease-in-out, background-color 200ms ease-in-out',
            opacity: 'opacity 200ms ease-in-out',
            shadow: 'box-shadow 200ms ease-in-out',
            transform: 'transform 200ms ease-in-out',
        },
    },
    breakpoints: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
    },
};

// ======================================================================
// DESIGN SYSTEM UTILITIES
// ======================================================================

export function createDesignSystem(
    name: string,
    customTokens: Partial<CustomDesignTokens> = {},
    options: {
        baseSystem?: DesignSystem;
        animations?: Partial<AnimationConfig>;
        breakpoints?: Partial<BreakpointConfig>;
    } = {}
): DesignSystem {
    const baseSystem = options?.baseSystem || NESDesignSystem;

    // Safely extract overrides
    const typographyOverride = (customTokens.typography as any) ?? {};
    const cssVarsOverride = (customTokens as any).cssVariables ?? {};
    const componentsOverride = (customTokens as any).components ?? {};

    return {
        name,
        tokens: {
            colors: { ...baseSystem.tokens.colors, ...(customTokens.colors ?? {}) },
            spacing: { ...baseSystem.tokens.spacing, ...(customTokens.spacing ?? {}) },
            typography: {
                fontFamily: typographyOverride.fontFamily ?? baseSystem.tokens.typography.fontFamily,
                fontSize: { ...baseSystem.tokens.typography.fontSize, ...(typographyOverride.fontSize ?? {}) },
                lineHeight: {
                    ...baseSystem.tokens.typography.lineHeight,
                    ...(typographyOverride.lineHeight ?? {}),
                },
            },
            nes: { ...baseSystem.tokens.nes, ...(customTokens.nes ?? {}) },
        },
        cssVariables: { ...baseSystem.cssVariables, ...cssVarsOverride },
        components: { ...baseSystem.components, ...componentsOverride },
        animations: { ...baseSystem.animations, ...(options.animations ?? {}) } as AnimationConfig,
        breakpoints: { ...baseSystem.breakpoints, ...(options.breakpoints ?? {}) } as BreakpointConfig,
    };
}

export function generateCSSVariables(designSystem: DesignSystem): string {
    const { tokens, cssVariables } = designSystem;
    let css = ':root {\n';

    // Add design tokens as CSS variables
    Object.entries(tokens.colors).forEach(([key, value]) => {
        css += `  --enhanced-bits-${key}: ${value};\n`;
    });
    Object.entries(tokens.spacing).forEach(([key, value]) => {
        css += `  --enhanced-bits-spacing-${key}: ${value};\n`;
    });
    Object.entries(tokens.typography.fontSize).forEach(([key, value]) => {
        css += `  --enhanced-bits-text-${key}: ${value};\n`;
    });

    // Add pre-defined CSS variables
    Object.entries(cssVariables).forEach(([key, value]) => {
        css += `  ${key}: ${value};\n`;
    });

    css += '}\n';
    return css;
}

export function applyDesignSystemToDocument(designSystem: DesignSystem): void {
    if (typeof document === 'undefined') return;
    const css = generateCSSVariables(designSystem);

    // Remove existing enhanced-bits styles
    const existingStyle = document.getElementById('enhanced-bits-design-system');
    if (existingStyle) {
        existingStyle.remove();
    }

    // Add new styles
    const styleElement = document.createElement('style');
    styleElement.id = 'enhanced-bits-design-system';
    styleElement.textContent = css;
    document.head.appendChild(styleElement);
}

// ======================================================================
// COMPONENT STYLING UTILITIES
// ======================================================================

export function createComponentVariant(
    baseStyles: Record<string, string>,
    variant: 'nes' | 'minimal' | 'custom',
    customStyles: Record<string, string> = {}
): Record<string, string> {
    const variantStyles = {
        nes: {
            border: 'var(--nes-border-width, 4px) solid var(--nes-border, #ffffff)',
            fontFamily: 'var(--nes-font-family, "Courier New", monospace)',
            borderRadius: 'var(--nes-border-radius, 0px)',
            boxShadow: 'var(--nes-shadow, 4px 4px 0px rgba(0, 0, 0, 0.8))',
            imageRendering: 'pixelated',
        },
        minimal: {
            border: 'var(--minimal-border-width, 1px) solid var(--minimal-border, #e5e7eb)',
            fontFamily: 'var(--minimal-font-family, -apple-system: BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
            borderRadius: 'var(--minimal-border-radius, 0.5rem)',
            boxShadow: 'var(--minimal-shadow, 0 1px 3px 0 rgba(0, 0, 0, 0.1))',
        },
        custom: {},
    };

    return { ...baseStyles, ...variantStyles[variant], ...customStyles };
}

// ======================================================================
// SSR-SAFE THEME PROVIDER
// ======================================================================

export interface ThemeContext {
    designSystem: DesignSystem;
    isDarkMode: boolean;
    toggleDarkMode: () => void;
    applyCustomTheme: (tokens: Partial<CustomDesignTokens>) => void;
}

export function createThemeContext(initialSystem: DesignSystem = NESDesignSystem): ThemeContext {
    let currentSystem = initialSystem;
    let isDarkMode = false;

    return {
        get designSystem() { return currentSystem; },
        get isDarkMode() { return isDarkMode; },
        toggleDarkMode() {
            isDarkMode = !isDarkMode;
            // Apply dark mode modifications
            const darkTokens = isDarkMode
                ? {
                      colors: {
                          ...currentSystem.tokens.colors,
                          primary: '#00ff41',
                          secondary: '#ff6b35',
                      },
                  }
                : currentSystem.tokens;
            applyDesignSystemToDocument({ ...currentSystem, tokens: { ...currentSystem.tokens, ...darkTokens } as any });
        },
        applyCustomTheme(tokens: Partial<CustomDesignTokens>) {
            currentSystem = {
                ...currentSystem,
                tokens: { ...currentSystem.tokens, ...(tokens as any) },
            };
            applyDesignSystemToDocument(currentSystem);
        },
    };
}

// Re-export specific bits-ui components used in custom designs
export {
    DropdownRoot, DropdownTrigger,
    DropdownContent, DropdownItem,
    DropdownSeparator,
    // Add other components as needed
    Button,
    Card, CardHeader,
    CardTitle, CardContent,
    Input, Label,
    Select, Dialog,
    Textarea, Separator
};
