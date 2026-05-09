import { pool } from '$lib/server/db/client.js';
import { ENV } from '$lib/server/env.server.js';
import { createHash } from 'node:crypto';

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
