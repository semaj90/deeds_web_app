<script lang="ts">
	/**
	 * AISummaryReader — AI-powered document summary with voice reading
	 * Rewritten Session 63: Svelte 5 runes (removed readable store + XState interpret)
	 */
	import Icon from '$lib/components/ui/Icon.svelte';
	import { fade, fly } from 'svelte/transition';

	export type DocumentType = 'evidence' | 'report' | 'contract' | 'case_law' | 'general';

	interface SummarySection {
		title: string;
		content: string;
		importance: 'critical' | 'high' | 'medium' | 'low';
		wordCount?: number;
		entities?: Array<{ text: string; type: string; confidence?: number }>;
	}

	interface AnalysisResult {
		type: string;
		score: number;
		explanation: string;
		recommendations?: string[];
	}

	interface SynthesisData {
		mainThemes: string[];
		supportingEvidence: string[];
		gaps: string[];
		contradictions: string[];
		legalImplications: string[];
		nextSteps: string[];
	}

	let {
		documentId = undefined,
		caseId = undefined,
		initialContent = '',
		documentType = 'evidence' as DocumentType | undefined,
		compact = false
	}: {
		documentId?: string | undefined;
		caseId?: string | undefined;
		initialContent?: string;
		documentType?: DocumentType | undefined;
		compact?: boolean;
	} = $props();

	// State (replaces XState machine + readable store)
	type MachineState = 'idle' | 'loading' | 'generating' | 'analyzing' | 'synthesizing' | 'ready';
	let machineState = $state<MachineState>('idle');
	let sections = $state<SummarySection[]>([]);
	let currentSectionIndex = $state(0);
	let isPlaying = $state(false);
	let isReadingActive = $state(false);
	let progress = $state(0);
	let error = $state<string | null>(null);
	let summary = $state<string | null>(null);
	let keyInsights = $state<string[]>([]);
	let confidence = $state(0);
	let voiceEnabled = $state(false);
	let estimatedReadTime = $state(0);
	let docType = $state<string | null>(null);
	let analysisResults = $state<AnalysisResult[]>([]);
	let synthesisData = $state<SynthesisData | null>(null);

	let isLoading = $derived(
		machineState === 'loading' ||
			machineState === 'generating' ||
			machineState === 'analyzing' ||
			machineState === 'synthesizing'
	);
	let isReady = $derived(machineState === 'ready');
	let currentSection = $derived(sections[currentSectionIndex] ?? null);

	// Voice synthesis
	let speechSynthesis: SpeechSynthesis | null = null;
	let currentUtterance: SpeechSynthesisUtterance | null = null;

	$effect(() => {
		if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
			speechSynthesis = window.speechSynthesis as SpeechSynthesis;
		}
	});

	// Auto-load on mount
	$effect(() => {
		if (initialContent && documentType) {
			generateSummary(initialContent, documentType);
		} else if (documentId) {
			loadDocument(documentId, caseId);
		}
	});

	async function loadDocument(docId: string, csId?: string) {
		machineState = 'loading';
		error = null;
		try {
			const params = new URLSearchParams({ documentId: docId });
			if (csId) params.set('caseId', csId);
			const res = await fetch(`/api/summarize?${params}`, { credentials: 'include' });
			if (!res.ok) throw new Error('Failed to load document');
			const data = await res.json();
			sections = data.sections ?? [];
			summary = data.summary ?? null;
			keyInsights = data.keyInsights ?? [];
			confidence = data.confidence ?? 0;
			estimatedReadTime = data.estimatedReadTime ?? 0;
			docType = data.documentType ?? null;
			machineState = 'ready';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load document';
			machineState = 'idle';
		}
	}

	async function generateSummary(content: string, type: string) {
		machineState = 'generating';
		error = null;
		try {
			const res = await fetch('/api/summarize', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content, documentType: type }),
				credentials: 'include'
			});
			if (!res.ok) throw new Error('Failed to generate summary');
			const data = await res.json();
			sections = data.sections ?? [];
			summary = data.summary ?? null;
			keyInsights = data.keyInsights ?? [];
			confidence = data.confidence ?? 0;
			estimatedReadTime = data.estimatedReadTime ?? 0;
			docType = type;
			machineState = 'ready';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to generate summary';
			machineState = 'idle';
		}
	}

	function toggleReading() {
		if (isPlaying) {
			isPlaying = false;
			if (currentUtterance && speechSynthesis) {
				speechSynthesis.pause();
			}
		} else {
			isPlaying = true;
			isReadingActive = true;
			if (voiceEnabled && currentSection) {
				speakSection(currentSection);
			}
		}
	}

	function stopReading() {
		isPlaying = false;
		isReadingActive = false;
		progress = 0;
		if (speechSynthesis) {
			speechSynthesis.cancel();
		}
	}

	function nextSection() {
		if (currentSectionIndex < sections.length - 1) {
			currentSectionIndex++;
			progress = ((currentSectionIndex + 1) / sections.length) * 100;
			if (voiceEnabled && isPlaying) {
				setTimeout(() => {
					if (sections[currentSectionIndex]) speakSection(sections[currentSectionIndex]);
				}, 100);
			}
		}
	}

	function previousSection() {
		if (currentSectionIndex > 0) {
			currentSectionIndex--;
			progress = ((currentSectionIndex + 1) / sections.length) * 100;
			if (voiceEnabled && isPlaying) {
				setTimeout(() => {
					if (sections[currentSectionIndex]) speakSection(sections[currentSectionIndex]);
				}, 100);
			}
		}
	}

	function jumpToSection(index: number) {
		currentSectionIndex = index;
		progress = ((index + 1) / sections.length) * 100;
		if (voiceEnabled && isPlaying) {
			setTimeout(() => {
				if (sections[index]) speakSection(sections[index]);
			}, 100);
		}
	}

	function speakSection(section: SummarySection) {
		if (!speechSynthesis || !voiceEnabled || !section) return;
		speechSynthesis.cancel();
		currentUtterance = new SpeechSynthesisUtterance(section.content);
		currentUtterance.rate = 0.9;
		currentUtterance.pitch = 1.0;
		currentUtterance.volume = 0.8;
		currentUtterance.onend = () => {
			if (currentSectionIndex < sections.length - 1) {
				nextSection();
			} else {
				stopReading();
			}
		};
		speechSynthesis.speak(currentUtterance);
	}

	async function analyzeDocument() {
		machineState = 'analyzing';
		try {
			const res = await fetch('/api/summarize/analyze', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ documentId, sections }),
				credentials: 'include'
			});
			if (res.ok) {
				const data = await res.json();
				analysisResults = data.results ?? [];
			}
			machineState = 'ready';
		} catch {
			machineState = 'ready';
		}
	}

	async function synthesizeInsights() {
		machineState = 'synthesizing';
		try {
			const res = await fetch('/api/summarize/synthesize', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ documentId, sections, keyInsights }),
				credentials: 'include'
			});
			if (res.ok) {
				const data = await res.json();
				synthesisData = data.synthesis ?? null;
			}
			machineState = 'ready';
		} catch {
			machineState = 'ready';
		}
	}

	function toggleVoice() {
		voiceEnabled = !voiceEnabled;
	}

	function retry() {
		if (initialContent && documentType) {
			generateSummary(initialContent, documentType);
		} else if (documentId) {
			loadDocument(documentId, caseId);
		}
	}

	function getImportanceColor(importance: string) {
		switch (importance) {
			case 'critical':
				return 'text-danger border-danger/20 bg-danger/5';
			case 'high':
				return 'text-warning border-warning/20 bg-warning/5';
			case 'medium':
				return 'text-info border-info/20 bg-info/5';
			case 'low':
			default:
				return 'text-sand/60 border-sand/20 bg-sand/5';
		}
	}

	function getAnalysisScoreColor(score: number) {
		if (score >= 0.9) return 'text-accent bg-accent/10';
		if (score >= 0.7) return 'text-warning bg-warning/10';
		return 'text-danger bg-danger/10';
	}
</script>

<div class="ai-summary-reader" class:compact>
	<div class="bg-white border border-sand/20 rounded-lg">
		<!-- Header -->
		<div class="flex items-center justify-between p-4 border-b">
			<div class="flex items-center gap-3">
				<div class="p-2 bg-info/10 rounded-lg">
					<Icon name="brain" class="w-5 h-5 text-info" />
				</div>
				<div>
					<h3 class="text-lg font-semibold">AI Summary Reader</h3>
					<p class="text-sm text-sand/60">
						{#if documentId}
							Document ID: {documentId}
						{:else if docType}
							{docType.charAt(0).toUpperCase() + docType.slice(1)} Analysis
						{/if}
					</p>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<button
					onclick={toggleVoice}
					class="p-2 rounded-md hover:bg-sand/10 {voiceEnabled ? 'text-info' : 'text-sand/40'}"
					title={voiceEnabled ? 'Disable voice' : 'Enable voice'}
				>
					<Icon name="settings" class="w-4 h-4" />
				</button>
				{#if confidence > 0}
					<div class="px-3 py-1 bg-accent/10 text-accent rounded-full text-sm">
						{Math.round(confidence * 100)}% confidence
					</div>
				{/if}
			</div>
		</div>

		<!-- Content -->
		<div class="p-4">
			{#if isLoading}
				<div class="flex items-center justify-center py-12">
					<div class="flex flex-col items-center gap-4">
						<div
							class="w-8 h-8 border-4 border-info/20 border-t-info rounded-full animate-spin"
						></div>
						<p class="text-sand/60">
							{#if machineState === 'loading'}
								Loading document...
							{:else if machineState === 'generating'}
								Generating AI summary...
							{:else if machineState === 'analyzing'}
								Analyzing document...
							{:else if machineState === 'synthesizing'}
								Synthesizing insights...
							{/if}
						</p>
					</div>
				</div>
			{:else if error}
				<div class="bg-danger/5 border border-danger/20 rounded-lg p-4" in:fade>
					<div class="flex items-center gap-3">
						<div class="text-danger text-xl">!</div>
						<div>
							<h4 class="font-medium text-danger">Error</h4>
							<p class="text-danger/80 text-sm">{error}</p>
						</div>
					</div>
					<button
						onclick={retry}
						class="mt-3 px-4 py-2 bg-danger text-white rounded-md hover:bg-danger/80 transition-colors text-sm"
					>
						Retry
					</button>
				</div>
			{:else if isReady}
				<div class="space-y-6">
					<!-- Executive Summary -->
					{#if summary}
						<div class="bg-info/5 border border-info/20 rounded-lg p-4" in:fly={{ y: 20, duration: 300 }}>
							<h4 class="font-medium text-info mb-2">Executive Summary</h4>
							<p class="text-sand/80">{summary}</p>
						</div>
					{/if}

					<!-- Key Insights -->
					{#if keyInsights.length > 0}
						<div
							class="bg-accent/5 border border-accent/20 rounded-lg p-4"
							in:fly={{ y: 20, duration: 300, delay: 100 }}
						>
							<h4 class="font-medium text-accent mb-2">Key Insights</h4>
							<ul class="space-y-2">
								{#each keyInsights as insight}
									<li class="flex items-start gap-2">
										<Icon name="zap" class="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
										<span class="text-sand/80">{insight}</span>
									</li>
								{/each}
							</ul>
						</div>
					{/if}

					<!-- Reading Controls -->
					<div class="flex items-center justify-between bg-sand/5 rounded-lg p-3">
						<div class="flex items-center gap-2">
							<button
								onclick={toggleReading}
								class="flex items-center gap-2 px-4 py-2 bg-info text-white rounded-md hover:bg-info/80"
								disabled={!currentSection}
							>
								{#if isPlaying}
									<Icon name="pause" class="w-4 h-4" /> Pause
								{:else}
									<Icon name="play" class="w-4 h-4" />
									{isReadingActive ? 'Resume' : 'Start Reading'}
								{/if}
							</button>
							<button
								onclick={stopReading}
								class="p-2 text-sand/60 hover:text-sand hover:bg-sand/10 rounded-md"
								disabled={!isReadingActive}
							>
								<Icon name="square" class="w-4 h-4" />
							</button>
							<div class="flex items-center">
								<button
									onclick={previousSection}
									class="p-2 text-sand/60 hover:text-sand hover:bg-sand/10 rounded-md"
									disabled={currentSectionIndex === 0}
								>
									<Icon name="skip-back" class="w-4 h-4" />
								</button>
								<button
									onclick={nextSection}
									class="p-2 text-sand/60 hover:text-sand hover:bg-sand/10 rounded-md"
									disabled={currentSectionIndex >= sections.length - 1}
								>
									<Icon name="skip-forward" class="w-4 h-4" />
								</button>
							</div>
						</div>
						<div class="text-sm text-sand/60">
							Section {currentSectionIndex + 1} of {sections.length}
							{#if estimatedReadTime > 0}
								&bull; ~{estimatedReadTime} min read
							{/if}
						</div>
					</div>

					<!-- Progress Bar -->
					{#if isReadingActive}
						<div class="bg-sand/10 rounded-full h-2" in:fade>
							<div
								class="bg-info h-2 rounded-full transition-all"
								style="width: {progress}%"
							></div>
						</div>
					{/if}

					<!-- Section Navigation Grid -->
					{#if sections.length > 0}
						<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
							{#each sections as section, index}
								<button
									onclick={() => jumpToSection(index)}
									class="text-left p-3 border rounded-lg transition-all hover:shadow-md
										{index === currentSectionIndex
										? 'border-info bg-info/5 shadow-sm'
										: 'border-sand/20'}"
								>
									<div class="flex items-center justify-between mb-1">
										<span class="text-sm font-medium">{section.title}</span>
										<span
											class="text-xs px-2 py-0.5 rounded-full {getImportanceColor(
												section.importance
											)}"
										>
											{section.importance}
										</span>
									</div>
									<p class="text-xs text-sand/60 line-clamp-2">
										{section.content?.substring(0, 100) ?? ''}...
									</p>
									<div class="text-xs text-sand/40 mt-1">
										{section.wordCount ?? 0} words
									</div>
								</button>
							{/each}
						</div>
					{/if}

					<!-- Current Section Content -->
					{#if currentSection}
						<div
							class="bg-white border border-sand/20 rounded-lg p-5"
							in:fly={{ y: 20, duration: 300 }}
						>
							<div class="flex items-center justify-between mb-4">
								<h4 class="text-xl font-semibold">{currentSection.title}</h4>
								<span
									class="text-sm px-3 py-1 rounded-full {getImportanceColor(
										currentSection.importance
									)}"
								>
									{currentSection.importance?.charAt(0).toUpperCase() +
										currentSection.importance?.slice(1)} Priority
								</span>
							</div>
							<div class="prose prose-gray">
								<p class="text-sand/80">{currentSection.content}</p>
							</div>

							<!-- Entities -->
							{#if (currentSection.entities ?? []).length > 0}
								<div class="mt-6 pt-4 border-t border-sand/10">
									<h5 class="text-sm font-medium text-sand mb-2">Key Entities</h5>
									<div class="flex flex-wrap gap-2">
										{#each currentSection.entities ?? [] as entity}
											<span
												class="px-2 py-1 text-xs rounded-md
													{entity.type === 'legal_term'
													? 'bg-info/10 text-info'
													: entity.type === 'person'
														? 'bg-accent/10 text-accent'
														: entity.type === 'date'
															? 'bg-info/10 text-info'
															: entity.type === 'organization'
																? 'bg-warning/10 text-warning'
																: 'bg-sand/10 text-sand'}"
												title="Confidence: {Math.round((entity.confidence ?? 0) * 100)}%"
											>
												{entity.text}
											</span>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Analysis Actions -->
					<div class="flex flex-wrap gap-3">
						<button
							onclick={analyzeDocument}
							class="flex items-center gap-2 px-4 py-2 border border-sand/20 rounded-md hover:bg-sand/5"
							disabled={isLoading}
						>
							<Icon name="file-text" class="w-4 h-4" /> Analyze Document
						</button>
						<button
							onclick={synthesizeInsights}
							class="flex items-center gap-2 px-4 py-2 border border-sand/20 rounded-md hover:bg-sand/5"
							disabled={isLoading}
						>
							<Icon name="brain" class="w-4 h-4" /> Synthesize Insights
						</button>
					</div>

					<!-- Analysis Results -->
					{#if analysisResults.length > 0}
						<div class="space-y-4" in:fly={{ y: 20, duration: 300 }}>
							<h4 class="text-lg font-semibold">Analysis Results</h4>
							{#each analysisResults as result}
								<div class="border border-sand/20 rounded-lg p-4">
									<div class="flex items-center justify-between mb-2">
										<h5 class="font-medium text-sand">
											{result.type.replace('_', ' ')}
										</h5>
										<span
											class="px-2 py-1 rounded-full text-sm font-medium {getAnalysisScoreColor(
												result.score
											)}"
										>
											{Math.round(result.score * 100)}%
										</span>
									</div>
									<p class="text-sand/80 text-sm">{result.explanation}</p>
									{#if (result.recommendations ?? []).length > 0}
										<div class="mt-3">
											<h6 class="text-sm font-medium text-sand">Recommendations:</h6>
											<ul class="text-sm text-sand/60 list-disc list-inside mt-1">
												{#each result.recommendations ?? [] as rec}
													<li>{rec}</li>
												{/each}
											</ul>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}

					<!-- Synthesis Results -->
					{#if synthesisData}
						<div class="space-y-6" in:fly={{ y: 20, duration: 300 }}>
							<h4 class="text-lg font-semibold text-sand">
								Synthesis & Strategic Analysis
							</h4>
							<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div class="space-y-4">
									<div class="bg-info/5 border border-info/20 rounded-lg p-4" in:fade>
										<h5 class="font-medium text-info mb-2">Main Themes</h5>
										<ul class="space-y-2">
											{#each synthesisData.mainThemes as theme}
												<li class="flex items-start gap-2">
													<div class="w-2 h-2 bg-info rounded-full mt-2 flex-shrink-0"></div>
													<span class="text-sand/80">{theme}</span>
												</li>
											{/each}
										</ul>
									</div>
									<div class="bg-accent/5 border border-accent/20 rounded-lg p-4" in:fade>
										<h5 class="font-medium text-accent mb-2">Supporting Evidence</h5>
										<ul class="space-y-2">
											{#each synthesisData.supportingEvidence as ev}
												<li class="flex items-start gap-2">
													<div
														class="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"
													></div>
													<span class="text-sand/80">{ev}</span>
												</li>
											{/each}
										</ul>
									</div>
								</div>
								<div class="space-y-4">
									<div class="bg-warning/5 border border-warning/20 rounded-lg p-4" in:fade>
										<h5 class="font-medium text-warning mb-3">
											Gaps & Contradictions
										</h5>
										{#if synthesisData.gaps.length > 0}
											<div class="mb-3">
												<h6 class="text-sm font-medium">Information Gaps:</h6>
												<ul class="mt-1">
													{#each synthesisData.gaps as gap}
														<li class="text-sm text-sand/60">&bull; {gap}</li>
													{/each}
												</ul>
											</div>
										{/if}
										{#if synthesisData.contradictions.length > 0}
											<div>
												<h6 class="text-sm font-medium">Contradictions:</h6>
												<ul class="mt-1">
													{#each synthesisData.contradictions as c}
														<li class="text-sm text-sand/60">&bull; {c}</li>
													{/each}
												</ul>
											</div>
										{/if}
									</div>
									<div class="bg-info/5 border border-info/20 rounded-lg p-4" in:fade>
										<h5 class="font-medium text-info mb-2">Legal Implications</h5>
										<ul class="space-y-2">
											{#each synthesisData.legalImplications as imp}
												<li class="flex items-start gap-2">
													<div
														class="w-2 h-2 bg-info/60 rounded-full mt-2 flex-shrink-0"
													></div>
													<span class="text-sand/80">{imp}</span>
												</li>
											{/each}
										</ul>
									</div>
								</div>
							</div>
							<!-- Next Steps -->
							<div class="bg-sand/5 border border-sand/20 rounded-lg p-4">
								<h5 class="font-medium text-sand mb-3">Next Steps</h5>
								<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
									{#each synthesisData.nextSteps as step, index}
										<div class="flex items-start gap-3">
											<span
												class="flex items-center justify-center w-6 h-6 bg-sand/20 text-sand text-sm rounded-full flex-shrink-0"
											>
												{index + 1}
											</span>
											<span class="text-sand/80">{step}</span>
										</div>
									{/each}
								</div>
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<!-- No Document Loaded -->
				<div class="text-center py-12">
					<div
						class="w-16 h-16 mx-auto bg-sand/10 rounded-lg flex items-center justify-center mb-4"
					>
						<Icon name="file-text" class="w-8 h-8 text-sand/40" />
					</div>
					<h4 class="text-lg font-medium text-sand">No Document Loaded</h4>
					<p class="text-sand/60">
						Load a document or provide content to generate an AI summary.
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.ai-summary-reader {
		width: 100%;
		max-width: 72rem;
		margin-left: auto;
		margin-right: auto;
	}
	.ai-summary-reader.compact {
		max-width: 32rem;
	}
	.line-clamp-2 {
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.prose p {
		margin-bottom: 1rem;
	}
	.prose p:last-child {
		margin-bottom: 0;
	}
</style>
