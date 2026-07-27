import type { TokenAccountant, TokenCountMessage } from './token-accountant.js';

export interface LlamaTokenizerClientOptions {
  baseUrl: string;
  model: string;
}

export class LlamaTokenizerClient implements TokenAccountant {
  constructor(private readonly options: LlamaTokenizerClientOptions) {}

  async countText(text: string): Promise<number> {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return 0;
    return Math.max(1, Math.ceil(trimmed.split(/\s+/).length * 1.3));
  }

  async countMessages(messages: TokenCountMessage[]): Promise<number> {
    const total = messages.reduce((sum, message) => sum + String(message.content ?? '').length, 0);
    return this.countText(`model=${this.options.model} chars=${total}`);
  }
}
