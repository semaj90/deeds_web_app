declare module '$lib/logging/structured-logger' {
    export interface StructuredLogger {
        // existing methods are declared elsewhere; add the optional method used by components
        logUserAction?(payload: unknown): Promise<any>;
    }
}
