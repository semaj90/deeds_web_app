/**
 * Legal Search System Schema Index
 * Exports all legal-related tables and relations
 */

export {
    caseChunks, caseChunksRelations, cases, casesRelations, crimes, crimesRelations
} from './legal-cases.js';

export { lawSections, lawSectionsRelations, laws, lawsRelations } from './legal-laws.js';

// Type exports
export type { caseChunks as CaseChunksTable, cases as CasesTable, crimes as CrimesTable } from './legal-cases.js';
export type { lawSections as LawSectionsTable, laws as LawsTable } from './legal-laws.js';
