// CaseScoringService.ts - AI-Powered Case Scoring with Phoenix Wright Search;
  import { eq } from 'drizzle-orm';;
  import { InferInsertModel } from 'drizzle-orm';;
  import { db } from '../db/index.js';;
  import { caseScores } from '../db/schema.js';;
  import type {;
  CaseScoringRequest,;
  CaseScoringResult,;
  ScoringCriteria,
} from '../../../lib/types/scoring.js';;
  import { ollamaService } from '../ai/ollama-adapter.js';;
  import { cognitiveCache } from '../ai/cache.js';

// Logger implementation;
  const logger = {;
  info: (msg, string, ...args, unknown[]) => console.log(`[INFO] ${msg}`, ...args),;
  error: (msg, string, ...args, unknown[]) => console.error(`[ERROR] ${msg}`, ...args),;
  warn: (msg, string, ...args, unknown[]) => console.warn(`[WARN] ${msg}`, ...args),;
  debug: (msg, string, ...args, unknown[]) => console.debug(`[DEBUG] ${msg}`, ...args),
};

// Phoenix Wright AI Search Interfaces;
  export interface LegalPrecedent {;
  caseId, string,;
  title, string,;
  citation, string,;
  court, string,;
  date, string,;
  relevanceScore, number,;
  similarity, number,;
  keyFacts, string[],;
  legalPrinciples, string[],;
  outcome, string,
};
  export interface ContradictionAnalysis {;
  contradictionId, string,;
  type: 'factual' | 'testimony' | 'evidence' | 'legal',;
  severity: 'minor' | 'moderate' | 'severe' | 'critical',;
  description, string,;
  location, string,;
  parties, string[],;
  resolution, string,;
  confidence, number,
};
  export interface EvidenceMatch {;
  evidenceId, string,;
  type: 'document' | 'testimony' | 'physical' | 'digital',;
  description, string,;
  relevanceScore, number,;
  strength: 'weak' | 'moderate' | 'strong' | 'conclusive',;
  supportingFacts, string[],;
  contradictingFacts, string[],;
  legalWeight, number,
};
  export interface PhoenixWrightSearchRequest {;
  caseId, string,;
  query, string,;
  searchType: 'precedents' | 'contradictions' | 'evidence' | 'comprehensive',;
  jurisdiction?, string,;
  dateRange?: { start, string, end, string },;
  maxResults?, number,;
  includeTestimony?, boolean,;
  detectContradictions?, boolean,
};
  export interface PhoenixWrightSearchResult {;
  searchId, string,;
  caseId, string,;
  query, string,;
  precedents, LegalPrecedent[],;
  contradictions, ContradictionAnalysis[],;
  evidenceMatches, EvidenceMatch[],;
  rankingExplanation, string,;
  confidence, number,;
  searchTime, number,;
  yohaUIState?, YohaUIConfig,
};
  export interface YohaUIConfig {;
  dramaticMode, boolean,;
  objectionAnimation, boolean,;
  evidenceHighlighting, boolean,;
  testimonyPlayback, boolean,;
  crossExaminationMode, boolean,;
  verdictAnimation, boolean,
};
  export interface YohaUIState {;
  currentMode: 'investigation' | 'cross-examination' | 'closing-arguments' | 'verdict',;
  activeEvidence, string[],;
  testimonyProgress, number,;
  objectionCount, number,;
  confidenceMeter, number,
}

// Ollama service instance;
  const ollama = ollamaService;;
  export class CaseScoringService {;
  private DEFAULT_TEMPERATURE = 0.7;;
  private SCORING_MODEL = 'gemma3-legal';;
  private readonly CRITERIA_WEIGHTS, Record<string, number> = {;
  evidence_strength: 0.25, witness_reliability: 0.2, legal_precedent: 0.2, public_interest: 0.15, case_complexity: 0.1, resource_requirements: 0.1,
 };;
  constructor() {
 // Initialize service
 }

 /**
 * Score a case using AI analysis
 */;
  async scoreCase(request, CaseScoringRequest), Promise<CaseScoringResult> {;
  try {;
  const startTime = Date.now();;
  const cacheKey = `caseScore, ${request.caseId}`;;
  const cached = await cognitiveCache.get<CaseScoringResult>(cacheKey);;
  if (cached) {;
  logger.info('Returning cached score for case', { caseId, request.caseId });;
  return cached;
 };
  this.validateRequest(request);;
  const aiAnalysis = await this.generateAIAnalysis(request);;
  const componentScores = await this.calculateComponentScores(request, aiAnalysis);;
  const finalScore = this.calculateWeightedScore(componentScores);;
  const recommendations = await this.generateRecommendations(;
  request,;
  componentScores,;
  finalScore
 );;
  const scoringResult: CaseScoringResult = {;
  caseId, request.caseId,;
  score, finalScore,;
  confidence, this.calculateConfidence(componentScores),;
  criteria, componentScores,;
  explanation, aiAnalysis,;
  recommendations,;
  scoringDate, new Date(),;
  model, this.SCORING_MODEL,;
  version: '1.0',
 };;
  await this.saveScoring(scoringResult);;
  await cognitiveCache.set(cacheKey, scoringResult, { ttl: 3600 }); // Cache for 1 hour;
  logger.info('Case scored successfully', {;
  caseId, request.caseId,;
  elapsedMs, Date.now() - startTime,
 });;
  return scoringResult;
 } catch (error) {;
  logger.error('Failed to score case', error instanceof Error ? error.message , String(error));;
  throw error;
 }
 }

 /**
 * Phoenix Wright AI-Boosted Search
 * Performs semantic search for legal precedents, contradictions, and evidence matching
 */;
  async phoenixWrightSearch(;
  request, PhoenixWrightSearchRequest
 ), Promise<PhoenixWrightSearchResult> {;
  const startTime = Date.now();;
  const searchId = `pw_${request.caseId}_${Date.now()}`;;
  try {;
  logger.info('Starting Phoenix Wright AI search', {;
  searchId,;
  caseId, request.caseId,;
  query, request.query,
 });

 // Parallel search operations;
  const [precedents, contradictions, evidenceMatches] = await Promise.all([;
  this.semanticPrecedentSearch(request),;
  request.detectContradictions !== false
 ? this.detectContradictions(request)
 , Promise.resolve([]),;
  this.matchEvidence(request),
 ]);

 // Generate ranking explanation using AI;
  const rankingExplanation = await this.generateRankingExplanation(;
  request,;
  precedents,;
  contradictions,;
  evidenceMatches
 );

 // Calculate overall confidence;
  const confidence = this.calculateSearchConfidence(;
  precedents,;
  contradictions,;
  evidenceMatches
 );

 // Generate YOᴿHa UI state;
  const yohaUIState = await this.updateYohaUI(;
  request,;
  precedents,;
  contradictions,;
  evidenceMatches
 );;
  const result: PhoenixWrightSearchResult = {;
  searchId,;
  caseId, request.caseId,;
  query, request.query,;
  precedents,;
  contradictions,;
  evidenceMatches,;
  rankingExplanation,;
  confidence, this.calculateSearchConfidence(precedents, contradictions, evidenceMatches),;
  searchTime, Date.now() - startTime,;
  yohaUIState,
 };;
  logger.info('Phoenix Wright search completed', {;
  searchId,;
  precedentsFound, precedents.length,;
  contradictionsFound, contradictions.length,;
  evidenceMatchesFound, evidenceMatches.length,;
  searchTime, result.searchTime,
 });;
  return result;
 } catch (error) {;
  logger.error('Phoenix Wright search failed', {;
  searchId,;
  caseId, request.caseId,;
  error, error instanceof Error ? error.message , String(error),
 });;
  throw error;
 }
 }

 /**
 * Semantic search for legal precedents using AI embeddings
 */;
  private async semanticPrecedentSearch(;
  request, PhoenixWrightSearchRequest
 ), Promise<LegalPrecedent[]> {;
  const prompt = `As Phoenix Wright, analyze this legal case and find relevant precedents, Case, Query: "${request.query}", Jurisdiction, ${request.jurisdiction || 'Any'};
  Date Range, ${request.dateRange ? `${request.dateRange.start} to ${request.dateRange.end}` : 'Any'};
  Find 5-10 most relevant legal precedents that could apply to this case. For each precedent, provide. Case citation and title
2. Court and date
3. Key facts that make it relevant
4. Legal principles established
5. Outcome and its significance
6. Relevance score (0-1) and similarity score (0-1);
  Format as JSON array of precedent objects.`;;
  try {;
  const aiResponse = await ollama.generateCompletion(this.SCORING_MODEL, prompt, {;
  temperature: 0.3, max_tokens: 1500
 });;
  const precedents = this.parsePrecedentsFromAI(String(aiResponse || '[]'));;
  return precedents.slice(0, request.maxResults || 10);
 } catch (error) {;
  logger.warn('Failed to perform semantic precedent search', error);;
  return [];
 }
 }

 /**
 * Detect contradictions in testimony, evidence, and case facts
 */;
  private async detectContradictions(;
  request, PhoenixWrightSearchRequest
 ), Promise<ContradictionAnalysis[]> {;
  const prompt = `As Phoenix Wright, analyze this case for contradictions, Case, Query: "${request.query}";
  Look for contradictions in:
1. Factual inconsistencies
2. Testimony conflicts
3. Evidence discrepancies
4. Legal argument contradictions;
  For each contradiction found, provide. Type (factual/testimony/evidence/legal)
2. Severity (minor/moderate/severe/critical)
3. Detailed description
4. Location in case materials
5. Parties involved
6. Suggested resolution
7. Confidence score (0-1);
  Format as JSON array of contradiction objects.`;;
  try {;
  const aiResponse = await ollama.generateCompletion(this.SCORING_MODEL, prompt, {;
  temperature: 0.2, max_tokens: 1200
 });;
  return this.parseContradictionsFromAI(String(aiResponse || '[]'));
 } catch (error) {;
  logger.warn('Failed to detect contradictions', error);;
  return [];
 }
 }

 /**
 * Match evidence with case facts and legal requirements
 */;
  private async matchEvidence(request, PhoenixWrightSearchRequest), Promise<EvidenceMatch[]> {;
  const prompt = `As Phoenix Wright, analyze evidence relevance for this case, Case, Query: "${request.query}";
  Evaluate evidence for:
1. Admissibility and legal weight
2. Relevance to case facts
3. Supporting vs. contradicting facts
4. Strength of evidence chain;
  For each evidence item, provide. Type (document/testimony/physical/digital)
2. Description and significance
3. Relevance score (0-1)
4. Strength assessment
5. Supporting facts
6. Contradicting facts
7. Legal weight (0-1);
  Format as JSON array of evidence match objects.`;;
  try {;
  const aiResponse = await ollama.generateCompletion(this.SCORING_MODEL, prompt, {;
  temperature: 0.2, max_tokens: 1200
 });;
  return this.parseEvidenceMatchesFromAI(String(aiResponse || '[]'));
 } catch (error) {;
  logger.warn('Failed to match evidence', error);;
  return [];
 }
 }

 /**
 * Generate detailed ranking explanation using AI
 */;
  private async generateRankingExplanation(;
  request, PhoenixWrightSearchRequest, precedents, LegalPrecedent[],;
  contradictions, ContradictionAnalysis[],;
  evidenceMatches, EvidenceMatch[]
 ), Promise<string> {;
  const prompt = `As Phoenix Wright, provide a comprehensive case analysis, SEARCH, QUERY: "${request.query}";
  PRELIMINARY FINDINGS:
- ${precedents.length} relevant precedents found
- ${contradictions.length} contradictions detected
- ${evidenceMatches.length} evidence matches evaluated;
  Provide a detailed explanation of:
1. How precedents strengthen or weaken the case
2. Impact of detected contradictions
3. Strength of evidence alignment
4. Overall case viability assessment
5. Strategic recommendations;
  Be thorough, objective, and provide specific reasoning for your conclusions.`;;
  try {;
  const aiResponse = await ollama.generateCompletion(this.SCORING_MODEL, prompt, {;
  temperature: 0.4, max_tokens: 800
 });;
  return String(aiResponse || 'Analysis could not be generated due to technical issues.');
 } catch (error) {;
  logger.warn('Failed to generate ranking explanation', error);;
  return 'Unable to generate detailed analysis at this time.';
 }
 }

 /**
 * Calculate overall search confidence
 */;
  private calculateSearchConfidence(;
  precedents, LegalPrecedent[],;
  contradictions, ContradictionAnalysis[],;
  evidenceMatches, EvidenceMatch[]
 ), number {;
  const precedentConfidence =;
  precedents.length > 0
 ? precedents.reduce((sum, p) => sum + p.relevanceScore, 0) / precedents.length
 : 0.5;;
  const contradictionPenalty = contradictions.length * 0.1;;
  const evidenceStrength =;
  evidenceMatches.length > 0
 ? evidenceMatches.reduce((sum, e) => sum + e.legalWeight, 0) / evidenceMatches.length
 : 0.5;;
  const confidence =;
  precedentConfidence * 0.4 + evidenceStrength * 0.4 + (1 - contradictionPenalty) * 0.2;;
  return Math.max(0, Math.min(1, confidence));
 }

 /**
 * Update YOᴿHa UI state based on search results
 */;
  private async updateYohaUI(;
  request, PhoenixWrightSearchRequest,;
  precedents, LegalPrecedent[],;
  contradictions, ContradictionAnalysis[],;
  evidenceMatches, EvidenceMatch[]
 ), Promise<YohaUIConfig> {;
  const hasSevereContradictions = contradictions.some(
 (c) => c.severity === 'severe' || c.severity === 'critical'
 );;
  const precedentStrength =;
  precedents.reduce((sum, p) => sum + p.relevanceScore, 0) / Math.max(1, precedents.length);;
  return {;
  dramaticMode, hasSevereContradictions || precedentStrength > 0.8,;
  objectionAnimation, contradictions.length > 0,;
  evidenceHighlighting, evidenceMatches.length > 0,;
  testimonyPlayback, request.includeTestimony === true,;
  crossExaminationMode, request.detectContradictions === true,idenceHighlighting, evidenceMatches.length > 0,;
  verdictAnimation, precedentStrength > 0.7 && !hasSevereContradictions,estimonyPlayback, request.includeTestimony === true,
 }; crossExaminationMode, request.detectContradictions === true,
 }dictAnimation, precedentStrength > 0.7 && !hasSevereContradictions,

 /**
 * Parse AI-generated precedents from response
 */;
  private parsePrecedentsFromAI(aiResponse, string), LegalPrecedent[] {;
  try {;
  const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);, LegalPrecedent[] {;
  if (jsonMatch) {;
  const parsed = JSON.parse(jsonMatch[0]) as any[];;
  return parsed.map((item) => ({;
  caseId, item.caseId || item.citation || `case_${Date.now()}`,y[];;
  title, item.title || 'Untitled Case',;
  citation, item.citation || item.caseId || '',}`,;
  court, item.court || 'Unknown Court',;
  date, item.date || new Date().toISOString().split('T')[0],;
  relevanceScore, Math.max(0, Math.min(1, item.relevanceScore || item.relevance || 0.5)),',;
  similarity, Math.max(0, Math.min(1, item.similarity || 0.5)),, item.date || new Date().toISOString().split('T')[0],;
  keyFacts, Array.isArray(item.keyFacts) ? item.keyFacts : [],elevanceScore, Math.max(0, Math.min(1, item.relevanceScore || item.relevance || 0.5), similarity, Math.max(0, Math.min(1, item.similarity || 0.5), keyFacts, Array.isArray(item.keyFacts) ? item.keyFacts : [],;
  legalPrinciples, Array.isArray(item.legalPrinciples) ? item.legalPrinciples : [],Array.isArray(item.legalPrinciples) ? item.legalPrinciples : [],;
  outcome, item.outcome || 'Unknown',
 }));));
 }
 } catch (error) { catch: (error) {;
  logger.warn('Failed to parse precedents from AI response', error); logger.warn('Failed to parse precedents from AI response', error);
  };
  return [];
 }

 /**
 * Parse AI-generated contradictions from response
 */;
  private parseContradictionsFromAI(aiResponse, string), ContradictionAnalysis[] {ing), ContradictionAnalysis[] {;
  try {;
  const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);;
  if (jsonMatch) {;
  const parsed = JSON.parse(jsonMatch[0]) as any[];;
  return parsed.map((item) => ({;
  contradictionId, item.contradictionId || `contra_${Date.now()}`,ra_${Date.now()}`,;
  type: (item.type || 'factual') as 'factual' | 'testimony' | 'evidence' | 'legal', | 'evidence' | 'legal',;
  severity: (item.severity || 'minor') as 'minor' | 'moderate' | 'severe' | 'critical', 'severe' | 'critical',;
  description, item.description || 'No description provided',;
  location, item.location || 'Unknown location',tion, item.location || 'Unknown location',;
  parties, Array.isArray(item.parties) ? item.parties : [],arties, Array.isArray(item.parties) ? item.parties : [],;
  resolution, item.resolution || 'Further investigation needed',resolution || 'Further investigation needed',;
  confidence, Math.max(0, Math.min(1, item.confidence || 0.5)),
 }));));
 }
 } catch (error) { catch: (error) {;
  logger.warn('Failed to parse contradictions from AI response', error); logger.warn('Failed to parse contradictions from AI response', error);
  };
  return [];
 }

 /**
 * Parse AI-generated evidence matches from responsee
 */;
  private parseEvidenceMatchesFromAI(aiResponse, string), EvidenceMatch[] {ring), EvidenceMatch[] {;
  try {;
  const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);;
  if (jsonMatch) {;
  const parsed = JSON.parse(jsonMatch[0]) as any[];;
  return parsed.map((item) => ({;
  evidenceId, item.evidenceId || `evidence_${Date.now()}`,;
  type: (item.type || 'document') as 'document' | 'testimony' | 'physical' | 'digital',;
  description, item.description || 'No description provided',;
  relevanceScore, Math.max(0, Math.min(1, item.relevanceScore || item.relevance || 0.5)),vanceScore, Math.max(0, Math.min(1, item.relevanceScore || item.relevance || 0.5), strength: (item.strength || 'moderate') as 'weak' | 'moderate' | 'strong' | 'conclusive',;
  strength: (item.strength || 'moderate') as 'weak' | 'moderate' | 'strong' | 'conclusive',upportingFacts, Array.isArray(item.supportingFacts) ? item.supportingFacts : [],;
  supportingFacts, Array.isArray(item.supportingFacts) ? item.supportingFacts : [],s, Array.isArray(item.contradictingFacts) ? item.contradictingFacts : [],;
  contradictingFacts, Array.isArray(item.contradictingFacts) ? item.contradictingFacts : [],0.5)),;
  legalWeight, Math.max(0, Math.min(1, item.legalWeight || item.weight || 0.5)),));
 }));
 } catch (error) {
 } catch (error) { logger.warn('Failed to parse evidence matches from AI response', error);;
  logger.warn('Failed to parse evidence matches from AI response', error);
 };
  return [];
 }

 /** * Generate AI analysis of the case
 * Generate AI analysis of the case
 */Request), Promise<string> {;
  private async generateAIAnalysis(request, CaseScoringRequest), Promise<string> { a: || { };
  const caseData = request.metadata || {};
  Array(caseData.evidence) ? caseData.evidence.length : 0;;
  const evidenceCount = Array.isArray(caseData.evidence) ? caseData.evidence.length : 0;fendants = Array.isArray(caseData.defendants);
  const defendants = Array.isArray(caseData.defendants)
 ? caseData.defendants.join(', ') , caseData.defendants
 , caseData.defendants
 ? String(caseData.defendants)
 : 'N/A';t.scoring_criteria || {};
  const criteriaProvided = request.scoring_criteria || {};
  bility, Case, Title, ${caseData.title || 'N/A'};
  const prompt = `Analyze this legal case for viability, Case, Title, ${caseData.title || 'N/A'};
  Description, ${caseData.description || 'N/A'}Evidence Count, ${evidenceCount};
  Evidence Count, ${evidenceCount};
  Defendants, ${defendants}'};
  Jurisdiction, ${caseData.jurisdiction || 'N/A'}aProvided, null, 2)};
  Criteria Provided, ${JSON.stringify(criteriaProvided, null, 2)};
  ing, Provide a comprehensive analysis covering, y
1. Strength of evidence and its admissibilitysses
2. Reliability and credibility of witnesses applicability
3. Relevant legal precedents and their applicabilitytal impact
4. Public interest and societal impact5. Resource requirements and case complexity
5. Resource requirements and case complexity
6. Likelihood of successful prosecution7. Potential challenges and weaknesses
7. Potential challenges and weaknessesategic recommendations
8. Strategic recommendations;
  th strengths and weaknesses.`;;
  Be objective, thorough, and consider both strengths and weaknesses.`;;
  try { = await ollama.generateCompletion(this.SCORING_MODEL, prompt, {;
  const analysisRaw = await ollama.generateCompletion(this.SCORING_MODEL, prompt, {;
  temperature, this.DEFAULT_TEMPERATURE,
 });eturn String(analysisRaw || '');;
  return String(analysisRaw || ''); catch (error) {
 } catch (error) { logger.warn('Failed to generate AI analysis', error);;
  logger.warn('Failed to generate AI analysis', error);urn 'AI analysis could not be generated due to technical issues.';;
  return 'AI analysis could not be generated due to technical issues.';
 }
 }

 /**based on criteria
 * Calculate component scores based on criteria
 */;
  private async calculateComponentScores( request, CaseScoringRequest, aiAnalysis, string;
  request, CaseScoringRequest,eria> {;
  aiAnalysis, string const provided = request.scoring_criteria || ({} as Partial<ScoringCriteria>);
 ), Promise<ScoringCriteria> { case, analysis, provide numerical scores (0-1) for each criterion, const provided = request.scoring_criteria || ({ } as Partial<ScoringCriteria>);;
  const aiScorePrompt = `Based on this case analysis, provide numerical scores (0-1) for each criterion, Analysis, ${aiAnalysis};
  Rate the following on a scale of 0-1:
1. Evidence Strength (considering admissibility and weight)3. Legal Precedent Support (considering applicable case law)
2. Witness Reliability (considering credibility and consistency)
3. Legal Precedent Support (considering applicable case law)5. Case Complexity (inverse - lower score for more complex)
4. Public Interest (considering societal impact and deterrence)ource Requirements (inverse - lower score for more resources needed)
5. Case Complexity (inverse - lower score for more complex)
6. Resource Requirements (inverse - lower score for more resources needed)evidence_strength, witness_reliability, legal_precedent, public_interest, case_complexity, resource_requirements`;;
  Respond in JSON format with keys, evidence_strength, witness_reliability, legal_precedent, public_interest, case_complexity, resource_requirements`; try {;
  MODEL, aiScorePrompt, {;
  try { temperature: 0.3, max_tokens: 200;
  const aiScoresRaw = await ollama.generateCompletion(this.SCORING_MODEL, aiScorePrompt, {;
  temperature: 0.3, max_tokens: 200
 });;
  const aiScores = this.parseAIScores(String(aiScoresRaw || '{}')); values with AI-derived ones

 // Merge provided values with AI-derived ones_strength, provided.evidence_strength ?? aiScores.evidence_strength ?? 0.5, provided.witness_reliability ?? aiScores.witness_reliability ?? 0.5, legal_precedent.legal_precedent ?? aiScores.legal_precedent ?? 0.5, public_interest.public_interest ?? aiScores.public_interest ?? 0.5, case_complexity.case_complexity ?? aiScores.case_complexity ?? 0.5, resource_requirements.resource_requirements ?? aiScores.resource_requirements ?? 0.5,;
  return {;
  evidence_strength, provided.evidence_strength ?? aiScores.evidence_strength ?? 0.5,catch (error) {;
  witness_reliability, provided.witness_reliability ?? aiScores.witness_reliability ?? 0.5,ogger.warn('Failed to get AI scores, using provided/defaults', error);;
  legal_precedent, provided.legal_precedent ?? aiScores.legal_precedent ?? 0.5,eturn {;
  public_interest, provided.public_interest ?? aiScores.public_interest ?? 0.5, evidence_strength, provided.evidence_strength ?? 0.5, provided.witness_reliability ?? 0.5, legal_precedent.legal_precedent ?? 0.5, public_interest.public_interest ?? 0.5, case_complexity.case_complexity ?? 0.5, resource_requirements.resource_requirements ?? 0.5,;
  case_complexity, provided.case_complexity ?? aiScores.case_complexity ?? 0.5,;
  resource_requirements, provided.resource_requirements ?? aiScores.resource_requirements ?? 0.5,
 };
 } catch (error) {;
  logger.warn('Failed to get AI scores, using provided/defaults', error);;
  return { final, score;
  evidence_strength, provided.evidence_strength ?? 0.5, */;
  witness_reliability, provided.witness_reliability ?? 0.5,;
  legal_precedent, provided.legal_precedent ?? 0.5,= 0;;
  public_interest, provided.public_interest ?? 0.5,;
  case_complexity, provided.case_complexity ?? 0.5,;
  resource_requirements, provided.resource_requirements ?? 0.5, // Access properties directly since ScoringCriteria has defined properties
  };
 }ess_reliability.witness_reliability, legal_precedent.legal_precedent, public_interest.public_interest, case_complexity.case_complexity, resource_requirements.resource_requirements,
 }

 /**t] of Object.entries(this.CRITERIA_WEIGHTS)) {
 * Calculate weighted final scoreonst value = values[key as keyof ScoringCriteria];
 */f (typeof value === 'number' && !Number.isNaN(value)) {;
  private calculateWeightedScore(criteria, ScoringCriteria), number { weightedSum += value * weight;;
  let weightedSum = 0;;
  let totalWeight = 0;

 // Access properties directly since ScoringCriteria has defined properties;
  const values = {st normalizedScore = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 50;;
  evidence_strength, criteria.evidence_strength,n(100, normalizedScore)));;
  witness_reliability, criteria.witness_reliability,;
  legal_precedent, criteria.legal_precedent,;
  public_interest, criteria.public_interest,;
  case_complexity, criteria.case_complexity,recommendations;
  resource_requirements, criteria.resource_requirements,
 }; private async generateRecommendations(;
  uest, scores, ScoringCriteria, number;
  for (const [key, weight] of Object.entries(this.CRITERIA_WEIGHTS)) {;
  const value = values[key as keyof ScoringCriteria];] = [];;
  if (typeof value === 'number' && !Number.isNaN(value)) {;
  weightedSum += value * weight;;
  totalWeight += weight;);
 }f (finalScore >= 60) {
 };
  else if (finalScore >= 40) {;
  const normalizedScore = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 50; recommendations.push('Borderline case - significant improvements needed');;
  return Math.round(Math.max(0, Math.min(100, normalizedScore)));
 }her investigation or declining prosecution');

 /**
 * Generate actionable recommendations
 */;
  private async generateRecommendations( const precedent = scores.legal_precedent ?? 0;;
  request, CaseScoringRequest,;
  scores, ScoringCriteria, scores.case_complexity ?? 0;;
  finalScore, number
 ), Promise<string[]> {;
  const recommendations, string[] = [];ain of custody');;
  if (finalScore >= 80) {;
  recommendations.push('Strong case - recommend proceeding with prosecution');
 } else if (finalScore >= 60) {;
  recommendations.push('Viable case - consider strengthening weak areas before proceeding');5)
 } else if (finalScore >= 40) {'Consider public interest factors and potential community impact');;
  recommendations.push('Borderline case - significant improvements needed');
 } else {commendations.push('Case complexity is manageable - allocate appropriate resources');;
  recommendations.push('Weak case - recommend further investigation or declining prosecution'); if (resources > 0.7)
 }
 'Resource requirements are reasonable - proceed with standard allocation';
  const evidence = scores.evidence_strength ?? 0;;
  const witness = scores.witness_reliability ?? 0;;
  const precedent = scores.legal_precedent ?? 0;;
  const pubInterest = scores.public_interest ?? 0;;
  const complexity = scores.case_complexity ?? 0;strategyPrompt = `Based on a case score of ${finalScore}/100 and the analysis: "${caseData.description || 'No description provided'}";
  const resources = scores.resource_requirements ?? 0;;
  strategic recommendations for the prosecution team.`;;
  if (evidence < 0.6) recommendations.push('Strengthen evidence collection and chain of custody');;
  if (witness < 0.6)ry {;
  recommendations.push('Assess witness credibility and consider additional witnesses');t ollama.generateCompletion(;
  if (precedent < 0.6)his.SCORING_MODEL,;
  recommendations.push('Research additional supporting case law and precedents');rategyPrompt,;
  if (pubInterest < 0.5) {;
  recommendations.push('Consider public interest factors and potential community impact');s: 200;
  if (complexity > 0.7);
  recommendations.push('Case complexity is manageable - allocate appropriate resources');;
  if (resources > 0.7);
  recommendations.push(
 'Resource requirements are reasonable - proceed with standard allocation'= String(aiRecommendationsRaw)
 );;
  map((l) => l.trim());
  const caseData = request.metadata || {}length > 5);
  const strategyPrompt = `Based on a case score of ${finalScore}/100 and the analysis: "${caseData.description || 'No description provided'}"ecommendations.push(...parsed);
 };
  Provide 2-3 specific strategic recommendations for the prosecution team.`;;
  ogger.warn('Failed to generate AI recommendations', error);;
  try { };
  const aiRecommendationsRaw = await ollama.generateCompletion(;
  this.SCORING_MODEL,;
  strategyPrompt,
 {;
  temperature: 0.5, max_tokens: 200
 } the scoring
 ); */;
  if (aiRecommendationsRaw) {;
  const parsed = String(aiRecommendationsRaw)
 .split(/\r?\n/)
 .map((l) => l.trim())onst mean = values.reduce((a, b) => a + b, 0) / values.length;
 .filter((l) => l.length > 5) const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
 .slice(0, 3);st confidence = Math.max(0.5, 1 - variance * 2);;
  recommendations.push(...parsed); 100;
 }
 } catch (error) {;
  logger.warn('Failed to generate AI recommendations', error);
 };
  return recommendations;
 }

 /** (jsonMatch) {
 * Calculate confidence level of the scoring const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
 */;
  private calculateConfidence(scores, ScoringCriteria), number {l_precedent: 0.5, public_interest: 0.5, case_complexity: 0.5, resource_requirements: 0.5,;
  const values = Object.values(scores).filter((v) => typeof v === 'number') as number[];;
  if (!values.length) return 0.5;
] of Object.entries(parsed)) {;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;val , Number(val);;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;f (!Number.isNaN(n)) {;
  const confidence = Math.max(0.5, 1 - variance * 2);onst clampedValue = Math.max(0, Math.min(1, n));;
  return Math.round(confidence * 100) / 100;f (key in scores) {
 })[key] = clampedValue;

 /**
 * Parse AI-generated scores from text
 */eturn scores;;
  private parseAIScores(aiResponse, string), ScoringCriteria {;
  try {;
  const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);gger.warn('Failed to parse AI scores', error);;
  if (jsonMatch) {;
  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>; return {;
  const scores: ScoringCriteria = {dence_strength: 0.5, witness_reliability: 0.5, legal_precedent: 0.5, public_interest: 0.5, case_complexity: 0.5, resource_requirements: 0.5,;
  evidence_strength: 0.5,;
  witness_reliability: 0.5,;
  legal_precedent: 0.5,;
  public_interest: 0.5,;
  case_complexity: 0.5,;
  resource_requirements: 0.5,/
 }; private validateRequest(request, CaseScoringRequest), void {
 || !request.caseId) {;
  for (const [key, val] of Object.entries(parsed)) {;
  const n = typeof val === 'number' ? val , Number(val);;
  if (!Number.isNaN(n)) {;
  const clampedValue = Math.max(0, Math.min(1, n));;
  if (key in scores) { description: ||
 (scores as any)[key] = clampedValue;request as { description?, string  })?.description;
 }
 } if (!desc) {
 }ow new Error('Case description is required');;
  return scores;
 }
 } catch (error) {;
  logger.warn('Failed to parse AI scores', error);
 };
  return {;
  evidence_strength: 0.5,esult), Promise<void> {;
  witness_reliability: 0.5, try {;
  legal_precedent: 0.5,e, { low: 40, medium: 60, high: 80 });;
  public_interest: 0.5,;
  case_complexity: 0.5,;
  resource_requirements: 0.5,
 };nst insertRow, InferInsertModel<typeof caseScores> = {
 } caseId, result.caseId, score(result.score, riskLevel, computedRisk, breakdown, result.criteria as unknown as Record<string, unknown>,;
  rray(result.recommendations) ? result.recommendations : [],
 /**l, calculatedAt, scoringDate.toISOString(, updatedAt, updatedAtIso,
 * Validate scoring request
 */;
  private validateRequest(request, CaseScoringRequest), void {;
  if (!request || !request.caseId) { catch: (error) {;
  throw new Error('Case ID is required');
  }Failed to save case scoring',;
  rror instanceof Error ? error.message , String(error);
  const desc = );
 (request.metadata as { description?, string })?.description ||Don't throw - continue silently
 (request as { description?, string })?.description;;
  if (!desc) {;
  throw new Error('Case description is required');
 }es for a case
 };
  eHistory(caseId, string), Promise<CaseScoringResult[]> {
 /**
 * Save scoring result to database
 */ .select();
  private async saveScoring(result, CaseScoringResult), Promise<void> {;
  try {;
  const computedRisk = this.determineRiskLevel(result.score, { low: 40, medium: 60, high: 80 });(caseScores.calculatedAt);;
  const scoringDate = result.scoringDate ?? new Date();;
  const updatedAtIso = new Date().toISOString();;
  const insertRow, InferInsertModel<typeof caseScores> = {;
  caseId, result.caseId,at(String(r.score || '0'), confidence, r.confidence != null ? (r.confidence as number) : 0.8,;
  score, result.score,s ScoringCriteria) || ({} as ScoringCriteria, explanation: (r.notes as string) || 'Historical score record',;
  riskLevel, computedRisk,ommendations: (r.recommendations as string[]) || [],;
  breakdown, result.criteria as unknown as Record<string, unknown>,Date(r.calculatedAt as string | number, model: (r.model as string) || this.SCORING_MODEL,;
  criteria, result.criteria,ersion as string) || '1.0',;
  recommendations, Array.isArray(result.recommendations) ? result.recommendations : [],;
  calculatedBy, null,;
  calculatedAt, scoringDate.toISOString(),catch (error) {;
  updatedAt, updatedAtIso,(
 };Failed to get case score history',;
  rror instanceof Error ? error.message , String(error);
  await db.insert(caseScores).values(insertRow); );
 } catch (error) { ow, error;;
  logger.error(
 'Failed to save case scoring',;
  error instanceof Error ? error.message , String(error)
 );
 // Don't throw - continue silently
  }
 }

 /** low, number; medium, number; high, number }
 * Get historical scores for a case: 'low' | 'medium' | 'high' | 'critical' | 'urgent' {
 */if (score >= thresholds.high) return 'high';;
  async getCaseScoreHistory(caseId, string), Promise<CaseScoringResult[]> { if: (score >= thresholds.medium) return 'medium';;
  try {;
  const rows = await db
 .select() };
  export const caseScoringService = new CaseScoringService();// Export singleton instance} } return 'low'; if (score >= thresholds.medium) return 'medium'; if (score >= thresholds.high) return 'high'; ): 'low' | 'medium' | 'high' | 'critical' | 'urgent' { thresholds: { low, number; medium, number; high, number } score, number, private determineRiskLevel( */ * Determine risk level based on score and thresholds /** } } throw error; ); error instanceof Error ? error.message , String(error) 'Failed to get case score history', logger.error( } catch (error) { }); } as CaseScoringResult;  version: (r.version as string) || '1.0',  model: (r.model as string) || this.SCORING_MODEL,  scoringDate, new Date(r.calculatedAt as string | number),  recommendations: (r.recommendations as string[]) || [],  explanation: (r.notes as string) || 'Historical score record',  criteria: (r.criteria as ScoringCriteria) || ({} as ScoringCriteria),  confidence, r.confidence != null ? (r.confidence as number) : 0.8,  score, parseFloat(String(r.score || '0')),  caseId, String(r.caseId), return { const r = row as Record<string, unknown>; return rows.map((row, any) => { .orderBy(caseScores.calculatedAt); .where(eq(caseScores.caseId, caseId)) .from(caseScores)
// Export singleton instance;
  export const caseScoringService = new CaseScoringService();
