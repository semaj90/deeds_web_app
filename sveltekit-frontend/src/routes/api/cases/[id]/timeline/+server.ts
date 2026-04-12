import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { isUuid } from '$lib/server/validation.js';
import {
  cases,
  evidence,
  reports,
  caseNotes,
  evidenceAuditLog,
  auditLog,
  ragMessages,
  ragSessions,
  evidenceBoardConnections,
  users,
} from '$lib/server/db/schema-postgres.js';
import { eq, desc, sql, and, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types.js';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  types: z.string().max(500).optional(),
});

interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  actor: string | null;
  method: string | null;
  reason: string | null;
  timestamp: string;
  metadata: Record<string, unknown>;
}

/**
 * GET /api/cases/[id]/timeline
 * Aggregated case activity timeline — who, what, why, how
 */
export const GET: RequestHandler = async ({ params, locals, url, request }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const caseId = params.id;
  if (!isUuid(caseId)) return json({ error: 'Invalid case ID format' }, { status: 400 });

  try {
    const [targetCase] = await db
      .select({ id: cases.id })
      .from(cases)
      .where(and(eq(cases.id, caseId), eq(cases.userId, locals.user.id)))
      .limit(1);

    if (!targetCase) {
      return json({ error: 'Case not found' }, { status: 404 });
    }

    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    const { limit, types: typesParam } = parsed.data;
    const allowedTypes = typesParam
      ? new Set(typesParam.split(','))
      : new Set(['evidence_upload', 'report', 'note', 'audit', 'ai_chat', 'connection']);

    const events: TimelineEvent[] = [];

    const queries: Promise<void>[] = [];

    // 1. Evidence uploads
    if (allowedTypes.has('evidence_upload')) {
      queries.push(
        db
          .select({
            id: evidence.id,
            title: evidence.title,
            fileType: evidence.fileType,
            createdAt: evidence.createdAt,
            userId: evidence.userId,
            userName: sql<string>`(SELECT name FROM users WHERE id = ${evidence.userId})`,
          })
          .from(evidence)
          .where(and(eq(evidence.caseId, caseId), eq(evidence.userId, locals.user.id)))
          .orderBy(desc(evidence.createdAt))
          .limit(limit)
          .then((rows) => {
            for (const r of rows) {
              events.push({
                id: `ev-${r.id}`,
                type: 'evidence_upload',
                title: r.title ?? 'Evidence uploaded',
                description: `${r.fileType ?? 'file'} evidence added to case`,
                actor: r.userName ?? null,
                method: 'upload',
                reason: null,
                timestamp: r.createdAt?.toISOString?.() ?? new Date().toISOString(),
                metadata: { evidenceId: r.id, fileType: r.fileType },
              });
            }
          })
          .catch(() => {})
      );
    }

    // 2. Reports
    if (allowedTypes.has('report')) {
      queries.push(
        db
          .select({
            id: reports.id,
            title: reports.title,
            status: reports.status,
            createdAt: reports.createdAt,
            createdBy: reports.createdBy,
            userName: sql<string>`(SELECT name FROM users WHERE id = ${reports.createdBy})`,
          })
          .from(reports)
          .where(eq(reports.caseId, caseId))
          .orderBy(desc(reports.createdAt))
          .limit(limit)
          .then((rows) => {
            for (const r of rows) {
              events.push({
                id: `rpt-${r.id}`,
                type: 'report',
                title: r.title,
                description: `Report ${r.status === 'published' ? 'published' : 'created'}`,
                actor: r.userName ?? null,
                method: r.status === 'published' ? 'publish' : 'generate',
                reason: null,
                timestamp: r.createdAt?.toISOString?.() ?? new Date().toISOString(),
                metadata: { reportId: r.id, status: r.status },
              });
            }
          })
          .catch(() => {})
      );
    }

    // 3. Case notes
    if (allowedTypes.has('note')) {
      queries.push(
        db
          .select({
            id: caseNotes.id,
            title: caseNotes.title,
            createdAt: caseNotes.createdAt,
            createdBy: caseNotes.createdBy,
            userName: sql<string>`(SELECT name FROM users WHERE id = ${caseNotes.createdBy})`,
          })
          .from(caseNotes)
          .where(eq(caseNotes.caseId, caseId))
          .orderBy(desc(caseNotes.createdAt))
          .limit(limit)
          .then((rows) => {
            for (const r of rows) {
              events.push({
                id: `note-${r.id}`,
                type: 'note',
                title: r.title ?? 'Case note added',
                description: 'Investigation note recorded',
                actor: r.userName ?? null,
                method: 'manual',
                reason: null,
                timestamp: r.createdAt?.toISOString?.() ?? new Date().toISOString(),
                metadata: {},
              });
            }
          })
          .catch(() => {})
      );
    }

    // 4. Evidence audit log (join through evidence for caseId)
    if (allowedTypes.has('audit')) {
      queries.push(
        db
          .select({
            id: evidenceAuditLog.id,
            action: evidenceAuditLog.action,
            evidenceId: evidenceAuditLog.evidenceId,
            userId: evidenceAuditLog.userId,
            timestamp: evidenceAuditLog.timestamp,
            userName: sql<string>`(SELECT name FROM users WHERE id = ${evidenceAuditLog.userId})`,
          })
          .from(evidenceAuditLog)
          .innerJoin(evidence, eq(evidenceAuditLog.evidenceId, evidence.id))
          .where(eq(evidence.caseId, caseId))
          .orderBy(desc(evidenceAuditLog.timestamp))
          .limit(limit)
          .then((rows) => {
            for (const r of rows) {
              events.push({
                id: `audit-${r.id}`,
                type: 'audit',
                title: `Evidence ${r.action}`,
                description: `Evidence item ${r.action}`,
                actor: r.userName ?? null,
                method: 'system',
                reason: null,
                timestamp: r.timestamp?.toISOString?.() ?? new Date().toISOString(),
                metadata: { evidenceId: r.evidenceId, action: r.action },
              });
            }
          })
          .catch(() => {})
      );
    }

    // 5. Board connections created
    if (allowedTypes.has('connection')) {
      queries.push(
        db
          .select({
            id: evidenceBoardConnections.id,
            connectionType: evidenceBoardConnections.connectionType,
            label: evidenceBoardConnections.label,
            createdAt: evidenceBoardConnections.createdAt,
            createdBy: evidenceBoardConnections.createdBy,
            userName: sql<string>`(SELECT name FROM users WHERE id = ${evidenceBoardConnections.createdBy})`,
          })
          .from(evidenceBoardConnections)
          .where(eq(evidenceBoardConnections.caseId, caseId))
          .orderBy(desc(evidenceBoardConnections.createdAt))
          .limit(limit)
          .then((rows) => {
            for (const r of rows) {
              events.push({
                id: `conn-${r.id}`,
                type: 'connection',
                title: r.label ?? `${r.connectionType} connection`,
                description: `Evidence connection (${r.connectionType}) added`,
                actor: r.userName ?? null,
                method: 'manual',
                reason: null,
                timestamp: r.createdAt?.toISOString?.() ?? new Date().toISOString(),
                metadata: { connectionType: r.connectionType },
              });
            }
          })
          .catch(() => {})
      );
    }

    // 6. AI chat messages (RAG — join through ragSessions for caseId)
    if (allowedTypes.has('ai_chat')) {
      queries.push(
        db
          .select({
            id: ragMessages.id,
            role: ragMessages.role,
            content: ragMessages.content,
            createdAt: ragMessages.createdAt,
          })
          .from(ragMessages)
          .innerJoin(ragSessions, eq(ragMessages.sessionId, ragSessions.id))
          .where(eq(ragSessions.caseId, caseId))
          .orderBy(desc(ragMessages.createdAt))
          .limit(Math.min(limit, 20))
          .then((rows) => {
            for (const r of rows) {
              const contentStr =
                typeof r.content === 'string' ? r.content : JSON.stringify(r.content);
              events.push({
                id: `chat-${r.id}`,
                type: 'ai_chat',
                title: r.role === 'assistant' ? 'AI analysis' : 'User query',
                description: contentStr?.slice(0, 150) ?? '',
                actor: r.role === 'assistant' ? 'AI' : null,
                method: 'auto',
                reason: null,
                timestamp: r.createdAt?.toISOString?.() ?? new Date().toISOString(),
                metadata: { role: r.role },
              });
            }
          })
          .catch(() => {})
      );
    }

    await Promise.all(queries);

    // Sort all events by timestamp descending, limit
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const limited = events.slice(0, limit);

    const responseData = {
      events: limited,
      totalEvents: events.length,
      caseId,
      types: [...allowedTypes],
    };
    const { etag, isMatch } = checkETag(responseData, request.headers);
    if (isMatch) return notModified(etag);
    return json(responseData, { headers: { ...cacheControl.private, ETag: etag } });
  } catch (err) {
    console.error('[timeline] GET error:', err);
    return json({ events: [], totalEvents: 0, caseId, types: [] });
  }
};
