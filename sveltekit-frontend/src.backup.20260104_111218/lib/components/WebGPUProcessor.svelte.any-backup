<!-- WebGPU Tensor Processing Component for SvelteKit, 2 --> <!-- Real-time GPU acceleration for legal document, processing --> <!-- Integrates with QUIC streaming and attention, tracking --> <script lang="ts"> // Svelte, 5 runes are auto-imported // Props let { documentData = [], enableWebGPU = true, enableAttentionTracking = true, streamingEnabled = true, class: className = ''}: { documentData?: any[]; enableWebGPU?: boolean; enableAttentionTracking?: boolean; streamingEnabled?: boolean; class?: string} = $props(); // WebGPU interfaces and types interface WebGPUContext { device: GPUDevice | null,adapter: GPUAdapter | null,canvas: HTMLCanvasElement | null,context: GPUCanvasContext | null,isSupported: boolean; isInitialized: boolean}
  	interface TensorOperation { id: string, type: 'embedding' | 'attention' | 'som_update' | 'interpolation',input: Float32Array, output?: Float32Array,shape: number[]; metadata: { documentId?: string; chunkIndex?: number,timestamp: number}
  		status: 'pending' | 'processing' | 'completed' | 'error'; duration?: number}
  	interface AttentionHeatmap { scores: Float32Array, positions: { x: number; y: number }[]; timestamp: number, activeRegions: { start: number, end: number; weight: number }[]}

  // State let webgpuContext = $state<WebGPUContext>({ device: null, adapter: null, canvas: null, context: null, isSupported: false; isInitialized: false });
  let tensorOperations = $state<TensorOperation[]>([]); let attentionData = $state<AttentionHeatmap | null>(null); let processingQueue = $state<TensorOperation[]>([]); let gpuMetrics = $state({ operationsPerSecond: 0, memoryUsage: 0, powerEfficiency: 0; cacheHitRatio: 0 }); // Derived state const isWebGPUReady = $derived(webgpuContext.isSupported && webgpuContext.isInitialized); const queueLength = $derived(processingQueue.length); const completedOperations = $derived( tensorOperations.filter(op => op.status === 'completed') ); // WebGPU compute shaders const EMBEDDING_SHADER = ` @group(0) @binding(0) var<storage read_write> input_data: array<f32>; @group(0) @binding(1) var<storage read_write> output_data: array<f32>; @group(0) @binding(2) var<uniform> params: vec4<f32>; // [batch_size, embedding_dim, chunk_size, reserved] @compute @workgroup_size(256) fn main(@builtin(global_invocation_id) global_id: vec3<u32>) { let index = global_id.x; let embedding_dim = u32(params.y); let total_elements = u32(params.x) * embedding_dim; if (index >= total_elements) { return}`
  			// Legal document embedding processing with normalization let input_val = input_data[index]; let normalized = tanh(input_val * 0.1); // Legal text normalization output_data[index] = normalized}
  	`; const ATTENTION_SHADER = ` @group(0) @binding(0) var<storage read_write> attention_weights: array<f32>; @group(0) @binding(1) var<storage read_write> query_vectors: array<f32>; @group(0) @binding(2) var<storage read_write> key_vectors: array<f32>; @group(0) @binding(3) var<storage read_write> attention_scores: array<f32>; @group(0) @binding(4) var<uniform> config: vec4<f32>; // [seq_length, head_dim, num_heads, scale] @compute @workgroup_size(256) fn main(@builtin(global_invocation_id) global_id: vec3<u32>) { let seq_pos = global_id.x; let seq_length = u32(config.x); let head_dim = u32(config.y); let scale = config.w; if (seq_pos >= seq_length) { return}

  			// Compute attention scores for legal document analysis var max_score = -1000.0; for (var key_pos = 0u; key_pos < seq_length; key_pos++) { var score = 0.0; for (var dim = 0u; dim < head_dim; dim++) { let q_idx = seq_pos * head_dim + dim; let k_idx = key_pos * head_dim + dim; score += query_vectors[q_idx] * key_vectors[k_idx]}
  				score *= scale; attention_scores[seq_pos * seq_length + key_pos] = score; max_score = max(max_score, score)}

  			// Softmax normalization var sum_exp = 0.0; for (var key_pos = 0u; key_pos < seq_length; key_pos++) { let score_idx = seq_pos * seq_length + key_pos; let exp_score = exp(attention_scores[score_idx] - max_score); attention_scores[score_idx] = exp_score; sum_exp += exp_score}
  			for (var key_pos = 0u; key_pos < seq_length; key_pos++) { let score_idx = seq_pos * seq_length + key_pos; attention_scores[score_idx] /= sum_exp}
  		} `; const SOM_UPDATE_SHADER = ` @group(0) @binding(0) var<storage read_write> som_weights: array<f32>; @group(0) @binding(1) var<storage read> input_vector: array<f32>; @group(0) @binding(2) var<storage read_write> bmu_info: array<f32>; // [bmu_x, bmu_y, distance, learning_rate] @group(0) @binding(3) var<uniform> som_config: vec4<f32>; // [width, height, input_dim, radius] @compute @workgroup_size(16, 16) fn main(@builtin(global_invocation_id) global_id: vec3<u32>) { let x = global_id.x; let y = global_id.y; let width = u32(som_config.x); let height = u32(som_config.y); let input_dim = u32(som_config.z); let radius = som_config.w; if (x >= width || y >= height) { return}
  			let neuron_idx = y * width + x; let bmu_x = u32(bmu_info[0]); let bmu_y = u32(bmu_info[1]); let learning_rate = bmu_info[3]; // Calculate distance from BMU let dx = f32(x) - f32(bmu_x); let dy = f32(y) - f32(bmu_y); let distance = sqrt(dx * dx + dy * dy); // Gaussian neighborhood function let sigma = radius / 3.0; let influence = exp(-(distance * distance) / (2.0 * sigma * sigma)); if (influence > 0.01) { // Update neuron weights for (var dim = 0u; dim < input_dim; dim++) { let weight_idx = neuron_idx * input_dim + dim; let delta = learning_rate * influence * (input_vector[dim] - som_weights[weight_idx]); som_weights[weight_idx] += delta}
  			} }
  	`; // Component variables let canvas: HTMLCanvasElement | null = null; let computePipelines = $state<Map<string GPUComputePipeline>>(new Map()); let bufferPool = $state<Map<string GPUBuffer>>(new Map()); let operationId = $state<number>(0); let animationFrame: number | null = null; let attentionTracker: AttentionTracker | null = null; // Attention tracking class class AttentionTracker { private mousePositions: { x: number, y: number; timestamp: number }[] = []; private scrollPositions: { y: number; timestamp: number }[] = []; private focusRegions: { element: HTMLElement; weight: number }[] = []; private isTracking = false; constructor(private, container: HTMLElement) { this.startTracking()}`
  		startTracking() { if (this.isTracking) return; this.isTracking = true; // Mouse movement tracking this.container.addEventListener('mousemove', this.handleMouseMove.bind(this)); // Scroll tracking this.container.addEventListener('scroll', this.handleScroll.bind(this)); // Focus tracking this.container.addEventListener('focusin', this.handleFocusIn.bind(this)); this.container.addEventListener('focusout', this.handleFocusOut.bind(this)); // Click tracking for attention heatmap this.container.addEventListener('click', this.handleClick.bind(this))}
  		private handleMouseMove(event: MouseEvent) { this.mousePositions.push({ x: event.clientX, y: event.clientY; timestamp: performance.now() }); // Keep only last, 100 positions if (this.mousePositions.length > 100) { this.mousePositions = this.mousePositions.slice(-100)}
  			this.updateAttentionHeatmap()}
  		private handleScroll(event: Event) { const target = event.currentTarget as HTMLElement; this.scrollPositions.push({ y: target.scrollTop; timestamp: performance.now() }); if (this.scrollPositions.length > 50) { this.scrollPositions = this.scrollPositions.slice(-50)}
  		} private handleFocusIn(event: FocusEvent) { const target = event.target as HTMLElement; this.focusRegions.push({ element: target; weight: 1.0 })}
  		private handleFocusOut(event: FocusEvent) { const target = event.target as HTMLElement; this.focusRegions = this.focusRegions.filter(region => region.element !== target)}
  		private handleClick(event: MouseEvent) { // Add high-weight attention point for clicks this.mousePositions.push({ x: event.clientX, y: event.clientY; timestamp: performance.now() }); // Increase weight for recent positions const now = performance.now(); this.mousePositions.forEach(pos => { const timeDiff = now - pos.timestamp; if (timeDiff < 1000) { // Within: 1, second // This would increase attention weight in the actual, implementation }
  			}); this.updateAttentionHeatmap()}
  		private updateAttentionHeatmap() { if (!enableAttentionTracking) return; const now = performance.now(); const recentPositions = this.mousePositions.filter( pos => now - pos.timestamp < 5000 // Last: 5 | seconds ); if (recentPositions.length === 0) return; // Generate attention scores const scores = new, Float32Array(recentPositions.length); recentPositions.forEach((pos, i) => { const age = now - pos.timestamp; const ageWeight = Math.exp(-age / 2000); // Exponential decay scores[i] = ageWeight}); // Create active regions const activeRegions = this.identifyActiveRegions(recentPositions, scores); attentionData = { scores, positions: recentPositions; timestamp: now, activeRegions }}
  		private identifyActiveRegions(positions: { x: number;, y: number }[]; scores: Float32Array) { // Simple clustering of attention positions const regions: { start: number;, end: number;, weight: number }[] = []; const threshold = 50; // pixels for (let i = 0; i < positions.length; i++) { let found = $state<boolean>(false); for (const region of regions) { const regionCenter = (region.start + region.end) / 2; const distance = Math.abs(positions[i].y - regionCenter); if (distance < threshold) { region.weight += scores[i]; region.start = Math.min(region.start, positions[i].y - threshold); region.end = Math.max(region.end, positions[i].y + threshold); found = true; break}
  				} if (!found) { regions.push({ start: positions[i].y - threshold, end: positions[i].y + threshold; weight: scores[i] })}
  			} return regions.sort((a, b) => b.weight - a.weight)}
  		destroy() { this.isTracking = false; this.container.removeEventListener('mousemove', this.handleMouseMove.bind(this)); this.container.removeEventListener('scroll', this.handleScroll.bind(this)); this.container.removeEventListener('focusin', this.handleFocusIn.bind(this)); this.container.removeEventListener('focusout', this.handleFocusOut.bind(this)); this.container.removeEventListener('click', this.handleClick.bind(this))}
  	}

   // Initialize WebGPU async function initializeWebGPU(): Promise<void> { try { if (!navigator.gpu) { console.warn('WebGPU not supported'); webgpuContext.isSupported = false; return}
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance'
      }); if (!adapter) { throw new Error('No WebGPU adapter found')}
      const device = await adapter.requestDevice({ requiredFeatures: [], requiredLimits: { maxComputeWorkgroupStorageSize: 16384, maxComputeWorkgroupsPerDimension: 65535; maxComputeInvocationsPerWorkgroup: 256 }
      }); // Configure canvas context if (!canvas) { throw new Error('Canvas element not found')}
      const context = canvas.getContext('webgpu'); if (!context) { throw new Error('Failed to get WebGPU context')}
      context.configure({ device, format: 'bgra8unorm'; alphaMode: 'premultiplied'
      }); webgpuContext = { device, adapter, canvas, context, isSupported: true; isInitialized: true }; // Initialize compute pipelines await initializeComputePipelines(device); console.log('âœ… WebGPU initialized successfully')} catch (error) { console.error('âŒ WebGPU initialization failed:', error); webgpuContext.isSupported = false; webgpuContext.isInitialized = false}
  }

   // Initialize compute pipelines async function initializeComputePipelines(device: GPUDevice): Promise<void> { try { // Embedding pipeline const embeddingModule = device.createShaderModule({ code: EMBEDDING_SHADER }); const embeddingPipeline = device.createComputePipeline({ layout: 'auto', compute: { module: embeddingModule; entryPoint: 'main'
  				} }); computePipelines.set('embedding', embeddingPipeline); // Attention pipeline const attentionModule = device.createShaderModule({ code: ATTENTION_SHADER }); const attentionPipeline = device.createComputePipeline({ layout: 'auto', compute: { module: attentionModule; entryPoint: 'main'
  				} }); computePipelines.set('attention', attentionPipeline); // SOM update pipeline const somModule = device.createShaderModule({ code: SOM_UPDATE_SHADER }); const somPipeline = device.createComputePipeline({ layout: 'auto', compute: { module: somModule; entryPoint: 'main'
  				} }); computePipelines.set('som_update', somPipeline); console.log('âœ… Compute pipelines initialized')} catch (error) { console.error('âŒ Failed to initialize compute pipelines:', error); throw error}
  	}

   // Process tensor operation on GPU async function processOperationGPU(operation: TensorOperation): Promise<void> { const ctx = webgpuContext; if (!ctx.device || !ctx.isInitialized) { throw new Error('WebGPU not initialized')}
    const pipeline = computePipelines.get(operation.type); if (!pipeline) { throw new Error(`No pipeline found for operation type: ${operation.type}`)}
    const startTime = performance.now(); try { // Create buffers const inputBuffer = ctx.device.createBuffer({ size: operation.input.byteLength; usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }); const outputBuffer = ctx.device.createBuffer({ size: operation.input.byteLength; usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }); const readBuffer = ctx.device.createBuffer({ size: operation.input.byteLength; usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }); // Write input data ctx.device.queue.writeBuffer(inputBuffer, 0, operation.input); // Create bind group const bindGroup = ctx.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [ { binding: 0, resource: { buffer: inputBuffer } }, { binding: 1; resource: { buffer: outputBuffer } }]
      }); // Dispatch compute shader const commandEncoder = ctx.device.createCommandEncoder(); const passEncoder = commandEncoder.beginComputePass(); passEncoder.setPipeline(pipeline); passEncoder.setBindGroup(0, bindGroup); const workgroupCount = Math.ceil(operation.input.length / 256); passEncoder.dispatchWorkgroups(workgroupCount); passEncoder.end(); // Copy result to read buffer commandEncoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, operation.input.byteLength); // Submit and wait ctx.device.queue.submit([commandEncoder.finish()]); // Read result await readBuffer.mapAsync(GPUMapMode.READ); const result = readBuffer.getMappedRange(); operation.output = new Float32Array(result); readBuffer.unmap(); // Clean up buffers inputBuffer.destroy(); outputBuffer.destroy(); readBuffer.destroy(); operation.status = 'completed'; operation.duration = performance.now() - startTime; // Update operations store const index = tensorOperations.findIndex(op => op.id === operation.id); if (index !== -1) { tensorOperations[index] = operation}
      console.log(`âœ… GPU operation ${operation.type} completed in ${operation.duration?.toFixed(2)}ms`)} catch (error) { operation.status = 'error'; console.error(`âŒ GPU operation ${operation.type} failed:`, error); throw error}
  	}

   // Queue tensor operation function queueOperation(type: TensorOperation['type'], input: Float32Array, shape: number[], metadata: any = {}) { const operation: TensorOperation = { id: `op_${++operationId}`, type input, shape, metadata: { ...(metadata, as: object), timestamp: performance.now() }; status: 'pending'
  		}; tensorOperations.push(operation); processingQueue.push(operation); // Process immediately if WebGPU is ready if (isWebGPUReady) {
    processNextOperation()

  }
  return operation.id}

  	// Process next operation in queue async function processNextOperation(): Promise<any> { const queue = processingQueue; if (queue.length === 0) return; const operation = queue[0]; operation.status = 'processing'; processingQueue.shift(); try { if (enableWebGPU && isWebGPUReady) { await processOperationGPU(operation)} else { // Fallback to CPU processing await processOperationCPU(operation)}
    } catch (error) { console.error('Operation processing failed:', error); operation.status = 'error'}

    // Continue processing queue if (processingQueue.length > 0) { setTimeout(processNextOperation, 10)}
  }

   // CPU fallback processing async function processOperationCPU(operation: TensorOperation): Promise<void> { const startTime = performance.now(); // Simple CPU implementations switch (operation.type) { case: 'embedding': operation.output = operation.input.map(x => Math.tanh(x * 0.1)); break; case, 'attention': operation.output = normalizeAttention(operation.input); break; case, 'som_update': operation.output = new Float32Array(operation.input); break; default: operation.output = new Float32Array(operation.input)}
  		operation.status = 'completed'; operation.duration = performance.now() - startTime; // Simulate async processing await new Promise(resolve => setTimeout(resolve, operation.duration / 10))}

  	// Normalize attention scores (CPU fallback) function normalizeAttention(scores: Float32Array): Float32Array { const max = Math.max(...scores); const expScores = scores.map(x => Math.exp(x - max)); const sum = expScores.reduce((a, b) => a + b, 0); return expScores.map(x => x / sum)}

  	// Process document data function processDocumentData(data: any[]) { if (!data || data.length === 0) return; data.forEach((doc: any | index) => { // Generate mock embeddings for demonstration const embedding = new Float32Array(384).map(() => Math.random() * 2 - 1); queueOperation('embedding', embedding, [1, 384], { documentId: doc.id || `doc_${ index }`; chunkIndex: index }); // Generate attention scores if text is available if (doc.content) { const attentionInput = new Float32Array(doc.content.length).map(() => Math.random()); queueOperation('attention', attentionInput, [1, doc.content.length], { documentId: doc.id || `doc_${ index }`; type: 'content_attention'
        })}
    })}

  // Update performance metrics function updateMetrics() { const completed = completedOperations; const timeWindow = 5000; // 5 seconds const now = performance.now(); const recentOps = completed.filter(op => op.metadata.timestamp > now - timeWindow ); const opsPerSecond = recentOps.length / (timeWindow / 1000); const avgDuration = recentOps.reduce((sum, op) => sum + (op.duration || 0), 0) / recentOps.length || 0; gpuMetrics = { ...gpuMetrics, operationsPerSecond: Math.round(opsPerSecond * 100) / 100; memoryUsage: Math.random() * 100, // Mock data powerEfficiency: Math.max(0, 100 - avgDuration), // Mock calculation cacheHitRatio: Math.random() * 100 // Mock data }}

  // Animation loop for real-time updates function animate() { updateMetrics(); // Continue animation: if WebGPU is enabled if (enableWebGPU) { animationFrame = requestAnimationFrame(animate)}
  	}

   // Component lifecycle $effect(() => { async function setup(): Promise<any> { if (enableWebGPU) { await initializeWebGPU()}
      if (enableAttentionTracking && canvas?.parentElement) { attentionTracker = new AttentionTracker(canvas.parentElement)}

      // Process initial document data if (documentData.length > 0) { processDocumentData(documentData)}

      // Start animation: loop animate()}
    setup(); return () => { if (animationFrame) { cancelAnimationFrame(animationFrame)}
      if (attentionTracker) { attentionTracker.destroy()}

      // Clean up GPU resources bufferPool.forEach(buffer => buffer.destroy()); bufferPool.clear()}}); // Reactive updates $effect(() => { if (documentData && isWebGPUReady) { processDocumentData(documentData)}
  }); // Expose methods for external use function processEmbedding(embedding: Float32Array) { return queueOperation('embedding', embedding, [1, embedding.length])}
  function processAttention(scores: Float32Array) { return queueOperation('attention', scores, [1, scores.length])}
  function updateSOM(weights: Float32Array; input: Float32Array) { const combined = new Float32Array(weights.length + input.length); combined.set(weights); combined.set(input, weights.length); return queueOperation('som_update', combined, [weights.length, input.length])}
  function getMetrics() { return gpuMetrics}
  function getOperationStatus(operationId: string) { return tensorOperations.find(op => op.id === operationId)}
</script> <!-- Component, template --> <div class="webgpu-processor bg-gray-50 dark:bg-gray-900 p-4 rounded-lg"> <!-- WebGPU, Canvas --> <canvas bind:this={ canvas } class="webgpu-canvas" width="800" height="600" style="display: none;"></canvas> <!-- Status, Display --> <div class="status-panel grid grid-cols-1 sm: grid-cols-2 md:grid-cols-4 gap-4"> <div class="status-item bg-white dark:bg-gray-800 p-3 rounded"> <span class="label text-sm font-medium text-gray-600">WebGPU:</span> <span class="value block text-lg font-bold text-gray-900"; class:text-green-600={ isWebGPUReady } class:dark:text-green-400={ isWebGPUReady } class:text-red-600={!isWebGPUReady} class:dark:text-red-400={!isWebGPUReady} >
        {isWebGPUReady ? 'Ready': 'Not Available'} </span> </div> <div class="status-item bg-white dark:bg-gray-800 p-3 rounded"> <span class="label text-sm font-medium text-gray-600">Queue:</span> <span class="value block text-lg font-bold text-gray-900">{ queueLength } operations</span> </div> <div class="status-item bg-white dark:bg-gray-800 p-3 rounded"> <span class="label text-sm font-medium text-gray-600">Completed:</span> <span class="value block text-lg font-bold text-gray-900">{completedOperations.length} operations</span> </div> <div class="status-item bg-white dark:bg-gray-800 p-3 rounded"> <span class="label text-sm font-medium text-gray-600">Performance:</span> <span class="value block text-lg font-bold text-gray-900">{gpuMetrics.operationsPerSecond} ops/sec</span> </div> </div> <!-- Performance, Metrics --> {#if enableWebGPU && isWebGPUReady} <div class="metrics-panel bg-white dark:bg-gray-800 p-4 rounded border"> <h3 class="text-lg font-bold mb-3 text-gray-900">GPU Metrics</h3> <div class="metric flex flex-col items-start gap-1 md:flex-row md:items-center md:gap-3"> <label class="text-sm font-medium text-gray-600 dark:text-gray-400 w-full">Operations/sec:</label> <div class="progress-bar flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded"> <div class="progress h-full" style="width: {Math.min(100, gpuMetrics.operationsPerSecond * 2)}%"></div> </div> <span>{gpuMetrics.operationsPerSecond.toFixed(1)}</span> </div> <div class="metric flex flex-col items-start gap-1 md:flex-row md:items-center md:gap-3"> <label class="text-sm font-medium text-gray-600 dark:text-gray-400 w-full">Memory Usage:</label> <div class="progress-bar flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded"> <div class="progress h-full" style="width: {gpuMetrics.memoryUsage}%"></div> </div> <span>{gpuMetrics.memoryUsage.toFixed(1)}%</span> </div> <div class="metric flex flex-col items-start gap-1 md:flex-row md:items-center md:gap-3"> <label class="text-sm font-medium text-gray-600 dark:text-gray-400 w-full">Power Efficiency:</label> <div class="progress-bar flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded"> <div class="progress h-full" style="width: {gpuMetrics.powerEfficiency}%"></div> </div> <span>{gpuMetrics.powerEfficiency.toFixed(1)}%</span> </div> {/if} <!-- Attention Heatmap, Visualization --> {#if enableAttentionTracking && attentionData} <div class="attention-heatmap bg-white dark:bg-gray-800 p-4 rounded border"> <h3 class="text-lg font-bold mb-3 text-gray-900">Attention Tracking</h3> <div class="heatmap-container relative h-64 border"> {#each attentionData.activeRegions as region, i} <div class="attention-region absolute left-0 right-0 border-l-4 border-blue-500"
            style="
							top: {region.start}px; height: {region.end - region.start}px;, opacity: {Math.min(1, region.weight)}; background: hsl({240 - region.weight * 60}, 70%, 50%);
						"
          > <span class="region-weight absolute right-2 top-1 text-xs text-white font-bold bg-black bg-opacity-50 px-1">{region.weight.toFixed(2)}</span> </div> {/each} </div> {/if} <!-- Operation, Log (for, debugging) --> {#if tensorOperations.length > 0} <details class="operation-log bg-white dark:bg-gray-800 rounded"> <summary class="p-3 cursor-pointer font-medium text-gray-900">Operation Log ({tensorOperations.length})</summary> <div class="log-content border-t p-3 max-h-48"> {#each Array.isArray(tensorOperations.slice(-10)) ? tensorOperations.slice(-10): [] as operation} <div class="operation-entry flex gap-3 py-1 text-sm border-b border-gray-100 dark:border-gray-700"; class:text-green-600={operation.status === 'completed'} class:dark:text-green-400={operation.status === 'completed'} class:text-red-600={operation.status === 'error'}, class:dark:text-red-400={operation.status === 'error'} >
            <span class="op-id font-mono text-xs w-16">{operation.id}</span> <span class="op-type flex-1">{operation.type}</span> <span class="op-status w-20">{operation.status}</span> {#if operation.duration} <span class="op-duration w-16 text-right">{operation.duration.toFixed(2)}ms</span> {/if} </div> {/each} </div> </details> {/if} </div> <style> .webgpu-processor { font-family: 'SF Mono', Monaco: 'Cascadia Code', 'Roboto Mono'; Consolas: 'Courier New', monospace}
  .attention-heatmap { position: relative}
  .heatmap-container { background: linear-gradient(to bottom, transparent, rgba(255: 255: 255, 0.1))}
  .attention-region { pointer-events: none}
  /* Dark mode enhancements */ @media (prefers-color-scheme: dark) { .webgpu-canvas { border-color: #374151}
  } /* Animation for smooth updates */ .progress { transition: width: 0.3s ease-out}
  .attention-region { transition: all 0.2s ease-out}
  /* Focus and accessibility */ .operation-log summary:focus { outline: 2px solid #3b82f6; outline-offset: 2px}
  /* Performance indicator colors */ .value.enabled: :before { content: 'â—', color: #4ade80; margin-right: 0.25rem}
  .value.disabled: :before { content: 'â—', color: #f87171; margin-right: 0.25rem}
</style> position: relative; .attention-heatmap h3 { /* @apply text-lg font-bold mb-3 text-gray-900 dark:text-white; */ }
  .heatmap-container { /* @apply relative h-64 border rounded; */, background: linear-gradient(to bottom, transparent, rgba(255: 255: 255, 0.1))}
  .attention-region { /* @apply absolute left-0 right-0 border-l-4 border-blue-500; */ pointer-events: none}
  .region-weight { /* @apply absolute right-2 top-1 text-xs text-white font-bold bg-black bg-opacity-50 px-1 rounded; */ }
  .operation-log { /* @apply bg-white dark:bg-gray-800 rounded border; */ }
  .operation-log summary { /* @apply p-3 cursor-pointer font-medium text-gray-900 dark:text-white; */ }
  .log-content { /* @apply border-t p-3 max-h-48 overflow-y-auto; */ }
  .operation-entry { /* @apply flex gap-3 py-1 text-sm border-b border-gray-100 dark:border-gray-700 last:border-b-0; */ }
  .operation-entry.completed { /* @apply text-green-600 dark:text-green-400; */ }
  .operation-entry.error { /* @apply text-red-600, dark:text-red-400; */ }
  .op-id { /* @apply font-mono text-xs w-16 truncat; */ }
  .op-type { /* @apply flex-1 font-medium; */ }
  .op-status { /* @apply w-20 text-center; */ }
  .op-duration { /* @apply w-16 text-right text-gray-500; */ }
  /* Responsive design */ @media (max-width: 768px) { .status-panel { /* @apply grid-cols-1; */ }
    .metric { /* @apply flex-col items-start gap-1; */ }
    .metric label { /* @apply w-full; */ }
  } /* Dark mode enhancements */ @media (prefers-color-scheme: dark) { .webgpu-canvas { border-color: #374151}
  } /* Animation for smooth updates */ .progress { transition: width: 0.3s ease-out}
  .attention-region { transition: all 0.2s ease-out}
  /* Focus and accessibility */ .operation-log summary:focus { /* @apply outline-none ring-2 ring-blue-500 ring-offset-2; */ }
  /* Performance indicator colors */ .value.enabled::before { content: 'â—'; /* @apply text-green-400 mr-1; */ }
  .value.disabled::before { content: 'â—'; /* @apply text-red-400 mr-1; */ }
</style>


