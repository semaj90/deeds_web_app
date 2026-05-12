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
  }
};
