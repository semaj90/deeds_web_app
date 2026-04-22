<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { researchTasks } from '$lib/stores/research-tasks.svelte.js';
	import { notificationStore } from '$lib/stores/unified/notification-store.svelte.js';

	interface Props {
		isAuthenticated?: boolean;
		onNeedsAuth?: () => void;
	}

	let { isAuthenticated = false, onNeedsAuth }: Props = $props();

	// Use the store's panelOpen so Alt+T from the layout can control us
	let expanded = $derived(researchTasks.panelOpen);
	let activeTaskId = $state<string | null>(null);

	// Watch for newly-completed tasks and fire notifications
	$effect(() => {
		const unnotified = researchTasks.tasks.filter(t => t.status === 'done' && !t.notified);
		for (const task of unnotified) {
			notificationStore.addNotification({
				title: 'Research task complete',
				message: task.title,
				type: 'success',
				actionUrl: '/analytics',
			});
			notificationStore.showToast(`Research done: ${task.title.slice(0, 50)}`, 'success', 5000);
			researchTasks.markNotified(task.id, isAuthenticated);

			// Browser notification if permitted
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

	function providerLabel(provider: string): string {
		return provider === 'google' ? 'GOOGLE' : 'OLLAMA';
	}

	async function handleRun(id: string) {
		if (!isAuthenticated) { onNeedsAuth?.(); return; }
		await researchTasks.runTask(id, isAuthenticated);
	}

	function requestNotificationPermission() {
		if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
			Notification.requestPermission();
		}
	}
</script>

<!-- Floating panel anchor -->
<div class="rtp-anchor">
	<!-- Badge + toggle button -->
	<button class="rtp-toggle" onclick={toggle} title="Research Tasks (Alt+T)">
		<Icon name="flask-conical" size={16} />
		{#if researchTasks.badgeCount > 0}
			<span class="rtp-badge">{researchTasks.badgeCount}</span>
		{/if}
	</button>

	{#if expanded}
		<div class="rtp-panel">
			<div class="rtp-header">
				<div class="rtp-title">
					<Icon name="flask-conical" size={14} />
					Research Tasks
					<span class="rtp-counts">
						{researchTasks.pendingCount}P · {researchTasks.runningCount}R · {researchTasks.doneCount}✓
					</span>
				</div>
				<div class="rtp-header-actions">
					{#if !isAuthenticated}
						<button class="rtp-auth-btn" onclick={() => { onNeedsAuth?.(); }}>
							<Icon name="log-in" size={12} /> Sync
						</button>
					{/if}
					<button class="rtp-icon-btn" onclick={requestNotificationPermission} title="Enable notifications">
						<Icon name="bell" size={13} />
					</button>
					<button class="rtp-icon-btn" onclick={toggle} title="Close">
						<Icon name="x" size={13} />
					</button>
				</div>
			</div>

			{#if !isAuthenticated && researchTasks.tasks.length > 0}
				<div class="rtp-auth-notice">
					<Icon name="info" size={12} />
					Tasks saved locally — <button class="rtp-link" onclick={() => onNeedsAuth?.()}>sign in to sync</button>
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
											<button class="rtp-run-btn" onclick={() => handleRun(task.id)} title="Run deep research">
												<Icon name="play" size={12} />
											</button>
										{/if}
										<button class="rtp-del-btn" onclick={() => researchTasks.removeTask(task.id, isAuthenticated)} title="Remove">
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
										class="rtp-expand-btn"
										onclick={() => activeTaskId = activeTaskId === task.id ? null : task.id}
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
										Researching via {task.provider === 'google' ? 'Google Deep Research' : 'Ollama'}…
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
					<Icon name="brain" size={12} /> Deep Research
				</a>
			</div>
		</div>
	{/if}
</div>

<style>
	.rtp-anchor {
		position: fixed;
		bottom: 5.5rem;
		right: 1.25rem;
		z-index: 7000;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.5rem;
	}

	.rtp-toggle {
		position: relative;
		width: 2.5rem;
		height: 2.5rem;
		background: #1c1917;
		border: 1px solid #44403c;
		border-radius: 50%;
		color: #a8a29e;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
		transition: all 0.15s;
	}

	.rtp-toggle:hover { color: #34d399; border-color: #34d399; }

	.rtp-badge {
		position: absolute;
		top: -4px;
		right: -4px;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		background: #34d399;
		color: #0c0a09;
		border-radius: 999px;
		font-size: 0.6rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.rtp-panel {
		width: 320px;
		max-height: 72vh;
		background: #1c1917;
		border: 1px solid #44403c;
		border-radius: 10px;
		box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.rtp-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.625rem 0.875rem;
		border-bottom: 1px solid #292524;
	}

	.rtp-title {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-family: 'JetBrains Mono', monospace;
		color: #d6d3d1;
		font-weight: 600;
	}

	.rtp-counts {
		font-size: 0.6rem;
		color: #57534e;
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
		background: rgba(52, 211, 153, 0.1);
		border: 1px solid rgba(52, 211, 153, 0.3);
		border-radius: 4px;
		color: #34d399;
		font-size: 0.65rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.rtp-auth-btn:hover { background: rgba(52, 211, 153, 0.2); }

	.rtp-icon-btn {
		background: none;
		border: none;
		color: #57534e;
		cursor: pointer;
		padding: 0.2rem;
		display: flex;
		align-items: center;
		border-radius: 3px;
		transition: color 0.15s;
	}

	.rtp-icon-btn:hover { color: #d6d3d1; }

	.rtp-auth-notice {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.875rem;
		background: rgba(251, 191, 36, 0.06);
		border-bottom: 1px solid rgba(251, 191, 36, 0.15);
		font-size: 0.7rem;
		color: #a8a29e;
	}

	.rtp-link {
		background: none;
		border: none;
		color: #34d399;
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
		color: #57534e;
		text-align: center;
		line-height: 1.6;
	}

	.rtp-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.rtp-task {
		background: #292524;
		border: 1px solid #3c3836;
		border-radius: 6px;
		padding: 0.5rem 0.625rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		transition: border-color 0.15s;
	}

	.rtp-task:hover { border-color: #57534e; }
	.rtp-task-active { border-color: rgba(52, 211, 153, 0.3); }

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
		color: #d6d3d1;
		line-height: 1.4;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.rtp-task-actions {
		display: flex;
		gap: 0.2rem;
		flex-shrink: 0;
	}

	.rtp-run-btn {
		background: rgba(52, 211, 153, 0.12);
		border: 1px solid rgba(52, 211, 153, 0.25);
		border-radius: 4px;
		color: #34d399;
		cursor: pointer;
		padding: 0.2rem 0.3rem;
		display: flex;
		align-items: center;
		transition: all 0.15s;
	}

	.rtp-run-btn:hover { background: rgba(52, 211, 153, 0.25); }

	.rtp-del-btn {
		background: none;
		border: none;
		color: #44403c;
		cursor: pointer;
		padding: 0.2rem;
		display: flex;
		align-items: center;
		border-radius: 3px;
		transition: color 0.15s;
	}

	.rtp-del-btn:hover { color: #f87171; }

	.rtp-task-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.68rem;
	}

	.rtp-task-time { color: #57534e; }

	.rtp-provider {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.6rem;
		color: #60a5fa;
		background: rgba(96, 165, 250, 0.08);
		padding: 0.1rem 0.3rem;
		border-radius: 3px;
	}

	.rtp-pipeline {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.6rem;
		color: #57534e;
		background: #1c1917;
		padding: 0.1rem 0.3rem;
		border-radius: 3px;
	}

	.rtp-source-text {
		font-size: 0.68rem;
		color: #78716c;
		font-style: italic;
		line-height: 1.4;
		padding: 0.25rem 0.375rem;
		background: #1c1917;
		border-radius: 3px;
		border-left: 2px solid #44403c;
	}

	.rtp-expand-btn {
		background: none;
		border: none;
		color: #34d399;
		font-size: 0.68rem;
		cursor: pointer;
		padding: 0;
		text-align: left;
		transition: color 0.15s;
	}

	.rtp-expand-btn:hover { color: #6ee7b7; }

	.rtp-result {
		padding: 0.5rem;
		background: #141211;
		border-radius: 4px;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.rtp-result-meta {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.6rem;
		color: #57534e;
	}

	.rtp-result-text {
		font-size: 0.72rem;
		color: #d6d3d1;
		line-height: 1.55;
		max-height: 160px;
		overflow-y: auto;
		white-space: pre-wrap;
	}

	.rtp-open-link {
		font-size: 0.68rem;
		color: #34d399;
		text-decoration: none;
		align-self: flex-end;
	}

	.rtp-running {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.7rem;
		color: #60a5fa;
	}

	.rtp-spinner {
		width: 10px;
		height: 10px;
		border: 1.5px solid rgba(96, 165, 250, 0.2);
		border-top-color: #60a5fa;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin { to { transform: rotate(360deg); } }

	.rtp-footer {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem 0.875rem;
		border-top: 1px solid #292524;
	}

	.rtp-footer-link {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.68rem;
		color: #57534e;
		text-decoration: none;
		transition: color 0.15s;
	}

	.rtp-footer-link:hover { color: #d6d3d1; }
</style>
