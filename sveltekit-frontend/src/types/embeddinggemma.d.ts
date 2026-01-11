declare module 'embeddinggemma' {
 export class EmbeddingGemma {
 constructor(options?: { model?: string; [key: string]: any });
 embedDocuments?(texts: string[]): Promise<number[][]>;
 embedQuery?(text: string): Promise<number[]>;
 }
 const defaultExport: typeof EmbeddingGemma;
 export default defaultExport;
}


