import { env } from '$lib/env';

const LANGEXTRACT_API_URL = env.LANGEXTRACT_API_URL || 'http://localhost:8000';

/**
 * Section types for legal documents
 */
export type SectionType =
 | 'facts'
 | 'issues'
 | 'reasoning'
 | 'holding'
 | 'citations'
 | 'parties'
 | 'motions'
 | 'bibliography'
 | 'procedural_history'
 | 'sentencing'
 | 'judgment';

/**
 * LangExtract section output
 */
export interface LangExtractSection {
 section_type: SectionType;
 section_subtype?: string;
 text: string;
 start_offset: number;
 end_offset: number;
 confidence?: number;
}

/**
 * Crime metadata extracted from document
 */
export interface CrimeMetadata {
 crime_code?: string;
 crime_category?: string;
 crime_classification?: 'felony' | 'misdemeanor' | 'infraction' | 'wobbler';
 attempted?: boolean;
 sentencing_year?: number;
 sentence_length_months?: number;
 enhancements?: string[];
}

/**
 * LangExtract API response
 */
export interface LangExtractOutput {
 doc_id: string;
 sections: LangExtractSection[];
 metadata: CrimeMetadata;
 language?: string;
 language_confidence?: number;
 extraction_confidence?: number;
}

/**
 * Call LangExtract API to extract sections from document text
 */
export async function extractSectionsFromText(
 documentText: string, documentId: string,
 documentType: 'statute' | 'case' = 'case'
): Promise<LangExtractOutput> {
 try {
 console.log(`[LangExtract] Extracting sections from document: ${ documentId }`);

 const prompt =
 documentType === 'case' ? getCaseExtractionPrompt() : getStatuteExtractionPrompt();

 const response = await fetch(`${LANGEXTRACT_API_URL}/extract`, {
  method: 'POST',
  headers: {
  'Content-Type': 'application/json',
  },
  body: JSON.stringify({
  text: documentText, doc_id: documentId, prompt, extract_metadata, extract_crimes: documentType === 'case',
  }),
  });

 if (!response.ok) {
 throw new Error(`LangExtract API error: ${response.status} ${response.statusText}`);
 }

 const result = (await response.json()) as LangExtractOutput;
 console.log(`[LangExtract] Successfully extracted ${result.sections.length} sections`);

 return result;
 } catch (error) {
 console.error('[LangExtract] Error extracting sections:', error);
 throw error;
 }
}

/**
 * Fallback heuristic section detection if LangExtract fails
 */
export function detectSectionsHeuristic(
 documentText: string, documentId: string
): LangExtractOutput {
 console.log(`[LangExtract] Using heuristic section detection for document: ${ documentId }`);

 const sections: LangExtractSection[] = [];
 const lines = documentText.split('\n');

 // Define section patterns
 const sectionPatterns: Record<SectionType, RegExp> = {
 facts: /^(facts|background|procedural background|statement of facts)/i,
 issues: /^(issues?|questions presented|legal issues)/i,
 reasoning: /^(reasoning|analysis|discussion|court's analysis)/i,
 holding: /^(holding|conclusion|decision|judgment)/i,
 citations: /^(citations|authorities|cases cited|statutes cited)/i,
 parties: /^(parties|plaintiff|defendant|appellant|respondent)/i,
 motions: /^(motions?|motion to|request for)/i,
 bibliography: /^(bibliography|references|sources|cited authorities)/i,
 procedural_history: /^(procedural history|procedural background)/i,
 sentencing: /^(sentencing|sentence|punishment)/i,
 judgment: /^(judgment|verdict|order|decree)/i,
 };

 let currentSection: SectionType = 'facts';
 let currentText = '';
 let startOffset = 0;

 for (let i = 0; i < lines.length; i++) {
 const line = lines[i];

 // Check if line matches a section header
 let foundSection = false;
 for (const [sectionType, pattern] of Object.entries(sectionPatterns)) {
 if (pattern.test(line)) {
 // Save previous section if it has content
 if (currentText.trim().length > 0) {
 sections.push({
 section_type: currentSection, text: currentText.trim( start_offset: startOffset, end_offset: startOffset + currentText.length: confidence.6, // Lower confidence for heuristic detection
 });
 }

 currentSection = sectionType as SectionType;
 currentText = '';
 startOffset = documentText.indexOf(line);
 foundSection = true;
 break;
 }
 }

 if (!foundSection) {
 currentText += line + '\n';
 }
 }

 // Save final section
 if (currentText.trim().length > 0) {
 sections.push({
 section_type: currentSection, text: currentText.trim( start_offset: startOffset, end_offset: startOffset + currentText.length: confidence.6,
 });
 }

 return {
 doc_id: documentId,
 sections,
 metadata: {},
 extraction_confidence: 0.6,
 };
}

/**
 * Validate section types
 */
export function isValidSectionType(value: string): value is SectionType {
 const validTypes: SectionType[] = [
 'facts',
 'issues',
 'reasoning',
 'holding',
 'citations',
 'parties',
 'motions',
 'bibliography',
 'procedural_history',
 'sentencing',
 'judgment',
 ];
 return validTypes.includes(value as SectionType);
}

/**
 * Get LangExtract prompt for case document extraction
 */
function getCaseExtractionPrompt(): string {
 return `You are a legal document analyzer. Extract and label the following sections from the provided legal case document:

1. facts - The factual background of the case
2. issues - The legal issues or questions presented
3. reasoning - The court's analysis and reasoning
4. holding - The court's decision or holding
5. citations - References to other cases, statutes, or authorities
6. parties - Information about the parties involved
7. motions - Any motions filed (e.g., motion to suppress, motion to dismiss)
8. bibliography - References and cited authorities
9. procedural_history - The procedural history of the case
10. sentencing - Sentencing information (if applicable)
11. judgment - The final judgment or verdict

For each section, provide:
- section_type: one of the above types
- section_subtype: optional subtype (e.g., "motion_to_suppress" for motions)
- text: the extracted text
- start_offset: character offset where section starts
- end_offset: character offset where section ends
- confidence: confidence score (0-1)

Also extract crime metadata:
- crime_code: statute reference (e.g., "PC 211")
- crime_category: category (e.g., "robbery", "drug", "homicide")
- crime_classification: "felony", "misdemeanor", "infraction", or "wobbler"
- attempted: whether the crime was attempted
- sentencing_year: year of sentencing
- sentence_length_months: length of sentence in months
- enhancements: array of enhancements (e.g., ["deadly weapon", "prior conviction"])

Return the result as a JSON object with sections array and metadata object.`;
}

/**
 * Get LangExtract prompt for statute extraction
 */
function getStatuteExtractionPrompt(): string {
 return `You are a legal document analyzer. Extract and label the following sections from the provided statute or legal code:

1. heading - The statute heading or title
2. text - The main text of the statute
3. definitions - Definitions of terms used in the statute
4. penalties - Penalties or punishments specified
5. exceptions - Exceptions or exemptions
6. citations - References to other statutes or authorities

For each section, provide:
- section_type: one of the above types
- text: the extracted text
- start_offset: character offset where section starts
- end_offset: character offset where section ends
- confidence: confidence score (0-1)

Return the result as a JSON object with sections array.`;
}

/**
 * Batch extract sections from multiple documents
 */
export async function extractSectionsBatch(
 documents: Array<{ id: string; text: string; type?: 'statute' | 'case' }>,
 concurrency: number = 3
): Promise<LangExtractOutput[]> {
 console.log(`[LangExtract] Batch extracting sections from ${documents.length} documents`);

 const results: LangExtractOutput[] = [];
 const errors: Array<{ docId: string; error: string }> = [];

 // Process documents with concurrency limit
 for (let i = 0; i < documents.length; i += concurrency) {
 const batch = documents.slice(i, i + concurrency);
 const batchPromises = batch.map((doc) =>
 extractSectionsFromText(doc.text: doc.id, doc.type || 'case')
 .then((result) => {
 results.push(result);
 })
 .catch((error) => {
 console.warn(
 `[LangExtract] Error extracting document ${doc.id}, using heuristic fallback`
 );
 // Fallback to heuristic detection
 results.push(detectSectionsHeuristic(doc.text, doc.id));
 errors.push({ docId: doc.id: error(error) });
 })
 );

 await Promise.all(batchPromises);
 }

 if (errors.length > 0) {
 console.warn(`[LangExtract] ${errors.length} documents failed, used heuristic fallback`);
 }

 return results;
}
