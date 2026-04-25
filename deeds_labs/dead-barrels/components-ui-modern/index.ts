/**
 * Modern UI Components - SvelteKit 2 + Svelte 5 + Bits-UI + Melt-UI
 * Golden ratio spacing, CSS Grid/Flexbox, no prop drilling
 */
// ARCHIVED: ModernCard, ModernButton, ModernDialog moved to deeds_labs/svelte4-archive/
// export { default as ModernCard } from './ModernCard.svelte';
// export { default as ModernButton } from './ModernButton.svelte';
// export { default as ModernDialog } from './ModernDialog.svelte';

// Type exports for better TypeScript support (Svelte 5 compatible)
// Explicit prop interfaces (align with component internal Props declarations)

import type { Snippet } from 'svelte';
import type { BitsUI } from '$lib/types/enhanced-svelte5-types';

export interface ModernCardProps {
    title?: string;
    subtitle?: string;
    variant?: 'default' | 'elevated' | 'outline' | 'ghost';
    size?: 'sm' | 'md' | 'lg' | 'xl';
    hoverable?: boolean;
    clickable?: boolean;
    loading?: boolean;
    tooltip?: string;
    children?: Snippet;
    header?: Snippet;
    footer?: Snippet;
    actions?: Snippet;
    onclick?: () => void;
}

export interface ModernButtonProps {
    variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'success';
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    loading?: boolean;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
    href?: string;
    external?: boolean;
    tooltip?: string;
    icon?: Snippet;
    children?: Snippet;
    onclick?: (event: MouseEvent) => void;
}

export interface ModernDialogProps {
    open?: boolean;
    title?: string;
    description?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
    persistent?: boolean;
    showClose?: boolean;
    children?: Snippet;
    trigger?: Snippet;
    footer?: Snippet;
    onClose?: () => void;
}

// Component variants for easier usage
export const cardVariants = ['default', 'elevated', 'outline', 'ghost'] as const;
export const buttonVariants = ['primary', 'secondary', 'ghost', 'outline', 'danger', 'success'] as const;
export const sizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const;

// Utility functions for golden ratio calculations
export const goldenRatio = 1.618;

export function goldenSpacing(multiplier: number = 1): string {
    return `calc(1rem * ${goldenRatio * multiplier})`;
}

export function goldenScale(base: number, level: number) {
    return base * Math.pow(goldenRatio, level);
}

// CSS custom property helpers
export const cssVars = {
    // Golden ratio spacing
    goldenXs: 'var(--golden-xs)',
    goldenSm: 'var(--golden-sm)',
    goldenMd: 'var(--golden-md)',
    goldenLg: 'var(--golden-lg)',
    goldenXl: 'var(--golden-xl)',
    golden2xl: 'var(--golden-2xl)',
    golden3xl: 'var(--golden-3xl)',

    // Typography
    textXs: 'var(--text-xs)',
    textSm: 'var(--text-sm)',
    textBase: 'var(--text-base)',
    textLg: 'var(--text-lg)',
    textXl: 'var(--text-xl)',
    text2xl: 'var(--text-2xl)',
    text3xl: 'var(--text-3xl)',
    text4xl: 'var(--text-4xl)',
    text5xl: 'var(--text-5xl)',

    // YoRHa colors
    bgPrimary: 'var(--yorha-bg-primary)',
    bgSecondary: 'var(--yorha-bg-secondary)',
    bgTertiary: 'var(--yorha-bg-tertiary)',
    bgCard: 'var(--yorha-bg-card)',
    bgHover: 'var(--yorha-bg-hover)',
    textPrimary: 'var(--yorha-text-primary)',
    textSecondary: 'var(--yorha-text-secondary)',
    textMuted: 'var(--yorha-text-muted)',
    accentGold: 'var(--yorha-accent-gold)',
    accentBlue: 'var(--yorha-accent-blue)',
    accentGreen: 'var(--yorha-accent-green)',
    borderPrimary: 'var(--yorha-border-primary)',
    borderSecondary: 'var(--yorha-border-secondary)',
    borderAccent: 'var(--yorha-border-accent)'
} as const;
