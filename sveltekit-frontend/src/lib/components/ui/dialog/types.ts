import type { Snippet } from 'svelte';

/**
 * Dialog component prop types for Svelte 5
 * Compatible with bits-ui Dialog API
 */

export interface DialogRootProps {
	/** Whether the dialog is open */
	open?: boolean;
	/** Callback when open state changes */
	onOpenChange?: (open: boolean) => void;
	/** Children content */
	children?: Snippet;
	/** Additional CSS classes */
	class?: string;
}

export interface DialogPortalProps {
	/** Children content */
	children?: Snippet;
	/** Target element to portal into */
	to?: HTMLElement | string;
	/** Whether portal is disabled */
	disabled?: boolean;
}

export interface DialogOverlayProps {
	/** Children content */
	children?: Snippet;
	/** Additional CSS classes */
	class?: string;
	/** Whether to force mount */
	forceMount?: boolean;
}

export interface DialogContentProps {
	/** Children content */
	children?: Snippet;
	/** Additional CSS classes */
	class?: string;
	/** Whether to force mount */
	forceMount?: boolean;
	/** Callback when escape key is pressed */
	onEscapeKeydown?: (event: KeyboardEvent) => void;
	/** Callback when clicking outside */
	onInteractOutside?: (event: Event) => void;
	/** Whether to trap focus */
	trapFocus?: boolean;
	/** Whether to prevent scroll */
	preventScroll?: boolean;
}

export interface DialogTitleProps {
	/** Children content */
	children?: Snippet;
	/** Additional CSS classes */
	class?: string;
	/** Heading level */
	level?: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface DialogDescriptionProps {
	/** Children content */
	children?: Snippet;
	/** Additional CSS classes */
	class?: string;
}

export interface DialogCloseProps {
	/** Children content */
	children?: Snippet;
	/** Additional CSS classes */
	class?: string;
	/** Aria label */
	'aria-label'?: string;
}

export interface DialogTriggerProps {
	/** Children content */
	children?: Snippet;
	/** Additional CSS classes */
	class?: string;
	/** Whether the trigger is disabled */
	disabled?: boolean;
}

export interface DialogHeaderProps {
	/** Children content */
	children?: Snippet;
	/** Additional CSS classes */
	class?: string;
}

export interface DialogFooterProps {
	/** Children content */
	children?: Snippet;
	/** Additional CSS classes */
	class?: string;
}

// Re-export for convenience
export type {
    DialogCloseProps as CloseProps,
    DialogContentProps as ContentProps,
    DialogDescriptionProps as DescriptionProps,
    DialogFooterProps as FooterProps,
    DialogHeaderProps as HeaderProps,
    DialogOverlayProps as OverlayProps,
    DialogPortalProps as PortalProps,
    DialogRootProps as RootProps,
    DialogTitleProps as TitleProps,
    DialogTriggerProps as TriggerProps
};



