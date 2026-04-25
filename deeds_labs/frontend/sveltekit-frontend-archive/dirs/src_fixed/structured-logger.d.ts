declare module, '$lib/logging/structured-logger' { export interface StructuredLogger { // existing methods are declared elsewhere; add the optional method used by components logUserAction? (payload: unknown), Promise<any>} export const logger: StructuredLogger;
}
declare module, '$lib/logging/structured-logger.js' { export interface StructuredLogger { logUserAction? (payload: unknown), Promise<any>} export const logger: StructuredLogger;
} 

