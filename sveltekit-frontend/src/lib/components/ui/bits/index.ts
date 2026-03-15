/**
 * bits-ui v2 Barrel Export for Svelte 5
 *
 * For production use, prefer importing from the specific component directories:
 *   - $lib/components/ui/button/Button.svelte
 *   - $lib/components/ui/card/Card.svelte
 *   - $lib/components/ui/dialog/Dialog.svelte
 *   - $lib/components/ui/select/Select.svelte
 *   - etc.
 *
 * Or import directly from 'bits-ui' for raw bits-ui components.
 */

// Re-export bits-ui components for convenience (Dialog removed — use $lib/components/ui/dialog for SSR safety)
export { Avatar, Button, Checkbox, Popover, Select, Tabs, Tooltip } from 'bits-ui';

// Real Svelte 5 implementations (not stubs)
export { default as Svelte5Button } from './Svelte5Button.svelte';
export { default as BitsButton } from './Button.svelte';

// Export types
export * from './types.js';
