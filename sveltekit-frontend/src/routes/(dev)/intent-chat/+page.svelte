<!--
  Phase C demo page — intent-aware contextual chat.

  Renders the contextualChat rune store with per-message IntentBadge.
  Try one of each label exemplar to see badges light up. Press Enter to send.

  Route: /intent-chat  (under (dev) layout — no auth wrapper in dev mode)
-->
<script lang="ts">
	import { contextualChat } from '$lib/stores/contextual-chat.svelte';
	import IntentBadge from '$lib/components/intent/IntentBadge.svelte';

	let input = $state('');

	const exemplars = [
		{ label: 'legal_research',  text: 'search case law for hearsay precedent' },
		{ label: 'graph_search',    text: 'expand the neighborhood of this node in the graph' },
		{ label: 'gpu_rerank',      text: 'rerank these by the attention score' },
		{ label: 'evidence_upload', text: 'upload the pdf evidence and hash it' },
		{ label: 'schema_drift',    text: 'schema drift in postgres column types' },
		{ label: 'ui_bug',          text: 'the button click is broken in the modal' },
		{ label: 'fallback',        text: 'hello there how are you' },
	];

	async function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		const text = input.trim();
		if (!text) return;
		input = '';
		await contextualChat.send(text);
	}

	function loadExemplar(text: string) {
		input = text;
	}
</script>

<svelte:head>
	<title>Intent Chat (dev)</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-4 p-6">
	<header>
		<h1 class="text-xl font-semibold text-sand">Intent-aware contextual chat</h1>
		<p class="text-sm text-sand/60">
			Phase C demo. Each user message gets an inferred intent badge; assistant replies
			carry the chain trace. Click an exemplar to test each of the 6 labels + fallback.
		</p>
		<p class="text-xs text-sand/40 mt-1">
			Route: <code>POST /api/ai/contextual-chat</code> · Server re-runs <code>inferIntent</code> for defense-in-depth.
		</p>
	</header>

	<!-- Exemplar pills -->
	<div class="flex flex-wrap gap-2 text-xs">
		{#each exemplars as ex}
			<button
				type="button"
				class="rounded-full border border-panel bg-panelSoft px-3 py-1 text-sand hover:border-accent hover:text-accent"
				onclick={() => loadExemplar(ex.text)}
			>
				{ex.label}
			</button>
		{/each}
		<button
			type="button"
			class="ml-auto rounded-full border border-panel px-3 py-1 text-sand/60 hover:text-danger"
			onclick={() => contextualChat.clear()}
		>
			clear
		</button>
	</div>

	<!-- Message list -->
	<div class="space-y-3 rounded-lg border border-panel bg-panel/30 p-4 min-h-[300px]">
		{#if contextualChat.messages.length === 0}
			<p class="text-sm text-sand/40">
				No messages yet. Try an exemplar above or type your own.
			</p>
		{/if}

		{#each contextualChat.messages as msg, i (i)}
			{@const meta = msg.metadata as
				| { intent?: import('$lib/intent/regex-intent').IntentResult; route?: import('$lib/stores/contextual-chat.svelte').ContextualChatRoute }
				| undefined}
			<div class="flex flex-col gap-1">
				<div class="flex items-center gap-2 text-xs text-sand/50">
					<span class="font-mono uppercase">{msg.role}</span>
					{#if meta?.intent && msg.role === 'user'}
						<IntentBadge intent={meta.intent} route={meta.route} compact />
					{/if}
					{#if meta?.route && msg.role === 'assistant'}
						<IntentBadge intent={null} route={meta.route} compact />
					{/if}
				</div>
				<div
					class="rounded-md px-3 py-2 text-sm leading-relaxed"
					class:bg-panelSoft={msg.role === 'user'}
					class:bg-panel={msg.role !== 'user'}
					class:text-danger={msg.role === 'system'}
				>
					{msg.content}
				</div>
			</div>
		{/each}

		{#if contextualChat.isThinking}
			<div class="flex items-center gap-2 text-xs text-sand/60">
				<span class="inline-block h-2 w-2 animate-pulse rounded-full bg-accent"></span>
				dispatching…
			</div>
		{/if}
	</div>

	<!-- Composer -->
	<form onsubmit={onSubmit} class="flex gap-2">
		<input
			bind:value={input}
			type="text"
			placeholder="Type a query…"
			class="flex-1 rounded-md border border-panel bg-panelSoft px-3 py-2 text-sm text-sand placeholder:text-sand/40 focus:border-accent focus:outline-none"
			disabled={contextualChat.isThinking}
		/>
		<button
			type="submit"
			disabled={!input.trim() || contextualChat.isThinking}
			class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-panel hover:bg-accent/90 disabled:opacity-50"
		>
			Send
		</button>
	</form>

	{#if contextualChat.lastError}
		<div class="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
			{contextualChat.lastError}
		</div>
	{/if}

	{#if contextualChat.lastRoute}
		<details class="rounded-md border border-panel bg-panelSoft/50 p-3 text-xs">
			<summary class="cursor-pointer text-sand/70">last route trace</summary>
			<pre class="mt-2 overflow-auto text-[10px] text-sand/80">{JSON.stringify(contextualChat.lastRoute, null, 2)}</pre>
		</details>
	{/if}
</div>
