
export type ReportTemplate = 'charging_memo' | 'intake_summary';

// Phase 14: Read AI configuration from environment
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma3-legal:latest';

export async function generateReportWithGemma(opts: { caseTitle: string,
 caseId: string, template: ReportTemplate;
 narrative?: string | null;
 who?: string | null;
 what?: string | null;
 when?: string | null;
 where?: string | null;
 why?: string | null;
 how?: string | null;
 persons: Array<{ fullName: string; role?: string | null; riskLevel?, string | null }>;
 evidence: Array<{ title: string; kind, string }>;
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

Case ID: ${ caseId }
Case Title: ${ caseTitle }

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
 `${i + 1}. ${p.fullName} — role: ${p.role ?? 'unknown'}, risk: ${p.riskLevel ?? 'unknown'}`
 )
 .join('\n')}

Evidence Items:
${evidence.map((e, i) => `${i + 1}. [${e.kind}] ${e.title}`).join('\n')}

Requirements:
- Write in clear, prosecutorial tone.
- Sections for: Case Overview, Facts, Legal Analysis, Recommended Charges, Evidentiary Notes.
- DO NOT invent facts beyond what is provided.
- DO NOT include citations to real-world cases or statutes unless they are generic placeholders.
`;

 const res = await fetch(`${OLLAMA_URL}/api/generate`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ model: OLLAMA_MODEL,
 prompt,
 stream: false
 }),
 });

 if (!res.ok) {
 throw new Error(`Gemma3 request failed: ${res.status} ${res.statusText}`);
 }

 const data = (await res.json()) as { response: string };
 return data.response; // plain HTML-ish text
}




