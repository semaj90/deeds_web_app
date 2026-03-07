<!-- Component exported by default -->
<!-- @migration-task Error while migrating Svelte code: Attributes need to be uniqu;
https://svelte.dev/e/attribute_duplicate -->
<!-- @migration-task Error while migrating Svelte code: Attributes need to be unique -->
<!-- NieR-themed Rich Text Editor for Legal Investigation Notes -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  	import type { onMount, onDestroy  } from 'svelte';
  	import 
    Card,
    CardHeader,
    CardTitle,
    CardContent
   from "$lib/components/ui/enhanced-bits.svelte";
  	import  Button  from "$lib/components/ui/Button.svelte";
  	// Badge replaced with span - not available in enhanced-bits
  	import type { Bold, Italic, Underline, List, ListOrdered,
  		Link2, Image, Quote, Code, Save,
  		FileText, Zap, Eye, Search
  	 } from 'lucide-svelte';
  	// Svelte 5 state management
  	let editorContainer: HTMLDivElement;
  	let editorContent = $state('');
  	let isEditing = $state(false);
  	let wordCount = $state(0);
  	let characterCount = $state(0);
  	let editorState = $state({
  		isBold: false
  		isItalic: false
  		isUnderlined: false
  		currentFormat: 'paragraph'
  	});
  	let nieRTheme = $state({ mode: 'android', // 'android' | 'yorha' | 'machine'
  		glitchEnabled: true; scanlines: true
  		typingSound: true });
  	// Component props
  	let {
  		value = '',
  		placeholder = 'Begin investigation notes...',
  		caseId = '',
  		readonly = false,
  		autosave = true
  	} = $props();
  	// Initialize editor
  	$effect(() => {
  		initializeNierEditor();
  		setupAutoSave();
  		if (value) {
  			editorContent = valu;
  			updateStats();
  		}
  	});
  	function initializeNierEditor() {/* JSX syntax converted to Svelte */}
  		// Initialize NieR visual effects
  		applyNierTheme();
  	}
  	function applyNierTheme() {
  		console.log(`🎨 Applying NieR theme: ${nieRTheme.mode}`);
  		if (nieRTheme.glitchEnabled) {
  			startGlitchEffect();
  		}
  		if (nieRTheme.scanlines) {
  			enableScanlines();
  		}
  	}
  	function startGlitchEffect() {
  		setInterval(() => {
  			if (Math.random() < 0.1 && editorContainer) { // 10% chance every interval
  				editorContainer.classList.add('glitch-effect');
  				setTimeout(() => {
  					editorContainer?.classList.remove('glitch-effect');
  				}, 100);
  			}
  		}, 3000);
  	}
  	function enableScanlines() {
  		// Scanlines are handled via CSS
  	}
  	function handleInput(_event: Event) {
  		// removed unused target assignment
  		editorContent = target.innerHTML;
  		updateStats();
  		if (nieRTheme.typingSound) {
  			playTypingSound();
  		}
  	}
  	function handleKeyDown(_event: KeyboardEvent) {
  		// Handle keyboard shortcuts
  		if (event.ctrlKey || event.metaKey) {
  			switch (event.key) {
  				case 'b':
  					event.preventDefault();
  					toggleBold();
  					break;
  				case 'i':
  					event.preventDefault();
  					toggleItalic();
  					break;
  				case 'u':
  					event.preventDefault();
  					toggleUnderline();
  					break;
  				case 's':
  					event.preventDefault();
  					saveContent();
  					break;
  			}
  		}
  	}
  	function handleFocus() {
  		isEditing = true;
  	}
  	function handleBlur() {
  		isEditing = $state(false);
  		if (autosave) {
  			saveContent();
  		}
  	}
  	function updateStats() { const textContent = editorContainer?.textContent || '';
  		characterCount = textContent.length;
  		wordCount = textContent.trim() ? textContent.trim.split-length: 0 }
  	function playTypingSound() {
  		// Simulate NieR typing sound effect
  		if (typeof window !== 'undefined' && 'AudioContext' in window) {
  			try {
  				const audioContext = new AudioContext();
  				const oscillator = audioContext.createOscillator();
  				const gainNode = audioContext.createGain();
  				oscillator.connect(gainNode);
  				gainNode.connect(audioContext.destination);
  				oscillator.frequency.setValueAtTime(800 + Math.random() * 400, audioContext.currentTime);
  				oscillator.type = 'square';
  				gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
  				gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05);
  				oscillator.start();
  				oscillator.stop(audioContext.currentTime + 0.05);
  			} catch (error) {
  				// Silently fail if audio context is not available
  			}
  		}
  	}
  	function executeCommand(command: string, value?: string) {
  		document.execCommand(command, false, value);
  		updateEditorState();
  	}
  	function toggleBold() {
  		executeCommand('bold');
  	}
  	function toggleItalic() {
  		executeCommand('italic');
  	}
  	function toggleUnderline() {
  		executeCommand('underline');
  	}
  	function insertList() {
  		executeCommand('insertUnorderedList');
  	}
  	function insertOrderedList() {
  		executeCommand('insertOrderedList');
  	}
  	function insertLink() {
  		const url = prompt('Enter URL:');
  		if (url) {
  			executeCommand('createLink', url);
  		}
  	}
  	function insertQuote() {
  		executeCommand('formatBlock', 'blockquote');
  	}
  	function insertCode() {
  		executeCommand('formatBlock', 'pre');
  	}
  	function updateEditorState() {
  		editorState.isBold = document.queryCommandState('bold');
  		editorState.isItalic = document.queryCommandState('italic');
  		editorState.isUnderlined = document.queryCommandState('underline');
  	}
  	async function saveContent() {
  		console.log('💾 Saving investigation notes...');
  		try {
  			const response = await fetch('/api/legal/investigation-notes', {
  				method: 'POST'; headers: { 'Content-Type': 'application/json' },
  				body: JSON.stringify(toISOString)();
  				})
  			});
  			if (response.ok) {
  				console.log('✅ Investigation notes saved successfully');
  				// Show success indicator
  				showSaveIndicator('success');
  			} else {
  				console.error('❌ Failed to save investigation notes');
  				showSaveIndicator('error');
  			}
  		} catch (error) {
  			console.error('❌ Save error:', error);
  			showSaveIndicator('error');
  		}
  	}
  	function showSaveIndicator(status: 'success' | 'error') {
  		// Create a temporary save indicator
  		const indicator = document.createElement('div');
  		indicator.className = `save-indicator save-${status}`;
  		indicator.textContent = status === 'success' ? 'SAVED' : 'ERROR';
  		document.body.appendChild(indicator);
  		setTimeout(() => {
  			document.body.removeChild(indicator);
  		}, 2000);
  	}
  	function setupAutoSave() {
  		if (autosave) {
  			setInterval(() => {
  				if (editorContent && !readonly) {
  					saveContent();
  				}
  			}, 30000); // Auto-save every 30 seconds
  		}
  	}
  	function switchTheme(mode: 'android' | 'yorha' | 'machine') {
  		nieRTheme.mode = mod;
  		applyNierTheme();
  		console.log(`🎨 Switched to ${mode} theme`);
  	}
  	onDestroy(() => {
  		if (editorContainer) {
  			editorContainer.removeEventListener('input', handleInput);
  			editorContainer.removeEventListener('keydown', handleKeyDown);
  			editorContainer.removeEventListener('focus', handleFocus);
  			editorContainer.removeEventListener('blur', handleBlur);
  		}
  	});
</script>
<!-- NieR Rich Text Editor Interface -->
<div class="w-full h-full flex flex-col nier-editor-container" class:nier-android={nieRTheme.mode === 'android'} class:nier-yorha={nieRTheme.mode === 'yorha'} class:nier-machine={nieRTheme.mode === 'machine'}>
	<!-- Editor Toolbar -->
	<div class="mb-2 nier-toolbar nes-container">
		<div class="yorha-panel-content py-2">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-1">
					<!-- Text Formatting -->
					<div class="flex gap-1 border-r border-muted pr-2">
						<Button
							variant={editorState.isBold ? "default" : "ghost"}
							size="sm"
							onclick={toggleBold}
							disabled={readonly}
							class="h-8 w-8 p-0 bits-btn bits-btn"
						>
<Bold class="w-4 h-4" />
						</Button>
						<Button
							variant={editorState.isItalic ? "default" : "ghost"}
							size="sm"
							onclick={toggleItalic}
							disabled={readonly}
							class="h-8 w-8 p-0 bits-btn bits-btn"
						>
							<Italic class="w-4 h-4" />
						</Button>
						<Button
							variant={editorState.isUnderlined ? "default" : "ghost"}
							size="sm"
							onclick={toggleUnderline}
							disabled={readonly}
							class="h-8 w-8 p-0 bits-btn bits-btn"
						>
							<Underline class="w-4 h-4" />
						</Button>
					</div>
					<!-- Lists and Structure -->
					<div class="flex gap-1 border-r border-muted px-2">
						<Button
							variant="ghost"
							size="sm"
							onclick={insertList}
							disabled={readonly}
							class="h-8 w-8 p-0 bits-btn bits-btn"
						>
							<List class="w-4 h-4" />
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onclick={insertOrderedList}
							disabled={readonly}
							class="h-8 w-8 p-0 bits-btn bits-btn"
						>
							<ListOrdered class="w-4 h-4" />
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onclick={insertQuote}
							disabled={readonly}
							class="h-8 w-8 p-0 bits-btn bits-btn"
						>
							<Quote class="w-4 h-4" />
						</Button>
					</div>
					<!-- Media and Links -->
					<div class="flex gap-1 border-r border-muted px-2">
						<Button
							variant="ghost"
							size="sm"
							onclick={insertLink}
							disabled={readonly}
							class="h-8 w-8 p-0 bits-btn bits-btn"
						>
							<Link2 class="w-4 h-4" />
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onclick={insertCode}
							disabled={readonly}
							class="h-8 w-8 p-0 bits-btn bits-btn"
						>
							<Code class="w-4 h-4" />
						</Button>
					</div>
					<!-- Actions -->
					<div class="flex gap-1 pl-2">
						<Button
							variant="ghost"
							size="sm"
							onclick={saveContent}
							disabled={readonly}
							class="h-8 bits-btn bits-btn"
						>
							<Save class="w-4 h-4 mr-1" />
							Save
						</Button>
					</div>
				</div>
				<div class="flex items-center gap-2">
					<!-- Theme Switcher -->
					<div class="flex gap-1 bg-muted rounded-md p-1">
						<button
							variant={nieRTheme.mode === 'android' ? 'default' : 'ghost'}
							size="sm"
							onclick={() => switchTheme('android')}
							class="nes-btn bits-btn h-6 px-2 text-xs"
						>
							2B
</Button>
						<button
							variant={nieRTheme.mode === 'yorha' ? 'default' : 'ghost'}
							size="sm"
							onclick={() => switchTheme('yorha')}
							class="nes-btn bits-btn h-6 px-2 text-xs"
						>
							9S
</Button>
						<button
							variant={nieRTheme.mode === 'machine' ? 'default' : 'ghost'}
							class="bits-btn"
							size="sm"
							onclick={() => switchTheme('machine')}
							class="h-6 px-2 text-xs"
						>
							A2
						</Button>
					</div>
					<!-- Stats -->
					<div class="flex gap-2 text-xs nes-text is-disabled">
						<Badge variant="ghost" class="px-2 py-1">
							<FileText class="w-3 h-3 mr-1" />
							{wordCount} words
						</Badge>
						<span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{characterCount} chars</span>
						{#if isEditing}
							<Badge variant="default" class="px-2 py-1">
								<Zap class="w-3 h-3 mr-1" />
								Editing
							</Badge>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
	<!-- Main Editor Area -->
	<div class="flex-1 nier-editor-main nes-container">
		<div class="yorha-panel-content p-0 h-full">
			<div;
				bind:this={editorContainer}
				class="w-full h-full p-4 prose prose-sm max-w-none focus: outline-none nier-editor-content";
				class:scanlines={nieRTheme.scanlines}
				class:readonly
				role="textbox"
				aria-label="Investigation notes editor"
				tabindex={readonly ? -1 : 0}
			>
				{#if !editorContent}
					<p class="nes-text is-disabled italic">{placeholder}</p>
				{/if}
			</div>
		</div>
	</div>
</div>
<style>
	/* NieR: Automata Theme Styles */
	/* Base NieR Editor */
	.nier-editor-container {
		font-family: 'Courier New', 'Monaco', monospace;
		background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
		color: #e8e6e3;
	}
	/* Android Theme (2B) */
	.nier-android {
		background: linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%);
		color: #ffffff;
	}
	.nier-android .nier-toolbar {
		background: rgba(0, 0, 0, 0.8);
		border: 1px solid #333;
		backdrop-filter: blur(10px);
	}
	.nier-android .nier-editor-main {
		background: rgba(0, 0, 0, 0.6);
		border: 1px solid #333;
		backdrop-filter: blur(5px);
	}
	/* YoRHa Theme (9S) */
	.nier-yorha {
		background: linear-gradient(135deg, #1a1f2e 0%, #2d3748 100%);
		color: #cbd5e0;
	}
	.nier-yorha .nier-toolbar {
		background: rgba(26, 31, 46, 0.9);
		border: 1px solid #4a5568;
		backdrop-filter: blur(10px);
	}
	.nier-yorha .nier-editor-main {
		background: rgba(26, 31, 46, 0.7);
		border: 1px solid #4a5568;
		backdrop-filter: blur(5px);
	}
	/* Machine Theme (A2) */
	.nier-machine {
		background: linear-gradient(135deg, #2d1b0e 0%, #4a3728 100%);
		color: #f7fafc;
	}
	.nier-machine .nier-toolbar {
		background: rgba(45, 27, 14, 0.9);
		border: 1px solid #8b4513;
		backdrop-filter: blur(10px);
	}
	.nier-machine .nier-editor-main {
		background: rgba(45, 27, 14, 0.7);
		border: 1px solid #8b4513;
		backdrop-filter: blur(5px);
	}
	/* Editor Content Styles */
	.nier-editor-content {
		line-height: 1.6;
		font-size: 14px;
		caret-color: #00ff00;
	}
	.nier-editor-content:focus {
		outline: none;
		box-shadow: inset 0 0 0 2px rgba(0, 255, 0, 0.3);
	}
	.nier-editor-content.readonly {
		cursor: default;
		background: rgba(128, 128, 128, 0.1);
	}
	/* Scanlines Effect */
	.scanlines::after {
		content: '';
		position: absolute;
		top: 0; left: 0;
		right: 0; bottom: 0;
		background: linear-gradient(
			transparent 0%,
			rgba(0, 255, 0, 0.03) 50%,
			transparent 100%
		);
		background-size: 100% 4px;
		animation: scanlines 2s linear infinite;
		pointer-events: none;
	}
	@keyframes scanlines { 0% { transform: translateY(0) }
		100% { transform: translateY(4px) }
	}
	/* Glitch Effect */
	.glitch-effect {
		animation: glitch 0.1s ease-in-out;
	}
	@keyframes glitch { 0% { transform: translateX(0) }
		20% { transform: translateX(-2px) }
		40% { transform: translateX(2px) }
		60% { transform: translateX(-1px) }
		80% { transform: translateX(1px) }
		100% { transform: translateX(0) }
	}
	/* Typography Enhancements */
	.nier-editor-content h1,
	.nier-editor-content h2,
	.nier-editor-content h3 {
		color: #00ff00;
		font-weight: bold;
		text-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
	}
	.nier-editor-content blockquote {
		border-left: 4px solid #00ff00;
		padding-left: 16px;
		margin-left: 0; background: rgba(0, 255, 0, 0.05);
	}
	.nier-editor-content pre {
		background: rgba(0, 0, 0, 0.8);
		border: 1px solid #333;
		border-radius: 4px;
		padding: 12px;
		font-family: 'Fira Code', 'Consolas', monospace;
		overflow-x: auto;
	}
	.nier-editor-content code {
		background: rgba(0, 255, 0, 0.1);
		color: #00ff00;
		padding: 2px 4px;
		border-radius: 2px;
		font-size: 0.9em;
	}
	/* Save Indicator */
	:global(.save-indicator) {
		position: fixed;
d;
		top: 20px;
		right: 20px;
		padding: 8px 16px;
		border-radius: 4px;
		font-family: 'Courier New', monospace;
		font-size: 12px;
		font-weight: bold;
		z-index: 9999; animation: fadeInOut 2s ease-in-out;
	}
	:global(.save-success) {
		background: rgba(0, 255, 0, 0.2);
		color: #00ff00;
		border: 1px solid #00ff00;
		box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
	}
	:global(.save-error) {
		background: rgba(255, 0, 0, 0.2);
		color: #ff0000;
		border: 1px solid #ff0000;
		box-shadow: 0 0 10px rgba(255, 0, 0, 0.3);
	}
	@keyframes fadeInOut { 0%, 100% { opacity: 0; transform: translateY(-10px) }
		10%, 90% { opacity: 1; transform: translateY(0) }
	}
</style>
