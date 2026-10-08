/** Phase 23 EDGE-03..05: explicit experimental browser model lifecycle.
 * Framework-neutral: no downloads, no automatic fallback, no server/service mutation.
 * TODO(EDGE-03): implement a pinned @litert-lm/core adapter separately.
 * TODO(EDGE-04): validate tokenizer/model revision and actual generated tokens.
 * TODO(EDGE-05): wire browser AbortSignal into backend cancellation/disposal.
 */
export type EdgeModelStatus = 'idle' | 'loading' | 'ready' | 'generating' | 'disposed' | 'failed';
export interface EdgeModelIdentity {
  modelId: string;
  modelRevision: string;
  tokenizerDigest: string;
  runtimeId: string;
  runtimeRevision: string;
}
export interface EdgeGenerationReceipt {
  status: 'PASS' | 'FAIL' | 'NOT_PROVEN';
  model: EdgeModelIdentity;
  output: string;
  generatedTokenCount: number;
  elapsedMs: number;
  error?: string;
}
export interface EdgeEngine {
  load(identity: EdgeModelIdentity, signal: AbortSignal): Promise<void>;
  generate(prompt: string, signal: AbortSignal): Promise<{ text: string; tokenCount: number }>;
  dispose(): Promise<void>;
}
export class EdgeModelHarness {
  private state: EdgeModelStatus = 'idle';
  private controller: AbortController | undefined;
  constructor(private readonly engine: EdgeEngine, readonly identity: EdgeModelIdentity) {
    for (const [key, value] of Object.entries(identity)) {
      if (typeof value !== 'string' || value.trim().length === 0) throw new Error('missing model identity: ' + key);
    }
  }
  get status(): EdgeModelStatus { return this.state; }
  async load(): Promise<void> {
    if (this.state !== 'idle') throw new Error('invalid load state: ' + this.state);
    this.state = 'loading';
    this.controller = new AbortController();
    try {
      await this.engine.load(this.identity, this.controller.signal);
      if (this.controller.signal.aborted) throw new Error('load cancelled');
      this.state = 'ready';
    } catch (e) {
      this.state = 'failed';
      throw e;
    } finally {
      this.controller = undefined;
    }
  }
  async generate(prompt: string): Promise<EdgeGenerationReceipt> {
    if (this.state !== 'ready') throw new Error('invalid generate state: ' + this.state);
    if (!prompt.trim()) throw new Error('empty prompt');
    this.state = 'generating';
    const controller = new AbortController();
    this.controller = controller;
    const started = performance.now();
    try {
      const result = await this.engine.generate(prompt, controller.signal);
      if (controller.signal.aborted) throw new Error('generation cancelled');
      if (!result.text.trim() || !Number.isSafeInteger(result.tokenCount) || result.tokenCount <= 0) {
        throw new Error('no verifiable generated tokens');
      }
      return { status: 'PASS', model: this.identity, output: result.text, generatedTokenCount: result.tokenCount, elapsedMs: performance.now() - started };
    } catch (e) {
      return { status: 'FAIL', model: this.identity, output: '', generatedTokenCount: 0, elapsedMs: performance.now() - started, error: String(e) };
    } finally {
      this.controller = undefined;
      if (this.state !== 'disposed') this.state = 'ready';
    }
  }
  cancel(): void { this.controller?.abort(); }
  async dispose(): Promise<void> {
    if (this.state === 'disposed') return;
    this.cancel();
    // TODO(EDGE-05): engine.dispose must wait for outstanding in-flight GPU operations.
    this.state = 'disposed';
    await this.engine.dispose();
  }
}
