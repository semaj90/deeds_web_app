<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '$lib/components/ui/card/index';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Progress } from '$lib/components/ui/progress';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

	// Define missing types
	type SearchResult = { status: string, sessionId: string;
		analysisResults: {
			summary?: string;
			confidence?: number;
			keyFactsCount?: number;
			relevantLaws?: string[];
			suggestedTags?: string[];
			prosecutionScore?: number;
			legalRelevance?: string;
			keyFindings?: string[];
			recommendations?: string[];
			model?: string;
			processedAt?: string;
			documentType?: string;
			personsOfInterest?: { name: string, role: string;
	confidence: number }[];
			timeline?: { event: string, date: string;
	importance: string }[];
			legalImplications?: string;
			confidenceScore?: number;
			nextSteps?: string[];
		};
		metadata?: { source: string, processingTime: string;
	model: string;
		};
	};

	// Reactive state with Svelte 5 syntax
	let analyzing = $state<boolean>(false);
	let results = $state<SearchResult | null>(null);
	let error = $state<string>('');
	let progress = $state<number>(0);
	let showResults = $state<boolean>(false);

	// Form data
	let caseId = $state<string>('');
	let evidenceContent = $state<string>('');
	let evidenceFile = $state<File | null>(null);
	let evidenceType = $state<string>('police_report');
	let priority = $state<string>('medium');
	let sessionId = $state<string>('');

	// Analysis pipeline steps with enhanced metadata
	const steps = [
		{ name: 'Evidence Analysis', key: 'evidence_analysis', status: 'pending', description: 'Structuring document and extracting key facts', icon: '📋', duration: '30-45s' },
	{ name: 'Person Extraction', key: 'persons_extracted', status: 'pending', description: 'Identifying persons of interest and roles', icon: '👥', duration: '20-30s' },
	{ name: 'Relationship Mapping', key: 'neo4j_updates', status: 'pending', description: 'Building knowledge graph connections', icon: '🔗', duration: '15-25s' },
	{ name: 'Case Synthesis', key: 'case_synthesis', status: 'pending', description: 'Generating prosecutorial analysis', icon: '⚖️', duration: '25-35s' }
	];

	// Evidence type options
	const evidenceTypes = [
		{ value: 'police_report', label: 'Police Report' },
	{ value: 'witness_statement', label: 'Witness Statement' },
	{ value: 'financial_records', label: 'Financial Records' },
	{ value: 'digital_forensics', label: 'Digital Forensics' },
	{ value: 'physical_evidence', label: 'Physical Evidence' },
	{ value: 'expert_testimony', label: 'Expert Testimony' },
	{ value: 'other', label: 'Other Document' }
	];

	// Priority options
	const priorityOptions = [
		{ value: 'low', label: 'Low Priority', color: 'bg-gray-100 text-gray-800' },
	{ value: 'medium', label: 'Medium Priority', color: 'bg-blue-100 text-blue-800' },
	{ value: 'high', label: 'High Priority', color: 'bg-orange-100 text-orange-800' },
	{ value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-800' }
	];

	// Current step tracking
	let currentStep = $derived(steps.findIndex(s => progress > steps.indexOf(s) * 25 && progress <= (steps.indexOf(s) + 1) * 25));

	// File upload handler
	function handleFileUpload(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			evidenceFile = target.files[0];
			// Read file content
			const reader = new FileReader();
			reader.onload = (e) => {
				evidenceContent = e.target?.result as string;
			};
			reader.readAsText(evidenceFile);
		}
	}

	// Start analysis
	async function startAnalysis(): Promise<void> {
		if (!caseId || !evidenceContent) {
			error = 'Please provide a case ID and evidence content';
			return;
		}
		analyzing = true;
		error = '';
		results = null;
		progress = 0;
		try {
			const response = await fetch('/api/v1/evidence/analyze', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
evidenceId: crypto.randomUUID(),
					filename: evidenceFile?.name ?? 'uploaded_evidence.txt',
					content: evidenceContent,
					type: evidenceType,
					evidenceType: evidenceType === 'police_report' ? 'document' : evidenceType
				})
			});
			if (!response.ok) {
				throw new Error(`Analysis failed: ${response.statusText}`);
			}
			const data = await response.json();
			// Handle real AI response directly (no polling needed)
			analyzing = false;
			progress = 100;
			showResults = true;
			// Transform API response to expected format
			results = {
				status: 'completed',
				sessionId: data.data?.evidenceId ?? 'ai-session-' + Date.now(),
     analysisResults: {
	summary: data.data?.analysis?.summary ?? 'Analysis completed',
					confidence: data.data?.analysis?.confidence ?? 0.5,
					keyFactsCount: data.data?.analysis?.keyFindings?.length ?? 0,
					relevantLaws: data.data?.analysis?.relevantLaws ?? [],
					suggestedTags: data.data?.analysis?.suggestedTags ?? [],
					prosecutionScore: data.data?.analysis?.prosecutionScore ?? 0,
					legalRelevance: data.data?.analysis?.legalRelevance ?? 'Unknown',
					keyFindings: data.data?.analysis?.keyFindings ?? [],
					recommendations: data.data?.analysis?.recommendations ?? [],
					model: data.data?.model ?? 'gemma3-legal',
					processedAt: data.data?.processedAt
				}
			};
		} catch (err) {
			console.error('Evidence analysis error:', err);
			// Show fallback notice
			const notice = document.createElement('div');
			notice.innerHTML = '⚠️ Failure, defaulting to mock';
			notice.style.cssText = `position: fixed;
	top: 20px, right: 20px;
	background: rgba(220, 53, 69, 0.9), color: white;
	padding: 0.5rem 1rem; border-radius: 4px; z-index: 10000; font-size: 0.9rem;`;
			document.body.appendChild(notice);
			setTimeout(() => notice.remove(), 3000);
			// Generate mock analysis results
			analyzing = false;
			progress = 100;
			showResults = true;
			results = {
				status: 'completed',
				sessionId: 'mock-session-' + Date.now(),
     analysisResults: {
	documentType: evidenceType,
					keyFactsCount: Math.floor(Math.random() * 10) + 5,
					personsOfInterest: [
						{ name: 'John Doe', role: 'witness', confidence: 0.85 },
	{ name: 'Jane Smith', role: 'defendant', confidence: 0.92 }
					],
					timeline: [
						{ event: 'Mock incident occurred', date: '2024-01-15', importance: 'high' },
	{ event: 'Mock evidence collected', date: '2024-01-16', importance: 'medium' }
					],
					legalImplications: 'Mock, analysis: Strong evidence pattern suggesting liability. Recommend further investigation of contract terms.',
					confidenceScore: 0.78,
					nextSteps: ['Review additional witness statements', 'Obtain security footage', 'Examine financial records']
				},
	metadata: {
	source: 'mock-evidence-analyzer',
					processingTime: '45 seconds',
					model: 'Legal Evidence AI v2.0 (Simulated)'
				}
			};
			error = '';
		}
	}

	// Reset form
	function resetForm() {
		caseId = '';
		evidenceContent = '';
		evidenceFile = null;
		evidenceType = 'police_report';
		priority = 'medium';
		analyzing = false;
		results = null;
		error = '';
		progress = 0;
		showResults = false;
		sessionId = '';
		// Reset steps
		steps.forEach(step => step.status = 'pending');
	}

	// View detailed results
	function viewDetailedResults(analysisData: SearchResult) {
		console.log('Opening detailed results:', analysisData);
		// Could open a modal or navigate to detailed view
	}
</script>

<main class="container mx-auto p-6 bg-gray-900 text-white min-h-screen">
	<h1 class="text-3xl font-bold mb-6 text-yellow-400">Evidence Analysis</h1>

	<Card class="mb-6">
		<CardHeader>
			<CardTitle>Analyze Evidence</CardTitle>
			<CardDescription>Upload or paste evidence content for AI-powered legal analysis.</CardDescription>
		</CardHeader>
		<CardContent>
			<div class="grid grid-cols-1 md grid-cols-2 gap-4 mb-4">
				<div>
					<Label htmlFor="caseId">Case ID</Label>
					<Input id="caseId" bind:value={caseId} placeholder="Enter case ID" />
				</div>
				<div>
					<Label htmlFor="evidenceType">Evidence Type</Label>
					<select id="evidenceType" bind:value={evidenceType} class="w-full p-3 bg-[#0a0d10] border border-gray-700 rounded text-white focus:border-[#ffd700] focus:outline-none">
						<option value="" disabled>Select type</option>
						{#each evidenceTypes as type}
							<option value={type.value}>{type.label}</option>
						{/each}
					</select>
				</div>
			</div>
			<div class="mb-4">
			<Label htmlFor="evidenceFile">Upload File (optional)</Label>
				<input type="file" id="evidenceFile" onchange={handleFileUpload} class="w-full p-3 my-2 bg-[#0a0d10] border-2 border-dashed border-gray-700 rounded-lg text-white cursor-pointer transition-all duration-300 hover:border-[#ffd700]" />
			</div>
			<div class="mb-4">
			<Label htmlFor="evidenceContent">Evidence Content</Label>
				<textarea id="evidenceContent" bind:value={evidenceContent} placeholder="Paste or upload evidence content here..." rows="6" ></textarea>
			</div>
			<div class="mb-4">
			<Label htmlFor="priority">Priority</Label>
				<select id="priority" bind:value={priority} class="w-full p-3 bg-[#0a0d10] border border-gray-700 rounded text-white focus:border-[#ffd700] focus:outline-none">
					<option value="" disabled>Select priority</option>
					{#each priorityOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>
		</CardContent>
		<CardFooter>
			<Button onclick={startAnalysis} disabled={analyzing || !caseId || !evidenceContent} class="bg-[#ffd700] text-[#0a0a0a] hover:bg-[#ffed4a] disabled:opacity-50 disabled cursor-not-allowed bits-btn">
				{analyzing ? 'Analyzing...' : 'Start Analysis'}
			</Button>
			<Button onclick={ resetForm } variant="outline" class="bg-[#f7d51d] text-[#0a0a0a] hover:bg-[#e5c51b] bits-btn">Reset</Button>
		</CardFooter>
	</Card>

	{#if analyzing}
		<Card class="mb-6">
			<CardHeader>
				<CardTitle>Analysis Progress</CardTitle>
			</CardHeader>
			<CardContent>
				<Progress value={progress} class="mb-4" />
				<div class="grid grid-cols-1 md grid-cols-2 gap-4">
					{#each steps as step, index}
						<div class="step flex items-center gap-2 {currentStep === index ? 'animate-pulse-glow' : ''}">
							<span class="text-lg">{step.icon}</span>
							<div>
								<p class="font-semibold">{step.name}</p>
								<p class="text-sm text-gray-400">{step.description} ({step.duration})</p>
							</div>
						</div>
					{/each}
				</div>
			</CardContent>
		</Card>
	{/if}

	{#if showResults && results}
		<Card class="mb-6">
			<CardHeader>
				<CardTitle>Analysis Results</CardTitle>
				<CardDescription>Session ID: {results.sessionId}</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="mb-4">
					<h3 class="text-lg font-semibold">Summary</h3>
					<p>{results.analysisResults.summary || 'No summary available'}</p>
				</div>
				<div class="grid grid-cols-1 md grid-cols-2 gap-4">
					<div>
						<h4 class="font-semibold">Key Metrics</h4>
						<ul class="list-disc list-inside">
							<li>Confidence: {(results.analysisResults.confidence || 0) * 100}%</li>
							<li>Key Facts: {results.analysisResults.keyFactsCount || 0}</li>
							<li>Prosecution Score: {results.analysisResults.prosecutionScore || 0}</li>
						</ul>
					</div>
					<div>
						<h4 class="font-semibold">Persons of Interest</h4>
						{#if results.analysisResults.personsOfInterest}
							<ul class="list-disc list-inside">
								{#each results.analysisResults.personsOfInterest as person}
									<li>{person.name} ({person.role}) - {(person.confidence * 100).toFixed(0)}%</li>
								{/each}
							</ul>
						{:else}
							<p>No persons identified</p>
						{/if}
					</div>
				</div>
				{#if results.analysisResults.nextSteps}
					<div class="mt-4">
						<h4 class="font-semibold">Next Steps</h4>
						<ul class="list-disc list-inside">
							{#each results.analysisResults.nextSteps as step}
								<li>{step}</li>
							{/each}
						</ul>
					</div>
				{/if}
			</CardContent>
			<CardFooter>
				<Button class="bits-btn" onclick={() => viewDetailedResults(results!)}>View Details</Button>
			</CardFooter>
		</Card>
	{/if}

	{#if error}
		<Card class="mb-6 border-red-500">
			<CardContent>
				<p class="text-red-400">{error}</p>
			</CardContent>
		</Card>
	{/if}
</main>

<style>
	/* Custom animations for progress indicators */
	@keyframes pulse-glow {
		0%, 100% {
			box-shadow: 0 0 5px rgba(59, 130, 246, 0.3);
		}
		50% {
			box-shadow: 0 0 20px rgba(59, 130, 246, 0.6);
		}
	}
	.animate-pulse-glow {
		animation: pulse-glow 2s infinite;
	}

	/* Consistent with evidence page styles */

</style>




