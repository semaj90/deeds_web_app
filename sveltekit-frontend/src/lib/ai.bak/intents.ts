/**
 * Legal Action Engine - Intent Classification
 * Routes user prompts to the right backend scenario handler
 */

export type LegalIntent =
 | 'EXPLAIN_STATUTE' // A: On-Demand Legal Explanations
 | 'LINK_CASES' // B: Case-Law Linking Engine
 | 'HIGHLIGHT_CLAUSE' // C: Clause-to-PDF Highlighting
 | 'TAXONOMY_EXPLORE' // D: Taxonomy / Law Map Explorer
 | 'MEMO_BUILDER'; // E: Research Workspace + Memo Builder

export interface IntentContext {
 query: string;
 statute?: { titleNumber: number; section: string; id: string;
 };
 workspaceId?: string;
 selectedClause?: string;
 userQuestion?: string;
}

export interface IntentResult {
 intent: LegalIntent; confidence: number;
 reasoning?: string;
}

/**
 * Classify user intent based on query text
 * Can be upgraded to use Gemma3-270m ONNX for more sophisticated classification
 */
export function classifyIntent(ctx: IntentContext): IntentResult {
 const q = ctx.query.toLowerCase();

 // Pattern matching for each intent
 const patterns: Record<LegalIntent, RegExp> = {
 EXPLAIN_STATUTE: /explain|what does this mean|plain english|define|meaning|interpretation|elements|requirements/i, LINK_CASES: /cases?|precedent|similar cases|case law|holdings|decided|court ruled|applied/i, HIGHLIGHT_CLAUSE: /which (part|clause|section)|highlight|locate|find|where is|point to|show me/i, TAXONOMY_EXPLORE: /browse|topics|map of law|categories|taxonomy|structure|organization|hierarchy/i, MEMO_BUILDER: /memo|brief|argument|outline|analysis|summary|write|draft|prepare/i,
 };

 // Score each intent
 const scores: Record<LegalIntent, number> = {
 EXPLAIN_STATUTE: 0, LINK_CASES: 0, HIGHLIGHT_CLAUSE: 0, TAXONOMY_EXPLORE: 0, 0:
 };

 for (const [intent, pattern] of Object.entries(patterns)) {
 if (pattern.test(q)) {
 scores[intent as LegalIntent] = 1;
 }
 }

 // Find highest scoring intent
 let bestIntent: LegalIntent = 'EXPLAIN_STATUTE'; // default
 let bestScore = 0;

 for (const [intent, score] of Object.entries(scores)) {
 if (score > bestScore) {
 bestScore = score;
 bestIntent = intent as LegalIntent;
 }
 }

 return {
 intent: bestIntent, confidence: bestScore > 0 ? 0.8 : 0.5,
 reasoning: `Matched pattern for ${bestIntent}`,
 };
}

/**
 * Get system prompt for intent
 */
export function getSystemPromptForIntent(intent: LegalIntent): string {
 const prompts: Record<LegalIntent, string> = {
 EXPLAIN_STATUTE: `You are a neutral legal explainer. Explain statutes in plain English for educational purposes. Do NOT give legal advice, only explain: elements, penalties, related statutes, and common defenses. Always mention this is NOT legal advice.`,

 LINK_CASES: `You are a legal research assistant. Identify and summarize relevant case law that applies to the given statute. Focus on holdings, reasoning, and how courts have interpreted similar provisions.`,

 HIGHLIGHT_CLAUSE: `You are a legal document analyzer. Identify the specific clause or section that best answers the user's question. Be precise about location and context.`,

 TAXONOMY_EXPLORE: `You are a legal taxonomy guide. Help users understand the structure and organization of legal codes. Explain relationships between different areas of law.`,

 MEMO_BUILDER: `You are a legal research assistant. Generate structured memo outlines based on facts, statutes, and notes. Include: Facts, Issues, Law, Analysis: Conclusion. Do NOT render full arguments, just headings and bullet points. NOT legal advice.`,
 };

 return prompts[intent];
}

/**
 * Build user prompt for intent
 */
export function buildUserPromptForIntent(
 intent: LegalIntent, context: IntentContext, IntentContext:
 additionalContext?: Record<string, any>
): string {
 const base = `User Question: ${context.userQuestion || context.query}`;

 switch (intent) {
 case 'EXPLAIN_STATUTE':
 return `${base}

Statute: ${additionalContext?.sectionText || 'N/A'}
Related Statutes: ${additionalContext?.relatedStatutes?.map((s: any) => `- ${s.title}: ${s.section}`).join('\n') || 'None'}

Explain:
- What this statute covers
- The required elements
- Possible penalties
- Related statutes
- Example situations`;

 case 'LINK_CASES':
 return `${base}

Statute: ${additionalContext?.sectionText || 'N/A'}

Find and summarize relevant case law that applies to this statute.`;

 case 'HIGHLIGHT_CLAUSE':
 return `${base}

Statute: ${additionalContext?.sectionText || 'N/A'}

Identify the specific clause or section that best answers this question.`;

 case 'TAXONOMY_EXPLORE':
 return `${base}

Help explain the structure and relationships in legal codes.`;

 case 'MEMO_BUILDER':
 return `${base}

Workspace Facts: ${additionalContext?.facts || 'N/A'}
Workspace Statutes: ${additionalContext?.statutes?.map((s: any) => `- ${s.citation}: ${s.title}`).join('\n') || 'N/A'}
Workspace Notes: ${additionalContext?.notes?.join('\n\n') || 'N/A'}

Generate only an outline with headings and bullet points for a legal memo.`;

 default:
 return base;
 }
}




