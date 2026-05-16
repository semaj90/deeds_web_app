// sveltekit-frontend/scripts/lib/phase89-cuda-tags.mjs
const CUDA_EXT = new Set([".cu", ".cuh"]);
const CUDA_HINTS = [
  "__global__", "__device__", "__host__", "cudaMalloc", "cudaMemcpy", "cudaFree",
  "cudaError_t", "cudaGetLastError", "cudaPeekAtLastError",
  "<<<", ">>>", "blockIdx", "threadIdx", "warp", "__shared__", "atomic", "curand"
];

export function isCudaFile(filePath) {
  if (!filePath) return false;
  const lower = filePath.toLowerCase();
  return [...CUDA_EXT].some(ext => lower.endsWith(ext));
}

export function cudaTags(text, filePath) {
  const tags = [];
  if (filePath && isCudaFile(filePath)) tags.push("cuda:file");

  for (const h of CUDA_HINTS) {
    if (text.includes(h)) {
      if (h === "<<<" || h === ">>>") tags.push("cuda:kernel-launch");
      else tags.push(`cuda:${h.replace(/[^a-z0-9_]+/gi, "").toLowerCase()}`);
    }
  }

  // Coarse patterns
  if (text.includes("__shared__")) tags.push("cuda:shared-mem");
  if (text.match(/<<<\s*[^>]+>>>\s*\(/)) tags.push("cuda:launch-syntax");
  if (text.includes("cudaMemcpyAsync")) tags.push("cuda:async-copy");
  if (text.includes("cudaStream")) tags.push("cuda:streams");
  if (text.includes("cublas") || text.includes("cudnn")) tags.push("cuda:libs");

  return [...new Set(tags)];
}

// TypeScript/Svelte tags
export function tsTags(text, filePath) {
  const tags = [];
  const lower = filePath.toLowerCase();

  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) tags.push('lang:typescript');
  if (lower.endsWith('.svelte')) tags.push('lang:svelte');
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) tags.push('lang:javascript');

  // Svelte 5 patterns
  if (text.includes('$state')) tags.push('svelte5:state');
  if (text.includes('$derived')) tags.push('svelte5:derived');
  if (text.includes('$effect')) tags.push('svelte5:effect');
  if (text.includes('$props')) tags.push('svelte5:props');

  // Svelte 4 patterns (migration needed)
  if (text.match(/export\s+let\s+\w+/)) tags.push('svelte4:export-let');
  if (text.match(/\$:\s*\w+\s*=/)) tags.push('svelte4:reactive');
  if (text.match(/on:[a-z]+/)) tags.push('svelte4:event-handler');

  // Error patterns
  if (text.includes('TS1005')) tags.push('error:TS1005');
  if (text.includes('TS1128')) tags.push('error:TS1128');
  if (text.includes('TS1109')) tags.push('error:TS1109');

  return [...new Set(tags)];
}

export function extractTags(text, filePath) {
  return [...cudaTags(text, filePath), ...tsTags(text, filePath)];
}
