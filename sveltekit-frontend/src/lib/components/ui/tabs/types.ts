/**
 * Tabs Component Types - Svelte 5 Native Implementation
 * Native HTML-based tabs with full accessibility support
 */

export interface TabsRootProps {
	/** The controlled value of the active tab */
	value?: string;
	/** The default value when uncontrolled */
	defaultValue?: string;
	/** Callback when active tab changes */
	onValueChange?: (value: string) => void;
	/** Additional CSS classes */
	class?: string;
	/** Orientation of the tabs */
	orientation?: 'horizontal' | 'vertical';
}

export interface TabsListProps {
	/** Additional CSS classes */
	class?: string;
	/** Whether to loop keyboard navigation */
	loop?: boolean;
}

export interface TabsTriggerProps {
	/** The value that associates with a TabsContent */
	value: string;
	/** Whether the tab is disabled */
	disabled?: boolean;
	/** Additional CSS classes */
	class?: string;
}

export interface TabsContentProps {
	/** The value that associates with a TabsTrigger */
	value: string;
	/** Force mount even when not active (useful for animations) */
	forceMount?: boolean;
	/** Additional CSS classes */
	class?: string;
}

export interface TabsContext {
	readonly value: string; setValue: (value: string) => void;
	readonly orientation: 'horizontal' | 'vertical';
	registerTab: (value: string) => void;
	readonly tabs: string[];
}


