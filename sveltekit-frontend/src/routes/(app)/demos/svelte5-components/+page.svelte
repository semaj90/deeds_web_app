<script lang="ts">
/**
 * Svelte 5 Component Demo Page
 * Tests all new Svelte 5 runes-based components
 */
import {
  Dialog,
  Svelte5Avatar,
  Svelte5Badge,
  Svelte5Button,
  Svelte5Card,
  Svelte5Input,
  Svelte5Progress,
  Svelte5RadioGroup,
  Svelte5TabPanel,
  Svelte5Tabs,
} from '$lib/components/ui/svelte5-index';

// Reactive state using Svelte 5 runes
let showDialog = $state(false);
let inputValue = $state('');
let selectValue = $state('');
let activeTab = $state('form');
let radioValue = $state('option1');
let progressValue = $state(65);

// Simulate progress
$effect(() => {
	const interval = setInterval(() => {
		progressValue = (progressValue + 1) % 101;
	}, 100);
	return () => clearInterval(interval);
});

const selectOptions = [
	{ value: 'contract', label: 'Contract' },
	{ value: 'evidence', label: 'Evidence' },
	{ value: 'brief', label: 'Legal Brief' },
	{ value: 'correspondence', label: 'Correspondence' }
];

const radioOptions = [
	{ value: 'option1', label: 'Standard Review', description: 'Basic document analysis' },
	{ value: 'option2', label: 'Deep Analysis', description: 'AI-powered comprehensive review' },
	{ value: 'option3', label: 'Expert Review', description: 'Human expert verification', disabled:true }
];

const tabs = [
	{ id: 'form', label: 'Form', icon: '' },
	{ id: 'feedback', label: 'Feedback', icon: '' },
	{ id: 'data', label: 'Data Display', icon: '' }
];
</script>

<svelte:head>
	<title>Svelte 5 Components Demo</title>
</svelte:head>

<div class="min-h-screen bg-panel text-black p-8">
	<header class="max-w-4xl mx-auto mb-8">
		<h1 class="text-3xl font-bold mb-2">Svelte 5 Components Demo</h1>
		<p class="text-black/60">Testing Svelte 5 runes-based UI components</p>
	</header>

	<main class="max-w-4xl mx-auto space-y-8">
		<!-- Button Variants -->
		<Svelte5Card variant="nes">
			{#snippet header()}
				<h2 class="text-lg font-bold">Buttons</h2>
			{/snippet}

			<div class="flex flex-wrap gap-4">
				<Svelte5Button variant="primary">Primary</Svelte5Button>
				<Svelte5Button variant="secondary">Secondary</Svelte5Button>
				<Svelte5Button variant="success">Success</Svelte5Button>
				<Svelte5Button variant="warning">Warning</Svelte5Button>
				<Svelte5Button variant="error">Error</Svelte5Button>
				<Svelte5Button variant="ghost">Ghost</Svelte5Button>
				<Svelte5Button variant="primary" loading={true}>Loading</Svelte5Button>
			</div>
		</Svelte5Card>

		<!-- Tabs -->
		<Svelte5Card variant="default">
			{#snippet header()}
				<h2 class="text-lg font-bold">Tabs & Content</h2>
			{/snippet}

			<Svelte5Tabs bind:value={activeTab} {tabs} variant="nes">
				<Svelte5TabPanel value="form">
					<div class="space-y-4 p-4 bg-sand/10 rounded-lg">
						<div>
							<label class="block text-sm font-medium text-slate-300 mb-1">Document Name</label>
							<Svelte5Input
								bind:value={inputValue}
								placeholder="Enter document name..."
							/>
						</div>

						<select bind:value={selectValue} class="w-full rounded border border-gray-300 px-3 py-2">
							{#each selectOptions as opt}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>

						<Svelte5RadioGroup
							bind:value={radioValue}
							options={radioOptions}
							label="Review Type"
							variant="cards"
						/>
					</div>
				</Svelte5TabPanel>

				<Svelte5TabPanel value="feedback">
					<div class="space-y-4 p-4">
						<div>
							<span class="block text-sm font-medium text-slate-300 mb-1">Processing</span>
							<Svelte5Progress
								value={progressValue}
								max={100}
								aria-label="Processing"
							/>
						</div>
					</div>
				</Svelte5TabPanel>

				<Svelte5TabPanel value="data">
					<div class="space-y-4 p-4">
						<div class="flex items-center gap-4">
							<Svelte5Avatar
								initials="JD"
								size="xl"
								status="online"
							/>
							<div>
								<h3 class="font-bold">John Doe</h3>
								<p class="text-black/60">Senior Attorney</p>
								<div class="flex gap-2 mt-2">
									<Svelte5Badge variant="success" dot>Active</Svelte5Badge>
									<Svelte5Badge variant="default">Legal</Svelte5Badge>
									<Svelte5Badge variant="warning" removable>Pending Review</Svelte5Badge>
								</div>
							</div>
						</div>

						<div class="flex gap-4 items-center">
							<Svelte5Button variant="secondary" onclick={() => showDialog = true}>
								Open Dialog
							</Svelte5Button>
						</div>
					</div>
				</Svelte5TabPanel>
			</Svelte5Tabs>
		</Svelte5Card>

		<!-- State Display -->
		<Svelte5Card variant="glass">
			{#snippet header()}
				<h2 class="text-lg font-bold">Reactive State</h2>
			{/snippet}

			<div class="grid grid-cols-2 gap-4 text-sm">
				<div>Input: <code class="text-blue-400">{inputValue || '(empty)'}</code></div>
				<div>Select: <code class="text-blue-400">{selectValue || '(none)'}</code></div>
				<div>Radio: <code class="text-blue-400">{radioValue}</code></div>
				<div>Tab: <code class="text-blue-400">{activeTab}</code></div>
				<div>Progress: <code class="text-blue-400">{progressValue}%</code></div>
			</div>
		</Svelte5Card>
	</main>

	<!-- Dialog -->
	<Dialog bind:open={showDialog} title="Confirm Action" description="Are you sure you want to proceed?">
		<p class="text-slate-300 mb-4">
			This action will process the document with the following settings:
		</p>
		<ul class="list-disc pl-6 text-black/60 space-y-1">
			<li>Document: {inputValue || 'Untitled'}</li>
			<li>Type: {selectValue || 'Not selected'}</li>
		</ul>

		<div class="flex gap-3 mt-4 justify-end">
			<Svelte5Button variant="ghost" onclick={() => showDialog = false}>
				Cancel
			</Svelte5Button>
			<Svelte5Button variant="primary" onclick={() => showDialog = false}>
				Confirm
			</Svelte5Button>
		</div>
	</Dialog>
</div>

<style>
	code {
		font-family: 'Fira Code', 'Courier New', monospace;
	}
</style>