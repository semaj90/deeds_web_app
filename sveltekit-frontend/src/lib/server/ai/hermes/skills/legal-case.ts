import type { SkillRecipe } from './registry.js';

export const LEGAL_CASE_SKILLS: Record<string, SkillRecipe> = {
  case_intake: {
    id: 'case_intake',
    family: 'LegalCase',
    description: 'Process raw case details and identify key entities and claims',
    tools: [{ name: 'llm:generate' }, { name: 'search:sql' }]
  },
  issue_spotter: {
    id: 'issue_spotter',
    family: 'LegalCase',
    description: 'Identify potential legal issues from a fact pattern',
    tools: [{ name: 'llm:generate' }, { name: 'search:vector' }]
  },
  prior_case_crossref: {
    id: 'prior_case_crossref',
    family: 'LegalCase',
    description: 'Cross-reference case details with prior case law',
    tools: [{ name: 'search:vector' }, { name: 'search:graph' }]
  },
  opinion_summarizer: {
    id: 'opinion_summarizer',
    family: 'LegalCase',
    description: 'Summarize a judicial opinion or legal memo',
    tools: [{ name: 'llm:generate' }]
  },
  judgment_extractor: {
    id: 'judgment_extractor',
    family: 'LegalCase',
    description: 'Extract final judgments and orders from a legal document',
    tools: [{ name: 'extract:metadata' }]
  },
  claim_mapper: {
    id: 'claim_mapper',
    family: 'LegalCase',
    description: 'Map claims to supporting evidence items',
    tools: [{ name: 'search:graph' }, { name: 'llm:generate' }]
  },
  elements_checker: {
    id: 'elements_checker',
    family: 'LegalCase',
    description: 'Check if all elements of a cause of action are satisfied by evidence',
    tools: [
      { name: 'search:sql', args: (input) => ({ query: `SELECT * FROM warden_holdings WHERE case_id = '${input.caseId}'` }) },
      { name: 'llm:generate', args: (input) => ({ prompt: `Check elements against: ${JSON.stringify(input.results)}` }) }
    ]
  },
  statute_lookup: {
    id: 'statute_lookup',
    family: 'LegalCase',
    description: 'Retrieve relevant statutes from the legal corpus',
    tools: [
      { name: 'search:vector', args: (input) => ({ query: input.context, collection: 'legal_nodes' }) }
    ]
  },
  precedent_search: {
    id: 'precedent_search',
    family: 'LegalCase',
    description: 'Find binding or persuasive precedents in the vector store',
    tools: [
      { name: 'search:vector', args: (input) => ({ query: input.claim, collection: 'warden_chunks' }) },
      { name: 'gpu:rerank', args: (input) => ({ hits: input.results, query: input.claim }) }
    ]
  },
  draft_legal_argument: {
    id: 'draft_legal_argument',
    family: 'LegalCase',
    description: 'Synthesize a draft legal argument based on claims and supporting evidence',
    tools: [
      { name: 'search:graph', args: (input) => ({ cypher: `MATCH (c:Claim)-[:SUPPORTED_BY]->(e:Evidence) WHERE c.id = $id RETURN e`, params: { id: input.claimId } }) },
      { name: 'llm:generate', args: (input) => ({ prompt: `Draft argument for ${input.claimId} using: ${JSON.stringify(input.results)}` }) }
    ]
  },
  procedural_history_tracker: {
    id: 'procedural_history_tracker',
    family: 'LegalCase',
    description: 'Extract and map the procedural milestones of a case from initial complaint to present',
    tools: [{ name: 'extract:metadata' }, { name: 'search:sql' }]
  },
  witness_credibility_audit: {
    id: 'witness_credibility_audit',
    family: 'LegalCase',
    description: 'Analyze witness statements across different documents to identify potential inconsistencies',
    tools: [{ name: 'search:vector' }, { name: 'llm:generate' }]
  },
  discovery_gap_analysis: {
    id: 'discovery_gap_analysis',
    family: 'LegalCase',
    description: 'Identify categories of evidence required by claims that have not yet been produced',
    tools: [{ name: 'search:graph' }, { name: 'llm:generate' }]
  },
  admissibility_checker: {
    id: 'admissibility_checker',
    family: 'LegalCase',
    description: 'Evaluate evidence items against standard rules (hearsay, relevance) for trial readiness',
    tools: [{ name: 'llm:generate' }]
  },
  settlement_value_estimator: {
    id: 'settlement_value_estimator',
    family: 'LegalCase',
    description: 'Estimate settlement value based on historical outcomes of similar cases in the knowledge base',
    tools: [{ name: 'search:vector' }, { name: 'search:couchdb' }, { name: 'llm:generate' }]
  },
  jurisdictional_conflict_detector: {
    id: 'jurisdictional_conflict_detector',
    family: 'LegalCase',
    description: 'Detect potential conflicts of law and identify the governing jurisdiction',
    tools: [{ name: 'search:vector' }, { name: 'llm:generate' }]
  },
  entity_relationship_profiler: {
    id: 'entity_relationship_profiler',
    family: 'LegalCase',
    description: 'Generate a relationship map between parties, witnesses, counsel, and judicial officers',
    tools: [{ name: 'search:graph' }]
  },
  bluebook_citation_audit: {
    id: 'bluebook_citation_audit',
    family: 'LegalCase',
    description: 'Audit a draft document for compliance with Bluebook legal citation standards',
    tools: [{ name: 'llm:generate' }]
  },
  detect_legal_bias: {
    id: 'detect_legal_bias',
    family: 'LegalCase',
    description: 'Scan case materials for potential cognitive or procedural biases',
    tools: [{ name: 'llm:generate' }]
  },
  summarize_statutory_framework: {
    id: 'summarize_statutory_framework',
    family: 'LegalCase',
    description: 'Provide a concise overview of the relevant statutory law governing a dispute',
    tools: [{ name: 'search:vector' }, { name: 'llm:generate' }]
  },
  cross_jurisdictional_analysis: {
    id: 'cross_jurisdictional_analysis',
    family: 'LegalCase',
    description: 'Compare legal standards across multiple jurisdictions for a given issue',
    tools: [{ name: 'llm:generate' }, { name: 'search:vector' }]
  },
  legal_reasoning_audit: {
    id: 'legal_reasoning_audit',
    family: 'LegalCase',
    description: 'Audit a legal argument for logical consistency and strength of precedent',
    tools: [{ name: 'llm:generate' }]
  },
  detect_conflicting_authority: {
    id: 'detect_conflicting_authority',
    family: 'LegalCase',
    description: 'Identify cases or statutes that directly conflict with a proposed argument',
    tools: [{ name: 'search:vector' }, { name: 'llm:generate' }]
  },
  automated_case_briefing: {
    id: 'automated_case_briefing',
    family: 'LegalCase',
    description: 'Generate a standard IRAC case brief for a judicial opinion',
    tools: [{ name: 'llm:generate' }]
  },
  sanctions_risk_evaluator: {
    id: 'sanctions_risk_evaluator',
    family: 'LegalCase',
    description: 'Evaluate the risk of Rule 11 sanctions based on the frivolousness of claims',
    tools: [{ name: 'llm:generate' }]
  },
  discovery_request_generator: {
    id: 'discovery_request_generator',
    family: 'LegalCase',
    description: 'Draft initial discovery requests (interrogatories, production) based on claims',
    tools: [{ name: 'llm:generate' }]
  },
  predict_judicial_disposition: {
    id: 'predict_judicial_disposition',
    family: 'LegalCase',
    description: 'Predict likely judicial disposition based on historical data of the assigned judge',
    tools: [{ name: 'search:sql' }, { name: 'llm:generate' }]
  },
  rebuttal_strategy_planner: {
    id: 'rebuttal_strategy_planner',
    family: 'LegalCase',
    description: 'Develop a strategy to rebut the most likely opposing arguments',
    tools: [{ name: 'llm:generate' }]
  }
};
