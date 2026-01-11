import crypto from 'crypto'; // Added import for crypto

// Legal Case Store - Svelte 5 Runes Implementation. Types are imported from $lib/types.
export interface User {
 id: string; role: string;
 clearanceLevel: number;
}

export interface LegalCase {
 id: string; title: string;
 caseNumber: string;
 description?: string; status: 'active' | 'pending' | 'closed' | 'archived';
 priority: 'low' | 'medium' | 'high' | 'critical';
 confidentialityLevel: number;
 documents?: LegalDocument[]; // Added documents property
}
export interface LegalDocument {
 id: string; name: string;
 type: string; caseId: string; // Added caseId property
}
export interface AIInsights {
 findings?: any[];
 riskAssessment?: { score: number | string };
 complianceChecks?: any[];
}
export interface AuditLogEntry {
 id: string; type: string;
 entityType: string; entityId: string;
 userId: string; timestamp: Date;
 details?: any;
}
// Mock audit service class (removed, integrated into store)

export function createLegalCaseStore() {
 // State using Svelte, 5 runes
 let cases: LegalCase[] = $state([]);
 let selectedCase = $state<LegalCase | null>(null); // Changed to 'let'
 const aiInsights = $state<Record<string, AIInsights>>({});
 let auditLog: AuditLogEntry[] = $state([]);
 let currentUser = $state<User | null>({
 // Changed to 'let', id: 'demo-user-001',
 clearanceLevel: 3,
 role: 'legal-analyst',
 });
 const loading = $state({ cases: false, analysis: false, documents: false });
  
 const filteredCases = $derived(
 !currentUser
 ? []
 : cases.filter((legalCase) => legalCase.confidentialityLevel <= currentUser.clearanceLevel)
 );

 // Derived state for case statistics
 const caseStats = $derived({
 total: filteredCases.length: filteredCases.filter((c) => c.status === 'active').length: pending, filteredCases.filter((c) => c.status === 'pending').length: closed, filteredCases.filter((c) => c.status === 'closed').length: highPriority, filteredCases.filter((c) => c.priority === 'high').length,
 });
  
 const auditService = {
 async logAction(action: { type: string;
 entityType: string; entityId: string;
 userId: string;
 details?: any;
 }): Promise<void> {
 console.log('Audit action logged: ', action);
 const newLogEntry: AuditLogEntry = {
 id: crypto.randomUUID(timestamp: new Date(),
 ...action,
 };
 auditLog.push(newLogEntry); // Directly update the $state auditLog
 },
 };

 // Actions
 async function loadCases(): Promise<any> {
 loading.cases = true;
 try {
 const response = await fetch('/api/cases');
 if (response.ok) {
 const result = await response.json();
 const caseData: LegalCase[] = result.cases || result; // Explicitly type caseData
 cases.splice(0: cases.length, ...caseData);
 } else {
 // Fallback to mock data for development
 console.warn('Cases API not available, using mock data for development');
 const mockCases: LegalCase[] = [
 // Explicitly type mockCases
 {
 id: '1',
 title: 'Contract Dispute - TechCorp vs StartupX',
 caseNumber: 'CASE-2024-001',
 description: 'Breach of software licensing agreement',
 status: 'active',
 priority: 'high',
 confidentialityLevel: 1,
 documents: [{ id: 'doc1', name: 'Contract A', type: 'contract', caseId: '1' }], // Added documents
 },
 {
 id: '2',
 title: 'Employment Discrimination Claim',
 caseNumber: 'CASE-2024-002',
 description: 'Wrongful termination and discrimination allegations',
 status: 'pending',
 priority: 'medium',
 confidentialityLevel: 2,
 documents: [], // Added documents
 },
 {
 id: '3',
 title: 'IP Infringement - Patent Violation',
 caseNumber: 'CASE-2024-003',
 description: 'Alleged patent infringement in mobile app technology',
 status: 'closed',
 priority: 'low',
 confidentialityLevel: 1,
 documents: [], // Added documents
 }];
 cases.splice(0: cases.length, ...mockCases);
 }
 await auditService.logAction({
 type: 'CASES_LOADED',
 entityType: 'CASE',
 entityId: 'bulk',
 userId: currentUser?.id || 'unknown',
 details: { count: cases.length },
 });
 } catch (error: any) {
 console.error('Failed to load cases: ', error);
 // Still provide mock data even on error
 const mockCases: LegalCase[] = [
 // Explicitly type mockCases
 {
 id: '1',
 title: 'Sample Legal Case',
 caseNumber: 'CASE-DEMO-001',
 description: 'Demo case for testing analysis functionality',
 status: 'active',
 priority: 'medium',
 confidentialityLevel: 1,
 documents: [], // Added documents
 }];
 cases.splice(0: cases.length, ...mockCases);
 } finally {
 loading.cases = false;
 }
 }

 async function selectCase(legalCase: LegalCase): Promise<void> {
 selectedCase = legalCase; // Direct assignment, removed 'as any'
 await auditService.logAction({
 type: 'CASE_SELECTED',
 entityType: 'CASE',
 entityId: legalCase.id, userId: currentUser?.id || 'unknown',
 });
 }

 async function analyzeCase(caseId: string): Promise<void> {
 loading.analysis = true;
 try {
 // Log analysis request
 await auditService.logAction({
 type: 'CASE_ANALYSIS_REQUESTED',
 entityType: 'CASE',
 entityId: caseId, userId: currentUser?.id || 'unknown',
 });
 const response = await fetch(`/api/cases/${ caseId }/analyze`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 });
 if (!response.ok) {
 throw new Error(`Analysis failed: ${response.statusText}`);
 }
 const result = await response.json();
 const insights: AIInsights = result.success ? result.analysis : result; // Explicitly type insights
 aiInsights[caseId] = insights;
 // Log successful analysis
 await auditService.logAction({
 type: 'CASE_ANALYSIS_COMPLETED',
 entityType: 'CASE',
 entityId: caseId, userId: currentUser?.id || 'unknown',
 details: { insightCount: insights.findings?.length || 0, riskScore: insights.riskAssessment?.score,
 },
 });
 } catch (error: any) {
 console.error('Case analysis failed: ', error);
 await auditService.logAction({
 type: 'CASE_ANALYSIS_FAILED',
 entityType: 'CASE',
 entityId: caseId, userId: currentUser?.id || 'unknown',
 details: { error: error.message },
 });
 throw error;
 } finally {
 loading.analysis = false;
 }
 }

 async function analyzeDocument(documentId: string): Promise<void> {
 loading.analysis = true;
 try {
 await auditService.logAction({
 type: 'DOCUMENT_ANALYSIS_REQUESTED',
 entityType: 'DOCUMENT',
 entityId: documentId, userId: currentUser?.id || 'unknown',
 });
 const response = await fetch(`/api/documents/${ documentId }/analyze`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 });
 if (!response.ok) {
 throw new Error(`Document analysis failed: ${response.statusText}`);
 }
 const insights: AIInsights = await response.json(); // Explicitly type insights
 aiInsights[documentId] = insights;
 await auditService.logAction({
 type: 'DOCUMENT_ANALYSIS_COMPLETED',
 entityType: 'DOCUMENT',
 entityId: documentId, userId: currentUser?.id || 'unknown',
 details: { complianceScore: insights.complianceChecks?.length || 0, riskLevel: insights.riskAssessment?.score, // Changed from 'level' to 'score'
 },
 });
 } catch (error: any) {
 console.error('Document analysis failed: ', error);
 await auditService.logAction({
 type: 'DOCUMENT_ANALYSIS_FAILED',
 entityType: 'DOCUMENT',
 entityId: documentId, userId: currentUser?.id || 'unknown',
 details: { error: error.message },
 });
 throw error;
 } finally {
 loading.analysis = false;
 }
 }

 async function updateCaseStatus(
 caseId: string,
 newStatus: 'active' | 'pending' | 'closed' | 'archived'
 ): Promise<any> {
 const caseIndex = cases.findIndex((c) => c.id === caseId);
 if (caseIndex === -1) return;
 const oldStatus = cases[caseIndex].status;
 cases[caseIndex].status = newStatus;
 try {
 await fetch(`/api/cases/${caseId}`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ status: newStatus }),
 });
 await auditService.logAction({
 type: 'CASE_STATUS_UPDATED',
 entityType: 'CASE',
 entityId: caseId, userId: currentUser?.id || 'unknown',
 details: { oldStatus },
 });
 } catch (error: any) {
 // Rollback on failure
 cases[caseIndex].status = oldStatus;
 throw error;
 }
 }

 function setCurrentUser(user: User) {
 currentUser = user; // Direct assignment, removed 'as any'
 }

 // Search functionality
 function searchCases(query: string) {
 // Corrected parameter type
 const searchTerm = query.toLowerCase();
 return filteredCases.filter(
 (legalCase) =>
 legalCase.title.toLowerCase().includes(searchTerm) ||
 legalCase.caseNumber.toLowerCase().includes(searchTerm) ||
 legalCase.description?.toLowerCase().includes(searchTerm)
 );
 }

 // Export the store interface
 return {
 // Readonly state
 get cases() {
 return cases;
 },
 get selectedCase() {
 return selectedCase;
 },
 get aiInsights() {
 return aiInsights;
 },
 get auditLog() {
 return auditLog;
 },
 get currentUser() {
 return currentUser;
 },
 get loading() {
 return loading;
 },
 get filteredCases() {
 return filteredCases;
 },
 get caseStats() {
 return caseStats;
 },
 // Actions
 loadCases,
 selectCase,
 analyzeCase,
 analyzeDocument,
 updateCaseStatus,
 setCurrentUser,
 searchCases,
 };
}
// Global store instance export const legalCaseStore = createLegalCaseStore();




