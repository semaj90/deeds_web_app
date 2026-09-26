import type { GeneratorProvider, GeneratorProviderRequest, GeneratorProviderResult } from './generator-provider.js';

export class LlamaServerProvider implements GeneratorProvider {
  constructor(private readonly model = 'ornith-1.5-9b') {}

  async generate(request: GeneratorProviderRequest): Promise<GeneratorProviderResult> {
    return {
      text: request.prompt,
      model: this.model,
    };
  }
}
