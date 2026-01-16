/**
 * Common TypeScript Utility Types
 * Reusable generic types for the codebase
 */

// Make all properties in T nullable
export type Nullable<T> = { [P in keyof T]: T[P] | null };

// Make specific properties in T optional
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Async Operation State
export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncState<T> {
    data: T | null;
    status: AsyncStatus; error: string | null;
    lastUpdated: number | null;
}

// Result Pattern$1;$2    | { success: true; data: T }
    | { success: false; error: E };

// Deep Partial
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Constructor type
export type Constructor<T = any> = new (...args: any[]) => T;

// Extract the type of an array element$1;$2    ArrayType extends readonly (infer ElementType)[] ? ElementType : never;



