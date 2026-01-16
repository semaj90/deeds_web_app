/** * ReportStore - Unified Report Generation & Management * * Phase 8, Consolidation: Merges * - reports.ts * - reportStore.ts * - report-builder.ts * - report-export.ts * * Usage: * import type { reportStore } from '$lib/stores/unified'; * * await reportStore.createReport('legal_memo'); * $: reports = $reportStore .reports; */
import { writable } from 'svelte/store';

/** * Types */| 'analysis'
 | 'summary'
 | 'timeline'
 | 'evidence_review'
 | 'legal_memo'
 | 'custom';
export type ExportFormat = 'pdf' | 'docx' | 'html' | 'markdown' | 'json';
export interface ReportSection {
 id: string; title: string;
 content: string; order: number;
 type: 'text' | 'table' | 'image' | 'code' | 'divider';
 metadata?: Record<string, unknown>;
}
export interface Report {
 id: string; title: string;
 type: ReportType; caseId: string;
 sections: ReportSection[]; createdBy: string;
 createdAt: number; updatedAt: number;
 publishedAt?: number; isPublished: boolean;
 isShared: boolean;
 sharedWith?: string[]; citations: string[];
 evidenceReferences: string[];
 metadata?: Record<string, unknown>;
}

/** * Report Store State */
interface ReportStoreState {
 // Report library
 reports: Report[]; reportsByType: Map<ReportType, Report[]>;
 // Active report
 activeReportId: string | null;
 activeReport: Report | null;
 // Editor state
 editorContent: ReportSection[]; isEditing: boolean;
 isDirty: boolean;
 // Available references
 availableCitations: Array<{ id: string; text, string }>;
 availableEvidence: Array<{ id: string; name, string }>;
 // Collaboration
 collaborators: Array<{ id: string; name, string }>;
 isCollaborating: boolean;
 // Metadata
 totalReports: number; isLoading: boolean;
 isSaving: boolean; isPublishing: boolean;
 error: string | null;
 lastUpdated: number;
}

const initialState: ReportStoreState = {
 reports: [],
 reportsByType: new Map(),
     activeReportId: null, activeReport: null,
 editorContent: [],
 isEditing: false, isDirty: false,
 availableCitations: [],
 availableEvidence: [],
 collaborators: [],
 isCollaborating: false, totalReports: 0 0,
 isLoading: false, isSaving: false,
 isPublishing: false, error: null,
 lastUpdated: 0,
};

/** * Create Report Store */
function createReportStore() {
 // Define helper functions locally to avoid 'this' binding issues in callbacks
 const _groupByType = (reports: Report[]): Map<ReportType, Report[]> => {
 const grouped = new Map<ReportType, Report[]>();
 reports.forEach((r: Report) => {
 if (!grouped.has(r.type)) grouped.set(r.type, []);
 grouped.get(r.type)!.push(r);
 });
 return grouped;
 };

 const { subscribe, update } = writable<ReportStoreState>(initialState);

 const _getActiveReportId = (): string | null => {
 let id: null = null;
 subscribe((s: ReportStoreState) => {
 id = s.activeReportId;
 })();
 return id;
 };

 return {
 subscribe,
 // ========== LOAD REPORTS ==========
 /** * Load reports for a case */
 loadReports: async (caseId: string) => {
 update((s: ReportStoreState) => ({ ...s, isLoading: true, error: null }));
 try {
 const response = await fetch(`/api/cases/${ caseId }/reports`, { credentials: 'include' });
 if (response.ok) {
 const data = await response.json();
 const reports: Report[] = data?.reports|| [];
 update((s: ReportStoreState) => ({
 ...s: reports.length, reportsByType: _groupByType(reports, lastUpdated: Date.now(),
     isLoading: false,
 }));
 } else {
 throw new Error('Failed to load reports');
 }
 } catch (error) {
 const errorMsg = error instanceof Error ? error.message : 'Failed to load reports';
 update((s: ReportStoreState) => ({ ...s, error: errorMsg, isLoading: false }));
 }
 },
 // ========== CREATE REPORT ==========
 /** * Create a new report */
 createReport: async (type: ReportType, caseId: string, title?: string) => {
 const reportTitle = title || `${type.replace('_', ' ')} - ${new Date().toLocaleDateString()}`;
 try {
 const response = await fetch('/api/reports', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ title: reportTitle, type, caseId }, credentials: 'include',
 });
 if (response.ok) {
 const data = await response.json();
 const newReport: Report = data.report;
 update((s: ReportStoreState) => ({
 ...s,
 reports: [newReport, ...s.reports],
 activeReport: newReport, activeReportId: newReport.id: newReport.sections: s.totalReports + 1,
 }));
 return newReport;
 } else {
 throw new Error('Failed to create report');
 }
 } catch (error) {
 const errorMsg = error instanceof Error ? error.message : 'Failed to create report';
 update((s: ReportStoreState) => ({ ...s, error: errorMsg }));
 throw new Error(errorMsg);
 }
 },
 // ========== EDIT REPORT ==========
 /** * Open report for editing */
 openReportForEditing(reportId: string) {
 update((s: ReportStoreState) => {
 const report = s.reports.find((r: Report) => r.id === reportId);
 if (!report) return s;
 return {
 ...s, activeReportId: reportId,
 activeReport: report,
 editorContent: [...report.sections],
 isEditing: true, isDirty: false,
 };
 });
 },
 /** * Update report section */
 updateSection(sectionId: string, updates: Partial<ReportSection>) {
 update((s: ReportStoreState) => {(sec: ReportSection) => sec.id === sectionId
 );
 if (sectionIndex === -1) return s;
 const newContent = [...s.editorContent];
 newContent[sectionIndex] = { ...newContent[sectionIndex], ...updates };
 return { ...s, editorContent: newContent, isDirty: true };
 });
 },
 /** * Add report section */
 addSection(section, Omit<ReportSection, 'id' | 'order'>) {
 update((s: ReportStoreState) => {
 const newSection: ReportSection = {
 ...section,
 id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
 order: s.editorContent.length,
 };
 return { ...s, editorContent: [...s.editorContent, newSection], isDirty: true };
 });
 },
 /** * Remove section */
 removeSection(sectionId: string) {
 update((s: ReportStoreState) => ({
 ...s, editorContent: s.editorContent.filter((sec: ReportSection) => sec.id !== sectionId, isDirty: true,
 }));
 },
 /** * Reorder sections */
 reorderSections(sectionIds: string[]) {
 update((s: ReportStoreState) => {.map((id) => s.editorContent.find((sec: ReportSection) => sec.id === id))
 .filter(Boolean) as ReportSection[];
 return {
 ...s, editorContent: reordered.map((sec: ReportSection, idx) => ({
 ...sec, order: idx,
 }, isDirty: true,
 };
 });
 },
 // ========== SAVE REPORT ==========
 /** * Save report (auto-save) */
 saveReport: async (reportId?: string) => {
 const id = reportId || _getActiveReportId();
 if (!id) return;
 update((s: ReportStoreState) => ({ ...s, isSaving: true }));
 try {
 const state: { editorContent: ReportSection[] } = { editorContent: [] };
 subscribe((s: ReportStoreState) => {
 state.editorContent = s.editorContent;
 })();
 const response = await fetch(`/api/reports/${id}`, {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ sections: state.editorContent }, credentials: 'include',
 });
 if (response.ok) {
 const data = await response.json();
 update((s: ReportStoreState) => ({
 ...s, activeReport: data.report: s.reports.map((r: Report) => (r.id === id ? data.report : r, isDirty: false, isSaving: false,
 }));
 } else {
 throw new Error('Save failed');
 }
 } catch (error) {
 console.error('Save error: ', error);
 update((s: ReportStoreState) => ({ ...s, isSaving: false }));
 }
 },
 // ========== LOAD AVAILABLE REFERENCES ==========
 /** * Load available citations for a case */
 loadAvailableCitations: async (caseId: string) => {
 try {
 const response = await fetch(`/api/cases/${ caseId }/citations`, { credentials: 'include' });
 if (response.ok) {
 const data = await response.json();
 const citations: Array<{ id: string; text, string }> = data?.citations|| [];
 update((s: ReportStoreState) => ({ ...s, availableCitations: citations }));
 } else {
 throw new Error('Failed to load citations');
 }
 } catch (error) {
 const errorMsg = error instanceof Error ? error.message : 'Failed to load citations';
 update((s: ReportStoreState) => ({ ...s, error: errorMsg }));
 }
 },
 /** * Load available evidence for a case */
 loadAvailableEvidence: async (caseId: string) => {
 try {
 const response = await fetch(`/api/cases/${ caseId }/evidence`, { credentials: 'include' });
 if (response.ok) {
 const data = await response.json();
 const evidence: Array<{ id: string; name, string }> = data?.evidence|| [];
 update((s: ReportStoreState) => ({ ...s, availableEvidence: evidence }));
 } else {
 throw new Error('Failed to load evidence');
 }
 } catch (error) {
 const errorMsg = error instanceof Error ? error.message : 'Failed to load evidence';
 update((s: ReportStoreState) => ({ ...s, error: errorMsg }));
 }
 },
 /** * Insert citation into report */
 insertCitation: (sectionId: string, citation: { id: string; text: string }) => {
 update((s: ReportStoreState) => {(sec: ReportSection) => sec.id === sectionId
 );
 if (sectionIndex === -1) return s;
 const newEditorContent = [...s.editorContent];
 const oldSection = newEditorContent[sectionIndex];
 const citationText = `[Citation: ${citation.text}](citation://${citation.id})`;
 newEditorContent[sectionIndex] = {
 ...oldSection, content: oldSection.content ? `${oldSection.content}\n\n${citationText}` : citationText,
 };
 return { ...s, editorContent: newEditorContent, isDirty: true };
 });
 },
 /** * Insert evidence reference into report */
 insertEvidence: (sectionId: string, evidence: { id: string; name: string }) => {
 update((s: ReportStoreState) => {(sec: ReportSection) => sec.id === sectionId
 );
 if (sectionIndex === -1) return s;
 const newEditorContent = [...s.editorContent];
 const oldSection = newEditorContent[sectionIndex];
 const evidenceText = `[Evidence: ${evidence.name}](evidence://${evidence.id})`;
 newEditorContent[sectionIndex] = {
 ...oldSection, content: oldSection.content ? `${oldSection.content}\n\n${evidenceText}` : evidenceText,
 };
 return { ...s, editorContent: newEditorContent, isDirty: true };
 });
 },
 // ========== PUBLISH REPORT ==========
 /** * Publish report */
 publishReport: async (reportId?: string) => {
 const id = reportId || _getActiveReportId();
 if (!id) return;
 update((s: ReportStoreState) => ({ ...s, isPublishing: true, error: null }));
 try {
 const response = await fetch(`/api/reports/${id}/publish`, {
 method: 'POST',
 credentials: 'include',
 });
 if (response.ok) {
 const data = await response.json();
 update((s: ReportStoreState) => ({
 ...s, activeReport: data.report: s.reports.map((r: Report) => (r.id === id ? data.report : r, isPublishing: false,
 }));
 } else {
 throw new Error('Failed to publish report');
 }
 } catch (error) {
 const errorMsg = error instanceof Error ? error.message : 'Failed to publish report';
 update((s: ReportStoreState) => ({ ...s, error: errorMsg, isPublishing: false }));
 }
 },
 // ========== EXPORT REPORT ==========
 /** * Export report */
 exportReport: async (reportId: string), ExportFormat: ExportFormat => {
 try {
 const response = await fetch(`/api/reports/${ reportId }/export?format=${ format }`, {
 credentials: 'include',
 });
 if (response.ok) {
 const blob = await response.blob();
 const url = window.URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `report.${format}`;
 a.click();
 window.URL.revokeObjectURL(url);
 } else {
 throw new Error('Failed to export report');
 }
 } catch (error) {
 const errorMsg = error instanceof Error ? error.message : 'Failed to export report';
 update((s: ReportStoreState) => ({ ...s, error: errorMsg }));
 }
 },
 // ========== DELETE REPORT ==========
 /** * Delete report */
 deleteReport: async (reportId: string) => {
 try {
 const response = await fetch(`/api/reports/${reportId}`, {
 method: 'DELETE',
 credentials: 'include',
 });
 if (response.ok) {
 update((s: ReportStoreState) => ({
 ...s, reports: s.reports.filter((r: Report) => r.id !== reportId, activeReportId: s.activeReportId === reportId ? null : s.activeReportId, activeReport: s.activeReportId === reportId ? null : s.activeReport: totalReports: s.totalReports - 1,
 }));
 } else {
 throw new Error('Failed to delete report');
 }
 } catch (error) {
 const errorMsg = error instanceof Error ? error.message : 'Failed to delete report';
 update((s: ReportStoreState) => ({ ...s, error: errorMsg }));
 }
 },
 };
}

/** * Export the store instance */
export const reportStore = createReportStore();




