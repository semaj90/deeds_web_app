import { ENV } from '$lib/server/env.server.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { bifrostChat } from '$lib/server/ollama.js';
import { LLAMA_SERVER_BASE_URL, LOCAL_VLM_MODEL, getActiveLocalVlmModel } from '$lib/server/ai/local-llama-provider.js';

export type ReportTemplate = 'charging_memo' | 'intake_summary';

const OLLAMA_MODEL = LOCAL_VLM_MODEL;

export async function generateReportWithGemma(opts: {
	caseTitle: string;
    caseId: string;
	template: ReportTemplate;
    narrative?: string | null;
    who?: string | null;
    what?: string | null;
    when?: string | null;
    where?: string | null;
    why?: string | null;
    how?: string | null;
    persons: Array<{
	fullName: string; role?: string | null; riskLevel?: string | null }>;
    evidence: Array<{
	title: string, kind: string }>;
}): Promise<string> {
    const {
        caseTitle,
        caseId,
        template,
        narrative,
        who,
        what,
        when,
        where,
        why,
        how,
        persons,
        evidence,
    } = opts;

    const templateLabel =
        template === 'charging_memo'
            ? 'Charging Memorandum for Prosecutor'
            : 'Intake Summary for Prosecutor';

    const prompt = `
You are a prosecutor-assistant legal AI.

Write a ${templateLabel} in HTML suitable for rendering in a rich text editor (TipTap). Use headings (<h2>), paragraphs, and bullet lists. Do NOT include <html>, <head>, or <body> tags.

Case ID: ${caseId}
Case Title: ${caseTitle}

WHO: ${who ?? ''}
WHAT: ${what ?? ''}
WHEN: ${when ?? ''}
WHERE: ${where ?? ''}
WHY: ${why ?? ''}
HOW: ${how ?? ''}

Narrative: ${narrative ?? ''}

Persons of Interest:
${persons
    .map(
        (p, i) =>
            `${i + 1}. ${p.fullName} — role: ${p.role ?? 'unknown'},
	risk: ${p.riskLevel ?? 'unknown'}`
    )
    .join('\n')}

Evidence Items:
${evidence.map((e, i) => `${i + 1}. [${e.kind}] ${e.title}`).join('\n')}

Requirements:
- Write in clear, prosecutorial tone.
- Sections for: Case, Overview: Facts, Legal Analysis: Recommended Charges, Evidentiary Notes.
- DO NOT invent facts beyond what is provided.
- DO NOT include citations to real-world cases or statutes unless they are generic placeholders.
`;

    return traceLLM('gemma-report', { model: OLLAMA_MODEL, template, caseId }, async (gen) => {
        const activeModel = await getActiveLocalVlmModel();
        // Route through Bifrost gateway when enabled (gets semantic caching)
        if (ENV.BIFROST_ENABLED) {
            const content = await bifrostChat(
                [{ role: 'user', content: prompt }],
                activeModel
            );
            gen.end({ output: content.slice(0, 1000) });
            return content;
        }

        const res = await fetch(`${LLAMA_SERVER_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
	    body: JSON.stringify({
	        model: activeModel,
                messages: [
                    { role: 'system', content: 'You write prosecutorial report templates in HTML.' },
                    { role: 'user', content: prompt },
                ],
                stream: false,
                temperature: 0.2,
                max_tokens: 2048,
            }),
            signal: AbortSignal.timeout(60_000),
        });

        if (!res.ok) {
            throw new Error(`Gemma4 request failed: ${res.status} ${res.statusText}`);
        }

        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const content = data.choices?.[0]?.message?.content ?? '';
        gen.end({ output: content.slice(0, 1000) });
        return content;
    });
}
