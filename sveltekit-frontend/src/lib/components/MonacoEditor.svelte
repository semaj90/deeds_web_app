<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		value?: string;
		language?: 'json' | 'typescript' | 'javascript' | 'text' | 'sql' | 'markdown';
		readonly?: boolean;
		height?: string;
		onchange?: (value: string) => void;
		class?: string;
	}

	let {
		value = $bindable(''),
		language = 'json',
		readonly = false,
		height = '400px',
		onchange,
		class: className = ''
	}: Props = $props();

	let lineCount = $derived(value.split('\n').length);
	let error = $state<string | null>(null);

	function handleInput(e: Event) {
		const textarea = e.target as HTMLTextAreaElement;
		value = textarea.value;
		error = null;
		onchange?.(value);
	}

	function formatJSON() {
		if (language !== 'json') return;
		try {
			const parsed = JSON.parse(value);
			value = JSON.stringify(parsed, null, 2);
			error = null;
			onchange?.(value);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Invalid JSON';
		}
	}

	function minifyJSON() {
		if (language !== 'json') return;
		try {
			const parsed = JSON.parse(value);
			value = JSON.stringify(parsed);
			error = null;
			onchange?.(value);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Invalid JSON';
		}
	}

	function validateJSON() {
		if (language !== 'json') return;
		try {
			JSON.parse(value);
			error = null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Invalid JSON';
		}
	}

	function copyToClipboard() {
		navigator.clipboard.writeText(value).catch(() => {});
	}

	function handleKeydown(e: KeyboardEvent) {
		if (readonly) return;
		const textarea = e.target as HTMLTextAreaElement;

		// Tab key inserts tab character
		if (e.key === 'Tab') {
			e.preventDefault();
			const start = textarea.selectionStart;
			const end = textarea.selectionEnd;
			value = value.substring(0, start) + '\t' + value.substring(end);
			onchange?.(value);
			// Restore cursor position after Svelte updates the DOM
			requestAnimationFrame(() => {
				textarea.selectionStart = textarea.selectionEnd = start + 1;
			});
		}

		// Ctrl+Shift+F = format
		if (e.ctrlKey && e.shiftKey && e.key === 'F') {
			e.preventDefault();
			formatJSON();
		}
	}
</script>

<div class="flex flex-col border border-stone-700 rounded-lg overflow-hidden bg-[#0c0a09] {className}">
	<!-- Toolbar -->
	<div class="flex items-center justify-between px-3 py-2 border-b border-stone-800 bg-[#1c1917]">
		<div class="flex items-center gap-2">
			<Icon name="code" size={14} class="text-emerald-400" />
			<span class="text-[11px] font-mono text-stone-400 uppercase tracking-wider">{language}</span>
			<span class="text-[10px] text-stone-600">{lineCount} lines</span>
		</div>
		<div class="flex items-center gap-1.5">
			{#if language === 'json'}
				<button
					class="px-2 py-0.5 text-[10px] font-mono rounded border border-stone-700 bg-transparent text-stone-500 hover:text-white hover:border-emerald-600 cursor-pointer transition-colors"
					onclick={formatJSON}
					title="Format JSON (Ctrl+Shift+F)"
				>Format</button>
				<button
					class="px-2 py-0.5 text-[10px] font-mono rounded border border-stone-700 bg-transparent text-stone-500 hover:text-white hover:border-stone-500 cursor-pointer transition-colors"
					onclick={minifyJSON}
				>Minify</button>
				<button
					class="px-2 py-0.5 text-[10px] font-mono rounded border border-stone-700 bg-transparent text-stone-500 hover:text-white hover:border-stone-500 cursor-pointer transition-colors"
					onclick={validateJSON}
				>Validate</button>
			{/if}
			<button
				class="p-1 rounded bg-transparent border-none text-stone-600 hover:text-emerald-400 cursor-pointer transition-colors"
				onclick={copyToClipboard}
				title="Copy to clipboard"
			>
				<Icon name="copy" size={14} />
			</button>
		</div>
	</div>

	<!-- Editor Area -->
	<div class="flex" style:height>
		<!-- Line Numbers -->
		<div class="shrink-0 py-3 px-2 bg-[#141210] border-r border-stone-800 text-right select-none overflow-hidden">
			{#each Array(lineCount) as _, i}
				<div class="text-[11px] font-mono text-stone-700 leading-5 h-5">{i + 1}</div>
			{/each}
		</div>

		<!-- Textarea -->
		<textarea
			{value}
			oninput={handleInput}
			onkeydown={handleKeydown}
			{readonly}
			spellcheck={false}
			class="flex-1 bg-transparent text-stone-200 font-mono text-[13px] leading-5 p-3 resize-none outline-none border-none w-full"
			class:text-stone-400={readonly}
			class:cursor-not-allowed={readonly}
			style="tab-size: 2;"
		></textarea>
	</div>

	<!-- Error/Status Bar -->
	{#if error}
		<div class="flex items-center gap-2 px-3 py-1.5 border-t border-red-900/50 bg-red-950/30 text-red-300 text-[11px]">
			<Icon name="alert-circle" size={12} />
			<span>{error}</span>
		</div>
	{/if}
</div>
