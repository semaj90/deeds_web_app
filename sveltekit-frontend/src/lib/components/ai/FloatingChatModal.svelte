<script lang="ts">
	import { Dialog } from 'bits-ui';

	interface Message {
		role: 'user' | 'assistant' | 'system';
		content: string;
		status?: 'streaming' | 'done' | 'error';
		confidence?: number;
	}

	interface AttachmentIngestResult {
		title?: string;
		filename?: string;
		extractionMethod?: string;
		contentPreview?: string;
		yoloLabels?: string[];
	}

	interface Props {
		open?: boolean;
		caseId?: string;
		currentRoute?: string;
	}

	let { open = $bindable(false), caseId = '', currentRoute = '' }: Props = $props();

	let messages = $state<Message[]>([]);
	let inputText = $state('');
	let pendingAttachment = $state<File | null>(null);
	let isStreaming = $state(false);
	let messagesEnd = $state<HTMLElement | null>(null);
	// Stable conversation ID for the session this modal is open
	let conversationId = $state(`conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);

	function normalizeAttachmentPreview(value: string | undefined, maxLength = 320): string {
		if (!value) return '';
		const normalized = value.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
		if (normalized.length <= maxLength) return normalized;
		return normalized.slice(0, maxLength) + '...';
	}

	$effect(() => {
		// Reset conversation when modal is re-opened fresh
		if (open && messages.length === 0) {
			conversationId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
		}
	});

	$effect(() => {
		// Scroll to bottom whenever messages change
		if (messagesEnd) {
			messagesEnd.scrollIntoView({ behavior: 'smooth' });
		}
	});

	async function ingestAttachment(file: File): Promise<AttachmentIngestResult> {
		const formData = new FormData();
		formData.set('file', file, file.name);
		if (caseId) {
			formData.set('caseId', caseId);
		}

		const response = await fetch('/api/ace/ingest', {
			method: 'POST',
			body: formData
		});

		const payload = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new Error(payload.error || `Attachment ingest failed: HTTP ${response.status}`);
		}

		return payload as AttachmentIngestResult;
	}

	async function sendMessage() {
		const text = inputText.trim() || (pendingAttachment
			? `Please analyze the attached document "${pendingAttachment.name}".`
			: '');
		if ((!text && !pendingAttachment) || isStreaming) return;

		const attachment = pendingAttachment;
		inputText = '';
		pendingAttachment = null;

		messages.push({ role: 'user', content: text, status: 'done' });
		messages.push({ role: 'assistant', content: '', status: 'streaming' });
		isStreaming = true;

		try {
			let routedText = text;
			if (attachment) {
				messages.splice(messages.length - 1, 0, {
					role: 'system',
					content: `Indexing attachment: ${attachment.name}`,
					status: 'done'
				});

				const attachmentResult = await ingestAttachment(attachment);
				const title = attachmentResult.title || attachmentResult.filename || attachment.name;
				const details = [`Attachment ready: ${title}`];
				if (attachmentResult.extractionMethod) {
					details.push(`via ${attachmentResult.extractionMethod}`);
				}
				if (attachmentResult.yoloLabels?.length) {
					details.push(`YOLO: ${attachmentResult.yoloLabels.join(', ')}`);
				}
				messages.splice(messages.length - 1, 0, {
					role: 'system',
					content: details.join(' · '),
					status: 'done'
				});
				const normalizedPreview = normalizeAttachmentPreview(attachmentResult.contentPreview);
				const previewBlock = normalizedPreview
					? `\n\nATTACHMENT SOURCE TEXT PROVIDED BELOW. Do not ask the user to provide it again.\n[ATTACHMENT SOURCE START]\n${normalizedPreview}\n[ATTACHMENT SOURCE END]`
					: '';
				routedText = `${text}\n\nFresh attachment uploaded just now: "${title}".${previewBlock}\n\nUse the attachment source text above and any retrieved ACE context from this attachment as the primary basis for your answer. Quote or cite the attached source when answering. If the attachment source text is present above, do not ask the user to provide it again.`;
			}

			const res = await fetch('/api/sse/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message: routedText,
					conversationId,
					...(caseId ? { caseId } : {}),
					...(currentRoute ? { currentRoute } : {})
				})
			});

			if (!res.ok || !res.body) {
				throw new Error(`HTTP ${res.status} — ${res.statusText}`);
			}

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
					if (!line.startsWith('data: ')) continue;
					try {
						const data = JSON.parse(line.slice(6));
						const idx = messages.length - 1;
						const last = messages[idx];
						if (last?.role === 'assistant') {
							messages[idx] = {
								role: 'assistant',
								content: data.content ?? last.content,
								status: data.status ?? last.status,
								confidence: data.confidence ?? last.confidence
							};
						}
					} catch {
						// skip malformed SSE line
					}
				}
			}
		} catch (e) {
			const idx = messages.length - 1;
			const last = messages[idx];
			if (last?.role === 'assistant') {
				messages[idx] = {
					role: 'assistant',
					content: `Connection error: ${e instanceof Error ? e.message : 'Unknown error'}`,
					status: 'error'
				};
			}
		} finally {
			isStreaming = false;
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

	function clear() {
		messages = [];
		conversationId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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
					{#if messages.length > 0}
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

			<!-- Messages -->
			<div class="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
				{#if messages.length === 0}
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
					{#each messages as msg}
						<div class="flex flex-col {msg.role === 'user' ? 'items-end' : 'items-start'} gap-1">
							<div
								class="max-w-[85%] px-3 py-2 rounded-lg text-xs font-mono leading-relaxed whitespace-pre-wrap
									{msg.role === 'user'
										? 'bg-warning/15 text-warning/90 border border-warning/20'
										: msg.role === 'system'
											? 'bg-accent/10 text-accent border border-accent/20'
										: msg.status === 'error'
											? 'bg-danger/10 text-danger/80 border border-danger/20'
											: 'bg-panelSoft text-sand/85 border border-sand/10'}"
							>
								{#if msg.role === 'assistant' && msg.status === 'streaming' && !msg.content}
									<span class="inline-flex gap-0.5">
										<span class="w-1 h-1 bg-sand/50 rounded-full animate-bounce" style="animation-delay:0ms"></span>
										<span class="w-1 h-1 bg-sand/50 rounded-full animate-bounce" style="animation-delay:150ms"></span>
										<span class="w-1 h-1 bg-sand/50 rounded-full animate-bounce" style="animation-delay:300ms"></span>
									</span>
								{:else}
									{msg.content}
								{/if}
							</div>
							{#if msg.role === 'assistant' && msg.status === 'done' && msg.confidence !== undefined}
								<span class="text-[9px] font-mono text-sand/30">
									confidence {Math.round(msg.confidence * 100)}%
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
