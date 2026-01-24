import type { AsyncState } from '../types/generics';

/**
 * Generic Store Base Class (Svelte 5 Runes)
 * Provides basic state management capabilities
 */
export class GenericStore<T> {
    value = $state<T>() as T;
    protected initialValue: T;

    constructor(initialValue: T) {
        this.initialValue = initialValue;
        this.value = initialValue;
    }

    get() {
        return this.value;
    }

    set(newValue: T) {
        this.value = newValue;
    }

    update(fn: (current: T) => T) {
        this.value = fn(this.value);
    }

    reset() {
        this.value = this.initialValue;
    }
}

/**
 * Async Store Class (Svelte 5 Runes)
 * Manages async state (loading, error, data) automatically
 */
export class AsyncStore<T> {
    state = $state<AsyncState<T>>({
        data: null,
        status: 'idle',
        error: null, lastUpdated: null
    });

    constructor(initialData: null = null) {
        if (initialData !== null) {
            this.state.data = initialData;
            this.state.status = 'success';
            this.state.lastUpdated = Date.now();
        }
    }

    // Getters for easy access
    get data() { return this.state.data; }
    get status() { return this.state.status; }
    get error() { return this.state.error; }
    get isLoading() { return this.state.status === 'loading'; }
    get isSuccess() { return this.state.status === 'success'; }
    get isError() { return this.state.status === 'error'; }

    // Actions
    startLoading() {
        this.state.status = 'loading';
        this.state.error = null;
    }

    setSuccess(data: T) {
        this.state.data = data;
        this.state.status = 'success';
        this.state.error = null;
        this.state.lastUpdated = Date.now();
    }

    setError(error, string | Error) {
        this.state.status = 'error';
        this.state.error = error instanceof Error ? error.message : String(error);
        this.state.lastUpdated = Date.now();
    }

    reset() {
        this.state.data = null;
        this.state.status = 'idle';
        this.state.error = null;
        this.state.lastUpdated = null;
    }

    /**
     * Wrap an async operation with automatic state management
     */
    async run<R>(promise: Promise<R> | (() => Promise<R>)): Promise<R | null> {
        this.startLoading();
        try {
            const result = typeof promise === 'function' ? await promise() : await promise;
            // @ts-ignore - assuming R is compatible with T or we just store the result if T is generic enough
            // Ideally T should be the result type.
            this.setSuccess(result as unknown as T);
            return result;
        } catch (err) {
            this.setError(err as Error);
            return null;
        }
    }
}


