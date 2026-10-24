<script lang="ts">
	type AgUiEventV1 =
		| { type: 'RUN_STARTED'; threadId: string; runId: string; timestamp: string }
		| { type: 'TEXT_MESSAGE_START'; messageId: string; role: 'assistant' }
		| { type: 'TEXT_MESSAGE_CONTENT'; messageId: string; delta: string }
		| { type: 'TEXT_MESSAGE_END'; messageId: string }
		| { type: 'TOOL_CALL_START'; toolCallId: string; toolName: string }
		| { type: 'TOOL_CALL_ARGS'; toolCallId: string; argsDelta: string }
		| { type: 'TOOL_CALL_END'; toolCallId: string }
		| { type: 'TOOL_CALL_RESULT'; toolCallId: string; resultJson: string }
		| { type: 'RUN_FINISHED'; threadId: string; runId: string; receiptHash?: string }
		| { type: 'RUN_REFUSED'; threadId: string; runId: string; code: string; reason: string };

	let query = $state('Inspect Parent Atlas evidence alignment');
	let permissionTier = $state<'READ_ONLY' | 'DIAGNOSTIC_LOCAL' | 'AUTHORITY_ADMITTED'>('READ_ONLY');
	let streamStatus = $state<'IDLE' | 'CONNECTING' | 'STREAMING' | 'REFUSED' | 'COMPLETED'>('IDLE');
	let streamOutput = $state('');
	let events = $state<AgUiEventV1[]>([]);
	let receiptHash = $state<string | null>(null);
	let refusalReason = $state<string | null>(null);
	let traceId = $state(`trace-${Date.now()}`);

	async function runStudioAgent() {
		streamStatus = 'CONNECTING';
		streamOutput = '';
		events = [];
		receiptHash = null;
		refusalReason = null;
		traceId = `trace-${Date.now()}`;

		const runId = `run-${Date.now()}`;
		const threadId = `thread-studio-01`;

		try {
			const res = await fetch('/api/atlas/studio/stream', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'text/event-stream',
				},
				body: JSON.stringify({
					threadId,
					runId,
					query,
					permissionTier,
				}),
			});

			if (!res.ok) {
				streamStatus = 'REFUSED';
				refusalReason = `HTTP ${res.status}: ${res.statusText}`;
				return;
			}

			if (!res.body) {
				streamStatus = 'REFUSED';
				refusalReason = 'Empty response stream';
				return;
			}

			streamStatus = 'STREAMING';
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed.startsWith('data:')) continue;
					const jsonStr = trimmed.slice(5).trim();
					if (!jsonStr) continue;

					try {
						const ev = JSON.parse(jsonStr) as AgUiEventV1;
						events = [...events, ev];

						if (ev.type === 'TEXT_MESSAGE_CONTENT') {
							streamOutput += ev.delta;
						} else if (ev.type === 'RUN_FINISHED') {
							receiptHash = ev.receiptHash ?? null;
							streamStatus = 'COMPLETED';
						} else if (ev.type === 'RUN_REFUSED') {
							refusalReason = ev.reason;
							streamStatus = 'REFUSED';
						}
					} catch {
						// Ignore unparseable frames
					}
				}
			}

			if (streamStatus === 'STREAMING') {
				streamStatus = 'COMPLETED';
			}
		} catch (err) {
			streamStatus = 'REFUSED';
			refusalReason = err instanceof Error ? err.message : 'Network failure';
		}
	}
</script>

<svelte:head>
	<title>Parent Atlas Studio // AG-UI Agent Console</title>
</svelte:head>

<div class="p-6 max-w-6xl mx-auto space-y-6">
	<!-- Header / Status Banner -->
	<header class="border-b border-border pb-4 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-mono font-bold tracking-wider text-primary">
				PARENT ATLAS STUDIO // AG-UI
			</h1>
			<p class="text-xs text-muted-foreground font-mono">
				Headless AG-UI streaming via SvelteKit 2 + Drizzle ORM + PostgreSQL 18 (Zero Prisma).
			</p>
		</div>
		<div class="flex items-center gap-3">
			<span class="px-2.5 py-1 text-xs font-mono rounded border border-border bg-muted/40">
				Trace: {traceId}
			</span>
			<span
				class="px-2.5 py-1 text-xs font-mono font-bold rounded"
				class:bg-emerald-950={streamStatus === 'COMPLETED'}
				class:text-emerald-400={streamStatus === 'COMPLETED'}
				class:bg-amber-950={streamStatus === 'STREAMING' || streamStatus === 'CONNECTING'}
				class:text-amber-400={streamStatus === 'STREAMING' || streamStatus === 'CONNECTING'}
				class:bg-rose-950={streamStatus === 'REFUSED'}
				class:text-rose-400={streamStatus === 'REFUSED'}
				class:bg-muted={streamStatus === 'IDLE'}
				class:text-muted-foreground={streamStatus === 'IDLE'}
			>
				STATUS: {streamStatus}
			</span>
		</div>
	</header>

	<!-- System Gates & Invariant Status Cards -->
	<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
		<div class="p-4 rounded border border-border bg-card/60">
			<div class="text-xs text-muted-foreground font-mono">CANONICAL AUTHORITY</div>
			<div class="text-sm font-mono font-bold text-rose-400 mt-1">NOT ADMITTED</div>
			<div class="text-[10px] text-muted-foreground mt-1">Writes prevented fail-closed</div>
		</div>

		<div class="p-4 rounded border border-border bg-card/60">
			<div class="text-xs text-muted-foreground font-mono">DATABASE ORM</div>
			<div class="text-sm font-mono font-bold text-emerald-400 mt-1">DRIZZLE / PG18</div>
			<div class="text-[10px] text-muted-foreground mt-1">Prisma strictly excluded</div>
		</div>

		<div class="p-4 rounded border border-border bg-card/60">
			<div class="text-xs text-muted-foreground font-mono">PROTOCOL ADAPTER</div>
			<div class="text-sm font-mono font-bold text-sky-400 mt-1">HEADLESS AG-UI</div>
			<div class="text-[10px] text-muted-foreground mt-1">SSE streaming lifecycle</div>
		</div>

		<div class="p-4 rounded border border-border bg-card/60">
			<div class="text-xs text-muted-foreground font-mono">CLIENT PERSISTENCE</div>
			<div class="text-sm font-mono font-bold text-primary mt-1">INDEXEDDB STUB</div>
			<div class="text-[10px] text-muted-foreground mt-1">Offline receipt references</div>
		</div>
	</div>

	<!-- Control Panel -->
	<div class="p-4 rounded border border-border bg-card space-y-4">
		<div class="space-y-1">
			<label for="query" class="text-xs font-mono text-muted-foreground">DIAGNOSTIC QUERY</label>
			<input
				id="query"
				type="text"
				bind:value={query}
				class="w-full px-3 py-2 text-sm font-mono bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
				placeholder="Enter inspection query..."
			/>
		</div>

		<div class="flex items-center justify-between">
			<div class="flex items-center gap-3">
				<label for="tier" class="text-xs font-mono text-muted-foreground">PERMISSION TIER:</label>
				<select
					id="tier"
					bind:value={permissionTier}
					class="px-2.5 py-1 text-xs font-mono bg-background border border-border rounded"
				>
					<option value="READ_ONLY">READ_ONLY (Safe Diagnostic)</option>
					<option value="DIAGNOSTIC_LOCAL">DIAGNOSTIC_LOCAL (Local Eval)</option>
					<option value="AUTHORITY_ADMITTED">AUTHORITY_ADMITTED (Gated Refusal)</option>
				</select>
			</div>

			<button
				onclick={runStudioAgent}
				disabled={streamStatus === 'CONNECTING' || streamStatus === 'STREAMING'}
				class="px-4 py-1.5 text-xs font-mono font-bold bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50"
			>
				{streamStatus === 'STREAMING' ? 'STREAMING...' : 'RUN AGENT STREAM'}
			</button>
		</div>
	</div>

	<!-- Output Console -->
	<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
		<!-- Stream Text Display -->
		<div class="md:col-span-2 p-4 rounded border border-border bg-black/80 font-mono text-xs space-y-2 min-h-[280px]">
			<div class="text-muted-foreground text-[10px] border-b border-border/40 pb-1 flex justify-between">
				<span>AGENT RESPONSE STREAM</span>
				{#if receiptHash}
					<span class="text-emerald-400 truncate max-w-[300px]">RECEIPT: {receiptHash}</span>
				{/if}
			</div>

			{#if refusalReason}
				<div class="p-3 border border-rose-800 bg-rose-950/40 text-rose-300 rounded">
					[REFUSAL EVENT]: {refusalReason}
				</div>
			{:else if streamOutput}
				<pre class="whitespace-pre-wrap text-foreground/90 leading-relaxed">{streamOutput}</pre>
			{:else}
				<div class="text-muted-foreground italic py-12 text-center">
					Click "RUN AGENT STREAM" to initiate headless AG-UI session...
				</div>
			{/if}
		</div>

		<!-- Protocol Event Log -->
		<div class="p-4 rounded border border-border bg-card/40 font-mono text-xs space-y-2">
			<div class="text-muted-foreground text-[10px] border-b border-border/40 pb-1">
				PROTOCOL EVENTS ({events.length})
			</div>
			<div class="space-y-1.5 max-h-[280px] overflow-y-auto">
				{#each events as ev, i}
					<div class="p-1.5 rounded bg-muted/30 border border-border/30 text-[11px]">
						<span class="font-bold text-primary">[{ev.type}]</span>
						{#if ev.type === 'TEXT_MESSAGE_CONTENT'}
							<span class="text-muted-foreground truncate block">delta: "{ev.delta.slice(0, 30)}..."</span>
						{:else if ev.type === 'RUN_FINISHED'}
							<span class="text-emerald-400 block truncate">receipt: {ev.receiptHash?.slice(0, 16)}...</span>
						{:else if ev.type === 'RUN_REFUSED'}
							<span class="text-rose-400 block">{ev.code}: {ev.reason.slice(0, 30)}...</span>
						{/if}
					</div>
				{/each}
				{#if events.length === 0}
					<div class="text-muted-foreground italic py-8 text-center text-[10px]">
						No events captured yet
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
