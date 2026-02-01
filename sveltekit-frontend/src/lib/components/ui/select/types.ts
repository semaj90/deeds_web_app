/**
 * Select Component Types - Svelte 5 Native Implementation
 * Native HTML-based select with full accessibility support
 */

export interface SelectOption {
	value: string;
	label: string;
	disabled?: boolean;
}

export interface SelectRootProps {
	/** The controlled value of the select */
	value?: string;
	/** The default value when uncontrolled */
	defaultValue?: string;
	/** Callback when value changes */
	onValueChange?: (value: string) => void;
	/** Whether the select is disabled */
	disabled?: boolean;
	/** Whether the select is required */
	required?: boolean;
	/** Name for form submission */
	name?: string;
	/** Additional CSS classes */
	class?: string;
	/** Placeholder text */
	placeholder?: string;
}

export interface SelectTriggerProps {
	/** Additional CSS classes */
	class?: string;
	/** Whether the trigger is disabled */
	disabled?: boolean;
}

export interface SelectContentProps {
	/** Additional CSS classes */
	class?: string;
	/** Position of the content */
	position?: 'popper' | 'item-aligned';
	/** Side of the trigger to show content */
	side?: 'top' | 'bottom';
	/** Alignment of content */
	align?: 'start' | 'center' | 'end';
}

export interface SelectItemProps {
	/** The value of the item */
	value: string;
	/** Whether the item is disabled */
	disabled?: boolean;
	/** Additional CSS classes */
	class?: string;
}

export interface SelectGroupProps {
	/** Additional CSS classes */
	class?: string;
}

export interface SelectLabelProps {
	/** Additional CSS classes */
	class?: string;
}

export interface SelectSeparatorProps {
	/** Additional CSS classes */
	class?: string;
}

export interface SelectValueProps {
	/** Placeholder when no value selected */
	placeholder?: string;
	/** Additional CSS classes */
	class?: string;
}

export interface SelectContext {
	readonly open: boolean;
	readonly value: string;
	readonly disabled: boolean;
	setValue: (value: string) => void;
	setOpen: (open: boolean) => void;
	toggle: () => void;
	close: () => void;
}






