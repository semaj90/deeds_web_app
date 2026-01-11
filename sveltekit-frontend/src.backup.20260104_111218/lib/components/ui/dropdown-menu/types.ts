/**
 * DropdownMenu Component Types - Svelte 5 Native Implementation
 * Native HTML-based dropdown with full accessibility support
 */

export interface DropdownMenuRootProps {
	/** Whether the dropdown is open */
	open?: boolean;
	/** Callback when open state changes */
	onOpenChange?: (open: boolean) => void;
	/** Additional CSS classes */
	class?: string;
}

export interface DropdownMenuTriggerProps {
	/** Additional CSS classes */
	class?: string;
	/** Whether the trigger is disabled */
	disabled?: boolean;
	/** Whether to render as child (for custom trigger elements) */
	asChild?: boolean;
}

export interface DropdownMenuContentProps {
	/** Additional CSS classes */
	class?: string;
	/** Side of the trigger to show content */
	side?: 'top' | 'right' | 'bottom' | 'left';
	/** Alignment of content */
	align?: 'start' | 'center' | 'end';
	/** Offset from trigger */
	sideOffset?: number;
}

export interface DropdownMenuItemProps {
	/** Whether the item is disabled */
	disabled?: boolean;
	/** Additional CSS classes */
	class?: string;
	/** Whether item is destructive (red styling) */
	variant?: 'default' | 'destructive';
	/** Click handler */
	onclick?: () => void;
}

export interface DropdownMenuLabelProps {
	/** Additional CSS classes */
	class?: string;
	/** Whether this is an inset label */
	inset?: boolean;
}

export interface DropdownMenuSeparatorProps {
	/** Additional CSS classes */
	class?: string;
}

export interface DropdownMenuGroupProps {
	/** Additional CSS classes */
	class?: string;
}

export interface DropdownMenuCheckboxItemProps extends DropdownMenuItemProps {
	/** Whether the item is checked */
	checked?: boolean;
	/** Callback when checked state changes */
	onCheckedChange?: (checked: boolean) => void;
}

export interface DropdownMenuContext {
	readonly open: boolean;
	setOpen: (open: boolean) => void;
	toggle: () => void;
	close: () => void;
}
