declare module 'xstate' {
  export type AnyEventObject = Record<string, any>;
  export type AnyContext = Record<string, any>;

  export function createMachine<
    TContext = AnyContext,
    TEvent extends AnyEventObject = AnyEventObject,
  >(config: any, options?: any): any;

  export function assign(...args: any[]): any;

  export function interpret(machine: any): {
    start: () => void;
    stop?: () => void;
    send: (event: any) => void;
    subscribe: (listener: (state: any) => void) => { unsubscribe?: () => void } | (() => void);
    getSnapshot?: () => any;
  };
}
