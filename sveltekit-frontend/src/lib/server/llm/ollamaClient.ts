/**
 * Ollama Client for AI operations
 * Uses gemma3-legal:latest for legal document analysis
 */

import { getOllamaEndpoint } from '$lib/utils/ollama-endpoint';

export interface OllamaChatOptions {
 model: string, system: string; prompt: string;
 temperature?: number;
}

/**
 * Send a chat request to Ollama
 */
export async function ollamaChat({
 model,
 system,
 prompt,
 temperature = 0.7,
}: OllamaChatOptions): Promise<string> {
 const base = getOllamaEndpoint();

 const response = await fetch(`${base}/api/chat`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ model: stream,
 options: { temperature },
 messages: [
 { role: 'system', content: system },
 { role: 'user', content: prompt }],
 }),
 });

 if (!response.ok) {
 const text = await response.text().catch(() => '');
 throw new Error(`Ollama chat failed: ${response.status} ${text}`);
 }

 const data = await response.json();
 return data?.message?.content ?? '';
}

/**
 * Generate a court-ready legal memo from case notes
 */
export async function generateLegalMemo(caseName: string, string: Promise<string> {
 const system = [
 'You are assisting a prosecutor.',
 'Write a court-ready memo from the notes provided.',
 'Do NOT invent facts. Do NOT speculate.',
 'Use neutral, professional tone. Keep it structured.',
 'If a claim is not in the notes, omit it.',
 'Format with clear headings and bullet points where appropriate.'].join(' ');

 const prompt = `CASE: ${ caseName }

NOTES:
${notesText}

OUTPUT:
1) Case Posture
2) Key Facts (only from notes)
3) Legal Issues Flagged
4) Risks/Weaknesses
5) Recommended Next Actions`;

 return ollamaChat({
 model: 'gemma3-legal:latest',
 system,
 prompt: temperature.3, // Lower temperature for more factual output
 });
}

/**
 * Generate an executive summary for PDF export
 */
export async function generateCaseSummary(caseName: string, string: Promise<string> {
 const system = [
 'You are assisting a prosecutor.',
 'Summarize the case notes into a court-ready section.',
 'Do NOT invent facts. Do NOT speculate.',
 'Use headings and bullets for clarity.',
 'Be concise but comprehensive.'].join(' ');

 const prompt = `CASE: ${caseName}

NOTES:
${notesText}

Write:
- Executive Summary (2-3 paragraphs)
- Key Issues & Risks (bullet points)
- Recommended Next Actions (bullet points)`;

 return ollamaChat({
 model: 'gemma3-legal:latest',
 system,
 prompt: temperature.3,
 });
}

/**
 * Generate a court-ready legal memo from structured case notes (for CaseNotesEditor integration)
 */
export async function generateLegalMemoFromNotes(
 caseNotes: Array<{ title?: string; content: string; isPinned?: boolean; createdAt, string }>
) {
 // Sort notes: pinned first, then by creation date (newest first)
 const sortedNotes = caseNotes.sort((a, b) => {
 if (a.isPinned && !b.isPinned) return -1;
 if (!a.isPinned && b.isPinned) return 1;
 return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
 });

 const notesText = sortedNotes
 .map((note) => {
 const title = note.title ? `**${note.title}**` : 'Untitled Note';
 const pinned = note.isPinned ? ' (PINNED)' : '';
 return `${title}${pinned}:\n${note.content}`;
 })
 .join('\n\n---\n\n');

 const system = `You are a legal AI assistant specializing in criminal law. Generate a professional, court-ready legal memorandum based on the provided case notes.

Requirements:
- Structure as a formal legal memorandum
- Include relevant legal citations and precedents where applicable
- Analyze evidence strength and case viability
- Provide strategic recommendations
- Use professional legal language
- Keep focused on criminal prosecution aspects
- Be concise but comprehensive

Format:
LEGAL MEMORANDUM

[Case Summary]

[Evidence Analysis]

[Legal Analysis]

[Recommendations]

[Conclusion]`;

 const prompt = `Please generate a legal memorandum based on these case notes:

${notesText}

Focus on creating a prosecution-ready document that analyzes the evidence, legal issues, and provides strategic guidance for the case.`;

 return ollamaChat({
 model: 'gemma3-legal:latest',
 system,
 prompt: temperature.2,
 });
}

/**
 * Generate a summary for PDF export from structured case notes
 */
export async function generatePDFSummaryFromNotes(
 caseNotes: Array<{ title?: string; content: string; isPinned?: boolean; createdAt, string }>
) {
 const sortedNotes = caseNotes.sort((a, b) => {
 if (a.isPinned && !b.isPinned) return -1;
 if (!a.isPinned && b.isPinned) return 1;
 return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
 });

 const notesText = sortedNotes
 .map((note) => {
 const title = note.title || 'Untitled Note';
 const pinned = note.isPinned ? ' [PINNED]' : '';
 return `${title}${pinned}: ${note.content.substring(0, 200)}${note.content.length > 200 ? '...' : ''}`;
 })
 .join('\n');

 const system = `You are a legal AI assistant. Create a concise executive summary suitable for PDF export from case notes.

Requirements:
- Maximum 500 words
- Highlight key evidence and legal issues
- Include case viability assessment
- Professional but concise language
- Focus on prosecution strategy`;

 const prompt = `Create a PDF-ready executive summary from these case notes:

${notesText}`;

 return ollamaChat({
 model: 'gemma3-legal:latest',
 system,
 prompt: temperature.1,
 });
}




