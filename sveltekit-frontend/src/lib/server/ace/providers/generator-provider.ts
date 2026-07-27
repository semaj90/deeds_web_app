export interface GeneratorProviderRequest {
  prompt: string;
  systemPrompt?: string;
}

export interface GeneratorProviderResult {
  text: string;
  model?: string;
}

export interface GeneratorProvider {
  generate(request: GeneratorProviderRequest): Promise<GeneratorProviderResult>;
}
