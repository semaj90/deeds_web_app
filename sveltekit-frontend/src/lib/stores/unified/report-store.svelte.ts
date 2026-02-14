/**
 * ReportStore — Svelte 5 Runes (Session 27)
 */

export type ReportType = 'analysis' | 'summary' | 'timeline' | 'evidence_review' | 'legal_memo' | 'custom';
export type ExportFormat = 'pdf' | 'docx' | 'html' | 'markdown' | 'json';

export interface ReportSection {
  id: string;
  title: string;
  content: string;
  order: number;
  type: 'text' | 'table' | 'image' | 'code' | 'divider';
  metadata?: Record<string, unknown>;
}

export interface Report {
  id: string;
  title: string;
  type: ReportType;
  caseId: string;
  sections: ReportSection[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
  isPublished: boolean;
  isShared: boolean;
  sharedWith?: string[];
  citations: string[];
  evidenceReferences: string[];
  metadata?: Record<string, unknown>;
}

class ReportStore {
  reports = $state<Report[]>([]);
  activeReportId = $state<string | null>(null);
  activeReport = $state<Report | null>(null);
  editorContent = $state<ReportSection[]>([]);
  isEditing = $state(false);
  isDirty = $state(false);
  availableCitations = $state<Array<{ id: string; text: string }>>([]);
  availableEvidence = $state<Array<{ id: string; name: string }>>([]);
  collaborators = $state<Array<{ id: string; name: string }>>([]);
  isCollaborating = $state(false);
  totalReports = $state(0);
  isLoading = $state(false);
  isSaving = $state(false);
  isPublishing = $state(false);
  error = $state<string | null>(null);
  lastUpdated = $state(0);

  reportsByType = $derived.by(() => {
    const m = new Map<ReportType, Report[]>();
    this.reports.forEach(r => {
      if (!m.has(r.type)) m.set(r.type, []);
      m.get(r.type)!.push(r);
    });
    return m;
  });

  async loadReports(caseId: string) {
    this.isLoading = true;
    this.error = null;
    try {
      const response = await fetch(`/api/cases/${caseId}/reports`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        this.reports = data?.reports || [];
        this.totalReports = this.reports.length;
        this.lastUpdated = Date.now();
      } else {
        throw new Error('Failed to load reports');
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load reports';
    } finally {
      this.isLoading = false;
    }
  }

  async createReport(type: ReportType, caseId: string, title?: string) {
    const reportTitle = title || `${type.replace('_', ' ')} - ${new Date().toLocaleDateString()}`;
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: reportTitle, type, caseId }),
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        const newReport: Report = data.report;
        this.reports = [newReport, ...this.reports];
        this.activeReport = newReport;
        this.activeReportId = newReport.id;
        this.editorContent = newReport.sections;
        this.totalReports++;
        return newReport;
      } else {
        throw new Error('Failed to create report');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create report';
      this.error = errorMsg;
      throw new Error(errorMsg);
    }
  }

  openReportForEditing(reportId: string) {
    const report = this.reports.find(r => r.id === reportId);
    if (!report) return;
    this.activeReportId = reportId;
    this.activeReport = report;
    this.editorContent = [...report.sections];
    this.isEditing = true;
    this.isDirty = false;
  }

  updateSection(sectionId: string, updates: Partial<ReportSection>) {
    const idx = this.editorContent.findIndex(s => s.id === sectionId);
    if (idx === -1) return;
    const newContent = [...this.editorContent];
    newContent[idx] = { ...newContent[idx], ...updates };
    this.editorContent = newContent;
    this.isDirty = true;
  }

  addSection(section: Omit<ReportSection, 'id' | 'order'>) {
    const newSection: ReportSection = {
      ...section,
      id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      order: this.editorContent.length,
    };
    this.editorContent = [...this.editorContent, newSection];
    this.isDirty = true;
  }

  removeSection(sectionId: string) {
    this.editorContent = this.editorContent.filter(s => s.id !== sectionId);
    this.isDirty = true;
  }

  reorderSections(sectionIds: string[]) {
    const reordered = sectionIds
      .map(id => this.editorContent.find(s => s.id === id))
      .filter((s): s is ReportSection => !!s)
      .map((s, idx) => ({ ...s, order: idx }));
    this.editorContent = reordered;
    this.isDirty = true;
  }

  async saveReport(reportId?: string) {
    const id = reportId || this.activeReportId;
    if (!id) return;
    this.isSaving = true;
    try {
      const response = await fetch(`/api/reports/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections: this.editorContent }),
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        this.activeReport = data.report;
        this.reports = this.reports.map(r => r.id === id ? data.report : r);
        this.isDirty = false;
      } else {
        throw new Error('Save failed');
      }
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      this.isSaving = false;
    }
  }

  async loadAvailableCitations(caseId: string) {
    try {
      const response = await fetch(`/api/cases/${caseId}/citations`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        this.availableCitations = data?.citations || [];
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load citations';
    }
  }

  async loadAvailableEvidence(caseId: string) {
    try {
      const response = await fetch(`/api/cases/${caseId}/evidence`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        this.availableEvidence = data?.evidence || [];
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load evidence';
    }
  }

  insertCitation(sectionId: string, citation: { id: string; text: string }) {
    const idx = this.editorContent.findIndex(s => s.id === sectionId);
    if (idx === -1) return;
    const newContent = [...this.editorContent];
    const old = newContent[idx];
    const citationText = `[Citation: ${citation.text}](citation://${citation.id})`;
    newContent[idx] = {
      ...old,
      content: old.content ? `${old.content}\n\n${citationText}` : citationText,
    };
    this.editorContent = newContent;
    this.isDirty = true;
  }

  insertEvidence(sectionId: string, evidence: { id: string; name: string }) {
    const idx = this.editorContent.findIndex(s => s.id === sectionId);
    if (idx === -1) return;
    const newContent = [...this.editorContent];
    const old = newContent[idx];
    const evidenceText = `[Evidence: ${evidence.name}](evidence://${evidence.id})`;
    newContent[idx] = {
      ...old,
      content: old.content ? `${old.content}\n\n${evidenceText}` : evidenceText,
    };
    this.editorContent = newContent;
    this.isDirty = true;
  }

  async publishReport(reportId?: string) {
    const id = reportId || this.activeReportId;
    if (!id) return;
    this.isPublishing = true;
    this.error = null;
    try {
      const response = await fetch(`/api/reports/${id}/publish`, {
        method: 'POST',
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        this.activeReport = data.report;
        this.reports = this.reports.map(r => r.id === id ? data.report : r);
      } else {
        throw new Error('Failed to publish report');
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to publish report';
    } finally {
      this.isPublishing = false;
    }
  }

  async exportReport(reportId: string, format: ExportFormat) {
    try {
      const response = await fetch(`/api/reports/${reportId}/export?format=${format}`, {
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
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to export report';
    }
  }

  async deleteReport(reportId: string) {
    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (response.ok) {
        this.reports = this.reports.filter(r => r.id !== reportId);
        if (this.activeReportId === reportId) {
          this.activeReportId = null;
          this.activeReport = null;
        }
        this.totalReports = Math.max(0, this.totalReports - 1);
      } else {
        throw new Error('Failed to delete report');
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to delete report';
    }
  }
}

export const reportStore = new ReportStore();
