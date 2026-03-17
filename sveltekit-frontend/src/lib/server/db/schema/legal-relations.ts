import { relations } from 'drizzle-orm';
import { jurisdictions } from './jurisdictions';
import { libraryDocuments } from './library-documents';
import { libraryDocumentVersions } from './library-document-versions';
import { legalNodes } from './legal-nodes';
import { legalChunks } from './legal-chunks';
import { legalDefinitions } from './legal-definitions';
import { legalCitations } from './legal-citations';
import { pageArtifacts } from './page-artifacts';
import { ingestionJobs } from './ingestion-jobs';
import { stateConstitutionSources } from './state-constitution-sources';

// --- Jurisdictions ---
export const jurisdictionsRelations = relations(jurisdictions, ({ many }) => ({
	libraryDocuments: many(libraryDocuments),
}));

// --- Library Documents ---
export const libraryDocumentsRelations = relations(libraryDocuments, ({ one, many }) => ({
	jurisdiction: one(jurisdictions, {
		fields: [libraryDocuments.jurisdictionId],
		references: [jurisdictions.id],
	}),
	versions: many(libraryDocumentVersions),
	nodes: many(legalNodes),
	pageArtifacts: many(pageArtifacts),
	ingestionJobs: many(ingestionJobs),
	constitutionSource: many(stateConstitutionSources),
}));

// --- Library Document Versions ---
export const libraryDocumentVersionsRelations = relations(libraryDocumentVersions, ({ one, many }) => ({
	document: one(libraryDocuments, {
		fields: [libraryDocumentVersions.documentId],
		references: [libraryDocuments.id],
	}),
	nodes: many(legalNodes),
}));

// --- Legal Nodes (tree structure) ---
export const legalNodesRelations = relations(legalNodes, ({ one, many }) => ({
	document: one(libraryDocuments, {
		fields: [legalNodes.documentId],
		references: [libraryDocuments.id],
	}),
	version: one(libraryDocumentVersions, {
		fields: [legalNodes.versionId],
		references: [libraryDocumentVersions.id],
	}),
	parent: one(legalNodes, {
		fields: [legalNodes.parentNodeId],
		references: [legalNodes.id],
		relationName: 'parentChild',
	}),
	children: many(legalNodes, { relationName: 'parentChild' }),
	chunks: many(legalChunks),
	definitions: many(legalDefinitions),
	citationsFrom: many(legalCitations, { relationName: 'fromNode' }),
	citationsTo: many(legalCitations, { relationName: 'toNode' }),
}));

// --- Legal Chunks ---
export const legalChunksRelations = relations(legalChunks, ({ one }) => ({
	node: one(legalNodes, {
		fields: [legalChunks.legalNodeId],
		references: [legalNodes.id],
	}),
}));

// --- Legal Definitions ---
export const legalDefinitionsRelations = relations(legalDefinitions, ({ one }) => ({
	definedInNode: one(legalNodes, {
		fields: [legalDefinitions.definedInNodeId],
		references: [legalNodes.id],
	}),
}));

// --- Legal Citations (cross-references) ---
export const legalCitationsRelations = relations(legalCitations, ({ one }) => ({
	fromNode: one(legalNodes, {
		fields: [legalCitations.fromNodeId],
		references: [legalNodes.id],
		relationName: 'fromNode',
	}),
	toNode: one(legalNodes, {
		fields: [legalCitations.toNodeId],
		references: [legalNodes.id],
		relationName: 'toNode',
	}),
}));

// --- Page Artifacts ---
export const pageArtifactsRelations = relations(pageArtifacts, ({ one }) => ({
	document: one(libraryDocuments, {
		fields: [pageArtifacts.documentId],
		references: [libraryDocuments.id],
	}),
}));

// --- Ingestion Jobs ---
export const ingestionJobsRelations = relations(ingestionJobs, ({ one }) => ({
	document: one(libraryDocuments, {
		fields: [ingestionJobs.documentId],
		references: [libraryDocuments.id],
	}),
}));

// --- State Constitution Sources ---
export const stateConstitutionSourcesRelations = relations(stateConstitutionSources, ({ one }) => ({
	document: one(libraryDocuments, {
		fields: [stateConstitutionSources.documentId],
		references: [libraryDocuments.id],
	}),
}));
