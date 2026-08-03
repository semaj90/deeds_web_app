export interface LangGraphBridge {
  invoke?: (...args: unknown[]) => Promise<unknown> | unknown;
  stream?: (...args: unknown[]) => AsyncIterable<unknown> | Promise<unknown> | unknown;
}
