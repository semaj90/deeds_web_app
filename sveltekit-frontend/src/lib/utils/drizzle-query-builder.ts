import { eq } from 'drizzle-orm';
import type { db } from '$lib/server/db';
import type { cases, evidence, reports } from '$lib/server/db/schema-postgres'; // Minimal safe helpers for common selects used by the app. export const QueryBuilder = { async selectCasesByUser(userId: string) { return db.select().from(cases).where(eq(cases.userId, userId))},
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
	async selectEvidenceByCase(caseId: string) { return db.select().from(evidence).where(eq(evidence.caseId, caseId))},
	async selectReportByCase(caseId: string) { return db.select().from(reports).where(eq(reports.caseId, caseId))};


