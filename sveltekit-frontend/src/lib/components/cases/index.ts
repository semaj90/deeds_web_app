import type { Case } from '$lib/types';
/** * Case Management Components Export * Legal case management and filtering components */
export { default as CaseFilters } from './CaseFilters.svelte';
export { default as CaseStats } from './CaseStats.svelte';
export type CaseStatus = 'open' | 'investigating' | 'pending' | 'closed' | 'archived';
export type CasePriority = 'low' | 'medium' | 'high' | 'critical';
export interface CaseFilterOptions {
 status?: CaseStatus[];
 priority?: CasePriority[];
 assignedTo?: string;
 dateRange?: {, start: Date; end: Date };
}



