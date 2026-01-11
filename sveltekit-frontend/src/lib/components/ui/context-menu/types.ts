
export interface ContextMenuRootProps {
	class?: string;
}

export interface ContextMenuTriggerProps {
	class?: string;
}

export interface ContextMenuContentProps {
	class?: string;
}

export interface ContextMenuItemProps {
	value?: string;
	disabled?: boolean;
	onSelect?: () => void;
	class?: string;
}

export interface ContextMenuSeparatorProps {
	class?: string;
}

export interface ContextMenuContext {
	get open(): boolean;
	get position(): { x: number; y: number };
	setOpen: (value: boolean) => void;
	setPosition: (x: number, y: number) => void;
	close: () => void;
}


