/**
 * Canonical owner-only case authorization for server-side case-board and chat reads.
 *
 * Do not infer authority from a client-controlled session id, cache key, or route.
 * This deliberately uses the current owner policy from /api/cases/[id]/chat.
 * A future collaborator-aware policy must replace this consistently at every boundary.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { cases } from '$lib/server/db/schema-postgres.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCOPED_CHAT_PATTERN = /^(?:case|board)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function scopedChatCaseId(conversationId: string): string | null {
  return SCOPED_CHAT_PATTERN.exec(conversationId)?.[1] ?? null;
}

export async function requireOwnedCaseId(caseId: string, userId: number): Promise<string | null> {
  if (!UUID_PATTERN.test(caseId) || !Number.isSafeInteger(userId) || userId <= 0) return null;
  const [owned] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.userId, userId)))
    .limit(1);
  return owned?.id ?? null;
}
