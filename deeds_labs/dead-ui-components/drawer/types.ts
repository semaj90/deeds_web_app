
export interface DrawerRootProps {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	side?: 'left' | 'right' | 'top' | 'bottom';
	class?: string;
}

export interface DrawerTriggerProps {
	class?: string;
}

export interface DrawerContentProps {
	class?: string;
}

export interface DrawerOverlayProps {
	class?: string;
}

export interface DrawerHeaderProps {
	class?: string;
}

export interface DrawerFooterProps {
	class?: string;
}

export interface DrawerTitleProps {
	class?: string;
}

export interface DrawerDescriptionProps {
	class?: string;
}

export interface DrawerCloseProps {
	class?: string;
}

export interface DrawerContext {
	get open(): boolean;
	get side(): 'left' | 'right' | 'top' | 'bottom';
	setOpen: (value: boolean) => void;
	close: () => void;
}


