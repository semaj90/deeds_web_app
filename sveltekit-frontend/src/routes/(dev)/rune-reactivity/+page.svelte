<script lang="ts">
	let message = $state('runes sync');
	let count = $state(1);
	let enabled = $state(true);
	let history = $state<string[]>(['initialized']);
	let lastAction = $state('idle');

	const trimmed = $derived(message.trim());
	const derivedSummary = $derived.by(() => ({
		status: enabled ? 'active' : 'paused',
		count: count,
		length: trimmed.length,
		label: trimmed ? trimmed.toUpperCase() : 'EMPTY',
		product: count * (enabled ? 2 : 0),
	}));

	function push(entry: string) {
		history = [...history.slice(-5), entry];
		lastAction = entry;
	}

	function bump(step: number) {
		count += step;
		push(`count ${step > 0 ? '+' : ''}${step} → ${count}`);
	}

	function reset() {
		message = 'runes sync';
		count = 1;
		enabled = true;
		history = ['reset'];
		lastAction = 'reset';
	}
</script>

<svelte:head>
	<title>Rune Reactivity Smoke</title>
</svelte:head>

<div class="page">
	<header class="hero">
		<p class="eyebrow">Dev smoke test</p>
		<h1>Svelte 5 rune reactivity</h1>
		<p class="subtitle">
			Exercises local `$state`, `$derived`, and `$effect` updates without server sync.
			Type, toggle, and click buttons to verify updates propagate immediately.
		</p>
	</header>

	<section class="grid">
		<div class="panel">
			<label for="message">Message</label>
			<input id="message" bind:value={message} class="input" placeholder="Type here" />
			<div class="meta">trimmed: <code>{trimmed || '∅'}</code></div>
		</div>

		<div class="panel">
			<label>Count</label>
			<div class="row">
				<button type="button" onclick={() => bump(-1)}>-1</button>
				<div class="count">{count}</div>
				<button type="button" onclick={() => bump(1)}>+1</button>
			</div>
			<div class="meta">derived product: <code>{derivedSummary.product}</code></div>
		</div>

		<div class="panel">
			<label>Enabled</label>
			<button type="button" class="toggle" onclick={() => { enabled = !enabled; push(`enabled → ${enabled}`); }}>
				{enabled ? 'enabled' : 'paused'}
			</button>
			<div class="meta">status: <code>{derivedSummary.status}</code></div>
		</div>

		<div class="panel">
			<label>Derived snapshot</label>
			<pre>{JSON.stringify(derivedSummary, null, 2)}</pre>
		</div>
	</section>

	<section class="panel wide">
		<div class="row between">
			<div>
				<label>Reactive trace</label>
				<p class="meta">last action: <code>{lastAction}</code></p>
			</div>
			<button type="button" class="reset" onclick={reset}>Reset</button>
		</div>
		<ul>
			{#each history as item}
				<li>{item}</li>
			{/each}
		</ul>
	</section>
</div>

<style>
	.page {
		min-height: 100vh;
		padding: 2rem;
		background: #0e0d0b;
		color: rgb(245 240 223);
	}

	.hero {
		max-width: 60rem;
		margin-bottom: 1.5rem;
	}

	.eyebrow {
		margin: 0 0 0.5rem;
		font-size: 0.72rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: rgba(212, 199, 163, 0.5);
	}

	h1 {
		margin: 0;
		font-size: clamp(2rem, 4vw, 3rem);
		line-height: 1.05;
	}

	.subtitle {
		margin: 0.75rem 0 0;
		max-width: 50rem;
		color: rgba(212, 199, 163, 0.72);
		line-height: 1.6;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 1rem;
	}

	.panel {
		padding: 1rem;
		border: 1px solid rgba(212, 199, 163, 0.12);
		border-radius: 14px;
		background: rgba(19, 21, 25, 0.92);
	}

	.panel.wide {
		margin-top: 1rem;
	}

	label {
		display: block;
		margin-bottom: 0.5rem;
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: rgba(212, 199, 163, 0.55);
	}

	.input {
		width: 100%;
		padding: 0.75rem 0.9rem;
		border: 1px solid rgba(212, 199, 163, 0.14);
		border-radius: 10px;
		background: rgba(14, 13, 11, 0.8);
		color: inherit;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.between {
		justify-content: space-between;
	}

	button {
		border: 1px solid rgba(212, 199, 163, 0.16);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.04);
		color: inherit;
		padding: 0.55rem 0.8rem;
		cursor: pointer;
	}

	.toggle {
		min-width: 7.5rem;
	}

	.reset {
		background: rgba(96, 165, 250, 0.12);
		border-color: rgba(96, 165, 250, 0.22);
	}

	.count {
		min-width: 3rem;
		text-align: center;
		font-size: 1.4rem;
		font-weight: 700;
	}

	.meta {
		margin-top: 0.75rem;
		font-size: 0.82rem;
		color: rgba(212, 199, 163, 0.62);
	}

	code,
	pre {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	}

	pre {
		margin: 0.75rem 0 0;
		padding: 0.75rem;
		border-radius: 10px;
		background: rgba(14, 13, 11, 0.8);
		overflow: auto;
	}

	ul {
		margin: 0.75rem 0 0;
		padding-left: 1.25rem;
		color: rgba(212, 199, 163, 0.8);
	}
</style>
