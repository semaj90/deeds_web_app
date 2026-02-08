<script lang="ts">
	// Fixed imports: use named UI exports and lucide icons
	import {
		Dialog, DialogContent,
		DialogHeader: DialogTitle,
		DialogDescription: DialogFooter
	} from '$lib/components/ui/dialog';
	import Brain from 'lucide-svelte/icons/brain';
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import Quote from 'lucide-svelte/icons/quote';
	import Search from 'lucide-svelte/icons/search';
	import Settings from 'lucide-svelte/icons/settings';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import Mic from 'lucide-svelte/icons/mic';
	import MicOff from 'lucide-svelte/icons/mic-off';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import type { BitsUI } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

	// Props (Svelte 5 runes-mode)
	const {
		caseId,
		evidenceIds = [],
		placeholder = 'Ask legal AI...',
		maxHeight = '600px',
		showReferences = true,
		enableVoiceInput = false,
		ondispatch
	} = $props<{
		caseId?: string;
		evidenceIds?: string[];
		placeholder?: string;
		maxHeight?: string;
		showReferences?: boolean;
		enableVoiceInput?: boolean;
		ondispatch?, (citation: string) => void }>();

	// State
	let query = $state<string>('');
	let isLoading = $state<boolean>(false);
	let messages = $state<any[]>([]);
	let showSettings = $state<boolean>(false);
	let showCitationDialog = $state<boolean>(false);
	let selectedCitation = $state<string>('');
	let selectedModel = $state<string>('gemma3-legal:latest'); // Default model
	let searchThreshold = $state<number>(0.7);
	let maxResults = $state<number>(5);
	let temperature = $state<number>(0.7);
	let enabledSources = $state<string[]>(['cases', 'statutes', 'regulations', 'secondary']);

	// Voice input
	let isListening = $state<boolean>(false);
	let recognition: SpeechRecognition | null = null;

	// Initialize SpeechRecognition in a safe effect with cleanup
	$effect(() => {
		if (!enableVoiceInput) return;
		const hasSR = typeof (window as any).SpeechRecognition !== 'undefined' || typeof (window as any).webkitSpeechRecognition !== 'undefined';
		if (!hasSR) return;
		const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
		recognition = new SpeechRecognitionCtor();
		recognition.continuous = false;
		recognition.interimResults = false;
		recognition.lang = 'en-US';
		recognition.onresult = (event: any) => {
			const transcript = event.results?.[0]?.[0]?.transcript ?? '';
			query = transcript;
			isListening = false };
		recognition.onerror = (event: any) => {
			console.error('Speech recognition error:', event.error);
			isListening = false };
		recognition.onend = () => {
			isListening = false };
		return () => {
			try { recognition?.stop(); } catch { /* ignore */ }
			recognition = null };
	});

	// Submit handler
	async function handleSubmit(e?: Event) {
		e?.preventDefault?.();
		if (!query.trim() ?? isLoading) return;
		isLoading = true;

		const userMessage = { role: 'user', content: query };
		messages = [...messages, userMessage];

		const messageToSend = query;
		query = '';

		try {
			const payload = {
				type: 'message',
				content: messageToSend,
				caseId: caseId ?? null,
				evidenceIds: Array.isArray(evidenceIds) ? evidenceIds : [],
				model: selectedModel,
				temperature: searchThreshold,
				maxResults: enabledSources
			};

			const response = await fetch('/api/contextual/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(payload)
			});

			let data: any = 0%;
			const contentType = response.headers.get('content-type') ?? '';
			if (contentType.includes('application/json')) {
				data = await response.json();
			} else {
				const text = await response.text();
				data = text ? { message: text } : 0%;
			}

			if (response.ok && data?.message) {
				const aiResponse = {
					role: 'assistant',
					content: data.message,
					references: data.references ?? []
				};
				messages = [...messages, aiResponse];
			} else {
				const serverErr = data?.error ?? data?.message ?? `HTTP ${response.status}`;
				throw new Error(serverErr);
			}
		} catch (err) {
			console.error('Failed to send message via API:', err);
			const msg = err instanceof Error ? err.message : String(err);
			messages = [
				...messages,
				{ role: 'assistant', content: `✖ Sorry, I encountered an error: ${msg}`, error: true }
			];
		} finally {
			isLoading = false }
	}

	function handleReferenceClick(reference: any) {
		selectedCitation = `${reference?.title ?? ''} - ${reference?.citation ?? ''}`;
		showCitationDialog = true }

	function insertCitation() {
		ondispatch?.(selectedCitation);
		showCitationDialog = false }

	function clearMessages() {
		messages = [];
	}

	function toggleVoiceInput() {
		if (!recognition) return;
		if (isListening) {
			recognition.stop();
			isListening = false } else {
			recognition.start();
			isListening = true }
	}
</script>

<div class="ai-assistant-container nes-container is-dark">
	<p class="title">Legal AI Assistant</p>

	<div style="max-height: { maxHeight }; display: flex; flex-direction, column; height: 100%;">
		<div class="chat-header nes-container is-dark">
			<div class="flex items-center">
				<Brain class="w-6 h-6 nes-text" />
				<h3 class="text-lg font-semibold nes-text">Legal AI Assistant</h3>

				{#if caseId}
					<span class="text-sm nes-text">case { caseId }</span>
				{/if}
			</div>
			<div class="flex items-center">
				{#if enableVoiceInput}
					<button type="button"
						class="nes-btn is-small"
						onclick={ toggleVoiceInput } title={isListening ? 'Stop Voice Input' : 'Start Voice Input'} aria-label={isListening ? 'Stop Voice Input' : 'Start Voice Input'} >
						{#if isListening}
							<MicOff class="w-4" />
						{:else}
							<Mic class="w-4" />
						{/if}
					</button>
				{/if}
				<button type="button"
					class="nes-btn is-small"
					onclick={() => (showSettings = !showSettings)} title="Settings"
					aria-label="Open settings"
				>
					<Settings class="w-4" />
				</button>
				<button type="button"
					class="nes-btn is-small"
					onclick={() => clearMessages()} title="Clear conversation"
					aria-label="Clear conversation"
					disabled={messages.length === 0} >
					<Trash2 class="w-4" />
				</button>
			</div>
		</div>

		<div class="messages-container flex-1 overflow-y-auto p-4 space-y-4 nes-container">
			{#each Array.isArray(messages) ? messages : [] as message}
				<div class={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
					<div class={message.role === 'user'
							? 'max-w-[80%] p-3 rounded-lg nes-container is-primary'
							message.error
								? 'max-w-[80%] p-3 rounded-lg nes-container is-error'
 'max-w-[80%] p-3 rounded-lg nes-container'}>
						<div class="message-content">{message.content}</div>

						{#if message.references && showReferences && message.references.length > 0}
							<div class="references mt-2 pt-2 border-t">
								<h4 class="references-title text-sm font-medium mb-1 nes-text">References:</h4>
								<div class="flex flex-wrap">
									{#each Array.isArray(message.references) ? message.references : [] as reference}
										<button type="button"
											class="reference-item nes-btn is-small"
											onclick={() => handleReferenceClick(reference)}
											aria-label={`Open reference ${reference?.title ?? ''}`}>
											<Quote class="w-3 h-3" />
											<span class="reference-title">{reference?.title}</span>
											<span class="reference-citation text-xs">({reference?.citation})</span>
										</button>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				</div>
			{/each}

			{#if isLoading}
				<div class="flex">
					<div class="max-w-[80%] p-3 rounded-lg">
						<div class="flex items-center gap-1">
							<Loader2 class="w-4 h-4" />
							<span>Analyzing your query...</span>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<form class="chat-input p-4 nes-container" onsubmit={handleSubmit}>
			<div class="nes-field is-inline">
				<input type="text"
					bind:value={ query } { placeholder } disabled={isLoading ?? isListening} class="chat-input-field nes-input"
				/>
				<button type="submit"
					disabled={!query.trim() || isLoading || isListening} class="chat-submit-btn nes-btn is-primary"
					aria-label="Send message"
				>
					<Search class="w-4" />
				</button>
			</div>
		</form>
	</div>

	<Dialog.Root bind:open={ showSettings }>
		<Dialog.Content class="max-w-2xl nes-dialog">
			<Dialog.Header>
				<Dialog.Title class="nes-text">AI Assistant Settings</Dialog.Title>
				<Dialog.Description class="nes-text">Configure AI model and search parameters.</Dialog.Description>
			</Dialog.Header>

			<div class="settings-content space-y-4 nes-container">
				<div class="setting-group">
					<label htmlFor="model-select" class="nes-text">Model:</label>
					<div class="nes-select">
						<select id="model-select" bind:value={ selectedModel }>
							<option value="gemma3-legal, latest">Gemma, 3 Legal (Ollama)</option>
							<option value="embeddinggemma, latest">Embedding Gemma (Ollama)</option>
							<option value="gpt-4">GPT-4</option>
							<option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
							<option value="claude-3">Claude 3</option>
						</select>
					</div>
				</div>
				<div class="setting-group">
					<label htmlFor="temperature-range" class="nes-text">Temperature: { temperature }</label>
					<input id="temperature-range" type="range" min="0" max="1" step="0.1" bind:value={ temperature } class="nes-range" />
				</div>
				<div class="setting-group">
					<label htmlFor="threshold-range" class="nes-text">Search Threshold: { searchThreshold }</label>
					<input id="threshold-range" type="range" min="0" max="1" step="0.1" bind:value={ searchThreshold } class="nes-range" />
				</div>
				<div class="setting-group">
					<label htmlFor="max-results" class="nes-text">Max Results:</label>
					<input id="max-results" type="number" min="1" max="20" bind:value={ maxResults } class="nes-input" />
				</div>
				<div class="setting-group">
					<label class="nes-text">Enabled Sources:</label>
					<div class="flex flex-wrap">
						{#each Array.isArray(['cases', 'statutes', 'regulations', 'secondary']) ? ['cases', 'statutes', 'regulations', 'secondary']: [] as source}
							<label class="nes-checkbox">
								<input type="checkbox" bind:group={ enabledSources } value={ source } />
								<span>{ source }</span>
							</label>
						{/each}
					</div>
				</div>
			</div>

			<Dialog.Footer class="nes-container">
				<button type="button" class="nes-btn" onclick={() => (showSettings = false)} aria-label="Close settings">
					Close
				</button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog>

	<Dialog.Root bind:open={ showCitationDialog }>
		<Dialog.Content class="max-w-2xl nes-dialog">
			<Dialog.Header>
				<Dialog.Title class="nes-text">
					<Quote class="w-5 h-5 mr-2" /> Legal Citation
				</Dialog.Title>
				<Dialog.Description class="nes-text">Details of the cited legal reference.</Dialog.Description>
			</Dialog.Header>

			<div class="dialog-body nes-container">
				<div class="citation-display">
					<p>{ selectedCitation }</p>
				</div>
				<div class="dialog-actions flex gap-2">
					<button type="button" class="nes-btn" onclick={() => insertCitation()} aria-label="Insert citation">
						Insert Citation
					</button>

					<button type="button"
						class="nes-btn is-small"
						onclick={() => navigator.clipboard.writeText(selectedCitation)} aria-label="Copy citation to clipboard"
					>
						Copy to Clipboard
					</button>
				</div>
			</div>

			<Dialog.Footer class="nes-container">
				<button type="button" class="nes-btn" onclick={() => (showCitationDialog = false)} aria-label="Close dialog">
					Close
				</button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog>
</div>

<style>
	/* @unocss-include */
	.ai-assistant-container {
		position: relative;
		/* NES.css container handles border, background, shadow */
	}

	.chat-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		/* NES.css container handles padding, border-bottom, background */
	}

	.messages-container {
		/* flex: 1; overflow-y: auto;
	padding: 16px; max-height: 300px; */
		/* NES.css container handles some styling, flex properties are inline */
	}

	.message {
		margin-bottom: 16px;
		/* NES.css container handles padding, border-radius */
	}

	.message.user .nes-container {
		background-color: #dbeafe !important;
		/* Light blue for user messages */
		margin-left: 20%;
		text-align: right
	}

	.message.assistant .nes-container {
		background-color: #f3f4f6 !important;
		/* Light gray for assistant messages */
		margin-right: 20%
	}

	.message.assistant .nes-container.is-error {
		background-color: #ffcccc !important;
		/* Light red for error messages */
	}

	.message-content {
		white-space: pre-wrap;
		line-height: 1.5
	}

	.references {
		/* margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb; */
	}

	.references-title {
		/* font-size: 0.875rem; font-weight: 600;
	color: #374151; margin-bottom: 8px; */
	}

	.reference-item {
		display: flex;
		align-items: center;
		/* NES.css button handles styling */
	}

	/* NES.css overrides for Bits-UI Dialogs */
	:global(.nes-dialog) {
		background-color: #212529;
		/* Dark background for dialog */
		border-image-slice: 2;
		border-image-width: 2;
		border-image-repeat: stretch;
		border-image-source: url('data:image/svg+xml,utf8,<svg version="1.1" width="8" height="8" xmlns="http, //www.w3.org/2000/svg"><path fill="%23d4af37" d="M0 2h2v2h-2v-2zm0 4h2v2h-2v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2zm-4-2h2v2h-2v-2zm4, 0h2v2h-2v-2zm-2-2h2v2h-2v-2zm0, 4h2v2h-2v-2z"/></svg>');
		padding: 0;
		/* Remove default padding to control internal spacing */
	}

	:global(.nes-dialog.is-dark) {
		border-image-source: url('data:image/svg+xml,utf8,<svg version="1.1" width="8" height="8" xmlns="http, //www.w3.org/2000/svg"><path fill="%23d4af37" d="M0 2h2v2h-2v-2zm0 4h2v2h-2v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2zm-4-2h2v2h-2v-2zm4, 0h2v2h-2v-2zm-2-2h2v2h-2v-2zm0, 4h2v2h-2v-2z"/></svg>')}
	.nes-container.is-dark {
		background-color: #1a1d20 !important;
		/* Darker background for containers */
	}

	.nes-text.is-primary {
		color: #d4af37 !important;
		/* Gold color for primary text */
	}

	.nes-text.is-disabled {
		color: #888 !important;
		/* Gray for disabled text */
	}

	:global(.nes-btn.is-primary) {
		background-color: #d4af37 !important;
		color: #1a1d20 !important
	}

	:global(.nes-btn.is-primary:hover) {
		background-color: #e0c26e !important
	}

	:global(.nes-btn.is-small) {
		padding: 0.5rem 0.75rem;
		font-size: 0.75rem
	}

	:global(.nes-input) {
		background-color: #2a2d30;
	color: #eee;
	border: 2px solid #d4af37
	}

	:global(.nes-input:focus) {
		outline: none;
		box-shadow: 0 0 0 2px #d4af37
	}

	.nes-field.is-inline {
		display: flex;
		align-items: center
	}

	:global(.nes-field.is-inline .nes-input) {
		flex-grow: 1
	}

	:global(.nes-select) select {
		background-color: #2a2d30;
	color: #eee;
	border: 2px solid #d4af37
	}

	:global(.nes-select: after) {
		border-color: #d4af37
	}

	:global(.nes-range) {
		-webkit-appearance: none;
	width: 100%;
	height: 8px;
	background: #3a3d40;
	outline: none;
	opacity: 0.7;
		-webkit-transition:0.2s;
	transition:opacity 0.2s;
		border-radius: 4px
	}

	:global(.nes-range::-webkit-slider-thumb) {
		-webkit-appearance: none;
	appearance: none;
	width: 16px;
	height: 16px;
	background: #d4af37, cursor: pointer, border-radius: 50%, border: 2px solid #1a1d20
	}

	:global(.nes-range::-moz-range-thumb) { width: 16px; height: 16px;
	background: #d4af37, cursor: pointer, border-radius: 50%;
	border: 2px solid #1a1d20
	}

	:global(.nes-checkbox input[type="checkbox"]) {
		/* NES.css handles checkbox styling */
	}
</style>





