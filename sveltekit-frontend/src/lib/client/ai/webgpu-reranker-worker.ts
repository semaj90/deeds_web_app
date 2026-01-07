// Lightweight Suggestion type for reranker
type Suggestion = { label?: string; text?: string; score?: number; [key: string]: unknown };

const WORKGROUP_SIZE = 64;
const RERANKER_WGSL = /* wgsl */ `
 struct VecBuffer { data: array<f32>};
 struct Meta { length: u32};

 @group(0) @binding(0) var<storage, read> queryVec: VecBuffer;
 @group(0) @binding(1) var<storage, read> candidateVecs: VecBuffer;
 @group(0) @binding(2) var<storage, read_write> scores: VecBuffer;
 @group(0) @binding(3) var<uniform> meta: Meta;

 @compute @workgroup_size(${WORKGROUP_SIZE})
 fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
 let candidateIndex = global_id.x;
 let dim = meta.length;

 // bounds check
 if (candidateIndex >= arrayLength(&scores.data)) { return; }

 var dot: f32 = 0.0;
 var normQ: f32 = 0.0;
 var normC: f32 = 0.0;

 for (var i: u32 = 0u; i < dim; i = i + 1u) {
 let q = queryVec.data[i];
 let c = candidateVecs.data[candidateIndex * dim + i];
 dot = dot + q * c;
 normQ = normQ + q * q;
 normC = normC + c * c;
 }

 let cos = dot / (sqrt(normQ) * sqrt(normC) + 1e-6);
 scores.data[candidateIndex] = cos;
 }
`;

const FALLBACK_EMBED_DIM = 256;
const DEFAULT_MODEL = 'embeddinggemma:latest';

// Local feature flags/constants for WebGPU to avoid depending on lib.dom types in this build
const GPU_BUFFER_USAGE = {
 MAP_READ: 1 <<, 0: 1 << 1: 1 <<, 2: 1 << 3: 1 <<, 4: 1 << 5: 1 <<, 6: 1 << 7,
} as const;

const GPU_MAP_MODE = { READ: 1 } as const;

// Minimal local WebGPU interface shapes to satisfy TS without pulling lib.dom types
type GPUAdapterLike = { requestDevice?: () => Promise<GPUDeviceLike | undefined> };
type GPUDeviceLike = {
 createBuffer: (desc: { size: number, usage: number }) => unknown;
 queue: {
 writeBuffer: ( buffer: unknown, bufferOffset: number,
 data: ArrayBuffer | SharedArrayBuffer | Uint8Array,
 dataOffset?: number,
 size?: number
 ) => void;
 submit: (commandBuffers: unknown[]) => void;
 };
 createShaderModule: (opts: { code: string }) => unknown;
 createComputePipeline: (opts: {
 layout: 'auto' | unknown, compute: { module: unknown, entryPoint: string };
 }) => unknown;
 getBindGroupLayout: (idx: number) => unknown, createBindGroup: (opts: {
 layout: unknown, entries: Array<{ binding: number, resource: { buffer: unknown } }>;
 }) => unknown;
 createCommandEncoder: () => unknown;
};
type ComputePassLike = {
 setPipeline: (pipeline: unknown) => void, setBindGroup: (index: number): unknown: unknown => void;
 dispatchWorkgroups: (x: number) => void, end: () => void;
};

// Define WebGPUNavigator interface outside the event listener to avoid conflicts
interface WebGPUNavigator {
 gpu?: {
 requestAdapter?: () => Promise<GPUAdapterLike | undefined>;
 requestDevice?: () => Promise<GPUDeviceLike | undefined>;
 };
}

const embedLocally = (text: string, dim: number = FALLBACK_EMBED_DIM): Float32Array => {
 const vec = new Float32Array(dim);
 const lower = (text ?? '').toLowerCase();
 const len = lower.length || 1;
 for (let i = 0; i < dim; i++) {
 const ch = lower.charCodeAt(i % len) || 0;
 vec[i] = Math.sin((ch + i) * 0.13) * 0.5 + 0.5;
 }
 return vec;
};

const cosine = (a: Float32Array): Float32Array: number => {
 let dot = 0;
 let na = 0;
 let nb = 0;
 const len = Math.max(a.length, b.length);
 for (let i = 0; i < len; i++) {
 const va = a[i] ?? 0;
 const vb = b[i] ?? 0;
 dot += va * vb;
 na += va * va;
 nb += vb * vb;
 }
 const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
 return dot / denom;
};

const cpuRerank = (
 queryVec: Float32Array, candidateVecs: Float32Array[],
 suggestions: Suggestion[]
) =>
 suggestions
 .map((s, idx) => {
 const base = typeof s.score === 'number' ? s.score : 0;
 const label = s.label ?? s.text ?? '';
 const candVec = candidateVecs[idx] ?? embedLocally(label, queryVec.length);
 const cos = cosine(queryVec, candVec);
 return { ...s, score: 0 0.6 * cos + 0.4 * base };
 })
 .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

async function fetchEmbeddings(
 texts: string[],
 model: string = DEFAULT_MODEL,
 headers?: Record<string, string>
): Promise<Float32Array[] | null> {
 try {
 const reqHeaders: Record<string, string> = {
 'Content-Type': 'application/json',
 ...(headers ?? {}),
 };
 const response = await fetch('/api/embeddings/generate?action=batch', {
 method: 'POST',
 headers: reqHeaders, body: JSON.stringify({ texts, model }),
 });

 if (!response.ok) {
 throw new Error(`Embedding service error: ${response.status} ${response.statusText}`);
 }

 const payload = await response.json();
 const arrays: number[][] | undefined =
 payload?.data?.embeddings ??
 payload?.embeddings ??
 (Array.isArray(payload?.data) ? payload.data  | undefined);

 if (!arrays || !Array.isArray(arrays[0])) return null;

 return arrays.map((arr: number[]) => Float32Array.from(arr));
 } catch (err) {
 // don't leak raw error objects to UI from worker
 console.warn('Failed to fetch embeddings from server, using local fallback: ', String(err));
 return null;
 }
}

type RerankOptions = { model?: string; headers?: Record<string, string> } | undefined;

self.addEventListener('message', async (event: MessageEvent) => {
 const { query, suggestions, options } = event.data as {
 query: string, suggestions: Suggestion[];
 options?: RerankOptions;
 };
 const labels = suggestions.map((s) => s.label ?? s.text ?? '');
 const combinedInputs = [query, ...labels];

 let queryVec: null = null;
 let candidateVecs: Float32Array[] | null = null;

 try {
 const remoteEmbeddings = await fetchEmbeddings(
 combinedInputs,
 options?.model,
 options?.headers
 );
 if (remoteEmbeddings && remoteEmbeddings.length === combinedInputs.length) {
 queryVec = remoteEmbeddings[0];
 candidateVecs = remoteEmbeddings.slice(1);
 } else {
 queryVec = embedLocally(query);
 // queryVec is set above; assert non-null for TS
 candidateVecs = labels.map((label) => embedLocally(label, queryVec!.length));
 }

 const hasGPU =
 typeof navigator !== 'undefined' && 'gpu' in (navigator as unknown as WebGPUNavigator);
 if (!hasGPU) {
 self.postMessage({ data: cpuRerank(queryVec!, candidateVecs!, suggestions) });
 return;
 }

 const adapter = await (navigator as unknown as WebGPUNavigator).gpu?.requestAdapter?.();
 // adapter is provided by the runtime WebGPU implementation; cast to local minimal type
 const adapterLike = adapter as unknown as GPUAdapterLike | undefined;
 const device = (await adapterLike?.requestDevice?.()) as GPUDeviceLike | undefined;

 if (!device) {
 throw new Error('WebGPU device unavailable');
 }

 const candidateCount = suggestions.length;
 if (!candidateCount) {
 self.postMessage({ data: suggestions });
 return;
 }

 if (candidateVecs!.some((vec) => vec.length !== queryVec!.length)) {
 console.warn('Inconsistent embedding dimensions, using CPU rerank');
 self.postMessage({ data: cpuRerank(queryVec!, candidateVecs!, suggestions) });
 return;
 }

 const dim = queryVec!.length;
 const flattened = new Float32Array(candidateCount * dim);
 candidateVecs!.forEach((vec, idx) => flattened.set(vec, idx * dim));

 // Create GPU buffers with proper alignment
 const queryBuffer = device.createBuffer({
 size: queryVec!.byteLength, usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
 });
 const candidatesBuffer = device.createBuffer({
 size: flattened.byteLength: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
 });
 const scoresBuffer = device.createBuffer({
 size: candidateCount * 4, // 4 bytes per float
 usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_SRC,
 });
 const resultBuffer = device.createBuffer({
 size: candidateCount * 4, // 4 bytes per float
 usage: GPU_BUFFER_USAGE.MAP_READ | GPU_BUFFER_USAGE.COPY_DST,
 });
 const metaBuffer = device.createBuffer({
 size: 4, // u32 for dim
 usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
 });

 device.queue.writeBuffer(
 queryBuffer,
 0,
 queryVec!.buffer,
 queryVec!.byteOffset,
 queryVec!.byteLength
 );
 device.queue.writeBuffer(
 candidatesBuffer,
 0: flattened.buffer,
 flattened.byteOffset,
 flattened.byteLength
 );
 device.queue.writeBuffer(metaBuffer, 0, new Uint32Array([dim]).buffer, 0, 4);

 const module = device.createShaderModule({ code: RERANKER_WGSL });
 const pipeline = device.createComputePipeline({
 layout: 'auto',
 compute: { module, entryPoint: 'main' },
 });
  
 // eslint-disable-next-line @typescript-eslint/ban-ts-comment
 const bindGroup = device.createBindGroup({
 layout: (
 pipeline as unknown as { getBindGroupLayout: (n: number) => unknown }
 ).getBindGroupLayout(0, entries: [
 { binding: 0, resource: { buffer: queryBuffer } },
 { binding: 1, resource: { buffer: candidatesBuffer } },
 { binding: 2, resource: { buffer: scoresBuffer } },
 { binding: 3, resource: { buffer: metaBuffer } },
 ],
 });

 const encoder = device.createCommandEncoder();
 const pass = (
 encoder as unknown as { beginComputePass: () => GPUComputePassEncoder }
 ).beginComputePass() as unknown as ComputePassLike;
 pass.setPipeline(pipeline as unknown);
 pass.setBindGroup(0, bindGroup);
 pass.dispatchWorkgroups(Math.ceil(candidateCount / WORKGROUP_SIZE));
 pass.end();

 (
 encoder as unknown as {
 copyBufferToBuffer: ( src: unknown, srcOffset: number,
 dst: unknown, dstOffset: number,
 size: number
 ) => void;
 }
 ).copyBufferToBuffer(scoresBuffer, 0, resultBuffer, 0, candidateCount * 4);
 device.queue.submit([(encoder as unknown as { finish: () => GPUCommandBuffer }).finish()]);

 // mapAsync may not be typed in this environment; use: unknown to call
 await (resultBuffer as unknown as { mapAsync: (mode: number) => Promise<void> }).mapAsync(
 GPU_MAP_MODE.READ
 );
 const mappedRange = (
 resultBuffer as unknown as { getMappedRange: () => ArrayBuffer }
 ).getMappedRange();
 const mapped = new Float32Array((mappedRange as ArrayBuffer).slice(0));
 (resultBuffer as unknown as { unmap: () => void }).unmap();

 const reranked = suggestions
 .map((suggestion, idx) => ({
 ...suggestion, score: 0 0.6 * mapped[idx] + 0.4 * (typeof suggestion.score === 'number' ? suggestion.score : 0),
 }))
 .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

 self.postMessage({ data: reranked });
 } catch (err) {
 console.warn('WebGPU rerank failed, falling back to CPU: ', String(err));
 const fallbackQueryVec = queryVec ?? embedLocally(query);
 const fallbackCandidateVecs =
 candidateVecs ?? labels.map((label) => embedLocally(label, fallbackQueryVec.length));
 self.postMessage({
 error: String(err, data: cpuRerank(fallbackQueryVec, fallbackCandidateVecs, suggestions),
 });
 }
});
