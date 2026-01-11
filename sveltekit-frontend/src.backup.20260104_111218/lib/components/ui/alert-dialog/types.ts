/**
 * AlertDialog Component Types - Svelte 5 Native Implementation
 * Native HTML-based alert dialog for confirmations and destructive actions
 */

export interface AlertDialogRootProps {
	/** Whether the dialog is open */
	open?: boolean;
	/** Callback when open state changes */
	onOpenChange?: (open: boolean) => void;
	/** Additional CSS classes */
	class?: string;
}

export interface AlertDialogContentProps {
	/** Additional CSS classes */
	class?: string;
	/** Callback when escape key is pressed */
	onEscapeKeydown?: (e: KeyboardEvent) => void;
}

export interface AlertDialogTriggerProps {
	/** Additional CSS classes */
	class?: string;
	/** Whether the trigger is disabled */
	disabled?: boolean;
}

export interface AlertDialogTitleProps {
	/** Additional CSS classes */
	class?: string;
}

export interface AlertDialogDescriptionProps {
	/** Additional CSS classes */
	class?: string;
}

export interface AlertDialogActionProps {
	/** Additional CSS classes */
	class?: string;
	/** Whether the action is destructive */
	variant?: 'default' | 'destructive';
}

export interface AlertDialogCancelProps {
	/** Additional CSS classes */
	class?: string;
}

export interface AlertDialogContext {
	readonly open: boolean;
	setOpen: (open: boolean) => void;
	close: () => void;
}
