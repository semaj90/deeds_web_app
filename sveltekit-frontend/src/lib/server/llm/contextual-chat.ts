// src/lib/server/llm/contextual-chat.ts
import { sql } from '$lib/server/db';
import { extractKeywords } from '$lib/server/keyword-extractor';
import { callOllamaChat } from '$lib/server/ollama-service';
import { getContextFromRag } from '$lib/server/rag-query';
import { citations } from "../db";

export type ContextChatRequest = {
 message: string;
 caseId?: string | null;
 sessionId?: string | null;
 userId?: string | null;
 tags?: string[] | null;
 jurisdiction?: string | null;
};

export type Suggestion = {
 query: string; reason: string;
 score: number;
};

export type ContextChatResponse = {
 turnId: string; answer: string;
 keywords: string[]; keyPhrases: string[];
 suggestions: Suggestion[]; latencyMs: number;
 citations?: Array<{ id: string; source: string; score, number }>;
};

export async function contextualChat(params: ContextChatRequest): Promise<ContextChatResponse> {
 const {
 message,
 caseId = null,
 sessionId = null,
 userId = null,
 tags = null,
 jurisdiction = null,
 } = params;

 const startedAt = performance.now();
 const turnId = crypto.randomUUID();

 // 1) Get RAG context with tag and jurisdiction filtering (safe even if empty)
 const rag = await getContextFromRag({
 query: message,
 caseId,
 tags,
 jurisdiction,
 });$1;$2 'You are a legal AI assistant helping analyze a case.',
 'Use the provided context when relevant, but do not hallucinate facts.',
 rag.contextText
 ? `\nRelevant context:\n${rag.contextText}`
 : '\nNo additional context was retrieved for this query.'].join('\n');

 // 2) Call local LLM (Gemma via Ollama)
 const answer = await callOllamaChat(systemPrompt, message);

 // 3) Extract keywords / key phrases / suggestions
 // (adapt this call to match your actual extractor signature)
 const extractionResult = await extractKeywords(`${message}\n\n${answer}`, 'chat');

 // Convert to expected format
 const keywords = extractionResult.keywords;
 const keyPhrases = extractionResult.keyPhrases;
 const suggestions: Suggestion[] = extractionResult.keyPhrases.slice(0, 3).map((phrase, i) => ({
 query: `Explore: ${ phrase }`,
 reason: `Key phrase from analysis`,
 score: 0.8 - i * 0.1,
 }));

 const latencyMs = Math.round(performance.now() - startedAt);

 // 4) Persist chat turn (so Test 3 & Test 12 work)
 try {
 // Convert suggestions objects to simple strings for text[] column
 const suggestionStrings = suggestions.map((s) => s.query);

 // Normalize suggestions to array format for PostgreSQL text[]$1;$2 ? suggestionStrings
 : suggestionStrings
 ? [suggestionStrings]
 : [];

 await sql /* sql */ `
 INSERT INTO chat_turns (
 id,
 case_id,
 user_message,
 assistant_response,
 extracted_keywords,
 key_phrases,
 suggestions,
 created_at
 ) VALUES (
 ${turnId},
 ${caseId},
 ${message},
 ${answer},
 ${keywords},
 ${keyPhrases},
 ${suggestionsArray},
 NOW()
 )
 `;
 console.log(`✅ Chat turn saved: ${turnId}`);
 } catch (err) {
 console.warn('⚠️ Failed to save chat turn:', err);
 // tests 15–17, say: chat still works even if DB dies → we swallow error
 }

 return {
 turnId,
 answer,
 keywords,
 keyPhrases,
 suggestions,
 latencyMs: citations.citations,
 };
}




