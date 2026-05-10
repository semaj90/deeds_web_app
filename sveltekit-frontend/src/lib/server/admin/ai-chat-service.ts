import { pool } from '$lib/server/db/client';
import { ENV } from '$lib/server/env.server.js';
import { createHash } from 'node:crypto';
import type { SanitizedBrowserContext } from '$lib/types/browser-context.js';

/**
 * Canonical disclaimer string for browser-context prompt sections.
 * Always emitted as the first line of formatBrowserContextForPrompt's
 * non-empty output so the model sees the same trust framing regardless
 * of which route assembled the prompt. Documented in the
 * TRACE/Karpathy Web Development Guide §17.
 */
export const BROWSER_CONTEXT_DISCLAIMER =
  'Browser context is user-visible and may be stale; TRACE backend context is authoritative.';

/**
 * Build a compact prompt section from a sanitized browser snapshot.
 * Returns an empty string if the snapshot is null/empty so callers can
 * unconditionally interpolate it. The first line of any non-empty output
 * is the canonical `BROWSER_CONTEXT_DISCLAIMER` so every route that
 * surfaces this section labels it identically.
 *
 * Token budget: bounded by sanitizer caps (50 tabs × ~250c title +
 * 20 snippets × 3000c) ≈ 75 KB worst case. For an admin chat we keep
 * only the active tab + top 5 snippets + top 5 history hits to stay
 * under ~6 KB so the model's reasoning budget stays intact.
 */
export function formatBrowserContextForPrompt(ctx: SanitizedBrowserContext | null): string {
  if (!ctx || ctx.session_id === 'empty') return '';
  const lines: string[] = [BROWSER_CONTEXT_DISCLAIMER, ''];
  if (ctx.current_tab) {
    lines.push(`Current tab: ${ctx.current_tab.title} <${ctx.current_tab.url}>`);
  }
  if (ctx.highlighted_element_id) {
    lines.push(`Highlighted element id: ${ctx.highlighted_element_id}`);
  }
  if (ctx.tabs.length > 0) {
    const others = ctx.tabs.filter(t => !t.active).slice(0, 8);
    if (others.length > 0) {
      lines.push(`Other open tabs (${ctx.tabs.length} total):`);
      for (const t of others) lines.push(`  - ${t.title}`);
    }
  }
  if (ctx.snippets.length > 0) {
    const top = ctx.snippets.slice(0, 5);
    lines.push(`Selected snippets (${ctx.snippets.length} total, showing top ${top.length}):`);
    for (const s of top) {
      const text = s.text.length > 400 ? s.text.slice(0, 400) + '…' : s.text;
      lines.push(`  - from ${s.title ?? s.source_url}: ${text.replace(/\n/g, ' ')}`);
    }
  }
  if (ctx.history_hits.length > 0) {
    const top = ctx.history_hits.slice(0, 5);
    lines.push(`Recent-history matches (${ctx.history_hits.length} total, top ${top.length}):`);
    for (const h of top) {
      const score = typeof h.score === 'number' ? ` [score=${h.score.toFixed(2)}]` : '';
      lines.push(`  - ${h.title ?? h.url}${score}`);
    }
  }
  if (ctx.sanitized.urls_redacted + ctx.sanitized.snippet_redactions > 0) {
    lines.push(`Sanitizer redacted ${ctx.sanitized.urls_redacted} URLs + ${ctx.sanitized.snippet_redactions} snippet token(s).`);
  }
  return lines.join('\n');
}

/**
 * AI Chat Service for Admin Copilot.
 * Manages sessions and persists context-aware chats.
 */
export class AdminAiChatService {
  /**
   * Create or resume a session for a specific admin user.
   */
  static async getOrCreateSession(userId: string, contextTag?: string) {
    const res = await pool.query(
      `INSERT INTO admin_ai_chat_sessions (user_id, context_tag)
       VALUES ($1, $2)
       ON CONFLICT (user_id, context_tag) WHERE active = true
       DO UPDATE SET updated_at = NOW()
       RETURNING id, context_tag, active, created_at`,
      [userId, contextTag || 'global']
    );
    return res.rows[0];
  }

  /**
   * List recent sessions for an admin.
   */
  static async listSessions(userId: string) {
    const res = await pool.query(
      `SELECT id, context_tag, active, created_at, updated_at
       FROM admin_ai_chat_sessions
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT 20`,
      [userId]
    );
    return res.rows;
  }

  /**
   * Append a message to a session.
   */
  static async logMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: string, metadata?: any) {
    const res = await pool.query(
      `INSERT INTO admin_ai_chat_messages (session_id, role, content, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [sessionId, role, content, metadata ? JSON.stringify(metadata) : null]
    );
    
    // Update session timestamp
    await pool.query(
      `UPDATE admin_ai_chat_sessions SET updated_at = NOW() WHERE id = $1`,
      [sessionId]
    );
    
    return res.rows[0];
  }

  /**
   * Get full message history for a session.
   */
  static async getHistory(sessionId: string) {
    const res = await pool.query(
      `SELECT role, content, metadata, created_at
       FROM admin_ai_chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    );
    return res.rows;
  }

  /**
   * Summarize a session to free up context window (Memory Compression).
   */
  static async compressHistory(sessionId: string) {
    const history = await this.getHistory(sessionId);
    if (history.length < 10) return; // Only compress long threads

    // Placeholder for actual summarization logic via Gemma 4
    console.log(`[AdminChat] Compression triggered for ${sessionId}`);
  }
}
