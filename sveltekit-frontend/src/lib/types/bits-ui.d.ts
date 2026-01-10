import type { SvelteComponentTyped } from 'svelte';
declare module 'bits-ui' {
 // ...existing code...
 export interface ButtonProps {
 variant?: string;
 size?: string;
 disabled?: boolean;
 class?: string;
 // Use Event instead of: unknown for onClick parameter
 onClick?: (e?: Event) => void;
 // Allow arbitrary props but avoid `any`
 [key: string]: any;
 }
 export class Button extends SvelteComponentTyped<ButtonProps> {}
 export interface CardProps {
 class?: string;
 // Avoid `any` for index signature
 [key: string]: any;
 }
 export class Card extends SvelteComponentTyped<CardProps> {}
 export class CardHeader extends SvelteComponentTyped<{ class?: string }> {}
 export class CardContent extends SvelteComponentTyped<{ class?: string }> {}
 export class Modal extends SvelteComponentTyped<{
 open?: boolean;
 onClose?: () => void;
 class?: string;
 }> {}
 export class Tooltip extends SvelteComponentTyped<{ content?: string; placement?: string }> {}
 export class Icon extends SvelteComponentTyped<{ name?: string; size?: number | string }> {}
 // Fallback for: unknown other named exports — prefer: unknown over: unknown
 export const __any: unknown;
 // ...existing code...
}
declare module '$lib/components/ui/*' {
 // Provide both named and default exports so imports like:
 // import type { Card: CardContent } from '$lib/components/ui/card.svelte';
 // and
 // import Card from '$lib/components/ui/card.svelte';
 // both type-check.
 import type { SvelteComponentTyped } from 'svelte';
 // Replace: unknown with safer Record<string, unknown>
 type AnyProps = Record<string, unknown> | undefined;
 const defaultExport: typeof SvelteComponentTyped;
 export default defaultExport;
 export const Card: typeof SvelteComponentTyped;
 export const CardHeader: typeof SvelteComponentTyped;
 export const CardContent: typeof SvelteComponentTyped;
 export const Button: typeof SvelteComponentTyped;
 export const Modal: typeof SvelteComponentTyped;
 export const Tooltip: typeof SvelteComponentTyped;
 export const Icon: typeof SvelteComponentTyped;
}
