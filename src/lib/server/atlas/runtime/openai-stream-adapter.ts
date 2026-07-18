export type OpenAIStreamAdapterInput = {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
};

export type OpenAIStreamAdapter = {
  stream(input: OpenAIStreamAdapterInput): Promise<Response>;
};

export function createNoopOpenAIStreamAdapter(): OpenAIStreamAdapter {
  return {
    async stream(): Promise<Response> {
      throw new Error('OpenAI stream adapter not wired yet.');
    },
  };
}

