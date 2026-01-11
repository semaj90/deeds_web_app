// Bits UI + Enhanced-Bits Integration Layer
// Combines bits-ui headless components with enhanced-bits custom styling
// Provides unified component API with custom design system support
import type { SvelteComponent } from 'svelte';

// Enhanced Design System Tokens
export interface DesignTokens {
  colors: {
    primary: string;
    secondary: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    background: string;
    surface: string;
    text: {
      primary: string;
      secondary: string;
      muted: string;
    };
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    xxl: string;
  };
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  shadows: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  typography: {
    fontFamily: string;
    fontSize: {
      xs: string;
      sm: string;
      md: string;
      lg: string;
      xl: string;
      xxl: string;
    };
    fontWeight: {
      normal: number;
      medium: number;
      bold: number;
    };
  };
  animations: {
    duration: {
      fast: string;
      normal: string;
      slow: string;
    };
    easing: string;
  };
}

// NES.css Inspired Design System
export const NESDesignSystem: DesignTokens = {
  colors: {
    primary: '#209cee',
    secondary: '#f7d51d',
    success: '#92cc41',
    warning: '#f7d51d',
    error: '#e76e55',
    info: '#42a5f5',
    background: '#212529',
    surface: '#343a40',
    text: {
      primary: '#ffffff',
      secondary: '#adb5bd',
      muted: '#6c757d',
    },
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    xxl: '3rem',
  },
  borderRadius: {
    sm: '2px',
    md: '4px',
    lg: '8px',
    xl: '12px',
  },
  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
    md: '0 4px 8px rgba(0, 0, 0, 0.3)',
    lg: '0 10px 20px rgba(0, 0, 0, 0.3)',
    xl: '0 20px 40px rgba(0, 0, 0, 0.3)',
  },
  typography: {
    fontFamily: "'Press Start 2P', 'Courier New', monospace",
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem',
      md: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      xxl: '1.5rem',
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      bold: 700,
    },
  },
  animations: {
    duration: {
      fast: '0.15s',
      normal: '0.3s',
      slow: '0.5s',
    },
    easing: 'ease-in-out',
  },
};

// Minimal Design System
export const MinimalDesignSystem: DesignTokens = {
  colors: {
    primary: '#007bff',
    secondary: '#6c757d',
    success: '#28a745',
    warning: '#ffc107',
    error: '#dc3545',
    info: '#17a2b8',
    background: '#ffffff',
    surface: '#f8f9fa',
    text: {
      primary: '#212529',
      secondary: '#6c757d',
      muted: '#adb5bd',
    },
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    xxl: '3rem',
  },
  borderRadius: {
    sm: '0.125rem',
    md: '0.25rem',
    lg: '0.375rem',
    xl: '0.5rem',
  },
  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.1)',
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem',
      md: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      xxl: '1.5rem',
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      bold: 700,
    },
  },
  animations: {
    duration: {
      fast: '0.15s',
      normal: '0.2s',
      slow: '0.3s',
    },
    easing: 'ease-in-out',
  },
};

// Design System Application
export function applyCustomDesign(element: HTMLElement, theme: DesignTokens): void {
  if (!element) return;

  const root = element;
  const cssVars: Record<string, string> = {
    // Colors
    '--bits-primary': theme.colors.primary,
    '--bits-secondary': theme.colors.secondary,
    '--bits-success': theme.colors.success,
    '--bits-warning': theme.colors.warning,
    '--bits-error': theme.colors.error,
    '--bits-info': theme.colors.info,
    '--bits-background': theme.colors.background,
    '--bits-surface': theme.colors.surface,
    '--bits-text-primary': theme.colors.text.primary,
    '--bits-text-secondary': theme.colors.text.secondary,
    '--bits-text-muted': theme.colors.text.muted,

    // Spacing
    '--bits-spacing-xs': theme.spacing.xs,
    '--bits-spacing-sm': theme.spacing.sm,
    '--bits-spacing-md': theme.spacing.md,
    '--bits-spacing-lg': theme.spacing.lg,
    '--bits-spacing-xl': theme.spacing.xl,
    '--bits-spacing-xxl': theme.spacing.xxl,

    // Border Radius
    '--bits-radius-sm': theme.borderRadius.sm,
    '--bits-radius-md': theme.borderRadius.md,
    '--bits-radius-lg': theme.borderRadius.lg,
    '--bits-radius-xl': theme.borderRadius.xl,

    // Shadows
    '--bits-shadow-sm': theme.shadows.sm,
    '--bits-shadow-md': theme.shadows.md,
    '--bits-shadow-lg': theme.shadows.lg,
    '--bits-shadow-xl': theme.shadows.xl,

    // Typography
    '--bits-font-family': theme.typography.fontFamily,
    '--bits-font-size-xs': theme.typography.fontSize.xs,
    '--bits-font-size-sm': theme.typography.fontSize.sm,
    '--bits-font-size-md': theme.typography.fontSize.md,
    '--bits-font-size-lg': theme.typography.fontSize.lg,
    '--bits-font-size-xl': theme.typography.fontSize.xl,
    '--bits-font-size-xxl': theme.typography.fontSize.xxl,
    '--bits-font-weight-normal': theme.typography.fontWeight.normal.toString(),
    '--bits-font-weight-medium': theme.typography.fontWeight.medium.toString(),
    '--bits-font-weight-bold': theme.typography.fontWeight.bold.toString(),

    // Animations
    '--bits-duration-fast': theme.animations.duration.fast,
    '--bits-duration-normal': theme.animations.duration.normal,
    '--bits-duration-slow': theme.animations.duration.slow,
    '--bits-easing': theme.animations.easing,
  };

  Object.entries(cssVars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

export function createCustomTheme(theme: Partial<DesignTokens>): DesignTokens {
  return {
    colors: { ...NESDesignSystem.colors, ...theme.colors },
    spacing: { ...NESDesignSystem.spacing, ...theme.spacing },
    borderRadius: { ...NESDesignSystem.borderRadius, ...theme.borderRadius },
    shadows: { ...NESDesignSystem.shadows, ...theme.shadows },
    typography: { ...NESDesignSystem.typography, ...theme.typography },
    animations: { ...NESDesignSystem.animations, ...theme.animations },
  };
}

// Bits UI re-exports with enhanced styling
import { Dialog,
	Button,
	Select,
	Popover,
	Tooltip,
	Combobox,
 } from 'bits-ui';
import DropdownMenu from 'bits-ui';
import ContextMenu from 'bits-ui';
import Toolbar from 'bits-ui';
import Resizable from 'bits-ui';

export {
	Dialog,
	Button,
	Select,
	Popover,
	Tooltip,
	Combobox,
	DropdownMenu,
	ContextMenu,
	Toolbar,
	Resizable,
};
// Enhanced-bits styling utilities are now defined in this file as placeholders.

// Integration helpers
export interface BitsUIEnhancedConfig {
	theme: DesignTokens;
	component: SvelteComponent;
	variant?: 'nes' | 'minimal' | 'custom';
	accessibility?: boolean;
	animations?: boolean;
}
export function createEnhancedComponent(config: BitsUIEnhancedConfig) {
	return { component: config.component, theme: config.theme, variant: config.variant || 'nes', enhanced: true };
}
// Compound component helpers for shadcn-style usage
export function createCompoundComponent<T>(
	RootComponent: SvelteComponent,
	subComponents: Record<string, SvelteComponent>
): T & Record<string, SvelteComponent> {
	return Object.assign(RootComponent, { Root: RootComponent, ...subComponents }) as unknown as T &
		Record<string, SvelteComponent>;
}
// Theme-aware component wrapper
export function withEnhancedStyling(
	Component: SvelteComponent,
	theme: DesignTokens,
	variant: 'nes' | 'minimal' | 'custom' = 'nes'
) {
	return { component: Component, theme, variant, apply: (element: HTMLElement) => applyCustomDesign(element, theme) };
}
// Legacy melt-ui migration helpers (for smooth transition)
export const legacyMeltSupport = {
	melt: (..._args: any[]) => ({}),
	createDialog: () => ({ Dialog }),
	createPopover: () => ({ Popover }),
	createDropdownMenu: () => ({ DropdownMenu }),
	createContextMenu: () => ({ ContextMenu }),
	createTooltip: () => ({ Tooltip }),
	createSelect: () => ({ Select }),
	createCombobox: () => ({ Combobox }),
	createToolbar: () => ({ Toolbar }),
	createResizable: () => ({ Resizable })
};
export default { ...legacyMeltSupport, createEnhancedComponent, createCompoundComponent, withEnhancedStyling };



