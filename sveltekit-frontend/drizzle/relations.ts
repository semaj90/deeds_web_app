import { relations } from "drizzle-orm/relations";
import { aceRetrievalRuns, aceRetrievalHits, adminAiSkills, adminAiSubagentRuns, parentAtlasRecords, parentAtlasVectors, atlasSvgGlyphs, atlasHigherHopIndex, atlasTreeNodes, atlasPackets, packetFeatures, agentSchedulerJobs, codeFeatures, codeFeatureEmbeddings, featureStatistics, atlasFeatureEnvelopes, atlasIdHierarchyMetadata, ontologyEdges, packetVectorBundles, specRevisions, specs, projects, features, phase2FGroundTruth, phase2FGroundTruthExpectations, evaluationCorpora, evaluationRelevanceCorrected, evaluationQueries, atlasPacketsMaterializationQueue, encoderProvenance, codebaseChunkIndex, stories, episodicEvents, semanticMemories, atlasSchemaRegistry, atlasKnowledgeObjects, atlasAstNodes, atlasHyperedges, atlasValidationResults, agentRuns, agentRunActions, agentActionResults, unknownPackets, unknownResolutionLedger, semanticSignals, classificationEnvelope, adminAiChatSessions, adminAiChatMessages, users, aiReports, cases, casePersons, caseScores, crimes, featureMaps, grpoMemorySticks, kagDagRuns, kagDagNodes, rgSearchRuns, rgSearchHits, atlasFeatureVectors, chrom97Packets, atlasSummaryLayers, packetFeatureKeywords, packetSourceFeatures, cacheProbeRuns, cacheProbeResults, evaluationResults, evaluationEvidence, atlasPacketsIdentityConflicts, evaluationSeedQueries, evaluationCandidates, evaluationJudgments, evaluationDatasets, evaluationRuns, atlasOntologyConcepts, atlasOntologyRelations, atlasFeatures, featureRecords, workflowEvents, ldrResearchTasks, ldrResearchResults, ldrSynthesis, mlClustering, deepResearchAuditLog, atlasFeaturePackets, featureImplementations, featureFileEdges, atlasGraphSnapshotsV2, atlasGraphSnapshotExclusionsV2, atlasGraphResolutionIssuesV2, atlasGraphAuthorityRunsV2, kagDagEdges, atlasHyperedgeMembers, atlasGraphRelationEventsV2, atlasGraphRelationParticipantsV2, atlasGraphNodesV2, codeFeatureEdges, evaluationRelevance, atlasProjectionState, atlasGraphEdgesV2, topologySnapshots, topologyPositions, atlasGraphAuthorityScoresV2 } from "./schema";

export const aceRetrievalHitsRelations = relations(aceRetrievalHits, ({one}) => ({
	aceRetrievalRun: one(aceRetrievalRuns, {
		fields: [aceRetrievalHits.runId],
		references: [aceRetrievalRuns.id]
	}),
}));

export const aceRetrievalRunsRelations = relations(aceRetrievalRuns, ({many}) => ({
	aceRetrievalHits: many(aceRetrievalHits),
}));

export const adminAiSubagentRunsRelations = relations(adminAiSubagentRuns, ({one}) => ({
	adminAiSkill: one(adminAiSkills, {
		fields: [adminAiSubagentRuns.skillId],
		references: [adminAiSkills.id]
	}),
}));

export const adminAiSkillsRelations = relations(adminAiSkills, ({many}) => ({
	adminAiSubagentRuns: many(adminAiSubagentRuns),
}));

export const parentAtlasVectorsRelations = relations(parentAtlasVectors, ({one}) => ({
	parentAtlasRecord: one(parentAtlasRecords, {
		fields: [parentAtlasVectors.recordId],
		references: [parentAtlasRecords.id]
	}),
}));

export const parentAtlasRecordsRelations = relations(parentAtlasRecords, ({many}) => ({
	parentAtlasVectors: many(parentAtlasVectors),
}));

export const atlasHigherHopIndexRelations = relations(atlasHigherHopIndex, ({one}) => ({
	atlasSvgGlyph: one(atlasSvgGlyphs, {
		fields: [atlasHigherHopIndex.glyphRecordId],
		references: [atlasSvgGlyphs.id]
	}),
	atlasTreeNode: one(atlasTreeNodes, {
		fields: [atlasHigherHopIndex.treeNodeId],
		references: [atlasTreeNodes.nodeId]
	}),
}));

export const atlasSvgGlyphsRelations = relations(atlasSvgGlyphs, ({many}) => ({
	atlasHigherHopIndices: many(atlasHigherHopIndex),
}));

export const atlasTreeNodesRelations = relations(atlasTreeNodes, ({many}) => ({
	atlasHigherHopIndices: many(atlasHigherHopIndex),
	atlasFeatureVectors: many(atlasFeatureVectors),
	atlasFeaturePackets: many(atlasFeaturePackets),
}));

export const packetFeaturesRelations = relations(packetFeatures, ({one, many}) => ({
	atlasPacket: one(atlasPackets, {
		fields: [packetFeatures.packetKey],
		references: [atlasPackets.packetKey]
	}),
	agentSchedulerJobs: many(agentSchedulerJobs),
}));

export const atlasPacketsRelations = relations(atlasPackets, ({many}) => ({
	packetFeatures: many(packetFeatures),
	codeFeatures: many(codeFeatures),
	atlasFeatureEnvelopes: many(atlasFeatureEnvelopes),
	atlasIdHierarchyMetadata: many(atlasIdHierarchyMetadata),
	ontologyEdges_sourcePacketKey: many(ontologyEdges, {
		relationName: "ontologyEdges_sourcePacketKey_atlasPackets_packetKey"
	}),
	ontologyEdges_targetPacketKey: many(ontologyEdges, {
		relationName: "ontologyEdges_targetPacketKey_atlasPackets_packetKey"
	}),
	packetVectorBundles: many(packetVectorBundles),
	atlasPacketsMaterializationQueues: many(atlasPacketsMaterializationQueue),
	atlasSummaryLayers: many(atlasSummaryLayers),
	packetFeatureKeywords: many(packetFeatureKeywords),
	packetSourceFeatures: many(packetSourceFeatures),
	atlasPacketsIdentityConflicts: many(atlasPacketsIdentityConflicts),
	evaluationJudgments: many(evaluationJudgments),
	featureRecords: many(featureRecords),
}));

export const agentSchedulerJobsRelations = relations(agentSchedulerJobs, ({one}) => ({
	packetFeature: one(packetFeatures, {
		fields: [agentSchedulerJobs.packetKey],
		references: [packetFeatures.packetKey]
	}),
}));

export const codeFeatureEmbeddingsRelations = relations(codeFeatureEmbeddings, ({one}) => ({
	codeFeature: one(codeFeatures, {
		fields: [codeFeatureEmbeddings.featureId],
		references: [codeFeatures.featureId]
	}),
}));

export const codeFeaturesRelations = relations(codeFeatures, ({one, many}) => ({
	codeFeatureEmbeddings: many(codeFeatureEmbeddings),
	featureStatistics: many(featureStatistics),
	atlasPacket: one(atlasPackets, {
		fields: [codeFeatures.packetKey],
		references: [atlasPackets.packetKey]
	}),
	codeFeatureEdges_fromFeatureId: many(codeFeatureEdges, {
		relationName: "codeFeatureEdges_fromFeatureId_codeFeatures_featureId"
	}),
	codeFeatureEdges_toFeatureId: many(codeFeatureEdges, {
		relationName: "codeFeatureEdges_toFeatureId_codeFeatures_featureId"
	}),
}));

export const featureStatisticsRelations = relations(featureStatistics, ({one}) => ({
	codeFeature: one(codeFeatures, {
		fields: [featureStatistics.featureId],
		references: [codeFeatures.featureId]
	}),
}));

export const atlasFeatureEnvelopesRelations = relations(atlasFeatureEnvelopes, ({one, many}) => ({
	atlasPacket: one(atlasPackets, {
		fields: [atlasFeatureEnvelopes.packetKey],
		references: [atlasPackets.packetKey]
	}),
	chrom97Packets: many(chrom97Packets),
}));

export const atlasIdHierarchyMetadataRelations = relations(atlasIdHierarchyMetadata, ({one}) => ({
	atlasPacket: one(atlasPackets, {
		fields: [atlasIdHierarchyMetadata.packetKey],
		references: [atlasPackets.packetKey]
	}),
}));

export const ontologyEdgesRelations = relations(ontologyEdges, ({one}) => ({
	atlasPacket_sourcePacketKey: one(atlasPackets, {
		fields: [ontologyEdges.sourcePacketKey],
		references: [atlasPackets.packetKey],
		relationName: "ontologyEdges_sourcePacketKey_atlasPackets_packetKey"
	}),
	atlasPacket_targetPacketKey: one(atlasPackets, {
		fields: [ontologyEdges.targetPacketKey],
		references: [atlasPackets.packetKey],
		relationName: "ontologyEdges_targetPacketKey_atlasPackets_packetKey"
	}),
}));

export const packetVectorBundlesRelations = relations(packetVectorBundles, ({one}) => ({
	atlasPacket: one(atlasPackets, {
		fields: [packetVectorBundles.packetKey],
		references: [atlasPackets.packetKey]
	}),
}));

export const specsRelations = relations(specs, ({one, many}) => ({
	specRevision: one(specRevisions, {
		fields: [specs.currentRevisionId],
		references: [specRevisions.id],
		relationName: "specs_currentRevisionId_specRevisions_id"
	}),
	project: one(projects, {
		fields: [specs.projectId],
		references: [projects.id]
	}),
	specRevisions: many(specRevisions, {
		relationName: "specRevisions_specId_specs_id"
	}),
	features: many(features),
}));

export const specRevisionsRelations = relations(specRevisions, ({one, many}) => ({
	specs: many(specs, {
		relationName: "specs_currentRevisionId_specRevisions_id"
	}),
	spec: one(specs, {
		fields: [specRevisions.specId],
		references: [specs.id],
		relationName: "specRevisions_specId_specs_id"
	}),
}));

export const projectsRelations = relations(projects, ({many}) => ({
	specs: many(specs),
	features: many(features),
}));

export const featuresRelations = relations(features, ({one}) => ({
	project: one(projects, {
		fields: [features.projectId],
		references: [projects.id]
	}),
	spec: one(specs, {
		fields: [features.specId],
		references: [specs.id]
	}),
}));

export const phase2FGroundTruthExpectationsRelations = relations(phase2FGroundTruthExpectations, ({one}) => ({
	phase2FGroundTruth: one(phase2FGroundTruth, {
		fields: [phase2FGroundTruthExpectations.groundTruthId],
		references: [phase2FGroundTruth.id]
	}),
}));

export const phase2FGroundTruthRelations = relations(phase2FGroundTruth, ({many}) => ({
	phase2FGroundTruthExpectations: many(phase2FGroundTruthExpectations),
}));

export const evaluationRelevanceCorrectedRelations = relations(evaluationRelevanceCorrected, ({one}) => ({
	evaluationCorpora: one(evaluationCorpora, {
		fields: [evaluationRelevanceCorrected.corpusVersion],
		references: [evaluationCorpora.corpusVersion]
	}),
	evaluationQuery: one(evaluationQueries, {
		fields: [evaluationRelevanceCorrected.queryId],
		references: [evaluationQueries.id]
	}),
}));

export const evaluationCorporaRelations = relations(evaluationCorpora, ({many}) => ({
	evaluationRelevanceCorrecteds: many(evaluationRelevanceCorrected),
	evaluationResults: many(evaluationResults),
}));

export const evaluationQueriesRelations = relations(evaluationQueries, ({many}) => ({
	evaluationRelevanceCorrecteds: many(evaluationRelevanceCorrected),
	evaluationResults: many(evaluationResults),
	evaluationEvidences: many(evaluationEvidence),
	evaluationRelevances: many(evaluationRelevance),
}));

export const atlasPacketsMaterializationQueueRelations = relations(atlasPacketsMaterializationQueue, ({one}) => ({
	atlasPacket: one(atlasPackets, {
		fields: [atlasPacketsMaterializationQueue.packetId],
		references: [atlasPackets.packetId]
	}),
}));

export const codebaseChunkIndexRelations = relations(codebaseChunkIndex, ({one}) => ({
	encoderProvenance: one(encoderProvenance, {
		fields: [codebaseChunkIndex.encoderId],
		references: [encoderProvenance.encoderId]
	}),
}));

export const encoderProvenanceRelations = relations(encoderProvenance, ({many}) => ({
	codebaseChunkIndices: many(codebaseChunkIndex),
}));

export const episodicEventsRelations = relations(episodicEvents, ({one, many}) => ({
	story: one(stories, {
		fields: [episodicEvents.storyId],
		references: [stories.storyId]
	}),
	semanticMemories: many(semanticMemories),
}));

export const storiesRelations = relations(stories, ({many}) => ({
	episodicEvents: many(episodicEvents),
}));

export const semanticMemoriesRelations = relations(semanticMemories, ({one}) => ({
	episodicEvent: one(episodicEvents, {
		fields: [semanticMemories.promotedFromEvent],
		references: [episodicEvents.eventId]
	}),
}));

export const atlasKnowledgeObjectsRelations = relations(atlasKnowledgeObjects, ({one, many}) => ({
	atlasSchemaRegistry: one(atlasSchemaRegistry, {
		fields: [atlasKnowledgeObjects.schemaId],
		references: [atlasSchemaRegistry.schemaId]
	}),
	atlasAstNode: one(atlasAstNodes, {
		fields: [atlasKnowledgeObjects.treeNodeId],
		references: [atlasAstNodes.treeNodeId]
	}),
	atlasValidationResults: many(atlasValidationResults),
	atlasProjectionStates: many(atlasProjectionState),
}));

export const atlasSchemaRegistryRelations = relations(atlasSchemaRegistry, ({many}) => ({
	atlasKnowledgeObjects: many(atlasKnowledgeObjects),
	atlasHyperedges: many(atlasHyperedges),
	atlasFeatures: many(atlasFeatures),
}));

export const atlasAstNodesRelations = relations(atlasAstNodes, ({one, many}) => ({
	atlasKnowledgeObjects: many(atlasKnowledgeObjects),
	atlasAstNode_parentTreeNodeId: one(atlasAstNodes, {
		fields: [atlasAstNodes.parentTreeNodeId],
		references: [atlasAstNodes.treeNodeId],
		relationName: "atlasAstNodes_parentTreeNodeId_atlasAstNodes_treeNodeId"
	}),
	atlasAstNodes_parentTreeNodeId: many(atlasAstNodes, {
		relationName: "atlasAstNodes_parentTreeNodeId_atlasAstNodes_treeNodeId"
	}),
	atlasAstNode_supersededBy: one(atlasAstNodes, {
		fields: [atlasAstNodes.supersededBy],
		references: [atlasAstNodes.treeNodeId],
		relationName: "atlasAstNodes_supersededBy_atlasAstNodes_treeNodeId"
	}),
	atlasAstNodes_supersededBy: many(atlasAstNodes, {
		relationName: "atlasAstNodes_supersededBy_atlasAstNodes_treeNodeId"
	}),
	atlasFeatures: many(atlasFeatures),
}));

export const atlasHyperedgesRelations = relations(atlasHyperedges, ({one, many}) => ({
	atlasSchemaRegistry: one(atlasSchemaRegistry, {
		fields: [atlasHyperedges.schemaId],
		references: [atlasSchemaRegistry.schemaId]
	}),
	atlasHyperedgeMembers: many(atlasHyperedgeMembers),
}));

export const atlasValidationResultsRelations = relations(atlasValidationResults, ({one}) => ({
	atlasKnowledgeObject: one(atlasKnowledgeObjects, {
		fields: [atlasValidationResults.knowledgeId],
		references: [atlasKnowledgeObjects.knowledgeId]
	}),
}));

export const agentRunActionsRelations = relations(agentRunActions, ({one, many}) => ({
	agentRun: one(agentRuns, {
		fields: [agentRunActions.runId],
		references: [agentRuns.runId]
	}),
	agentActionResults: many(agentActionResults),
}));

export const agentRunsRelations = relations(agentRuns, ({many}) => ({
	agentRunActions: many(agentRunActions),
	workflowEvents: many(workflowEvents),
}));

export const agentActionResultsRelations = relations(agentActionResults, ({one}) => ({
	agentRunAction: one(agentRunActions, {
		fields: [agentActionResults.actionId],
		references: [agentRunActions.actionId]
	}),
}));

export const unknownResolutionLedgerRelations = relations(unknownResolutionLedger, ({one}) => ({
	unknownPacket: one(unknownPackets, {
		fields: [unknownResolutionLedger.unknownId],
		references: [unknownPackets.unknownId]
	}),
}));

export const unknownPacketsRelations = relations(unknownPackets, ({many}) => ({
	unknownResolutionLedgers: many(unknownResolutionLedger),
}));

export const classificationEnvelopeRelations = relations(classificationEnvelope, ({one}) => ({
	semanticSignal: one(semanticSignals, {
		fields: [classificationEnvelope.signalId],
		references: [semanticSignals.id]
	}),
}));

export const semanticSignalsRelations = relations(semanticSignals, ({many}) => ({
	classificationEnvelopes: many(classificationEnvelope),
}));

export const adminAiChatMessagesRelations = relations(adminAiChatMessages, ({one}) => ({
	adminAiChatSession: one(adminAiChatSessions, {
		fields: [adminAiChatMessages.sessionId],
		references: [adminAiChatSessions.id]
	}),
}));

export const adminAiChatSessionsRelations = relations(adminAiChatSessions, ({many}) => ({
	adminAiChatMessages: many(adminAiChatMessages),
}));

export const aiReportsRelations = relations(aiReports, ({one}) => ({
	user: one(users, {
		fields: [aiReports.createdBy],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	aiReports: many(aiReports),
	caseScores: many(caseScores),
	rgSearchRuns: many(rgSearchRuns),
	ldrResearchTasks: many(ldrResearchTasks),
	deepResearchAuditLogs: many(deepResearchAuditLog),
}));

export const casePersonsRelations = relations(casePersons, ({one}) => ({
	case: one(cases, {
		fields: [casePersons.caseId],
		references: [cases.id]
	}),
}));

export const casesRelations = relations(cases, ({many}) => ({
	casePersons: many(casePersons),
	caseScores: many(caseScores),
	crimes: many(crimes),
}));

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

export const crimesRelations = relations(crimes, ({one}) => ({
	case: one(cases, {
		fields: [crimes.caseId],
		references: [cases.id]
	}),
}));

export const grpoMemorySticksRelations = relations(grpoMemorySticks, ({one}) => ({
	featureMap: one(featureMaps, {
		fields: [grpoMemorySticks.featureId],
		references: [featureMaps.id]
	}),
}));

export const featureMapsRelations = relations(featureMaps, ({many}) => ({
	grpoMemorySticks: many(grpoMemorySticks),
}));

export const kagDagNodesRelations = relations(kagDagNodes, ({one}) => ({
	kagDagRun: one(kagDagRuns, {
		fields: [kagDagNodes.runId],
		references: [kagDagRuns.id]
	}),
}));

export const kagDagRunsRelations = relations(kagDagRuns, ({many}) => ({
	kagDagNodes: many(kagDagNodes),
	kagDagEdges: many(kagDagEdges),
}));

export const rgSearchRunsRelations = relations(rgSearchRuns, ({one, many}) => ({
	user: one(users, {
		fields: [rgSearchRuns.userId],
		references: [users.id]
	}),
	rgSearchHits: many(rgSearchHits),
}));

export const rgSearchHitsRelations = relations(rgSearchHits, ({one}) => ({
	rgSearchRun: one(rgSearchRuns, {
		fields: [rgSearchHits.runId],
		references: [rgSearchRuns.id]
	}),
}));

export const atlasFeatureVectorsRelations = relations(atlasFeatureVectors, ({one}) => ({
	atlasTreeNode: one(atlasTreeNodes, {
		fields: [atlasFeatureVectors.treeNodeId],
		references: [atlasTreeNodes.nodeId]
	}),
}));

export const chrom97PacketsRelations = relations(chrom97Packets, ({one}) => ({
	atlasFeatureEnvelope: one(atlasFeatureEnvelopes, {
		fields: [chrom97Packets.packetKey],
		references: [atlasFeatureEnvelopes.packetKey]
	}),
}));

export const atlasSummaryLayersRelations = relations(atlasSummaryLayers, ({one}) => ({
	atlasPacket: one(atlasPackets, {
		fields: [atlasSummaryLayers.packetKey],
		references: [atlasPackets.packetKey]
	}),
}));

export const packetFeatureKeywordsRelations = relations(packetFeatureKeywords, ({one}) => ({
	atlasPacket: one(atlasPackets, {
		fields: [packetFeatureKeywords.packetKey],
		references: [atlasPackets.packetKey]
	}),
}));

export const packetSourceFeaturesRelations = relations(packetSourceFeatures, ({one}) => ({
	atlasPacket: one(atlasPackets, {
		fields: [packetSourceFeatures.packetKey],
		references: [atlasPackets.packetKey]
	}),
}));

export const cacheProbeResultsRelations = relations(cacheProbeResults, ({one}) => ({
	cacheProbeRun: one(cacheProbeRuns, {
		fields: [cacheProbeResults.runId],
		references: [cacheProbeRuns.runId]
	}),
}));

export const cacheProbeRunsRelations = relations(cacheProbeRuns, ({many}) => ({
	cacheProbeResults: many(cacheProbeResults),
}));

export const evaluationResultsRelations = relations(evaluationResults, ({one}) => ({
	evaluationCorpora: one(evaluationCorpora, {
		fields: [evaluationResults.corpusVersion],
		references: [evaluationCorpora.corpusVersion]
	}),
	evaluationQuery: one(evaluationQueries, {
		fields: [evaluationResults.queryId],
		references: [evaluationQueries.id]
	}),
}));

export const evaluationEvidenceRelations = relations(evaluationEvidence, ({one}) => ({
	evaluationQuery: one(evaluationQueries, {
		fields: [evaluationEvidence.queryId],
		references: [evaluationQueries.id]
	}),
}));

export const atlasPacketsIdentityConflictsRelations = relations(atlasPacketsIdentityConflicts, ({one}) => ({
	atlasPacket: one(atlasPackets, {
		fields: [atlasPacketsIdentityConflicts.packetId],
		references: [atlasPackets.packetId]
	}),
}));

export const evaluationCandidatesRelations = relations(evaluationCandidates, ({one}) => ({
	evaluationSeedQuery: one(evaluationSeedQueries, {
		fields: [evaluationCandidates.queryId],
		references: [evaluationSeedQueries.queryId]
	}),
}));

export const evaluationSeedQueriesRelations = relations(evaluationSeedQueries, ({many}) => ({
	evaluationCandidates: many(evaluationCandidates),
	evaluationJudgments: many(evaluationJudgments),
}));

export const evaluationJudgmentsRelations = relations(evaluationJudgments, ({one}) => ({
	atlasPacket: one(atlasPackets, {
		fields: [evaluationJudgments.packetKey],
		references: [atlasPackets.packetKey]
	}),
	evaluationSeedQuery: one(evaluationSeedQueries, {
		fields: [evaluationJudgments.queryId],
		references: [evaluationSeedQueries.queryId]
	}),
}));

export const evaluationRunsRelations = relations(evaluationRuns, ({one}) => ({
	evaluationDataset_datasetVersion: one(evaluationDatasets, {
		fields: [evaluationRuns.datasetVersion],
		references: [evaluationDatasets.version],
		relationName: "evaluationRuns_datasetVersion_evaluationDatasets_version"
	}),
	evaluationDataset_datasetVersion: one(evaluationDatasets, {
		fields: [evaluationRuns.datasetVersion],
		references: [evaluationDatasets.version],
		relationName: "evaluationRuns_datasetVersion_evaluationDatasets_version"
	}),
	evaluationDataset_datasetVersion: one(evaluationDatasets, {
		fields: [evaluationRuns.datasetVersion],
		references: [evaluationDatasets.version],
		relationName: "evaluationRuns_datasetVersion_evaluationDatasets_version"
	}),
}));

export const evaluationDatasetsRelations = relations(evaluationDatasets, ({many}) => ({
	evaluationRuns_datasetVersion: many(evaluationRuns, {
		relationName: "evaluationRuns_datasetVersion_evaluationDatasets_version"
	}),
	evaluationRuns_datasetVersion: many(evaluationRuns, {
		relationName: "evaluationRuns_datasetVersion_evaluationDatasets_version"
	}),
	evaluationRuns_datasetVersion: many(evaluationRuns, {
		relationName: "evaluationRuns_datasetVersion_evaluationDatasets_version"
	}),
}));

export const atlasOntologyRelationsRelations = relations(atlasOntologyRelations, ({one}) => ({
	atlasOntologyConcept_objectConceptId: one(atlasOntologyConcepts, {
		fields: [atlasOntologyRelations.objectConceptId],
		references: [atlasOntologyConcepts.conceptId],
		relationName: "atlasOntologyRelations_objectConceptId_atlasOntologyConcepts_conceptId"
	}),
	atlasOntologyConcept_subjectConceptId: one(atlasOntologyConcepts, {
		fields: [atlasOntologyRelations.subjectConceptId],
		references: [atlasOntologyConcepts.conceptId],
		relationName: "atlasOntologyRelations_subjectConceptId_atlasOntologyConcepts_conceptId"
	}),
}));

export const atlasOntologyConceptsRelations = relations(atlasOntologyConcepts, ({many}) => ({
	atlasOntologyRelations_objectConceptId: many(atlasOntologyRelations, {
		relationName: "atlasOntologyRelations_objectConceptId_atlasOntologyConcepts_conceptId"
	}),
	atlasOntologyRelations_subjectConceptId: many(atlasOntologyRelations, {
		relationName: "atlasOntologyRelations_subjectConceptId_atlasOntologyConcepts_conceptId"
	}),
}));

export const atlasFeaturesRelations = relations(atlasFeatures, ({one}) => ({
	atlasSchemaRegistry: one(atlasSchemaRegistry, {
		fields: [atlasFeatures.schemaId],
		references: [atlasSchemaRegistry.schemaId]
	}),
	atlasAstNode: one(atlasAstNodes, {
		fields: [atlasFeatures.treeNodeId],
		references: [atlasAstNodes.treeNodeId]
	}),
}));

export const featureRecordsRelations = relations(featureRecords, ({one, many}) => ({
	atlasPacket: one(atlasPackets, {
		fields: [featureRecords.packetKey],
		references: [atlasPackets.packetKey]
	}),
	featureRecord: one(featureRecords, {
		fields: [featureRecords.supersededBy],
		references: [featureRecords.featureId],
		relationName: "featureRecords_supersededBy_featureRecords_featureId"
	}),
	featureRecords: many(featureRecords, {
		relationName: "featureRecords_supersededBy_featureRecords_featureId"
	}),
}));

export const workflowEventsRelations = relations(workflowEvents, ({one}) => ({
	agentRun: one(agentRuns, {
		fields: [workflowEvents.runId],
		references: [agentRuns.runId]
	}),
}));

export const ldrResearchTasksRelations = relations(ldrResearchTasks, ({one, many}) => ({
	user: one(users, {
		fields: [ldrResearchTasks.userId],
		references: [users.id]
	}),
	ldrResearchResults: many(ldrResearchResults),
	ldrSyntheses: many(ldrSynthesis),
	mlClusterings: many(mlClustering),
	deepResearchAuditLogs: many(deepResearchAuditLog),
}));

export const ldrResearchResultsRelations = relations(ldrResearchResults, ({one}) => ({
	ldrResearchTask: one(ldrResearchTasks, {
		fields: [ldrResearchResults.taskId],
		references: [ldrResearchTasks.id]
	}),
}));

export const ldrSynthesisRelations = relations(ldrSynthesis, ({one}) => ({
	ldrResearchTask: one(ldrResearchTasks, {
		fields: [ldrSynthesis.taskId],
		references: [ldrResearchTasks.id]
	}),
}));

export const mlClusteringRelations = relations(mlClustering, ({one}) => ({
	ldrResearchTask: one(ldrResearchTasks, {
		fields: [mlClustering.taskId],
		references: [ldrResearchTasks.id]
	}),
}));

export const deepResearchAuditLogRelations = relations(deepResearchAuditLog, ({one}) => ({
	ldrResearchTask: one(ldrResearchTasks, {
		fields: [deepResearchAuditLog.taskId],
		references: [ldrResearchTasks.id]
	}),
	user: one(users, {
		fields: [deepResearchAuditLog.userId],
		references: [users.id]
	}),
}));

export const atlasFeaturePacketsRelations = relations(atlasFeaturePackets, ({one}) => ({
	atlasTreeNode: one(atlasTreeNodes, {
		fields: [atlasFeaturePackets.treeNodeId],
		references: [atlasTreeNodes.nodeId]
	}),
}));

export const featureFileEdgesRelations = relations(featureFileEdges, ({one}) => ({
	featureImplementation: one(featureImplementations, {
		fields: [featureFileEdges.featureKey],
		references: [featureImplementations.featureKey]
	}),
}));

export const featureImplementationsRelations = relations(featureImplementations, ({many}) => ({
	featureFileEdges: many(featureFileEdges),
}));

export const atlasGraphSnapshotExclusionsV2Relations = relations(atlasGraphSnapshotExclusionsV2, ({one}) => ({
	atlasGraphSnapshotsV2: one(atlasGraphSnapshotsV2, {
		fields: [atlasGraphSnapshotExclusionsV2.snapshotId],
		references: [atlasGraphSnapshotsV2.snapshotId]
	}),
}));

export const atlasGraphSnapshotsV2Relations = relations(atlasGraphSnapshotsV2, ({many}) => ({
	atlasGraphSnapshotExclusionsV2s: many(atlasGraphSnapshotExclusionsV2),
	atlasGraphResolutionIssuesV2s: many(atlasGraphResolutionIssuesV2),
	atlasGraphAuthorityRunsV2s: many(atlasGraphAuthorityRunsV2),
	atlasGraphRelationEventsV2s: many(atlasGraphRelationEventsV2),
	atlasGraphNodesV2s: many(atlasGraphNodesV2),
	atlasGraphEdgesV2s: many(atlasGraphEdgesV2),
}));

export const atlasGraphResolutionIssuesV2Relations = relations(atlasGraphResolutionIssuesV2, ({one}) => ({
	atlasGraphSnapshotsV2: one(atlasGraphSnapshotsV2, {
		fields: [atlasGraphResolutionIssuesV2.snapshotId],
		references: [atlasGraphSnapshotsV2.snapshotId]
	}),
}));

export const atlasGraphAuthorityRunsV2Relations = relations(atlasGraphAuthorityRunsV2, ({one, many}) => ({
	atlasGraphSnapshotsV2: one(atlasGraphSnapshotsV2, {
		fields: [atlasGraphAuthorityRunsV2.snapshotId],
		references: [atlasGraphSnapshotsV2.snapshotId]
	}),
	atlasGraphAuthorityScoresV2s: many(atlasGraphAuthorityScoresV2),
}));

export const kagDagEdgesRelations = relations(kagDagEdges, ({one}) => ({
	kagDagRun: one(kagDagRuns, {
		fields: [kagDagEdges.runId],
		references: [kagDagRuns.id]
	}),
}));

export const atlasHyperedgeMembersRelations = relations(atlasHyperedgeMembers, ({one}) => ({
	atlasHyperedge: one(atlasHyperedges, {
		fields: [atlasHyperedgeMembers.hyperedgeId],
		references: [atlasHyperedges.hyperedgeId]
	}),
}));

export const atlasGraphRelationParticipantsV2Relations = relations(atlasGraphRelationParticipantsV2, ({one}) => ({
	atlasGraphRelationEventsV2: one(atlasGraphRelationEventsV2, {
		fields: [atlasGraphRelationParticipantsV2.snapshotId],
		references: [atlasGraphRelationEventsV2.snapshotId]
	}),
	atlasGraphNodesV2: one(atlasGraphNodesV2, {
		fields: [atlasGraphRelationParticipantsV2.snapshotId],
		references: [atlasGraphNodesV2.snapshotId]
	}),
}));

export const atlasGraphRelationEventsV2Relations = relations(atlasGraphRelationEventsV2, ({one, many}) => ({
	atlasGraphRelationParticipantsV2s: many(atlasGraphRelationParticipantsV2),
	atlasGraphSnapshotsV2: one(atlasGraphSnapshotsV2, {
		fields: [atlasGraphRelationEventsV2.snapshotId],
		references: [atlasGraphSnapshotsV2.snapshotId]
	}),
}));

export const atlasGraphNodesV2Relations = relations(atlasGraphNodesV2, ({one, many}) => ({
	atlasGraphRelationParticipantsV2s: many(atlasGraphRelationParticipantsV2),
	atlasGraphSnapshotsV2: one(atlasGraphSnapshotsV2, {
		fields: [atlasGraphNodesV2.snapshotId],
		references: [atlasGraphSnapshotsV2.snapshotId]
	}),
	atlasGraphEdgesV2s_snapshotId: many(atlasGraphEdgesV2, {
		relationName: "atlasGraphEdgesV2_snapshotId_atlasGraphNodesV2_snapshotId"
	}),
	atlasGraphEdgesV2s_snapshotId: many(atlasGraphEdgesV2, {
		relationName: "atlasGraphEdgesV2_snapshotId_atlasGraphNodesV2_snapshotId"
	}),
	atlasGraphAuthorityScoresV2s: many(atlasGraphAuthorityScoresV2),
}));

export const codeFeatureEdgesRelations = relations(codeFeatureEdges, ({one}) => ({
	codeFeature_fromFeatureId: one(codeFeatures, {
		fields: [codeFeatureEdges.fromFeatureId],
		references: [codeFeatures.featureId],
		relationName: "codeFeatureEdges_fromFeatureId_codeFeatures_featureId"
	}),
	codeFeature_toFeatureId: one(codeFeatures, {
		fields: [codeFeatureEdges.toFeatureId],
		references: [codeFeatures.featureId],
		relationName: "codeFeatureEdges_toFeatureId_codeFeatures_featureId"
	}),
}));

export const evaluationRelevanceRelations = relations(evaluationRelevance, ({one}) => ({
	evaluationQuery: one(evaluationQueries, {
		fields: [evaluationRelevance.queryId],
		references: [evaluationQueries.id]
	}),
}));

export const atlasProjectionStateRelations = relations(atlasProjectionState, ({one}) => ({
	atlasKnowledgeObject: one(atlasKnowledgeObjects, {
		fields: [atlasProjectionState.knowledgeId],
		references: [atlasKnowledgeObjects.knowledgeId]
	}),
}));

export const atlasGraphEdgesV2Relations = relations(atlasGraphEdgesV2, ({one}) => ({
	atlasGraphSnapshotsV2: one(atlasGraphSnapshotsV2, {
		fields: [atlasGraphEdgesV2.snapshotId],
		references: [atlasGraphSnapshotsV2.snapshotId]
	}),
	atlasGraphNodesV2_snapshotId: one(atlasGraphNodesV2, {
		fields: [atlasGraphEdgesV2.snapshotId],
		references: [atlasGraphNodesV2.snapshotId],
		relationName: "atlasGraphEdgesV2_snapshotId_atlasGraphNodesV2_snapshotId"
	}),
	atlasGraphNodesV2_snapshotId: one(atlasGraphNodesV2, {
		fields: [atlasGraphEdgesV2.snapshotId],
		references: [atlasGraphNodesV2.snapshotId],
		relationName: "atlasGraphEdgesV2_snapshotId_atlasGraphNodesV2_snapshotId"
	}),
}));

export const topologyPositionsRelations = relations(topologyPositions, ({one}) => ({
	topologySnapshot: one(topologySnapshots, {
		fields: [topologyPositions.snapshotId],
		references: [topologySnapshots.id]
	}),
}));

export const topologySnapshotsRelations = relations(topologySnapshots, ({many}) => ({
	topologyPositions: many(topologyPositions),
}));

export const atlasGraphAuthorityScoresV2Relations = relations(atlasGraphAuthorityScoresV2, ({one}) => ({
	atlasGraphAuthorityRunsV2: one(atlasGraphAuthorityRunsV2, {
		fields: [atlasGraphAuthorityScoresV2.runId],
		references: [atlasGraphAuthorityRunsV2.runId]
	}),
	atlasGraphNodesV2: one(atlasGraphNodesV2, {
		fields: [atlasGraphAuthorityScoresV2.snapshotId],
		references: [atlasGraphNodesV2.snapshotId]
	}),
}));