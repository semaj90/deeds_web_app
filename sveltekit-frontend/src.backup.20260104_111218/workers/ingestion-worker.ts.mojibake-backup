export interface UploadResult {
  success: boolean;
  fileId: string;
  fileName: string;
  url: string;
  metadata?: Record<string, unknown>;
}

export interface WorkerResponse {
  taskId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export class EmbeddingService {
  async generate(texts: string[], dimension = 384) {
    return texts.map((text) => ({
      text,
      embedding: this.generateVector(text, dimension),
    }));
  }

  private generateVector(text: string, dimension: number): number[] {
    return new Array(dimension).fill(0).map((_, index) => Math.sin((text.length + index) * 0.01));
  }
}

export const embeddingService = new EmbeddingService();
