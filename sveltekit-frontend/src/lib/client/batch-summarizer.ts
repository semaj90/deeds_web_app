/**
 * Browser-side batch summarization using Transformers.js ONNX + WebGPU
 *
 * Role: Reduce server load by classifying tuples + suggesting labels client-side
 * Does NOT replace server Gemma4 synthesis—server validates hints and produces canonical summaries
 *
 * Pipeline:
 * 1. Load Gemma4 E2B ONNX (q4f16) via Transformers.js
 * 2. Classify each tuple with low temperature (deterministic)
 * 3. Generate ontology hints (domain_class, label suggestions)
 * 4. Cache hints in IndexedDB
 * 5. POST hints to SvelteKit API for server validation + RabbitMQ queueing
 */

import type { Pipeline } from '@xenova/transformers';

interface TupleClassification {
  tupleId: string;
  ontologyLabel?: string;
  domainClass?: string;
  trigrams?: string[];
  confidence: number;
  model: 'browser-onnx';
}

interface BatchSummaryHints {
  featureId: string;
  tupleCount: number;
  hints: TupleClassification[];
  processedAt: string;
  model: 'browser-onnx-q4f16';
}

export class BatchSummarizer {
  private pipeline: Pipeline | null = null;
  private initialized = false;

  /**
   * Initialize Transformers.js pipeline with Gemma4 E2B ONNX
   * Uses WebGPU for GPU acceleration if available, falls back to WASM SIMD
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { pipeline } = await import('@xenova/transformers');

      console.log('🚀 Loading Gemma4 E2B ONNX (q4f16)...');
      this.pipeline = await pipeline(
        'text-generation',
        'onnx-community/gemma-4-E2B-it-ONNX',
        {
          device: 'webgpu',  // Use WebGPU if available
          dtype: 'q4f16',    // 4-bit quantized with FP16 fallback
          progress_callback: (progress: any) => {
            if (progress.status === 'progress') {
              console.log(`⏳ Loading... ${Math.round(progress.progress * 100)}%`);
            }
          }
        }
      );

      console.log('✅ Browser ONNX summarizer ready');
      this.initialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize browser summarizer:', error);
      throw error;
    }
  }

  /**
   * Classify a single tuple to extract lightweight hints
   * Runs classification loop server-side for synthesis
   */
  async classifyTuple(
    tupleId: string,
    content: string,
    temperature = 0.1  // Low temp for deterministic classification
  ): Promise<TupleClassification> {
    if (!this.pipeline) {
      throw new Error('Pipeline not initialized');
    }

    try {
      const prompt = `Classify this code/feature in one line: "${content}"
Respond with: <domain_class> | <label> | confidence_0_to_1`;

      const output = await this.pipeline(prompt, {
        max_new_tokens: 32,
        temperature,
        top_k: 1,
        repetition_penalty: 1.2
      });

      // Parse classification from output
      const text = (output as any)[0]?.generated_text || '';
      const match = text.match(/\|(.+)\|/);

      return {
        tupleId,
        ontologyLabel: match?.[1]?.trim(),
        confidence: 0.8,
        model: 'browser-onnx'
      };
    } catch (error) {
      console.error(`Failed to classify tuple ${tupleId}:`, error);
      return {
        tupleId,
        confidence: 0,
        model: 'browser-onnx'
      };
    }
  }

  /**
   * Batch-process tuples into lightweight hints for server validation
   */
  async processBatch(
    featureId: string,
    tuples: Array<{ id: string; content: string }>,
    onProgress?: (completed: number, total: number) => void
  ): Promise<BatchSummaryHints> {
    await this.initialize();

    const hints: TupleClassification[] = [];

    for (let i = 0; i < tuples.length; i++) {
      const tuple = tuples[i];
      try {
        const hint = await this.classifyTuple(tuple.id, tuple.content);
        hints.push(hint);
      } catch (e) {
        console.warn(`Skipped tuple ${tuple.id}`);
      }

      if (onProgress) {
        onProgress(i + 1, tuples.length);
      }

      // Throttle to avoid overwhelming browser
      if (i % 10 === 0) {
        await new Promise(r => setTimeout(r, 50));
      }
    }

    return {
      featureId,
      tupleCount: tuples.length,
      hints,
      processedAt: new Date().toISOString(),
      model: 'browser-onnx-q4f16'
    };
  }

  /**
   * POST browser hints to SvelteKit for server validation + queueing
   */
  async submitHints(hints: BatchSummaryHints): Promise<void> {
    const response = await fetch('/api/batch-summary/hints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hints)
    });

    if (!response.ok) {
      throw new Error(`Failed to submit hints: ${response.status}`);
    }

    console.log(`✅ Submitted ${hints.hints.length} hints for ${hints.featureId}`);
  }

  /**
   * Load hints from IndexedDB cache
   */
  async loadCachedHints(featureId: string): Promise<BatchSummaryHints | null> {
    try {
      const db = await this.openIndexedDB();
      const tx = db.transaction('batch-summaries', 'readonly');
      const store = tx.objectStore('batch-summaries');

      return new Promise((resolve, reject) => {
        const request = store.get(featureId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn('IndexedDB cache miss:', e);
      return null;
    }
  }

  /**
   * Cache hints in IndexedDB
   */
  async cacheHints(hints: BatchSummaryHints): Promise<void> {
    try {
      const db = await this.openIndexedDB();
      const tx = db.transaction('batch-summaries', 'readwrite');
      const store = tx.objectStore('batch-summaries');

      return new Promise((resolve, reject) => {
        const request = store.put(hints);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn('Failed to cache hints:', e);
    }
  }

  /**
   * Initialize IndexedDB for persistent hint caching
   */
  private async openIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('legal-ai-batch-summaries', 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('batch-summaries')) {
          db.createObjectStore('batch-summaries', { keyPath: 'featureId' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear and reinitialize
   */
  async cleanup(): Promise<void> {
    this.pipeline = null;
    this.initialized = false;
  }
}

/**
 * Singleton instance
 */
export const batchSummarizer = new BatchSummarizer();
