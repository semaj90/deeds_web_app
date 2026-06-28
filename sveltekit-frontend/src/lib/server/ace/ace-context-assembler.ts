import { assembleACEContext } from '../features/ai/ace/context-assembler.js';

export type AssemblyOptions = Parameters<typeof assembleACEContext>[0];
export type AssembledContext = Awaited<ReturnType<typeof assembleACEContext>>;

export class AceContextAssembler {
  constructor(private readonly defaults: Partial<AssemblyOptions> = {}) {}

  async assemble(options: AssemblyOptions): Promise<AssembledContext> {
    return assembleACEContext({ ...this.defaults, ...options });
  }
}

export function createAceContextAssembler(defaults: Partial<AssemblyOptions> = {}): AceContextAssembler {
  return new AceContextAssembler(defaults);
}
