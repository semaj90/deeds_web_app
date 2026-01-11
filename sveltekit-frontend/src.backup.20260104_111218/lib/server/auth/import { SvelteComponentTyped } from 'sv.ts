import type { SvelteComponentTyped } from 'svelte';

declare module 'bits-ui' {
 // Provide proper Svelte component class declarations instead of `typeof SvelteComponentTyped<any>`
 // Use any for props/events/slots to keep this declaration file generic and avoid type errors.

 export namespace Dialog {
 export class Root extends SvelteComponentTyped<any, any, any> {}
 export class Portal extends SvelteComponentTyped<any, any, any> {}
 export class Overlay extends SvelteComponentTyped<any, any, any> {}
 export class Content extends SvelteComponentTyped<any, any, any> {}
 export class Header extends SvelteComponentTyped<any, any, any> {}
 export class Title extends SvelteComponentTyped<any, any, any> {}
 export class Description extends SvelteComponentTyped<any, any, any> {}
 export class Close extends SvelteComponentTyped<any, any, any> {}
 export class Trigger extends SvelteComponentTyped<any, any, any> {}
 }

 export namespace Select {
 export class Value extends SvelteComponentTyped<any, any, any> {}
 export class Item extends SvelteComponentTyped<any, any, any> {}
 export class Input extends SvelteComponentTyped<any, any, any> {}
 export class Group extends SvelteComponentTyped<any, any, any> {}
 export class Label extends SvelteComponentTyped<any, any, any> {}
 export class Separator extends SvelteComponentTyped<any, any, any> {}
 }

 export namespace Combobox {
 export class HiddenInput extends SvelteComponentTyped<any, any, any> {}
 }

 export namespace DatePicker {
 export class Heading extends SvelteComponentTyped<any, any, any> {}
 export class PrevButton extends SvelteComponentTyped<any, any, any> {}
 export class NextButton extends SvelteComponentTyped<any, any, any> {}
 export class Grid extends SvelteComponentTyped<any, any, any> {}
 export class GridHead extends SvelteComponentTyped<any, any, any> {}
 export class GridBody extends SvelteComponentTyped<any, any, any> {}
 export class GridRow extends SvelteComponentTyped<any, any, any> {}
 export class HeadCell extends SvelteComponentTyped<any, any, any> {}
 export class Cell extends SvelteComponentTyped<any, any, any> {}
 export class Day extends SvelteComponentTyped<any, any, any> {}
 export class TimeField extends SvelteComponentTyped<any, any, any> {}
 export class TimeSegment extends SvelteComponentTyped<any, any, any> {}
 }

 export namespace Toast {
 export class Provider extends SvelteComponentTyped<any, any, any> {}
 export class Action extends SvelteComponentTyped<any, any, any> {}
 export class Viewport extends SvelteComponentTyped<any, any, any> {}
 }

 export interface CommonProps {
 class?: string;
 children?: unknown;
 }
}
