export class Tensor {
  constructor(public type: string, public data: any, public dims: number[]) {}
}

export class InferenceSession {
  static create = async () => ({
    run: async () => ({}),
  });
}

export const env = {
  wasm: { numThreads: 1 },
};
