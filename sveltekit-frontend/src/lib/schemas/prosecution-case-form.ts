/**
 * Prosecution Case Form Schema
 * SvelteKit 2 + Superforms + Zod
 * Matches prosecution vertical with 5W1H structure
 */

import { z } from 'zod';

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export const CaseStatusEnum = z.enum([
 'open',
 'pending_review',
 'in_discovery',
 'pre_trial',
 'trial',
 'post_trial',
 'closed',
 'archived']);
export const CasePriorityEnum = z.enum(['low', 'medium', 'high', 'critical', 'urgent']);
export const CaseTypeEnum = z.enum([
 'felony',
 'misdemeanor',
 'violation',
 'infraction',
 'civil',
 'traffic',
 'other']);
export const JurisdictionEnum = z.enum(['state', 'federal', 'county', 'municipal', 'tribal']);
export const EvidenceStatusEnum = z.enum([
 'available',
 'pending',
 'lost',
 'destroyed',
 'sealed',
 'unavailable']);

// ============================================================================
// PERSON OF INTEREST SCHEMA
// ============================================================================

export const PersonOfInterestSchema = z.object({
 id: z.string().uuid().optional(),
 name: z.string().min(1, 'Name is required').max(255),
 role: z.enum(['suspect', 'defendant', 'victim', 'witness', 'officer', 'analyst']),
 description: z.string().optional(),
 aliases: z.array(z.string()).optional(),
 riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
 contactInfo: z
 .object({
 phone: z.string().optional(),
 email: z.string().email().optional(),
 address: z.string().optional(),
 })
 .optional(),
 notes: z.string().optional(),
});

export type PersonOfInterest = z.infer<typeof PersonOfInterestSchema>;

// ============================================================================
// EVIDENCE ITEM SCHEMA
// ============================================================================

export const EvidenceItemSchema = z.object({
 id: z.string().uuid().optional(),
 title: z.string().min(1, 'Evidence title required'),
 description: z.string().optional(),
 type: z.enum([
 'document',
 'photo',
 'video',
 'audio',
 'physical',
 'digital',
 'forensic',
 'witness_statement']),
 status: EvidenceStatusEnum.default('available'),
 collectionDate: z.string().datetime().optional(),
 collectedBy: z.string().optional(),
 location: z.string().optional(),
 chainOfCustody: z
 .array(
 z.object({
 custodian: z.string(),
 action: z.string(),
 date: z.string().datetime(),
 notes: z.string().optional(),
 })
 )
 .optional(),
 tags: z.array(z.string()).optional(),
 aiAnalysis: z.string().optional(),
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

// ============================================================================
// CORE PROSECUTION CASE FORM SCHEMA
// ============================================================================

export const ProsecutionCaseFormSchema = z.object({
 // Basic Metadata
 id: z.string().uuid().optional(),
 caseNumber: z.string().min(1, 'Case number is required').max(100),
 title: z.string().min(1, 'Case title is required').max(255),
 status: CaseStatusEnum.default('open'),
 priority: CasePriorityEnum.default('medium'),
 type: CaseTypeEnum.default('felony'),
 jurisdiction: JurisdictionEnum.default('state'),

 // 5W1H Structure
 who: z.string().min(1, 'WHO (suspect/defendant) is required').max(1000),
 what: z.string().min(1, 'WHAT (charges/allegations) is required').max(2000),
 when: z.string().min(1, 'WHEN (date/time of incident) is required'),
 where: z.string().min(1, 'WHERE (location) is required').max(500),
 why: z.string().max(1000).optional().describe('Motive or context'),
 how: z.string().max(1000).optional().describe('Method or manner of offense'),

 // Extended Narrative
 narrative: z.string().min(10, 'Narrative must be at least 10 characters').max(5000),
 facts: z.array(z.string()).optional().describe('Key facts of the case'),

 // Legal Information
 statutes: z.array(z.string()).optional().describe('Applicable statutes/codes'),
 charges: z.array(z.string()).min(1, 'At least one charge is required'),
 jurisdiction_agency: z.string().optional().describe('Investigating agency'),

 // Parties Involved
 defendants: z.array(PersonOfInterestSchema).min(1, 'At least one defendant is required'),
 victims: z.array(PersonOfInterestSchema).optional(),
 witnesses: z.array(PersonOfInterestSchema).optional(),
 officers: z.array(PersonOfInterestSchema).optional(),

 // Evidence
 evidence: z.array(EvidenceItemSchema).optional(),
 evidenceSummary: z.string().max(2000).optional().describe('Overall evidence strength assessment'),

 // Timeline
 incidentDate: z.string().datetime().optional(),
 arrestDate: z.string().datetime().optional(),
 filingDate: z.string().datetime().optional(),
 trialDate: z.string().datetime().optional(),

 // Prosecution Assessment
 prosecutionStrength: z.enum(['weak', 'moderate', 'strong', 'overwhelming']).optional(),
 riskFactors: z.array(z.string()).optional(),
 mitigatingFactors: z.array(z.string()).optional(),
 recommendedActions: z.array(z.string()).optional(),

 // AI Analysis Integration
 aiAnalysisSummary: z.string().optional(),
 suggestedCharges: z.array(z.string()).optional(),
 vulnerabilities: z.array(z.string()).optional(),

 // Administrative
 assignedProsecutor: z.string().optional(),
 supervisingADA: z.string().optional(),
 notes: z.string().optional(),
 tags: z.array(z.string()).optional(),

 // Timestamps
 createdAt: z.string().datetime().optional(),
 updatedAt: z.string().datetime().optional(),
});

export type ProsecutionCaseForm = z.infer<typeof ProsecutionCaseFormSchema>;

// ============================================================================
// SERVER-SIDE VALIDATION (for Superforms)
// ============================================================================

export const ProsecutionCaseServerSchema = ProsecutionCaseFormSchema.omit({
 id: true, createdAt: true, updatedAt: true,
});

export type ProsecutionCaseServerData = z.infer<typeof ProsecutionCaseServerSchema>;

// ============================================================================
// STEP-BY-STEP FORM SECTIONS (for multi-step forms)
// ============================================================================

export const Step1_BasicInfoSchema = ProsecutionCaseFormSchema.pick({
 caseNumber: true, title: true, status: true, priority: true, type: true, jurisdiction: true
});

export const Step2_5W1HSchema = ProsecutionCaseFormSchema.pick({
 who: true, what: true, when: true, where: true, why: true, how: true
});

export const Step3_NarrativeSchema = ProsecutionCaseFormSchema.pick({
 narrative: true, facts: true, statutes: true, charges: true
});

export const Step4_PartiesSchema = ProsecutionCaseFormSchema.pick({
 defendants: true, victims: true, witnesses: true, officers: true
});

export const Step5_EvidenceSchema = ProsecutionCaseFormSchema.pick({
 evidence: true, evidenceSummary: true
});

export const Step6_AssessmentSchema = ProsecutionCaseFormSchema.pick({
 prosecutionStrength: true, riskFactors: true, mitigatingFactors: true, recommendedActions: true
});

export const Step7_AdminSchema = ProsecutionCaseFormSchema.pick({
 assignedProsecutor: true, supervisingADA: true, notes: true, tags: true
});

// ============================================================================
// SUPERFORMS VALIDATION HELPER
// ============================================================================

export async function validateProsecutionCase(data: unknown) {
 try {
 return await ProsecutionCaseServerSchema.parseAsync(data);
 } catch (err) {
 if (err instanceof z.ZodError) {
 const errors: Record<string, string> = {};
 for (const issue of err.issues) {
 const path = issue.path.join('.');
 errors[path] = issue.message;
 }
 return { errors };
 }
 throw err;
 }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function getProsecutionCaseDefaults(): Partial<ProsecutionCaseForm> {
 return {
 status: 'open',
 priority: 'medium',
 type: 'felony',
 jurisdiction: 'state',
 defendants: [],
 evidence: [],
 charges: [],
 createdAt: new Date().toISOString(),
 };
}

export function estimateCaseCompleteness(form: Partial<ProsecutionCaseForm>): number {
 const fields: (keyof ProsecutionCaseForm)[] = [
 'caseNumber',
 'title',
 'who',
 'what',
 'when',
 'where',
 'narrative',
 'defendants',
 'evidence',
 'charges'];
 const filled = fields.filter(
 (f) => form[f] && (Array.isArray(form[f]) ? (form[f] as any[]).length > 0 : true)
 ).length;
 return Math.round((filled / fields.length) * 100);
}


