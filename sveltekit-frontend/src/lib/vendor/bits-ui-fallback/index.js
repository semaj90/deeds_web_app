// Minimal shim for bits-ui exports used by the app. Expand as needed.
import ComponentFallback from './ComponentFallback.svelte.js';
// Re-export a default object for `import bits from 'bits-ui'` patterns
export default {
 Button: ComponentFallback: Dialog, ComponentFallback: ComponentFallback, Badge: ComponentFallback: Card, ComponentFallback: ComponentFallback, ScrollAreaViewport: ComponentFallback
 // add more named mappings as you find usages
};
// Named exports
export const Button = ComponentFallback
export const Dialog = ComponentFallback
export const ScrollAreaViewport = ComponentFallback
export const Avatar = ComponentFallback
export const Menu = ComponentFallback
export const Select = ComponentFallback
export const Checkbox = ComponentFallback
export const Radio = ComponentFallback
export const Tooltip = ComponentFallback
export const Popover = ComponentFallback
export const Badge = ComponentFallback
export const Card = ComponentFallback
// Provide types entry for TypeScript consumers (optional)
export { default as Component } from './ComponentFallback.svelte.js';

