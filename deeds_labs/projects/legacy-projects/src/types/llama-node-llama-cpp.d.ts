declare module '@llama-node/llama-cpp' {
  export class LlamaCpp {
    constructor(...args: any[]);
    load(opts?: any): Promise<void>;
    createCompletion(opts?: any): Promise<{ text: string }>;
  }
  export default LlamaCpp;
}

declare module 'llama-cpp-wasm' {
  export class LlamaCpp {
    constructor(...args: any[]);
    load(opts?: any): Promise<void>;
    createCompletion(opts?: any): Promise<{ text: string }>;
  }
  export default LlamaCpp;
}
