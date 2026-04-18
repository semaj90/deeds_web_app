import { relations } from "drizzle-orm/relations";
import { users, caseScores, cases, caseNotes, caseNoteVersions, evidence, caseNoteEvidenceRefs, aiReports, caseStatuteLinks, citations, statutes, citationTags, citationCollections, emailVerificationCodes, errorSuggestions, errorSuggestionStates, evidenceAuditLog, errorClusters, evidenceBoardConnections, evidenceRelationships, evidenceVersions, legalDocuments, legalAnalysisSessions, passwordResetTokens, pushSubscriptions, ragSessions, routeErrorPatches, savedReports, sessions, statuteChunks, legalResearch, reports, reportAuditLog, themes, userAiQueries, workspaces, workspaceNotes, storageFiles, workspaceEvidence, workspaceSessions, userEmbeddings, workspaceStatutes, errorFeedback, workspaceCitations, personsOfInterest, poiPhotos, libraryDocuments, libraryDocumentVersions, legalNodes, legalChunks, legalDefinitions, pageArtifacts, ingestionJobs, jurisdictions, stateConstitutionSources, legalCitations, caseLibraryLinks, evidenceChunks, timelineEvents, chatMetadata, chatMessages, codebaseFiles, codebaseEmbeddings, codebaseMapreduceJobs, mapreduceReduceResults, apiAuditLog, poiProfiles, mapreduceMapQueue, chatTurnEvidence, aceChunks, yorhaChatSessions, chatDocumentAttachments, documents, routeMetadata, errorCluster, routeInteractionLog, routeHealthEvent, errorBrainAnalysis, errorBrainPatch, analyticsEvents, collectionCitations } from "./schema";

export const caseScoresRelations = relations(caseScores, ({one}) => ({
	user: one(users, {
		fields: [caseScores.calculatedBy],
		references: [users.id]
	}),
	case: one(cases, {
		fields: [caseScores.caseId],
		references: [cases.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	caseScores: many(caseScores),
	citationCollections: many(citationCollections),
	cases_assignedTo: many(cases, {
		relationName: "cases_assignedTo_users_id"
	}),
	cases_createdBy: many(cases, {
		relationName: "cases_createdBy_users_id"
	}),
	emailVerificationCodes: many(emailVerificationCodes),
	evidenceAuditLogs: many(evidenceAuditLog),
	evidenceVersions: many(evidenceVersions),
	legalDocuments_createdBy: many(legalDocuments, {
		relationName: "legalDocuments_createdBy_users_id"
	}),
	legalDocuments_userId: many(legalDocuments, {
		relationName: "legalDocuments_userId_users_id"
	}),
	legalAnalysisSessions: many(legalAnalysisSessions),
	evidences_uploadedBy: many(evidence, {
		relationName: "evidence_uploadedBy_users_id"
	}),
	evidences_userId: many(evidence, {
		relationName: "evidence_userId_users_id"
	}),
	passwordResetTokens: many(passwordResetTokens),
	pushSubscriptions: many(pushSubscriptions),
	ragSessions: many(ragSessions),
	routeErrorPatches: many(routeErrorPatches),
	savedReports: many(savedReports),
	sessions: many(sessions),
	legalResearches: many(legalResearch),
	themes: many(themes),
	userAiQueries: many(userAiQueries),
	storageFiles: many(storageFiles),
	userEmbeddings: many(userEmbeddings),
	libraryDocuments: many(libraryDocuments),
	chatMetadata: many(chatMetadata),
	chatMessages: many(chatMessages),
	apiAuditLogs: many(apiAuditLog),
	analyticsEvents: many(analyticsEvents),
}));

export const casesRelations = relations(cases, ({one, many}) => ({
	caseScores: many(caseScores),
	caseNotes: many(caseNotes),
	aiReports: many(aiReports),
	caseStatuteLinks: many(caseStatuteLinks),
	user_assignedTo: one(users, {
		fields: [cases.assignedTo],
		references: [users.id],
		relationName: "cases_assignedTo_users_id"
	}),
	user_createdBy: one(users, {
		fields: [cases.createdBy],
		references: [users.id],
		relationName: "cases_createdBy_users_id"
	}),
	evidenceBoardConnections: many(evidenceBoardConnections),
	evidenceRelationships: many(evidenceRelationships),
	legalDocuments: many(legalDocuments),
	evidences: many(evidence),
	userAiQueries_caseId: many(userAiQueries, {
		relationName: "userAiQueries_caseId_cases_id"
	}),
	userAiQueries_caseId: many(userAiQueries, {
		relationName: "userAiQueries_caseId_cases_id"
	}),
	workspaces: many(workspaces),
	caseLibraryLinks: many(caseLibraryLinks),
	chatMetadata: many(chatMetadata),
	chatMessages: many(chatMessages),
	poiProfiles: many(poiProfiles),
	aceChunks: many(aceChunks),
}));

export const caseNoteVersionsRelations = relations(caseNoteVersions, ({one}) => ({
	caseNote: one(caseNotes, {
		fields: [caseNoteVersions.noteId],
		references: [caseNotes.id]
	}),
}));

export const caseNotesRelations = relations(caseNotes, ({one, many}) => ({
	caseNoteVersions: many(caseNoteVersions),
	caseNoteEvidenceRefs: many(caseNoteEvidenceRefs),
	case: one(cases, {
		fields: [caseNotes.caseId],
		references: [cases.id]
	}),
}));

export const caseNoteEvidenceRefsRelations = relations(caseNoteEvidenceRefs, ({one}) => ({
	evidence: one(evidence, {
		fields: [caseNoteEvidenceRefs.evidenceId],
		references: [evidence.id]
	}),
	caseNote: one(caseNotes, {
		fields: [caseNoteEvidenceRefs.noteId],
		references: [caseNotes.id]
	}),
}));

export const evidenceRelations = relations(evidence, ({one, many}) => ({
	caseNoteEvidenceRefs: many(caseNoteEvidenceRefs),
	evidenceAuditLogs: many(evidenceAuditLog),
	evidenceBoardConnections_fromEvidenceId: many(evidenceBoardConnections, {
		relationName: "evidenceBoardConnections_fromEvidenceId_evidence_id"
	}),
	evidenceBoardConnections_toEvidenceId: many(evidenceBoardConnections, {
		relationName: "evidenceBoardConnections_toEvidenceId_evidence_id"
	}),
	evidenceRelationships_fromEvidenceId: many(evidenceRelationships, {
		relationName: "evidenceRelationships_fromEvidenceId_evidence_id"
	}),
	evidenceRelationships_toEvidenceId: many(evidenceRelationships, {
		relationName: "evidenceRelationships_toEvidenceId_evidence_id"
	}),
	evidenceVersions: many(evidenceVersions),
	legalDocuments: many(legalDocuments),
	case: one(cases, {
		fields: [evidence.caseId],
		references: [cases.id]
	}),
	user_uploadedBy: one(users, {
		fields: [evidence.uploadedBy],
		references: [users.id],
		relationName: "evidence_uploadedBy_users_id"
	}),
	user_userId: one(users, {
		fields: [evidence.userId],
		references: [users.id],
		relationName: "evidence_userId_users_id"
	}),
	workspaceEvidences: many(workspaceEvidence),
	evidenceChunks: many(evidenceChunks),
	chatTurnEvidences: many(chatTurnEvidence),
}));

export const aiReportsRelations = relations(aiReports, ({one}) => ({
	case: one(cases, {
		fields: [aiReports.caseId],
		references: [cases.id]
	}),
}));

export const caseStatuteLinksRelations = relations(caseStatuteLinks, ({one}) => ({
	case: one(cases, {
		fields: [caseStatuteLinks.caseId],
		references: [cases.id]
	}),
	citation: one(citations, {
		fields: [caseStatuteLinks.citationId],
		references: [citations.id]
	}),
	statute: one(statutes, {
		fields: [caseStatuteLinks.statuteId],
		references: [statutes.id]
	}),
}));

export const citationsRelations = relations(citations, ({many}) => ({
	caseStatuteLinks: many(caseStatuteLinks),
	citationTags: many(citationTags),
	collectionCitations: many(collectionCitations),
}));

export const statutesRelations = relations(statutes, ({many}) => ({
	caseStatuteLinks: many(caseStatuteLinks),
	statuteChunks: many(statuteChunks),
	workspaceStatutes: many(workspaceStatutes),
}));

export const citationTagsRelations = relations(citationTags, ({one}) => ({
	citation: one(citations, {
		fields: [citationTags.citationId],
		references: [citations.id]
	}),
}));

export const citationCollectionsRelations = relations(citationCollections, ({one, many}) => ({
	user: one(users, {
		fields: [citationCollections.userId],
		references: [users.id]
	}),
	collectionCitations: many(collectionCitations),
}));

export const emailVerificationCodesRelations = relations(emailVerificationCodes, ({one}) => ({
	user: one(users, {
		fields: [emailVerificationCodes.userId],
		references: [users.id]
	}),
}));

export const errorSuggestionStatesRelations = relations(errorSuggestionStates, ({one}) => ({
	errorSuggestion: one(errorSuggestions, {
		fields: [errorSuggestionStates.suggestionId],
		references: [errorSuggestions.id]
	}),
}));

export const errorSuggestionsRelations = relations(errorSuggestions, ({one, many}) => ({
	errorSuggestionStates: many(errorSuggestionStates),
	errorCluster: one(errorClusters, {
		fields: [errorSuggestions.clusterId],
		references: [errorClusters.id]
	}),
	errorFeedbacks: many(errorFeedback),
}));

export const evidenceAuditLogRelations = relations(evidenceAuditLog, ({one}) => ({
	evidence: one(evidence, {
		fields: [evidenceAuditLog.evidenceId],
		references: [evidence.id]
	}),
	user: one(users, {
		fields: [evidenceAuditLog.userId],
		references: [users.id]
	}),
}));

export const errorClustersRelations = relations(errorClusters, ({many}) => ({
	errorSuggestions: many(errorSuggestions),
}));

export const evidenceBoardConnectionsRelations = relations(evidenceBoardConnections, ({one}) => ({
	case: one(cases, {
		fields: [evidenceBoardConnections.caseId],
		references: [cases.id]
	}),
	evidence_fromEvidenceId: one(evidence, {
		fields: [evidenceBoardConnections.fromEvidenceId],
		references: [evidence.id],
		relationName: "evidenceBoardConnections_fromEvidenceId_evidence_id"
	}),
	evidence_toEvidenceId: one(evidence, {
		fields: [evidenceBoardConnections.toEvidenceId],
		references: [evidence.id],
		relationName: "evidenceBoardConnections_toEvidenceId_evidence_id"
	}),
}));

export const evidenceRelationshipsRelations = relations(evidenceRelationships, ({one}) => ({
	case: one(cases, {
		fields: [evidenceRelationships.caseId],
		references: [cases.id]
	}),
	evidence_fromEvidenceId: one(evidence, {
		fields: [evidenceRelationships.fromEvidenceId],
		references: [evidence.id],
		relationName: "evidenceRelationships_fromEvidenceId_evidence_id"
	}),
	evidence_toEvidenceId: one(evidence, {
		fields: [evidenceRelationships.toEvidenceId],
		references: [evidence.id],
		relationName: "evidenceRelationships_toEvidenceId_evidence_id"
	}),
}));

export const evidenceVersionsRelations = relations(evidenceVersions, ({one}) => ({
	user: one(users, {
		fields: [evidenceVersions.changedBy],
		references: [users.id]
	}),
	evidence: one(evidence, {
		fields: [evidenceVersions.evidenceId],
		references: [evidence.id]
	}),
}));

export const legalDocumentsRelations = relations(legalDocuments, ({one}) => ({
	case: one(cases, {
		fields: [legalDocuments.caseId],
		references: [cases.id]
	}),
	user_createdBy: one(users, {
		fields: [legalDocuments.createdBy],
		references: [users.id],
		relationName: "legalDocuments_createdBy_users_id"
	}),
	evidence: one(evidence, {
		fields: [legalDocuments.evidenceId],
		references: [evidence.id]
	}),
	user_userId: one(users, {
		fields: [legalDocuments.userId],
		references: [users.id],
		relationName: "legalDocuments_userId_users_id"
	}),
}));

export const legalAnalysisSessionsRelations = relations(legalAnalysisSessions, ({one}) => ({
	user: one(users, {
		fields: [legalAnalysisSessions.userId],
		references: [users.id]
	}),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({one}) => ({
	user: one(users, {
		fields: [passwordResetTokens.userId],
		references: [users.id]
	}),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({one}) => ({
	user: one(users, {
		fields: [pushSubscriptions.userId],
		references: [users.id]
	}),
}));

export const ragSessionsRelations = relations(ragSessions, ({one}) => ({
	user: one(users, {
		fields: [ragSessions.userId],
		references: [users.id]
	}),
}));

export const routeErrorPatchesRelations = relations(routeErrorPatches, ({one}) => ({
	user: one(users, {
		fields: [routeErrorPatches.createdBy],
		references: [users.id]
	}),
}));

export const savedReportsRelations = relations(savedReports, ({one}) => ({
	user: one(users, {
		fields: [savedReports.userId],
		references: [users.id]
	}),
}));

export const sessionsRelations = relations(sessions, ({one}) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id]
	}),
}));

export const statuteChunksRelations = relations(statuteChunks, ({one}) => ({
	statute: one(statutes, {
		fields: [statuteChunks.statuteId],
		references: [statutes.id]
	}),
}));

export const legalResearchRelations = relations(legalResearch, ({one}) => ({
	user: one(users, {
		fields: [legalResearch.createdBy],
		references: [users.id]
	}),
}));

export const reportAuditLogRelations = relations(reportAuditLog, ({one}) => ({
	report: one(reports, {
		fields: [reportAuditLog.reportId],
		references: [reports.id]
	}),
}));

export const reportsRelations = relations(reports, ({many}) => ({
	reportAuditLogs: many(reportAuditLog),
}));

export const themesRelations = relations(themes, ({one}) => ({
	user: one(users, {
		fields: [themes.userId],
		references: [users.id]
	}),
}));

export const userAiQueriesRelations = relations(userAiQueries, ({one}) => ({
	case_caseId: one(cases, {
		fields: [userAiQueries.caseId],
		references: [cases.id],
		relationName: "userAiQueries_caseId_cases_id"
	}),
	case_caseId: one(cases, {
		fields: [userAiQueries.caseId],
		references: [cases.id],
		relationName: "userAiQueries_caseId_cases_id"
	}),
	user: one(users, {
		fields: [userAiQueries.userId],
		references: [users.id]
	}),
}));

export const workspaceNotesRelations = relations(workspaceNotes, ({one}) => ({
	workspace: one(workspaces, {
		fields: [workspaceNotes.workspaceId],
		references: [workspaces.id]
	}),
}));

export const workspacesRelations = relations(workspaces, ({one, many}) => ({
	workspaceNotes: many(workspaceNotes),
	case: one(cases, {
		fields: [workspaces.caseId],
		references: [cases.id]
	}),
	workspaceEvidences: many(workspaceEvidence),
	workspaceSessions: many(workspaceSessions),
	workspaceStatutes: many(workspaceStatutes),
	workspaceCitations: many(workspaceCitations),
}));

export const storageFilesRelations = relations(storageFiles, ({one}) => ({
	user: one(users, {
		fields: [storageFiles.userId],
		references: [users.id]
	}),
}));

export const workspaceEvidenceRelations = relations(workspaceEvidence, ({one}) => ({
	evidence: one(evidence, {
		fields: [workspaceEvidence.evidenceId],
		references: [evidence.id]
	}),
	workspace: one(workspaces, {
		fields: [workspaceEvidence.workspaceId],
		references: [workspaces.id]
	}),
}));

export const workspaceSessionsRelations = relations(workspaceSessions, ({one}) => ({
	workspace: one(workspaces, {
		fields: [workspaceSessions.workspaceId],
		references: [workspaces.id]
	}),
}));

export const userEmbeddingsRelations = relations(userEmbeddings, ({one}) => ({
	user: one(users, {
		fields: [userEmbeddings.userId],
		references: [users.id]
	}),
}));

export const workspaceStatutesRelations = relations(workspaceStatutes, ({one}) => ({
	statute: one(statutes, {
		fields: [workspaceStatutes.statuteId],
		references: [statutes.id]
	}),
	workspace: one(workspaces, {
		fields: [workspaceStatutes.workspaceId],
		references: [workspaces.id]
	}),
}));

export const errorFeedbackRelations = relations(errorFeedback, ({one}) => ({
	errorSuggestion: one(errorSuggestions, {
		fields: [errorFeedback.suggestionId],
		references: [errorSuggestions.id]
	}),
}));

export const workspaceCitationsRelations = relations(workspaceCitations, ({one}) => ({
	workspace: one(workspaces, {
		fields: [workspaceCitations.workspaceId],
		references: [workspaces.id]
	}),
}));

export const poiPhotosRelations = relations(poiPhotos, ({one}) => ({
	personsOfInterest: one(personsOfInterest, {
		fields: [poiPhotos.poiId],
		references: [personsOfInterest.id]
	}),
}));

export const personsOfInterestRelations = relations(personsOfInterest, ({many}) => ({
	poiPhotos: many(poiPhotos),
	timelineEvents: many(timelineEvents),
}));

export const libraryDocumentVersionsRelations = relations(libraryDocumentVersions, ({one, many}) => ({
	libraryDocument: one(libraryDocuments, {
		fields: [libraryDocumentVersions.documentId],
		references: [libraryDocuments.id]
	}),
	libraryDocumentVersion: one(libraryDocumentVersions, {
		fields: [libraryDocumentVersions.parentVersionId],
		references: [libraryDocumentVersions.id],
		relationName: "libraryDocumentVersions_parentVersionId_libraryDocumentVersions_id"
	}),
	libraryDocumentVersions: many(libraryDocumentVersions, {
		relationName: "libraryDocumentVersions_parentVersionId_libraryDocumentVersions_id"
	}),
	legalNodes: many(legalNodes),
}));

export const libraryDocumentsRelations = relations(libraryDocuments, ({one, many}) => ({
	libraryDocumentVersions: many(libraryDocumentVersions),
	pageArtifacts: many(pageArtifacts),
	ingestionJobs: many(ingestionJobs),
	jurisdiction: one(jurisdictions, {
		fields: [libraryDocuments.jurisdictionId],
		references: [jurisdictions.id]
	}),
	user: one(users, {
		fields: [libraryDocuments.uploadedBy],
		references: [users.id]
	}),
	legalNodes: many(legalNodes),
	stateConstitutionSources: many(stateConstitutionSources),
	caseLibraryLinks: many(caseLibraryLinks),
}));

export const legalChunksRelations = relations(legalChunks, ({one}) => ({
	legalNode: one(legalNodes, {
		fields: [legalChunks.legalNodeId],
		references: [legalNodes.id]
	}),
}));

export const legalNodesRelations = relations(legalNodes, ({one, many}) => ({
	legalChunks: many(legalChunks),
	legalDefinitions: many(legalDefinitions),
	libraryDocument: one(libraryDocuments, {
		fields: [legalNodes.documentId],
		references: [libraryDocuments.id]
	}),
	libraryDocumentVersion: one(libraryDocumentVersions, {
		fields: [legalNodes.versionId],
		references: [libraryDocumentVersions.id]
	}),
	legalNode: one(legalNodes, {
		fields: [legalNodes.parentNodeId],
		references: [legalNodes.id],
		relationName: "legalNodes_parentNodeId_legalNodes_id"
	}),
	legalNodes: many(legalNodes, {
		relationName: "legalNodes_parentNodeId_legalNodes_id"
	}),
	legalCitations_fromNodeId: many(legalCitations, {
		relationName: "legalCitations_fromNodeId_legalNodes_id"
	}),
	legalCitations_toNodeId: many(legalCitations, {
		relationName: "legalCitations_toNodeId_legalNodes_id"
	}),
	caseLibraryLinks: many(caseLibraryLinks),
}));

export const legalDefinitionsRelations = relations(legalDefinitions, ({one}) => ({
	legalNode: one(legalNodes, {
		fields: [legalDefinitions.definedInNodeId],
		references: [legalNodes.id]
	}),
}));

export const pageArtifactsRelations = relations(pageArtifacts, ({one}) => ({
	libraryDocument: one(libraryDocuments, {
		fields: [pageArtifacts.documentId],
		references: [libraryDocuments.id]
	}),
}));

export const ingestionJobsRelations = relations(ingestionJobs, ({one}) => ({
	libraryDocument: one(libraryDocuments, {
		fields: [ingestionJobs.documentId],
		references: [libraryDocuments.id]
	}),
}));

export const jurisdictionsRelations = relations(jurisdictions, ({many}) => ({
	libraryDocuments: many(libraryDocuments),
}));

export const stateConstitutionSourcesRelations = relations(stateConstitutionSources, ({one}) => ({
	libraryDocument: one(libraryDocuments, {
		fields: [stateConstitutionSources.documentId],
		references: [libraryDocuments.id]
	}),
}));

export const legalCitationsRelations = relations(legalCitations, ({one}) => ({
	legalNode_fromNodeId: one(legalNodes, {
		fields: [legalCitations.fromNodeId],
		references: [legalNodes.id],
		relationName: "legalCitations_fromNodeId_legalNodes_id"
	}),
	legalNode_toNodeId: one(legalNodes, {
		fields: [legalCitations.toNodeId],
		references: [legalNodes.id],
		relationName: "legalCitations_toNodeId_legalNodes_id"
	}),
}));

export const caseLibraryLinksRelations = relations(caseLibraryLinks, ({one}) => ({
	case: one(cases, {
		fields: [caseLibraryLinks.caseId],
		references: [cases.id]
	}),
	libraryDocument: one(libraryDocuments, {
		fields: [caseLibraryLinks.documentId],
		references: [libraryDocuments.id]
	}),
	legalNode: one(legalNodes, {
		fields: [caseLibraryLinks.nodeId],
		references: [legalNodes.id]
	}),
}));

export const evidenceChunksRelations = relations(evidenceChunks, ({one}) => ({
	evidence: one(evidence, {
		fields: [evidenceChunks.evidenceId],
		references: [evidence.id]
	}),
}));

export const timelineEventsRelations = relations(timelineEvents, ({one}) => ({
	personsOfInterest: one(personsOfInterest, {
		fields: [timelineEvents.poiId],
		references: [personsOfInterest.id]
	}),
}));

export const chatMetadataRelations = relations(chatMetadata, ({one}) => ({
	user: one(users, {
		fields: [chatMetadata.userId],
		references: [users.id]
	}),
	case: one(cases, {
		fields: [chatMetadata.caseId],
		references: [cases.id]
	}),
}));

export const chatMessagesRelations = relations(chatMessages, ({one}) => ({
	user: one(users, {
		fields: [chatMessages.userId],
		references: [users.id]
	}),
	case: one(cases, {
		fields: [chatMessages.caseId],
		references: [cases.id]
	}),
}));

export const codebaseEmbeddingsRelations = relations(codebaseEmbeddings, ({one}) => ({
	codebaseFile: one(codebaseFiles, {
		fields: [codebaseEmbeddings.fileId],
		references: [codebaseFiles.id]
	}),
}));

export const codebaseFilesRelations = relations(codebaseFiles, ({many}) => ({
	codebaseEmbeddings: many(codebaseEmbeddings),
}));

export const mapreduceReduceResultsRelations = relations(mapreduceReduceResults, ({one}) => ({
	codebaseMapreduceJob: one(codebaseMapreduceJobs, {
		fields: [mapreduceReduceResults.jobId],
		references: [codebaseMapreduceJobs.id]
	}),
}));

export const codebaseMapreduceJobsRelations = relations(codebaseMapreduceJobs, ({many}) => ({
	mapreduceReduceResults: many(mapreduceReduceResults),
	mapreduceMapQueues: many(mapreduceMapQueue),
}));

export const apiAuditLogRelations = relations(apiAuditLog, ({one}) => ({
	user: one(users, {
		fields: [apiAuditLog.userId],
		references: [users.id]
	}),
}));

export const poiProfilesRelations = relations(poiProfiles, ({one}) => ({
	case: one(cases, {
		fields: [poiProfiles.caseId],
		references: [cases.id]
	}),
}));

export const mapreduceMapQueueRelations = relations(mapreduceMapQueue, ({one}) => ({
	codebaseMapreduceJob: one(codebaseMapreduceJobs, {
		fields: [mapreduceMapQueue.jobId],
		references: [codebaseMapreduceJobs.id]
	}),
}));

export const chatTurnEvidenceRelations = relations(chatTurnEvidence, ({one}) => ({
	evidence: one(evidence, {
		fields: [chatTurnEvidence.evidenceId],
		references: [evidence.id]
	}),
}));

export const aceChunksRelations = relations(aceChunks, ({one}) => ({
	case: one(cases, {
		fields: [aceChunks.caseId],
		references: [cases.id]
	}),
}));

export const chatDocumentAttachmentsRelations = relations(chatDocumentAttachments, ({one}) => ({
	yorhaChatSession: one(yorhaChatSessions, {
		fields: [chatDocumentAttachments.chatSessionId],
		references: [yorhaChatSessions.id]
	}),
	document: one(documents, {
		fields: [chatDocumentAttachments.documentId],
		references: [documents.id]
	}),
}));

export const yorhaChatSessionsRelations = relations(yorhaChatSessions, ({many}) => ({
	chatDocumentAttachments: many(chatDocumentAttachments),
}));

export const documentsRelations = relations(documents, ({many}) => ({
	chatDocumentAttachments: many(chatDocumentAttachments),
}));

export const errorClusterRelations = relations(errorCluster, ({one}) => ({
	routeMetadatum: one(routeMetadata, {
		fields: [errorCluster.routeId],
		references: [routeMetadata.routeId]
	}),
}));

export const routeMetadataRelations = relations(routeMetadata, ({many}) => ({
	errorClusters: many(errorCluster),
	routeInteractionLogs: many(routeInteractionLog),
	routeHealthEvents: many(routeHealthEvent),
	errorBrainAnalyses: many(errorBrainAnalysis),
	errorBrainPatches: many(errorBrainPatch),
}));

export const routeInteractionLogRelations = relations(routeInteractionLog, ({one}) => ({
	routeMetadatum: one(routeMetadata, {
		fields: [routeInteractionLog.routeId],
		references: [routeMetadata.routeId]
	}),
}));

export const routeHealthEventRelations = relations(routeHealthEvent, ({one}) => ({
	routeMetadatum: one(routeMetadata, {
		fields: [routeHealthEvent.routeId],
		references: [routeMetadata.routeId]
	}),
}));

export const errorBrainAnalysisRelations = relations(errorBrainAnalysis, ({one, many}) => ({
	routeMetadatum: one(routeMetadata, {
		fields: [errorBrainAnalysis.routeId],
		references: [routeMetadata.routeId]
	}),
	errorBrainPatches: many(errorBrainPatch),
}));

export const errorBrainPatchRelations = relations(errorBrainPatch, ({one}) => ({
	errorBrainAnalysis: one(errorBrainAnalysis, {
		fields: [errorBrainPatch.analysisId],
		references: [errorBrainAnalysis.id]
	}),
	routeMetadatum: one(routeMetadata, {
		fields: [errorBrainPatch.routeId],
		references: [routeMetadata.routeId]
	}),
}));

export const analyticsEventsRelations = relations(analyticsEvents, ({one}) => ({
	user: one(users, {
		fields: [analyticsEvents.userId],
		references: [users.id]
	}),
}));

export const collectionCitationsRelations = relations(collectionCitations, ({one}) => ({
	citation: one(citations, {
		fields: [collectionCitations.citationId],
		references: [citations.id]
	}),
	citationCollection: one(citationCollections, {
		fields: [collectionCitations.collectionId],
		references: [citationCollections.id]
	}),
}));