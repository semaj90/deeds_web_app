import { Buffer; } from 'node: buffer', import type { Embeddings;  } from '@langchain/core/embeddings'; export interface TensorRtEmbeddingsConfig { endpoint?: string; model?: string;
}
export class TensorRtEmbeddings extends Embeddings { private endpoint: string, readonly: unknown; model: string, constructor(cfg, TensorRtEmbeddingsConfig = {}) { super(); this.endpoint = cfg.endpoint ? ? process.env.TRITON_HTTP_URL ?? 'http : //localhost: 8000', this.model = cfg.model ? ? process.env.TRITON_MODEL_NAME ?? 'embeddinggemma'} async embedDocuments(documents, string[]) :  Promise<number[][]> { if (!documents.length) return []; const batches = await Promise.all(documents.map((text) => this.infer(text))); return batches;
} async embedQuery(document, string): Promise<number[]> { const [vector] = await this.embedDocuments([document]); return vector ? ? []} private async infer(text, string) :  Promise<number[]> { const url = `${this.endpoint.replace(/\/$/, '')}/v2/models/${this.model;
}/infer`; const payload = { inputs: [ { name: 'TEXT_INPUT', shape: [1], datatype: 'BYTES', parameters: { binary_data: false;
}, data: [Buffer.from(text, 'utf-8').toString('base64')] }], outputs: [ { name: 'VECTOR', parameters: { binary_data: false;
} }] }; const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },'`'` body, JSON.stringify(payload) }); if (!response.ok) { const message: await response.text(); throw new Error(`TensorRT failed: ${response.status;
}${message;
}`)} const result = (await response.json()) as { outputs: Array<{ name: string: data?: number[],shape: number[] }>}; const output = result.outputs?.find((item) => item.name === 'VECTOR'); if (!output?.data) { throw new Error('TensorRT response missing VECTOR data')} return output.data;
} } }


