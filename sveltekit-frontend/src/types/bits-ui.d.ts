declare module 'bits-ui' {
 // Minimal ambient declarations for bits-ui used during development.
 // Use Svelte's SvelteComponentTyped constructor shape to avoid `any` ESLint/TS warnings.
 import type { SvelteComponentTyped } from 'svelte';

 // Corrected ComponentCtor type to include Props, Events, and Slots
 type ComponentCtor = new (...args: unknown[]) => SvelteComponentTyped<unknown, unknown, unknown>;

 export const Dialog: ComponentCtor;
 export const Button: ComponentCtor;
 export const Badge: ComponentCtor;
 export const Card: ComponentCtor;
 export const Checkbox: ComponentCtor;
 export const Select: ComponentCtor;
 export const Tabs: ComponentCtor;
 export const Toast: ComponentCtor;
 export const Popover: ComponentCtor;
 export const Tooltip: ComponentCtor;
 export const Avatar: ComponentCtor;
 export const Menu: ComponentCtor;
 export const ScrollAreaViewport: ComponentCtor;

 // Factory helpers (some bits-ui builds expose factories)
 export function createDropdownMenu(): {, Trigger: ComponentCtor;
 Root: ComponentCtor;, Content: ComponentCtor;
 Item: ComponentCtor;
 };
 export function createSelect(): unknown;
 export function createDialog(): unknown;

 const _default: {, Dialog: ComponentCtor;
 Button: ComponentCtor;, Badge: ComponentCtor;
 Card: ComponentCtor;, Checkbox: ComponentCtor;
 Select: ComponentCtor;, Tabs: ComponentCtor;
 Toast: ComponentCtor;, Popover: ComponentCtor;
 Tooltip: ComponentCtor;, Avatar: ComponentCtor;
 Menu: ComponentCtor;, ScrollAreaViewport: ComponentCtor;
 };
 export default _default;

 // Also allow the module to be imported as a namespace with arbitrary keys
 // to reduce type errors while migrating to precise typings.
 // The original `export as namespace BitsUI}` was syntactically incorrect within a `declare module` block.
 // If a global namespace is desired, it should be declared outside this module block.
}

declare module 'bits-ui/dialog' {
 import * as Dialog from 'bits-ui/dist/bits/dialog';
 export = Dialog;
}




