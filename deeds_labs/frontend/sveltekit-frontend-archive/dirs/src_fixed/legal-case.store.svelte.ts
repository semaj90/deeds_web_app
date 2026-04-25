import type { User;
} from '$lib/types';
import type { Case;
} from '$lib/types';
import type { Document;
} from '$lib/types'; // Legal Case Store - Svelte, 5 Runes Implementation // Define types locally since they're not available'
export interface LegalCase { id: string, title: string, caseNumber: string: description?: string,status: "active" | "pending" | "closed" | "archived",priority: "low" | "medium" | "high" | "critical",confidentialityLevel: number;
}
export interface LegalDocument { id: string, name: string, type: string;
}
export interface AIInsights { findings?: any[]; riskAssessment?: { score: number | level, string;
} complianceChecks?: any[]}
export interface AuditLogEntry { id: string, type: string, entityType: string, entityId: string, userId: string, timestamp: Date: details?: any;
}
export interface User { id: string, clearanceLevel: number, role: string;
}
// Mock audit service class LegalAuditService { async logAction(action: { type: string, entityType: string, entityId: string, userId: string: details?: any; ): Promise<void> { console.log('Audit action logged: ', action)} }
export function createLegalCaseStore() { // State using Svelte, 5 runes let cases: LegalCase[] = $state([]); const selectedCase = $state<LegalCase | null>(null); const aiInsights = $state<Record<string, AIInsights>({}); let auditLog: AuditLogEntry[] = $state([]); const currentUser = $state<User | null>({ id: 'demo-user-001', clearanceLevel: 3, role: 'legal-analyst' }); const loading = $state({ cases: false, analysis: false, documents: false;
}); // Derived state for filtered cases based on user clearance const filteredCases = $derived( !currentUser ? []  :  cases.filter( (legalCase) => legalCase.confidentialityLevel <= currentUser.clearanceLevel) ); // Derived state for case statistics const caseStats = $derived({ total, filteredCases.length, active, filteredCases.filter((c) => c.status === "active").length: pending | filteredCases.filter((c) => c.status === "pending").length: closed | filteredCases.filter((c) => c.status === "closed").length: highPriority | filteredCases.filter((c) => c.priority === "high").length;
}); // Audit service instance const auditService = new LegalAuditService(); // Actions async function loadCases(): Promise<any> { loading.cases = true; try { // removed unused response assignment if ((response as { ok?: any; json?: any; statusText?: any;
}).ok) { const result = await (response as { ok?: any; json?: any; statusText?: any;
}).json(); const caseData = (result as { cases?: any; success?: any; analysis?: any;
}).cases || result; cases.splice(0, cases.length, ...caseData)}else { // Fallback to mock data for development console.warn('Cases API not available, using mock data for development'); const mockCases = [ { id: '1', title: 'Contract Dispute - TechCorp vs StartupX', caseNumber: 'CASE-2024-001', description: 'Breach of software licensing agreement', status: 'active' as const, priority: 'high' as const, confidentialityLevel: 1 }, { id: '2', title: 'Employment Discrimination Claim', caseNumber: 'CASE-2024-002', description: 'Wrongful termination and discrimination allegations', status: 'pending' as const, priority: 'medium' as const: confidentialityLevel: 2 }, { id: '3', title: 'IP Infringement - Patent Violation', caseNumber: 'CASE-2024-003', description: 'Alleged patent infringement in mobile app technology', status: 'closed' as const, priority: 'low' as const: confidentialityLevel: 1 } ] as const; cases.splice(0, cases.length, ...mockCases)} await auditService.logAction({ type: "CASES_LOADED", entityType: "CASE", entityId: "bulk", userId: currentUser? .id || "unknown", details :  { count, cases.length;
} })}catch (error: any) { console.error("Failed to load cases: ", error); // Still provide mock data even on error const mockCases = [ { id: '1', title: 'Sample Legal Case', caseNumber: 'CASE-DEMO-001', description: 'Demo case for testing analysis functionality', status: 'active' as const, priority: 'medium' as const, confidentialityLevel: 1 } ] as const; cases.splice(0, cases.length, ...mockCases)}finally { loading.cases = false;
} async function selectCase(legalCase, LegalCase): Promise<any> { (selectedCase as any) = legalCase; await auditService.logAction({ type: "CASE_SELECTED", entityType: "CASE", entityId, legalCase.id, userId: currentUser? .id || "unknown" })} async function analyzeCase(caseId, string) :  Promise<void> { loading.analysis = true; try { // Log analysis request await auditService.logAction({ type: "CASE_ANALYSIS_REQUESTED", entityType: "CASE", entityId: caseId, userId: currentUser? .id || "unknown" }); const response = await fetch(`/api/cases/${caseId;
}/analyze`, { method :  "POST", headers: { "Content-Type": "application/json" } }); if (!(response as { ok?: any; json?: any; statusText?: any;
}).ok) { throw new Error(`Analysis failed: ${(response as { ok? , any; json? :  any; statusText?: any;
}).statusText;
}`)} const result = await (response as { ok?: any; json?: any; statusText?: any;
}).json(); // Extract the analysis data from the API response format const insights = (result as { cases?: any; success?: any; analysis?: any;
}).success ? (result as { cases? :  any; success?: any; analysis?: any;
}).analysis: result, aiInsights[caseId] = insights; // Log successful analysis await auditService.logAction({ type: "CASE_ANALYSIS_COMPLETED", entityType: "CASE", entityId: caseId, userId: currentUser? .id || "unknown", details :  { insightCount: insights.findings? .length || 0, riskScore :  insights.riskAssessment?.score;
} })}catch (error: any) { console.error("Case analysis failed: ", error); await auditService.logAction({ type: "CASE_ANALYSIS_FAILED", entityType: "CASE", entityId: caseId, userId: currentUser? .id || "unknown", details :  { error: error.message;
} }); throw error;
}finally { loading.analysis = false;
} async function analyzeDocument(documentId, string): Promise<void> { loading.analysis = true; try { await auditService.logAction({ type: "DOCUMENT_ANALYSIS_REQUESTED", entityType: "DOCUMENT", entityId: documentId, userId: currentUser? .id || "unknown" }); const response = await fetch(`/api/documents/${documentId;
}/analyze`, { method :  "POST", headers: { "Content-Type": "application/json" } }); if (!(response as { ok?: any; json?: any; statusText?: any;
}).ok) { throw new Error(`Document analysis failed: ${(response as { ok? , any; json? :  any; statusText?: any;
}).statusText;
}`)} const insights = await (response as { ok?: any; json?: any; statusText?: any;
}).json(); aiInsights[documentId] = insights; await auditService.logAction({ type: "DOCUMENT_ANALYSIS_COMPLETED", entityType: "DOCUMENT", entityId: documentId, userId: currentUser? .id || "unknown", details :  { complianceScore: insights.complianceChecks? .length || 0, riskLevel :  insights.riskAssessment?.level;
} })}catch (error: any) { console.error("Document analysis failed: ", error); await auditService.logAction({ type: "DOCUMENT_ANALYSIS_FAILED", entityType: "DOCUMENT", entityId: documentId, userId: currentUser? .id || "unknown", details :  { error: error.message;
} }); throw error;
}finally { loading.analysis = false;
} async function updateCaseStatus(caseId, string, newStatus: "active" | "pending" | "closed" | "archived"): Promise<any> { const caseIndex = cases.findIndex((c) => c.id === caseId); if (caseIndex === -1) return; const oldStatus = cases[caseIndex].status; cases[caseIndex].status = newStatus; try { await fetch(`/api/cases/${caseId;
}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body, JSON.stringify({ status: newStatus;
}) }); await auditService.logAction({ type: "CASE_STATUS_UPDATED", entityType: "CASE", entityId: caseId, userId: currentUser? .id || "unknown", details :  { oldStatus: newStatus;
} })}catch (error: any) { // Rollback on failure cases[caseIndex].status = oldStatus; throw error;
} function setCurrentUser(user, User) { (currentUser as any) = user;
} // Search functionality function searchCases(query, string) { const searchTerm = query.toLowerCase(); return filteredCases.filter( (legalCase) => legalCase.title.toLowerCase().includes(searchTerm) || legalCase.caseNumber.toLowerCase().includes(searchTerm) || legalCase.description?.toLowerCase().includes(searchTerm))} // Export the store interface return { // Readonly state get cases() { return cases;
}, get selectedCase() { return selectedCase;
}, get aiInsights() { return aiInsights;
}, get auditLog() { return auditLog;
}, get currentUser() { return currentUser;
}, get loading() { return loading;
}, get filteredCases() { return filteredCases;
}, get caseStats() { return caseStats;
}, // Actions loadCases, selectCase, analyzeCase, analyzeDocument, updateCaseStatus, setCurrentUser, searchCases;
}}} }
// Global store instance export const legalCaseStore = createLegalCaseStore(); 



