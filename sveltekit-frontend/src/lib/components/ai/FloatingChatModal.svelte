<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { ChatSession, type GlossaryMatch } from '$lib/models/ChatSession.svelte.js';
	import { onDestroy, untrack } from 'svelte';

	interface Props {
		open?: boolean;
		caseId?: string;
		currentRoute?: string;
	}

	let { open = $bindable(false), caseId = '', currentRoute = '' }: Props = $props();

	let inputText = $state('');
	let pendingAttachment = $state<File | null>(null);
	let messagesEnd = $state<HTMLElement | null>(null);
	let genericSessionId = $state(`conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
	let savingGlossaryKeys = $state<Record<string, boolean>>({});
	let savedGlossaryKeys = $state<Record<string, boolean>>({});
	let glossaryActionErrors = $state<Record<string, string>>({});

	function createSessionId(): string {
		if (caseId) return `case-${caseId}`;
		return genericSessionId;
	}

	function createSession() {
		return new ChatSession(createSessionId(), [], !!caseId);
	}

	let session = $state<ChatSession>(untrack(() => createSession()));
	let isStreaming = $derived(session.status === 'thinking' || session.status === 'streaming');
	let attachmentStateBanner = $derived.by(() => {
		for (let index = session.messages.length - 1; index >= 0; index -= 1) {
			const message = session.messages[index];
			if (message.role !== 'system') continue;

			if (message.content.startsWith('Attachment indexed for retrieval: ')) {
				return {
					tone: 'success' as const,
					label: 'Attachment Ready',
					icon: 'i-lucide-badge-check',
					text: message.content
				};
			}

			if (message.content.startsWith('Attachment retrieval indexing deferred for ')) {
				return {
					tone: 'warning' as const,
					label: 'Attachment Status',
					icon: 'i-lucide-clock-3',
					text: message.content
				};
			}
		}

		return null;
	});
	let attachmentBannerClasses = $derived(
		attachmentStateBanner?.tone === 'success'
			? 'border border-accent/30 bg-accent/10 text-accent'
			: 'border border-warning/30 bg-warning/10 text-warning/90'
	);
	let attachmentBannerLabelClasses = $derived(
		attachmentStateBanner?.tone === 'success' ? 'text-accent/70' : 'text-warning/70'
	);

	onDestroy(() => {
		session.destroy();
	});

	$effect(() => {
		const nextId = createSessionId();
		if (session.chatId !== nextId) {
			session.destroy();
			session = createSession();
			savingGlossaryKeys = {};
			savedGlossaryKeys = {};
			glossaryActionErrors = {};
		}
	});

	$effect(() => {
		session.currentRoute = currentRoute;
	});

	$effect(() => {
		// Scroll to bottom whenever messages change
		if (messagesEnd && session.messages.length > 0) {
			messagesEnd.scrollIntoView({ behavior: 'smooth' });
		}
	});

	async function sendMessage() {
		const text = inputText.trim() || (pendingAttachment
			? `Please analyze the attached document "${pendingAttachment.name}".`
			: '');
		if ((!text && !pendingAttachment) || session.status !== 'idle') return;

		const attachment = pendingAttachment;
		inputText = '';
		pendingAttachment = null;

		try {
			await session.sendMessage(text, {
				attachment,
				forceServer: !!attachment
			});
		} catch (e) {
			session.error = e instanceof Error ? e.message : 'Unknown error';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	function handleAttachmentChange(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		pendingAttachment = target.files?.[0] ?? null;
	}

	function glossaryKey(match: GlossaryMatch): string {
		return [match.term, match.source, match.citation ?? '', match.sourceNodeId ?? '']
			.join('::')
			.toLowerCase();
	}

	async function saveGlossaryMatch(match: GlossaryMatch) {
		if (!caseId) return;

		const key = glossaryKey(match);
		if (savingGlossaryKeys[key] || savedGlossaryKeys[key]) return;

		savingGlossaryKeys = { ...savingGlossaryKeys, [key]: true };
		glossaryActionErrors = { ...glossaryActionErrors, [key]: '' };

		try {
			await session.saveGlossaryConcept(match);
			savedGlossaryKeys = { ...savedGlossaryKeys, [key]: true };
		} catch (error) {
			glossaryActionErrors = {
				...glossaryActionErrors,
				[key]: error instanceof Error ? error.message : 'Failed to save concept'
			};
		} finally {
			savingGlossaryKeys = { ...savingGlossaryKeys, [key]: false };
		}
	}

	function clear() {
		session.destroy();
		if (!caseId) {
			genericSessionId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
		}
		savingGlossaryKeys = {};
		savedGlossaryKeys = {};
		glossaryActionErrors = {};
		session = createSession();
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />

		<Dialog.Content
			class="fixed bottom-24 right-6 z-50 flex flex-col w-[420px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-8rem)] bg-panel border border-sand/20 rounded-xl shadow-2xl overflow-hidden"
		>
			<!-- Header -->
			<div class="flex items-center justify-between px-4 py-3 border-b border-sand/10 flex-shrink-0">
				<div class="flex items-center gap-2">
					<span class="i-lucide-brain-circuit w-4 h-4 text-warning inline-block"></span>
					<Dialog.Title class="font-mono text-sm font-semibold text-sand/90">
						AI CONTEXTUAL CHAT
					</Dialog.Title>
					{#if caseId}
						<span class="text-[10px] font-mono text-warning/70 bg-warning/10 px-1.5 py-0.5 rounded">
							{caseId.slice(0, 12)}…
						</span>
					{:else if currentRoute}
						<span class="text-[10px] font-mono text-accent/60 bg-accent/8 px-1.5 py-0.5 rounded">
							{currentRoute.split('/').filter(Boolean).slice(-1)[0] || 'home'}
						</span>
					{/if}
				</div>
				<div class="flex items-center gap-1">
					{#if session.messages.length > 0}
						<button
							type="button"
							onclick={clear}
							class="text-sand/40 hover:text-sand/70 transition-colors p-1 rounded"
							title="Clear conversation"
						>
							<span class="i-lucide-rotate-ccw w-3.5 h-3.5 inline-block"></span>
						</button>
					{/if}
					<Dialog.Close
						class="text-sand/40 hover:text-sand/70 transition-colors p-1 rounded"
						aria-label="Close"
					>
						<span class="i-lucide-x w-4 h-4 inline-block"></span>
					</Dialog.Close>
				</div>
			</div>

			{#if attachmentStateBanner}
				<div
					class={`mx-4 mt-3 rounded-lg px-3 py-2 text-[11px] font-mono flex items-start gap-2 flex-shrink-0 ${attachmentBannerClasses}`}
				>
					<span class="{attachmentStateBanner.icon} w-3.5 h-3.5 inline-block mt-0.5 flex-shrink-0"></span>
					<div>
						<div class={`text-[10px] uppercase tracking-wide ${attachmentBannerLabelClasses}`}>
							{attachmentStateBanner.label}
						</div>
						<div>{attachmentStateBanner.text}</div>
					</div>
				</div>
			{/if}

			<!-- Messages -->
			<div class="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
				{#if session.messages.length === 0}
					<div class="h-full flex flex-col items-center justify-center text-center gap-3 text-sand/40">
						<span class="i-lucide-message-square-dashed w-10 h-10 inline-block opacity-30"></span>
						<p class="text-xs font-mono">
							Ask anything about this case,<br />evidence, statutes, or legal procedure.
						</p>
						{#if caseId}
							<p class="text-[10px] text-warning/50">RAG+KAG context active</p>
						{/if}
					</div>
				{:else}
					{#each session.messages as msg, idx}
						<div class="flex flex-col {msg.role === 'user' ? 'items-end' : 'items-start'} gap-1">
							<div
								class="max-w-[85%] px-3 py-2 rounded-lg text-xs font-mono leading-relaxed whitespace-pre-wrap
									{msg.role === 'user'
										? 'bg-warning/15 text-warning/90 border border-warning/20'
										: msg.role === 'system'
											? 'bg-accent/10 text-accent border border-accent/20'
										: session.status === 'error' && idx === session.messages.length - 1
											? 'bg-danger/10 text-danger/80 border border-danger/20'
											: 'bg-panelSoft text-sand/85 border border-sand/10'}"
							>
								{#if msg.role === 'assistant' && idx === session.messages.length - 1 && session.status === 'streaming' && !msg.content}
									<span class="inline-flex gap-0.5">
										<span class="w-1 h-1 bg-sand/50 rounded-full animate-bounce" style="animation-delay:0ms"></span>
										<span class="w-1 h-1 bg-sand/50 rounded-full animate-bounce" style="animation-delay:150ms"></span>
										<span class="w-1 h-1 bg-sand/50 rounded-full animate-bounce" style="animation-delay:300ms"></span>
									</span>
								{:else}
									{msg.content}
								{/if}
							</div>
							{#if msg.role === 'assistant' && msg.metadata?.glossaryMatches && msg.metadata.glossaryMatches.length > 0}
								<div class="max-w-[85%] w-full rounded-lg border border-info/20 bg-info/8 px-3 py-2 text-[11px] font-mono text-sand/80">
									<div class="mb-2 flex items-center justify-between gap-2">
										<div class="text-[10px] uppercase tracking-[0.16em] text-info/70">
											Legal Definitions Used
										</div>
										{#if caseId}
											<div class="text-[10px] text-sand/40">Save to case context</div>
										{/if}
									</div>
									<div class="space-y-2">
										{#each msg.metadata.glossaryMatches as match}
											{@const matchKey = glossaryKey(match)}
											<div class="rounded-md border border-sand/10 bg-panel/70 px-2.5 py-2">
												<div class="flex items-start justify-between gap-2">
													<div class="min-w-0">
														<div class="text-[11px] font-semibold text-info/90">{match.term}</div>
														<div class="mt-1 text-[10px] leading-relaxed text-sand/65">{match.definition}</div>
													</div>
													{#if caseId}
														<button
															type="button"
															onclick={() => saveGlossaryMatch(match)}
															disabled={savingGlossaryKeys[matchKey] || savedGlossaryKeys[matchKey]}
															class="shrink-0 rounded-md border px-2 py-1 text-[10px] uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-60 {savedGlossaryKeys[matchKey] ? 'border-accent/30 bg-accent/12 text-accent' : 'border-info/30 bg-info/12 text-info hover:border-info/45 hover:bg-info/18'}"
														>
															{#if savedGlossaryKeys[matchKey]}
																Saved
															{:else if savingGlossaryKeys[matchKey]}
																Saving...
															{:else}
																Save
															{/if}
														</button>
													{/if}
												</div>
												<div class="mt-2 flex flex-wrap gap-1.5 text-[10px] text-sand/45">
													<span class="rounded bg-sand/8 px-1.5 py-0.5">{match.source}</span>
													{#if match.jurisdiction}
														<span class="rounded bg-sand/8 px-1.5 py-0.5">{match.jurisdiction}</span>
													{/if}
													{#if match.citation}
														<span class="rounded bg-sand/8 px-1.5 py-0.5">{match.citation}</span>
													{/if}
													{#if match.confidence !== undefined && match.confidence !== null}
														<span class="rounded bg-sand/8 px-1.5 py-0.5">{Math.round(match.confidence * 100)}%</span>
													{/if}
												</div>
												{#if glossaryActionErrors[matchKey]}
													<div class="mt-1.5 text-[10px] text-danger/80">{glossaryActionErrors[matchKey]}</div>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/if}
							{#if msg.role === 'assistant' && msg.metadata?.confidence !== undefined}
								<span class="text-[9px] font-mono text-sand/30">
									confidence {Math.round(msg.metadata.confidence * 100)}%
								</span>
							{/if}
						</div>
					{/each}
					<div bind:this={messagesEnd}></div>
				{/if}
			</div>

			<!-- Input -->
			<div class="flex-shrink-0 border-t border-sand/10 p-3">
				<div class="mb-2 flex items-center gap-2">
					<label class="inline-flex items-center justify-center rounded-lg border border-sand/15 bg-panelSoft px-2 py-1 text-[11px] font-mono text-sand/65 hover:border-warning/40 hover:text-warning cursor-pointer transition-colors">
						<span class="i-lucide-paperclip mr-1 w-3.5 h-3.5 inline-block"></span>
						Attach
						<input type="file" class="hidden" onchange={handleAttachmentChange} />
					</label>
					{#if pendingAttachment}
						<span class="text-[10px] font-mono text-sand/45">{pendingAttachment.name}</span>
					{/if}
				</div>
				<div class="flex gap-2 items-end">
					<textarea
						bind:value={inputText}
						onkeydown={handleKeydown}
						placeholder="Ask about evidence, statutes, case law…"
						rows="2"
						disabled={isStreaming}
						class="flex-1 resize-none bg-panelSoft border border-sand/15 rounded-lg px-3 py-2 text-xs font-mono text-sand/85 placeholder-sand/30 focus:outline-none focus:border-warning/40 disabled:opacity-50 transition-colors"
					></textarea>
					<button
						type="button"
						onclick={sendMessage}
						disabled={isStreaming || (!inputText.trim() && !pendingAttachment)}
						class="flex-shrink-0 p-2.5 rounded-lg bg-warning/20 border border-warning/30 text-warning hover:bg-warning/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
						title="Send (Enter)"
					>
						{#if isStreaming}
							<span class="i-lucide-loader-2 w-4 h-4 inline-block animate-spin"></span>
						{:else}
							<span class="i-lucide-send w-4 h-4 inline-block"></span>
						{/if}
					</button>
				</div>
				<p class="text-[9px] font-mono text-sand/25 mt-1.5 pl-1">Enter to send · Shift+Enter for newline</p>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
