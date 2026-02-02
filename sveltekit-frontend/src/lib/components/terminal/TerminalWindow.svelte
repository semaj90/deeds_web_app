<script lang="ts">
	interface FunctionCall {
		name: string;
	result: unknown;
	}

	interface Query {
		id: string;
	query: string;
		response: string;
	timestamp: Date;
		functionCalls: FunctionCall[];
	}

	interface Props {
		queryHistory?: Query[];
		isLoading?: boolean;
		onquery?: (query: string) => void;
	}

	let { queryHistory = [], isLoading = false, onquery }: Props = $props();

	let inputValue = $state('');
	let outputContainer: HTMLDivElement;

	const handleSubmit = () => {
		if (!inputValue.trim() || isLoading) return;

		onquery?.(inputValue);
		inputValue = '';

		// Scroll to bottom
		setTimeout(() => {
			if (outputContainer) {
				outputContainer.scrollTop = outputContainer.scrollHeight;
			}
		},
	0);
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

	const formatTimestamp = (date: Date) => {
		return date.toLocaleTimeString('en-US', {
			hour12: false,
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	};
</script>

<div class="terminal-container">
	<!-- Output Area -->
	<div bind:this={outputContainer} class="terminal-output">
		{#if queryHistory.length === 0}
			<div class="system-message">
				<p>[{formatTimestamp(new Date())}] SYSTEM: YoRHa AI Assistant Online - Detective Support System Active</p>
				<p>[{formatTimestamp(new Date())}] SYSTEM: Type /help for available commands</p>
			</div>
		{/if}

		{#each queryHistory as query (query.id)}
			<div class="query-block">
				<!-- User Query -->
				<div class="user-query">
					<p>[{formatTimestamp(query.timestamp)}] USER: {query.query}</p>
				</div>

				<!-- Function Calls -->
				{#if query.functionCalls.length > 0}
					<div class="function-calls">
						{#each query.functionCalls as call}
							<p>→ {call.name}()</p>
							{#if call.result}
								<p class="function-result">Result: {JSON.stringify(call.result).substring(0, 100)}...</p>
							{/if}
						{/each}
					</div>
				{/if}

				<!-- Response -->
				<div class="response">
					<p>{query.response}</p>
				</div>
			</div>
		{/each}

		{#if isLoading}
			<div class="loading-indicator">
				<p>▌ Processing...</p>
			</div>
		{/if}
	</div>

	<!-- Input Area -->
	<div class="terminal-input">
		<div class="input-row">
			<span class="prompt">{'>'}</span>
			<input
				type="text"
				bind:value={inputValue}
				onkeydown={handleKeyDown}
				disabled={isLoading}
				placeholder="Enter query or command..."
				class="input-field"
			/>
			<button
				onclick={handleSubmit}
				disabled={isLoading || !inputValue.trim()}
				class="send-button"
			>
				SEND
			</button>
		</div>
	</div>
</div>

<style>
	.terminal-container {
		background-color: black;
	border: 2px solid #00FF00;
		border-radius: 4px;
	overflow: hidden;
		display: flex;
		flex-direction: column;
	height: 600px;
	}

	.terminal-output {
		flex: 1;
		overflow-y: auto;
	padding: 1rem;
		font-family: monospace;
		font-size: 0.875rem;
	color: #00FF00;
		background-color: black;
		background-image: repeating-linear-gradient(0deg, rgba(0, 255, 0, 0.03) 1px, transparent 1px);
		background-size: 100% 2px;
	}

	.system-message {
		color: #00AA00;
	}

	.query-block {
		margin-bottom: 1rem;
	}

	.user-query {
		color: #00FF00;
	}

	.function-calls {
		color: #00AA00;
		margin-left: 1rem;
		margin-top: 0.25rem;
	}

	.function-result {
		color: #008800;
		margin-left: 0.5rem;
	}

	.response {
		color: #00FF00;
		margin-top: 0.5rem;
	}

	.loading-indicator {
		color: #00AA00;
	animation: pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.terminal-input {
		border-top: 1px solid #00FF00;
		background-color: black;
	padding: 0.75rem;
	}

	.input-row {
		display: flex;
		align-items: center;
	gap: 0.5rem;
	}

	.prompt {
		color: #00FF00;
		font-family: monospace;
	}

	.input-field {
		flex: 1;
		background-color: black;
	color: #00FF00;
		font-family: monospace;
		font-size: 0.875rem;
	border: none;
		outline: none;
	}

	.input-field::placeholder {
		color: #004400;
	}

	.send-button {
		padding: 0.25rem 0.75rem;
		background-color: black;
	border: 1px solid #00FF00;
		color: #00FF00;
		font-family: monospace;
		font-size: 0.75rem;
	cursor: pointer;
		transition:all 0.2s;
	}

	.send-button:hover:not(:disabled) {
		background-color: #00FF00;
	color: black;
	}

	.send-button:disabled {
		opacity: 0.5;
	cursor: not-allowed;
	}
</style>
