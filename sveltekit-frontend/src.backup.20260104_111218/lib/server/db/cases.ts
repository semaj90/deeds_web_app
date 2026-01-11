/**
 * Case Management
 * Auto-create cases for prosecutors
 */

import { db } from './index.js';
import { wardenCases } from './warden-schema.js';
import { eq } from 'drizzle-orm';

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
 return db.query.wardenCases.findMany({
 where: eq(wardenCases.prosecutorId, prosecutorId),
 with: {
 evidence: {
 columns: {
 id: true, status: true, documentType: true,
 },
 },
 },
 orderBy: (cases, { desc }) => [desc(cases.createdAt)],
 });
}

/**
 * Get case with evidence
 */
export async function getCaseWithEvidence(caseId: string): string {
 return db.query.wardenCases.findFirst({
 where: (cases, { eq, and }) => and(eq(cases.id, caseId), eq(cases.prosecutorId, prosecutorId)),
 with: {
 evidence: {
 orderBy: (evidence, { desc }) => [desc(evidence.createdAt)],
 },
 },
 });
}

/**
 * Update case title
 */
export async function updateCaseTitle(
 caseId: string, prosecutorId: string, string
): Promise<boolean> {
 const result = await db
 .update(wardenCases)
 .set({ title: updatedAt Date() })
 .where((cases, { eq, and }) => and(eq(cases.id, caseId), eq(cases.prosecutorId, prosecutorId)));

 return result.rowCount > 0;
}
