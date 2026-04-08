<script lang="ts">
	import { fade, slide } from 'svelte/transition';

	// Modern Runes State
	let status = $state<'idle' | 'analyzing' | 'complete'>('idle');
	let confidenceScore = $state(0);
	
	// Complex state object for pipeline phases
	let pipeline = $state([
		{ id: 'extraction', label: 'Semantic Extraction', active: false, complete: false, progress: 0 },
		{ id: 'precedent', label: 'Precedent Graph Search (Qdrant)', active: false, complete: false, progress: 0 },
		{ id: 'judge', label: 'Judge Bias Profiling', active: false, complete: false, progress: 0 },
		{ id: 'synthesis', label: 'Inference Synthesis (Gemma 4)', active: false, complete: false, progress: 0 },
	]);

	let finalReport = $state<string | null>(null);

	// Mock Stream Function
	async function runPrediction() {
		status = 'analyzing';
		confidenceScore = 0;
		finalReport = null;

		// Reset pipeline
		for (const p of pipeline) {
			p.active = false;
			p.complete = false;
			p.progress = 0;
		}

		// Run through phases sequentially with mock delays
		for (let i = 0; i < pipeline.length; i++) {
			pipeline[i].active = true;
			
			// Simulate streaming progress
			for (let p = 0; p <= 100; p += Math.random() * 15 + 5) {
				await new Promise((r) => setTimeout(r, 100)); // 100ms ticks
				pipeline[i].progress = Math.min(100, Math.floor(p));
			}
			
			pipeline[i].progress = 100;
			pipeline[i].complete = true;
			pipeline[i].active = false;

			// Increase base confidence layer by layer
			confidenceScore += Math.floor(Math.random() * 20 + 5);
		}

		// Final Result
		confidenceScore = 87; // Lock in final prediction
		finalReport = "Based on the extraction of Exhibit A and strong precedent alignment (State v. Wright, 2023), the model predicts a high likelihood of case dismissal at the preliminary hearing. Judge Rodriguez has a known 64% bias toward dismissal on fourth amendment violations.";
		status = 'complete';
	}
</script>

<svelte:head>
	<title>Case Outcome Prediction Module | Deeds</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-6 py-12">
	<!-- Header Section -->
	<div class="mb-10 text-center">
		<h1 class="mb-4 font-mono text-3xl font-bold tracking-tight text-white/90">
			Case Outcome Predictor
			<span class="ml-3 inline-block rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-1 align-middle text-xs tracking-widest text-amber-500">
				EXPERIMENTAL
			</span>
		</h1>
		<p class="mx-auto max-w-2xl text-sm leading-relaxed text-slate-400">
			A sophisticated demonstration of combining semantic retrieval, historical 
			bias analysis, and LLM synthesis to project courtroom outcomes.
		</p>
	</div>

	<!-- Main Layout -->
	<div class="grid gap-6 md:grid-cols-3">
		
		<!-- Left Column: Controls & Pipeline -->
		<div class="md:col-span-2 space-y-6">
			
			<div class="rounded-xl border border-white/5 bg-panel p-6 shadow-xl ring-1 ring-white/5">
				<div class="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
					<h2 class="font-semibold text-white/80 flex items-center gap-2">
						<svg class="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
						</svg>
						Active Case Pipeline
					</h2>
					<button 
						onclick={runPrediction} 
						disabled={status === 'analyzing'}
						class="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{status === 'analyzing' ? 'Processing...' : status === 'complete' ? 'Run Again' : 'Initialize Prediction'}
					</button>
				</div>

				<div class="space-y-4">
					{#each pipeline as phase, i}
						<div class="rounded-lg border {phase.active ? 'border-accent/40 bg-accent/5' : phase.complete ? 'border-green-500/20 bg-green-500/5' : 'border-white/5 bg-black/40'} p-4 transition-all duration-300">
							<div class="flex items-center justify-between mb-2">
								<div class="flex items-center gap-3">
									<!-- Status Icon -->
									<div class="flex shrink-0 h-6 w-6 items-center justify-center rounded-full {phase.active ? 'bg-accent/20 animate-pulse text-accent' : phase.complete ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'} font-mono text-xs">
										{#if phase.complete}
											✓
										{:else}
											{i + 1}
										{/if}
									</div>
									<span class="text-sm font-medium {phase.active ? 'text-accent' : phase.complete ? 'text-green-300' : 'text-slate-500'}">
										{phase.label}
									</span>
								</div>
								
								<span class="font-mono text-xs {phase.active ? 'text-accent' : phase.complete ? 'text-green-400/50' : 'text-slate-600'}">
									{phase.progress}%
								</span>
							</div>

							<!-- Progress Bar -->
							<div class="h-1.5 w-full overflow-hidden rounded-full bg-black/50">
								<div 
									class="h-full rounded-full transition-all duration-200 {phase.complete ? 'bg-green-500/70' : 'bg-accent'}"
									style="width: {phase.progress}%"
								></div>
							</div>
						</div>
					{/each}
				</div>
			</div>

		</div>

		<!-- Right Column: Result Metrics -->
		<div class="space-y-6">
			
			<div class="rounded-xl border border-white/5 bg-panel p-6 shadow-xl text-center flex flex-col justify-center min-h-[220px]">
				<h3 class="mb-2 text-sm font-medium text-slate-400 uppercase tracking-widest">Victory Confidence</h3>
				<div class="relative flex items-center justify-center py-4">
					<!-- Radial Progress Simulation -->
					<svg class="h-32 w-32 -rotate-90 transform" viewBox="0 0 100 100">
						<circle cx="50" cy="50" r="40" stroke="currentColor" stroke-width="8" fill="transparent" class="text-black/50" />
						<circle 
							cx="50" cy="50" r="40" 
							stroke="currentColor" 
							stroke-width="8" 
							fill="transparent" 
							stroke-dasharray="251.2" 
							stroke-dashoffset={251.2 - (251.2 * confidenceScore) / 100}
							stroke-linecap="round"
							class="{status === 'complete' ? 'text-green-500/80 transition-all duration-1000' : 'text-accent transition-all duration-300'}" 
						/>
					</svg>
					<div class="absolute flex flex-col items-center">
						<span class="font-mono text-4xl font-bold {status === 'complete' ? 'text-green-400' : 'text-white'}">
							{confidenceScore}
						</span>
						<span class="font-mono text-xs text-slate-500">%</span>
					</div>
				</div>
			</div>

			{#if finalReport}
				<div 
					transition:slide 
					class="rounded-xl border border-green-500/30 bg-green-500/10 p-6 shadow-xl"
				>
					<h3 class="mb-3 text-sm font-semibold text-green-400 uppercase tracking-wider flex items-center gap-2">
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
						</svg>
						Final Assessment
					</h3>
					<p class="text-sm leading-relaxed text-green-100/80">
						{finalReport}
					</p>
				</div>
			{/if}

		</div>
	</div>
</div>
