import type { GeneratorProvider, GeneratorProviderRequest, GeneratorProviderResult } from './generator-provider.js';

export class LlamaServerProvider implements GeneratorProvider {
  constructor(private readonly model = 'gemma4') {}

  async generate(request: GeneratorProviderRequest): Promise<GeneratorProviderResult> {
    return {
      text: request.prompt,
      model: this.model,
    };
  }
}
