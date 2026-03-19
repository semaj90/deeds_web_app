declare module 'bits-ui' {
 // Minimal ambient declarations for bits-ui used during development.
 // Use Svelte 5 Component type for compatibility with runes mode.
 import type { Component } from 'svelte';

 type ComponentCtor = Component<Record<string, any>, Record<string, any>, any>;

 export const Dialog: {
  Root: ComponentCtor;
  Trigger: ComponentCtor;
  Portal: ComponentCtor;
  Overlay: ComponentCtor;
  Content: ComponentCtor;
  Title: ComponentCtor;
  Description: ComponentCtor;
  Close: ComponentCtor;
 };
 export const Button: ComponentCtor;
 export const Badge: ComponentCtor;
 export const Card: ComponentCtor;
 export const Checkbox: ComponentCtor;
 export const Select: {
  Root: ComponentCtor;
  Trigger: ComponentCtor;
  Content: ComponentCtor;
  Item: ComponentCtor;
  Value: ComponentCtor;
  Group: ComponentCtor;
  GroupHeading: ComponentCtor;
 };
 export const Tabs: {
  Root: ComponentCtor;
  List: ComponentCtor;
  Trigger: ComponentCtor;
  Content: ComponentCtor;
 };
 export const Toast: ComponentCtor;
 export const Collapsible: {
   Root: ComponentCtor;
   Trigger: ComponentCtor;
   Content: ComponentCtor;
 };
 export const Command: {
   Root: ComponentCtor;
   Input: ComponentCtor;
   List: ComponentCtor;
   Empty: ComponentCtor;
   Group: ComponentCtor;
   Item: ComponentCtor;
   Separator: ComponentCtor;
 };
 export const Popover: ComponentCtor;
 export const Tooltip: ComponentCtor;
 export const Avatar: ComponentCtor;
 export const Menu: ComponentCtor;
 export const ScrollAreaViewport: ComponentCtor;
 export const ScrollArea: {
   Root: ComponentCtor;
   Viewport: ComponentCtor;
   Scrollbar: ComponentCtor;
   Thumb: ComponentCtor;
   Corner: ComponentCtor;
 };

 // Factory helpers (some bits-ui builds expose factories)
 export function createDropdownMenu(): { Trigger: ComponentCtor;
 Root: ComponentCtor, Content: ComponentCtor;
 Item: ComponentCtor;
 };
 export function createSelect(): unknown;
 export function createDialog(): unknown;

 const _default: { Dialog: ComponentCtor;
 Button: ComponentCtor, Badge: ComponentCtor;
 Card: ComponentCtor, Checkbox: ComponentCtor;
 Select: ComponentCtor, Tabs: ComponentCtor;
 Toast: ComponentCtor, Popover: ComponentCtor;
 Tooltip: ComponentCtor, Avatar: ComponentCtor;
 Menu: ComponentCtor, ScrollAreaViewport: ComponentCtor;
   ScrollArea: { Root: ComponentCtor; Viewport: ComponentCtor; Scrollbar: ComponentCtor; Thumb: ComponentCtor; Corner: ComponentCtor; };
 };
 export default _default;

 // Also allow the module to be imported as a namespace with arbitrary keys
 // to reduce type errors while migrating to precise typings.
 // The original `export as namespace BitsUI}` was syntactically incorrect within a `declare module` block.
 // If a global namespace is desired, it should be declared outside this module block.
}

declare module 'bits-ui/dialog' {
 import { Dialog } from "bits-ui";
export = Dialog;
}




