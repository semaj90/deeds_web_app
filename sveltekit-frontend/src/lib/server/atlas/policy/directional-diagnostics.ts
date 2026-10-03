/**
 * Bounded directional diagnostics for geometry experiments.
 *
 * The caller supplies the autodiff backend's JVP/VJP primitives. This module
 * deliberately never materializes a Jacobian and makes no promotion claim.
 */
export interface DirectionalDiagnosticSample {
  inputDirection: readonly number[];
  outputCotangent: readonly number[];
}

export interface DirectionalDiagnosticBackend {
  inputDimension: number;
  outputDimension: number;
  jvp(direction: readonly number[]): readonly number[];
  vjp(cotangent: readonly number[]): readonly number[];
}

export interface DirectionalDiagnosticReceipt {
  schema: 'atlas.policy-directional-diagnostics.v1';
  inputDimension: number;
  outputDimension: number;
  sampleCount: number;
  jvpNorms: number[];
  vjpNorms: number[];
  meanJvpNorm: number;
  meanVjpNorm: number;
  maxJvpNorm: number;
  maxVjpNorm: number;
  canonicalAuthority: false;
  jacobianMaterialized: false;
}

const MAX_SAMPLES = 64;

function assertVector(vector: readonly number[], dimension: number, label: string): void {
  if (vector.length !== dimension) throw new Error(`${label} dimension mismatch.`);
  if (!vector.every(Number.isFinite)) throw new Error(`${label} contains a non-finite value.`);
}

function l2Norm(vector: readonly number[]): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Evaluate explicit JVP/VJP samples with a strict call-count bound. */
export function sampleDirectionalDiagnostics(
  backend: DirectionalDiagnosticBackend,
  samples: readonly DirectionalDiagnosticSample[]
): DirectionalDiagnosticReceipt {
  if (!Number.isSafeInteger(backend.inputDimension) || backend.inputDimension < 1) {
    throw new Error('inputDimension must be a positive safe integer.');
  }
  if (!Number.isSafeInteger(backend.outputDimension) || backend.outputDimension < 1) {
    throw new Error('outputDimension must be a positive safe integer.');
  }
  if (samples.length < 1 || samples.length > MAX_SAMPLES) {
    throw new Error(`sample count must be between 1 and ${MAX_SAMPLES}.`);
  }

  const jvpNorms: number[] = [];
  const vjpNorms: number[] = [];
  for (const [index, sample] of samples.entries()) {
    assertVector(sample.inputDirection, backend.inputDimension, `sample ${index} inputDirection`);
    assertVector(sample.outputCotangent, backend.outputDimension, `sample ${index} outputCotangent`);

    const jvp = backend.jvp(sample.inputDirection);
    const vjp = backend.vjp(sample.outputCotangent);
    assertVector(jvp, backend.outputDimension, `sample ${index} JVP result`);
    assertVector(vjp, backend.inputDimension, `sample ${index} VJP result`);
    jvpNorms.push(l2Norm(jvp));
    vjpNorms.push(l2Norm(vjp));
  }

  return {
    schema: 'atlas.policy-directional-diagnostics.v1',
    inputDimension: backend.inputDimension,
    outputDimension: backend.outputDimension,
    sampleCount: samples.length,
    jvpNorms,
    vjpNorms,
    meanJvpNorm: mean(jvpNorms),
    meanVjpNorm: mean(vjpNorms),
    maxJvpNorm: Math.max(...jvpNorms),
    maxVjpNorm: Math.max(...vjpNorms),
    canonicalAuthority: false,
    jacobianMaterialized: false
  };
}
