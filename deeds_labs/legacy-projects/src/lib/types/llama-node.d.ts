declare module '@llama-node/llama-cpp' {
  export class LlamaCpp {
    constructor(...args: any[]);
    load(options?: any): Promise<void>;
    createCompletion(options?: any): Promise<{ text: string }>;
  }
  export default LlamaCpp;
}
