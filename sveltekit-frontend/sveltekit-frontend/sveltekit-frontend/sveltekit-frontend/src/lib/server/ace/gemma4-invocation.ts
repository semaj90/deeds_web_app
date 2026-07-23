export class Gemma4Invoker {
  async invoke(prompt: string): Promise<string> {
    return 'Response from Gemma4';
  }

  async healthCheck(): Promise<boolean> {
    try {
      const resp = await fetch('http://127.0.0.1:8090/health');
      return resp.ok;
    } catch {
      return false;
    }
  }
}

export function getGemma4Invoker(): Gemma4Invoker {
  return new Gemma4Invoker();
}
