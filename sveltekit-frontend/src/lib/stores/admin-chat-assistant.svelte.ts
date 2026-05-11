/**
 * admin-chat-assistant.svelte.ts
 *
 * Svelte 5 rune-backed store for the Admin TRACE Copilot. Class-backed
 * so any admin component can `import { adminChat } from '...'` and read
 * `adminChat.messages`, `adminChat.isThinking`, etc., without prop-drilling.
 *
 * Wraps the existing /api/admin/ai-chat/* endpoints. Adds a panel-summary
 * lane for the on-demand `<AiAnalysisPopup>` flow:
 *   - Panel calls `adminChat.summarizePanel(spec)` → returns popup state
 *   - The popup binds directly to the returned reactive object
 *   - Active summaries are tracked so multiple popups can coexist
 *
 * Client-only state. NEVER imported in `+page.server.ts` / `+server.ts`
 * (would leak between requests in SSR). Browser-only via `.svelte.ts`.
 */

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role:        ChatRole;
  content:     string;
  metadata?:   Record<string, unknown>;
  /** Set by the server on persisted rows. */
  id?:         string;
  /** ISO-8601 — server-set if persisted, client-set if local. */
  created_at?: string;
}

export type SummaryStyle = 'brief' | 'detailed' | 'risk' | 'next-step';

export interface PanelSummarySpec {
  panelId:     string;
  panelTitle:  string;
  /** JSON-serializable panel state — passed directly to the LLM. */
  content:     unknown;
  metadata?:   Record<string, unknown>;
  style?:      SummaryStyle;
  /** When true, the resulting summary is also logged into the active chat session. */
  persistToChat?: boolean;
}

export interface PanelSummaryResult {
  /** Reactive — bind directly into the popup. */
  ok:         boolean;
  loading:    boolean;
  panelId:    string;
  panelTitle: string;
  style:      SummaryStyle;
  summary:    string;
  error:      string | null;
  durationMs: number | null;
  /** Original spec (for "Analyze again" / style toggles). */
  spec:       PanelSummarySpec;
}

class AdminChatAssistant {
  // ── Chat state ───────────────────────────────────────────────────────────
  messages    = $state<ChatMessage[]>([]);
  sessionId   = $state<string | null>(null);
  contextTag  = $state<string>('global');
  isThinking  = $state(false);
  lastError   = $state<string | null>(null);

  // ── Panel-summary state ──────────────────────────────────────────────────
  /** Map of panelId → reactive summary state. Multiple popups can coexist. */
  summaries   = $state<Record<string, PanelSummaryResult>>({});
  /** Most-recently-opened panelId — handy for the floating Copilot to focus. */
  activePanelId = $state<string | null>(null);

  // ── Derived ──────────────────────────────────────────────────────────────
  hasSession  = $derived(this.sessionId !== null);
  pendingSummaries = $derived(
    Object.values(this.summaries).filter(s => s.loading).length,
  );

  // ── Chat lane ────────────────────────────────────────────────────────────

  async loadSessions(): Promise<void> {
    try {
      const r = await fetch('/api/admin/ai-chat/sessions', { credentials: 'include' });
      if (!r.ok) return;
      const { sessions } = await r.json();
      if (sessions?.length > 0 && !this.sessionId) {
        this.sessionId = sessions[0].id;
        await this.loadHistory(sessions[0].id);
      }
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
    }
  }

  async loadHistory(sessionId: string): Promise<void> {
    try {
      const r = await fetch(`/api/admin/ai-chat/${sessionId}`, { credentials: 'include' });
      if (!r.ok) return;
      const { history } = await r.json();
      this.messages = history ?? [];
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
    }
  }

  async send(query: string, uiSnapshot?: unknown[]): Promise<void> {
    if (!query.trim() || this.isThinking) return;
    this.isThinking = true;
    this.lastError  = null;
    this.messages.push({ role: 'user', content: query.trim() });

    const intent = this.inferIntent(query);
    console.log('AdminChat: Inferred intent:', intent);

    try {
      const r = await fetch('/api/admin/ai-chat', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'include',
        body:        JSON.stringify({
          sessionId:  this.sessionId,
          query:      query.trim(),
          contextTag: this.contextTag,
          uiSnapshot,
          intent, // Pass intent to backend for optimized routing
        }),
      });
      const data = await r.json();
      if (!r.ok || data.error) {
        this.lastError = data.error ?? `HTTP ${r.status}`;
        this.messages.push({ role: 'system', content: `[error] ${this.lastError}` });
        return;
      }
      this.sessionId = data.sessionId ?? this.sessionId;
      this.messages.push({
        role:    'assistant',
        content: data.reply ?? '(empty reply)',
        metadata: { 
          context_used: !!data.context,
          intent_routed: intent !== 'general'
        },
      });
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.messages.push({ role: 'system', content: `[error] ${this.lastError}` });
    } finally {
      this.isThinking = false;
    }
  }

  /**
   * Fast regex-based intent classification for routing queries to 
   * specialized tool chains or context loaders.
   */
  private inferIntent(query: string): string {
    const q = query.toLowerCase();
    if (/\b(person|poi|suspect|victim|witness|profile)\b/.test(q)) return 'person_lookup';
    if (/\b(evidence|file|document|upload|attachment|photo|video)\b/.test(q)) return 'evidence_retrieval';
    if (/\b(case|investigation|docket|matter)\b/.test(q)) return 'case_management';
    if (/\b(statute|law|code|regulation|legal)\b/.test(q)) return 'legal_research';
    if (/\b(summarize|summary|tldr|brief)\b/.test(q)) return 'synthesis';
    if (/\b(audit|log|telemetry|system|health)\b/.test(q)) return 'system_diagnostics';
    return 'general';
  }


  clearChat(): void {
    this.messages   = [];
    this.sessionId  = null;
    this.lastError  = null;
  }

  // ── Panel-summary lane ───────────────────────────────────────────────────

  /**
   * Trigger an on-demand panel summary. Returns the reactive result object
   * — the caller (popup) can bind to `.summary`, `.loading`, `.error`
   * directly. Subsequent calls for the same panelId reuse the same slot
   * (lets the popup show "Re-analyzing..." without flicker).
   */
  async summarizePanel(spec: PanelSummarySpec): Promise<PanelSummaryResult> {
    const style = spec.style ?? 'brief';
    const slot: PanelSummaryResult = this.summaries[spec.panelId] ?? {
      ok:         false,
      loading:    true,
      panelId:    spec.panelId,
      panelTitle: spec.panelTitle,
      style,
      summary:    '',
      error:      null,
      durationMs: null,
      spec,
    };
    slot.loading    = true;
    slot.error      = null;
    slot.style      = style;
    slot.spec       = spec;
    slot.panelTitle = spec.panelTitle;
    this.summaries[spec.panelId] = slot;
    this.activePanelId = spec.panelId;

    try {
      const r = await fetch('/api/admin/ai-chat/summarize-panel', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'include',
        body:        JSON.stringify({
          panelId:    spec.panelId,
          panelTitle: spec.panelTitle,
          content:    spec.content,
          metadata:   spec.metadata,
          style,
          sessionId:  spec.persistToChat ? this.sessionId ?? undefined : undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        slot.ok      = false;
        slot.error   = data?.error ?? `HTTP ${r.status}`;
        slot.summary = '';
      } else {
        slot.ok         = !!data.ok;
        slot.summary    = data.summary ?? '';
        slot.error      = data.ok ? null : (data.error ?? 'Inference failed');
        slot.durationMs = data.durationMs ?? null;
        if (data.ok && spec.persistToChat && data.summary) {
          // Reflect the persisted assistant row in the live chat without re-fetching.
          this.messages.push({
            role:    'assistant',
            content: data.summary,
            metadata: { kind: 'panel_summary', panel_id: spec.panelId, style },
          });
        }
      }
    } catch (err) {
      slot.ok      = false;
      slot.error   = err instanceof Error ? err.message : String(err);
      slot.summary = '';
    } finally {
      slot.loading = false;
      // Re-assign so $state proxy sees the deep change.
      this.summaries = { ...this.summaries, [spec.panelId]: slot };
    }
    return slot;
  }

  closeSummary(panelId: string): void {
    if (!(panelId in this.summaries)) return;
    const next = { ...this.summaries };
    delete next[panelId];
    this.summaries = next;
    if (this.activePanelId === panelId) this.activePanelId = null;
  }
}

/**
 * Singleton instance. Safe in client-only code (.svelte / .svelte.ts).
 * NEVER import from `+page.server.ts` / `+server.ts` — would leak between
 * SSR requests.
 */
export const adminChat = new AdminChatAssistant();
