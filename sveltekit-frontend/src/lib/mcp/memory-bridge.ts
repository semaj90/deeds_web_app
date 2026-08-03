export interface EngramMemoryBridge {
  get?: (...args: unknown[]) => Promise<unknown> | unknown;
  set?: (...args: unknown[]) => Promise<unknown> | unknown;
  delete?: (...args: unknown[]) => Promise<unknown> | unknown;
}
