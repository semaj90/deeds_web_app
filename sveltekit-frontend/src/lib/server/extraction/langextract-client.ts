/**
 * LangExtract Client - TypeScript bridge to Python Gemma4 extraction service
 * Communicates with llama-server running gemma4-legal-iq4xs-direct.gguf
 */

import type { LangExtractResult, LangExtractRequest } from './langextract-types.js';

export type LangExtractClientOptions = {
  baseUrl?: string;
  timeoutMs?: number;
  pythonScriptPath?: string;
};

export class LangExtractClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly pythonScriptPath: string;

  constructor(opts: LangExtractClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? process.env.LANGEXTRACT_URL ?? 'http://127.0.0.1:8124';
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.pythonScriptPath = opts.pythonScriptPath ?? './scripts/langextract/langextract-gemma4-bridge.py';
  }

  async extract(input: LangExtractRequest): Promise<LangExtractResult> {
    try {
      return await this.extractViaSubprocess(input);
    } catch (err) {
      console.warn('[LangExtract] Extraction failed:', (err as Error).message);
      return this.failOpenResult(input.evidenceId);
    }
  }

  private async extractViaSubprocess(input: LangExtractRequest): Promise<LangExtractResult> {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const fs = await import('fs');
    const path = await import('path');

    const execFilePromise = promisify(execFile);
    const tmpFile = path.join('/tmp', `langextract_${Date.now()}.jsonl`);

    await execFilePromise('python', [
      this.pythonScriptPath,
      '--input',
      input.text,
      '--output',
      tmpFile
    ]);

    const content = fs.readFileSync(tmpFile, 'utf-8').trim();
    if (!content) return this.failOpenResult(input.evidenceId);

    const line = content.split('\n')[0];
    const parsed = JSON.parse(line);
    return parsed.extraction as LangExtractResult;
  }

  private failOpenResult(evidenceId: string): LangExtractResult {
    return {
      entities: [],
      events: [],
      claims: [],
      crime_signals: [],
      summary: '',
      warnings: ['LangExtract unavailable; continuing with empty extraction']
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(
        'http://127.0.0.1:8090/v1/models',
        { signal: AbortSignal.timeout(5000) }
      );
      return response.ok;
    } catch {
      return false;
    }
  }
}

let client: LangExtractClient | null = null;

export function getLangExtractClient(opts?: LangExtractClientOptions): LangExtractClient {
  if (!client) {
    client = new LangExtractClient(opts);
  }
  return client;
}
