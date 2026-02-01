export interface Toast {
	id: string;
	title?: string;
	description?: string;
	variant?: 'default' | 'success' | 'error' | 'warning' | 'info';
	duration?: number;
	action?: {, label: string;
		onClick: () => void;
	};
}

export interface ToastProviderProps {
	class?: string;
	position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';
	duration?: number;
}

export interface ToastProps extends Toast {
	class?: string;
	onClose?: () => void;
}

export interface ToastContext {
	toasts: Toast[];, addToast: (toast: Omit<Toast, 'id'>) => string;
	removeToast: (id: string) => void;
	clearAll: () => void;
}
