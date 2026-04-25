// Minimal third-party module stubs to quiet type noise during preview checks
declare module 'qdrant-client' {
  export function connect(...args: any[]): any;
  export default connect;
}

declare module 'ollama' {
  export function embed(text: string): Promise<number[]>;
  export function generate(prompt: string, options?: any): AsyncIterable<string> | Promise<string>;
}

declare module 'glyph-embeds-client' {
  export function embedText(text: string): Promise<number[]>;
  export function storeEmbedding(id: string, embedding: number[] | Float32Array): Promise<void>;
}
