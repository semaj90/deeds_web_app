// Switch Component - Svelte 5 Native Implementation
// bits-ui v2 does not include Switch component, using native implementation

import Switch from "./Svelte5Switch.svelte";

// Default export
export { Switch };

// Also export as default for default import syntax
export { Switch as default };

// Switch-specific common props interface (local, not exported)
interface SwitchCommonProps {
  className?: string;
  [key: string]: any;
}

// TypeScript interface for Switch props
export interface SwitchProps extends SwitchCommonProps {
  checked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'destructive';
}


