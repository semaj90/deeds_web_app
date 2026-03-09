/**
 * Case Store - Manages current case data, crimes, evidence, reports, and timeline
 */
import { writable } from "svelte/store";
import type { Case, Crime, Evidence, Report, TimelineItem } from "$lib/types";

// Current case state
export const currentCase = writable<Case | null>(null);

// Case-related data
export const currentCrimes = writable<Crime[]>([]);
export const currentEvidence = writable<Evidence[]>([]);
export const currentReports = writable<Report[]>([]);
export const timelineItems = writable<TimelineItem[]>([]);

// Loading states
export const isLoading = writable<boolean>(false);
export const error = writable<string | null>(null);

// Case actions
export const caseActions = {
  // Load a specific case and all its related data
  async loadCase(caseId: string) {
    isLoading.set(true);
    error.set(null);

    try {
      // Load case details
      const caseResponse = await fetch(`/api/cases/${caseId}`);
      if (!caseResponse.ok) throw new Error("Failed to load case");
      const caseData = await caseResponse.json();
      currentCase.set(caseData);

      // Load related data in parallel
      const [
        crimesResponse,
        evidenceResponse,
        reportsResponse,
        timelineResponse,
      ] = await Promise.all([
        fetch(`/api/cases/${caseId}/crimes`),
        fetch(`/api/cases/${caseId}/evidence`),
        fetch(`/api/cases/${caseId}/reports`),
        fetch(`/api/cases/${caseId}/timeline`),
      ]);

      if (crimesResponse.ok) {
        const crimes = await crimesResponse.json();
        currentCrimes.set(crimes);
      }

      if (evidenceResponse.ok) {
        const evidence = await evidenceResponse.json();
        currentEvidence.set(evidence);
      }

      if (reportsResponse.ok) {
        const reports = await reportsResponse.json();
        currentReports.set(reports);
      }

      if (timelineResponse.ok) {
        const timeline = await timelineResponse.json();
        timelineItems.set(timeline);
      }
    } catch (err) {
      error.set(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      isLoading.set(false);
    }
  },

  // Add new evidence to the current case
  async addEvidence(evidence: Evidence) {
    currentEvidence.update((items) => [...items, evidence]);

    // Add timeline entry
    const timelineEntry: TimelineItem = {
      id: crypto.randomUUID(),
      caseId: evidence.caseId,
      timestamp: new Date(),
      title: "Evidence Added",
      description: `New evidence uploaded: ${evidence.filename}`,
      type: "evidence_added",
      relatedItemId: evidence.id,
      createdBy: evidence.uploadedBy,
    };

    timelineItems.update((items) =>
      [...items, timelineEntry].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      ),
    );
  },

  // Add new crime to the current case
  async addCrime(crime: Crime) {
    currentCrimes.update((items) => [...items, crime]);

    // Add timeline entry
    const timelineEntry: TimelineItem = {
      id: crypto.randomUUID(),
      caseId: crime.caseId,
      timestamp: new Date(),
      title: "Crime Logged",
      description: `${crime.type}: ${crime.description}`,
      type: "crime_logged",
      relatedItemId: crime.id,
      createdBy: "system",
    };

    timelineItems.update((items) =>
      [...items, timelineEntry].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      ),
    );
  },

  // Add new report to the current case
  async addReport(report: Report) {
    currentReports.update((items) => [...items, report]);

    // Add timeline entry
    const timelineEntry: TimelineItem = {
      id: crypto.randomUUID(),
      caseId: report.caseId,
      timestamp: new Date(),
      title: "Report Created",
      description: `${report.type} report: ${report.title}`,
      type: "report_created",
      relatedItemId: report.id,
      createdBy: report.createdBy,
    };

    timelineItems.update((items) =>
      [...items, timelineEntry].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      ),
    );
  },

  // Clear all case data
  clearCase() {
    currentCase.set(null);
    currentCrimes.set([]);
    currentEvidence.set([]);
    currentReports.set([]);
    timelineItems.set([]);
    error.set(null);
  },
};

// Derived stores for computed values
import { derived } from "svelte/store";

export const caseStats = derived(
  [currentEvidence, currentCrimes, currentReports],
  ([$evidence, $crimes, $reports]) => ({
    evidenceCount: $evidence.length,
    crimeCount: $crimes.length,
    reportCount: $reports.length,
    imageCount: $evidence.filter((e) => e.type === "image").length,
    documentCount: $evidence.filter((e) => e.type === "document").length,
    audioCount: $evidence.filter((e) => e.type === "audio").length,
    videoCount: $evidence.filter((e) => e.type === "video").length,
  }),
);

export const recentActivity = derived(
  [timelineItems],
  ([$timeline]) => $timeline.slice(0, 5), // Most recent 5 items
);
