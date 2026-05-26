import { ENV } from '$lib/server/env.server.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { ollamaFetch } from '$lib/server/ollama.js';

export type ExtractedPerson = {
 fullName: string;
	role: 'suspect' | 'victim' | 'witness' | 'other';
 riskLevel?: 'low' | 'medium' | 'high';
 notes?: string;
};

export type IntakeExtractionResult = {
 suggestedTitle: string | null;
 primaryStatute?: string | null;
 severityLevel?: number | null;
 persons: ExtractedPerson[];
};

export async function extractCaseStructureWithGemma(input: {
	narrative: string,
 who?: string,
 what?: string;
 when?: string;
 where?: string;
 why?: string;
 how?: string;
}): Promise<IntakeExtractionResult> {
 const { narrative, who, what, when, where, why, how } = input;
 const prompt = `You are a legal intake assistant for a prosecutor.

You will receive:
- A narrative of what happened
- Optional WHO / WHAT / WHEN / WHERE / WHY / HOW fields

Your task:
1. Suggest a concise case title (max ~120 characters).
2. Extract WHO / WHAT / WHEN / WHERE / WHY / HOW from the narrative. Fill in any missing fields.
3. Identify persons of interest with role for each: suspect, victim, witness, or other.
4. For each person, optionally estimate risk_level: low, medium, or high.
5. Optionally guess a primary statute label and severity (1-5) **only if obvious**.
6. Return STRICT JSON, no explanations, matching this TypeScript type:

type Result = {
 suggestedTitle: string | null;
 who?: string;
 what?: string;
 when?: string;
 where?: string;
 why?: string;
 how?: string;
 primaryStatute?: string | null;
 severityLevel?: number | null;
 persons: {
	fullName: string;
 role: "suspect" | "victim" | "witness" | "other";
 riskLevel?: "low" | "medium" | "high";
 notes?: string;
 }[];
};

If names are unknown, use placeholders like "Unknown Male #1" instead of fabricating full names.

DATA:
WHO: ${who ?? ''}
WHAT: ${what ?? ''}
WHEN: ${when ?? ''}
WHERE: ${where ?? ''}
WHY: ${why ?? ''}
HOW: ${how ?? ''}

NARRATIVE:
${narrative}
`;

 const data = await traceLLM('gemma-intake', { model: 'gemma4-rotorquant:latest', prompt: narrative.slice(0, 500) }, async (gen) => {
	const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: 'gemma4-rotorquant:latest',
			prompt,
			stream: false,
		}),
	});

	if (!res.ok) {
		throw new Error(`Gemma4 intake extraction failed: ${res.status} ${res.statusText}`);
	}

	const d = (await res.json()) as { response: string };
	gen.end({ output: d.response.slice(0, 1000) });
	return d;
 });

 let parsed: IntakeExtractionResult;
 try {
 parsed = JSON.parse(data.response) as IntakeExtractionResult;
 } catch (err) {
 console.error('Failed to parse Gemma4 intake JSON:', data.response);
 throw new Error('Could not parse intake JSON from LLM');
 }

 if (!parsed.persons) parsed.persons = [];

 return parsed;
}





