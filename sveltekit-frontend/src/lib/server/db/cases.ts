/**
 * Case Management
 * Auto-create cases for prosecutors
 */

import { and, eq } from 'drizzle-orm';
import { db } from './client.js';
import { wardenCases } from './warden-schema.js';

/**
 * Auto-create case for prosecutor
 */
export async function autoCreateCaseForProsecutor(prosecutorId: string): Promise<string> {
    const [newCase] = await db
        .insert(wardenCases)
        .values({
            prosecutorId,
            title: `Case ${new Date().toISOString().split('T')[0]}`,
        })
        .returning({ id: wardenCases.id });

    return newCase.id;
}

/**
 * Get prosecutor's cases
 */
export async function getProsecutorCases(prosecutorId: string) {
    return db
        .select()
        .from(wardenCases)
        .where(eq(wardenCases.prosecutorId, prosecutorId));
}

/**
 * Get case with evidence
 */
export async function getCaseWithEvidence(caseId: string, prosecutorId: string) {
    return db
        .select()
        .from(wardenCases)
        .where(and(eq(wardenCases.id, caseId), eq(wardenCases.prosecutorId, prosecutorId)));
}

/**
 * Update case title
 */
export async function updateCaseTitle(
    caseId: string,
    prosecutorId: string,
    title: string
): Promise<boolean> {
    const result = await db
      .update(wardenCases)
      .set({ title, updatedAt: new Date() })
      .where(eq(wardenCases.id, caseId));

    return (result.rowCount ?? 0) > 0;
}




