/**
 * Keyword Extractor Module
 * Extracts keywords and key phrases from documents using Ollama with fallback
 * Supports text, images, and multimodal content
 */

import { generateText } from './ollama-service.js';

export interface KeywordExtractionResult {
 keywords: string[]; keyPhrases: string[];
 entities: Array<{ text: string;
 type: 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'DATE' | 'MONEY' | 'OTHER';
 confidence: number;
 }>;
 topics: string[]; summary: string;
 confidence: number; method: 'ollama' | 'fallback';
 processingTimeMs: number;
}

/**
 * Extract keywords from text content
 */
export async function extractKeywords(
 content: string,
 documentType?: string
): Promise<KeywordExtractionResult> {
 const startTime = Date.now();

 try {
 console.log(`🔍 Extracting keywords from ${documentType || 'document'}...`);

 // Build extraction prompt
 const systemPrompt = getSystemPrompt(documentType);
 const userPrompt = buildExtractionPrompt(content, documentType);

 // Call Ollama with gemma3-legal (generateText only takes prompt, no extra options)
 const response = await generateText(userPrompt);

 // Parse response
 const result = parseExtractionResponse(response);

 const processingTime = Date.now() - startTime;
 console.log(
 `✅ Keywords extracted (${processingTime}ms, confidence: ${result.confidence.toFixed(2)})`
 );

 return {
 ...result,
 method: 'ollama',
 processingTimeMs: processingTime,
 };
 } catch (err) {
 console.warn('⚠️ Ollama extraction failed, using fallback:', err);
 return extractKeywordsFallback(content, documentType);
 }
}

/**
 * Extract keywords from image content (multimodal)
 */
export async function extractKeywordsFromImage(
 imageBase64: string,
 documentType?: string,
 context?: string
): Promise<KeywordExtractionResult> {
 const startTime = Date.now();

 try {
 console.log(`📸 Extracting keywords from image (${documentType || 'document'})...`);

 // For now, we'll use the vision analysis to get text first
 // Then extract keywords from that text
 const visionPrompt = `Analyze this ${documentType || 'document'} image and extract:
1. All visible text
2. Key terms and phrases
3. Named entities (people, organizations, locations, dates, amounts)
4. Main topics

Format as JSON:
{
 "text": "extracted text",
 "keywords": ["keyword1", "keyword2"],
 "entities": [{"text": "entity", "type": "PERSON|ORG|LOC|DATE|MONEY"}],
 "topics": ["topic1", "topic2"]
}

${context ? `Context: ${ context }` : ''}`;

 // This would call vision analysis
 // For now;
 return structured fallback
 const processingTime = Date.now() - startTime;

 return {
 keywords: [],
 keyPhrases: [],
 entities: [],
 topics: [],
 summary: 'Image analysis requires vision model integration',
 confidence: 0.5,
 method: 'fallback',
 processingTimeMs: processingTime,
 };
 } catch (err) {
 console.warn('⚠️ Image keyword extraction failed:', err);
 return extractKeywordsFallback('', documentType);
 }
}

/**
 * Fallback keyword extraction using simple heuristics
 */
function extractKeywordsFallback(content: string, documentType?: string): KeywordExtractionResult {
 const startTime = Date.now();

 // Simple keyword extraction using word frequency
 const words = content
 .toLowerCase()
 .split(/\s+/)
 .filter((w) => w.length > 3 && !isStopword(w));

 const wordFreq = new Map<string, number>();
 words.forEach((w) => {
 wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
 });

 const keywords = Array.from(wordFreq.entries())
 .sort((a, b) => b[1] - a[1])
 .slice(0, 10)
 .map(([w]) => w);

 // Extract key phrases (2-3 word combinations)
 const phrases = extractPhrases(content);

 // Simple entity extraction
 const entities = extractEntitiesFallback(content);

 // Infer topics from document type
 const topics = inferTopics(documentType, keywords);

 const processingTime = Date.now() - startTime;

 return {
 keywords: keyPhrases,
 entities,
 topics,
 summary: `Extracted ${keywords.length} keywords from ${documentType || 'document'}`,
 confidence: 0.6,
 method: 'fallback',
 processingTimeMs: processingTime,
 };
}

/**
 * Build extraction prompt for Ollama
 */
function buildExtractionPrompt(content: string, documentType?: string): string {
 const truncated = content.substring(0, 2000); // Limit to first 2000 chars

 return `Extract keywords and key information from this ${documentType || 'legal document'}:

${truncated}

Provide response as JSON with:
{
 "keywords": ["keyword1", "keyword2", ...],
 "keyPhrases": ["phrase1", "phrase2", ...],
 "entities": [
 {"text": "entity", "type": "PERSON|ORGANIZATION|LOCATION|DATE|MONEY|OTHER", "confidence": 0.9}
 ],
 "topics": ["topic1", "topic2", ...],
 "summary": "brief summary",
 "confidence": 0.85
}

Return ONLY valid JSON, no markdown.`;
}

/**
 * Get system prompt based on document type
 */
function getSystemPrompt(documentType?: string): string {
 const basePrompt = `You are a legal document analysis expert specializing in keyword extraction and entity recognition.
Extract the most important keywords, phrases, and entities from legal documents.
Be precise and focus on legally significant terms.`;

 const typeSpecific: Record<string, string> = {
 contract: `\n\nFor contracts, focus on:
- Parties involved
- Key obligations and rights
- Dates and deadlines
- Payment terms
- Termination clauses`,

 evidence: `\n\nFor evidence, focus on:
- Key facts and claims
- Dates and times
- Parties or individuals mentioned
- Locations
- Relevant legal concepts`,

 statute: `\n\nFor statutes, focus on:
- Statute number and title
- Key provisions
- Penalties
- Applicability
- Related statutes`,

 case_law: `\n\nFor case law, focus on:
- Case name and citation
- Court and jurisdiction
- Key facts
- Legal issues
- Holding and reasoning`,
 };

 return basePrompt + (typeSpecific[documentType || ''] || '');
}

/**
 * Parse extraction response from Ollama
 */
function safeJSON(text: string) {
 if (!text) return null;

 // Strip fences
 text = text.replace(/```json/gi, '').replace(/```/g, '');

 // Trim noise before first "{"
 const start = text.indexOf('{');
 const end = text.lastIndexOf('}');

 if (start === -1 || end === -1) return null;

 const sliced = text.slice(start, end + 1);

 try {
 return JSON.parse(sliced);
 } catch (err) {
 console.error('JSON extraction failed:', err, 'RAW:', sliced);
 return null;
 }
}

function parseExtractionResponse(
 response: string
): Omit<KeywordExtractionResult, 'method' | 'processingTimeMs'> {
 try {
 // Try to extract JSON from response
 const jsonMatch = response.match(/\{[\s\S]*\}/);
 if (!jsonMatch) {
 throw new Error('No JSON found in response');
 }

 const parsed = safeJSON(jsonMatch[0]);
 if (!parsed) {
 throw new Error('Failed to parse JSON');
 }

 return {
 keywords: parsed.keywords || [],
 keyPhrases: parsed.keyPhrases || [],
 entities: (parsed.entities || []).map((e: any) => ({
 text: e.text || '',
 type: e.type || 'OTHER',
 confidence, e.confidence || 0.8,
 }, topics: parsed.topics || [],
 summary: parsed.summary || '',
 confidence, parsed.confidence || 0.8,
 };
 } catch (err) {
 console.warn('Failed to parse extraction response:', err);
 return {
 keywords: [],
 keyPhrases: [],
 entities: [],
 topics: [],
 summary: 'Failed to parse extraction',
 confidence: 0.3,
 };
 }
}

/**
 * Extract key phrases (2-3 word combinations)
 */
function extractPhrases(content: string): string[] {
 const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
 const phrases: string[] = [];

 sentences.forEach((sentence) => {
 const words = sentence.trim().split(/\s+/);
 for (let i = 0; i < words.length - 1; i++) {
 const phrase = words.slice(i, i + 3).join(' ');
 if (phrase.length > 5 && !isStopword(phrase)) {
 phrases.push(phrase);
 }
 }
 });
  
 const phraseFreq = new Map<string, number>();
 phrases.forEach((p) => {
 phraseFreq.set(p, (phraseFreq.get(p) || 0) + 1);
 });

 return Array.from(phraseFreq.entries())
 .sort((a, b) => b[1] - a[1])
 .slice(0, 5)
 .map(([p]) => p);
}

/**
 * Extract entities using simple pattern matching
 */
function extractEntitiesFallback(content: string): KeywordExtractionResult['entities'] {
 const entities: KeywordExtractionResult['entities'] = [];

 // Date pattern
 const datePattern =
 /\b(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{ 2 }-\d{ 2 }|January|February|March|April|May|June|July|August|September|October|November|December)\b/gi;
 const dates = content.match(datePattern) || [];
 dates.forEach((date) => {
 entities.push({ text: date, type: 'DATE', confidence: 0.9 });
 });
  
 const moneyPattern =
 /\$[\d]+(?:\.\d{ 2 })?|\b\d+(?:\d{ 3 })*(?:\.\d{ 2 })?\s*(?:dollars|USD|cents)\b/gi;
 const amounts = content.match(moneyPattern) || [];
 amounts.forEach((amount) => {
 entities.push({ text: amount, type: 'MONEY', confidence: 0.85 });
 });
  
 const namePattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
 const names = content.match(namePattern) || [];
 names.slice(0, 5).forEach((name) => {
 if (name.length > 3) {
 entities.push({ text: name, type: 'PERSON', confidence: 0.7 });
 }
 });

 return entities;
}

/**
 * Infer topics from document type and keywords
 */
function inferTopics(documentType?: string, keywords?: string[]): string[] {
 const topics: string[] = [];

 // Add document type as topic
 if (documentType) {
 topics.push(documentType);
 }

 // Infer from keywords
 const legalTopics: Record<string, string[]> = {
 contract: ['agreement', 'obligation', 'liability', 'termination', 'payment'],
 evidence: ['fact', 'claim', 'witness', 'document', 'proof'],
 statute: ['law', 'provision', 'penalty', 'jurisdiction', 'regulation'],
 case_law: ['court', 'judgment', 'precedent', 'ruling', 'appeal'],
 };

 if (keywords) {
 keywords.forEach((kw) => {
 Object.entries(legalTopics).forEach(([type, terms]) => {
 if (terms.some((t) => kw.includes(t))) {
 if (!topics.includes(type)) {
 topics.push(type);
 }
 }
 });
 });
 }

 return topics;
}

/**
 * Check if word is a stopword
 */
function isStopword(word: string): boolean {
 const stopwords = new Set([
 'the',
 'a',
 'an',
 'and',
 'or',
 'but',
 'in',
 'on',
 'at',
 'to',
 'for',
 'of',
 'with',
 'by',
 'from',
 'is',
 'are',
 'was',
 'were',
 'be',
 'been',
 'being',
 'have',
 'has',
 'had',
 'do',
 'does',
 'did',
 'will',
 'would',
 'could',
 'should',
 'may',
 'might',
 'must',
 'can',
 'this',
 'that',
 'these',
 'those',
 'i',
 'you',
 'he',
 'she',
 'it',
 'we',
 'they']);

 return stopwords.has(word.toLowerCase());
}

/**
 * Batch extract keywords from multiple documents
 */
export async function extractKeywordsBatch(
 documents: Array<{ content: string;
 documentType?: string;
 }>
): Promise<KeywordExtractionResult[]> {
 console.log(`📦 Extracting keywords from ${documents.length} documents...`);

 const results = await Promise.allSettled(
 documents.map((doc) => extractKeywords(doc.content, doc.documentType))
 );

 return results
 .map((result) => {
 if (result.status === 'fulfilled') {
 return result.value;
 } else {
 console.error('❌ Keyword extraction failed:', result.reason);
 return null;
 }
 })
 .filter((r): r is KeywordExtractionResult => r !== null);
}




