/**
 * Gaming Effects Barrel Export
 * Centralized exports for all gaming UI effects
 */

// Audio effects
export { default as retroAudio } from './audio-effects';

// Gradient utilities
export {
    generateGradient,
    getSizeStyles,
    getMode7Transform,
    SNES_PALETTE,
    NES_PALETTE
} from './gradient-utils';

export type {
    GradientOptions,
    RetroColorPalette,
    SizeStyles
} from './gradient-utils';
