/**
 * Tooltip Component Types - Svelte 5 Native Implementation
 * Native HTML-based tooltip with full accessibility support
 */

export interface TooltipProviderProps {
	/** Delay before showing tooltip (ms) */
	delayDuration?: number;
	/** Skip delay when moving between tooltips */
	skipDelayDuration?: number;
	/** Additional CSS classes */
	class?: string;
}

export interface TooltipRootProps {
	/** Whether the tooltip is open */
	open?: boolean;
	/** Callback when open state changes */
	onOpenChange?: (open: boolean) => void;
	/** Delay before showing (ms) */
	delayDuration?: number;
	/** Additional CSS classes */
	class?: string;
}

export interface TooltipTriggerProps {
	/** Additional CSS classes */
	class?: string;
	/** Whether the trigger is disabled */
	disabled?: boolean;
}

export interface TooltipContentProps {
	/** Additional CSS classes */
	class?: string;
	/** Side of the trigger to show content */
	side?: 'top' | 'right' | 'bottom' | 'left';
	/** Alignment of content */
	align?: 'start' | 'center' | 'end';
	/** Offset from trigger */
	sideOffset?: number;
}

export interface TooltipContext {
	readonly open: boolean;
	readonly delayDuration: number;, setOpen: (open: boolean) => void;
	show: () => void;
	hide: () => void;
}
