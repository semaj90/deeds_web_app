// Toast component exports
export { default as Toast } from './Toast.svelte';
export { default as ToastProvider } from './ToastProvider.svelte';

// Types
export type {
    ToastContext, ToastProps,
    ToastProviderProps, Toast as ToastType
} from './types';

// Helper for creating toast utility
export { getContext } from 'svelte';
import type { ToastContext } from './types';

export function useToast(): ToastContext {
	// This should be called from within a component that is a child of ToastProvider
	const { getContext } = require('svelte');
	return getContext<ToastContext>('toast');
}

