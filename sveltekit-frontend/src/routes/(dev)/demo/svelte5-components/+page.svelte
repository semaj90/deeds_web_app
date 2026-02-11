<script lang="ts">
/**
 * Svelte 5 Component Demo Page
 * Tests all new Svelte 5 runes-based components
 */
import {
  Dialog,
  Svelte5Alert,
  Svelte5Avatar,
  Svelte5Badge,
  Svelte5Button,
  Svelte5Card,
  Svelte5Checkbox,
  Svelte5DropdownMenu,
  Svelte5Input,
  Svelte5Progress,
  Svelte5RadioGroup,
  Svelte5Select,
  Svelte5Slider,
  Svelte5Switch,
  Svelte5TabPanel,
  Svelte5Tabs,
  Svelte5Tooltip
} from '$lib/components/ui/svelte5-index';

// Reactive state using Svelte 5 runes
let showDialog = $state(false);
let inputValue = $state('');
let selectValue = $state('');
let checkboxChecked = $state(false);
let switchEnabled = $state(true);
let activeTab = $state('form');
let sliderValue = $state(50);
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

const menuItems = [
	{ id: 'edit', label: 'Edit', icon: '✏️', shortcut: '⌘E' },
	{ id: 'duplicate', label: 'Duplicate', icon: '📋', shortcut: '⌘D' },
	{ id: 'separator', separator: true },
	{ id: 'delete', label: 'Delete', icon: '🗑️', danger: true }
];

const tabs = [
	{ id: 'form', label: 'Form', icon: '📝' },
	{ id: 'feedback', label: 'Feedback', icon: '💬' },
	{ id: 'data', label: 'Data Display', icon: '📊' }
];
</script>

<svelte:head>
	<title>Svelte 5 Components Demo</title>
</svelte:head>

<div class="min-h-screen bg-slate-900 text-white p-8">
	<header class="max-w-4xl mx-auto mb-8">
		<h1 class="text-3xl font-bold mb-2">🎮 Svelte 5 Components Demo</h1>
		<p class="text-slate-400">Testing all new Svelte 5 runes-based UI components</p>
	</header>

	<main class="max-w-4xl mx-auto space-y-8">
		<!-- Button Variants -->
		<Svelte5Card variant="nes">
			{#snippet header()}
				<h2 class="text-lg font-bold">🔘 Buttons</h2>
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
				<h2 class="text-lg font-bold">📑 Tabs & Content</h2>
			{/snippet}

			<Svelte5Tabs bind:value={activeTab} {tabs} variant="nes">
				<Svelte5TabPanel value="form">
					<div class="space-y-4 p-4 bg-slate-800 rounded-lg">
						<div>
							<label class="block text-sm font-medium text-slate-300 mb-1">Document Name</label>
							<Svelte5Input
								bind:value={inputValue}
								placeholder="Enter document name..."
							/>
						</div>

						<Svelte5Select
							bind:value={selectValue}
							options={selectOptions}
							placeholder="Select document type..."
						/>

						<div class="flex items-center gap-6">
							<Svelte5Checkbox bind:checked={checkboxChecked} class="peer h-4 w-4" name="ai-analysis">
								Enable AI Analysis
							</Svelte5Checkbox>

							<Svelte5Switch bind:checked={switchEnabled} variant="nes">
								Auto-save
							</Svelte5Switch>
						</div>

						<Svelte5Slider
							bind:value={sliderValue}
							min={ 0 }
							max={ 100 }
							label="Confidence Threshold"
							showValue
							color="blue"
						/>

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
						<Svelte5Alert variant="success" title="Success!" dismissible>
							Document uploaded successfully. AI analysis in progress.
						</Svelte5Alert>

						<Svelte5Alert variant="warning" title="Warning">
							Large file detected. Processing may take longer.
						</Svelte5Alert>

						<Svelte5Alert variant="error" title="Error" dismissible>
							Failed to connect to server. Please try again.
						</Svelte5Alert>

						<Svelte5Alert variant="info">
							Tip: You can drag and drop files directly into the upload area.
						</Svelte5Alert>

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
								<p class="text-slate-400">Senior Attorney</p>
								<div class="flex gap-2 mt-2">
									<Svelte5Badge variant="success" dot>Active</Svelte5Badge>
									<Svelte5Badge variant="default">Legal</Svelte5Badge>
									<Svelte5Badge variant="warning" removable>Pending Review</Svelte5Badge>
								</div>
							</div>
						</div>

						<div class="flex gap-4 items-center">
							<Svelte5Tooltip content="Click for more options" side="top">
								<Svelte5Button variant="secondary" onclick={() => showDialog = true}>
									Open Dialog
								</Svelte5Button>
							</Svelte5Tooltip>

							<Svelte5DropdownMenu>
								<Svelte5Button variant="ghost">
									Actions ▼
								</Svelte5Button>
							</Svelte5DropdownMenu>
						</div>
					</div>
				</Svelte5TabPanel>
			</Svelte5Tabs>
		</Svelte5Card>

		<!-- State Display -->
		<Svelte5Card variant="glass">
			{#snippet header()}
				<h2 class="text-lg font-bold">📊 Reactive State</h2>
			{/snippet}

			<div class="grid grid-cols-2 gap-4 text-sm">
				<div>Input: <code class="text-blue-400">{inputValue || '(empty)'}</code></div>
				<div>Select: <code class="text-blue-400">{selectValue || '(none)'}</code></div>
				<div>Checkbox: <code class="text-blue-400">{checkboxChecked}</code></div>
				<div>Switch: <code class="text-blue-400">{switchEnabled}</code></div>
				<div>Slider: <code class="text-blue-400">{sliderValue}</code></div>
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
		<ul class="list-disc pl-6 text-slate-400 space-y-1">
			<li>Document: {inputValue || 'Untitled'}</li>
			<li>Type: {selectValue || 'Not selected'}</li>
			<li>AI Analysis: {checkboxChecked ? 'Enabled' : 'Disabled'}</li>
			<li>Confidence: {sliderValue}%</li>
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
	:global(body) {
		font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	code {
		font-family: 'Fira Code', 'Courier New', monospace;
	}
</style>



