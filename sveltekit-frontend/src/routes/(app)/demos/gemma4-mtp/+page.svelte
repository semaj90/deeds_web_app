<script lang="ts">
	import WebGPUGemma4MtpAssistant from '$lib/components/ai/WebGPUGemma4MtpAssistant.svelte';
	import Card from '$lib/components/ui/card/Card.svelte';
	import CardContent from '$lib/components/ui/card/CardContent.svelte';
	import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
	import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	let activeSection = $state<'assistant' | 'matrix' | 'artifacts' | 'guardrails'>('assistant');

	const backendComparison = [
		{
			name: 'Client WebGPU E2B (Transformers.js)',
			type: 'Browser In-Memory SLM',
			weights: 'onnx-community/gemma-4-E2B-it-ONNX',
			dtype: 'q4f16 (quantized 4-bit weights, f16 activations)',
			speed: '~14 - 22 tok/s on WebGPU',
			memory: '~1.8 GB GPU VRAM (via WebGPU buffer)',
			bestFor: 'Zero-latency drafting, local note synthesis, offline privacy',
			status: 'Active (Client)'
		},
		{
			name: 'LiteRT-LM CPU Sidecar (:8070)',
			type: 'Native C++ / NPU / CPU Engine',
			weights: 'models/gemma4-e2b.litertlm (or .tflite)',
			dtype: 'INT4 / FP16 LiteRT format',
			speed: '~8 - 18 tok/s on CPU/NPU',
			memory: '~1.2 GB Host RAM',
			bestFor: 'Low-power background workers, offline edge servers, battery conservation',
			status: 'Ready (Port 8070)'
		},
		{
			name: 'Ornith 1.5-9B (:8090)',
			type: 'Full Server Reasoning & Tool Agent',
			weights: 'models/ornith-1_5-9b-ad-q5_k-q4_k/ (llama-server)',
			dtype: 'Q5_K_M / Q4_K_M + Vision Projector',
			speed: '~35 - 55 tok/s (NVIDIA RTX GPU)',
			memory: '~6.8 GB Dedicated GPU VRAM',
			bestFor: 'Complex legal reasoning, citation verification, database mutations, RAG fusion',
			status: 'Active (Authority)'
		}
	];

	const discoveredModels = [
		{
			path: 'models/atlas-gemma4-e4b-assistant/mtp-f16/atlas-gemma4-e4b-assistant-mtp-f16.gguf',
			size: '171 MB',
			role: 'MTP Speculative Drafter',
			spec: '4 Multi-Token Prediction heads; predicts future candidate tokens to accelerate base model'
		},
		{
			path: 'models/gemma4_assistant_huggingface_7_3_26/',
			size: '159 MB (safetensors) + 32 MB (tokenizer.json)',
			role: 'HuggingFace MTP Drafter Weights',
			spec: 'Safetensors format for Transformers.js / LiteRT-LM conversion'
		},
		{
			path: 'models/gemma4-e2b-rotorquant-iq4xs/',
			size: 'Quantized folder',
			role: 'Target SLM Candidate',
			spec: 'Experimental RotorQuant IQ4_XS format'
		},
		{
			path: 'models/gemma4-legal-iq4xs-direct.gguf',
			size: '5.09 GB',
			role: 'Legal Domain Base Model',
			spec: 'IQ4_XS direct quantization for llama-server or cuVS'
		},
		{
			path: 'models/embeddinggemma-300m-f16.gguf',
			size: '621 MB',
			role: 'Canonical Dense Vector Owner',
			spec: 'EmbeddingGemma → semantic_768 vector representation (Postgres & Qdrant)'
		}
	];
</script>

<div class="space-y-6">
	<!-- Tab Bar -->
	<div class="flex items-center gap-2 border-b border-[#252838] pb-3">
		<button
			class="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 {activeSection === 'assistant' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a1c28]'}"
			onclick={() => activeSection = 'assistant'}
		>
			<Icon name="bot" class="w-3.5 h-3.5" />
			Interactive Assistant
		</button>
		<button
			class="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 {activeSection === 'matrix' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a1c28]'}"
			onclick={() => activeSection = 'matrix'}
		>
			<Icon name="cpu" class="w-3.5 h-3.5" />
			Backend Comparison Matrix
		</button>
		<button
			class="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 {activeSection === 'artifacts' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a1c28]'}"
			onclick={() => activeSection = 'artifacts'}
		>
			<Icon name="folder" class="w-3.5 h-3.5" />
			Discovered Models & Artifacts
		</button>
		<button
			class="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 {activeSection === 'guardrails' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a1c28]'}"
			onclick={() => activeSection = 'guardrails'}
		>
			<Icon name="shield" class="w-3.5 h-3.5" />
			Parent Atlas Guardrails
		</button>
	</div>

	<!-- Section: Interactive Assistant -->
	{#if activeSection === 'assistant'}
		<div class="space-y-4">
			<WebGPUGemma4MtpAssistant />
		</div>
	{/if}

	<!-- Section: Backend Comparison Matrix -->
	{#if activeSection === 'matrix'}
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			{#each backendComparison as backend}
				<Card class="bg-[#12141c] border-[#222533]">
					<CardHeader class="pb-3 border-b border-[#1c1f2e]">
						<div class="flex items-center justify-between">
							<span class="text-xs font-mono uppercase text-cyan-400">{backend.type}</span>
							<span class="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/80 text-emerald-400 border border-emerald-700/50">
								{backend.status}
							</span>
						</div>
						<CardTitle class="text-base font-bold text-white mt-1">{backend.name}</CardTitle>
					</CardHeader>
					<CardContent class="pt-4 space-y-3 text-xs">
						<div>
							<span class="text-gray-500 block uppercase text-[10px] tracking-wider">Model / Weights:</span>
							<span class="text-gray-200 font-mono text-[11px] break-all">{backend.weights}</span>
						</div>
						<div>
							<span class="text-gray-500 block uppercase text-[10px] tracking-wider">Quantization / Dtype:</span>
							<span class="text-gray-300">{backend.dtype}</span>
						</div>
						<div>
							<span class="text-gray-500 block uppercase text-[10px] tracking-wider">Expected Throughput:</span>
							<span class="text-emerald-400 font-semibold">{backend.speed}</span>
						</div>
						<div>
							<span class="text-gray-500 block uppercase text-[10px] tracking-wider">Memory Footprint:</span>
							<span class="text-amber-400 font-semibold">{backend.memory}</span>
						</div>
						<div class="pt-2 border-t border-[#1c1f2e]">
							<span class="text-gray-500 block uppercase text-[10px] tracking-wider">Primary Role:</span>
							<span class="text-gray-300">{backend.bestFor}</span>
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}

	<!-- Section: Discovered Models -->
	{#if activeSection === 'artifacts'}
		<div class="space-y-3">
			<div class="p-4 rounded-lg bg-[#141622] border border-[#232638] text-xs text-gray-300">
				<p class="font-semibold text-white mb-1">Local Models Inventory (`/models`)</p>
				<p>
					These model weights were detected on disk. The MTP assistant models are strictly constrained as speculative drafters for acceleration and cannot be promoted to canonical reasoning authorities.
				</p>
			</div>

			<div class="overflow-x-auto rounded-lg border border-[#222533]">
				<table class="w-full text-left text-xs font-mono">
					<thead class="bg-[#161824] text-gray-400 uppercase text-[10px] border-b border-[#222533]">
						<tr>
							<th class="p-3">File / Directory</th>
							<th class="p-3">Size</th>
							<th class="p-3">Architectural Role</th>
							<th class="p-3">Specification</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-[#1c1f2e] bg-[#10121a]">
						{#each discoveredModels as item}
							<tr class="hover:bg-[#161926] transition-colors">
								<td class="p-3 text-cyan-300 break-all">{item.path}</td>
								<td class="p-3 text-amber-300 font-semibold whitespace-nowrap">{item.size}</td>
								<td class="p-3 text-emerald-300 font-sans whitespace-nowrap">{item.role}</td>
								<td class="p-3 text-gray-400 font-sans">{item.spec}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<!-- Section: Guardrails -->
	{#if activeSection === 'guardrails'}
		<Card class="bg-[#12141c] border-[#222533]">
			<CardHeader class="border-b border-[#1c1f2e]">
				<CardTitle class="text-base text-white flex items-center gap-2">
					<Icon name="shield-alert" class="w-4 h-4 text-amber-400" />
					Parent Atlas Architecture Boundaries
				</CardTitle>
			</CardHeader>
			<CardContent class="pt-4 space-y-4 text-xs text-gray-300 leading-relaxed">
				<div class="p-3 rounded bg-amber-950/20 border border-amber-600/30">
					<h4 class="font-bold text-amber-300 mb-1">1. Active Model & Synthesis Authority</h4>
					<p>
						<strong>Ornith 1.5-9B</strong> on port <code class="text-amber-200">:8090</code> (llama-server) is the authoritative synthesis and tool-use model. Gemma 4 E2B is an edge client assistant, and E4B-assistant is an MTP drafter. Gemma 4 is never the dense embedding writer or database mutation owner.
					</p>
				</div>

				<div class="p-3 rounded bg-cyan-950/20 border border-cyan-600/30">
					<h4 class="font-bold text-cyan-300 mb-1">2. Canonical Dense Vector Owner</h4>
					<p>
						Dense embeddings are exclusively owned by <strong>EmbeddingGemma</strong> producing <code class="text-cyan-200">semantic_768</code> vectors stored in PostgreSQL <code class="text-cyan-200">codebase_chunk_index.content_embedding_768</code> and mirrored in Qdrant. Client inference and MTP heads never write vectors to the canonical database.
					</p>
				</div>

				<div class="p-3 rounded bg-red-950/20 border border-red-600/30">
					<h4 class="font-bold text-red-300 mb-1">3. Zero Hidden Thoughts Persistence</h4>
					<p>
						No hidden thoughts, chain-of-thought scratchpads, KV cache tensors, or raw execution buffers may ever be persisted to PostgreSQL, Redis, Qdrant, or SeaweedFS. All client-to-server exchanges are audited for injection guards and schema compliance.
					</p>
				</div>
			</CardContent>
		</Card>
	{/if}
</div>
