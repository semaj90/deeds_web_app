/**
 * Research Tasks Store — Svelte 5 runes
 *
 * Authenticated users: tasks synced to /api/tasks (PostgreSQL)
 * Anonymous users: tasks stored in localStorage, auth flag set when they try to save
 *
 * Carries across sessions via server DB (auth) or localStorage (anon).
 */
import { browser } from '$app/environment';

type ResearchTaskProvider = 'ollama' | 'google';

interface ResearchTaskImage {
  src?: string | null;
  uri?: string | null;
  mimeType?: string | null;
  resolution?: string | null;
}

interface ResearchTaskResult {
  answer: string;
  pipeline: string;
  durationMs: number | null;
  provider?: ResearchTaskProvider;
  interactionId?: string;
  imageCount?: number;
  images?: ResearchTaskImage[];
  thoughtSummaries?: string[];
  error?: string;
  summaryId?: string;
}

export interface ResearchTask {
  id: string;
  title: string;
  selfPrompt: string;
  pipelineHint: string;
  provider: ResearchTaskProvider;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'running' | 'done' | 'failed';
  sourceText?: string;
  summary?: string;
  result?: ResearchTaskResult;
  /** ID of the research_summaries row persisted for this task's result */
  summaryId?: string;
  notified: boolean;
  createdAt: string;
  completedAt?: string | null;
}

const LS_KEY = 'research_tasks_anon';

class ResearchTaskStore {
	tasks       = $state<ResearchTask[]>([]);
	loading     = $state(false);
	panelOpen   = $state(false);
	needsAuth   = $state(false);  // true when anon user tried to persist a task

	pendingCount = $derived(this.tasks.filter(t => t.status === 'pending').length);
	runningCount = $derived(this.tasks.filter(t => t.status === 'running').length);
	doneCount    = $derived(this.tasks.filter(t => t.status === 'done').length);
	badgeCount   = $derived(this.tasks.filter(t => t.status === 'pending' || t.status === 'running').length);

	/** Load tasks — call once on mount (checks server if auth, localStorage if anon) */
	async load(isAuthenticated: boolean) {
		if (!browser) return;
		if (isAuthenticated) {
			await this.fetchFromServer();
		} else {
			this.loadFromLocalStorage();
		}
	}

	private async fetchFromServer() {
		this.loading = true;
		try {
			const res = await fetch('/api/tasks');
			if (res.ok) {
				const json = await res.json();
				this.tasks = (json.tasks ?? []).map(this.normalize);
			}
		} catch { /* non-fatal */ }
		this.loading = false;
	}

	private loadFromLocalStorage() {
		try {
			const raw = localStorage.getItem(LS_KEY);
			if (raw) this.tasks = JSON.parse(raw);
		} catch { /* ignore corrupt storage */ }
	}

	private saveToLocalStorage() {
		try {
			localStorage.setItem(LS_KEY, JSON.stringify(this.tasks));
		} catch { /* storage full — ignore */ }
	}

	private normalize(t: Record<string, unknown>): ResearchTask {
		const result = (typeof t.result === 'object' && t.result !== null ? t.result : undefined) as ResearchTask['result'] | undefined;
		const resultRecord = (result ?? {}) as Record<string, unknown>;
		const provider = (t.provider as ResearchTask['provider'])
			?? (resultRecord.provider as ResearchTask['provider'])
			?? 'ollama';

		return {
      id: String(t.id ?? crypto.randomUUID()),
      title: String(t.title ?? ''),
      selfPrompt: String(t.selfPrompt ?? t.self_prompt ?? ''),
      pipelineHint: String(t.pipelineHint ?? t.pipeline_hint ?? 'ace'),
      provider,
      priority: (t.priority as ResearchTask['priority']) ?? 'medium',
      status: (t.status as ResearchTask['status']) ?? 'pending',
      sourceText:
        t.sourceText != null
          ? String(t.sourceText)
          : t.source_text != null
            ? String(t.source_text)
            : undefined,
      summary: t.summary != null ? String(t.summary) : undefined,
      result,
      summaryId:
        t.summaryId != null
          ? String(t.summaryId)
          : t.summary_id != null
            ? String(t.summary_id)
            : (t.result as Record<string, unknown>)?.summaryId != null
              ? String((t.result as Record<string, unknown>).summaryId)
              : undefined,
      notified: Boolean(t.notified),
      createdAt: String(t.createdAt ?? t.created_at ?? new Date().toISOString()),
      completedAt:
        t.completedAt != null
          ? String(t.completedAt)
          : t.completed_at != null
            ? String(t.completed_at)
            : null,
    };
	}

	/** Add a task. If anon, stores locally and sets needsAuth flag. */
	async addTask(
		opts: {
			title: string;
			selfPrompt: string;
			pipelineHint?: string;
			provider?: ResearchTaskProvider;
			priority?: ResearchTask['priority'];
			sourceText?: string;
			summary?: string;
			runNow?: boolean;
		},
		isAuthenticated: boolean
	): Promise<ResearchTask | null> {
		if (!browser) return null;

		if (isAuthenticated) {
			return this.addToServer(opts);
		} else {
			// Store locally + prompt login
			const task: ResearchTask = {
				id:           crypto.randomUUID(),
				title:        opts.title,
				selfPrompt:   opts.selfPrompt,
				pipelineHint: opts.pipelineHint ?? 'ace',
				provider:     opts.provider ?? 'ollama',
				priority:     opts.priority ?? 'medium',
				status:       'pending',
				sourceText:   opts.sourceText,
				summary:      opts.summary,
				notified:     false,
				createdAt:    new Date().toISOString(),
			};
			this.tasks = [task, ...this.tasks];
			this.saveToLocalStorage();
			this.needsAuth = true;
			this.panelOpen = true;
			return task;
		}
	}

	private async addToServer(opts: {
		title: string; selfPrompt: string; pipelineHint?: string;
		provider?: ResearchTaskProvider;
		priority?: ResearchTask['priority']; sourceText?: string; summary?: string; runNow?: boolean;
	}): Promise<ResearchTask | null> {
		try {
			const res = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title:        opts.title,
					selfPrompt:   opts.selfPrompt,
					pipelineHint: opts.pipelineHint ?? 'ace',
					provider:     opts.provider ?? 'ollama',
					priority:     opts.priority ?? 'medium',
					sourceText:   opts.sourceText,
					summary:      opts.summary,
					runNow:       opts.runNow ?? false,
				}),
			});
			if (res.ok) {
				const json = await res.json();
				const task = this.normalize(json.task);
				this.tasks = [task, ...this.tasks];
				this.panelOpen = true;
				return task;
			}
		} catch { /* non-fatal */ }
		return null;
	}

	/** Trigger execution of a pending task */
	async runTask(id: string, isAuthenticated: boolean) {
		const task = this.tasks.find(t => t.id === id);
		if (!task || task.status === 'running') return;

		// Optimistic update
		this.tasks = this.tasks.map(t => t.id === id ? { ...t, status: 'running' } : t);

		if (isAuthenticated) {
			try {
				const res = await fetch(`/api/tasks/${id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ run: true }),
				});
				if (res.ok) {
					// Poll for completion
					this.pollTask(id);
				} else {
					this.tasks = this.tasks.map(t => t.id === id ? { ...t, status: 'failed' } : t);
				}
			} catch {
				this.tasks = this.tasks.map(t => t.id === id ? { ...t, status: 'failed' } : t);
			}
		} else {
			// Anon: run in-browser via fetch (uses session cookie)
			this.runAnonTask(task);
		}
	}

	private async runAnonTask(task: ResearchTask) {
		try {
			const res = await fetch('/api/analytics/deep-research', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ selfPrompt: task.selfPrompt, pipelineHint: task.pipelineHint }),
			});
			if (res.ok) {
				const result = await res.json() as { answer: string; pipeline: string; durationMs: number };
				// Non-blocking: persist result as a research_summary so it appears in the browser
				let summaryId: string | undefined;
				try {
					const sr = await fetch('/api/analytics/research-summaries', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							source:         'report',
							pipeline:       task.pipelineHint ?? 'ace',
							query:          task.selfPrompt,
							title:          task.title,
							summary:        result.answer.slice(0, 4000),
							entityTags:     [],
							relevanceScore: 0.8,
						}),
					});
					if (sr.ok) {
						const srj = await sr.json() as { id?: string };
						summaryId = srj.id;
					}
				} catch { /* non-fatal */ }

				this.tasks = this.tasks.map(t =>
					t.id === task.id
						? { ...t, status: 'done', result: { ...result, provider: task.provider }, summaryId, completedAt: new Date().toISOString() }
						: t
				);
			} else {
				this.tasks = this.tasks.map(t => t.id === task.id ? { ...t, status: 'failed' } : t);
			}
		} catch {
			this.tasks = this.tasks.map(t => t.id === task.id ? { ...t, status: 'failed' } : t);
		}
		this.saveToLocalStorage();
	}

	/** Poll server until task is done (max 2 min, 5s intervals) */
	private pollTask(id: string, attempts = 0) {
		if (attempts > 24) return; // 2 min timeout
		setTimeout(async () => {
			try {
				const res = await fetch('/api/tasks');
				if (res.ok) {
					const json = await res.json();
					const updated = (json.tasks as Record<string, unknown>[]).find(t => t.id === id);
					if (updated) {
						const norm = this.normalize(updated);
						this.tasks = this.tasks.map(t => t.id === id ? norm : t);
						if (norm.status === 'running') {
							this.pollTask(id, attempts + 1);
						}
					}
				}
			} catch { /* non-fatal */ }
		}, 5000);
	}

	/** Mark a completed task as notified */
	async markNotified(id: string, isAuthenticated: boolean) {
		this.tasks = this.tasks.map(t => t.id === id ? { ...t, notified: true } : t);
		if (isAuthenticated) {
			fetch(`/api/tasks/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ notified: true }),
			}).catch(() => {});
		} else {
			this.saveToLocalStorage();
		}
	}

	/** Remove a task */
	async removeTask(id: string, isAuthenticated: boolean) {
		this.tasks = this.tasks.filter(t => t.id !== id);
		if (isAuthenticated) {
			fetch(`/api/tasks/${id}`, { method: 'DELETE' }).catch(() => {});
		} else {
			this.saveToLocalStorage();
		}
	}

	dismissNeedsAuth() {
		this.needsAuth = false;
	}
}

export const researchTasks = new ResearchTaskStore();
