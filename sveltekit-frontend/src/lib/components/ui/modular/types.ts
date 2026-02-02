import type { Snippet } from 'svelte';
import type { HTMLAttributes, HTMLButtonAttributes, HTMLInputAttributes } from 'svelte/elements';

// Base component props
export interface BaseProps {
  children?: Snippet;
  class?: string;
  [key: string]: any;
}

// Button component props
export interface ButtonProps extends HTMLButtonAttributes {
  children?: Snippet;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'yorha' | 'legal' | 'evidence' | 'case';
  size?: 'default' | 'sm' | 'lg' | 'icon' | 'xs';
  loading?: boolean;
  icon?: string;
  href?: string;
  target?: string;
}

// Card component props
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: Snippet;
  variant?: 'default' | 'elevated' | 'outlined' | 'filled' | 'yorha' | 'glass';
  size?: 'sm' | 'default' | 'lg' | 'xl';
  padding?: 'none' | 'sm' | 'default' | 'lg';
  header?: Snippet;
  footer?: Snippet;
  hoverable?: boolean;
  interactive?: boolean;
}

// Dialog component props
export interface DialogProps {
  children?: Snippet;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  variant?: 'default' | 'yorha' | 'legal' | 'fullscreen' | 'drawer';
  size?: 'sm' | 'default' | 'lg' | 'xl' | '2xl';
  title?: string;
  description?: string;
  trigger?: Snippet;
  header?: Snippet;
  footer?: Snippet;
  closeOnEscape?: boolean;
  closeOnOutsideClick?: boolean;
  class?: string;
}

// Input component props
export interface InputProps extends Omit<HTMLInputAttributes, 'size'> {
  children?: Snippet;
  variant?: 'default' | 'outlined' | 'filled' | 'ghost' | 'yorha' | 'legal';
  inputSize?: 'sm' | 'default' | 'lg'; // Renamed to avoid reserved attribute warning if needed, but keeping consistent with usage might be key.
  // Actually, HTMLInputAttributes has 'size' as number. The interface above used 'size?: 'sm'...' which conflicts.
  // The mangled code had `Omit<HTMLInputAttributes, 'size'>`. I will follow that.
  size?: 'sm' | 'default' | 'lg';
  state?: 'default' | 'error' | 'warning' | 'success';
  label?: string;
  helperText?: string;
  errorMessage?: string;
  icon?: string;
  suffix?: string;
}

export type { HTMLAttributes, HTMLButtonAttributes, HTMLInputAttributes };
