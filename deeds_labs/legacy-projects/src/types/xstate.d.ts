// Minimal ambient declarations for xstate to avoid TS "Cannot find module" errors.
// Replace by installing the real `xstate` package to get full types.

declare module 'xstate' {
  // coarse signatures to unblock compilation
  export function createMachine<Context = any, Event = any>(
    config: any,
    options?: any,
    initialContext?: Context
  ): any;
  export function assign<TContext = any, TEvent = any>(mapper: any): any;

  export type DoneInvokeEvent<T = any> = { type: string; data: T };
  export type AnyEventObject = Record<string, any>;

  // Export anything else as needed (add more accurate types later)
  export {};
}

declare module 'xstate/actors' {
  // fromPromise helper used in your code — return type is intentionally `any`.
  export function fromPromise<T = any, C = any>(fn: (args: { input: C }) => Promise<T>): any;
}
