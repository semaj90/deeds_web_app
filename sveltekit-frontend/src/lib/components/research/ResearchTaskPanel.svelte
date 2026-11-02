<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { researchTasks } from '$lib/stores/research-tasks.svelte.js';
	import { notificationStore } from '$lib/stores/unified/notification-store.svelte.js';

	interface Props {
		isAuthenticated?: boolean;
		onNeedsAuth?: () => void;
	}

	let { isAuthenticated = false, onNeedsAuth }: Props = $props();

	let expanded = $derived(researchTasks.panelOpen);
	let activeTaskId = $state<string | null>(null);

	$effect(() => {
		const unnotified = researchTasks.tasks.filter((t) => t.status === 'done' && !t.notified);
		for (const task of unnotified) {
			notificationStore.addNotification({
				title: 'Research task complete',
				message: task.title,
				type: 'success',
				actionUrl: '/analytics'
			});
			notificationStore.showToast(`Research done: ${task.title.slice(0, 50)}`, 'success', 5000);
			researchTasks.markNotified(task.id, isAuthenticated);

			if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
				new Notification('Research task complete', { body: task.title, icon: '/favicon.ico' });
			}
		}
	});

	function toggle() {
		researchTasks.panelOpen = !researchTasks.panelOpen;
		if (researchTasks.panelOpen) researchTasks.needsAuth = false;
	}

	function formatTime(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function priorityDot(p: string): string {
		if (p === 'high') return '#f87171';
		if (p === 'medium') return '#fbbf24';
		return '#4ade80';
	}

	function statusIcon(s: string): string {
		if (s === 'done') return 'check-circle';
		if (s === 'running') return 'loader';
		if (s === 'failed') return 'x-circle';
		return 'clock';
	}

	function statusColor(s: string): string {
		if (s === 'done') return '#4ade80';
		if (s === 'running') return '#60a5fa';
		if (s === 'failed') return '#f87171';
		return '#a8a29e';
	}

	function providerLabel(_provider: string): string {
		return 'ORNITH :8090';
	}

	async function handleRun(id: string) {
		if (!isAuthenticated) {
			onNeedsAuth?.();
			return;
		}
		await researchTasks.runTask(id, isAuthenticated);
	}

	function requestNotificationPermission() {
		if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
			Notification.requestPermission();
		}
	}
</script>

{#if researchTasks.tasks.length > 0 || expanded}
	<div class="rtp-anchor">
		<button data-unstyled class="rtp-toggle" onclick={toggle} title="Research Tasks (Alt+T)">
			<Icon name="yorha-glossary" size={16} />
			{#if researchTasks.badgeCount > 0}
				<span class="rtp-count-pip">{researchTasks.badgeCount}</span>
			{/if}
		</button>

		{#if expanded}
			<div class="rtp-panel">
				<div class="rtp-header">
					<div class="rtp-title">
						<Icon name="yorha-glossary" size={14} />
						Research Tasks
						<span class="rtp-counts">
							{researchTasks.pendingCount}P · {researchTasks.runningCount}R · {researchTasks.doneCount}✓
						</span>
					</div>
					<div class="rtp-header-actions">
						{#if !isAuthenticated}
							<button data-unstyled class="rtp-auth-btn" onclick={() => onNeedsAuth?.()}>
								<Icon name="log-in" size={12} /> Sync
							</button>
						{/if}
						<button data-unstyled class="rtp-icon-btn" onclick={requestNotificationPermission} title="Enable notifications">
							<Icon name="bell" size={13} />
						</button>
						<button data-unstyled class="rtp-icon-btn" onclick={toggle} title="Close">
							<Icon name="x" size={13} />
						</button>
					</div>
				</div>

				{#if !isAuthenticated && researchTasks.tasks.length > 0}
					<div class="rtp-auth-notice">
						<Icon name="info" size={12} />
						Tasks saved locally — <button data-unstyled class="rtp-link" onclick={() => onNeedsAuth?.()}>sign in to sync</button>
					</div>
				{/if}

				<div class="rtp-body">
					{#if researchTasks.loading}
						<div class="rtp-empty">Loading tasks…</div>
					{:else if researchTasks.tasks.length === 0}
						<div class="rtp-empty">
							No research tasks yet.<br />
							Highlight text on any page and click "→ Research" to create one.
						</div>
					{:else}
						<div class="rtp-list">
							{#each researchTasks.tasks as task (task.id)}
								<div class="rtp-task" class:rtp-task-active={activeTaskId === task.id}>
									<div class="rtp-task-header">
										<div class="rtp-task-meta">
											<span class="rtp-priority-dot" style="background:{priorityDot(task.priority)}"></span>
											<span class="rtp-task-title">{task.title}</span>
										</div>
										<div class="rtp-task-actions">
											{#if task.status === 'pending'}
												<button data-unstyled class="rtp-run-btn" onclick={() => handleRun(task.id)} title="Run deep research">
													<Icon name="play" size={12} />
												</button>
											{/if}
											<button data-unstyled class="rtp-del-btn" onclick={() => researchTasks.removeTask(task.id, isAuthenticated)} title="Remove">
												<Icon name="x" size={11} />
											</button>
										</div>
									</div>

									<div class="rtp-task-status">
										<span style="color:{statusColor(task.status)}">
											<Icon name={statusIcon(task.status)} size={11} />
											{task.status}
										</span>
										<span class="rtp-task-time">{formatTime(task.createdAt)}</span>
										<span class="rtp-provider">{providerLabel(task.provider)}</span>
										<span class="rtp-pipeline">{task.pipelineHint.toUpperCase()}</span>
									</div>

									{#if task.sourceText}
										<div class="rtp-source-text">"{task.sourceText.slice(0, 80)}{task.sourceText.length > 80 ? '…' : ''}"</div>
									{/if}

									{#if task.status === 'done' && task.result}
										<button
											data-unstyled
											class="rtp-expand-btn"
											onclick={() => (activeTaskId = activeTaskId === task.id ? null : task.id)}
										>
											{activeTaskId === task.id ? 'Hide result' : 'View result'} →
										</button>

										{#if activeTaskId === task.id}
											<div class="rtp-result">
												<div class="rtp-result-meta">{providerLabel(task.provider)} · {task.result.pipeline.toUpperCase()} · {task.result.durationMs}ms</div>
												<div class="rtp-result-text">{task.result.answer}</div>
												<div class="rtp-result-links">
													<a href="/analytics#deep-research" class="rtp-open-link" onclick={toggle}>
														Open Deep Research →
													</a>
													{#if task.summaryId}
														<a
															href="/admin/search-intelligence#rs-{task.summaryId}"
															class="rtp-open-link rtp-summary-link"
															onclick={toggle}
															title="View persisted research summary"
														>
															View Summary →
														</a>
													{/if}
												</div>
											</div>
										{/if}
									{/if}

									{#if task.status === 'running'}
										<div class="rtp-running">
											<span class="rtp-spinner"></span>
											Researching via Ornith (:8090)…
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<div class="rtp-footer">
					<a href="/analytics" class="rtp-footer-link" onclick={toggle}>
						<Icon name="bar-chart-3" size={12} /> Open Analytics
					</a>
					<a href="/analytics#deep-research" class="rtp-footer-link" onclick={toggle}>
						<Icon name="yorha-ai-assistant" size={12} /> Deep Research
					</a>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.rtp-anchor {
		position: fixed;
		bottom: 8.2rem;
		right: 1.35rem;
		z-index: 7000;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.5rem;
	}

	.rtp-toggle {
		position: relative;
		width: 2.35rem;
		height: 2.35rem;
		background: #0B0D13;
		border: 1px solid #C8A24A;
		border-radius: 50%;
		color: #E5C77B;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45);
		transition: all 0.15s;
	}

	.rtp-toggle:hover {
		background: #67140F;
		color: #FFF0BE;
		border-color: #FFF0BE;
	}

	.rtp-count-pip {
		position: absolute;
		top: -4px;
		right: -4px;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		background: #67140F;
		border: 1px solid #E5C77B;
		color: #F6F3EF;
		border-radius: 999px;
		font-size: 0.58rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.rtp-panel {
		width: 320px;
		max-height: 68vh;
		background: #131621;
		border: 1px solid #C8A24A;
		border-radius: 10px;
		box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.rtp-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.625rem 0.875rem;
		border-bottom: 1px solid rgba(200, 162, 74, 0.25);
	}

	.rtp-title {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.72rem;
		font-family: 'JetBrains Mono', monospace;
		color: #F6F3EF;
		font-weight: 600;
	}

	.rtp-counts {
		font-size: 0.6rem;
		color: #B9A699;
		margin-left: 0.25rem;
	}

	.rtp-header-actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.rtp-auth-btn {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.2rem 0.5rem;
		background: rgba(200, 162, 74, 0.14);
		border: 1px solid rgba(200, 162, 74, 0.4);
		border-radius: 4px;
		color: #E5C77B;
		font-size: 0.65rem;
		cursor: pointer;
	}

	.rtp-icon-btn {
		background: none;
		border: none;
		color: #B9A699;
		cursor: pointer;
		padding: 0.2rem;
		display: flex;
		align-items: center;
		border-radius: 3px;
	}
	.rtp-icon-btn:hover { color: #F6F3EF; }

	.rtp-auth-notice {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.875rem;
		background: rgba(200, 162, 74, 0.08);
		border-bottom: 1px solid rgba(200, 162, 74, 0.2);
		font-size: 0.7rem;
		color: #DBCFC5;
	}

	.rtp-link {
		background: none;
		border: none;
		color: #E5C77B;
		cursor: pointer;
		font-size: 0.7rem;
		padding: 0;
		text-decoration: underline;
	}

	.rtp-body {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem;
	}

	.rtp-empty {
		padding: 1.25rem 0.75rem;
		font-size: 0.75rem;
		color: #B9A699;
		text-align: center;
		line-height: 1.6;
	}

	.rtp-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.rtp-task {
		background: #1B2030;
		border: 1px solid rgba(200, 162, 74, 0.22);
		border-radius: 6px;
		padding: 0.5rem 0.625rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.rtp-task-active { border-color: #E5C77B; }

	.rtp-task-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.rtp-task-meta {
		display: flex;
		align-items: flex-start;
		gap: 0.375rem;
		flex: 1;
		min-width: 0;
	}

	.rtp-priority-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
		margin-top: 3px;
	}

	.rtp-task-title {
		font-size: 0.775rem;
		color: #F6F3EF;
		line-height: 1.4;
	}

	.rtp-task-actions {
		display: flex;
		gap: 0.2rem;
		flex-shrink: 0;
	}

	.rtp-run-btn {
		background: rgba(200, 162, 74, 0.16);
		border: 1px solid rgba(200, 162, 74, 0.4);
		border-radius: 4px;
		color: #E5C77B;
		cursor: pointer;
		padding: 0.2rem 0.3rem;
		display: flex;
		align-items: center;
	}

	.rtp-del-btn {
		background: none;
		border: none;
		color: #B9A699;
		cursor: pointer;
		padding: 0.2rem;
		display: flex;
		align-items: center;
	}
	.rtp-del-btn:hover { color: #f87171; }

	.rtp-task-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.68rem;
	}

	.rtp-task-time { color: #B9A699; }

	.rtp-provider {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.58rem;
		color: #E5C77B;
		background: rgba(200, 162, 74, 0.14);
		padding: 0.1rem 0.3rem;
		border-radius: 3px;
	}

	.rtp-pipeline {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.58rem;
		color: #DBCFC5;
		background: #0B0D13;
		padding: 0.1rem 0.3rem;
		border-radius: 3px;
	}

	.rtp-source-text {
		font-size: 0.68rem;
		color: #B9A699;
		font-style: italic;
		line-height: 1.4;
		padding: 0.25rem 0.375rem;
		background: #0B0D13;
		border-radius: 3px;
		border-left: 2px solid #C8A24A;
	}

	.rtp-expand-btn {
		background: none;
		border: none;
		color: #E5C77B;
		font-size: 0.68rem;
		cursor: pointer;
		padding: 0;
		text-align: left;
	}

	.rtp-result {
		padding: 0.5rem;
		background: #0B0D13;
		border-radius: 4px;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.rtp-result-meta {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.6rem;
		color: #B9A699;
	}

	.rtp-result-text {
		font-size: 0.72rem;
		color: #F6F3EF;
		line-height: 1.55;
		max-height: 160px;
		overflow-y: auto;
		white-space: pre-wrap;
	}

	.rtp-result-links {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	.rtp-open-link {
		font-size: 0.68rem;
		color: #E5C77B;
		text-decoration: none;
	}

	.rtp-running {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.7rem;
		color: #E5C77B;
	}

	.rtp-spinner {
		width: 10px;
		height: 10px;
		border: 1.5px solid rgba(229, 199, 123, 0.25);
		border-top-color: #E5C77B;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin { to { transform: rotate(360deg); } }

	.rtp-footer {
		display: flex;
		gap: 0.65rem;
		padding: 0.5rem 0.875rem;
		border-top: 1px solid rgba(200, 162, 74, 0.22);
	}

	.rtp-footer-link {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.68rem;
		color: #B9A699;
		text-decoration: none;
	}
	.rtp-footer-link:hover { color: #F6F3EF; }
</style>
