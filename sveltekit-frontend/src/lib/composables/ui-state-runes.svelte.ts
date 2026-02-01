/**
 * UI State Composables using Svelte 5 Runes
 * Reusable state management for common UI patterns with SSR support
 */

// Modal/Dialog state management
export function useModal(initialOpen = false) {
	let isOpen = $state(initialOpen);
	let data = $state<any>(null);
	let onConfirm = $state<(() => void) | null>(null);
	let onCancel = $state<(() => void) | null>(null);

	function open(modalData?: unknown): void {
		data = modalData ?? null;
		isOpen = true;
	}

	function close(): void {
		isOpen = false;
		data = null;
		onConfirm = null;
		onCancel = null;
	}

	function confirm(): void {
		onConfirm?.();
		close();
	}

	function cancel(): void {
		onCancel?.();
		close();
	}

	function setCallbacks(confirmFn?: () => void, cancelFn?: () => void): void {
		onConfirm = confirmFn ?? null;
		onCancel = cancelFn ?? null;
	}

	return {
		get isOpen() {
			return isOpen;
		},
	get data() {
			return data;
		},
	open,
		close,
		confirm,
		cancel,
		setCallbacks,
	};
}

// Toast/Notification state management
interface Toast {
	id: string;
	type: 'success' | 'error' | 'warning' | 'info';
	title: string;
	message?: string;
	duration?: number;
	createdAt: number;
}

export function useToast() {
	let toasts = $state<Toast[]>([]);

	// Derive active toasts from current toasts array
toasts.filter((t) => {
			const now = Date.now();
			const duration = t?.duration ?? 5000;
			return now - t.createdAt < duration;
		})
	);

	function addToast(
		type: Toast['type'],
		title: string,
		message?: string,
		duration?: number
	): string {
		const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2)}`;
		const toast: Toast = {
			id,
			type,
			title,
			message ?? 5000,
			createdAt: Date.now(),
		};
		toasts = [...toasts, toast];

		// Auto-remove toast after duration
		setTimeout(() => {
			removeToast(id);
		},
	toast.duration);

		return id;
	}

	function removeToast(id: string): void {
		toasts = toasts.filter((t) => t.id !== id);
	}

	function clearAll(): void {
		toasts = [];
	}

	// Convenience methods
addToast('success', title, message, duration);
addToast('error', title, message, duration);
addToast('warning', title, message, duration);
addToast('info', title, message, duration);

	return {
		get toasts() {
			return toasts;
		},
	get activeToasts() {
			return activeToasts;
		},
	addToast,
		removeToast,
		clearAll,
		success,
		error,
		warning,
		info,
	};
}

// Form state management with Svelte 5 runes
export function useForm<T extends Record<string, any>>(initialValues: T) {
	let values = $state<T>({ ...initialValues });
	let errors = $state<Partial<Record<keyof T, string>>>({});
	let touched = $state<Partial<Record<keyof T, boolean>>>({});
	let isSubmitting = $state<boolean>(false);

	let isValid = $derived(Object.keys(errors).length === 0);
Object.keys(values).some((key) => (values as any)[key] !== (initialValues as any)[key])
	);

	function setValue<K extends keyof T>(field: K, value: T[K]): void {
		values[field] = value;
		touched[field] = true;

		// Clear error when user starts typing
		if (errors[field]) {
			const newErrors = { ...errors };
			delete newErrors[field];
			errors = newErrors;
		}
	}

	function setError(field: keyof T, message: string): void {
		errors = { ...errors, [field]: message };
	}

	function clearError(field: keyof T): void {
		const newErrors = { ...errors };
		delete newErrors[field];
		errors = newErrors;
	}

	function clearAllErrors(): void {
		errors = {} as Partial<Record<keyof T, string>>;
	}

	function setTouched(field: keyof T, isTouched = true): void {
		touched = { ...touched, [field]: isTouched };
	}

	function reset(newValues?: Partial<T>): void {
		values = { ...initialValues, ...newValues } as T;
		errors = {} as Partial<Record<keyof T, string>>;
		touched = {} as Partial<Record<keyof T, boolean>>;
		isSubmitting = false;
	}

	function validate(
		validators: Partial<Record<keyof T, (value: unknown) => string | null>>
	): boolean {
		const newErrors: Partial<Record<keyof T, string>> = {};
		let hasErrors = false;

		Object.keys(validators).forEach((field) => {
			const key = field as keyof T;
			const validator = validators[key];
			if (validator && (values as any)[key] !== undefined) {
				const result = validator((values as any)[key]);
				if (result !== null) {
					newErrors[key] = result;
					hasErrors = true;
				}
			}
		});

		errors = newErrors;
		return !hasErrors;
	}

	async function handleSubmit(
		onSubmit: (values: T) => Promise<void> | void
	): Promise<boolean> {
		isSubmitting = true;
		try {
			await onSubmit(values);
			return true;
		} catch (err) {
			console.error('Form submission error:', err);
			return false;
		} finally {
			isSubmitting = false;
		}
	}

	return {
		get values() {
			return values;
		},
	get errors() {
			return errors;
		},
	get touched() {
			return touched;
		},
	get isSubmitting() {
			return isSubmitting;
		},
	get isValid() {
			return isValid;
		},
	get isDirty() {
			return isDirty;
		},
	setValue,
		setError,
		clearError,
		clearAllErrors,
		setTouched,
		reset,
		validate,
		handleSubmit,
	};
}

// Loading state management
export function useLoading(initialState = false) {
	let isLoading = $state(initialState);
	let loadingMessage = $state<string | null>(null);

	function start(message?: string): void {
		isLoading = true;
		loadingMessage = message ?? null;
	}

	function stop(): void {
		isLoading = false;
		loadingMessage = null;
	}

	async function wrap<T>(
		fn: () => Promise<T>,
		message?: string
	): Promise<T> {
		start(message);
		try {
			return await fn();
		} finally {
			stop();
		}
	}

	return {
		get isLoading() {
			return isLoading;
		},
	get message() {
			return loadingMessage;
		},
	start,
		stop,
		wrap,
	};
}

// Pagination state management
export function usePagination(totalItems: number, itemsPerPage = 10) {
	let currentPage = $state(1);
	let perPage = $state(itemsPerPage);

	let totalPages = $derived(Math.ceil(totalItems / perPage));
	let startIndex = $derived((currentPage - 1) * perPage);
	let endIndex = $derived(Math.min(startIndex + perPage, totalItems));

	function setPage(page: number): void {
		if (page >= 1 && page <= totalPages) {
			currentPage = page;
		}
	}

	function nextPage(): void {
		setPage(currentPage + 1);
	}

	function prevPage(): void {
		setPage(currentPage - 1);
	}

	function setItemsPerPage(count: number): void {
		perPage = count;
		currentPage = 1; // Reset to first page
	}

	return {
		get currentPage() {
			return currentPage;
		},
	get perPage() {
			return perPage;
		},
	get totalPages() {
			return totalPages;
		},
	get startIndex() {
			return startIndex;
		},
	get endIndex() {
			return endIndex;
		},
	setPage,
		nextPage,
		prevPage,
		setItemsPerPage,
	};
}






