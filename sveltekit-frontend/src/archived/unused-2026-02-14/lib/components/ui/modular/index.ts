// Modular UI Components - Bits UI + UnoCSS + Svelte 5
// Export all modular components for clean imports

export { default as Button } from './Button.svelte';
export { default as Card } from './Card.svelte';
export { default as Dialog } from './Dialog.svelte';
export { default as Input } from './Input.svelte';
export { default as Form } from './Form.svelte';
export { default as Progress } from './Progress.svelte';
export { default as Badge } from './Badge.svelte';
export { default as FileUpload } from './FileUpload.svelte';

// Type exports (only export types that exist in ./types)
export type {
  ButtonProps,
  CardProps,
  DialogProps,
  InputProps,
  BaseProps
} from './types';

// Component variants and types for external use
export type ButtonVariant = 
  | 'default'
  | 'destructive'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'link'
  | 'yorha'
  | 'legal'
  | 'evidence'
  | 'case';

export type CardVariant = 'default' | 'elevated' | 'outlined' | 'filled' | 'yorha' | 'glass';
