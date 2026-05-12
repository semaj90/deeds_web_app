import type { SkillRecipe } from './registry.js';

export const GPU_ACCELERATION_SKILLS: Record<string, SkillRecipe> = {
  gpu_vram_audit: {
    id: 'gpu_vram_audit',
    family: 'GPUPerformance',
    description: 'Detailed analysis of current GPU memory allocation across resident models',
    tools: [{ name: 'diagnostics:health' }, { name: 'shell:run', args: { command: 'nvidia-smi' } }]
  },
  evict_unused_resident_models: {
    id: 'evict_unused_resident_models',
    family: 'GPUPerformance',
    description: 'Free up GPU memory by evicting models that have been idle past their TTL',
    tools: [{ name: 'shell:run' }]
  },
  optimize_kv_cache_config: {
    id: 'optimize_kv_cache_config',
    family: 'GPUPerformance',
    description: 'Recommend the optimal KV cache quantization (q4_0 vs q8_0) for current task',
    tools: [{ name: 'llm:generate' }]
  },
  gpu_accelerated_rerank: {
    id: 'gpu_accelerated_rerank',
    family: 'GPUPerformance',
    description: 'Execute a cross-encoder rerank on a result set using the local GPU tower',
    tools: [{ name: 'gpu:rerank' }]
  },
  topological_graph_filter: {
    id: 'topological_graph_filter',
    family: 'GPUPerformance',
    description: 'Apply high-speed topological manifold filtering to a large retrieval set',
    tools: [{ name: 'gpu:topological_filter' }]
  },
  warm_up_vision_tower: {
    id: 'warm_up_vision_tower',
    family: 'GPUPerformance',
    description: 'Pre-load the VLM mmproj tower into VRAM for imminent image analysis',
    tools: [{ name: 'shell:run' }]
  },
  quantization_level_check: {
    id: 'quantization_level_check',
    family: 'GPUPerformance',
    description: 'Verify if the current GGUF model quantization matches hardware capabilities',
    tools: [{ name: 'llm:generate' }]
  },
  batch_embedding_dispatch: {
    id: 'batch_embedding_dispatch',
    family: 'GPUPerformance',
    description: 'Dispatch a high-throughput batch of documents to the GPU embedding queue',
    tools: [{ name: 'batch:run', args: (input) => ({ tool: 'extract:embedding', docs: input.docs }) }]
  },
  profiling_inference_latency: {
    id: 'profiling_inference_latency',
    family: 'GPUPerformance',
    description: 'Measure and log end-to-end inference latency for performance tuning',
    tools: [{ name: 'diagnostics:health' }]
  },
  cuda_kernel_health_check: {
    id: 'cuda_kernel_health_check',
    family: 'GPUPerformance',
    description: 'Verify integrity of custom CUDA kernels in the simd-bridge addon',
    tools: [{ name: 'shell:run', args: { command: 'npm run test:cuda' } }]
  },
  allocate_temp_vram_scratch: {
    id: 'allocate_temp_vram_scratch',
    family: 'GPUPerformance',
    description: 'Request temporary VRAM allocation for a high-intensity tensor operation',
    tools: [{ name: 'shell:run' }]
  },
  launch_rotorquant_tier: {
    id: 'launch_rotorquant_tier',
    family: 'GPUPerformance',
    description: 'Switch the primary inference backend to RotorQuant (IQ4_XS weight-quantized) for high-precision legal synthesis',
    tools: [{ name: 'shell:run', args: { command: 'npm run turbo:start:rotorquant:detached' } }]
  },
  launch_atomicbot_tier: {
    id: 'launch_atomicbot_tier',
    family: 'GPUPerformance',
    description: 'Switch to AtomicBot (Turbo3 KV + MTP) for ultra-high-throughput autonomous planning loops',
    tools: [{ name: 'shell:run', args: { command: 'npm run turbo:start:atomicbot:detached' } }]
  },
  benchmark_quantization_performance: {
    id: 'benchmark_quantization_performance',
    family: 'GPUPerformance',
    description: 'Run the TurboQuant bench-suite to measure current throughput across all active model tiers',
    tools: [{ name: 'shell:run', args: { command: 'node scripts/turboquant/bench-suite.mjs' } }]
  },
  autonomous_model_tier_selection: {
    id: 'autonomous_model_tier_selection',
    family: 'GPUPerformance',
    description: 'Dynamically select the optimal model tier (RotorQuant vs AtomicBot) based on task complexity and VRAM headroom',
    tools: [
      { name: 'diagnostics:health' },
      { name: 'llm:generate', args: (input) => ({ prompt: `Analyze health and decide tier for task: ${input.task}. Metrics: ${JSON.stringify(input.results)}` }) }
    ]
  },
  gpu_thermal_throttling_check: {
    id: 'gpu_thermal_throttling_check',
    family: 'GPUPerformance',
    description: 'Check for GPU thermal throttling and adjust task concurrency to prevent performance degradation',
    tools: [{ name: 'shell:run', args: { command: 'nvidia-smi -q -d PERFORMANCE' } }]
  },
  vram_fragmentation_defrag: {
    id: 'vram_fragmentation_defrag',
    family: 'GPUPerformance',
    description: 'Trigger a VRAM defragmentation by cycling resident models',
    tools: [{ name: 'shell:run' }]
  },
  multi_gpu_load_balancer: {
    id: 'multi_gpu_load_balancer',
    family: 'GPUPerformance',
    description: 'Balance inference and embedding tasks across multiple GPUs (if available)',
    tools: [{ name: 'diagnostics:health' }]
  },
  inference_cost_audit: {
    id: 'inference_cost_audit',
    family: 'GPUPerformance',
    description: 'Calculate the computational cost (compute hours / tokens) of the current mission',
    tools: [{ name: 'llm:generate' }]
  }
};
