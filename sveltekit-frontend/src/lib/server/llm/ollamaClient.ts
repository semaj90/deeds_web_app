/**
 * Chat client for AI operations.
 * The runtime model id is derived from ROTORQUANT_MODEL_PATH via LLM_MODEL_ID.
 */
import { bifrostChat } from '$lib/server/ollama.js';
import { LLM_MODEL_ID } from '$lib/server/llm/runtime-contract.js';

export interface OllamaChatOptions {
	model: string;
	system: string;
	prompt: string;
	temperature?: number;
}

/**
 * Send a chat request via llama-server (:8090) — never Ollama for chat/synthesis
 */
export async function ollamaChat({
	model,
	system,
	prompt,
	temperature = 0.7
}: OllamaChatOptions): Promise<string> {
	return bifrostChat(
		[
			{ role: 'system', content: system },
			{ role: 'user', content: prompt },
		],
		model,
		{ temperature, timeoutMs: 120_000 }
	);
}

/**
 * Generate a court-ready legal memo from case notes
 */
export async function generateLegalMemo(caseName: string, notesText: string): Promise<string> {
	const system = [
		'You are assisting a prosecutor.',
		'Write a court-ready memo from the notes provided.',
		'Do NOT invent facts. Do NOT speculate.',
		'Use neutral, professional tone. Keep it structured.',
		'If a claim is not in the notes, omit it.',
		'Format with clear headings and bullet points where appropriate.'
	].join(' ');

	const prompt = `CASE: ${caseName}

NOTES:
${notesText}

OUTPUT:
1) Case Posture
2) Key Facts (only from notes)
3) Legal Issues Flagged
4) Risks/Weaknesses
5) Recommended Next Actions`;

	return ollamaChat({
		model: LLM_MODEL_ID,
		system,
		prompt,
		temperature: 0.3 // Lower temperature for more factual output
	});
}

/**
 * Generate an executive summary for PDF export
 */
export async function generateCaseSummary(caseName: string, notesText: string): Promise<string> {
	const system = [
		'You are assisting a prosecutor.',
		'Summarize the case notes into a court-ready section.',
		'Do NOT invent facts. Do NOT speculate.',
		'Use headings and bullets for clarity.',
		'Be concise but comprehensive.'
	].join(' ');

	const prompt = `CASE: ${caseName}

NOTES:
${notesText}

Write:
- Executive Summary (2-3 paragraphs)
- Key Issues & Risks (bullet points)
- Recommended Next Actions (bullet points)`;

	return ollamaChat({
		model: LLM_MODEL_ID,
		system,
		prompt,
		temperature: 0.3
	});
}

/**
 * Generate a court-ready legal memo from structured case notes
 */
export async function generateLegalMemoFromNotes(
	caseNotes: Array<{ title?: string;
	content: string; isPinned?: boolean;
	createdAt: string }>
): Promise<string> {
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

	const system = `You are a legal AI assistant helping prosecutors prepare case documents.

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

	const prompt = `${notesText}

Focus on creating a prosecution-ready document that analyzes the evidence, legal issues, and provides strategic guidance for the case.`;

	return ollamaChat({
		model: LLM_MODEL_ID,
		system,
		prompt,
		temperature: 0.2
	});
}

/**
 * Generate a summary for PDF export from structured case notes
 */
export async function generatePDFSummaryFromNotes(
	caseNotes: Array<{ title?: string;
	content: string; isPinned?: boolean;
	createdAt: string }>
): Promise<string> {
	const sortedNotes = caseNotes.sort((a, b) => {
		if (a.isPinned && !b.isPinned) return -1;
		if (!a.isPinned && b.isPinned) return 1;
		return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
	});

	const notesText = sortedNotes
		.map((note) => {
			const title = note.title ? `**${note.title}**` : 'Untitled Note';
			return `${title}:\n${note.content}`;
		})
		.join('\n\n---\n\n');

	const system = `You are a legal AI assistant. Create a concise, professional summary of case notes suitable for PDF export.`;

	const prompt = `Summarize these case notes for a PDF export:

${notesText}

Format as:
- Executive Summary (1-2 paragraphs)
- Key Points (bullet list)
- Action Items (if any)`;

	return ollamaChat({
		model: LLM_MODEL_ID,
		system,
		prompt,
		temperature: 0.3
	});
}

