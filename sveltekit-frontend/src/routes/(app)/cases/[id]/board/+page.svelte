<script lang="ts">
	import HybridBoard from '$lib/components/canvas/HybridBoard.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { ChatSession } from '$lib/models/ChatSession.svelte.js';
	import TypewriterResponse from '$lib/components/ai/TypewriterResponse.svelte';
	import type { PageData } from './$types';
	import { onMount } from 'svelte';

	// Props
	let { data }: { data: PageData } = $props();
	let caseId = $derived(data.caseId);
	let initialState = $derived(data.initialState);
	let evidenceItems = $derived((data as any).evidence || []);

	// State
	let board: HybridBoard = $state() as HybridBoard;
	let isDirty = $state(false);
	let isSaving = $state(false);
	let activeView = $state<'wall' | 'line' | 'file' | 'list'>('wall');
	let selectedEvidence = $state<any>(null);
	let showAddEvidence = $state(false);
	let activeTool = $state<'select' | 'evidence' | 'connection' | 'note'>('select');
	let showAIChat = $state(false);
	let isGeneratingLayout = $state(false);

	// AI Chat session (contextual to this case)
	let chatSession: ChatSession | null = $state(null);
	let currentMessage = $state('');
	let chatContainer: HTMLElement | null = $state(null);
	let isRecording = $state(false);
	let mediaRecorder: MediaRecorder | null = null;

	onMount(() => {
		// Initialize chat session with case context
		chatSession = new ChatSession(`board-${caseId}`, [], true);
		return () => {
			chatSession?.destroy();
		};
	});

	// Undo/Redo stack (from CollaborativeEvidenceCanvas)
	let undoStack = $state<any[]>([]);
	let redoStack = $state<any[]>([]);
	const MAX_UNDO = 50;

	// Keyboard shortcuts (from CollaborativeEvidenceCanvas analysis)
	function handleKeyboard(e: KeyboardEvent) {
		// Save: Ctrl/Cmd + S
		if ((e.ctrlKey || e.metaKey) && e.key === 's') {
			e.preventDefault();
			save();
		}
		// Undo: Ctrl/Cmd + Z
		else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
			e.preventDefault();
			undo();
		}
		// Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
		else if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
			e.preventDefault();
			redo();
		}
		// Tool shortcuts
		else if (e.key === 'v') {
			activeTool = 'select';
		} else if (e.key === 'e') {
			activeTool = 'evidence';
		} else if (e.key === 'c') {
			activeTool = 'connection';
		} else if (e.key === 'n') {
			activeTool = 'note';
		}
		// View shortcuts
		else if (e.key === '1') {
			activeView = 'wall';
		} else if (e.key === '2') {
			activeView = 'line';
		} else if (e.key === '3') {
			activeView = 'file';
		} else if (e.key === '4') {
			activeView = 'list';
		}
	}

	function undo() {
		if (undoStack.length === 0) return;
		const action = undoStack.pop();
		if (action && board) {
			redoStack.push(board.serialize());
			// Apply undo action to board
			isDirty = true;
		}
	}

	function redo() {
		if (redoStack.length === 0) return;
		const action = redoStack.pop();
		if (action && board) {
			undoStack.push(board.serialize());
			// Apply redo action to board
			isDirty = true;
		}
	}

	function recordAction(action: any) {
		undoStack.push(action);
		if (undoStack.length > MAX_UNDO) {
			undoStack.shift();
		}
		redoStack = []; // Clear redo stack on new action
		isDirty = true;
	}

	// Parse AI layout suggestions and apply to canvas
	function parseAndApplyLayout(aiResponse: string) {
		if (!board) return;

		// Parse format: "Item N: position (x%, y%)"
		const regex = /Item (\d+):\s*position\s*\((\d+)%?,?\s*(\d+)%?\)/gi;
		let match;
		const positions: Array<{ itemIndex: number; x: number; y: number }> = [];

		while ((match = regex.exec(aiResponse)) !== null) {
			positions.push({
				itemIndex: parseInt(match[1]) - 1, // 0-indexed
				x: parseInt(match[2]),
				y: parseInt(match[3])
			});
		}

		if (positions.length === 0) {
			console.warn('No layout positions found in AI response');
			return;
		}

		// Clear existing nodes and apply new layout
		board.clearNodes();

		// Canvas dimensions (approximate, will scale with viewport)
		const canvasWidth = 2000;
		const canvasHeight = 1500;

		positions.forEach(({ itemIndex, x, y }) => {
			const item = evidenceItems[itemIndex];
			if (item) {
				// Convert percentage to canvas coordinates
				const posX = (x / 100) * canvasWidth;
				const posY = (y / 100) * canvasHeight;
				board.addEvidenceNode(item.id, item.title, posX, posY);
			}
		});

		// Mark as dirty to trigger save prompt
		isDirty = true;
	}

	// AI-powered layout generation
	async function generateAILayout() {
		if (!chatSession || evidenceItems.length === 0) return;

		isGeneratingLayout = true;
		showAIChat = true; // Auto-open chat to show progress

		const layoutPrompt = `You are analyzing ${evidenceItems.length} evidence items for case ${caseId}.

Evidence summary:
${evidenceItems.slice(0, 20).map((e: any, i: number) => `${i + 1}. "${e.title}" (${e.type}) - ${e.date}`).join('\n')}

Generate an optimal canvas layout strategy. For each evidence item, suggest:
1. X/Y position (0-100% of canvas width/height)
2. Grouping strategy (chronological, by type, by importance)
3. Connection suggestions between related items

Format as: "Item N: position (x%, y%), group: [name], connect to: [items]"

IMPORTANT: Always include position coordinates for each item in the exact format shown above.`;

		await chatSession.sendMessage(layoutPrompt);

		// Watch for the AI's response to auto-apply layout
		const checkResponse = setInterval(() => {
			if (chatSession && chatSession.status === 'idle' && chatSession.messages.length > 0) {
				const lastMsg = chatSession.messages[chatSession.messages.length - 1];
				if (lastMsg.role === 'assistant') {
					parseAndApplyLayout(lastMsg.content);
					clearInterval(checkResponse);
				}
			}
		}, 500);

		// Cleanup after 30 seconds
		setTimeout(() => {
			clearInterval(checkResponse);
			isGeneratingLayout = false;
		}, 30000);

		isGeneratingLayout = false;
	}

	// Send chat message
	async function sendChatMessage() {
		if (!chatSession || !currentMessage.trim()) return;

		const msg = currentMessage.trim();
		currentMessage = '';
		await chatSession.sendMessage(msg);

		// Save to database
		await saveChatToDatabase();

		// Auto-scroll chat
		setTimeout(() => {
			if (chatContainer) {
				chatContainer.scrollTop = chatContainer.scrollHeight;
			}
		}, 100);
	}

	// Save chat history to database
	async function saveChatToDatabase() {
		if (!chatSession || chatSession.messages.length === 0) return;

		try {
			const response = await fetch(`/api/cases/${caseId}/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					chatId: chatSession._chatId,
					messages: chatSession.messages,
					metadata: {
						evidenceCount: evidenceItems.length,
						timestamp: new Date().toISOString()
					}
				})
			});

			if (!response.ok) {
				console.error('Failed to save chat history');
			}
		} catch (e) {
			console.error('Error saving chat:', e);
		}
	}

	// Export chat transcript as PDF
	async function exportChatPDF() {
		if (!chatSession || chatSession.messages.length === 0) return;

		const transcript = chatSession.messages
			.map((msg, idx) => {
				const role = msg.role === 'user' ? 'You' : 'AI Assistant';
				const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '';
				return `${idx + 1}. ${role} ${timestamp ? `(${timestamp})` : ''}\n${msg.content}\n`;
			})
			.join('\n---\n\n');

		const blob = new Blob([
			`Evidence Board Chat Transcript\n`,
			`Case ID: ${caseId}\n`,
			`Generated: ${new Date().toLocaleString()}\n`,
			`\n${'='.repeat(80)}\n\n`,
			transcript
		], { type: 'text/plain' });

		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `evidence-board-chat-${caseId.substring(0, 8)}-${Date.now()}.txt`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// Voice input with Whisper STT
	async function startVoiceInput() {
		if (!navigator.mediaDevices || isRecording) return;

		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const chunks: Blob[] = [];

			mediaRecorder = new MediaRecorder(stream);
			mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
			mediaRecorder.onstop = async () => {
				const audioBlob = new Blob(chunks, { type: 'audio/webm' });
				const formData = new FormData();
				formData.append('audio', audioBlob, 'voice.webm');

				try {
					const response = await fetch('/api/whisper/transcribe', {
						method: 'POST',
						body: formData
					});

					if (response.ok) {
						const data = await response.json();
						currentMessage = (currentMessage ? currentMessage + ' ' : '') + data.text;
					} else {
						console.error('Transcription failed');
					}
				} catch (e) {
					console.error('Error transcribing audio:', e);
				}

				stream.getTracks().forEach(track => track.stop());
			};

			mediaRecorder.start();
			isRecording = true;
		} catch (e) {
			console.error('Error accessing microphone:', e);
			alert('Unable to access microphone. Please check permissions.');
		}
	}

	function stopVoiceInput() {
		if (mediaRecorder && isRecording) {
			mediaRecorder.stop();
			isRecording = false;
			mediaRecorder = null;
		}
	}

	async function save() {
		if (!board) return;
		isSaving = true;

		try {
			const snapshot = board.serialize();
			const res = await fetch(`/api/cases/${caseId}/canvas`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(snapshot),
			});
			if (!res.ok) {
				console.error('Failed to save', await res.json());
				alert('Failed to save board state');
			} else {
				isDirty = false;
			}
		} catch (e) {
			console.error('Save error', e);
			alert('Error saving board state');
		} finally {
			isSaving = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeyboard} />

<div class="evidence-board-container">
	<!-- Header -->
	<header class="board-header">
		<div class="header-left">
			<div class="board-title">
				<Icon name="layout-grid" class="title-icon" />
				<h1>EVIDENCE BOARD</h1>
			</div>
			<div class="case-meta">
				<span class="case-number">CASE #{caseId.substring(0, 8)}</span>
				<span class="separator">•</span>
				<span class="view-mode">Interactive Investigation Canvas</span>
			</div>
		</div>

		<div class="header-actions">
			<button
				class="action-btn"
				onclick={generateAILayout}
				disabled={isGeneratingLayout || evidenceItems.length === 0}
				title="AI-Powered Layout Generation"
			>
				<Icon name={isGeneratingLayout ? 'loader' : 'sparkles'} />
				{isGeneratingLayout ? '' : 'AI Layout'}
			</button>
			<button
				class="action-btn"
				class:active={showAIChat}
				onclick={() => (showAIChat = !showAIChat)}
				title="AI Assistant Chat"
			>
				<Icon name="message-circle" />
				Chat
			</button>
			<button class="action-btn" title="Active Investigation">
				<Icon name="activity" />
			</button>
			<button class="btn-primary" onclick={() => (showAddEvidence = true)}>
				<Icon name="plus" />
				Add Evidence
			</button>
		</div>
	</header>

	<!-- View Tabs -->
	<div class="view-tabs">
		<button
			class="tab"
			class:active={activeView === 'wall'}
			onclick={() => (activeView = 'wall')}
		>
			<Icon name="grid-3x3" />
			WALL
		</button>
		<button
			class="tab"
			class:active={activeView === 'line'}
			onclick={() => (activeView = 'line')}
		>
			<Icon name="git-branch" />
			LINE
		</button>
		<button
			class="tab"
			class:active={activeView === 'file'}
			onclick={() => (activeView = 'file')}
		>
			<Icon name="file-text" />
			FILE
		</button>
		<button
			class="tab"
			class:active={activeView === 'list'}
			onclick={() => (activeView = 'list')}
		>
			<Icon name="list" />
			LIST
		</button>

		{#if isDirty}
			<div class="unsaved-indicator">
				<span class="pulse-dot"></span>
				Unsaved changes
			</div>
		{/if}

		<button class="save-btn" onclick={save} disabled={isSaving || !isDirty}>
			<Icon name="save" />
			{isSaving ? 'Saving...' : 'Save Board'}
		</button>
	</div>

	<!-- Tools Toolbar (inspired by CollaborativeEvidenceCanvas) -->
	<div class="tools-toolbar">
		<div class="tool-group">
			<button
				class="tool-btn"
				class:active={activeTool === 'select'}
				onclick={() => (activeTool = 'select')}
				title="Select Tool (V)"
			>
				<Icon name="mouse-pointer-2" />
			</button>
			<button
				class="tool-btn"
				class:active={activeTool === 'evidence'}
				onclick={() => (activeTool = 'evidence')}
				title="Add Evidence (E)"
			>
				<Icon name="file-plus" />
			</button>
			<button
				class="tool-btn"
				class:active={activeTool === 'connection'}
				onclick={() => (activeTool = 'connection')}
				title="Draw Connection (C)"
			>
				<Icon name="git-branch" />
			</button>
			<button
				class="tool-btn"
				class:active={activeTool === 'note'}
				onclick={() => (activeTool = 'note')}
				title="Add Note (N)"
			>
				<Icon name="sticky-note" />
			</button>
		</div>

		<div class="tool-group">
			<button
				class="tool-btn"
				onclick={undo}
				disabled={undoStack.length === 0}
				title="Undo (Ctrl+Z)"
			>
				<Icon name="undo" />
			</button>
			<button
				class="tool-btn"
				onclick={redo}
				disabled={redoStack.length === 0}
				title="Redo (Ctrl+Shift+Z)"
			>
				<Icon name="redo" />
			</button>
		</div>

		<div class="keyboard-hint">
			<span class="hint-text">Shortcuts: V=Select • E=Evidence • C=Connect • N=Note • 1-4=Views</span>
		</div>
	</div>

	<!-- Main Content Area -->
	<div class="board-content">
		<!-- Left Sidebar - Evidence List -->
		<aside class="evidence-sidebar">
			<div class="sidebar-header">
				<h3>EVIDENCE</h3>
				<span class="count-badge">{evidenceItems.length}</span>
			</div>

			<div class="evidence-list">
				{#each evidenceItems as item (item.id)}
					<div
						class="evidence-card"
						class:selected={selectedEvidence?.id === item.id}
						onclick={() => (selectedEvidence = item)}
					>
						<div class="evidence-thumbnail">
							{#if item.thumbnail}
								<img src={item.thumbnail} alt={item.title} />
							{:else}
								<div class="placeholder">
									<Icon name="play-circle" size={32} />
								</div>
							{/if}
						</div>
						<div class="evidence-info">
							<h4>{item.title}</h4>
							<p class="evidence-meta">{item.date}</p>
							<p class="evidence-location">{item.location}</p>
						</div>
						<button class="evidence-menu">
							<Icon name="more-vertical" />
						</button>
					</div>
				{/each}
			</div>
		</aside>

		<!-- Center Canvas - Board Visualization -->
		<div class="canvas-area">
			{#key caseId}
				<HybridBoard
					bind:this={board}
					initialSnapshot={initialState as any}
					onDirtyChange={(d) => (isDirty = d)}
					{caseId}
				/>
			{/key}
		</div>

		<!-- Right Sidebar - Detailed Evidence -->
		{#if selectedEvidence}
			<aside class="details-sidebar">
				<div class="details-header">
					<h3>Detailed Evidence</h3>
					<button class="close-btn" onclick={() => (selectedEvidence = null)}>
						<Icon name="x" />
					</button>
				</div>

				<div class="details-content">
					<div class="detail-section">
						<h4>Financial Impact</h4>
						<div class="financial-value">$50,000.00</div>
						<p class="financial-subtitle">Total damages • Current Market</p>
					</div>

					<div class="detail-section">
						<h4>AI Case Insights</h4>
						<ul class="insights-list">
							<li>High correlation with suspect timeline</li>
							<li>Location data matches witness statements</li>
							<li>Timestamp aligns with incident report</li>
						</ul>
					</div>

					<div class="detail-section">
						<h4>Document Statistics</h4>
						<div class="stats-grid">
							<div class="stat">
								<span class="stat-label">Created</span>
								<span class="stat-value">2021-11-15</span>
							</div>
							<div class="stat">
								<span class="stat-label">Modified</span>
								<span class="stat-value">Wed 3:12 PM</span>
							</div>
							<div class="stat">
								<span class="stat-label">File ID</span>
								<span class="stat-value">V4-87-2340</span>
							</div>
							<div class="stat">
								<span class="stat-label">Priority</span>
								<span class="stat-value priority-high">HIGH</span>
							</div>
						</div>
					</div>

					<div class="detail-section">
						<h4>Related Items</h4>
						<p class="related-info">4 connected evidence items, 2 witness statements</p>
					</div>
				</div>
			</aside>
		{/if}
	</div>

	<!-- Timeline View -->
	<div class="timeline-section">
		<div class="timeline-header">
			<span class="timeline-label">TIMELINE VIEW</span>
			<span class="timeline-count">{evidenceItems.length} items</span>
		</div>
		<div class="timeline-track">
			{#if evidenceItems.length > 0}
				{#each evidenceItems.slice(0, 10) as item, idx (item.id)}
					{@const position = ((idx + 1) / (Math.min(evidenceItems.length, 10) + 1)) * 100}
					{@const colors = ['orange', 'green', 'blue', 'purple', 'red']}
					{@const color = colors[idx % colors.length]}
					<div
						class="timeline-node"
						class:active={selectedEvidence?.id === item.id}
						style="left: {position}%"
						onclick={() => (selectedEvidence = item)}
						role="button"
						tabindex="0"
						onkeydown={(e) => e.key === 'Enter' && (selectedEvidence = item)}
					>
						<div class="node-dot {color}"></div>
						{#if selectedEvidence?.id === item.id}
							<div class="node-label">{item.title}</div>
						{/if}
					</div>
				{/each}
			{:else}
				<div class="timeline-empty">No evidence items to display</div>
			{/if}
		</div>
	</div>

	<!-- AI Chat Panel (SSE Streaming) -->
	{#if showAIChat && chatSession}
		<aside class="ai-chat-panel">
			<div class="chat-header">
				<div class="chat-title">
					<Icon name="bot" />
					<h3>AI Assistant</h3>
					<span class="chat-status" class:connected={chatSession.connectionStatus === 'connected'}>
						{chatSession.connectionStatus === 'connected' ? 'Ready' : 'Connecting...'}
					</span>
				</div>
				<button class="close-btn" onclick={() => (showAIChat = false)}>
					<Icon name="x" />
				</button>
			</div>

			<div class="chat-messages" bind:this={chatContainer}>
				{#if chatSession.messages.length === 0}
					<div class="chat-welcome">
						<Icon name="sparkles" />
						<p class="welcome-title">Evidence Board AI Assistant</p>
						<p class="welcome-text">Ask about evidence connections, generate layouts, or get case insights.</p>
						<div class="quick-actions">
							<button class="quick-btn" onclick={() => currentMessage = 'What connections do you see between evidence items?'}>
								<Icon name="git-branch" />
								Analyze Connections
							</button>
							<button class="quick-btn" onclick={() => currentMessage = 'Suggest an optimal timeline arrangement'}>
								<Icon name="clock" />
								Timeline Suggestions
							</button>
						</div>
					</div>
				{:else}
					{#each chatSession.messages as msg, idx (idx)}
						<div class="chat-message" class:user={msg.role === 'user'} class:assistant={msg.role === 'assistant'}>
							{#if msg.role === 'user'}
								<div class="message-content">
									<Icon name="user" />
									<p>{msg.content}</p>
								</div>
							{:else}
								<div class="message-content">
									<Icon name="bot" />
									{#if idx === chatSession.messages.length - 1 && chatSession.status === 'streaming'}
										<div class="streaming-content">{msg.content}</div>
									{:else}
										<TypewriterResponse text={msg.content} speed={60} enableThinking={false} />
									{/if}
								</div>
								{#if msg.metadata?.confidence}
									<div class="message-meta">
										<span class="confidence">Confidence: {Math.round(msg.metadata.confidence * 100)}%</span>
										{#if msg.source}
											<span class="source">{msg.source}</span>
										{/if}
									</div>
								{/if}
							{/if}
						</div>
					{/each}

					{#if chatSession.status === 'thinking'}
						<div class="chat-message assistant">
							<div class="message-content">
								<Icon name="bot" />
								<div class="thinking-indicator">
									<span class="dot"></span>
									<span class="dot"></span>
									<span class="dot"></span>
								</div>
							</div>
						</div>
					{/if}
				{/if}
			</div>

			<div class="chat-input">
				<textarea
					bind:value={currentMessage}
					placeholder="Ask about evidence, connections, or layouts..."
					rows="2"
					onkeydown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault();
							sendChatMessage();
						}
					}}
				></textarea>
				<button
					class="send-btn"
					onclick={sendChatMessage}
					disabled={!currentMessage.trim() || chatSession.status !== 'idle'}
				>
					<Icon name="send" />
				</button>
			</div>
		</aside>
	{/if}
</div>

<style>
	.evidence-board-container {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: #fafafa;
		font-family: 'JetBrains Mono', monospace;
	}

	/* Header */
	.board-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.5rem;
		background: white;
		border-bottom: 1px solid #e5e7eb;
	}

	.header-left {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.board-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.title-icon {
		color: #3b82f6;
	}

	.board-title h1 {
		font-size: 1.25rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: #1f2937;
		margin: 0;
	}

	.case-meta {
		font-size: 0.75rem;
		color: #6b7280;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.case-number {
		font-weight: 600;
	}

	.separator {
		color: #d1d5db;
	}

	.header-actions {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.action-btn {
		padding: 0.5rem;
		background: #f3f4f6;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.2s;
	}

	.action-btn:hover {
		background: #e5e7eb;
		color: #1f2937;
	}

	.btn-primary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-primary:hover {
		background: #2563eb;
	}

	/* View Tabs */
	.view-tabs {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		background: white;
		border-bottom: 1px solid #e5e7eb;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.2s;
	}

	.tab:hover {
		background: #f3f4f6;
		color: #1f2937;
	}

	.tab.active {
		background: #eff6ff;
		border-color: #3b82f6;
		color: #3b82f6;
	}

	.unsaved-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: auto;
		font-size: 0.75rem;
		color: #f59e0b;
	}

	.pulse-dot {
		width: 0.5rem;
		height: 0.5rem;
		background: #f59e0b;
		border-radius: 50%;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.save-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: #10b981;
		color: white;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.save-btn:hover:not(:disabled) {
		background: #059669;
	}

	.save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Tools Toolbar */
	.tools-toolbar {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1.5rem;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.tool-group {
		display: flex;
		gap: 0.25rem;
		padding: 0.25rem;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
	}

	.tool-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.15s;
	}

	.tool-btn:hover:not(:disabled) {
		background: #f3f4f6;
		color: #1f2937;
	}

	.tool-btn.active {
		background: #3b82f6;
		color: white;
	}

	.tool-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.keyboard-hint {
		margin-left: auto;
		padding: 0.5rem 1rem;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
	}

	.hint-text {
		font-size: 0.75rem;
		color: #6b7280;
		font-weight: 500;
	}

	/* Main Content */
	.board-content {
		display: grid;
		grid-template-columns: 280px 1fr 320px;
		flex: 1;
		overflow: hidden;
		gap: 1px;
		background: #e5e7eb;
	}

	/* Evidence Sidebar */
	.evidence-sidebar {
		background: white;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.sidebar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.sidebar-header h3 {
		font-size: 0.875rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: #1f2937;
		margin: 0;
	}

	.count-badge {
		padding: 0.125rem 0.5rem;
		background: #eff6ff;
		color: #3b82f6;
		border-radius: 1rem;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.evidence-list {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem;
	}

	.evidence-card {
		padding: 0.75rem;
		margin-bottom: 0.5rem;
		background: #fafafa;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.evidence-card:hover {
		background: #f3f4f6;
		border-color: #3b82f6;
	}

	.evidence-card.selected {
		background: #eff6ff;
		border-color: #3b82f6;
	}

	.evidence-thumbnail {
		width: 100%;
		height: 120px;
		background: #1f2937;
		border-radius: 0.375rem;
		overflow: hidden;
		margin-bottom: 0.75rem;
	}

	.placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #6b7280;
	}

	.evidence-info h4 {
		font-size: 0.875rem;
		font-weight: 600;
		color: #1f2937;
		margin: 0 0 0.25rem 0;
	}

	.evidence-meta {
		font-size: 0.75rem;
		color: #6b7280;
		margin: 0;
	}

	.evidence-location {
		font-size: 0.75rem;
		color: #9ca3af;
		margin: 0.25rem 0 0 0;
	}

	/* Canvas Area */
	.canvas-area {
		background: white;
		position: relative;
		overflow: hidden;
	}

	/* Details Sidebar */
	.details-sidebar {
		background: white;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.details-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.details-header h3 {
		font-size: 0.875rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: #1f2937;
		margin: 0;
	}

	.close-btn {
		padding: 0.25rem;
		background: transparent;
		border: none;
		color: #6b7280;
		cursor: pointer;
		transition: color 0.2s;
	}

	.close-btn:hover {
		color: #1f2937;
	}

	.details-content {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
	}

	.detail-section {
		margin-bottom: 1.5rem;
	}

	.detail-section h4 {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: #6b7280;
		margin: 0 0 0.75rem 0;
		text-transform: uppercase;
	}

	.financial-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: #1f2937;
		margin-bottom: 0.25rem;
	}

	.financial-subtitle {
		font-size: 0.75rem;
		color: #6b7280;
		margin: 0;
	}

	.insights-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.insights-list li {
		padding: 0.5rem;
		margin-bottom: 0.5rem;
		background: #f3f4f6;
		border-left: 2px solid #3b82f6;
		font-size: 0.75rem;
		color: #1f2937;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.stat-label {
		font-size: 0.75rem;
		color: #6b7280;
		text-transform: uppercase;
	}

	.stat-value {
		font-size: 0.875rem;
		font-weight: 600;
		color: #1f2937;
	}

	.stat-value.priority-high {
		color: #dc2626;
	}

	.related-info {
		font-size: 0.75rem;
		color: #6b7280;
		margin: 0;
	}

	/* Timeline */
	.timeline-section {
		background: white;
		border-top: 1px solid #e5e7eb;
		padding: 0.75rem 1.5rem;
	}

	.timeline-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.timeline-label {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: #6b7280;
	}

	.timeline-count {
		font-size: 0.75rem;
		color: #9ca3af;
	}

	.timeline-track {
		position: relative;
		height: 2rem;
		background: #f3f4f6;
		border-radius: 0.25rem;
	}

	.timeline-empty {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 0.75rem;
		color: #9ca3af;
		font-style: italic;
	}

	.timeline-node {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
	}

	.node-dot {
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		border: 2px solid white;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.node-dot.orange {
		background: #f59e0b;
	}
	.node-dot.green {
		background: #10b981;
	}
	.node-dot.blue {
		background: #3b82f6;
	}
	.node-dot.purple {
		background: #8b5cf6;
	}
	.node-dot.red {
		background: #ef4444;
	}

	.timeline-node {
		cursor: pointer;
		transition: transform 0.2s;
	}

	.timeline-node:hover .node-dot {
		transform: scale(1.2);
	}

	.timeline-node.active .node-dot {
		width: 1.25rem;
		height: 1.25rem;
	}

	.node-label {
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-top: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: #1f2937;
		white-space: nowrap;
	}

	/* AI Chat Panel */
	.ai-chat-panel {
		position: fixed;
		right: 0;
		top: 0;
		bottom: 0;
		width: 400px;
		background: white;
		border-left: 1px solid #e5e7eb;
		display: flex;
		flex-direction: column;
		z-index: 100;
		box-shadow: -4px 0 12px rgba(0, 0, 0, 0.1);
	}

	.chat-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid #e5e7eb;
		background: #f9fafb;
	}

	.chat-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.chat-title h3 {
		font-size: 1rem;
		font-weight: 700;
		color: #1f2937;
		margin: 0;
	}

	.chat-status {
		font-size: 0.75rem;
		color: #6b7280;
		padding: 0.25rem 0.5rem;
		background: #e5e7eb;
		border-radius: 0.25rem;
	}

	.chat-status.connected {
		background: #d1fae5;
		color: #065f46;
	}

	.close-btn {
		padding: 0.25rem;
		background: transparent;
		border: none;
		color: #6b7280;
		cursor: pointer;
		border-radius: 0.25rem;
		transition: all 0.15s;
	}

	.close-btn:hover {
		background: #e5e7eb;
		color: #1f2937;
	}

	.chat-messages {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.chat-welcome {
		text-align: center;
		padding: 2rem 1rem;
		color: #6b7280;
	}

	.welcome-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: #1f2937;
		margin: 1rem 0 0.5rem;
	}

	.welcome-text {
		font-size: 0.875rem;
		margin-bottom: 1.5rem;
	}

	.quick-actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.quick-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem;
		background: #f3f4f6;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		color: #1f2937;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.15s;
		text-align: left;
	}

	.quick-btn:hover {
		background: #e5e7eb;
		border-color: #3b82f6;
	}

	.chat-message {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.chat-message.user .message-content {
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		margin-left: 2rem;
	}

	.chat-message.assistant .message-content {
		background: #f3f4f6;
		border: 1px solid #e5e7eb;
		margin-right: 2rem;
	}

	.message-content {
		display: flex;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		line-height: 1.5;
	}

	.streaming-content {
		color: #1f2937;
	}

	.message-meta {
		display: flex;
		gap: 1rem;
		font-size: 0.75rem;
		color: #6b7280;
		padding-left: 2.5rem;
	}

	.confidence {
		font-weight: 600;
	}

	.source {
		color: #9ca3af;
	}

	.thinking-indicator {
		display: flex;
		gap: 0.25rem;
		align-items: center;
	}

	.thinking-indicator .dot {
		width: 0.5rem;
		height: 0.5rem;
		background: #9ca3af;
		border-radius: 50%;
		animation: thinking 1.4s infinite;
	}

	.thinking-indicator .dot:nth-child(2) {
		animation-delay: 0.2s;
	}

	.thinking-indicator .dot:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes thinking {
		0%, 60%, 100% {
			opacity: 0.3;
			transform: scale(0.8);
		}
		30% {
			opacity: 1;
			transform: scale(1);
		}
	}

	.chat-input {
		display: flex;
		gap: 0.75rem;
		padding: 1rem 1.5rem;
		border-top: 1px solid #e5e7eb;
		background: white;
	}

	.chat-input textarea {
		flex: 1;
		padding: 0.75rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.875rem;
		resize: none;
		outline: none;
		transition: border-color 0.15s;
	}

	.chat-input textarea:focus {
		border-color: #3b82f6;
	}

	.send-btn {
		padding: 0.75rem 1rem;
		background: #3b82f6;
		border: none;
		border-radius: 0.5rem;
		color: white;
		cursor: pointer;
		transition: all 0.15s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.send-btn:hover:not(:disabled) {
		background: #2563eb;
	}

	.send-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.action-btn.active {
		background: #3b82f6;
		color: white;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.action-btn [class*="loader"] {
		animation: spin 1s linear infinite;
	}
</style>
