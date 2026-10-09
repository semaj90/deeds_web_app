/** Parent Atlas WebGPU kernel numerical oracle; browser model weights are NEVER loaded here. */
export const WGSL_ADD_V1 = `
@group(0) @binding(0) var<storage, read> lhs: array<f32>;
@group(0) @binding(1) var<storage, read> rhs: array<f32>;
@group(0) @binding(2) var<storage, read_write> output: array<f32>;
struct Params { length: u32, };
@group(0) @binding(3) var<uniform> params: Params;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.length) { return; }
  output[i] = lhs[i] + rhs[i];
}`;
export const KERNEL_ORACLE_FIXTURE_V1 = Object.freeze({
  lhs: [0, 1, -2, 3.5, 0.125, 100, -64, 1],
  rhs: [1, -1, 2, 0.5, -0.125, -100, 63, 2],
  atol: 1e-6,
});
export function cpuAddOracleV1(a: readonly number[], b: readonly number[]) {
  if (a.length !== b.length || !a.length) throw Error('INVALID_VECTOR_SHAPE');
  if (![...a, ...b].every(Number.isFinite)) throw Error('NONFINITE_INPUT');
  return Array.from(a, (x, i) => Math.fround(Math.fround(x) + Math.fround(b[i])));
}
export function verifyKernelOutputV1(expected: readonly number[], actual: readonly number[], atol: number) {
  if (expected.length !== actual.length || !Number.isFinite(atol) || atol < 0) return false;
  return expected.every((value, i) => Number.isFinite(actual[i]) && Math.abs(value - actual[i]) <= atol);
}
export function makeKernelTelemetryV1(args: {
  testId: string; backend: string; status: 'PASS'|'FAIL'|'BLOCKED';
  durationMs: number | null; maxAbsError: number | null; reason?: string;
}) {
  if (!args.testId || !args.backend || (args.durationMs !== null && (!Number.isFinite(args.durationMs) || args.durationMs < 0)))
    throw Error('INVALID_TELEMETRY');
  return Object.freeze({schema:'atlas.wgsl.kernel.telemetry.v1', timestamp:new Date().toISOString(),
    ...args, modelLoaded:false, weightsDownloaded:false, admission:'FIXTURE_ONLY'});
}
